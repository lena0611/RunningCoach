//
//  GhostRaceEngineTests.swift
//  RaceCoreTests
//
//  웹 `src/shared/lib/selfRace/ghost.test.ts`의 미러. GhostRaceEngine(네이티브 포팅)이
//  ghost.ts와 부호·보간·역전·dedupe·문구 규칙에서 어긋나지 않는지 회귀로 잠근다.
//  (buildGhostCurve 는 웹 전용이라 여기선 곡선을 직접 구성해 질의만 검증한다.)
//

import XCTest
import RaceCore

final class GhostRaceEngineTests: XCTestCase {
    // 등속 10km / 3000s (ghost.ts evenSamples 곡선과 동일: 5km=1500s 선형)
    private let curve = GhostCurve(points: [
        GhostCurvePoint(distanceM: 0, elapsedSec: 0),
        GhostCurvePoint(distanceM: 10000, elapsedSec: 3000)
    ])

    // ghost.test.ts gap() 헬퍼 미러: distanceGapM = -timeGapSec.
    private func gap(_ leadState: LeadState, _ timeGapSec: Double = 0) -> GapState {
        GapState(timeGapSec: timeGapSec, distanceGapM: -timeGapSec, leadState: leadState)
    }

    // ── curve queries (boundary/clamp) ──
    func testCurveQueriesBoundaryAndClamp() {
        XCTAssertEqual(GhostMath.timeAtDistance(curve, 0), 0, accuracy: 0.001)
        XCTAssertEqual(GhostMath.timeAtDistance(curve, -100), 0, accuracy: 0.001)
        XCTAssertEqual(GhostMath.timeAtDistance(curve, 5000), 1500, accuracy: 0.1)
        XCTAssertEqual(GhostMath.timeAtDistance(curve, 10000), 3000, accuracy: 0.1)
        XCTAssertEqual(GhostMath.timeAtDistance(curve, 99999), 3000, accuracy: 0.1) // 클램프
        XCTAssertEqual(GhostMath.distanceAtTime(curve, 0), 0, accuracy: 0.001)
        XCTAssertEqual(GhostMath.distanceAtTime(curve, 99999), 10000, accuracy: 0.1)
    }

    // ── computeGap (ahead/behind/even) ──
    func testComputeGap() {
        let ahead = GhostMath.computeGap(curve, LiveTick(cumulativeDistanceM: 5000, elapsedSec: 1400))
        XCTAssertEqual(ahead.timeGapSec, -100, accuracy: 0.1)
        XCTAssertGreaterThan(ahead.distanceGapM, 0)
        XCTAssertEqual(ahead.leadState, .ahead)

        let behind = GhostMath.computeGap(curve, LiveTick(cumulativeDistanceM: 5000, elapsedSec: 1600))
        XCTAssertEqual(behind.timeGapSec, 100, accuracy: 0.1)
        XCTAssertEqual(behind.leadState, .behind)

        XCTAssertEqual(GhostMath.computeGap(curve, LiveTick(cumulativeDistanceM: 5000, elapsedSec: 1500)).leadState, .even)
    }

    // ── detectReversal (one-shot) ──
    func testDetectReversalOneShot() {
        XCTAssertEqual(GhostMath.detectReversal(prev: gap(.behind, 50), next: gap(.ahead, -50)), .overtake)
        XCTAssertEqual(GhostMath.detectReversal(prev: gap(.even), next: gap(.ahead, -50)), .overtake)
        XCTAssertEqual(GhostMath.detectReversal(prev: gap(.ahead, -50), next: gap(.behind, 50)), .overtaken)
        XCTAssertNil(GhostMath.detectReversal(prev: gap(.ahead, -50), next: gap(.ahead, -30)))
        XCTAssertNil(GhostMath.detectReversal(prev: gap(.behind, 50), next: gap(.behind, 80)))
        XCTAssertNil(GhostMath.detectReversal(prev: nil, next: gap(.ahead, -10)))
    }

