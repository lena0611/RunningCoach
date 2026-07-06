//
//  WatchRaceController.swift
//  PaceLabWatch Watch App — #552 Phase 1~2
//
//  워치 레이스 세션 컨트롤러(아키텍처 레이어 ②).
//  HKWorkoutSession + HKLiveWorkoutBuilder로 라이브 지표(경과시간·거리·심박·칼로리·페이스)를
//  수집해 SwiftUI에 발행하고(Phase 1), 공유 엔진 RaceCore.GhostRaceEngine에 1Hz 틱을 먹여
//  고스트 격차·역전·주기 안내를 계산해 햅틱으로 전달한다(Phase 2). WCSession 왕복은 Phase 3.
//
//  ⚠️ HealthKit 사용설명(NSHealthShare/Update)이 빌드된 plist에 없으면 첫 API 접근에 하드 크래시한다.
//     → 워치 타겟 INFOPLIST_KEY_NSHealthShare/UpdateUsageDescription + healthkit entitlement 필수.
//
//  햅틱 매핑(#552 UX: 햅틱 우선, 음성 v1 제외):
//    추월 .directionUp / 추월당함 .directionDown / 구간(랩·주기) .click / 완주 .success
//    종류 판별은 RaceCore Announcement.dedupeKey 접두사(ghost.ts 미러 계약: "reversal:overtake:…",
//    "reversal:overtaken:…", "lap:…", "periodic:…", "finish", "progress:…")로 한다 —
//    ghost.ts Announcement에 kind 필드가 없어 미러를 벌리지 않기 위함.
//

import Foundation
import Combine
import CoreLocation
import HealthKit
import WatchKit
import RaceCore

@MainActor
final class WatchRaceController: NSObject, ObservableObject {

    /// 세션 라이프사이클. `.error`는 사용자에게 보여줄 한국어 사유를 싣는다.
    enum Phase: Equatable {
        case idle       // 시작 전
        case starting   // 권한 요청 + 세션 시작 중
        case running    // 측정 중
        case ended      // 종료(요약)
        case error(String)
    }

    @Published private(set) var phase: Phase = .idle

    // ── 라이브 지표 ─────────────────────────────────────────────────────────
    @Published private(set) var elapsedSec: Double = 0
    @Published private(set) var distanceM: Double = 0
    @Published private(set) var heartRateBpm: Double = 0
    @Published private(set) var activeKcal: Double = 0
    /// 평균 페이스(초/km). 0 = 아직 산출 전.
    @Published private(set) var paceSecPerKm: Double = 0
    /// 평균 케이던스(spm). 0 = 아직 산출 전. 폰 임포터와 동일하게 총 걸음/경과(분)로 구한다.
    @Published private(set) var cadenceSpm: Double = 0
    /// HK 누적 걸음수(케이던스 원천). didCollectDataOf 가 cumulativeSum 으로 채운다.
    private var totalSteps: Double = 0

    // ── 고스트 격차 (Phase 2) ───────────────────────────────────────────────
    /// 현재 격차. 고스트 없는 자유주행이면 nil → UI는 히어로를 숨긴다.
    @Published private(set) var gap: GapState?
    /// 최근 안내 문구(랩 통과·역전 등). 최신 것 하나만 유지한다(햅틱이 1차 채널, 문구는 보조).
    @Published private(set) var lastAnnouncementText: String?
    /// 완주 안내 문구. EndedView 요약에 쓴다.
    @Published private(set) var finishSummaryText: String?
    /// 완주 시점 최종 격차. 완주 문구와 '같은 스냅샷'이어야 요약의 색(승/패)이 문구와 안 어긋난다
    /// (마지막 1Hz 틱의 `gap`은 종료 버튼 사이 HK 거리 갱신을 놓칠 수 있음 — 접전에서 표시 모순).
    @Published private(set) var finalGap: GapState?

    // ── 레이스 설정 (Phase 3: 시작 화면이 카탈로그 선택으로 주입) ────────────
    /// 타겟 PB 식별 정보. 결과 상승 페이로드(웹 CompetitionTargetPb 미러)에 실린다.
    struct TargetPbInfo {
        let distanceM: Double
        let elapsedSec: Double
        let sourceRunId: String
    }

