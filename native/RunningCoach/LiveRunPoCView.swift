//
//  LiveRunPoCView.swift
//  RunningCoach
//
//  #229 PoC① — 백그라운드 위치 + 오디오(TTS) 60분 안정성·배터리 실측 하니스.
//  ⚠️ PoC 전용 임시 화면. 정식 LiveRunTracker/GhostRaceEngine(#229 본구현)이 아니다.
//  ⚠️ Swift 동시성(MainActor 기본 격리) 경고가 뜨면 Xcode에서 정리. 검증은 실기기·화면잠금 필수.
//
//  사용법(PoC 측정):
//   1) RunningCoachApp.swift 의 `ContentView()` 를 임시로 `LiveRunPoCView()` 로 교체해 빌드.
//   2) 실기기 설치 → "시작" → 위치 권한 "항상 허용".
//   3) 화면 잠그고 폰을 주머니에 넣고 60분+ 야외 보행/러닝.
//   4) 1분마다 음성 안내가 백그라운드에서 들리는지, 복귀 후 tick/거리/경과가 계속 쌓였는지,
//      배터리 소모(%/시간)를 기록. 앱 강제종료 후 재실행 시 "복원 가능" 표시 확인.
//   5) 결과를 decision-log(#229 PoC①)에 기록. 막히면 Watch 우선순위 재검토.
//

import SwiftUI
import Combine
import CoreLocation
import AVFoundation

final class LiveRunPoCModel: NSObject, ObservableObject {
    @Published var status = "대기"
    @Published var tickCount = 0
    @Published var cumulativeDistanceM = 0.0
    @Published var elapsedSec = 0
    @Published var lastSignal = "-"
    @Published var speechCount = 0
    @Published var lastSpeechAt = "-"
    @Published var authStatus = "미요청"
    @Published var recoveredNote = ""
    @Published var bgModes = "확인 전"

    private let manager = CLLocationManager()
    private let synth = AVSpeechSynthesizer()
    private var lastLocation: CLLocation?
    private var startDate: Date?
    private var lastSpeechElapsed = 0
    private let speechIntervalSec = 60

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.activityType = .fitness
        manager.distanceFilter = 5
        if let saved = UserDefaults.standard.object(forKey: "poc_startDate") as? Date {
            recoveredNote = "이전 세션 시작 \(Self.hhmmss(saved)) — 강제종료 복원 가능"
        }
        let modes = (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String]) ?? []
        bgModes = modes.isEmpty ? "없음 ⚠️ (백그라운드 불가)" : modes.joined(separator: ", ")
    }

    private func backgroundLocationAllowed() -> Bool {
        let modes = (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String]) ?? []
        return modes.contains("location")
    }

    func start() {
        configureAudioSession()
        manager.requestAlwaysAuthorization()
        #if os(iOS)
        // ⚠️ allowsBackgroundLocationUpdates=true 는 UIBackgroundModes 에 "location" 이 없으면
        // 하드 크래시한다. 모드가 없으면(=Info.plist 설정 미반영) 포그라운드 측정만 하고 크래시는 피한다.
        if backgroundLocationAllowed() {
            manager.allowsBackgroundLocationUpdates = true
        }
        manager.pausesLocationUpdatesAutomatically = false
        #endif
        manager.startUpdatingLocation()
        let now = Date()
        startDate = now
        UserDefaults.standard.set(now, forKey: "poc_startDate")
        lastLocation = nil
        tickCount = 0
        cumulativeDistanceM = 0
        elapsedSec = 0
        speechCount = 0
        lastSpeechElapsed = 0
        recoveredNote = ""
        status = backgroundLocationAllowed()
            ? "측정 중 — 화면 잠그고 백그라운드 테스트"
            : "측정 중(포그라운드만) — UIBackgroundModes에 location 없음"
        speak("측정을 시작합니다.")
    }

    func stop() {
        manager.stopUpdatingLocation()
        #if os(iOS)
        manager.allowsBackgroundLocationUpdates = false
        #endif
        UserDefaults.standard.removeObject(forKey: "poc_startDate")
        startDate = nil
        status = "정지"
        speak("측정을 종료합니다.")
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }

    private func configureAudioSession() {
        #if os(iOS)
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers, .mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            status = "오디오 세션 실패: \(error.localizedDescription)"
        }
        #endif
    }

    private func speak(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "ko-KR")
        synth.speak(utterance)
        speechCount += 1
        lastSpeechAt = Self.hhmmss(Date())
    }

    static func hhmmss(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f.string(from: date)
    }
}

extension LiveRunPoCModel: CLLocationManagerDelegate {
    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        switch m.authorizationStatus {
        case .authorizedAlways: authStatus = "항상 허용"
        case .authorizedWhenInUse: authStatus = "사용 중 허용 (백그라운드 불가 — 항상 허용 필요)"
        case .denied: authStatus = "거부됨"
        case .restricted: authStatus = "제한됨"
        case .notDetermined: authStatus = "미결정"
        @unknown default: authStatus = "알 수 없음"
        }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for loc in locations {
            guard loc.horizontalAccuracy >= 0 else { lastSignal = "lost"; continue }
            lastSignal = loc.horizontalAccuracy <= 20 ? "ok" : "weak"
            if let prev = lastLocation {
                let d = loc.distance(from: prev)
                let dt = loc.timestamp.timeIntervalSince(prev.timestamp)
                // 속도 상한 필터: 12 m/s(≈43km/h) 초과·저정확도 점프 제거
                if dt > 0, d / dt <= 12, loc.horizontalAccuracy <= 30 {
                    cumulativeDistanceM += d
                }
            }
            lastLocation = loc
            tickCount += 1
            if let s = startDate {
                elapsedSec = Int(loc.timestamp.timeIntervalSince(s))
                if elapsedSec - lastSpeechElapsed >= speechIntervalSec {
                    lastSpeechElapsed = elapsedSec
                    speak("\(elapsedSec / 60)분 경과, \(Int(cumulativeDistanceM))미터.")
                }
            }
        }
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        status = "위치 오류: \(error.localizedDescription)"
    }
}

struct LiveRunPoCView: View {
    @StateObject private var model = LiveRunPoCModel()

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.system(.body, design: .monospaced)).bold()
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("#229 PoC① — 백그라운드 트래킹").font(.title3).bold()
            Text(model.status).foregroundStyle(.secondary).font(.footnote)
            if !model.recoveredNote.isEmpty {
                Text(model.recoveredNote).foregroundStyle(.orange).font(.footnote)
            }

            Divider()
            row("백그라운드 모드", model.bgModes)
            row("위치 권한", model.authStatus)
            row("경과", "\(model.elapsedSec / 60):" + String(format: "%02d", model.elapsedSec % 60))
            row("누적 거리", String(format: "%.0f m", model.cumulativeDistanceM))
            row("틱 수", "\(model.tickCount)")
            row("신호", model.lastSignal)
            row("음성 발화", "\(model.speechCount)회 · 마지막 \(model.lastSpeechAt)")
            Divider()

            HStack(spacing: 12) {
                Button("시작") { model.start() }.buttonStyle(.borderedProminent)
                Button("정지") { model.stop() }.buttonStyle(.bordered)
            }
            Text("시작 후 화면을 잠그고 60분+ 측정하세요. 1분마다 음성이 들리고 거리/틱이 계속 쌓이면 백그라운드 트래킹 가능.")
                .font(.caption).foregroundStyle(.secondary)
            Spacer()
        }
        .padding()
    }
}

#Preview {
    LiveRunPoCView()
}
