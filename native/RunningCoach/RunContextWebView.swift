import Security
import SwiftUI
import UIKit
import UserNotifications
import WebKit
import RaceCore

final class RunContextWKWebView: WKWebView {
    override var inputAccessoryView: UIView? {
        nil
    }
}

private struct RunContextNotificationRequest {
    let id: String
    let title: String
    let body: String
    let date: Date

    nonisolated init?(payload: [String: Any]) {
        guard let id = payload["id"] as? String,
              let title = payload["title"] as? String,
              let body = payload["body"] as? String,
              let dateIso = payload["dateIso"] as? String,
              let date = ISO8601DateFormatter().date(from: dateIso) else {
            return nil
        }
        self.id = id
        self.title = title
        self.body = body
        self.date = date
    }
}

private struct RunContextNotificationSettings {
    let allEnabled: Bool
    let healthKitNewRun: Bool

    init(payload: [String: Any]) {
        allEnabled = payload["allEnabled"] as? Bool ?? false
        healthKitNewRun = payload["healthKitNewRun"] as? Bool ?? true
    }
}

private final class RunContextNotificationManager {
    private let notificationPrefix = "pacelab-"
    private let settingsKey = "pacelab.notificationSettings"
    private let pendingHealthKitNotificationWindow: TimeInterval = 10 * 60
    private var pendingHealthKitDetectedAt: Date?
    // HealthKit 옵저버는 한 워크아웃의 단계적 기록(워크아웃·경로·심박·구간)마다 콜백돼 "새 러닝 감지"가 연발된다.
    // 마지막 발화 후 이 창 안의 재발화는 같은 동기화 버스트로 보고 1회로 합친다(UserDefaults 영속 → 백그라운드 깨움에도 유지).
    private let healthKitDetectedDebounceWindow: TimeInterval = 10 * 60
    private let lastHealthKitDetectedKey = "pacelab.lastHealthKitDetectedAt"

    func updateSettings(_ settings: RunContextNotificationSettings) {
        UserDefaults.standard.set([
            "allEnabled": settings.allEnabled,
            "healthKitNewRun": settings.healthKitNewRun
        ], forKey: settingsKey)
        print("[RunContext Notifications] settings updated all=\(settings.allEnabled) healthKit=\(settings.healthKitNewRun)")
        if UIApplication.shared.applicationState == .active {
            pendingHealthKitDetectedAt = nil
            print("[RunContext Notifications] pending HealthKit detected notification discarded while app active")
            return
        }
        showPendingHealthKitDetectedNotificationIfNeeded(settings: settings)
    }

