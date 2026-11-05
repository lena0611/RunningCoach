//
//  BriefingSpeaker.swift
//  RunningCoach
//
//  #898 브리핑 쇼츠 목소리(웹 src/features/briefing-shorts/speech.ts 미러).
//  웹이 문장마다 `runContextSpeech` 로 speak 를 보내면 읽고, 시작·끝을 웹에 알린다(입 모양·자막 넘김).
//  말 걸기 탭을 없앤 연출(2026-11-05)이라 사용자 동작 없이 읽어야 한다 — 웹 음성은 사용자 탭 전엔 막힐 수 있어 네이티브로 읽는다.
//  웹은 소리를 켜 둔 사용자(스피커·설정 — 기본은 끔)만 loud 로 보낸다 → 무음 모드여도 들려준다(.playback, 다른 소리와 섞어 음악을 끊지 않는다).
//  loud 없는 요청(이전 웹)은 무음 스위치를 따른다(.ambient).
//

import AVFoundation

final class BriefingSpeaker: NSObject {
    private let synth = AVSpeechSynthesizer()
    /// 기기에 받아 둔 한국어 목소리 중 음질이 가장 좋은 것(고품질 > 향상된 > 기본). 없으면 기본 한국어 목소리
    /// — 설정 > 손쉬운 사용 > 읽기 및 말하기 > 음성에서 '향상된' 음성을 받아 두면 그걸로 읽는다
    private let voice: AVSpeechSynthesisVoice? = {
        let korean = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == "ko-KR" }
        return korean.max { $0.quality.rawValue < $1.quality.rawValue } ?? AVSpeechSynthesisVoice(language: "ko-KR")
    }()
    fileprivate var ids: [ObjectIdentifier: String] = [:]
    /// (문장 id, "start" | "end") — 메인 스레드에서 부른다.
    var onEvent: ((String, String) -> Void)?

    override init() {
        super.init()
        synth.delegate = self
    }

    func speak(id: String, text: String, loud: Bool = false) {
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        if loud {
            try? session.setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers])
            try? session.setActive(true)
        } else if session.category != .playback {
            // 라이브 러닝 안내가 .playback 으로 세션을 쓰고 있으면 건드리지 않는다
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
