//
//  LiveRunDebugView.swift
//  RunningCoach
//
//  #229 본구현 검증용 임시 네이티브 테스트 화면.
//  ⚠️ 정식 UI 아님(정식 타겟선택/라이브/요약은 #232 웹). 실제 `LiveRunTracker`(엔진+음성)를
//     직접 구동해 기기에서 백그라운드 트래킹·고스트 비교·음성 안내를 콘솔 없이 검증한다.
//  ⚠️ 진입점을 이 화면으로 임시 swap해 쓴다(이 브랜치 전용). 검증 끝나면 ContentView()로 복원.
//

import SwiftUI
import Combine

final class LiveRunDebugModel: ObservableObject {
    @Published var state = "idle"
    @Published var permission = "-"
    @Published var seq = 0
    @Published var elapsedSec = 0.0
    @Published var distanceM = 0.0
    @Published var instantPace = "-"
    @Published var signal = "-"
    @Published var source = "-"
    @Published var gap = "고스트 없음"
    @Published var lastError = ""

    private let tracker = LiveRunTracker()

    init() {
        tracker.onTick = { [weak self] seq, elapsed, dist, pace, signal, source in
            DispatchQueue.main.async {
                self?.seq = seq
                self?.elapsedSec = elapsed
                self?.distanceM = dist
                self?.instantPace = pace.map { String(format: "%.0f초/km", $0) } ?? "-"
                self?.signal = signal.rawValue
                self?.source = source.rawValue
                self?.lastError = ""   // 틱이 들어오면(=파이프라인 동작) 직전 일시 오류 표시 제거
            }
        }
        tracker.onGap = { [weak self] timeGap, lead in
            DispatchQueue.main.async {
                let label = timeGap < 0 ? "앞섬" : (timeGap > 0 ? "뒤짐" : "나란히")
                self?.gap = String(format: "%@ %.0f초 [%@]", label, abs(timeGap), lead.rawValue)
            }
        }
        tracker.onStateChange = { [weak self] s in
            DispatchQueue.main.async { self?.state = s.rawValue }
        }
        tracker.onPermission = { [weak self] p in
            DispatchQueue.main.async { self?.permission = p.rawValue }
        }
        tracker.onError = { [weak self] code, msg in
            DispatchQueue.main.async { self?.lastError = "\(code): \(msg)" }
        }
    }

    private let config = AnnounceConfig(periodicKind: .distance, stepM: 1000, stepSec: 60, reversalAlert: true)

    func startNoGhost() {
        gap = "고스트 없음 (측정만)"
        tracker.start(LiveRunStartParams(
            sessionId: "debug-noghost", mode: "solo", curve: nil, config: config, targetDistanceM: 0, tickIntervalMs: 1000
        ))
    }

    func startWithGhost() {
        // 5km을 페이스 5:00/km 등속으로 달린 가상 고스트(검증용).
        let curve = GhostCurve(points: [
            GhostCurvePoint(distanceM: 0, elapsedSec: 0),
            GhostCurvePoint(distanceM: 1000, elapsedSec: 300),
            GhostCurvePoint(distanceM: 2000, elapsedSec: 600),
            GhostCurvePoint(distanceM: 3000, elapsedSec: 900),
            GhostCurvePoint(distanceM: 5000, elapsedSec: 1500)
        ])
        gap = "고스트 5:00/km 대결"
        tracker.start(LiveRunStartParams(
            sessionId: "debug-ghost", mode: "solo", curve: curve, config: config, targetDistanceM: 5000, tickIntervalMs: 1000
        ))
    }

    func pause() { tracker.pause() }
    func resume() { tracker.resume() }
    func stop() { tracker.stop() }
}

struct LiveRunDebugView: View {
    @StateObject private var model = LiveRunDebugModel()

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.system(.body, design: .monospaced)).bold()
        }
    }

    private var elapsedText: String {
        let s = Int(model.elapsedSec)
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("#229 라이브 트래킹 테스트").font(.title3).bold()
            Text("상태: \(model.state) · 권한: \(model.permission)")
                .font(.footnote).foregroundStyle(.secondary)
            if !model.lastError.isEmpty {
                Text("오류 \(model.lastError)").font(.footnote).foregroundStyle(.red)
            }

            Divider()
            row("경과", elapsedText)
            row("누적 거리", String(format: "%.0f m", model.distanceM))
            row("순간 페이스", model.instantPace)
            row("틱(seq)", "\(model.seq)")
            row("신호 / 소스", "\(model.signal) / \(model.source)")
            row("고스트 gap", model.gap)
            Divider()

            HStack(spacing: 10) {
                Button("시작(타겟없음)") { model.startNoGhost() }.buttonStyle(.borderedProminent)
                Button("시작(고스트)") { model.startWithGhost() }.buttonStyle(.borderedProminent).tint(.purple)
            }
            HStack(spacing: 10) {
                Button("일시정지") { model.pause() }.buttonStyle(.bordered)
                Button("재개") { model.resume() }.buttonStyle(.bordered)
                Button("정지") { model.stop() }.buttonStyle(.bordered).tint(.red)
            }

            Text("시작 → 위치 \"항상 허용\" → 화면 잠그고 야외 이동. 1km마다(또는 고스트 추월/역전 시) 백그라운드 음성이 나오고 거리/틱이 계속 쌓이면 OK.")
                .font(.caption).foregroundStyle(.secondary)
            Spacer()
        }
        .padding()
    }
}

#Preview {
    LiveRunDebugView()
}
