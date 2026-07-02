//
//  ContentView.swift
//  PaceLabWatch Watch App — #552 Phase 1~3
//
//  라이브 지표 화면. 시작 전(StartView) → 측정 중(MetricsView) → 요약(EndedView).
//  Phase 2: 고스트 격차 히어로(앞=초록/뒤=빨강, #552 UX) + 최근 안내 문구 + 완주 요약.
//  Phase 3: 카탈로그 기반 거리·상대 선택(폰 동기화, 오프라인 변경 가능) + 완주 결과 상승.
//

import SwiftUI
import RaceCore

struct ContentView: View {
    @StateObject private var sync = WatchSyncManager()
    @StateObject private var controller = WatchRaceController()

    var body: some View {
        NavigationStack {
            Group {
                switch controller.phase {
                case .running:
                    MetricsView(controller: controller)
                case .ended:
                    EndedView(controller: controller)
                default: // idle / starting / error
                    StartView(controller: controller, sync: sync)
                }
            }
        }
        .onAppear {
            // 완주 결과 → WCSession 상승(폰 미연결이어도 시스템이 큐잉·재전달).
            controller.onRaceFinished = { [weak sync] payload in
                sync?.sendResult(payload)
            }
            #if targetEnvironment(simulator)
            // 자율 QA 훅: 런치 인자로 리허설 자동 시작(스크린샷 검증용).
            if ProcessInfo.processInfo.arguments.contains("--sim-race-rehearsal") {
                controller.startSimRehearsal()
            }
            #endif
        }
    }
}

// MARK: - 시작 화면 (카탈로그 선택 → 레이스 구성)

private struct StartView: View {
    @ObservedObject var controller: WatchRaceController
    @ObservedObject var sync: WatchSyncManager

    /// 워치 로컬 선택(오프라인 변경 가능). 카탈로그 도착 시 폰의 마지막 선택으로 초기화.
    @State private var selectedDistanceM: Double?
    @State private var useGhost = true

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("PaceLAB")
                    .font(.headline)
                Text("나와의 레이스")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                if case .error(let message) = controller.phase {
                    Text(message)
                        .font(.caption2)
                        .foregroundStyle(.orange)
                        .multilineTextAlignment(.center)
                }

