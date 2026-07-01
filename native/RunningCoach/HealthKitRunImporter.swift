import Foundation
import HealthKit
import CoreLocation

struct HealthKitRunCandidate: Codable {
    let externalId: String
    let sourceName: String?
    let date: String
    let startAt: String
    let endAt: String
    let durationSec: Double?
    let distanceKm: Double?
    let avgPaceSec: Double?
    let avgHeartRate: Double?
    let maxHeartRate: Double?
    let cadence: Double?
    let activeEnergyKcal: Double?
    let temperature: Double?
    let humidity: Double?
    let windMps: Double?
    let elevationGainM: Double?
    let elevationLossM: Double?
    let rpe: Double?
    let routeAvailable: Bool
    let laps: [HealthKitLap]
    let fastSegments: [HealthKitFastSegment]
    let metricSamples: [HealthKitMetricSample]
    let routePoints: [HealthKitRoutePoint]
    let rawAvailability: HealthKitAvailability
    /// #235/§10: HealthKit workout metadata 의 PaceLABCompetition == "self-race" 면 true.
    /// 웹은 이 값으로 유입 시점에 RunLog.tags 에 'self-race' 를 박아 세션·의도 매칭에서 제외한다.
    let isSelfRace: Bool
}

struct HealthKitLap: Codable {
    let index: Int
    let distanceKm: Double?
    let paceSec: Double?
    let avgHeartRate: Double?
    let cadence: Double?
}

struct HealthKitFastSegment: Codable {
    let index: Int
    let startSec: Double?
    let durationSec: Double?
    let distanceKm: Double?
    let avgPaceSec: Double?
    let bestPaceSec: Double?
}

struct HealthKitMetricSample: Codable {
    let offsetSec: Double
    let heartRate: Double?
    let paceSec: Double?
    let cadence: Double?
}

struct HealthKitRoutePoint: Codable {
    let offsetSec: Double
    let latitude: Double
    let longitude: Double
    let altitude: Double?
}

struct HealthKitAvailability: Codable {
    let workout: Bool
    let heartRate: Bool
    let route: Bool
    let cadence: Bool
    let runningDynamics: Bool
}

struct HealthKitRunRefreshRequest {
    let externalId: String?
    let date: String?
    let startAt: String?
    let endAt: String?
    let distanceKm: Double?
    let durationSec: Double?
}

// VO2max(심폐 체력)는 워크아웃에 묶이지 않는 프로필 레벨 최신 샘플이라 러닝 후보와 분리해 전달한다.
struct HealthKitVo2MaxSample: Codable {
    let value: Double?
    let unit: String?
    let sampleDate: String?
    let sourceName: String?
}

final class HealthKitRunImporter {
    private let healthStore = HKHealthStore()
    private var runningWorkoutObserverQuery: HKObserverQuery?
    private var backgroundDeliveryStarted = false
    private struct HeartRatePoint {
        let date: Date
        let bpm: Double
    }

    private struct DistancePoint {
        let startDate: Date
        let endDate: Date
        let meter: Double
    }

    private struct StepPoint {
        let startDate: Date
        let endDate: Date
        let count: Double
    }

    private struct SpeedPoint {
        let startDate: Date
        let endDate: Date
        let metersPerSecond: Double
    }

    func fetchRecentRunningWorkouts(days: Int, completion: @escaping (Result<[HealthKitRunCandidate], Error>) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            print("[RunContext HealthKit] Health data unavailable")
            completion(.failure(HealthKitImportError.healthDataUnavailable))
            return
        }

