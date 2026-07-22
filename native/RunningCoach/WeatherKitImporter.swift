import Foundation
import CoreLocation

// 현위치 좌표만 웹에 제공하는 프로바이더.
// 과거에는 여기서 Open-Meteo 날씨까지 받아 웹에 실어보냈으나(#219 이후 이관),
// 이제 날씨는 웹의 KMA(weather-run) 경로로 통일한다 — 네이티브는 위치 해석만 담당한다.
// (파일명은 pbxproj 참조 안정성을 위해 유지한다.)
final class NativeLocationProvider: NSObject, CLLocationManagerDelegate {
    private let locationManager = CLLocationManager()
    private var completion: ((Result<CLLocationCoordinate2D, Error>) -> Void)?
    private var timeout: DispatchWorkItem?
    private var lastLocation: CLLocation?

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyThreeKilometers
    }

    func requestCoords(completion: @escaping (Result<CLLocationCoordinate2D, Error>) -> Void) {
        if let cached = lastLocation, abs(cached.timestamp.timeIntervalSinceNow) < 30 * 60 {
            completion(.success(cached.coordinate))
            return
        }

        self.completion = completion
        startTimeout()

        switch locationManager.authorizationStatus {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            requestCurrentLocation()
        case .denied, .restricted:
            finish(.failure(NativeLocationError.authorizationDenied))
        @unknown default:
            finish(.failure(NativeLocationError.authorizationDenied))
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            requestCurrentLocation()
        case .denied, .restricted:
            finish(.failure(NativeLocationError.authorizationDenied))
        case .notDetermined:
            break
        @unknown default:
            finish(.failure(NativeLocationError.authorizationDenied))
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            finish(.failure(NativeLocationError.locationUnavailable))
            return
        }
        lastLocation = location
        finish(.success(location.coordinate))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if let cached = manager.location, abs(cached.timestamp.timeIntervalSinceNow) < 24 * 60 * 60 {
            finish(.success(cached.coordinate))
            return
        }
        finish(.failure(error))
    }

    private func startTimeout() {
        timeout?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self, self.completion != nil else { return }
            if let cached = self.locationManager.location, abs(cached.timestamp.timeIntervalSinceNow) < 24 * 60 * 60 {
                self.finish(.success(cached.coordinate))
                return
            }
            self.finish(.failure(NativeLocationError.locationTimeout))
        }
        timeout = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 25, execute: item)
    }

    private func finish(_ result: Result<CLLocationCoordinate2D, Error>) {
        guard let completion else { return }
        timeout?.cancel()
        timeout = nil
        self.completion = nil
        completion(result)
    }

    private func requestCurrentLocation() {
        if let cached = locationManager.location, abs(cached.timestamp.timeIntervalSinceNow) < 30 * 60 {
            finish(.success(cached.coordinate))
            return
        }
        locationManager.requestLocation()
    }
}

enum NativeLocationError: LocalizedError {
    case authorizationDenied
    case locationTimeout
    case locationUnavailable

    var errorDescription: String? {
        switch self {
        case .authorizationDenied:
            return "위치 권한이 허용되지 않아 날씨를 가져올 수 없습니다."
        case .locationTimeout:
            return "위치 확인이 지연되고 있습니다. 잠시 후 새로고침해 주세요."
        case .locationUnavailable:
            return "현재 위치를 확인할 수 없어 날씨를 가져올 수 없습니다."
        }
    }
}
