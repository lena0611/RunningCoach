//
//  GhostRaceEngine.swift
//  RaceCore
//
//  #229 가상레이싱 `나와의 대결` 백그라운드 비교 엔진.
//  ⚠️ 이 파일은 웹 순수 로직 `src/shared/lib/selfRace/ghost.ts`(#230, canonical spec)의
//     **네이티브 포팅**이다. 부호·보간·역전·dedupe·문구 규칙이 ghost.ts와 어긋나면 안 된다.
//     ghost.ts 변경 시 이 파일을 함께 갱신한다(`ghost.test.ts` ↔ RaceCoreTests 가 양측 회귀 기준).
//     이 엔진은 웹·iOS 앱·watchOS 앱이 공유한다(3-소비자 미러). RaceCore 패키지로 분리되어
//     iOS/watchOS 양 타겟이 링크한다. → `.harness/project/data-change-impact-map.md` self-race 항목도 함께 갱신.
//
//  곡선 좌표계: points 는 출발선부터의 누적거리(distanceM) ↔ 경과시간(elapsedSec) 쌍이며,
//  둘 다 단조증가하고 {0,0} 에서 시작한다.
//
//  부호 약속(중요):
//    - timeGapSec  : 음수 = 내가 고스트보다 앞섬(같은 거리를 더 빨리 도달), 양수 = 뒤짐.
//    - distanceGapM: 양수 = 내가 고스트보다 앞섬(같은 시각에 더 멀리), 음수 = 뒤짐.
//

import Foundation

// ── 타입 (ghost.ts 미러) ──────────────────────────────────────────────────────

public struct GhostCurvePoint {
    public let distanceM: Double
    public let elapsedSec: Double
    public init(distanceM: Double, elapsedSec: Double) {
        self.distanceM = distanceM
        self.elapsedSec = elapsedSec
    }
}

public struct GhostCurve {
    public let points: [GhostCurvePoint]
    public init(points: [GhostCurvePoint]) {
        self.points = points
    }
}

public struct LiveTick {
    public let cumulativeDistanceM: Double
    public let elapsedSec: Double
    public init(cumulativeDistanceM: Double, elapsedSec: Double) {
        self.cumulativeDistanceM = cumulativeDistanceM
        self.elapsedSec = elapsedSec
    }
}

public enum LeadState: String {
    case ahead
    case behind
    case even
}

public struct GapState {
    public let timeGapSec: Double
    public let distanceGapM: Double
    public let leadState: LeadState
    public init(timeGapSec: Double, distanceGapM: Double, leadState: LeadState) {
        self.timeGapSec = timeGapSec
        self.distanceGapM = distanceGapM
        self.leadState = leadState
    }
}

public enum AnnouncementKind: String {
    case periodic
    case lap
    case reversal
    case finish
    /// 고스트 없는(타겟 '없음') 측정 전용 진척 안내. ghost.ts엔 없는 네이티브 전용 종류.
    case progress
}

public enum ReversalKind: String {
    case overtake
    case overtaken
}

/// 고스트 격차 표현 단위(ghost.ts GapDisplayMode 미러). 사용자가 음성 설정에서 고른다.
public enum GapDisplayMode: String {
    case distance
    case time
}

public struct Announcement {
    public let text: String
    public let priority: Int
    public let dedupeKey: String
    public init(text: String, priority: Int, dedupeKey: String) {
        self.text = text
        self.priority = priority
        self.dedupeKey = dedupeKey
    }
}

// ── 비교/문구 순수 함수 (ghost.ts 미러) ───────────────────────────────────────

public enum GhostMath {
    /// leadState 가 'even' 으로 판정되는 시간차 한계(초). (ghost.ts EVEN_EPSILON_SEC)
    public static let evenEpsilonSec: Double = 1

    /// 고스트가 누적거리 distanceM 에 도달한 시각(초). 범위 밖이면 끝점 클램프.
    public static func timeAtDistance(_ curve: GhostCurve, _ distanceM: Double) -> Double {
        interpolate(curve.points, key: distanceM, keyAxis: \.distanceM, valueAxis: \.elapsedSec)
    }

    /// 고스트가 elapsedSec 시점에 도달한 누적거리(m). 범위 밖이면 끝점 클램프.
    public static func distanceAtTime(_ curve: GhostCurve, _ elapsedSec: Double) -> Double {
        interpolate(curve.points, key: elapsedSec, keyAxis: \.elapsedSec, valueAxis: \.distanceM)
    }

