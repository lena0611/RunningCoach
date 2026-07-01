//
//  LiveRunTracker.swift
//  RunningCoach
//
//  #229 가상레이싱 라이브 인-런 트래커(백그라운드 핵심 루프 소유자).
//  ⚠️ §9.1 경계: 시간 임계 루프(틱 → gap/역전 비교 → 음성 발화)는 네이티브가 직접 돈다.
//     WKWebView JS는 백그라운드에서 정지하므로 이 트래커가 GhostRaceEngine·SpeechManager를
//     직접 구동한다. 포그라운드에선 틱/gap을 웹으로 올려 화면을 갱신한다.
//
//  - 거리: CLLocationManager(속도 상한 필터) 우선, GPS 품질 저하 시 CMPedometer fallback.
//  - 좌표는 웹으로 올리지 않는다(틱 페이로드에 위경도 미포함).
//  - 영속화: 비정상 종료 후 requestRecoverable 조회용 스냅샷. 자동복원은 미구현(확정 결정).
//

import Foundation
import CoreLocation
import CoreMotion
import RaceCore

enum LiveRunState: String {
    case idle
    case ready    // GPS 확보 대기(측정 전). 신호만 흐름
    case running
    case paused
    case stopped
}

enum LivePermissionStatus: String {
    case notDetermined
    case whenInUse   // 백그라운드 불가 — 항상 허용 필요
    case always
    case denied
    case restricted
}

enum LiveSignalState: String {
    case ok
    case weak
    case lost
}

enum LiveDistanceSource: String {
    case gps
    case pedometer
}

/// 시작 파라미터(runContextLiveRun startLiveRun).
struct LiveRunStartParams {
    let sessionId: String
    let mode: String
    let curve: GhostCurve?
    let config: AnnounceConfig
    /// 목표 거리(m). 누적거리가 이를 넘으면 백그라운드에서 자동 완주. 0 이면 수동 종료.
    let targetDistanceM: Double
    let tickIntervalMs: Int
}

/// requestRecoverable 응답 스냅샷.
struct LiveRunSnapshot {
    let sessionId: String
    let elapsedSec: Double
    let cumulativeDistanceM: Double
    let seq: Int
    let state: LiveRunState
}

final class LiveRunTracker: NSObject {
    // 외부(WebView Coordinator) 콜백 — 메인 스레드에서 호출됨.
    var onTick: ((_ seq: Int, _ elapsedSec: Double, _ cumulativeDistanceM: Double, _ instantPaceSec: Double?, _ signal: LiveSignalState, _ source: LiveDistanceSource) -> Void)?
    var onGap: ((_ timeGapSec: Double, _ leadState: LeadState) -> Void)?
    var onStateChange: ((LiveRunState) -> Void)?
    var onPermission: ((LivePermissionStatus) -> Void)?
    var onError: ((_ code: String, _ message: String) -> Void)?
    /// 백그라운드 동작 진단(화면 표시용): 위치 백그라운드 모드/권한/bg업데이트 활성 여부.
    var onDiagnostic: ((_ text: String) -> Void)?
    /// #235: 라이브런 정상 종료(수동/자동완주) 시 최종 거리·시작/종료 시각·평균 케이던스를 알린다.
    /// Coordinator가 받아 HealthKit에 운동으로 저장한다(LiveRunTracker는 HealthKit 비의존).
    /// cadence(분당 걸음 spm)는 CMPedometer 누적 걸음÷경과분. 표본이 부족하면 nil.
    var onFinished: ((_ distanceM: Double, _ start: Date, _ end: Date, _ cadence: Double?) -> Void)?

    private let manager = CLLocationManager()
    private let pedometer = CMPedometer()
    private let speech = SpeechManager()

    private var engine: GhostRaceEngine?
    private(set) var state: LiveRunState = .idle

    // 누적/시점
    private var sessionId = ""
    private var startDate: Date?
    private var pausedAccumulatedSec: Double = 0
    private var pauseStartedAt: Date?
    private var cumulativeDistanceM: Double = 0
    private var elapsedSec: Double = 0
    private var seq = 0
    private var lastLocation: CLLocation?