    func syncScheduledNotifications(enabled: Bool, requests: [RunContextNotificationRequest]) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { [notificationPrefix] pending in
            let identifiers = pending
                .map(\.identifier)
                .filter { $0.hasPrefix(notificationPrefix) }
            center.removePendingNotificationRequests(withIdentifiers: identifiers)

            guard enabled else { return }
            self.requestAuthorization { granted in
                print("[RunContext Notifications] authorization \(granted ? "granted" : "not granted"), scheduled=\(requests.count)")
                guard granted else { return }
                requests.forEach { self.schedule($0) }
            }
        }
    }

    func showImmediateNotification(id: String, title: String, body: String) {
        requestAuthorization { [weak self] granted in
            print("[RunContext Notifications] immediate authorization \(granted ? "granted" : "not granted")")
            guard granted, let self else { return }
            let content = self.content(title: title, body: body)
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
            let request = UNNotificationRequest(identifier: self.notificationPrefix + id, content: content, trigger: trigger)
            UNUserNotificationCenter.current().add(request)
        }
    }

    func showHealthKitDetectedNotificationIfEnabled() {
        let settings = loadSettings()
        guard settings.allEnabled, settings.healthKitNewRun else {
            print("[RunContext Notifications] HealthKit detected notification skipped settings all=\(settings.allEnabled) healthKit=\(settings.healthKitNewRun)")
            if !settings.allEnabled, settings.healthKitNewRun {
                pendingHealthKitDetectedAt = Date()
                print("[RunContext Notifications] HealthKit detected notification pending until web settings sync")
            }
            return
        }
        showHealthKitDetectedNotification()
    }

    private func showPendingHealthKitDetectedNotificationIfNeeded(settings: RunContextNotificationSettings) {
        guard settings.allEnabled, settings.healthKitNewRun, let detectedAt = pendingHealthKitDetectedAt else { return }
        pendingHealthKitDetectedAt = nil
        guard Date().timeIntervalSince(detectedAt) <= pendingHealthKitNotificationWindow else {
            print("[RunContext Notifications] pending HealthKit detected notification expired")
            return
        }
        print("[RunContext Notifications] showing pending HealthKit detected notification")
        showHealthKitDetectedNotification()
    }

    private func showHealthKitDetectedNotification() {
        // 디바운스: 한 워크아웃의 단계적 기록으로 옵저버가 여러 번 깨도 알림은 1회만(연발 방지).
        if recentlyShownHealthKitDetected() {
            print("[RunContext Notifications] HealthKit detected notification debounced (recent burst)")
            return
        }
        recordHealthKitDetectedShown()
        // 고정 id — 짧은 시간차로 들어온 대기 알림이 쌓이지 않고 교체된다.
        showImmediateNotification(
            id: "healthkit-detected",
            title: "새 러닝 기록이 감지됐습니다",
            body: "PaceLAB을 열면 HealthKit 기록을 동기화합니다."
        )
    }

    private func recentlyShownHealthKitDetected() -> Bool {
        let last = UserDefaults.standard.double(forKey: lastHealthKitDetectedKey)
        guard last > 0 else { return false }
        return Date().timeIntervalSince1970 - last < healthKitDetectedDebounceWindow
    }

    private func recordHealthKitDetectedShown() {
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: lastHealthKitDetectedKey)
    }

    private func schedule(_ request: RunContextNotificationRequest) {
        let interval = request.date.timeIntervalSinceNow
        guard interval > 1 else { return }
        let content = content(title: request.title, body: request.body)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
        let notification = UNNotificationRequest(identifier: notificationPrefix + request.id, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(notification)
    }

    private func content(title: String, body: String) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = "pacelab-training"
        return content
    }

    private func requestAuthorization(completion: @escaping (Bool) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                completion(true)
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                    completion(granted)
                }
            case .denied:
                print("[RunContext Notifications] authorization denied in iOS Settings")
                completion(false)
            @unknown default:
                print("[RunContext Notifications] authorization unknown status")
                completion(false)
            }
        }
    }

    private func loadSettings() -> RunContextNotificationSettings {
        let payload = UserDefaults.standard.dictionary(forKey: settingsKey) ?? [:]
        return RunContextNotificationSettings(payload: payload)
    }
}