    /// 레이스 상대(고스트) 곡선. nil = 자유 측정(태깅만).
    private(set) var ghostCurve: GhostCurve?
    private(set) var targetPb: TargetPbInfo?
    private(set) var announceConfig: AnnounceConfig = .default

    /// 완주 결과 페이로드(웹 WatchRaceResultPayload 미러) 방출 — ContentView 가 WCSession 전송에 연결.
    var onRaceFinished: (([String: Any]) -> Void)?

    /// 시작 전 레이스 구성. 시작 화면이 카탈로그 선택을 굳혀 넣는다(레이스마다 호출).
    func configure(ghost: GhostCurve?, targetPb: TargetPbInfo?, config: AnnounceConfig) {
        guard phase == .idle || isErrorPhase else { return }
        ghostCurve = ghost
        self.targetPb = targetPb
        announceConfig = config
    }

    /// 라이브 틱을 먹여 gap·역전·주기 발화를 계산할 공유 엔진(RaceCore).
    /// 엔진은 레이스 1회분 상태(이전 gap·주기 step·완주)를 갖므로 시작할 때마다 재생성한다.
    private var engine: GhostRaceEngine

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    /// GPS 경로(지도) 기록. 위치 권한이 거부되면 조용히 경로 없는 레이스로 진행한다(best-effort).
    private let locationManager = CLLocationManager()
    private var routeBuilder: HKWorkoutRouteBuilder?
    /// 삽입된 위치 수. 0이면 finishRoute 대신 discard(빈 경로 finish는 에러).
    private var routeInsertCount = 0
    /// 음성 안내 — "발화는 시작한 기기에서" 합의: 워치 시작 레이스는 워치가 말한다(햅틱과 병행).
    private let speech = WatchSpeech()
    private var ticker: Timer?
    /// 벽시계 기준 시작 시각. 자동일시정지 끔이라 벽시계 경과 == 운동 경과.
    private var workoutStart: Date?
    /// 레이스 마감(완주 판정+결과 방출) 1회 보장. 종료 버튼 경로와 시스템 강제종료 폴백이
    /// 둘 다 finishRace 를 부르므로, 이 가드 없이는 이중 방출(다른 UUID → 웹 멱등 무력화)된다.
    private var raceFinalized = false

    override init() {
        engine = GhostRaceEngine(curve: nil, config: .default)
        super.init()
    }

    // MARK: - 권한 타입