    // 시계/발화 구동용. emitTick을 위치 콜백이 아니라 이 타이머가 벽시계 기준으로 돌린다
    // (정지/실내/백그라운드에서 위치 fix가 드물어도 시간·주기 발화가 끊기지 않게).
    private var clockTimer: Timer?
    private var lastSignal: LiveSignalState = .ok

    // 표시용 페이스 평활화. 연속 두 GPS fix의 거리÷시간은 GPS 노이즈(±5~10m)에 폭발하므로
    // 최근 윈도우 구간의 (거리Δ/시간Δ)로 롤링 평균을 낸다. 거리 변화가 작으면(정지/노이즈) 미표시.
    private var paceSamples: [(t: Double, d: Double)] = []
    /// 표시 페이스 롤링 윈도우(초). 길수록 매끄럽지만 반응이 느림. 10초 = 노이즈 억제와
    /// 실시간 반응의 절충(딜레이 약 5초). 더 길면 속도 변화가 늦게 반영된다.
    private let paceWindowSec: Double = 10
    private let paceMinDistanceM: Double = 8
    /// 정지 감지 단기 윈도우(초)와 최소 이동(m). 최근 paceStopWindowSec 동안 이동이
    /// paceStopMinDistanceM 미만이면 즉시 '—'(감속·정지 시 페이스가 확 치솟는 것 방지).
    private let paceStopWindowSec: Double = 4
    private let paceStopMinDistanceM: Double = 4

    // GPS 품질/fallback
    private var lastGoodFixAt: Date?
    private var distanceSource: LiveDistanceSource = .gps
    private var pedometerCumulativeAtSwitch: Double = 0  // pedometer fallback 진입 시점의 보행계 누적
    private var pedometerLatestCumulative: Double = 0

    // 케이던스(분당 걸음)용 누적 걸음수. pedometer는 start(from:) 이후 누적을 보고하므로,
    // 실제 측정 시작(begin, startDate)까지 쌓인 걸음을 baseline으로 빼고 종료 시 순 걸음을 얻는다.
    private var pedometerLatestSteps: Double = 0
    private var pedometerStepsAtBegin: Double?
    /// 케이던스 계산에 필요한 최소 경과(분). 너무 짧으면 분모가 작아 값이 튀므로 nil.
    private let cadenceMinElapsedMin: Double = 0.5
    /// GPS 무신호가 이 시간을 넘으면 pedometer fallback으로 전환(초).
    private let gpsStaleThresholdSec: Double = 15
    /// 속도 상한 필터(m/s). 약 43km/h 초과 점프 제거.
    private let maxSpeedMps: Double = 12

    /// 목표 거리(m). >0 이고 누적거리가 이를 넘으면 자동 완주. 0 = 수동 종료.
    private var targetDistanceM: Double = 0