struct RunContextWebView: UIViewRepresentable {
    var onReady: () -> Void = {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onReady: onReady)
    }

    func makeUIView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()
        contentController.add(context.coordinator, name: "runContextHealthKit")
        contentController.add(context.coordinator, name: "runContextWeatherKit")
        contentController.add(context.coordinator, name: "runContextHaptics")
        contentController.add(context.coordinator, name: "runContextNotifications")
        contentController.add(context.coordinator, name: "runContextAuth")
        contentController.add(context.coordinator, name: "runContextLiveRun")
        contentController.add(context.coordinator, name: "runContextLog")
        contentController.addUserScript(WKUserScript(
            source: """
            window.addEventListener('error', function(event) {
              window.webkit.messageHandlers.runContextLog.postMessage('JS error: ' + event.message + ' at ' + event.filename + ':' + event.lineno);
            });
            window.addEventListener('unhandledrejection', function(event) {
              window.webkit.messageHandlers.runContextLog.postMessage('JS rejection: ' + String(event.reason));
            });
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        ))

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController

        let webView = RunContextWKWebView(frame: .zero, configuration: configuration)
        context.coordinator.webView = webView
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = RunContextColors.nativeBackground
        webView.scrollView.backgroundColor = RunContextColors.nativeBackground
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.contentInset = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
        webView.scrollView.minimumZoomScale = 1
        webView.scrollView.maximumZoomScale = 1
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        webView.scrollView.gestureRecognizers?
            .compactMap { $0 as? UITapGestureRecognizer }
            .filter { $0.numberOfTapsRequired >= 2 }
            .forEach { $0.isEnabled = false }
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        loadWebApp(in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.backgroundColor = RunContextColors.nativeBackground
        webView.scrollView.backgroundColor = RunContextColors.nativeBackground
    }

    private func loadWebApp(in webView: WKWebView) {
        webView.load(URLRequest(url: webAppURL))
    }

    private var webAppURL: URL {
        URL(string: "https://lena0611.github.io/RunningCoach/#/")!
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, UNUserNotificationCenterDelegate {
        weak var webView: WKWebView?
        private let importer = HealthKitRunImporter()
        private let weatherImporter = OpenMeteoWeatherImporter()
        private let notificationManager = RunContextNotificationManager()
        private let liveRunTracker = LiveRunTracker()
        private let onReady: () -> Void
        private let minimumSplashDuration: TimeInterval = 1.5
        private let startedAt = Date()
        private var didSignalReady = false

        init(onReady: @escaping () -> Void) {
            self.onReady = onReady
            super.init()
            UNUserNotificationCenter.current().delegate = self
            importer.startRunningWorkoutBackgroundDelivery { [weak self] in
                DispatchQueue.main.async {
                    self?.handleBackgroundHealthKitChange()
                }
            }
            wireLiveRunTracker()
        }

        // #229 라이브 트래커 콜백 → 포그라운드 웹 표시용 JS 전송. 백그라운드 핵심 루프(gap/발화)는
        // 트래커가 직접 돌고, 여기선 화면 갱신용 틱/gap만 웹으로 올린다.
        private func wireLiveRunTracker() {
            liveRunTracker.onTick = { [weak self] seq, elapsedSec, distanceM, instantPaceSec, signal, source in
                self?.sendLiveTick(seq: seq, elapsedSec: elapsedSec, distanceM: distanceM, instantPaceSec: instantPaceSec, signal: signal, source: source)
            }
            liveRunTracker.onGap = { [weak self] timeGapSec, leadState in
                self?.sendLiveGap(timeGapSec: timeGapSec, leadState: leadState)
            }
            liveRunTracker.onStateChange = { [weak self] state in
                self?.sendLiveStateChange(state)
            }
            liveRunTracker.onPermission = { [weak self] status in
                self?.sendLivePermission(status)
            }
            liveRunTracker.onError = { [weak self] code, message in
                self?.sendLiveError(code: code, message: message)
            }
            liveRunTracker.onDiagnostic = { [weak self] text in
                self?.sendLiveDiagnostic(text)
            }
            liveRunTracker.onFinished = { [weak self] distanceM, start, end, cadence in
                self?.saveCompetitionWorkout(distanceM: distanceM, start: start, end: end, cadence: cadence)
            }
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "runContextLog" {
                print("[RunContext WebView]", message.body)
                return
            }

            if message.name == "runContextWeatherKit" {
                handleWeatherMessage(message)
                return
            }

            if message.name == "runContextHaptics" {
                handleHapticsMessage(message)
                return
            }

            if message.name == "runContextNotifications" {
                handleNotificationMessage(message)
                return
            }

            if message.name == "runContextAuth" {
                handleAuthMessage(message)
                return
            }

            if message.name == "runContextLiveRun" {
                handleLiveRunMessage(message)
                return
            }

            guard message.name == "runContextHealthKit" else { return }
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else {
                sendError("지원하지 않는 HealthKit 요청입니다.")
                return
            }

            switch type {
            case "requestRecentRunningWorkouts":
                let days = body["days"] as? Int ?? 14
                print("[RunContext HealthKit] requestRecentRunningWorkouts days=\(days)")
                importer.fetchRecentRunningWorkouts(days: days) { [weak self] result in
                    DispatchQueue.main.async {
                        switch result {
                        case .success(let candidates):
                            print("[RunContext HealthKit] fetched candidates=\(candidates.count)")
                            self?.sendRuns(candidates)
                        case .failure(let error):
                            print("[RunContext HealthKit] failed:", error.localizedDescription)
                            self?.sendError(error.localizedDescription)
                        }
                    }
                }

            case "requestRunningWorkoutsInRange":
                guard let startDate = body["startDate"] as? String,
                      let endDate = body["endDate"] as? String else {
                    sendError("HealthKit 조회 날짜 범위가 부족합니다.")
                    return
                }

                print("[RunContext HealthKit] requestRunningWorkoutsInRange startDate=\(startDate) endDate=\(endDate)")
                importer.fetchRunningWorkouts(startDate: startDate, endDate: endDate) { [weak self] result in
                    DispatchQueue.main.async {
                        switch result {
                        case .success(let candidates):
                            print("[RunContext HealthKit] fetched range candidates=\(candidates.count)")
                            self?.sendRuns(candidates)
                        case .failure(let error):
                            print("[RunContext HealthKit] range failed:", error.localizedDescription)
                            self?.sendError(error.localizedDescription)
                        }
                    }
                }

            case "requestRunningWorkoutByExternalId":
                let externalId = body["externalId"] as? String
                let date = body["date"] as? String
                let startAt = body["startAt"] as? String
                let endAt = body["endAt"] as? String
                let distanceKm = numberValue(body["distanceKm"])
                let durationSec = numberValue(body["durationSec"])
                let request = HealthKitRunRefreshRequest(
                    externalId: externalId?.isEmpty == false ? externalId : nil,
                    date: date,
                    startAt: startAt?.isEmpty == false ? startAt : nil,
                    endAt: endAt?.isEmpty == false ? endAt : nil,
                    distanceKm: distanceKm,
                    durationSec: durationSec
                )

                if request.externalId == nil && (request.date == nil || request.distanceKm == nil) {
                    sendRunUpdateError(externalId: nil, message: "HealthKit 갱신에 필요한 세션 식별 정보가 부족합니다.")
                    return
                }

                print("[RunContext HealthKit] requestRunningWorkoutByExternalId externalId=\(request.externalId ?? "fallback") date=\(request.date ?? "-")")
                importer.fetchRunningWorkout(request: request) { [weak self] result in
                    DispatchQueue.main.async {
                        switch result {
                        case .success(let candidate):
                            print("[RunContext HealthKit] refreshed candidate=\(candidate.externalId)")
                            self?.sendRunUpdate(candidate)
                        case .failure(let error):
                            print("[RunContext HealthKit] refresh failed:", error.localizedDescription)
                            self?.sendRunUpdateError(externalId: request.externalId, message: error.localizedDescription)
                        }
                    }
                }

            case "requestLatestVo2Max":
                print("[RunContext HealthKit] requestLatestVo2Max")
                importer.fetchLatestVo2Max { [weak self] result in
                    DispatchQueue.main.async {
                        switch result {
                        case .success(let sample):
                            print("[RunContext HealthKit] vo2max value=\(sample.value.map { String($0) } ?? "nil")")
                            self?.sendVo2Max(sample)
                        case .failure(let error):
                            print("[RunContext HealthKit] vo2max failed:", error.localizedDescription)
                            self?.sendVo2MaxError(error.localizedDescription)
                        }
                    }
                }

            default:
                sendError("지원하지 않는 HealthKit 요청입니다.")
            }
        }

        private func numberValue(_ value: Any?) -> Double? {
            if let value = value as? Double {
                return value
            }
            if let value = value as? Int {
                return Double(value)
            }
            if let value = value as? NSNumber {
                return value.doubleValue
            }
            return nil
        }

        private func handleHapticsMessage(_ message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else {
                return
            }

            switch type {
            case "selectionChanged":
                let styleText = body["style"] as? String
                let style: UIImpactFeedbackGenerator.FeedbackStyle = styleText == "medium" ? .medium : .light
                let generator = UIImpactFeedbackGenerator(style: style)
                generator.prepare()
                generator.impactOccurred(intensity: 0.55)
            default:
                return
            }
        }

        private func handleWeatherMessage(_ message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else {
                sendWeatherError("지원하지 않는 날씨 요청입니다.")
                return
            }

            guard type == "requestWeatherForecast" else {
                sendWeatherError("지원하지 않는 날씨 요청입니다.")
                return
            }

            print("[RunContext Weather] requestWeatherForecast via Open-Meteo")
            weatherImporter.fetchForecast { [weak self] result in
                DispatchQueue.main.async {
                    switch result {
                    case .success(let snapshot):
                        print("[RunContext Weather] fetched forecast")
                        self?.sendWeatherForecast(snapshot)
                    case .failure(let error):
                        print("[RunContext Weather] failed:", error.localizedDescription)
                        self?.sendWeatherError(error.localizedDescription)
                    }
                }
            }
        }

        private func handleNotificationMessage(_ message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else {
                return
            }

            switch type {
            case "syncNotificationSettings":
                let settings = body["settings"] as? [String: Any] ?? [:]
                let enabled = settings["allEnabled"] as? Bool ?? false
                let payloads = body["notifications"] as? [[String: Any]] ?? []
                let requests = payloads.compactMap(RunContextNotificationRequest.init(payload:))
                print("[RunContext Notifications] received syncNotificationSettings enabled=\(enabled) scheduled=\(requests.count)")
                notificationManager.updateSettings(RunContextNotificationSettings(payload: settings))
                notificationManager.syncScheduledNotifications(enabled: enabled, requests: requests)
            case "showNotification":
                guard let title = body["title"] as? String,
                      let message = body["body"] as? String else {
                    return
                }
                let id = body["id"] as? String ?? "runcontext-now-\(Date().timeIntervalSince1970)"
                notificationManager.showImmediateNotification(id: id, title: title, body: message)
            default:
                return
            }
        }

        private func handleAuthMessage(_ message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else {
                return
            }

            switch type {
            case "saveSession":
                guard let accessToken = body["accessToken"] as? String, !accessToken.isEmpty,
                      let refreshToken = body["refreshToken"] as? String, !refreshToken.isEmpty else {
                    print("[RunContext Auth] saveSession ignored: empty token")
                    return
                }
                RunContextAuthKeychain.save(accessToken: accessToken, refreshToken: refreshToken)
                print("[RunContext Auth] saveSession stored to Keychain")
            case "clearSession":
                RunContextAuthKeychain.clear()
                print("[RunContext Auth] clearSession removed Keychain item")
            case "requestStoredSession":
                print("[RunContext Auth] requestStoredSession received")
                sendStoredSession()
            default:
                print("[RunContext Auth] unsupported type=\(type)")
                return
            }
        }

        private func sendStoredSession() {
            guard let webView else { return }
            let payload: String
            if let stored = RunContextAuthKeychain.load(),
               let data = try? JSONSerialization.data(withJSONObject: [
                   "accessToken": stored.accessToken,
                   "refreshToken": stored.refreshToken
               ]),
               let json = String(data: data, encoding: .utf8) {
                payload = json
                print("[RunContext Auth] sendStoredSession: Keychain hit, restoring session")
            } else {
                payload = "null"
                print("[RunContext Auth] sendStoredSession: Keychain miss, no stored session")
            }
            webView.evaluateJavaScript("window.RunContextAuth?.receiveStoredSession(\(payload));")
        }

        // ── #229 가상레이싱 라이브 트래킹 (runContextLiveRun) ──────────────────

        private func handleLiveRunMessage(_ message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else {
                sendLiveError(code: "bad_request", message: "지원하지 않는 라이브 트래킹 요청입니다.")
                return
            }

            switch type {
            case "startLiveRun":
                let sessionId = body["sessionId"] as? String ?? ""
                let mode = body["mode"] as? String ?? "solo"
                let curve = parseGhostCurve(body["ghostCurve"])
                let config = AnnounceConfig.parse(body["announceConfig"] as? [String: Any])
                let targetDistanceM = (body["targetDistanceM"] as? NSNumber)?.doubleValue ?? 0
                let tickIntervalMs = (body["tickIntervalMs"] as? NSNumber)?.intValue ?? 1000
                print("[RunContext LiveRun] startLiveRun session=\(sessionId) mode=\(mode) ghost=\(curve != nil) periodic=\(config.periodicKind.rawValue) target=\(targetDistanceM)")
                liveRunTracker.start(LiveRunStartParams(
                    sessionId: sessionId,
                    mode: mode,
                    curve: curve,
                    config: config,
                    targetDistanceM: targetDistanceM,
                    tickIntervalMs: tickIntervalMs
                ))
                // #235: 시작(포그라운드)에 write 권한 미리 확보 — 종료가 백그라운드 자동완주여도 저장 가능(Codex 리뷰).
                importer.requestCompetitionWriteAuthorization { _ in }

            case "beginLiveRun":
                print("[RunContext LiveRun] beginLiveRun")
                liveRunTracker.begin()

            case "pauseLiveRun":
                print("[RunContext LiveRun] pauseLiveRun")
                liveRunTracker.pause()

            case "resumeLiveRun":
                print("[RunContext LiveRun] resumeLiveRun")
                liveRunTracker.resume()

            case "stopLiveRun":
                print("[RunContext LiveRun] stopLiveRun")
                liveRunTracker.stop()

            case "requestRecoverableLiveRun":
                print("[RunContext LiveRun] requestRecoverableLiveRun")
                sendLiveRecoverable(liveRunTracker.loadRecoverable())

            default:
                sendLiveError(code: "bad_request", message: "지원하지 않는 라이브 트래킹 요청입니다.")
            }
        }

        private func parseGhostCurve(_ raw: Any?) -> GhostCurve? {
            guard let points = raw as? [[String: Any]], !points.isEmpty else { return nil }
            let parsed = points.compactMap { point -> GhostCurvePoint? in
                guard let d = (point["distanceM"] as? NSNumber)?.doubleValue,
                      let t = (point["elapsedSec"] as? NSNumber)?.doubleValue else { return nil }
                return GhostCurvePoint(distanceM: d, elapsedSec: t)
            }
            return parsed.count >= 2 ? GhostCurve(points: parsed) : nil
        }

        private func sendLiveTick(seq: Int, elapsedSec: Double, distanceM: Double, instantPaceSec: Double?, signal: LiveSignalState, source: LiveDistanceSource) {
            guard let webView else { return }
            let pace = instantPaceSec.map { String($0) } ?? "null"
            let json = "{\"seq\":\(seq),\"elapsedSec\":\(elapsedSec),\"cumulativeDistanceM\":\(distanceM),\"instantPaceSec\":\(pace),\"signalState\":\"\(signal.rawValue)\",\"source\":\"\(source.rawValue)\"}"
            webView.evaluateJavaScript("window.RunContextLiveRun?.receiveTick(\(json));")
        }

        private func sendLiveGap(timeGapSec: Double, leadState: LeadState) {
            guard let webView else { return }
            let json = "{\"timeGapSec\":\(timeGapSec),\"leadState\":\"\(leadState.rawValue)\"}"
            webView.evaluateJavaScript("window.RunContextLiveRun?.receiveGap(\(json));")
        }

        private func sendLiveStateChange(_ state: LiveRunState) {
            guard let webView else { return }
            webView.evaluateJavaScript("window.RunContextLiveRun?.receiveStateChange('\(state.rawValue)');")
        }

        private func sendLivePermission(_ status: LivePermissionStatus) {
            guard let webView else { return }
            webView.evaluateJavaScript("window.RunContextLiveRun?.receivePermission('\(status.rawValue)');")
        }

        private func sendLiveRecoverable(_ snapshot: LiveRunSnapshot?) {
            guard let webView else { return }
            let payload: String
            if let s = snapshot {
                payload = "{\"sessionId\":\"\(jsString(s.sessionId))\",\"elapsedSec\":\(s.elapsedSec),\"cumulativeDistanceM\":\(s.cumulativeDistanceM),\"seq\":\(s.seq),\"state\":\"\(s.state.rawValue)\"}"
            } else {
                payload = "null"
            }
            webView.evaluateJavaScript("window.RunContextLiveRun?.receiveRecoverable(\(payload));")
        }

        // #235: 라이브런 종료 데이터 → HealthKit 운동으로 저장. 성공 시 uuid(externalId)를 웹에
        // 통보해 단건 동기화·결과연결을 트리거한다. 실패는 로그만 — 결과 요약은 웹이
        // PendingSelfRace로 이미 표시하고, HealthKit 유입만 다음 정기 sync로 미뤄지므로 비치명적.
        private func saveCompetitionWorkout(distanceM: Double, start: Date, end: Date, cadence: Double?) {
            importer.saveCompetitionRunningWorkout(distanceMeters: distanceM, start: start, end: end, cadence: cadence) { [weak self] result in
                DispatchQueue.main.async {
                    switch result {
                    case .success(let externalId):
                        print("[RunContext LiveRun] competition workout saved externalId=\(externalId)")
                        self?.sendWorkoutSaved(externalId: externalId, distanceM: distanceM, start: start, end: end, cadence: cadence)
                    case .failure(let error):
                        print("[RunContext LiveRun] competition workout save failed:", error.localizedDescription)
                    }
                }
            }
        }

        private func sendWorkoutSaved(externalId: String, distanceM: Double, start: Date, end: Date, cadence: Double?) {
            guard let webView else { return }
            let durationSec = max(end.timeIntervalSince(start), 0)
            // 웹이 같은 날에도 단건 RunLog를 직접 유입할 수 있도록 시각(epoch ms)을 넘긴다(Codex 리뷰 #1).
            // 포매터 없이 ms로 넘기고 웹에서 ISO·날짜로 변환한다.
            let startMs = start.timeIntervalSince1970 * 1000
            let endMs = end.timeIntervalSince1970 * 1000
            // cadence(분당 걸음 spm)는 값이 없으면 JSON null. 웹 WorkoutSavedPayload.cadence 계약과 일치.
            let cadenceJson = cadence.map { String($0) } ?? "null"
            let json = "{\"externalId\":\"\(jsString(externalId))\",\"distanceM\":\(distanceM),\"durationSec\":\(durationSec),\"startMs\":\(startMs),\"endMs\":\(endMs),\"cadence\":\(cadenceJson)}"
            webView.evaluateJavaScript("window.RunContextLiveRun?.receiveWorkoutSaved(\(json));")
        }

        private func sendLiveError(code: String, message: String) {
            guard let webView else { return }
            let json = "{\"code\":\"\(jsString(code))\",\"message\":\"\(jsString(message))\"}"
            webView.evaluateJavaScript("window.RunContextLiveRun?.receiveError(\(json));")
        }

        private func sendLiveDiagnostic(_ text: String) {
            guard let webView else { return }
            webView.evaluateJavaScript("window.RunContextLiveRun?.receiveDiagnostic('\(jsString(text))');")
        }

        /// JS 문자열 리터럴용 최소 escape(쌍따옴표/역슬래시/개행).
        private func jsString(_ value: String) -> String {
            value
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
        }

        private func handleBackgroundHealthKitChange() {
            // "새 러닝 감지" 알림은 앱이 진짜 백그라운드일 때만 띄운다.
            // 사용자가 앱을 새로 런치하면 HKObserverQuery 등록 직후 초기 콜백이 한 번 발생하는데,
            // 그 시점 applicationState 는 .inactive(.active 아님)다. 과거엔 `!= .active` 라는 이유로
            // 이 초기 콜백을 "새 러닝"으로 오인해, 새 러닝이 0개여도 런치마다 배너가 떴다.
            // → .background 일 때만 알림으로 보내고, active/inactive(런치·전환 중)는 웹 동기화로 처리한다.
            if UIApplication.shared.applicationState == .background {
                notificationManager.showHealthKitDetectedNotificationIfEnabled()
                return
            }
            requestWebHealthKitSync(reason: "background-delivery")
        }

        private func requestWebHealthKitSync(reason: String) {
            guard let webView else { return }
            let escaped = reason
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            webView.evaluateJavaScript("window.RunContextHealthKit?.receiveHealthKitChanged('\(escaped)');")
        }

        func userNotificationCenter(
            _ center: UNUserNotificationCenter,
            willPresent notification: UNNotification,
            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
        ) {
            // 고정 id 는 "pacelab-healthkit-detected"(접미사 없음). 과거엔 끝에 하이픈을 붙여 검사해
            // 매칭이 안 됐고, 포그라운드 발화 때 숨겨야 할 배너가 그대로 노출됐다.
            if notification.request.identifier.hasPrefix("pacelab-healthkit-detected") {
                completionHandler([])
                return
            }
            completionHandler([.banner, .sound, .list])
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self, weak webView] in
                guard let webView else { return }
                webView.evaluateJavaScript("document.body.innerText.trim().length") { result, error in
                    if let error {
                        print("[RunContext WebView] inspect failed:", error.localizedDescription)
                        return
                    }

                    if let length = result as? Int, length == 0 {
                        self?.loadDiagnosticPage(in: webView, reason: "Vue 화면이 렌더링되지 않았습니다.")
                        return
                    }

                    self?.signalReadyAfterMinimumDuration()
                }
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            loadDiagnosticPage(in: webView, reason: "페이지 로딩 실패: \(error.localizedDescription)")
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            loadDiagnosticPage(in: webView, reason: "초기 페이지 로딩 실패: \(error.localizedDescription)")
        }

        private func sendRuns(_ candidates: [HealthKitRunCandidate]) {
            guard let webView else { return }
            do {
                let data = try JSONEncoder().encode(candidates)
                let json = String(data: data, encoding: .utf8) ?? "[]"
                webView.evaluateJavaScript("window.RunContextHealthKit?.receiveRuns(\(json));")
            } catch {
                sendError("HealthKit 응답 직렬화 실패")
            }
        }

        private func sendRunUpdate(_ candidate: HealthKitRunCandidate) {
            guard let webView else { return }
            do {
                let data = try JSONEncoder().encode(candidate)
                let json = String(data: data, encoding: .utf8) ?? "{}"
                webView.evaluateJavaScript("window.RunContextHealthKit?.receiveRunUpdate(\(json));")
            } catch {
                sendRunUpdateError(externalId: candidate.externalId, message: "HealthKit 갱신 응답 직렬화 실패")
            }
        }

        private func sendVo2Max(_ sample: HealthKitVo2MaxSample) {
            guard let webView else { return }
            do {
                let data = try JSONEncoder().encode(sample)
                let json = String(data: data, encoding: .utf8) ?? "{}"
                webView.evaluateJavaScript("window.RunContextHealthKit?.receiveVo2Max(\(json));")
            } catch {
                sendVo2MaxError("HealthKit VO2max 응답 직렬화 실패")
            }
        }

        private func sendVo2MaxError(_ message: String) {
            guard let webView else { return }
            let escaped = message
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")
            webView.evaluateJavaScript("window.RunContextHealthKit?.receiveVo2MaxError('\(escaped)');")
        }

        private func sendWeatherForecast(_ snapshot: RunContextWeatherSnapshot) {
            guard let webView else { return }
            do {
                let data = try JSONEncoder().encode(snapshot)
                let json = String(data: data, encoding: .utf8) ?? "{}"
                webView.evaluateJavaScript("window.RunContextWeatherKit?.receiveForecast(\(json));")
            } catch {
                sendWeatherError("날씨 응답 직렬화 실패")
            }
        }

        private func sendWeatherError(_ message: String) {
            guard let webView else { return }
            let escaped = message
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")
            webView.evaluateJavaScript("window.RunContextWeatherKit?.receiveError('\(escaped)');")
        }

        private func sendError(_ message: String) {
            guard let webView else { return }
            let escaped = message
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")
            webView.evaluateJavaScript("window.RunContextHealthKit?.receiveError('\(escaped)');")
        }

        private func sendRunUpdateError(externalId: String?, message: String) {
            guard let webView else { return }
            let escapedId = (externalId ?? "")
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")
            let escapedMessage = message
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")
            webView.evaluateJavaScript("window.RunContextHealthKit?.receiveRunUpdateError('\(escapedId)', '\(escapedMessage)');")
        }

        private func loadDiagnosticPage(in webView: WKWebView, reason: String) {
            let resources = Bundle.main.urls(forResourcesWithExtension: nil, subdirectory: nil)?
                .map { $0.lastPathComponent }
                .sorted()
                .joined(separator: "<br>") ?? "리소스 목록을 읽을 수 없습니다."
            let html = """
            <!doctype html>
            <html lang="ko">
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; line-height: 1.45; color: #111827; }
                h1 { font-size: 20px; }
                code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; }
                .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; margin-top: 12px; font-size: 13px; overflow-wrap: anywhere; }
              </style>
            </head>
            <body>
              <h1>RunContext 로딩 진단</h1>
              <p>\(reason)</p>
              <p>Xcode 콘솔의 <code>[RunContext WebView]</code> 로그를 확인하세요.</p>
              <div class="box">\(resources)</div>
            </body>
            </html>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }

        private func signalReadyAfterMinimumDuration() {
            guard !didSignalReady else { return }
            didSignalReady = true
            let elapsed = Date().timeIntervalSince(startedAt)
            let delay = max(0, minimumSplashDuration - elapsed)
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [onReady] in
                onReady()
            }
        }
    }
}

/// Supabase 세션(refresh/access token)을 iOS Keychain에 보관한다.
///
/// WKWebView의 localStorage는 앱 삭제 시 함께 사라지지만 Keychain 항목은 재설치 후에도
/// 남기 때문에, 한 번 인증한 기기에서는 OTP 재입력 없이 세션을 복원할 수 있다.
/// `ThisDeviceOnly` 접근성으로 iCloud Keychain 동기화는 막아 토큰을 기기 로컬로 한정한다.
enum RunContextAuthKeychain {
    struct StoredSession {
        let accessToken: String
        let refreshToken: String
    }

    private static let service = "kr.smartscore.pacelab.auth"
    private static let account = "supabase-session"

    static func save(accessToken: String, refreshToken: String) {
        let payload: [String: String] = [
            "accessToken": accessToken,
            "refreshToken": refreshToken
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]

        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            insert[kSecValueData as String] = data
            insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(insert as CFDictionary, nil)
        }
    }

    static func load() -> StoredSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let accessToken = object["accessToken"], !accessToken.isEmpty,
              let refreshToken = object["refreshToken"], !refreshToken.isEmpty else {
            return nil
        }
        return StoredSession(accessToken: accessToken, refreshToken: refreshToken)
    }

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
