//
//  WatchSyncManager.swift
//  PaceLabWatch Watch App — #552 Phase 3
//
//  워치 쪽 WCSession 클라이언트. 폰 PhoneWatchRelay.swift / 웹 watchRaceBridge.ts 와 미러 계약.
//  - 하강: applicationContext 로 온 고스트 카탈로그를 영속(UserDefaults)·발행 —
//    폰을 집에 두고 나가도 마지막 동기화된 카탈로그로 거리·상대를 고를 수 있다.
//  - 상승: 완주 결과를 transferUserInfo 로 큐잉 — 시스템이 영속·재전달을 보장하므로
//    레이스 시점에 폰이 없어도 재연결 시 도착한다.
//

import Foundation
import Combine
import WatchConnectivity

@MainActor
final class WatchSyncManager: NSObject, ObservableObject {

    // ── 카탈로그 모델 (웹 WatchRaceCatalogPayload 미러) ──────────────────────
    struct Catalog: Codable {
        struct Point: Codable {
            let distanceM: Double
            let elapsedSec: Double
        }
        struct Best: Codable {
            let elapsedSec: Double
            let avgPaceSec: Double
            let date: String
            let sourceRunId: String
            let curvePoints: [Point]
        }
        struct Entry: Codable {
            let distanceM: Double
            let label: String
            let best: Best?
        }
        struct Periodic: Codable {
            let kind: String
            let stepM: Double?
            let stepSec: Double?
        }
        struct Announce: Codable {
            let periodic: Periodic
            let reversalAlert: Bool
            let gapMode: String
        }
        struct Selection: Codable {
            let distanceM: Double?
            let opponentKind: String
        }
        let generatedAt: String
        let announceConfig: Announce
        let lastSelection: Selection
        let entries: [Entry]
    }

    /// 마지막으로 동기화(또는 부팅 시 복원)된 카탈로그. nil = 아직 폰과 한 번도 동기화 전.
    @Published private(set) var catalog: Catalog?

    private static let catalogKey = "pacelab.watchRaceCatalog"

    override init() {
        super.init()
        catalog = Self.loadPersistedCatalog()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// 완주 결과 상승. transferUserInfo 는 시스템 큐잉 — 폰 미연결이어도 유실되지 않는다.
    func sendResult(_ payload: [String: Any]) {
        guard WCSession.isSupported() else { return }
        WCSession.default.transferUserInfo(payload)
    }

    // ── 내부: 카탈로그 반영/영속 ─────────────────────────────────────────────

    fileprivate func applyCatalogData(_ data: Data) {
        guard let decoded = try? JSONDecoder().decode(Catalog.self, from: data) else { return }
        catalog = decoded
        UserDefaults.standard.set(data, forKey: Self.catalogKey)
    }

    private static func loadPersistedCatalog() -> Catalog? {
        guard let data = UserDefaults.standard.data(forKey: catalogKey) else { return nil }
        return try? JSONDecoder().decode(Catalog.self, from: data)
    }
}

// MARK: - WCSessionDelegate (임의 큐 → Data 로 직렬화해 메인 hop)

extension WatchSyncManager: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        // 활성화 전에 이미 도착해 있던 applicationContext 반영(앱 재설치/재시작 복원).
        handleContext(session.receivedApplicationContext)
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        handleContext(applicationContext)
    }

    /// [String: Any] 는 Sendable 이 아니므로 임의 큐에서 JSON Data 로 굳힌 뒤 메인으로 넘긴다.
    nonisolated private func handleContext(_ context: [String: Any]) {
        guard (context["type"] as? String) == "watchRaceCatalog",
              let catalogDict = context["catalog"] as? [String: Any],
              let data = try? JSONSerialization.data(withJSONObject: catalogDict) else { return }
        Task { @MainActor in
            self.applyCatalogData(data)
        }
    }
}