    private let snapshotKey = "liveRun_snapshot_v1"

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.activityType = .fitness
        // 연속 업데이트(~1Hz). 느리거나 정지해도 틱이 흘러 시간/백그라운드 음성이 끊기지 않게.
        manager.distanceFilter = kCLDistanceFilterNone
        // 발화 시점 오디오 세션 상태를 화면 진단 줄로 중계(#229 백그라운드 무음 추적).
        speech.onSpeakReport = { [weak self] text in self?.onDiagnostic?(text) }
    }

    // ── 권한 ──────────────────────────────────────────────────────────────────

    private func permissionStatus() -> LivePermissionStatus {
        switch manager.authorizationStatus {
        case .authorizedAlways: return .always
        case .authorizedWhenInUse: return .whenInUse
        case .denied: return .denied
        case .restricted: return .restricted
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }

    private func backgroundLocationAllowed() -> Bool {
        let modes = (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String]) ?? []
        return modes.contains("location")
    }

    /// 백그라운드 위치 업데이트 활성화. 권한이 부여된 뒤(또는 이미 부여) 호출해야 iOS가 존중한다.
    /// (start()에서 권한 미결정 상태로 set하면 무시될 수 있어 didChangeAuthorization에서도 set.)
    private func enableBackgroundUpdatesIfPossible() {
        #if os(iOS)
        let st = manager.authorizationStatus
        guard st == .authorizedAlways || st == .authorizedWhenInUse, backgroundLocationAllowed() else { return }
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = false
        #endif
    }

    /// 백그라운드 진단(화면 표시): bg 모드/권한/bgUpd. bg=[]이면 stale plist, bgUpd=false면 권한 타이밍 문제.
    private func emitDiagnostic() {
        let modes = (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String]) ?? []
        var bgUpd = false
        #if os(iOS)
        bgUpd = manager.allowsBackgroundLocationUpdates
        #endif
        onDiagnostic?("bg=[\(modes.joined(separator: ","))] 권한=\(permissionStatus().rawValue) bgUpd=\(bgUpd)")
    }

    // ── 명령 ──────────────────────────────────────────────────────────────────

    func start(_ params: LiveRunStartParams) {
        reset()
        sessionId = params.sessionId
        targetDistanceM = params.targetDistanceM
        engine = GhostRaceEngine(curve: params.curve, config: params.config)

        speech.reset()
        speech.activateAudioSession()

        manager.requestAlwaysAuthorization()
        #if os(iOS)
        manager.pausesLocationUpdatesAutomatically = false
        #endif
        // 이미 권한이 있으면 지금 set, 아직 미결정이면 didChangeAuthorization에서 권한 부여 직후 set.
        enableBackgroundUpdatesIfPossible()
        manager.startUpdatingLocation()
        startPedometer()

        // 대기 상태: GPS만 켜고 신호 확보를 기다린다. 실제 측정/클럭은 begin()에서.
        setState(.ready)
        onPermission?(permissionStatus())
        emitDiagnostic()
        persistSnapshot()
    }

    /// GPS 확보 후 명시적 시작(카운트다운 종료 시). ready → running, 클럭·엔진·발화 시작.
    func begin() {
        guard state == .ready else { return }
        let now = Date()
        startDate = now
        lastGoodFixAt = now
        lastLocation = nil
        // 케이던스 baseline: 측정 시작 시점까지 쌓인 걸음(ready/카운트다운 구간)을 기준으로 잡아,
        // 종료 시 (누적 - baseline)이 순수 러닝 걸음이 되게 한다.
        pedometerStepsAtBegin = pedometerLatestSteps
        setState(.running)
        speech.speak(text: "레이싱 시작.", priority: 0)
        startClock()
        persistSnapshot()
    }

    /// 시계 타이머 시작. 위치 fix와 무관하게 1초마다 emitTick(시간·주기 발화)을 돌린다.
    /// .common 모드로 등록해 스크롤/백그라운드 RunLoop에서도 발화하게 한다.
    private func startClock() {
        clockTimer?.invalidate()
        let timer = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.onClockTick()
        }
        RunLoop.main.add(timer, forMode: .common)
        clockTimer = timer
    }

    private func onClockTick() {
        guard state == .running, startDate != nil else { return }
        // 거리는 위치 콜백이 누적해 둔 최신값을 쓰고, 시간은 벽시계 기준으로 emitTick이 계산한다.
        let now = Date()
        let elapsed = currentElapsed(at: now)
        emitTick(signal: lastSignal, instantPaceSec: rollingPaceSec(elapsed: elapsed), at: now)
    }

    /// 최근 paceWindowSec 구간의 (거리Δ/시간Δ)로 평활화한 페이스(sec/km). 매 클럭 틱마다 호출.
    /// 거리 변화가 paceMinDistanceM 미만(정지/노이즈)이면 nil → 화면은 '—'로 표시.
    private func rollingPaceSec(elapsed: Double) -> Double? {
        paceSamples.append((t: elapsed, d: cumulativeDistanceM))
        let cutoff = elapsed - paceWindowSec
        while let first = paceSamples.first, first.t < cutoff { paceSamples.removeFirst() }

        // 정지 감지: 최근 단기 윈도우 이동이 거의 없으면 즉시 '—'. 슬라이딩 윈도우는 감속 시
        // dDist는 멈추는데 dTime은 늘어 페이스가 치솟다 늦게 '—'로 떨어지므로, 그 폭증을 잘라낸다.
        let stopCutoff = elapsed - paceStopWindowSec
        if let recent = paceSamples.first(where: { $0.t >= stopCutoff }),
           cumulativeDistanceM - recent.d < paceStopMinDistanceM {
            return nil
        }

        guard let first = paceSamples.first, paceSamples.count >= 2 else { return nil }
        let dDist = cumulativeDistanceM - first.d
        let dTime = elapsed - first.t
        guard dDist >= paceMinDistanceM, dTime > 0 else { return nil }
        return dTime / dDist * 1000
    }

    func pause() {
        guard state == .running else { return }
        clockTimer?.invalidate()
        clockTimer = nil
        manager.stopUpdatingLocation()
        pauseStartedAt = Date()
        lastLocation = nil
        setState(.paused)
        speech.speak(text: "일시정지.", priority: 0)
        persistSnapshot()
    }

    func resume() {
        guard state == .paused else { return }
        if let pausedAt = pauseStartedAt {
            pausedAccumulatedSec += Date().timeIntervalSince(pausedAt)
        }
        pauseStartedAt = nil
        lastLocation = nil
        lastGoodFixAt = Date()
        manager.startUpdatingLocation()
        setState(.running)
        speech.speak(text: "다시 출발.", priority: 0)
        startClock()
    }

    func stop() {
        clockTimer?.invalidate()
        clockTimer = nil
        // 측정 시작 전(idle/ready/stopped)에서도 GPS/오디오 세션은 반드시 정리(대기 중 닫기 누수 방지).
        guard state == .running || state == .paused else {
            manager.stopUpdatingLocation()
            #if os(iOS)
            manager.allowsBackgroundLocationUpdates = false
            #endif
            pedometer.stopUpdates()
            speech.deactivateAudioSession()
            clearSnapshot()
            setState(.stopped)
            return
        }
        let tick = LiveTick(cumulativeDistanceM: cumulativeDistanceM, elapsedSec: elapsedSec)
        if let finish = engine?.finish(tick) {
            speech.speak(finish)
        } else {
            speech.speak(text: "레이싱을 종료합니다.", priority: 0)
        }
        manager.stopUpdatingLocation()
        #if os(iOS)
        manager.allowsBackgroundLocationUpdates = false
        #endif
        pedometer.stopUpdates()
        speech.deactivateAudioSession()
        clearSnapshot()           // 정상 종료 → 복원 후보 없음
        setState(.stopped)
        engine = nil

        // #235: 유효한 런이면 종료 데이터를 콜백으로 넘긴다(Coordinator가 HealthKit에 기록).
        // 거리·시간은 LiveRunTracker가 진실의 출처(§9.1). 레이싱은 사용자가 일부러 시작·종료한
        // 활동이라 짧아도 기록한다 — 가드는 '시작 즉시 종료'(거의 0m·수 초) 노이즈만 거른다(≥10m·≥5s).
        // end는 startDate+순수경과(일시정지 제외)로 둔다(일시정지 구간만큼 실제 시계보다 당겨짐).
        if let start = startDate, cumulativeDistanceM >= 10, elapsedSec >= 5 {
            onFinished?(cumulativeDistanceM, start, start.addingTimeInterval(elapsedSec), averageCadenceSpm())
        }
    }

    /// 비정상 종료 스냅샷 조회. 자동복원은 안 한다(확정 결정) — 정보 표시용.
    func loadRecoverable() -> LiveRunSnapshot? {
        guard let raw = UserDefaults.standard.dictionary(forKey: snapshotKey),
              let sid = raw["sessionId"] as? String,
              let stateRaw = raw["state"] as? String,
              let st = LiveRunState(rawValue: stateRaw),
              st == .running || st == .paused else {
            return nil
        }
        return LiveRunSnapshot(
            sessionId: sid,
            elapsedSec: (raw["elapsedSec"] as? NSNumber)?.doubleValue ?? 0,
            cumulativeDistanceM: (raw["cumulativeDistanceM"] as? NSNumber)?.doubleValue ?? 0,
            seq: (raw["seq"] as? NSNumber)?.intValue ?? 0,
            state: st
        )
    }

    func clearRecoverable() {
        clearSnapshot()
    }

    // ── 내부 ──────────────────────────────────────────────────────────────────

    private func reset() {
        clockTimer?.invalidate()
        clockTimer = nil
        paceSamples.removeAll()
        lastSignal = .ok
        manager.stopUpdatingLocation()
        pedometer.stopUpdates()
        targetDistanceM = 0
        startDate = nil
        pausedAccumulatedSec = 0
        pauseStartedAt = nil
        cumulativeDistanceM = 0
        elapsedSec = 0
        seq = 0
        lastLocation = nil
        lastGoodFixAt = nil
        distanceSource = .gps
        pedometerLatestCumulative = 0
        pedometerCumulativeAtSwitch = 0
        pedometerLatestSteps = 0
        pedometerStepsAtBegin = nil
        engine = nil
    }

    private func setState(_ next: LiveRunState) {
        state = next
        onStateChange?(next)
    }

    private func startPedometer() {
        // 거리(fallback) 또는 걸음(케이던스) 중 하나라도 가능하면 업데이트를 받는다.
        guard CMPedometer.isDistanceAvailable() || CMPedometer.isStepCountingAvailable() else { return }
        pedometer.startUpdates(from: Date()) { [weak self] data, _ in
            guard let self, let data else { return }
            DispatchQueue.main.async {
                if let dist = data.distance {
                    self.pedometerLatestCumulative = dist.doubleValue
                }
                // numberOfSteps는 start(from:) 이후 누적 걸음(비감소). begin baseline을 빼서 순 걸음을 얻는다.
                self.pedometerLatestSteps = data.numberOfSteps.doubleValue
            }
        }
    }

    private func currentElapsed(at timestamp: Date) -> Double {
        guard let startDate else { return 0 }
        let raw = timestamp.timeIntervalSince(startDate) - pausedAccumulatedSec
        return max(0, raw)
    }

    /// 평균 케이던스(분당 걸음, spm). 측정 시작(begin) 이후 순 걸음(누적 - baseline)을 경과 분으로 나눈다.
    /// pedometer 미가용·baseline 미설정·경과 부족(<cadenceMinElapsedMin)이면 nil.
    /// 주의: pedometer 걸음은 일시정지 중에도 누적되지만 elapsedSec는 일시정지를 제외한다
    /// (레이싱은 통상 일시정지 없이 진행되며, 있어도 평균 케이던스 근사에 큰 왜곡은 없다).
    private func averageCadenceSpm() -> Double? {
        guard CMPedometer.isStepCountingAvailable(), let baseline = pedometerStepsAtBegin else { return nil }
        let netSteps = pedometerLatestSteps - baseline
        let elapsedMin = elapsedSec / 60
        guard netSteps > 0, elapsedMin >= cadenceMinElapsedMin else { return nil }
        return (netSteps / elapsedMin * 100).rounded() / 100
    }

    /// GPS 무신호가 오래 지속되면 pedometer로 거리 진행을 이어받는다.
    private func maybeSwitchToPedometer(now: Date) {
        guard distanceSource == .gps else { return }
        guard let lastGood = lastGoodFixAt, now.timeIntervalSince(lastGood) > gpsStaleThresholdSec else { return }
        guard CMPedometer.isDistanceAvailable() else { return }
        distanceSource = .pedometer
        pedometerCumulativeAtSwitch = pedometerLatestCumulative
    }

    private func emitTick(signal: LiveSignalState, instantPaceSec: Double?, at timestamp: Date) {
        elapsedSec = currentElapsed(at: timestamp)
        seq += 1
        let tick = LiveTick(cumulativeDistanceM: cumulativeDistanceM, elapsedSec: elapsedSec)

        // 백그라운드 핵심: 엔진이 gap/역전/주기 발화를 판정하고 음성을 직접 재생.
        if let engine {
            let result = engine.process(tick)
            if let gap = result.gap {
                onGap?(gap.timeGapSec, gap.leadState)
            }
            for announcement in result.announcements {
                speech.speak(announcement)
            }
        }

        onTick?(seq, elapsedSec, cumulativeDistanceM, instantPaceSec, signal, distanceSource)
        persistSnapshot()

        // 목표 거리 도달 → 백그라운드 자동 완주(완주 멘트는 stop() 안 engine.finish가 처리).
        if targetDistanceM > 0, cumulativeDistanceM >= targetDistanceM, state == .running {
            stop()
        }
    }

    private func persistSnapshot() {
        UserDefaults.standard.set([
            "sessionId": sessionId,
            "elapsedSec": elapsedSec,
            "cumulativeDistanceM": cumulativeDistanceM,
            "seq": seq,
            "state": state.rawValue
        ], forKey: snapshotKey)
    }

    private func clearSnapshot() {
        UserDefaults.standard.removeObject(forKey: snapshotKey)
    }
}