    private static func interpolate(
        _ points: [GhostCurvePoint],
        key: Double,
        keyAxis: KeyPath<GhostCurvePoint, Double>,
        valueAxis: KeyPath<GhostCurvePoint, Double>
    ) -> Double {
        guard let first = points.first, let last = points.last else { return 0 }
        if key <= first[keyPath: keyAxis] { return first[keyPath: valueAxis] }
        if key >= last[keyPath: keyAxis] { return last[keyPath: valueAxis] }
        for i in 1..<points.count {
            let a = points[i - 1]
            let b = points[i]
            if key <= b[keyPath: keyAxis] {
                let span = b[keyPath: keyAxis] - a[keyPath: keyAxis]
                if span <= 0 { return a[keyPath: valueAxis] }
                let ratio = (key - a[keyPath: keyAxis]) / span
                return a[keyPath: valueAxis] + ratio * (b[keyPath: valueAxis] - a[keyPath: valueAxis])
            }
        }
        return last[keyPath: valueAxis]
    }

    /// 현재 라이브 틱과 고스트 곡선을 비교해 시간차/거리차/우열을 낸다.
    public static func computeGap(_ curve: GhostCurve, _ tick: LiveTick) -> GapState {
        let ghostTimeAtMyDistance = timeAtDistance(curve, tick.cumulativeDistanceM)
        let ghostDistanceAtMyTime = distanceAtTime(curve, tick.elapsedSec)
        let timeGapSec = tick.elapsedSec - ghostTimeAtMyDistance
        let distanceGapM = tick.cumulativeDistanceM - ghostDistanceAtMyTime
        let leadState: LeadState = timeGapSec < -evenEpsilonSec ? .ahead
            : timeGapSec > evenEpsilonSec ? .behind
            : .even
        return GapState(timeGapSec: timeGapSec, distanceGapM: distanceGapM, leadState: leadState)
    }

    /// 역전을 1회성으로 감지한다. 추월(뒤지다 앞섬)=overtake, 역추월(앞서다 뒤짐)=overtaken.
    public static func detectReversal(prev: GapState?, next: GapState) -> ReversalKind? {
        guard let prev else { return nil }
        if prev.leadState != .ahead, next.leadState == .ahead { return .overtake }
        if prev.leadState != .behind, next.leadState == .behind { return .overtaken }
        return nil
    }

    // ── 안내 문구 (ghost.ts formatAnnouncement 미러) ─────────────────────────

    static let priority: [AnnouncementKind: Int] = [
        .progress: 1, .periodic: 1, .lap: 2, .reversal: 3, .finish: 4
    ]

    /// 절대 초를 한국어로. 60초 미만 'N초', 이상 'M분 S초'(S=0이면 'M분').
    public static func formatGapSeconds(_ seconds: Double) -> String {
        let s = Int(abs(seconds).rounded())
        if s < 60 { return "\(s)초" }
        let m = s / 60
        let rest = s % 60
        return rest != 0 ? "\(m)분 \(rest)초" : "\(m)분"
    }

    public static func kmLabel(_ distanceM: Double) -> String {
        let km = distanceM / 1000
        if km == km.rounded() { return "\(Int(km))km" }
        return String(format: "%.1fkm", km)
    }

    /// 고스트와의 거리 격차를 한국어로. 1km 미만 'Nm', 이상 'X.Xkm'. (ghost.ts formatGapDistance 미러)
    public static func formatGapDistance(_ distanceGapM: Double) -> String {
        let m = Int(abs(distanceGapM).rounded())
        if m < 1000 { return "\(m)m" }
        return String(format: "%.1fkm", Double(m) / 1000)
    }

    /// 격차 표현 단위(거리/시간)에 맞춰 양을 한국어로. (ghost.ts formatGapAmount 미러)
    public static func formatGapAmount(_ gap: GapState, _ mode: GapDisplayMode) -> String {
        mode == .time ? formatGapSeconds(gap.timeGapSec) : formatGapDistance(gap.distanceGapM)
    }

    private static func gapClause(_ gap: GapState, _ mode: GapDisplayMode) -> String {
        if gap.leadState == .even { return "고스트와 거의 나란히" }
        let amount = formatGapAmount(gap, mode)
        return gap.leadState == .ahead ? "고스트보다 \(amount) 앞서는 중" : "고스트보다 \(amount) 뒤지는 중"
    }

