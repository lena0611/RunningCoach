//
//  BriefingSpeaker.swift
//  RunningCoach
//
//  #898 브리핑 쇼츠 목소리(웹 src/features/briefing-shorts/speech.ts 미러).
//  웹이 문장마다 `runContextSpeech` 로 speak 를 보내면 읽고, 시작·끝을 웹에 알린다(입 모양·자막 넘김).
//  말 걸기 탭을 없앤 연출(2026-11-05)이라 사용자 동작 없이 읽어야 한다 — 웹 음성은 사용자 탭 전엔 막힐 수 있어 네이티브로 읽는다.
//  무음 스위치를 따른다(.ambient): 저절로 뜨는 팝업이라 무음 모드면 자막만. 러닝 안내(SpeechManager)가 내비처럼 무음을 무시하는 것과 다르다.
//

import AVFoundation

final class BriefingSpeaker: NSObject {
    private let synth = AVSpeechSynthesizer()
    private let voice = AVSpeechSynthesisVoice(language: "ko-KR")
    fileprivate var ids: [ObjectIdentifier: String] = [:]
    /// (문장 id, "start" | "end") — 메인 스레드에서 부른다.
    var onEvent: ((String, String) -> Void)?

    override init() {
        super.init()
        synth.delegate = self
    }

    func speak(id: String, text: String) {
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        // 라이브 러닝 안내가 .playback 으로 세션을 쓰고 있으면 건드리지 않는다
        if session.category != .playback {
            try? session.setCategory(.ambient, mode: .spokenAudio)
            try? session.setActive(true)
        }
        #endif
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 1.05 // 웹 음성(rate 1.05)과 같은 빠르기
        ids[ObjectIdentifier(utterance)] = id
        synth.speak(utterance)
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
    }

    fileprivate func finish(_ utterance: AVSpeechUtterance) {
        guard let id = ids.removeValue(forKey: ObjectIdentifier(utterance)) else { return }
        emit(id, "end")
    }

    fileprivate func emit(_ id: String, _ event: String) {
        DispatchQueue.main.async { [weak self] in
            self?.onEvent?(id, event)
        }
    }
}

// 델리게이트는 확장에서(SpeechManager 와 같은 꼴) — 클래스 선언에 붙이면 Sendable 경고가 난다
extension BriefingSpeaker: AVSpeechSynthesizerDelegate {
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        guard let id = ids[ObjectIdentifier(utterance)] else { return }
        emit(id, "start")
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        finish(utterance)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        finish(utterance)
    }
}
