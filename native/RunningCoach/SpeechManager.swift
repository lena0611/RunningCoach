//
//  SpeechManager.swift
//  RunningCoach
//
//  #229 가상레이싱 음성 안내 재생기. 백그라운드(화면 잠금)에서 엔진이 직접 호출한다.
//  ⚠️ MVP 범위: AVSpeechSynthesizer(ko-KR) + AVAudioSession(.playback/.voicePrompt/.duckOthers)
//     + 우선순위 큐 + dedupe. PoC①에서 .voicePrompt 모드가 음악 위 또렷함을 확인(커밋 9496045).
//  후속 #231(`runContextSpeech` 브리지·PoC③ 음질)에서 웹 트리거 speak/cancel 경로를 확장한다.
//
//  우선순위 약속(ghost.ts PRIORITY 미러): progress/periodic=1, lap=2, reversal=3, finish=4.
//  high(>=reversal) = 진행 중 발화를 끊고 즉시 재생, normal = 큐잉.
//

import Foundation
import AVFoundation

final class SpeechManager: NSObject {
    private let synth = AVSpeechSynthesizer()
    private let voice = AVSpeechSynthesisVoice(language: "ko-KR")
    /// 이번 세션에서 이미 말한 dedupeKey. 같은 지점 재진입 시 중복 발화 방지.
    private var spokenKeys = Set<String>()
    /// reversal 이상으로 간주하는 우선순위 경계(이 값 이상이면 진행 발화를 끊고 즉시 재생).
    private let interruptPriority = 3

    private(set) var spokenCount = 0

    override init() {
        super.init()
        synth.delegate = self
    }

    /// 오디오 세션을 음성 안내 모드로 활성화한다. 시작 시 1회.
    func activateAudioSession() {
        #if os(iOS)
        do {
            // .voicePrompt = 내비 안내 모드: 다른 오디오를 강하게 ducking, 음성 또렷.
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .voicePrompt, options: [.duckOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[LiveRun Speech] audio session activate failed:", error.localizedDescription)
        }
        #endif
    }

    /// 세션 종료 시 오디오 세션 비활성화(다른 앱 볼륨 복구).
    func deactivateAudioSession() {
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }

    /// 안내를 재생한다. dedupeKey 가 이미 발화됐으면 무시. 우선순위가 높으면 진행 발화를 끊는다.
    func speak(_ announcement: Announcement) {
        if spokenKeys.contains(announcement.dedupeKey) { return }
        spokenKeys.insert(announcement.dedupeKey)
        speak(text: announcement.text, priority: announcement.priority)
    }

    /// 임의 텍스트 발화(시작/종료 멘트 등 dedupe 불필요한 경우).
    func speak(text: String, priority: Int) {
        // 백그라운드에서 idle로 비활성화됐을 수 있으니 발화 직전 세션을 재활성화(잠금 후 음성 미재생 수정).
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(true)
        #endif
        if priority >= interruptPriority, synth.isSpeaking {
            synth.stopSpeaking(at: .immediate)
        }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        utterance.volume = 1.0
        synth.speak(utterance)
        spokenCount += 1
    }

    func cancel() {
        if synth.isSpeaking {
            synth.stopSpeaking(at: .immediate)
        }
    }

    /// 새 세션 시작 시 dedupe 상태 초기화.
    func reset() {
        cancel()
        spokenKeys.removeAll()
        spokenCount = 0
    }
}

extension SpeechManager: AVSpeechSynthesizerDelegate {
    // 큐잉은 AVSpeechSynthesizer 가 내부적으로 순차 처리한다. 별도 큐 관리 불필요.
}