    /// 한국어 한 문장 안내 + 우선순위 + dedupeKey. (ghost.ts formatAnnouncement)
    public static func formatAnnouncement(
        _ kind: AnnouncementKind,
        gap: GapState?,
        distanceM: Double = 0,
        elapsedSec: Double = 0,
        reversal: ReversalKind? = nil,
        periodicStep: Int? = nil,
        gapMode: GapDisplayMode = .distance
    ) -> Announcement {
        let kmBucket = Int(floor(distanceM / 1000))
        switch kind {
        case .periodic:
            let g = gap ?? GapState(timeGapSec: 0, distanceGapM: 0, leadState: .even)
            let text: String
            switch g.leadState {
            case .even: text = "고스트와 거의 나란히 달리고 있어요."
            case .ahead: text = "고스트보다 \(formatGapAmount(g, gapMode)) 앞서고 있어요."
            case .behind: text = "고스트보다 \(formatGapAmount(g, gapMode)) 뒤처졌어요."
            }
            return Announcement(text: text, priority: priority[.periodic]!, dedupeKey: "periodic:\(periodicStep ?? kmBucket)")
        case .lap:
            let g = gap ?? GapState(timeGapSec: 0, distanceGapM: 0, leadState: .even)
            return Announcement(
                text: "\(kmLabel(distanceM)) 통과 — \(gapClause(g, gapMode)).",
                priority: priority[.lap]!,
                dedupeKey: "lap:\(Int((distanceM / 1000).rounded()))"
            )
        case .reversal:
            let g = gap ?? GapState(timeGapSec: 0, distanceGapM: 0, leadState: .even)
            let type = reversal ?? (g.leadState == .ahead ? ReversalKind.overtake : .overtaken)
            let text = type == .overtake
                ? "고스트를 제쳤어요! 지금부터가 진짜예요."
                : "고스트에게 따라잡혔어요. 다시 붙어봐요."
            return Announcement(text: text, priority: priority[.reversal]!, dedupeKey: "reversal:\(type.rawValue):\(kmBucket)")
        case .finish:
            let g = gap ?? GapState(timeGapSec: 0, distanceGapM: 0, leadState: .even)
            let amount = formatGapAmount(g, gapMode)
            let text: String
            if g.leadState == .even {
                text = "완주! 고스트와 거의 동시에 들어왔어요."
            } else if gapMode == .time {
                text = g.leadState == .ahead ? "완주! 고스트보다 \(amount) 빨랐어요." : "완주! 고스트보다 \(amount) 늦었어요."
            } else {
                text = g.leadState == .ahead ? "완주! 고스트보다 \(amount) 앞서 들어왔어요." : "완주! 고스트보다 \(amount) 뒤처져 들어왔어요."
            }
            return Announcement(text: text, priority: priority[.finish]!, dedupeKey: "finish")
        case .progress:
            // 고스트 없는 측정 전용(네이티브 전용). 거리/경과 진척만 알린다.
            let km = distanceM / 1000
            let minutes = Int((elapsedSec / 60).rounded())
            let text = String(format: "%.1f킬로미터, %d분 경과.", km, minutes)
            return Announcement(text: text, priority: priority[.progress]!, dedupeKey: "progress:\(kmBucket):\(minutes)")
        }
    }
}

// ── 발화 주기 설정 ────────────────────────────────────────────────────────────

/// announceConfig.periodic.kind (web→native runContextLiveRun)
public enum PeriodicKind: String {
    case distance
    case time
    case silent
}

public struct AnnounceConfig {
    public let periodicKind: PeriodicKind
    public let stepM: Double      // periodicKind == .distance 일 때 사용
    public let stepSec: Double    // periodicKind == .time 일 때 사용
    public let reversalAlert: Bool
    public let gapMode: GapDisplayMode

    public init(periodicKind: PeriodicKind, stepM: Double, stepSec: Double, reversalAlert: Bool, gapMode: GapDisplayMode) {
        self.periodicKind = periodicKind
        self.stepM = stepM
        self.stepSec = stepSec
        self.reversalAlert = reversalAlert
        self.gapMode = gapMode
    }

    public static let `default` = AnnounceConfig(periodicKind: .distance, stepM: 1000, stepSec: 60, reversalAlert: true, gapMode: .distance)

