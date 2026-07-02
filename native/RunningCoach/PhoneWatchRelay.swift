//
//  PhoneWatchRelay.swift
//  RunningCoach — #552 Phase 3
//
//  폰 쪽 WCSession 릴레이. 웹(watchRaceBridge.ts)과 워치(WatchSyncManager.swift) 사이 미러 계약.
//  - 하강: 웹이 민 고스트 카탈로그 → updateApplicationContext (최신 1건 유지, 워치가 나중에 붙어도 수신).
//  - 상승: 워치 완주 결과 userInfo → UserDefaults 큐 영속 → 웹이 pull(requestResults)/ACK(ackResult)로 소비.
//    ACK 유실 시 재전송되지만 웹 competitionStore 의 watchResultId 멱등 가드가 이중 보류를 막는다.
//

import Foundation
import WatchConnectivity

final class PhoneWatchRelay: NSObject {
    static let queueKey = "pacelab.watchRaceResultQueue"

    /// 새 결과가 큐에 들어온 직후 호출(메인 큐) — 웹뷰가 살아 있으면 즉시 드레인.
    var onQueueChanged: (() -> Void)?

    private var session: WCSession? { WCSession.isSupported() ? WCSession.default : nil }

    func activate() {
        guard let session else { return }
        session.delegate = self
        session.activate()
    }

    // MARK: - 하강 (카탈로그)

    /// 카탈로그 스냅샷을 워치로. applicationContext 는 최신 1건만 유지 — 스냅샷 의미와 일치.
    func pushCatalog(_ catalog: [String: Any]) {
        guard let session, session.activationState == .activated else { return }
        try? session.updateApplicationContext(["type": "watchRaceCatalog", "catalog": catalog])
    }

    // MARK: - 상승 (결과 큐, UserDefaults 영속)

    func pendingResults() -> [[String: Any]] {
        UserDefaults.standard.array(forKey: Self.queueKey) as? [[String: Any]] ?? []
    }

    func removeResult(id: String) {
        let next = pendingResults().filter { ($0["id"] as? String) != id }
        UserDefaults.standard.set(next, forKey: Self.queueKey)
    }

    private func enqueue(_ payload: [String: Any]) {
        guard let id = payload["id"] as? String, !id.isEmpty else { return }
        var queue = pendingResults()
        // WCSession 재전달 대비 큐 자체도 멱등.
        guard !queue.contains(where: { ($0["id"] as? String) == id }) else { return }
        queue.append(payload)
        UserDefaults.standard.set(queue, forKey: Self.queueKey)
        onQueueChanged?()
    }
}

// MARK: - WCSessionDelegate

extension PhoneWatchRelay: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    func sessionDidBecomeInactive(_ session: WCSession) {}

    /// 워치 교체 등으로 비활성화되면 재활성화(Apple 권장 패턴).
    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    /// 워치 완주 결과(transferUserInfo). 시스템이 전달을 보장하므로 여기서 영속 큐에만 넣는다.
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard (userInfo["type"] as? String) == "watchRaceResult" else { return }
        DispatchQueue.main.async { [weak self] in
            self?.enqueue(userInfo)
        }
    }
}
