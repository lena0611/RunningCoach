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

enum LiveRunState: String {
    case idle
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

    // GPS 품질/fallback
    private var lastGoodFixAt: Date?
    private var distanceSource: LiveDistanceSource = .gps
    private var pedometerCumulativeAtSwitch: Double = 0  // pedometer fallback 진입 시점의 보행계 누적
    private var pedometerLatestCumulative: Double = 0
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
        manager.distanceFilter = 5
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
        // allowsBackgroundLocationUpdates=true 는 UIBackgroundModes에 "location"이 없으면 크래시.
        if backgroundLocationAllowed() {
            manager.allowsBackgroundLocationUpdates = true
        }
        manager.pausesLocationUpdatesAutomatically = false
        #endif
        manager.startUpdatingLocation()
        startPedometer()

        let now = Date()
        startDate = now
        lastGoodFixAt = now
        setState(.running)
        onPermission?(permissionStatus())
        speech.speak(text: "레이싱을 시작합니다.", priority: 0)
        persistSnapshot()
    }

    func pause() {
        guard state == .running else { return }
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
    }

    func stop() {
        guard state == .running || state == .paused else {
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
        engine = nil
    }

    private func setState(_ next: LiveRunState) {
        state = next
        onStateChange?(next)
    }

    private func startPedometer() {
        guard CMPedometer.isDistanceAvailable() else { return }
        pedometer.startUpdates(from: Date()) { [weak self] data, _ in
            guard let self, let data, let dist = data.distance else { return }
            DispatchQueue.main.async {
                self.pedometerLatestCumulative = dist.doubleValue
            }
        }
    }

    private func currentElapsed(at timestamp: Date) -> Double {
        guard let startDate else { return 0 }
        let raw = timestamp.timeIntervalSince(startDate) - pausedAccumulatedSec
        return max(0, raw)
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
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard state == .running else { return }
        let now = Date()

        for loc in locations {
            // 앱 시작 직후 CLLocationManager가 흔히 던지는 캐시된 오래된 fix는 무시한다
            // (거리 점프·잘못된 pedometer 전환의 원인).
            if abs(loc.timestamp.timeIntervalSinceNow) > 10 { continue }

            // 신호 상태
            let signal: LiveSignalState
            if loc.horizontalAccuracy < 0 {
                signal = .lost
            } else if loc.horizontalAccuracy <= 20 {
                signal = .ok
            } else {
                signal = .weak
            }

            var instantPaceSec: Double?

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
                    if d > 0 {
                        instantPaceSec = (dt / d) * 1000  // sec per km
                    }
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

            emitTick(signal: signal, instantPaceSec: instantPaceSec, at: loc.timestamp)
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