    /// web payload(`{periodic:{kind,stepM?,stepSec?}, reversalAlert, gapMode}`)에서 파싱.
    public static func parse(_ raw: [String: Any]?) -> AnnounceConfig {
        guard let raw else { return .default }
        let periodic = raw["periodic"] as? [String: Any] ?? [:]
        let kind = PeriodicKind(rawValue: periodic["kind"] as? String ?? "") ?? .distance
        let stepM = (periodic["stepM"] as? NSNumber)?.doubleValue ?? 1000
        let stepSec = (periodic["stepSec"] as? NSNumber)?.doubleValue ?? 60
        let reversalAlert = raw["reversalAlert"] as? Bool ?? true
        let gapMode = GapDisplayMode(rawValue: raw["gapMode"] as? String ?? "") ?? .distance
        return AnnounceConfig(
            periodicKind: kind,
            stepM: stepM > 0 ? stepM : 1000,
            stepSec: stepSec > 0 ? stepSec : 60,
            reversalAlert: reversalAlert,
            gapMode: gapMode
        )
    }
}

// ── 엔진 (틱 → gap/역전/발화 주기 판정, 백그라운드 동작) ─────────────────────────

/// 주입된 고스트 곡선과 설정으로 매 틱마다 gap·역전·주기 발화를 판정한다.
/// 비교 계산은 순수(GhostMath). 엔진은 발화 트리거 상태(이전 gap, 마지막 주기 step)를 보유한다.
public final class GhostRaceEngine {
    private let curve: GhostCurve?      // nil = 타겟 '없음'(측정만, gap 비교 생략)
    private let config: AnnounceConfig
    private var prevGap: GapState?
    private var lastPeriodicStep = 0    // 0 = 아직 첫 step 미통과
    private var finished = false
    /// 시작 직후 grace(초): 이 시간 전엔 역전 안내를 억제한다(시작 멘트와 겹침·즉시 "추월당함" 방지).
    private let reversalGraceSec: Double = 8

    public init(curve: GhostCurve?, config: AnnounceConfig) {
        self.curve = curve
        self.config = config
    }

    public var hasGhost: Bool { curve != nil }

    /// 매 틱 처리. (gap, [발화]) 반환. gap 은 포그라운드 UI 전송용(고스트 없으면 nil).
    public func process(_ tick: LiveTick) -> (gap: GapState?, announcements: [Announcement]) {
        if finished { return (nil, []) }
        var out: [Announcement] = []

        var gap: GapState?
        if let curve {
            let g = GhostMath.computeGap(curve, tick)
            // 역전 발화 (gap 비교가 있을 때만). 시작 직후 grace 동안엔 억제(시작 멘트와 겹침 방지).
            if config.reversalAlert, tick.elapsedSec >= reversalGraceSec,
               let rev = GhostMath.detectReversal(prev: prevGap, next: g) {
                out.append(GhostMath.formatAnnouncement(.reversal, gap: g, distanceM: tick.cumulativeDistanceM, reversal: rev, gapMode: config.gapMode))
            }
            prevGap = g
            gap = g
        }

        // 주기 발화 판정
        switch config.periodicKind {
        case .distance:
            let step = Int(floor(tick.cumulativeDistanceM / config.stepM))
            if step > lastPeriodicStep {
                lastPeriodicStep = step
                out.append(periodicAnnouncement(at: tick, gap: gap, step: step))
            }
        case .time:
            let step = Int(floor(tick.elapsedSec / config.stepSec))
            if step > lastPeriodicStep {
                lastPeriodicStep = step
                out.append(periodicAnnouncement(at: tick, gap: gap, step: step))
            }
        case .silent:
            break
        }

        return (gap, out)
    }

    /// 완주 안내. stopLiveRun 시 1회 호출. 고스트 있으면 최종 gap 비교, 없으면 progress.
    public func finish(_ tick: LiveTick) -> Announcement? {
        if finished { return nil }
        finished = true
        if let curve {
            let g = GhostMath.computeGap(curve, tick)
            return GhostMath.formatAnnouncement(.finish, gap: g, distanceM: tick.cumulativeDistanceM, gapMode: config.gapMode)
        }
        return nil
    }

    private func periodicAnnouncement(at tick: LiveTick, gap: GapState?, step: Int) -> Announcement {
        guard gap != nil else {
            return GhostMath.formatAnnouncement(.progress, gap: nil, distanceM: tick.cumulativeDistanceM, elapsedSec: tick.elapsedSec)
        }
        if config.periodicKind == .distance, config.stepM.truncatingRemainder(dividingBy: 1000) == 0 {
            return GhostMath.formatAnnouncement(.lap, gap: gap, distanceM: tick.cumulativeDistanceM, gapMode: config.gapMode)
        }
        return GhostMath.formatAnnouncement(.periodic, gap: gap, distanceM: tick.cumulativeDistanceM, periodicStep: step, gapMode: config.gapMode)
    }
}