    // ── formatAnnouncement: dedupeKey ──
    func testAnnouncementDedupeKeys() {
        let a = GhostMath.formatAnnouncement(.lap, gap: gap(.ahead, -12), distanceM: 5000)
        let b = GhostMath.formatAnnouncement(.lap, gap: gap(.ahead, -8), distanceM: 5012)
        XCTAssertEqual(a.dedupeKey, "lap:5")
        XCTAssertEqual(b.dedupeKey, "lap:5") // 같은 5km 재진입 → 같은 키
        XCTAssertTrue(a.text.contains("5km"))
        XCTAssertTrue(a.text.contains("앞서"))

        // 시간 주기: 같은 km 안 여러 멘트를 step 으로 dedupe (2번째부터 무음 드롭 방지)
        let m1 = GhostMath.formatAnnouncement(.periodic, gap: gap(.behind, 20), distanceM: 120, periodicStep: 1)
        let m2 = GhostMath.formatAnnouncement(.periodic, gap: gap(.behind, 30), distanceM: 240, periodicStep: 2)
        XCTAssertEqual(m1.dedupeKey, "periodic:1")
        XCTAssertEqual(m2.dedupeKey, "periodic:2")
        XCTAssertNotEqual(m1.dedupeKey, m2.dedupeKey)

        // periodicStep 없으면 km 버킷 폴백
        XCTAssertEqual(GhostMath.formatAnnouncement(.periodic, gap: gap(.behind, 20), distanceM: 3000).dedupeKey, "periodic:3")
    }

    // ── formatAnnouncement: priority finish > reversal > lap > periodic ──
    func testAnnouncementPriorityOrder() {
        let periodic = GhostMath.formatAnnouncement(.periodic, gap: gap(.behind, 20), distanceM: 3000)
        let lap = GhostMath.formatAnnouncement(.lap, gap: gap(.behind, 20), distanceM: 3000)
        let reversal = GhostMath.formatAnnouncement(.reversal, gap: gap(.ahead, -5), distanceM: 3000, reversal: .overtake)
        let finish = GhostMath.formatAnnouncement(.finish, gap: gap(.ahead, -5))
        XCTAssertLessThan(periodic.priority, lap.priority)
        XCTAssertLessThan(lap.priority, reversal.priority)
        XCTAssertLessThan(reversal.priority, finish.priority)
    }

    // ── formatAnnouncement: text + gapMode (distance vs time) ──
    func testAnnouncementTextAndGapMode() {
        XCTAssertTrue(GhostMath.formatAnnouncement(.reversal, gap: gap(.ahead, -5), reversal: .overtake).text.contains("제쳤"))
        XCTAssertTrue(GhostMath.formatAnnouncement(.reversal, gap: gap(.behind, 5), reversal: .overtaken).text.contains("따라잡"))
        XCTAssertTrue(GhostMath.formatAnnouncement(.finish, gap: gap(.ahead, -75), gapMode: .time).text.contains("1분 15초"))
        XCTAssertTrue(GhostMath.formatAnnouncement(.periodic, gap: gap(.even), distanceM: 2000).text.contains("나란히"))

        // distanceGapM = -timeGapSec. behind 20 → 뒤 20m / 뒤 20초.
        let g = gap(.behind, 20)
        XCTAssertTrue(GhostMath.formatAnnouncement(.periodic, gap: g, distanceM: 500, gapMode: .distance).text.contains("20m"))
        XCTAssertTrue(GhostMath.formatAnnouncement(.periodic, gap: g, distanceM: 500, gapMode: .distance).text.contains("뒤처졌"))
        XCTAssertTrue(GhostMath.formatAnnouncement(.periodic, gap: g, distanceM: 500, gapMode: .time).text.contains("20초"))
        // 기본값은 distance
        XCTAssertTrue(GhostMath.formatAnnouncement(.periodic, gap: g, distanceM: 500).text.contains("20m"))
        // finish 도 모드를 따른다
        XCTAssertTrue(GhostMath.formatAnnouncement(.finish, gap: gap(.ahead, -50), gapMode: .distance).text.contains("50m"))
        XCTAssertTrue(GhostMath.formatAnnouncement(.finish, gap: gap(.ahead, -50), gapMode: .distance).text.contains("앞서 들어왔"))
    }

