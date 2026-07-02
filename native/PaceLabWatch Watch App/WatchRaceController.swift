//
//  WatchRaceController.swift
//  PaceLabWatch Watch App — #552 Phase 1
//
//  워치 레이스 세션 컨트롤러(아키텍처 레이어 ②).
//  HKWorkoutSession + HKLiveWorkoutBuilder로 라이브 지표(경과시간·거리·심박·칼로리·페이스)를
//  수집해 SwiftUI에 발행한다. 고스트 격차·햅틱(RaceCore 엔진 소비)은 Phase 2, WCSession 왕복은 Phase 3.
//
//  ⚠️ HealthKit 사용설명(NSHealthShare/Update)이 빌드된 plist에 없으면 첫 API 접근에 하드 크래시한다.
//     → 워치 타겟 INFOPLIST_KEY_NSHealthShare/UpdateUsageDescription + healthkit entitlement 필수.
//

import Foundation
import Combine
import HealthKit
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

    // ── 라이브 지표 (Phase 1: 표시 전용) ─────────────────────────────────────
    @Published private(set) var elapsedSec: Double = 0
    @Published private(set) var distanceM: Double = 0
    @Published private(set) var heartRateBpm: Double = 0
    @Published private(set) var activeKcal: Double = 0
    /// 평균 페이스(초/km). 0 = 아직 산출 전. Phase 2에서 롤링 순간페이스로 정밀화.
    @Published private(set) var paceSecPerKm: Double = 0

    /// Phase 2~에서 라이브 틱을 먹여 gap·역전·주기 발화를 계산할 공유 엔진(RaceCore).
    /// Phase 1은 링크·구성만 유지(고스트 없는 자유주행 기본값) — 아직 틱을 먹이지 않는다.
    private let engine: GhostRaceEngine

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
                    self.phase = .running
                    self.startTicker()
                }
            }
        } catch {
            phase = .error("운동 세션 생성 실패: \(error.localizedDescription)")
        }
    }

    /// 종료 버튼: 세션을 끝낸다 → didChangeTo(.ended) → finalize에서 저장·정리.
    func end() {
        guard phase == .running else { return }
        stopTicker()
        session?.end()
    }

    /// 요약 화면에서 새 레이스 준비(지표 초기화 → idle).
    func reset() {
        guard phase == .ended || isErrorPhase else { return }
        elapsedSec = 0
        distanceM = 0
        heartRateBpm = 0
        activeKcal = 0
        paceSecPerKm = 0
        workoutStart = nil
        phase = .idle
    }

    // MARK: - 1Hz 틱 (경과시간·평균페이스)

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

    /// 세션 종료 → 수집 마감 + 운동 저장(실패해도 UI는 완료). 저장 견고화는 Phase 3.
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
                    // 저장 실패는 무시 — Phase 1 완료 판정을 막지 않는다.
                }
            }
            self.session = nil
            self.builder = nil
            self.phase = .ended
        }
    }
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
        // Phase 1은 이벤트(일시정지/재개 마커 등) 미사용.
    }
}
