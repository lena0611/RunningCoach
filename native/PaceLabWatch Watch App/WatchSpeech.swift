//
//  WatchSpeech.swift
//  PaceLabWatch Watch App — #552 음성 안내
//
//  "발화는 레이스를 시작한 기기에서" 합의(2026-07-06)에 따라, 워치 시작 레이스는 워치가 직접 말한다
//  (폰 시작 레이스는 기존 폰 SpeechManager 그대로). 폰 SpeechManager 의 미니 미러:
//  AVSpeechSynthesizer(ko-KR) + .playback/.voicePrompt/[.duckOthers], 그리고
//  "발화 중에만 ducking" — didFinish/didCancel 에서 세션을 해제해 음악을 복구한다
//  (tts-duck-only-while-speaking, 폰 PoC①에서 .voicePrompt 가 음악 위 또렷함 검증).
//  오디오 경로: 워치에 페어링된 블루투스 이어폰 우선, 없으면 워치 스피커.
//

import Foundation
import AVFoundation

final class WatchSpeech: NSObject {
    private let synthesizer = AVSpeechSynthesizer()
    private let voice = AVSpeechSynthesisVoice(language: "ko-KR")

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    /// 안내 문구 발화. 이미 말하는 중이면 뒤에 이어 말한다(짧은 안내라 큐 순서로 충분).
    func speak(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers])
        try? session.setActive(true)
        let utterance = AVSpeechUtterance(string: trimmed)
        utterance.voice = voice
        synthesizer.speak(utterance)
    }

    /// 새 레이스 준비 등에서 남은 발화를 끊는다.
    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        deactivateIfIdle()
    }

    /// 큐가 비었을 때만 세션 해제 — 연속 안내 사이에 음악이 출렁이지 않게.
    private func deactivateIfIdle() {
        guard !synthesizer.isSpeaking else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

// MARK: - AVSpeechSynthesizerDelegate (임의 큐 → 메인 hop)

extension WatchSpeech: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.deactivateIfIdle() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.deactivateIfIdle() }
    }
}
