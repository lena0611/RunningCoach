//
//  WatchRaceController.swift
//  PaceLabWatch Watch App — #552 Phase 0b
//
//  워치 레이스 세션 셸의 자리표시자.
//  Phase 1에서 HKWorkoutSession/HKLiveWorkoutBuilder로 라이브 지표(거리·시간·심박·케이던스·칼로리)를
//  수집하고, 공유 패키지 RaceCore.GhostRaceEngine으로 고스트 격차·주기 안내를 계산한다.
//  지금(0b)은 RaceCore 링크 검증 + 상태 뼈대만 둔다.
//

import Foundation
import Combine
import RaceCore

@MainActor
final class WatchRaceController: ObservableObject {
    /// 스켈레톤 상태: 공유 엔진 구성 성공 여부를 UI에 노출(RaceCore 링크 검증).
    @Published private(set) var engineReady = false

    /// Phase 1~2에서 라이브 틱을 먹여 gap·역전·주기 발화를 계산할 공유 엔진.
    private let engine: GhostRaceEngine

    init() {
        // 고스트 없는(자유주행) 기본 설정으로 엔진을 구성 — 링크·API 계약 검증.
        engine = GhostRaceEngine(curve: nil, config: .default)
        engineReady = true
    }
}
