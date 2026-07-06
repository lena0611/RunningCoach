//
//  WatchSpeech.swift
//  PaceLabWatch Watch App — #552 음성 안내
//
//  "발화는 레이스를 시작한 기기에서" 합의(2026-07-06)에 따라, 워치 시작 레이스는 워치가 직접 말한다
//  (폰 시작 레이스는 기존 폰 SpeechManager 그대로). 폰 SpeechManager 의 미니 미러:
//  AVSpeechSynthesizer(ko-KR) + .playback/.voicePrompt/[.duckOthers], 그리고
//  "발화 중에만 ducking" — didFinish/didCancel 에서 세션을 해제해 음악을 복구한다
//  (tts-duck-only-while-speaking).
//
//  ⚠️ watchOS 라우팅 함정(2026-07-06 실기기): 동기 setActive(true) 는 블루투스 이어폰이
//  '연결됨'이어도 소리를 내장 스피커로만 보낸다. 이어폰 라우팅은 watchOS 전용
//  비동기 activate(options:completionHandler:) 를 거쳐야 한다 — 그래서 발화는
//  "대기열 적재 → 비동기 활성화 완료 → 드레인" 구조다. 이어폰 없으면 스피커 폴백(동일 API).
//

import Foundation
import AVFoundation

final class WatchSpeech: NSObject {
    private let synthesizer = AVSpeechSynthesizer()
    private let voice = AVSpeechSynthesisVoice(language: "ko-KR")
    /// 비동기 활성화가 끝나기 전 도착한 문구들. 활성화 완료 시 순서대로 발화.
    private var pending: [String] = []
    private var activating = false

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    /// 안내 문구 발화(대기열 경유). 이미 말하는 중이면 뒤에 이어 말한다(짧은 안내라 큐 순서로 충분).
    func speak(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        pending.append(trimmed)
        activateAndDrain()
    }

    /// 새 레이스 준비 등에서 남은 발화를 끊는다.
    func stop() {
        pending.removeAll()
        synthesizer.stopSpeaking(at: .immediate)
        deactivateIfIdle()
    }

    private func activateAndDrain() {
        guard !pending.isEmpty, !activating else { return }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers])
        activating = true
        session.activate(options: []) { [weak self] _, _ in
            // 완료 콜백은 임의 큐 — 발화(synthesizer)와 상태는 메인에서만 다룬다.
            Task { @MainActor in
                guard let self else { return }
                self.activating = false
                let texts = self.pending
                self.pending.removeAll()
                for text in texts {
                    let utterance = AVSpeechUtterance(string: text)
                    utterance.voice = self.voice
                    self.synthesizer.speak(utterance)
                }
            }
        }
    }

    /// 큐가 비었을 때만 세션 해제 — 연속 안내 사이에 음악이 출렁이지 않게.
    private func deactivateIfIdle() {
        guard !synthesizer.isSpeaking, pending.isEmpty else { return }
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