// ── CLLocationManagerDelegate ─────────────────────────────────────────────────

extension LiveRunTracker: CLLocationManagerDelegate {
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        onPermission?(permissionStatus())
        // 권한 부여 직후 백그라운드 업데이트를 set(start()의 미결정 타이밍 set은 무시될 수 있음).
        enableBackgroundUpdatesIfPossible()
        if state == .running { emitDiagnostic() }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard state == .running || state == .ready else { return }
        let now = Date()

        for loc in locations {
            // 신호 상태
            let signal: LiveSignalState
            if loc.horizontalAccuracy < 0 {
                signal = .lost
            } else if loc.horizontalAccuracy <= 20 {
                signal = .ok
            } else {
                signal = .weak
            }

            // 대기(ready): GPS 확보 표시용 신호만 emit — 누적/엔진/완주 없음. 시작 버튼 활성 판단용.
            if state == .ready {
                if signal != .lost { lastLocation = loc }
                seq += 1
                onTick?(seq, 0, 0, nil, signal, distanceSource)
                continue
            }

            // (running) 출발 이전 캐시된 fix만 버린다. 인-런 fix는 백그라운드 batch로 약간 늦게
            // 와도 처리해야 틱이 끊기지 않는다(이전의 ">10초 무시"가 백그라운드 정지의 원인이었음).
            if let s = startDate, loc.timestamp < s.addingTimeInterval(-1) { continue }

            if signal != .lost, let prev = lastLocation {
                let d = loc.distance(from: prev)
                let dt = loc.timestamp.timeIntervalSince(prev.timestamp)
                // 속도 상한 + 저정확도 점프 제거
                if dt > 0, d / dt <= maxSpeedMps, loc.horizontalAccuracy <= 30 {
                    // GPS 회복 → GPS 소스로 복귀, pedometer 보정 재동기화
                    if distanceSource == .pedometer {
                        distanceSource = .gps
                    }
                    cumulativeDistanceM += d
                }
            }

            if signal != .lost {
                lastGoodFixAt = now   // 폴백 staleness는 벽시계 기준(캐시 timestamp 아님)
                lastLocation = loc
            }

            // GPS 무신호 지속 → pedometer fallback으로 거리 진행
            maybeSwitchToPedometer(now: now)
            if distanceSource == .pedometer {
                let delta = pedometerLatestCumulative - pedometerCumulativeAtSwitch
                if delta > 0 {
                    cumulativeDistanceM += delta
                    pedometerCumulativeAtSwitch = pedometerLatestCumulative
                }
            }

            // 위치 콜백은 거리 누적·신호 갱신만 한다. 시간 진행·표시 페이스(롤링 평균)·주기 발화는
            // clockTimer(onClockTick)가 벽시계 기준으로 돌린다(정지/백그라운드에서도 끊김 없게).
            lastSignal = signal
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // kCLErrorLocationUnknown(0)은 일시적(측위 시도 중, 실내 흔함) — 무시하고 계속 시도.
        let clError = error as? CLError
        if clError?.code == .locationUnknown { return }
        let code = clError.map { "\($0.code.rawValue)" } ?? "?"
        onError?("location(\(code))", error.localizedDescription)
    }
}
