//
//  ContentView.swift
//  PaceLabWatch Watch App — #552 Phase 0b 스켈레톤
//
//  Phase 0b UI는 자리표시자. 실제 라이브 레이싱 화면(격차 히어로·햅틱)은 Phase 1~2.
//

import SwiftUI

struct ContentView: View {
    @StateObject private var controller = WatchRaceController()

    var body: some View {
        VStack(spacing: 6) {
            Text("PaceLAB")
                .font(.headline)
            Text("나와의 레이스")
                .font(.caption2)
                .foregroundStyle(.secondary)
            // RaceCore(공유 엔진) 링크가 살아있는지 스켈레톤 단계에서 확인.
            Text(controller.engineReady ? "RaceCore 연결됨" : "준비 중")
                .font(.caption2)
                .foregroundStyle(controller.engineReady ? .green : .secondary)
        }
        .padding()
    }
}

#Preview {
    ContentView()
}