        requestAuthorization { [weak self] result in
            switch result {
            case .success:
                print("[RunContext HealthKit] authorization success")
                self?.queryRecentRunningWorkouts(days: days, completion: completion)
            case .failure(let error):
                print("[RunContext HealthKit] authorization failed:", error.localizedDescription)
                completion(.failure(error))
            }
        }
    }

    func fetchRunningWorkouts(startDate: String, endDate: String, completion: @escaping (Result<[HealthKitRunCandidate], Error>) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            print("[RunContext HealthKit] Health data unavailable")
            completion(.failure(HealthKitImportError.healthDataUnavailable))
            return
        }

        requestAuthorization { [weak self] result in
            switch result {
            case .success:
                print("[RunContext HealthKit] authorization success")
                self?.queryRunningWorkouts(startDate: startDate, endDate: endDate, completion: completion)
            case .failure(let error):
                print("[RunContext HealthKit] authorization failed:", error.localizedDescription)
                completion(.failure(error))
            }
        }
    }

    func fetchRunningWorkout(request: HealthKitRunRefreshRequest, completion: @escaping (Result<HealthKitRunCandidate, Error>) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            print("[RunContext HealthKit] Health data unavailable")
            completion(.failure(HealthKitImportError.healthDataUnavailable))
            return
        }

        requestAuthorization { [weak self] result in
            switch result {
            case .success:
                print("[RunContext HealthKit] authorization success")
                self?.queryRunningWorkoutForRefresh(request: request, completion: completion)
            case .failure(let error):
                print("[RunContext HealthKit] authorization failed:", error.localizedDescription)
                completion(.failure(error))
            }
        }
    }

    func fetchLatestVo2Max(completion: @escaping (Result<HealthKitVo2MaxSample, Error>) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            print("[RunContext HealthKit] Health data unavailable")
            completion(.failure(HealthKitImportError.healthDataUnavailable))
            return
        }

        requestAuthorization { [weak self] result in
            switch result {
            case .success:
                print("[RunContext HealthKit] authorization success (vo2max)")
                self?.queryLatestVo2Max(completion: completion)
            case .failure(let error):
                print("[RunContext HealthKit] authorization failed (vo2max):", error.localizedDescription)
                completion(.failure(error))
            }
        }
    }

    private func queryLatestVo2Max(completion: @escaping (Result<HealthKitVo2MaxSample, Error>) -> Void) {
        guard let vo2Type = HKObjectType.quantityType(forIdentifier: .vo2Max) else {
            completion(.failure(HealthKitImportError.healthDataUnavailable))
            return
        }
        // 최신 샘플 1건만. 워크아웃과 무관하므로 predicate 없이 endDate 내림차순으로 정렬한다.
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let query = HKSampleQuery(sampleType: vo2Type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, error in
            if let error {
                print("[RunContext HealthKit] vo2max query failed:", error.localizedDescription)
                completion(.failure(error))
                return
            }
            guard let sample = samples?.first as? HKQuantitySample else {
                // 기록 없음은 오류가 아니다. value=nil로 정상 응답해 웹이 "미사용"으로 처리한다.
                completion(.success(HealthKitVo2MaxSample(value: nil, unit: nil, sampleDate: nil, sourceName: nil)))
                return
            }
            let unit = HKUnit(from: "mL/kg*min")
            let raw = sample.quantity.doubleValue(for: unit)
            let value = (raw * 10).rounded() / 10
            let sampleDate = Self.isoFormatter.string(from: sample.endDate)
            let sourceName = sample.sourceRevision.source.name
            completion(.success(HealthKitVo2MaxSample(value: value, unit: "mL/kg·min", sampleDate: sampleDate, sourceName: sourceName)))
        }
        healthStore.execute(query)
    }

    func startRunningWorkoutBackgroundDelivery(onChange: @escaping () -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            print("[RunContext HealthKit] Background delivery unavailable: health data unavailable")
            return
        }
        guard !backgroundDeliveryStarted else { return }
        backgroundDeliveryStarted = true

        requestAuthorization { [weak self] result in
            guard let self else { return }
            switch result {
            case .success:
                self.startRunningWorkoutObserver(onChange: onChange)
            case .failure(let error):
                print("[RunContext HealthKit] Background delivery authorization failed:", error.localizedDescription)
                self.backgroundDeliveryStarted = false
            }
        }
    }

    private func requestAuthorization(completion: @escaping (Result<Void, Error>) -> Void) {
        let readTypes = Set(healthTypesToRead())
        healthStore.requestAuthorization(toShare: [], read: readTypes) { success, error in
            if let error {
                completion(.failure(error))
            } else if success {
                completion(.success(()))
            } else {
                completion(.failure(HealthKitImportError.authorizationDenied))
            }
        }
    }

    // ── #235 레이싱 HealthKit write — self-race 결과를 운동으로 저장(아이폰 1차) ──────
    // 라이브런(나와의 대결) 종료 시 LiveRunTracker가 들고 있던 거리·시간으로 HKWorkout을
    // 저장한다. sourceName은 앱(PaceLAB)으로 자동 기록되고, 반환 uuid는 기존 import dedupe
    // 키(externalId)와 같으므로 회신받아 RunLog 유입·중복차단·결과연결에 그대로 재사용한다.
    // HR은 폰 단독이라 없음(거리·시간·페이스만). 경로(route)는 1차 미포함(사용자 결정).

    // #235: write 권한은 레이싱 '시작'(포그라운드)에 미리 확보한다. 종료가 목표거리 자동완주라
    // 백그라운드/잠금 상태이면 권한 시트를 띄울 수 없어, 그때 처음 요청하면 첫 레이싱이
    // 영구 저장 실패한다(Codex 리뷰). 이미 결정된 권한이면 시트 없이 즉시 콜백된다.
    func requestCompetitionWriteAuthorization(completion: @escaping (Bool) -> Void) {
        guard HKHealthStore.isHealthDataAvailable(),
              let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning) else {
            completion(false)
            return
        }
        let workoutType = HKObjectType.workoutType()
        // 레이싱 입장마다 권한 시트가 다시 뜨던 문제: 이미 '쓰기'가 허용돼 있으면 재요청하지 않는다.
        // authorizationStatus는 share(쓰기)에 대해선 정확하다(읽기는 프라이버시상 항상 미상 보고).
        // 로그로 매 호출 시 상태를 남겨, 팝업이 계속 뜨면 권한이 .notDetermined로 리셋되는지(환경 문제)
        // 아니면 .sharingAuthorized인데 불필요 재요청이었는지 진단한다.
        let workoutStatus = healthStore.authorizationStatus(for: workoutType)
        let distanceStatus = healthStore.authorizationStatus(for: distanceType)
        print("[RunContext HealthKit] competition write auth status workout=\(workoutStatus.rawValue) distance=\(distanceStatus.rawValue) (0=notDetermined,1=denied,2=authorized)")
        if workoutStatus == .sharingAuthorized && distanceStatus == .sharingAuthorized {
            print("[RunContext HealthKit] already authorized — skip prompt")
            completion(true)
            return
        }
        let shareTypes: Set<HKSampleType> = [workoutType, distanceType]
        healthStore.requestAuthorization(toShare: shareTypes, read: []) { success, error in
            if let error {
                print("[RunContext HealthKit] competition write auth failed:", error.localizedDescription)
            }
            completion(success)
        }
    }

    func saveCompetitionRunningWorkout(
        distanceMeters: Double,
        start: Date,
        end: Date,
        cadence: Double?,
        completion: @escaping (Result<String, Error>) -> Void
    ) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(.failure(HealthKitImportError.healthDataUnavailable))
            return
        }
        guard let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning) else {
            completion(.failure(HealthKitImportError.healthDataUnavailable))
            return
        }
        // stepCount write 권한도 함께 요청한다(cadence를 걸음수로 저장). 타입 미가용이어도
        // 거리만으로 워크아웃은 성립하므로 optional 로 둔다.
        let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)
        // write 전용 권한만 추가로 요청한다(read는 기존 흐름이 이미 받음). 이미 허용돼 있으면
        // 다이얼로그 없이 통과하고, 미허용이면 이 시점에만 쓰기 권한 시트가 뜬다.
        var shareTypes: Set<HKSampleType> = [HKObjectType.workoutType(), distanceType]
        if let stepType { shareTypes.insert(stepType) }
        healthStore.requestAuthorization(toShare: shareTypes, read: []) { [weak self] success, error in
            guard let self else { return }
            if let error {
                completion(.failure(error))
            } else if success {
                self.writeRunningWorkout(distanceType: distanceType, stepType: stepType, distanceMeters: distanceMeters, start: start, end: end, cadence: cadence, completion: completion)
            } else {
                completion(.failure(HealthKitImportError.authorizationDenied))
            }
        }
    }

    private func writeRunningWorkout(
        distanceType: HKQuantityType,
        stepType: HKQuantityType?,
        distanceMeters: Double,
        start: Date,
        end: Date,
        cadence: Double?,
        completion: @escaping (Result<String, Error>) -> Void
    ) {
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .running
        configuration.locationType = .outdoor
        let builder = HKWorkoutBuilder(healthStore: healthStore, configuration: configuration, device: .local())

        func fail(_ error: Error?) {
            builder.discardWorkout()
            completion(.failure(error ?? Self.writeError))
        }

        builder.beginCollection(withStart: start) { success, error in
            guard success else { fail(error); return }

            // self-race 표식 메타데이터(가져오기 시 일반 러닝과 구분 가능). 사용자 직접입력 아님.
            let metadata: [String: Any] = [
                HKMetadataKeyWasUserEntered: false,
                "PaceLABCompetition": "self-race"
            ]
            builder.addMetadata(metadata) { _, _ in
                let finalize = {
                    builder.endCollection(withEnd: end) { success, error in
                        guard success else { fail(error); return }
                        builder.finishWorkout { workout, error in
                            if let workout {
                                completion(.success(workout.uuid.uuidString))
                            } else {
                                fail(error)
                            }
                        }
                    }
                }

                // 거리·걸음 샘플을 모아 한 번에 add 한다. HR·route는 1차 미포함 — 거리만으로도 러닝 워크아웃 성립.
                var samples: [HKSample] = []
                if distanceMeters > 0 {
                    let quantity = HKQuantity(unit: .meter(), doubleValue: distanceMeters)
                    samples.append(HKCumulativeQuantitySample(type: distanceType, quantity: quantity, start: start, end: end))
                }
                // 케이던스(분당 걸음)는 HealthKit에서 stepCount로 표현된다. 총 걸음 = cadence × 경과(분).
                // Apple Fitness/워치와 동일하게 워크아웃 케이던스를 걸음 통계로 유도하게 한다.
                let elapsedMin = max(end.timeIntervalSince(start), 0) / 60
                if let stepType, let cadence, cadence > 0, elapsedMin > 0 {
                    let totalSteps = (cadence * elapsedMin).rounded()
                    if totalSteps > 0 {
                        let stepQuantity = HKQuantity(unit: .count(), doubleValue: totalSteps)
                        samples.append(HKCumulativeQuantitySample(type: stepType, quantity: stepQuantity, start: start, end: end))
                    }
                }

                guard !samples.isEmpty else { finalize(); return }
                builder.add(samples) { success, error in
                    guard success else { fail(error); return }
                    finalize()
                }
            }
        }
    }

    private static let writeError = NSError(
        domain: "RunContextHealthKitWrite",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "HealthKit 운동 저장에 실패했습니다."]
    )

    private func healthTypesToRead() -> [HKObjectType] {
        var types: [HKObjectType] = [HKObjectType.workoutType()]

        [
            HKQuantityTypeIdentifier.heartRate,
            HKQuantityTypeIdentifier.stepCount,
            HKQuantityTypeIdentifier.distanceWalkingRunning,
            HKQuantityTypeIdentifier.activeEnergyBurned,
            HKQuantityTypeIdentifier.runningSpeed,
            HKQuantityTypeIdentifier.runningPower,
            HKQuantityTypeIdentifier.runningStrideLength,
            HKQuantityTypeIdentifier.runningVerticalOscillation,
            HKQuantityTypeIdentifier.vo2Max
        ].compactMap { HKObjectType.quantityType(forIdentifier: $0) }
            .forEach { types.append($0) }

        if #available(iOS 18.0, *),
           let effortType = HKObjectType.quantityType(forIdentifier: .workoutEffortScore) {
            types.append(effortType)
        }

        types.append(HKSeriesType.workoutRoute())

        return types
    }

    private func startRunningWorkoutObserver(onChange: @escaping () -> Void) {
        let workoutType = HKObjectType.workoutType()
        let runningPredicate = HKQuery.predicateForWorkouts(with: .running)
        let query = HKObserverQuery(sampleType: workoutType, predicate: runningPredicate) { _, completionHandler, error in
            if let error {
                print("[RunContext HealthKit] Background workout observer failed:", error.localizedDescription)
                completionHandler()
                return
            }

            print("[RunContext HealthKit] Background running workout change detected")
            onChange()
            completionHandler()
        }

        runningWorkoutObserverQuery = query
        healthStore.execute(query)
        healthStore.enableBackgroundDelivery(for: workoutType, frequency: .immediate) { success, error in
            if let error {
                print("[RunContext HealthKit] enableBackgroundDelivery failed:", error.localizedDescription)
                return
            }
            print("[RunContext HealthKit] Background delivery \(success ? "enabled" : "not enabled")")
        }
    }

    private func queryRecentRunningWorkouts(days: Int, completion: @escaping (Result<[HealthKitRunCandidate], Error>) -> Void) {
        let startDate = Calendar.current.date(byAdding: .day, value: -max(days - 1, 0), to: Date()) ?? Date()
        let datePredicate = HKQuery.predicateForSamples(withStart: startDate, end: Date(), options: [])
        let runningPredicate = HKQuery.predicateForWorkouts(with: .running)
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [datePredicate, runningPredicate])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { [weak self] _, samples, error in
            if let error {
                completion(.failure(error))
                return
            }

            let workouts = (samples as? [HKWorkout]) ?? []
            print("[RunContext HealthKit] workouts=\(workouts.count)")
            self?.buildCandidates(from: workouts, completion: completion)
        }

        healthStore.execute(query)
    }

    private func queryRunningWorkouts(startDate startDateText: String, endDate endDateText: String, completion: @escaping (Result<[HealthKitRunCandidate], Error>) -> Void) {
        guard let startDay = Self.dayFormatter.date(from: startDateText),
              let endDay = Self.dayFormatter.date(from: endDateText) else {
            completion(.failure(HealthKitImportError.invalidDateRange))
            return
        }

        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: startDay)
        let endStartOfDay = calendar.startOfDay(for: endDay)
        guard let endExclusive = calendar.date(byAdding: .day, value: 1, to: endStartOfDay),
              startOfDay < endExclusive else {
            completion(.failure(HealthKitImportError.invalidDateRange))
            return
        }

        let datePredicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endExclusive, options: [])
        let runningPredicate = HKQuery.predicateForWorkouts(with: .running)
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [datePredicate, runningPredicate])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { [weak self] _, samples, error in
            if let error {
                completion(.failure(error))
                return
            }

            let workouts = (samples as? [HKWorkout]) ?? []
            print("[RunContext HealthKit] workouts in range=\(workouts.count)")
            self?.buildCandidates(from: workouts, completion: completion)
        }

        healthStore.execute(query)
    }

    private func queryRunningWorkout(uuid: UUID, completion: @escaping (Result<HealthKitRunCandidate, Error>) -> Void) {
        let objectPredicate = HKQuery.predicateForObject(with: uuid)
        let runningPredicate = HKQuery.predicateForWorkouts(with: .running)
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [objectPredicate, runningPredicate])

        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: 1, sortDescriptors: nil) { [weak self] _, samples, error in
            if let error {
                completion(.failure(error))
                return
            }

            guard let workout = (samples as? [HKWorkout])?.first else {
                completion(.failure(HealthKitImportError.workoutNotFound))
                return
            }

            self?.buildCandidate(from: workout) { candidate in
                completion(.success(candidate))
            }
        }

        healthStore.execute(query)
    }

    private func queryRunningWorkoutForRefresh(request: HealthKitRunRefreshRequest, completion: @escaping (Result<HealthKitRunCandidate, Error>) -> Void) {
        if let externalId = request.externalId, let uuid = UUID(uuidString: externalId) {
            queryRunningWorkout(uuid: uuid) { [weak self] result in
                switch result {
                case .success:
                    completion(result)
                case .failure(let error):
                    if let importError = error as? HealthKitImportError,
                       case .workoutNotFound = importError {
                        self?.queryMatchingRunningWorkout(request: request, completion: completion)
                    } else {
                        completion(.failure(error))
                    }
                }
            }
            return
        }

        queryMatchingRunningWorkout(request: request, completion: completion)
    }

    private func queryMatchingRunningWorkout(request: HealthKitRunRefreshRequest, completion: @escaping (Result<HealthKitRunCandidate, Error>) -> Void) {
        guard let dateText = request.date,
              let date = Self.dayFormatter.date(from: dateText) else {
            completion(.failure(HealthKitImportError.invalidExternalId))
            return
        }

        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: date)
        guard let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) else {
            completion(.failure(HealthKitImportError.workoutNotFound))
            return
        }

        let datePredicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endOfDay, options: [])
        let runningPredicate = HKQuery.predicateForWorkouts(with: .running)
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [datePredicate, runningPredicate])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { [weak self] _, samples, error in
            if let error {
                completion(.failure(error))
                return
            }

            let workouts = (samples as? [HKWorkout]) ?? []
            guard let workout = self?.bestMatchingWorkout(from: workouts, request: request) else {
                completion(.failure(HealthKitImportError.workoutNotFound))
                return
            }

            self?.buildCandidate(from: workout) { candidate in
                completion(.success(candidate))
            }
        }

        healthStore.execute(query)
    }

    private func bestMatchingWorkout(from workouts: [HKWorkout], request: HealthKitRunRefreshRequest) -> HKWorkout? {
        guard !workouts.isEmpty else { return nil }

        return workouts
            .map { workout in
                let distanceKm = workoutDistanceKm(workout)
                let distanceScore = matchScore(actual: distanceKm, expected: request.distanceKm, tolerance: 0.08, scale: 0.04)
                let durationScore = matchScore(actual: workout.duration, expected: request.durationSec, tolerance: 90, scale: 30)
                let startScore = matchDateScore(actual: workout.startDate, expected: request.startAt, tolerance: 180, scale: 60)
                let endScore = matchDateScore(actual: workout.endDate, expected: request.endAt, tolerance: 180, scale: 60)
                return (workout: workout, score: distanceScore + durationScore + startScore + endScore)
            }
            .filter { $0.score.isFinite }
            .sorted { $0.score < $1.score }
            .first?
            .workout
    }

    private func matchScore(actual: Double?, expected: Double?, tolerance: Double, scale: Double) -> Double {
        guard let expected else { return 0 }
        guard let actual else { return Double.infinity }
        let diff = abs(actual - expected)
        guard diff <= tolerance else { return Double.infinity }
        return diff / max(scale, 0.0001)
    }

    private func matchDateScore(actual: Date, expected: String?, tolerance: TimeInterval, scale: TimeInterval) -> Double {
        guard let expected, let expectedDate = Self.isoFormatter.date(from: expected) else { return 0 }
        let diff = abs(actual.timeIntervalSince(expectedDate))
        guard diff <= tolerance else { return Double.infinity }
        return diff / max(scale, 0.0001)
    }

    private func buildCandidates(from workouts: [HKWorkout], completion: @escaping (Result<[HealthKitRunCandidate], Error>) -> Void) {
        let group = DispatchGroup()
        var candidates = Array<HealthKitRunCandidate?>(repeating: nil, count: workouts.count)

        for (index, workout) in workouts.enumerated() {
            group.enter()
            buildCandidate(from: workout) { candidate in
                candidates[index] = candidate
                group.leave()
            }
        }

        group.notify(queue: .global()) {
            completion(.success(candidates.compactMap { $0 }))
        }
    }

    private func buildCandidate(from workout: HKWorkout, completion: @escaping (HealthKitRunCandidate) -> Void) {
        let heartType = HKQuantityType.quantityType(forIdentifier: .heartRate)
        let distanceKm = workoutDistanceKm(workout)
        let durationSec = workout.duration
        let activeEnergy = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)
            .flatMap { workout.statistics(for: $0)?.sumQuantity()?.doubleValue(for: .kilocalorie()) }

        var avgHeartRate: Double?
        var maxHeartRate: Double?
        var heartRatePoints: [HeartRatePoint] = []
        var routeLocations: [CLLocation] = []
        var distancePoints: [DistancePoint] = []
        var stepPoints: [StepPoint] = []
        var speedPoints: [SpeedPoint] = []
        var rpe: Double?

        let group = DispatchGroup()

        if let heartType {
            group.enter()
            queryHeartRate(for: workout, heartType: heartType) { average, maximum in
                avgHeartRate = average
                maxHeartRate = maximum
                group.leave()
            }

            group.enter()
            queryHeartRateSamples(for: workout, heartType: heartType) { points in
                heartRatePoints = points
                group.leave()
            }
        }

        group.enter()
        queryRouteLocations(for: workout) { locations in
            routeLocations = locations
            group.leave()
        }

        if let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning) {
            group.enter()
            queryDistanceSamples(for: workout, distanceType: distanceType) { points in
                distancePoints = points
                group.leave()
            }
        }

        if let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) {
            group.enter()
            queryStepSamples(for: workout, stepType: stepType) { points in
                stepPoints = points
                group.leave()
            }
        }

        if let speedType = HKQuantityType.quantityType(forIdentifier: .runningSpeed) {
            group.enter()
            querySpeedSamples(for: workout, speedType: speedType) { points in
                speedPoints = points
                group.leave()
            }
        }

        if #available(iOS 18.0, *),
           let effortType = HKQuantityType.quantityType(forIdentifier: .workoutEffortScore) {
            group.enter()
            queryWorkoutEffortScore(for: workout, effortType: effortType) { score in
                rpe = score
                group.leave()
            }
        }

        group.notify(queue: .global()) {
            let weather = self.workoutWeather(from: workout)
            let elevation = self.routeElevation(from: routeLocations)
            let avgPace = distanceKm.flatMap { distance -> Double? in
                guard distance > 0 else { return nil }
                return durationSec / distance
            }
            let laps = self.buildLaps(
                workout: workout,
                routeLocations: routeLocations,
                distancePoints: distancePoints,
                heartRatePoints: heartRatePoints,
                stepPoints: stepPoints,
                fallbackDistanceKm: distanceKm,
                fallbackDurationSec: durationSec
            )
            let fastSegments = self.buildFastSegments(workout: workout, speedPoints: speedPoints, routeLocations: routeLocations)
            let metricSamples = self.buildMetricSamples(
                workout: workout,
                heartRatePoints: heartRatePoints,
                speedPoints: speedPoints,
                stepPoints: stepPoints,
                routeLocations: routeLocations
            )
            let routePoints = self.buildRoutePoints(workout: workout, routeLocations: routeLocations)
            let avgCadence = self.averageCadence(stepPoints, from: workout.startDate, to: workout.endDate)
            // #235/§10: 라이브 레이싱 종료 시 PaceLABCompetition="self-race" 메타데이터를 워크아웃에 박는다(line 341).
            // 따라잡기 자동 sync 로 유입되는 같은 워크아웃을 웹이 self-race 로 인식하게 후보에 실어 보낸다.
            let isSelfRace = (workout.metadata?["PaceLABCompetition"] as? String) == "self-race"

            completion(
                HealthKitRunCandidate(
                    externalId: workout.uuid.uuidString,
                    sourceName: workout.sourceRevision.source.name,
                    date: Self.dayFormatter.string(from: workout.startDate),
                    startAt: Self.isoFormatter.string(from: workout.startDate),
                    endAt: Self.isoFormatter.string(from: workout.endDate),
                    durationSec: durationSec,
                    distanceKm: distanceKm,
                    avgPaceSec: avgPace,
                    avgHeartRate: avgHeartRate,
                    maxHeartRate: maxHeartRate,
                    cadence: avgCadence,
                    activeEnergyKcal: activeEnergy,
                    temperature: weather.temperature,
                    humidity: weather.humidity,
                    windMps: nil,
                    elevationGainM: elevation.gain,
                    elevationLossM: elevation.loss,
                    rpe: rpe,
                    routeAvailable: !routeLocations.isEmpty,
                    laps: laps,
                    fastSegments: fastSegments,
                    metricSamples: metricSamples,
                    routePoints: routePoints,
                    rawAvailability: HealthKitAvailability(
                        workout: true,
                        heartRate: avgHeartRate != nil || maxHeartRate != nil,
                        route: !routeLocations.isEmpty,
                        cadence: avgCadence != nil,
                        runningDynamics: avgCadence != nil || !speedPoints.isEmpty || !fastSegments.isEmpty
                    ),
                    isSelfRace: isSelfRace
                )
            )
        }
    }

    private func workoutDistanceKm(_ workout: HKWorkout) -> Double? {
        if let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning),
           let distance = workout.statistics(for: distanceType)?.sumQuantity()?.doubleValue(for: .meter()) {
            return rounded(distance / 1000)
        }

        return workout.totalDistance.map { rounded($0.doubleValue(for: .meter()) / 1000) }
    }

    private func queryHeartRate(for workout: HKWorkout, heartType: HKQuantityType, completion: @escaping (Double?, Double?) -> Void) {
        let predicate = HKQuery.predicateForObjects(from: workout)
        let query = HKStatisticsQuery(quantityType: heartType, quantitySamplePredicate: predicate, options: [.discreteAverage, .discreteMax]) { _, statistics, _ in
            let unit = HKUnit.count().unitDivided(by: .minute())
            let average = statistics?.averageQuantity().map { Self.rounded($0.doubleValue(for: unit)) }
            let maximum = statistics?.maximumQuantity().map { Self.rounded($0.doubleValue(for: unit)) }
            completion(average, maximum)
        }
        healthStore.execute(query)
    }

    @available(iOS 18.0, *)
    private func queryWorkoutEffortScore(for workout: HKWorkout, effortType: HKQuantityType, completion: @escaping (Double?) -> Void) {
        let predicate = HKQuery.predicateForObjects(from: workout)
        let query = HKStatisticsQuery(quantityType: effortType, quantitySamplePredicate: predicate, options: [.discreteAverage]) { _, statistics, _ in
            let score = statistics?.averageQuantity().map { Self.rounded($0.doubleValue(for: .appleEffortScore())) }
            completion(score)
        }
        healthStore.execute(query)
    }

    private func queryHeartRateSamples(for workout: HKWorkout, heartType: HKQuantityType, completion: @escaping ([HeartRatePoint]) -> Void) {
        let predicate = HKQuery.predicateForObjects(from: workout)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: heartType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
            let unit = HKUnit.count().unitDivided(by: .minute())
            let points = (samples as? [HKQuantitySample] ?? []).map {
                HeartRatePoint(date: $0.startDate, bpm: Self.rounded($0.quantity.doubleValue(for: unit)))
            }
            completion(points)
        }
        healthStore.execute(query)
    }

    private func queryDistanceSamples(for workout: HKWorkout, distanceType: HKQuantityType, completion: @escaping ([DistancePoint]) -> Void) {
        let predicate = HKQuery.predicateForObjects(from: workout)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: distanceType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
            let points = (samples as? [HKQuantitySample] ?? []).map {
                DistancePoint(
                    startDate: $0.startDate,
                    endDate: $0.endDate,
                    meter: $0.quantity.doubleValue(for: .meter())
                )
            }
            completion(points)
        }
        healthStore.execute(query)
    }

    private func queryStepSamples(for workout: HKWorkout, stepType: HKQuantityType, completion: @escaping ([StepPoint]) -> Void) {
        // 케이던스는 step count 기반이다. 원시 표본(HKSampleQuery)을 그대로 합산하면
        // 시간상 겹치는 표본이 중복 계산되어 케이던스가 부풀려진다(평균 167→284, 버킷 폭주).
        // Apple Fitness와 동일하게 cumulativeSum 통계로 고정 구간 합을 구해 중복을 정리하고
        // 각 표본 count를 구간에 비례 분배한다. 5초 구간은 케이던스 버킷/랩 경계 오차를 무시할 수준으로 만든다.
        let predicate = HKQuery.predicateForObjects(from: workout)
        let interval = DateComponents(second: 5)
        let query = HKStatisticsCollectionQuery(
            quantityType: stepType,
            quantitySamplePredicate: predicate,
            options: .cumulativeSum,
            anchorDate: workout.startDate,
            intervalComponents: interval
        )
        query.initialResultsHandler = { _, results, _ in
            var points: [StepPoint] = []
            results?.enumerateStatistics(from: workout.startDate, to: workout.endDate) { statistics, _ in
                guard let sum = statistics.sumQuantity()?.doubleValue(for: .count()), sum > 0 else { return }
                points.append(
                    StepPoint(
                        startDate: statistics.startDate,
                        endDate: statistics.endDate,
                        count: sum
                    )
                )
            }
            completion(points)
        }
        healthStore.execute(query)
    }

    private func querySpeedSamples(for workout: HKWorkout, speedType: HKQuantityType, completion: @escaping ([SpeedPoint]) -> Void) {
        let predicate = HKQuery.predicateForObjects(from: workout)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: speedType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
            let unit = HKUnit.meter().unitDivided(by: .second())
            let points = (samples as? [HKQuantitySample] ?? []).compactMap { sample -> SpeedPoint? in
                let speed = sample.quantity.doubleValue(for: unit)
                guard speed.isFinite, speed > 0 else { return nil }
                return SpeedPoint(startDate: sample.startDate, endDate: sample.endDate, metersPerSecond: speed)
            }
            completion(points)
        }
        healthStore.execute(query)
    }


    private func queryRouteLocations(for workout: HKWorkout, completion: @escaping ([CLLocation]) -> Void) {
        let routeType = HKSeriesType.workoutRoute()
        let predicate = HKQuery.predicateForObjects(from: workout)
        let query = HKSampleQuery(sampleType: routeType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { [weak self] _, samples, _ in
            guard let self else {
                completion([])
                return
            }
            let routes = (samples as? [HKWorkoutRoute]) ?? []
            guard !routes.isEmpty else {
                completion([])
                return
            }

            let group = DispatchGroup()
            let lock = NSLock()
            var allLocations: [CLLocation] = []

            for route in routes {
                group.enter()
                self.collectLocations(from: route) { locations in
                    lock.lock()
                    allLocations.append(contentsOf: locations)
                    lock.unlock()
                    group.leave()
                }
            }

            group.notify(queue: .global()) {
                completion(allLocations.sorted { $0.timestamp < $1.timestamp })
            }
        }
        healthStore.execute(query)
    }

    private func collectLocations(from route: HKWorkoutRoute, completion: @escaping ([CLLocation]) -> Void) {
        var locations: [CLLocation] = []
        let query = HKWorkoutRouteQuery(route: route) { _, batch, done, _ in
            if let batch {
                locations.append(contentsOf: batch)
            }
            if done {
                completion(locations)
            }
        }
        healthStore.execute(query)
    }

    private func workoutWeather(from workout: HKWorkout) -> (temperature: Double?, humidity: Double?) {
        let metadata = workout.metadata ?? [:]
        let temperature = (metadata[HKMetadataKeyWeatherTemperature] as? HKQuantity)
            .map { Self.rounded($0.doubleValue(for: .degreeCelsius())) }
        let humidity = (metadata[HKMetadataKeyWeatherHumidity] as? HKQuantity)
            .map { Self.normalizedHumidity($0.doubleValue(for: .percent())) }
        return (temperature, humidity)
    }

    private func routeElevation(from locations: [CLLocation]) -> (gain: Double?, loss: Double?) {
        let validLocations = locations.filter { $0.verticalAccuracy >= 0 && $0.altitude.isFinite }
        guard validLocations.count >= 2 else { return (nil, nil) }

        var gain = 0.0
        var loss = 0.0
        var previous = validLocations[0]

        for location in validLocations.dropFirst() {
            let delta = location.altitude - previous.altitude
            previous = location
            guard abs(delta) >= 0.5, abs(delta) <= 80 else { continue }

            if delta > 0 {
                gain += delta
            } else {
                loss += abs(delta)
            }
        }

        return (Self.rounded(gain), Self.rounded(loss))
    }

    private func buildLaps(
        workout: HKWorkout,
        routeLocations: [CLLocation],
        distancePoints: [DistancePoint],
        heartRatePoints: [HeartRatePoint],
        stepPoints: [StepPoint],
        fallbackDistanceKm: Double?,
        fallbackDurationSec: Double
    ) -> [HealthKitLap] {
        if routeLocations.count >= 2 {
            return buildRouteLaps(locations: routeLocations, heartRatePoints: heartRatePoints, stepPoints: stepPoints)
        }

        if !distancePoints.isEmpty {
            return buildDistanceSampleLaps(distancePoints: distancePoints, heartRatePoints: heartRatePoints, stepPoints: stepPoints)
        }

        guard let fallbackDistanceKm, fallbackDistanceKm > 0 else { return [] }
        return [
            HealthKitLap(
                index: 1,
                distanceKm: Self.rounded(fallbackDistanceKm),
                paceSec: Self.rounded(fallbackDurationSec / fallbackDistanceKm),
                avgHeartRate: averageHeartRate(heartRatePoints, from: workout.startDate, to: workout.endDate),
                cadence: averageCadence(stepPoints, from: workout.startDate, to: workout.endDate)
            )
        ]
    }

    private func buildRouteLaps(locations: [CLLocation], heartRatePoints: [HeartRatePoint], stepPoints: [StepPoint]) -> [HealthKitLap] {
        var laps: [HealthKitLap] = []
        var lapIndex = 1
        var lapStartDate = locations.first?.timestamp
        var lapDistanceMeter = 0.0

        for index in 1..<locations.count {
            let previous = locations[index - 1]
            let current = locations[index]
            let segmentMeter = max(current.distance(from: previous), 0)
            lapDistanceMeter += segmentMeter

            if lapDistanceMeter >= 1000 {
                let start = lapStartDate ?? previous.timestamp
                let end = current.timestamp
                let duration = max(end.timeIntervalSince(start), 1)
                let distanceKm = lapDistanceMeter / 1000
                laps.append(
                    HealthKitLap(
                        index: lapIndex,
                        distanceKm: Self.rounded(distanceKm),
                        paceSec: Self.rounded(duration / distanceKm),
                        avgHeartRate: averageHeartRate(heartRatePoints, from: start, to: end),
                        cadence: averageCadence(stepPoints, from: start, to: end)
                    )
                )
                lapIndex += 1
                lapStartDate = current.timestamp
                lapDistanceMeter = 0
            }
        }

        if lapDistanceMeter >= 100, let start = lapStartDate, let end = locations.last?.timestamp {
            let duration = max(end.timeIntervalSince(start), 1)
            let distanceKm = lapDistanceMeter / 1000
            laps.append(
                HealthKitLap(
                    index: lapIndex,
                    distanceKm: Self.rounded(distanceKm),
                    paceSec: Self.rounded(duration / distanceKm),
                    avgHeartRate: averageHeartRate(heartRatePoints, from: start, to: end),
                    cadence: averageCadence(stepPoints, from: start, to: end)
                )
            )
        }

        return laps
    }

    private func buildDistanceSampleLaps(distancePoints: [DistancePoint], heartRatePoints: [HeartRatePoint], stepPoints: [StepPoint]) -> [HealthKitLap] {
        var laps: [HealthKitLap] = []
        var lapIndex = 1
        var lapStartDate = distancePoints.first?.startDate
        var lapEndDate = distancePoints.first?.endDate
        var lapDistanceMeter = 0.0

        for point in distancePoints {
            lapDistanceMeter += max(point.meter, 0)
            lapEndDate = point.endDate

            if lapDistanceMeter >= 1000, let start = lapStartDate, let end = lapEndDate {
                let duration = max(end.timeIntervalSince(start), 1)
                let distanceKm = lapDistanceMeter / 1000
                laps.append(
                    HealthKitLap(
                        index: lapIndex,
                        distanceKm: Self.rounded(distanceKm),
                        paceSec: Self.rounded(duration / distanceKm),
                        avgHeartRate: averageHeartRate(heartRatePoints, from: start, to: end),
                        cadence: averageCadence(stepPoints, from: start, to: end)
                    )
                )
                lapIndex += 1
                lapStartDate = point.endDate
                lapDistanceMeter = 0
            }
        }

        if lapDistanceMeter >= 100, let start = lapStartDate, let end = lapEndDate {
            let duration = max(end.timeIntervalSince(start), 1)
            let distanceKm = lapDistanceMeter / 1000
            laps.append(
                HealthKitLap(
                    index: lapIndex,
                    distanceKm: Self.rounded(distanceKm),
                    paceSec: Self.rounded(duration / distanceKm),
                    avgHeartRate: averageHeartRate(heartRatePoints, from: start, to: end),
                    cadence: averageCadence(stepPoints, from: start, to: end)
                )
            )
        }

        return laps
    }

    private func buildFastSegments(workout: HKWorkout, speedPoints: [SpeedPoint], routeLocations: [CLLocation]) -> [HealthKitFastSegment] {
        struct WorkingSegment {
            var startDate: Date
            var endDate: Date
            var distanceMeter: Double
            var durationSec: Double
            var bestPaceSec: Double
        }

        var segments: [HealthKitFastSegment] = []
        var current: WorkingSegment?
        let fastPaceThreshold = 345.0
        let gracePaceThreshold = 420.0
        let maxGraceDuration = 8.0
        let minimumFastSegmentDuration = 6.0
        let minimumFastSegmentDistanceMeter = 20.0

        func appendToCurrent(endDate: Date, distanceMeter: Double, duration: Double, paceSec: Double) {
            if var segment = current {
                segment.endDate = endDate
                segment.distanceMeter += distanceMeter
                segment.durationSec += duration
                segment.bestPaceSec = min(segment.bestPaceSec, paceSec)
                current = segment
            }
        }

        func closeCurrent() {
            guard let segment = current else { return }
            defer { current = nil }
            guard segment.durationSec >= minimumFastSegmentDuration, segment.distanceMeter >= minimumFastSegmentDistanceMeter else { return }
            let distanceKm = segment.distanceMeter / 1000
            guard distanceKm > 0 else { return }

            segments.append(
                HealthKitFastSegment(
                    index: segments.count + 1,
                    startSec: Self.rounded(max(segment.startDate.timeIntervalSince(workout.startDate), 0)),
                    durationSec: Self.rounded(segment.durationSec),
                    distanceKm: Self.rounded(distanceKm),
                    avgPaceSec: Self.rounded(segment.durationSec / distanceKm),
                    bestPaceSec: Self.rounded(segment.bestPaceSec)
                )
            )
        }

        func handleMotionSegment(startDate: Date, endDate: Date, distanceMeter: Double, duration: Double, paceSec: Double) {
            guard duration > 0, duration <= 30 else {
                closeCurrent()
                return
            }
            guard distanceMeter >= 5, paceSec.isFinite else { return }

            if paceSec <= fastPaceThreshold {
                if var segment = current {
                    segment.endDate = endDate
                    segment.distanceMeter += distanceMeter
                    segment.durationSec += duration
                    segment.bestPaceSec = min(segment.bestPaceSec, paceSec)
                    current = segment
                } else {
                    current = WorkingSegment(
                        startDate: startDate,
                        endDate: endDate,
                        distanceMeter: distanceMeter,
                        durationSec: duration,
                        bestPaceSec: paceSec
                    )
                }
            } else if current != nil && duration <= maxGraceDuration && paceSec <= gracePaceThreshold {
                appendToCurrent(
                    endDate: endDate,
                    distanceMeter: distanceMeter,
                    duration: duration,
                    paceSec: paceSec
                )
            } else {
                closeCurrent()
            }
        }

        if !speedPoints.isEmpty {
            for point in speedPoints {
                let duration = point.endDate.timeIntervalSince(point.startDate)
                let distanceMeter = point.metersPerSecond * duration
                let paceSec = 1000 / point.metersPerSecond
                handleMotionSegment(
                    startDate: point.startDate,
                    endDate: point.endDate,
                    distanceMeter: distanceMeter,
                    duration: duration,
                    paceSec: paceSec
                )
            }

            closeCurrent()
            if !segments.isEmpty {
                return Array(segments.prefix(12))
            }
            current = nil
        }

        guard routeLocations.count >= 2 else { return [] }

        for index in 1..<routeLocations.count {
            let previous = routeLocations[index - 1]
            let currentLocation = routeLocations[index]
            let duration = currentLocation.timestamp.timeIntervalSince(previous.timestamp)
            let distanceMeter = max(currentLocation.distance(from: previous), 0)
            let paceSec = distanceMeter > 0 ? duration / (distanceMeter / 1000) : Double.infinity
            handleMotionSegment(
                startDate: previous.timestamp,
                endDate: currentLocation.timestamp,
                distanceMeter: distanceMeter,
                duration: duration,
                paceSec: paceSec
            )
        }

        closeCurrent()
        return Array(segments.prefix(12))
    }

    private func buildMetricSamples(
        workout: HKWorkout,
        heartRatePoints: [HeartRatePoint],
        speedPoints: [SpeedPoint],
        stepPoints: [StepPoint],
        routeLocations: [CLLocation]
    ) -> [HealthKitMetricSample] {
        let durationSec = max(workout.endDate.timeIntervalSince(workout.startDate), 1)
        let bucketSec = max(15.0, ceil(durationSec / 80.0))
        let routeSpeedPoints = speedPoints.isEmpty ? buildRouteSpeedPoints(locations: routeLocations) : []
        let speedSource = speedPoints.isEmpty ? routeSpeedPoints : speedPoints
        var samples: [HealthKitMetricSample] = []
        var offset = 0.0

        while offset < durationSec {
            let start = workout.startDate.addingTimeInterval(offset)
            let end = workout.startDate.addingTimeInterval(min(offset + bucketSec, durationSec))
            let heartRate = averageHeartRate(heartRatePoints, from: start, to: end)
            let cadence = averageCadence(stepPoints, from: start, to: end)
            let pace = averagePace(speedSource, from: start, to: end)

            if heartRate != nil || pace != nil || cadence != nil {
                samples.append(
                    HealthKitMetricSample(
                        offsetSec: Self.rounded(offset),
                        heartRate: heartRate,
                        paceSec: pace,
                        cadence: cadence
                    )
                )
            }

            offset += bucketSec
        }

        return Array(samples.prefix(120))
    }

    private func buildRoutePoints(workout: HKWorkout, routeLocations: [CLLocation]) -> [HealthKitRoutePoint] {
        guard !routeLocations.isEmpty else { return [] }
        let sorted = routeLocations.sorted { $0.timestamp < $1.timestamp }
        let sampled = downsampleLocations(sorted, maxCount: 240)
        return sampled.map { location in
            HealthKitRoutePoint(
                offsetSec: Self.rounded(max(location.timestamp.timeIntervalSince(workout.startDate), 0)),
                latitude: location.coordinate.latitude,
                longitude: location.coordinate.longitude,
                altitude: location.verticalAccuracy >= 0 ? Self.rounded(location.altitude) : nil
            )
        }
    }

    private func downsampleLocations(_ locations: [CLLocation], maxCount: Int) -> [CLLocation] {
        guard locations.count > maxCount, maxCount > 2 else { return locations }
        let stride = Int(ceil(Double(locations.count) / Double(maxCount)))
        var sampled = locations.enumerated().compactMap { index, location in
            index % stride == 0 ? location : nil
        }
        if let last = locations.last, sampled.last?.timestamp != last.timestamp {
            sampled.append(last)
        }
        return sampled
    }

    private func buildRouteSpeedPoints(locations: [CLLocation]) -> [SpeedPoint] {
        guard locations.count >= 2 else { return [] }
        var points: [SpeedPoint] = []

        for index in 1..<locations.count {
            let previous = locations[index - 1]
            let current = locations[index]
            let duration = current.timestamp.timeIntervalSince(previous.timestamp)
            guard duration > 0, duration <= 30 else { continue }
            let distanceMeter = max(current.distance(from: previous), 0)
            guard distanceMeter >= 2 else { continue }
            let speed = distanceMeter / duration
            guard speed.isFinite, speed > 0 else { continue }
            points.append(SpeedPoint(startDate: previous.timestamp, endDate: current.timestamp, metersPerSecond: speed))
        }

        return points
    }

    private func averagePace(_ points: [SpeedPoint], from start: Date, to end: Date) -> Double? {
        let values = points
            .filter { $0.endDate >= start && $0.startDate <= end }
            .map(\.metersPerSecond)
            .filter { $0.isFinite && $0 > 0 }
        guard !values.isEmpty else { return nil }
        let speed = values.reduce(0, +) / Double(values.count)
        return Self.rounded(1000 / speed)
    }

    private func averageHeartRate(_ points: [HeartRatePoint], from start: Date, to end: Date) -> Double? {
        let values = points.filter { $0.date >= start && $0.date <= end }.map(\.bpm)
        guard !values.isEmpty else { return nil }
        return Self.rounded(values.reduce(0, +) / Double(values.count))
    }

    private func averageCadence(_ points: [StepPoint], from start: Date, to end: Date) -> Double? {
        let durationMin = end.timeIntervalSince(start) / 60
        guard durationMin > 0 else { return nil }
        // 각 step 구간이 [start, end]와 겹치는 비율만큼만 더한다.
        // (구간보다 긴 표본의 count를 전량 더해 짧은 분모로 나누던 폭주 버그 방지)
        let totalSteps = points.reduce(0.0) { partial, point in
            let overlapStart = max(point.startDate, start)
            let overlapEnd = min(point.endDate, end)
            let overlap = overlapEnd.timeIntervalSince(overlapStart)
            guard overlap > 0 else { return partial }
            let sampleDuration = point.endDate.timeIntervalSince(point.startDate)
            let fraction = sampleDuration > 0 ? overlap / sampleDuration : 1
            return partial + max(point.count, 0) * fraction
        }
        guard totalSteps > 0 else { return nil }
        return Self.rounded(totalSteps / durationMin)
    }

    private func rounded(_ value: Double) -> Double {
        Self.rounded(value)
    }

    private static func rounded(_ value: Double) -> Double {
        (value * 100).rounded() / 100
    }

    private static func normalizedHumidity(_ value: Double) -> Double {
        let percent = value <= 1 ? value * 100 : value
        return rounded(percent)
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}

enum HealthKitImportError: LocalizedError {
    case healthDataUnavailable
    case authorizationDenied
    case invalidExternalId
    case invalidDateRange
    case workoutNotFound

    var errorDescription: String? {
        switch self {
        case .healthDataUnavailable:
            return "이 기기에서 HealthKit을 사용할 수 없습니다."
        case .authorizationDenied:
            return "HealthKit 권한이 허용되지 않았습니다."
        case .invalidExternalId:
            return "HealthKit 원본 ID 형식이 올바르지 않습니다."
        case .invalidDateRange:
            return "HealthKit 조회 날짜 범위가 올바르지 않습니다."
        case .workoutNotFound:
            return "HealthKit에서 해당 러닝 세션을 찾지 못했습니다."
        }
    }
}