                if controller.phase == .starting {
                    ProgressView()
                        .padding(.top, 4)
                } else {
                    setupSection

                    Button {
                        startRace()
                    } label: {
                        Text("시작")
                            .frame(maxWidth: .infinity)
                    }
                    .tint(.green)
                    .padding(.top, 4)

                    #if targetEnvironment(simulator)
                    Button {
                        controller.startSimRehearsal()
                    } label: {
                        Text("고스트 리허설(시뮬)")
                            .font(.caption2)
                            .frame(maxWidth: .infinity)
                    }
                    .tint(.purple)
                    #endif
                }
            }
            .padding(.horizontal, 6)
        }
        .onReceive(sync.$catalog) { catalog in
            guard let catalog, selectedDistanceM == nil else { return }
            selectedDistanceM = catalog.lastSelection.distanceM ?? catalog.entries.first?.distanceM
            useGhost = catalog.lastSelection.opponentKind != "none"
        }
    }

    /// 거리·상대 선택부. 카탈로그가 아직 없으면(첫 페어링 전) 자유 측정만 안내.
    @ViewBuilder
    private var setupSection: some View {
        if let catalog = sync.catalog, !catalog.entries.isEmpty {
            Picker("거리", selection: $selectedDistanceM) {
                ForEach(catalog.entries, id: \.distanceM) { entry in
                    Text(entry.label).tag(Optional(entry.distanceM))
                }
            }
            .pickerStyle(.navigationLink)

            if let best = selectedBest {
                Toggle(isOn: $useGhost) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("내 베스트와 대결")
                            .font(.caption2)
                        Text(MetricFormat.time(best.elapsedSec))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                Text("이 거리는 기록이 없어 자유 측정으로 달려요")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        } else {
            Text("아이폰과 연결되면 고스트 목록이 동기화돼요 · 지금은 자유 측정")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private var selectedBest: WatchSyncManager.Catalog.Best? {
        sync.catalog?.entries.first { $0.distanceM == selectedDistanceM }?.best
    }

    /// 선택을 굳혀 레이스 구성 후 시작. 곡선 2점 미만(손상 카탈로그)이면 자유 측정으로 폴백.
    private func startRace() {
        let entry = sync.catalog?.entries.first { $0.distanceM == selectedDistanceM }
        if useGhost, let entry, let best = entry.best, best.curvePoints.count >= 2 {
            let curve = GhostCurve(points: best.curvePoints.map {
                GhostCurvePoint(distanceM: $0.distanceM, elapsedSec: $0.elapsedSec)
            })
            controller.configure(
                ghost: curve,
                targetPb: .init(distanceM: entry.distanceM, elapsedSec: best.elapsedSec, sourceRunId: best.sourceRunId),
                config: resolvedAnnounceConfig
            )
        } else {
            controller.configure(ghost: nil, targetPb: nil, config: resolvedAnnounceConfig)
        }
        controller.start()
    }

    /// 카탈로그의 안내 설정(폰 레이스 음성 설정 미러) → RaceCore AnnounceConfig. 없으면 기본값.
    private var resolvedAnnounceConfig: AnnounceConfig {
        guard let a = sync.catalog?.announceConfig else { return .default }
        let stepM = a.periodic.stepM ?? 1000
        let stepSec = a.periodic.stepSec ?? 60
        return AnnounceConfig(
            periodicKind: PeriodicKind(rawValue: a.periodic.kind) ?? .distance,
            stepM: stepM > 0 ? stepM : 1000,
            stepSec: stepSec > 0 ? stepSec : 60,
            reversalAlert: a.reversalAlert,
            gapMode: GapDisplayMode(rawValue: a.gapMode) ?? .distance
        )
    }
}

// MARK: - 측정 중 화면

private struct MetricsView: View {
    @ObservedObject var controller: WatchRaceController

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if let gap = controller.gap {
                    GapHeroView(gap: gap, mode: controller.announceConfig.gapMode)
                }

                Text(MetricFormat.time(controller.elapsedSec))
                    .font(.system(size: controller.gap == nil ? 42 : 30, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 8) {
                    MetricCell(label: "거리", value: MetricFormat.distanceKm(controller.distanceM), unit: "km")
                    MetricCell(label: "페이스", value: MetricFormat.pace(controller.paceSecPerKm), unit: "/km")
                }
                HStack(spacing: 8) {
                    MetricCell(
                        label: "심박",
                        value: controller.heartRateBpm > 0 ? "\(Int(controller.heartRateBpm))" : "--",
                        unit: "bpm",
                        tint: .red
                    )
                    MetricCell(label: "칼로리", value: "\(Int(controller.activeKcal))", unit: "kcal")
                }

                if let announcement = controller.lastAnnouncementText {
                    Text(announcement)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button(role: .destructive) {
                    controller.end()
                } label: {
                    Text("종료")
                        .frame(maxWidth: .infinity)
                }
                .tint(.red)
                .padding(.top, 2)
            }
            .padding(.horizontal, 4)
        }
    }
}

// MARK: - 격차 히어로 (#552 UX: 앞=초록/뒤=빨강, 사용자 단위)

private struct GapHeroView: View {
    let gap: GapState
    let mode: GapDisplayMode

    private var tint: Color {
        switch gap.leadState {
        case .ahead: return .green
        case .behind: return .red
        case .even: return .secondary
        }
    }

    private var stateLabel: String {
        switch gap.leadState {
        case .ahead: return "앞서는 중"
        case .behind: return "뒤지는 중"
        case .even: return "나란히"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Text(gap.leadState == .even ? "고스트와" : GhostMath.formatGapAmount(gap, mode))
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(stateLabel)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - 요약 화면

private struct EndedView: View {
    @ObservedObject var controller: WatchRaceController

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text("레이스 완료")
                    .font(.headline)

                if let summary = controller.finishSummaryText {
                    Text(summary)
                        .font(.system(size: 13, weight: .medium))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(finishTint)
                }

                Text(MetricFormat.time(controller.elapsedSec))
                    .font(.system(size: 34, weight: .semibold, design: .rounded))
                    .monospacedDigit()

                HStack(spacing: 8) {
                    MetricCell(label: "거리", value: MetricFormat.distanceKm(controller.distanceM), unit: "km")
                    MetricCell(label: "페이스", value: MetricFormat.pace(controller.paceSecPerKm), unit: "/km")
                }
                HStack(spacing: 8) {
                    MetricCell(label: "심박", value: controller.heartRateBpm > 0 ? "\(Int(controller.heartRateBpm))" : "--", unit: "bpm", tint: .red)
                    MetricCell(label: "칼로리", value: "\(Int(controller.activeKcal))", unit: "kcal")
                }

                Button {
                    controller.reset()
                } label: {
                    Text("새 레이스")
                        .frame(maxWidth: .infinity)
                }
                .tint(.green)
                .padding(.top, 2)
            }
            .padding(.horizontal, 4)
        }
    }

    /// 완주 요약 색: 완주 문구와 같은 스냅샷(finalGap) 기준(이겼으면 초록/졌으면 빨강/나란히 회색).
    /// 마지막 틱의 gap 을 쓰면 종료 직전 거리 갱신을 놓쳐 문구(승)와 색(패)이 어긋날 수 있다.
    private var finishTint: Color {
        guard let gap = controller.finalGap else { return .primary }
        switch gap.leadState {
        case .ahead: return .green
        case .behind: return .red
        case .even: return .secondary
        }
    }
}

// MARK: - 지표 셀

private struct MetricCell: View {
    let label: String
    let value: String
    let unit: String
    var tint: Color = .primary

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 22, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tint)
            Text(unit)
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - 표시 포맷

enum MetricFormat {
    /// 경과시간 → mm:ss (1시간 이상은 h:mm:ss).
    static func time(_ seconds: Double) -> String {
        let s = max(0, Int(seconds.rounded()))
        let h = s / 3600
        let m = (s % 3600) / 60
        let sec = s % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, sec)
        }
        return String(format: "%d:%02d", m, sec)
    }

    /// 거리(m) → km 소수 둘째자리.
    static func distanceKm(_ meters: Double) -> String {
        String(format: "%.2f", meters / 1000)
    }

    /// 페이스(초/km) → m'ss"/km. 0이면 미산출 표시.
    static func pace(_ secPerKm: Double) -> String {
        guard secPerKm > 0, secPerKm.isFinite else { return "--'--\"" }
        let s = Int(secPerKm.rounded())
        return String(format: "%d'%02d\"", s / 60, s % 60)
    }
}

#Preview {
    ContentView()
}