    // ── formatAnnouncement: lap 페이스 절 (ghost.test.ts 미러 + TT 확장) ──
    func testLapPaceClause() {
        // 페이스 주입 시: "3km 통과 — 페이스 6분 15초, 고스트보다 12m 앞서는 중."
        let withPace = GhostMath.formatAnnouncement(.lap, gap: gap(.ahead, -12), distanceM: 3000, paceSecPerKm: 375)
        XCTAssertEqual(withPace.text, "3km 통과 — 페이스 6분 15초, 고스트보다 12m 앞서는 중.")
        // 페이스 미주입(하위호환): 기존 문구 그대로.
        let withoutPace = GhostMath.formatAnnouncement(.lap, gap: gap(.ahead, -12), distanceM: 3000)
        XCTAssertEqual(withoutPace.text, "3km 통과 — 고스트보다 12m 앞서는 중.")
        // TT(무고스트): 격차 절 없이 페이스까지만.
        let tt = GhostMath.formatAnnouncement(.lap, gap: nil, distanceM: 3000, paceSecPerKm: 375)
        XCTAssertEqual(tt.text, "3km 통과 — 페이스 6분 15초.")
    }

    // ── 엔진: km 통과마다 직전 구간 페이스로 lap 발화 (고스트/TT 공통) ──
    func testEngineLapAnnouncesSegmentPace() {
        // 고스트 대결: 1km=375s, 2km 구간=390s → 각각 "6분 15초", "6분 30초".
        let engine = GhostRaceEngine(curve: curve, config: .default)
        let first = engine.process(LiveTick(cumulativeDistanceM: 1000, elapsedSec: 375))
        let firstLap = first.announcements.first { $0.dedupeKey == "lap:1" }
        XCTAssertNotNil(firstLap)
        XCTAssertTrue(firstLap!.text.contains("페이스 6분 15초"))
        XCTAssertTrue(firstLap!.text.contains("고스트보다"))

        let second = engine.process(LiveTick(cumulativeDistanceM: 2000, elapsedSec: 765))
        let secondLap = second.announcements.first { $0.dedupeKey == "lap:2" }
        XCTAssertNotNil(secondLap)
        XCTAssertTrue(secondLap!.text.contains("페이스 6분 30초"))

        // TT(커브 없음): km 통과가 progress 가 아닌 lap(페이스만) 형식이어야 한다.
        let ttEngine = GhostRaceEngine(curve: nil, config: .default)
        let tt = ttEngine.process(LiveTick(cumulativeDistanceM: 1000, elapsedSec: 375))
        let ttLap = tt.announcements.first { $0.dedupeKey == "lap:1" }
        XCTAssertNotNil(ttLap)
        XCTAssertEqual(ttLap!.text, "1km 통과 — 페이스 6분 15초.")
        XCTAssertFalse(ttLap!.text.contains("고스트"))
    }

    // ── 엔진: 시작 직후 grace 동안 역전 억제 + 완주 1회성 ──
    func testEngineReversalGraceAndFinishOnce() {
        let engine = GhostRaceEngine(curve: curve, config: .default)
        // t=2s(<grace 8s)에 앞서더라도 역전 발화가 나오면 안 된다(시작 멘트 겹침 방지).
        let early = engine.process(LiveTick(cumulativeDistanceM: 200, elapsedSec: 2))
        XCTAssertFalse(early.announcements.contains { $0.dedupeKey.hasPrefix("reversal") })

        // 완주는 1회만.
        let first = engine.finish(LiveTick(cumulativeDistanceM: 10000, elapsedSec: 2900))
        XCTAssertNotNil(first)
        XCTAssertNil(engine.finish(LiveTick(cumulativeDistanceM: 10000, elapsedSec: 2900)))
    }
}