    /// 저장(share): 완주 시 운동 기록 저장에 필요. 걸음수(케이던스 원천)·경로(지도)도 워크아웃에 싣는다.
    private var shareTypes: Set<HKSampleType> {
        [
            HKObjectType.workoutType(),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.heartRate),
            HKQuantityType(.stepCount),
            HKSeriesType.workoutRoute(),
        ]
    }

    /// 읽기(read): 라이브 지표 표시에 필요.
    private var readTypes: Set<HKObjectType> {
        [
            HKQuantityType(.heartRate),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.stepCount),
        ]
    }

    // MARK: - 세션 시작 / 종료 / 리셋

    /// 시작 버튼 진입점: 건강 권한 요청 → 성공 시 운동 세션 시작.
    func start() {
        guard phase == .idle || isErrorPhase else { return }
        guard HKHealthStore.isHealthDataAvailable() else {
            phase = .error("이 기기에서 건강 데이터를 쓸 수 없어요.")
            return
        }
        phase = .starting
        healthStore.requestAuthorization(toShare: shareTypes, read: readTypes) { [weak self] _, error in
            guard let self else { return }
            Task { @MainActor in
                if let error {
                    self.phase = .error("건강 권한 오류: \(error.localizedDescription)")
                    return
                }
                // read 거부는 Apple이 숨기므로 granted로 판별 불가 — 그대로 진행(지표만 안 뜸).
                self.beginWorkout()
            }
        }
    }

    private var isErrorPhase: Bool {
        if case .error = phase { return true }
        return false
    }

    private func beginWorkout() {
        let config = HKWorkoutConfiguration()
        config.activityType = .running
        config.locationType = .outdoor

        do {
            let session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            let builder = session.associatedWorkoutBuilder()
            let dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)
            // 걸음수는 러닝 기본 수집에 없어 명시 활성화 — 완주 저장 시 워크아웃에 연결돼
            // 폰 임포터(queryStepSamples, predicateForObjects)가 케이던스로 환산한다.
            dataSource.enableCollection(for: HKQuantityType(.stepCount), predicate: nil)
            builder.dataSource = dataSource
            session.delegate = self
            builder.delegate = self
            self.session = session
            self.builder = builder
            startRouteRecording()

            // #552 Phase 3: self-race 표식 메타데이터 — 폰 HealthKit 유입 시 '생성 시점부터' 태깅돼(§10)
            // 훈련 세션·의도를 오소비하지 않는다. 키는 폰 HealthKitRunImporter 와 미러(PaceLABCompetition).
            builder.addMetadata([
                HKMetadataKeyWasUserEntered: false,
                "PaceLABCompetition": "self-race"
            ]) { _, _ in
                // best-effort: 실패해도 레이스는 진행(태깅은 웹 linkPendingResults 가 늦게라도 복원).
            }

            let startDate = Date()
            workoutStart = startDate
            session.startActivity(with: startDate)
            builder.beginCollection(withStart: startDate) { [weak self] _, error in
                guard let self else { return }
                Task { @MainActor in
                    if let error {
                        self.phase = .error("측정 시작 실패: \(error.localizedDescription)")
                        return
                    }
                    self.beginRace()
                    self.startTicker()
                }
            }
        } catch {
            phase = .error("운동 세션 생성 실패: \(error.localizedDescription)")
        }
    }

    // MARK: - GPS 경로 (v2: 세션상세 지도)

    /// 위치 권한 요청 + 경로 빌더 준비 + 업데이트 시작. 권한 거부 시 콜백이 안 와서
    /// 경로만 비는 것으로 자연 강등된다(레이스 자체는 막지 않는다).
    private func startRouteRecording() {
        routeBuilder?.discard() // 시작 실패 후 재시도 경로의 잔여 빌더 정리
        routeBuilder = HKWorkoutRouteBuilder(healthStore: healthStore, device: nil)
        routeInsertCount = 0
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.activityType = .fitness
        locationManager.requestWhenInUseAuthorization()
        // WKBackgroundModes(location)와 짝 — 손목 내림(백그라운드)에서도 경로가 끊기지 않는다.
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.startUpdatingLocation()
    }

    /// 필터된 위치를 경로 빌더에 적재(메인). insertRouteData 는 내부 큐 처리라 완료를 기다리지 않는다.
    private func appendRoute(_ locations: [CLLocation]) {
        guard phase == .running || phase == .starting, let routeBuilder else { return }
        routeInsertCount += locations.count
        routeBuilder.insertRouteData(locations) { _, _ in }
    }

    /// 레이스 공통 시작 처리: 엔진 재생성(1회분 상태 초기화) + 시작 햅틱 + running 전환.
    private func beginRace() {
        engine = GhostRaceEngine(curve: ghostCurve, config: announceConfig)
        gap = nil
        lastAnnouncementText = nil
        finishSummaryText = nil
        finalGap = nil
        raceFinalized = false
        WKInterfaceDevice.current().play(.start)
        phase = .running
    }

    /// 종료 버튼: 완주 안내(최종 격차)를 굳힌 뒤 세션을 끝낸다 → didChangeTo(.ended) → 저장·정리.
    func end() {
        guard phase == .running else { return }
        stopTicker()
        finishRace()
        WKInterfaceDevice.current().play(.stop)
        if let session {
            session.end()
        } else {
            // HK 세션이 없는 실행(시뮬 리허설): 델리게이트 경유 없이 즉시 요약으로.
            stopSimDriver()
            phase = .ended
        }
    }

    /// 엔진 완주 판정 1회 호출(고스트 있으면 최종 격차 문구 + success 햅틱).
    /// 문구와 같은 틱으로 finalGap 도 굳혀 요약 색(승/패)이 문구와 항상 일치하게 하고,
    /// 같은 스냅샷으로 결과 페이로드를 방출한다(#552 Phase 3 — WCSession 상승은 ContentView 연결).
    /// 호출 경로 2곳(종료 버튼 / 시스템 강제종료 폴백) — raceFinalized 로 1회만 실행된다.
    private func finishRace() {
        guard !raceFinalized else { return }
        raceFinalized = true
        let tick = LiveTick(cumulativeDistanceM: distanceM, elapsedSec: elapsedSec)
        if let curve = ghostCurve {
            finalGap = GhostMath.computeGap(curve, tick)
        }
        if let fin = engine.finish(tick) {
            finishSummaryText = fin.text
            WKInterfaceDevice.current().play(.success)
            speech.speak(fin.text)
        }
        emitResult(tick: tick)
    }

    /// 완주 결과 페이로드(웹 WatchRaceResultPayload 미러). 0m 완주는 웹 isMeaningfulFinish 와 동일하게 버린다.
    /// plist 제약상 null 대신 키 생략 — 웹 normalize 가 결측을 null 로 읽는다.
    private func emitResult(tick: LiveTick) {
        guard tick.cumulativeDistanceM > 0 else { return }
        var payload: [String: Any] = [
            "type": "watchRaceResult",
            "id": UUID().uuidString,
            "racedAt": Self.isoFormatter.string(from: workoutStart ?? Date()),
            "racedDistanceM": tick.cumulativeDistanceM,
            "racedDurationSec": tick.elapsedSec
        ]
        if let targetPb {
            payload["targetPb"] = [
                "distanceM": targetPb.distanceM,
                "elapsedSec": targetPb.elapsedSec,
                "sourceRunId": targetPb.sourceRunId
            ]
        }
        if let finalGap {
            payload["finalGap"] = [
                "timeGapSec": finalGap.timeGapSec,
                "leadState": finalGap.leadState.rawValue
            ]
        }
        onRaceFinished?(payload)
    }

    private static let isoFormatter = ISO8601DateFormatter()

    /// 요약 화면에서 새 레이스 준비(지표 초기화 → idle).
    func reset() {
        guard phase == .ended || isErrorPhase else { return }
        speech.stop() // 직전 레이스의 남은 발화 정리
        elapsedSec = 0
        distanceM = 0
        heartRateBpm = 0
        activeKcal = 0
        paceSecPerKm = 0
        cadenceSpm = 0
        totalSteps = 0
        routeInsertCount = 0
        gap = nil
        lastAnnouncementText = nil
        finishSummaryText = nil
        finalGap = nil
        workoutStart = nil
        stopSimDriver()
        phase = .idle
    }

    // MARK: - 1Hz 틱 (경과시간·평균페이스 → 엔진)

    private func startTicker() {
        stopTicker()
        let t = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in self.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        ticker = t
        tick()
    }

    private func stopTicker() {
        ticker?.invalidate()
        ticker = nil
    }

    private func tick() {
        if let start = workoutStart {
            elapsedSec = Date().timeIntervalSince(start)
        }
        recomputePace()
        processEngine()
    }

    /// 현재 지표로 엔진 1틱: 격차 발행 + 안내(햅틱·문구) 처리.
    /// 엔진이 주기/역전을 step·상태로 dedupe하므로 틱 중복 호출에도 안전하다.
    private func processEngine() {
        guard phase == .running else { return }
        let result = engine.process(LiveTick(cumulativeDistanceM: distanceM, elapsedSec: elapsedSec))
        gap = result.gap
        handleAnnouncements(result.announcements)
    }

    /// 안내 → 햅틱은 전부, 보조 문구·음성은 최고 우선순위 1개만.
    /// 같은 틱에 역전(priority 3)+랩(priority 2)이 겹치면 문구는 역전이 이겨야 한다 —
    /// 순회 덮어쓰기는 배열 뒤쪽(랩)이 항상 이겨 RaceCore priority 계약을 뒤집는다.
    /// 음성도 같은 1개만 — 한 틱에 여러 문장을 다 읽으면 안내가 밀려 실시간성이 죽는다(폰과 동일 원칙).
    private func handleAnnouncements(_ announcements: [Announcement]) {
        guard !announcements.isEmpty else { return }
        for announcement in announcements {
            playHaptic(for: announcement)
        }
        if let top = announcements.max(by: { $0.priority < $1.priority }) {
            lastAnnouncementText = top.text
            speech.speak(top.text)
        }
    }

    /// 안내 종류 → 햅틱. 종류는 dedupeKey 접두사(ghost.ts 미러 계약)로 판별한다.
    private func playHaptic(for announcement: Announcement) {
        let key = announcement.dedupeKey
        let haptic: WKHapticType
        if key.hasPrefix("reversal:overtake:") {
            haptic = .directionUp
        } else if key.hasPrefix("reversal:overtaken:") {
            haptic = .directionDown
        } else if key == "finish" {
            haptic = .success
        } else { // lap: / periodic: / progress:
            haptic = .click
        }
        WKInterfaceDevice.current().play(haptic)
    }

    private func recomputePace() {
        // 20m 미만/0초에서는 페이스가 튀므로 억제.
        guard distanceM > 20, elapsedSec > 0 else { return }
        paceSecPerKm = elapsedSec / (distanceM / 1000)
        // 케이던스도 같은 게이트에서 갱신(초반 표본 요동 억제). 폰 임포터와 같은 정의: 총 걸음/분.
        if totalSteps > 0, elapsedSec >= 15 {
            cadenceSpm = totalSteps / (elapsedSec / 60)
        }
    }

    // MARK: - delegate → main 반영

    /// HK 델리게이트(백그라운드 큐)가 추출한 원시값을 메인에서 발행.
    fileprivate func applyMetrics(hr: Double?, distanceM: Double?, kcal: Double?, steps: Double?) {
        if let hr { heartRateBpm = hr }
        if let distanceM { self.distanceM = distanceM }
        if let kcal { activeKcal = kcal }
        if let steps { totalSteps = steps }
        recomputePace()
    }

    /// 세션 종료 → 수집 마감 + 운동 저장(실패해도 UI는 완료).
    /// (이름 주의: NSObject.finalize() 와 충돌하므로 finalize 금지.)
    fileprivate func finishAndSave() {
        stopTicker()
        locationManager.stopUpdatingLocation()
        // 시스템 강제종료 폴백(#552 Phase 3 리뷰): 종료 버튼 없이 세션이 .ended 로 전이한 경우
        // (다른 운동앱 세션 경합 등) 결과 상승이 누락되지 않게 여기서도 마감을 보장한다.
        // 종료 버튼 경로에서는 raceFinalized 가드로 no-op(이중 방출 방지).
        finishRace()
        // 경로 빌더는 여기서 '동기적으로' 회수한다 — stopUpdatingLocation 이후에도 이미 배달된
        // 위치 콜백의 @MainActor Task 가 남아 있을 수 있고, 아래 await 지점들 사이에 끼어들면
        // 마감 중인 빌더에 insert 하게 된다(다중 렌즈 리뷰 확정). nil 회수 후엔 appendRoute 가 no-op.
        let routeBuilder = self.routeBuilder
        self.routeBuilder = nil
        let insertedRoutePoints = routeInsertCount
        let builder = self.builder
        Task { @MainActor in
            if let builder {
                do {
                    try await builder.endCollection(at: Date())
                    // Optional 승격 대입: SDK 시그니처(HKWorkout/HKWorkout?) 어느 쪽이든 컴파일된다.
                    let workout: HKWorkout? = try await builder.finishWorkout()
                    // 경로는 워크아웃 저장 뒤에만 붙일 수 있다. 빈 경로 finish 는 에러 → discard.
                    if let workout, let routeBuilder, insertedRoutePoints > 0 {
                        _ = try? await routeBuilder.finishRoute(with: workout, metadata: nil)
                    } else {
                        routeBuilder?.discard()
                    }
                } catch {
                    // 저장 실패는 무시 — 완료 판정을 막지 않는다.
                    routeBuilder?.discard()
                }
            } else {
                routeBuilder?.discard()
            }
            self.session = nil
            self.builder = nil
            self.phase = .ended
        }
    }

    // MARK: - 시뮬레이터 리허설 (프로덕션 미포함)

    #if targetEnvironment(simulator)
    /// 합성 틱 드라이버 타이머(시뮬 전용). 실기기 경로에는 존재하지 않는다.
    private var simDriver: Timer?
    private var simElapsedSec: Double = 0
    private var simDistanceM: Double = 0

    /// 시뮬 전용 리허설: HK 없이 합성 틱으로 격차·역전·랩·완주 전 경로를 검증한다.
    /// 고스트 = 2km @ 6'00"/km(720초). 러너 프로필 = 뒤짐 → 추월 → 1km 랩 → 역추월당함 → 막판 역전승.
    /// 20배속(실시간 ~35초). 런치 인자 --sim-race-rehearsal 로 자동 시작 가능.
    func startSimRehearsal() {
        guard phase == .idle || isErrorPhase else { return }
        ghostCurve = GhostCurve(points: [
            GhostCurvePoint(distanceM: 0, elapsedSec: 0),
            GhostCurvePoint(distanceM: 2000, elapsedSec: 720),
        ])
        // 결과 상승 파이프(WCSession→폰→웹)까지 리허설로 검증할 수 있게 타겟·시작시각도 채운다.
        targetPb = TargetPbInfo(distanceM: 2000, elapsedSec: 720, sourceRunId: "sim-rehearsal-pb")
        workoutStart = Date()
        simElapsedSec = 0
        simDistanceM = 0
        beginRace()

        let t = Timer(timeInterval: 0.05, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in self.simTick() }
        }
        RunLoop.main.add(t, forMode: .common)
        simDriver = t
    }

    /// 리허설 러너의 구간 페이스(초/km): 거리 기반 프로필.
    private func simPace(at distanceM: Double) -> Double {
        switch distanceM {
        case ..<400: return 400    // 6'40" — 고스트(6'00")보다 뒤짐
        case ..<1400: return 260   // 4'20" — 따라잡아 추월(~3.5분 시점)
        case ..<1750: return 620   // 10'20" — 처지며 역추월당함
        default: return 230        // 3'50" — 막판 스퍼트로 역전승
        }
    }

    private func simTick() {
        guard phase == .running else { return }
        // 1틱 = 시뮬 1초 전진.
        simElapsedSec += 1
        simDistanceM += 1000 / simPace(at: simDistanceM)
        elapsedSec = simElapsedSec
        distanceM = simDistanceM
        recomputePace()
        processEngine()

        if simDistanceM >= 2000 {
            stopSimDriver()
            finishRace()
            phase = .ended
        }
    }

    private func stopSimDriver() {
        simDriver?.invalidate()
        simDriver = nil
    }
    #else
    /// 실기기 빌드에는 시뮬 드라이버가 없다 — reset() 공용 경로용 no-op.
    private func stopSimDriver() {}
    #endif
}

