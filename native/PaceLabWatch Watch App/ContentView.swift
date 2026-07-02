//
//  ContentView.swift
//  PaceLabWatch Watch App — #552 Phase 1
//
//  라이브 지표 화면. 시작 전(StartView) → 측정 중(MetricsView) → 요약(EndedView).
//  고스트 격차 히어로·햅틱은 Phase 2.
//

import SwiftUI

struct ContentView: View {
    @StateObject private var controller = WatchRaceController()

    var body: some View {
        switch controller.phase {
        case .running:
            MetricsView(controller: controller)
        case .ended:
            EndedView(controller: controller)
        default: // idle / starting / error
            StartView(controller: controller)
        }
    }
}

// MARK: - 시작 화면

private struct StartView: View {
    @ObservedObject var controller: WatchRaceController

    var body: some View {
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
                Button {
                    controller.start()
                } label: {
                    Text("시작")
                        .frame(maxWidth: .infinity)
                }
                .tint(.green)
                .padding(.top, 4)
            }
        }
        .padding(.horizontal, 6)
    }
}

// MARK: - 측정 중 화면

private struct MetricsView: View {
    @ObservedObject var controller: WatchRaceController

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text(MetricFormat.time(controller.elapsedSec))
                    .font(.system(size: 42, weight: .semibold, design: .rounded))
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

// MARK: - 요약 화면

private struct EndedView: View {
    @ObservedObject var controller: WatchRaceController

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text("레이스 완료")
                    .font(.headline)

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
