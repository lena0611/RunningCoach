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

    /// 레이스 상대(고스트) 곡선. Phase 2에서는 주입식(시뮬 리허설) — 폰 동기화는 Phase 3.
    private(set) var ghostCurve: GhostCurve?
    private(set) var announceConfig: AnnounceConfig = .default

    /// 라이브 틱을 먹여 gap·역전·주기 발화를 계산할 공유 엔진(RaceCore).
    /// 엔진은 레이스 1회분 상태(이전 gap·주기 step·완주)를 갖므로 시작할 때마다 재생성한다.
    private var engine: GhostRaceEngine

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var ticker: Timer?
    /// 벽시계 기준 시작 시각. 자동일시정지 끔이라 벽시계 경과 == 운동 경과.
    private var workoutStart: Date?

    override init() {
        engine = GhostRaceEngine(curve: nil, config: .default)
        super.init()
    }

    // MARK: - 권한 타입

    /// 저장(share): 완주 시 운동 기록 저장에 필요.
    private var shareTypes: Set<HKSampleType> {
        [
            HKObjectType.workoutType(),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.heartRate),
        ]
    }

    /// 읽기(read): 라이브 지표 표시에 필요.
    private var readTypes: Set<HKObjectType> {
        [
            HKQuantityType(.heartRate),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.activeEnergyBurned),
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
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)
            session.delegate = self
            builder.delegate = self
            self.session = session
            self.builder = builder

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

    /// 레이스 공통 시작 처리: 엔진 재생성(1회분 상태 초기화) + 시작 햅틱 + running 전환.
    private func beginRace() {
        engine = GhostRaceEngine(curve: ghostCurve, config: announceConfig)
        gap = nil
        lastAnnouncementText = nil
        finishSummaryText = nil
        finalGap = nil
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
    /// 문구와 같은 틱으로 finalGap 도 굳혀 요약 색(승/패)이 문구와 항상 일치하게 한다.
    private func finishRace() {
        let tick = LiveTick(cumulativeDistanceM: distanceM, elapsedSec: elapsedSec)
        if let curve = ghostCurve {
            finalGap = GhostMath.computeGap(curve, tick)
        }
        if let fin = engine.finish(tick) {
            finishSummaryText = fin.text
            WKInterfaceDevice.current().play(.success)
        }
    }

    /// 요약 화면에서 새 레이스 준비(지표 초기화 → idle).
    func reset() {
        guard phase == .ended || isErrorPhase else { return }
        elapsedSec = 0
        distanceM = 0
        heartRateBpm = 0
        activeKcal = 0
        paceSecPerKm = 0
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

    /// 안내 → 햅틱은 전부, 보조 문구는 최고 우선순위 1개만.
    /// 같은 틱에 역전(priority 3)+랩(priority 2)이 겹치면 문구는 역전이 이겨야 한다 —
    /// 순회 덮어쓰기는 배열 뒤쪽(랩)이 항상 이겨 RaceCore priority 계약을 뒤집는다.
    private func handleAnnouncements(_ announcements: [Announcement]) {
        guard !announcements.isEmpty else { return }
        for announcement in announcements {
            playHaptic(for: announcement)
        }
        if let top = announcements.max(by: { $0.priority < $1.priority }) {
            lastAnnouncementText = top.text
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
    }

    // MARK: - delegate → main 반영

    /// HK 델리게이트(백그라운드 큐)가 추출한 원시값을 메인에서 발행.
    fileprivate func applyMetrics(hr: Double?, distanceM: Double?, kcal: Double?) {
        if let hr { heartRateBpm = hr }
        if let distanceM { self.distanceM = distanceM }
        if let kcal { activeKcal = kcal }
        recomputePace()
    }

    /// 세션 종료 → 수집 마감 + 운동 저장(실패해도 UI는 완료). 저장 견고화·결과 릴레이는 Phase 3.
    /// (이름 주의: NSObject.finalize() 와 충돌하므로 finalize 금지.)
    fileprivate func finishAndSave() {
        stopTicker()
        let builder = self.builder
        Task { @MainActor in
            if let builder {
                do {
                    try await builder.endCollection(at: Date())
                    _ = try await builder.finishWorkout()
                } catch {
                    // 저장 실패는 무시 — 완료 판정을 막지 않는다.
                }
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
            default:
                break
            }
        }
        let h = hr, d = dist, k = kcal
        Task { @MainActor in self.applyMetrics(hr: h, distanceM: d, kcal: k) }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // 이벤트(일시정지/재개 마커 등)는 미사용 — 자동일시정지 끔(#552 UX).
    }
}