// MARK: - HKWorkoutSessionDelegate (백그라운드 큐 → 메인 hop)

extension WatchRaceController: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        if toState == .ended || toState == .stopped {
            Task { @MainActor in self.finishAndSave() }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        let message = error.localizedDescription
        Task { @MainActor in self.phase = .error("세션 오류: \(message)") }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate (백그라운드 큐 → 메인 hop)

extension WatchRaceController: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        // 원시 Double만 추출(Sendable) 후 메인에서 발행 — HKLiveWorkoutBuilder를 hop 너머로 넘기지 않는다.
        var hr: Double?
        var dist: Double?
        var kcal: Double?
        var steps: Double?
        for type in collectedTypes {
            guard let qt = type as? HKQuantityType,
                  let stats = workoutBuilder.statistics(for: qt) else { continue }
            switch qt.identifier {
            case HKQuantityTypeIdentifier.heartRate.rawValue:
                hr = stats.mostRecentQuantity()?.doubleValue(for: .count().unitDivided(by: .minute()))
            case HKQuantityTypeIdentifier.distanceWalkingRunning.rawValue:
                dist = stats.sumQuantity()?.doubleValue(for: .meter())
            case HKQuantityTypeIdentifier.activeEnergyBurned.rawValue:
                kcal = stats.sumQuantity()?.doubleValue(for: .kilocalorie())
            case HKQuantityTypeIdentifier.stepCount.rawValue:
                steps = stats.sumQuantity()?.doubleValue(for: .count())
            default:
                break
            }
        }
        let h = hr, d = dist, k = kcal, s = steps
        Task { @MainActor in self.applyMetrics(hr: h, distanceM: d, kcal: k, steps: s) }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // 이벤트(일시정지/재개 마커 등)는 미사용 — 자동일시정지 끔(#552 UX).
    }
}

// MARK: - CLLocationManagerDelegate (백그라운드 큐 → 메인 hop)

extension WatchRaceController: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // 폰 LiveRunTracker 와 같은 기준: 수평정확도 0~50m 만 경로로 신뢰(터널·초기 fix 튐 배제).
        let filtered = locations.filter { $0.horizontalAccuracy > 0 && $0.horizontalAccuracy <= 50 }
        guard !filtered.isEmpty else { return }
        Task { @MainActor in self.appendRoute(filtered) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // 위치 실패는 경로만 비게 둔다 — 레이스(HK 지표) 진행에는 영향 없음.
    }
}
