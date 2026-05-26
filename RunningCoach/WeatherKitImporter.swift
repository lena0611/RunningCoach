import Foundation
import CoreLocation
import WeatherKit

struct RunContextWeatherSnapshot: Codable {
    let locationName: String?
    let observedAt: String
    let current: RunContextCurrentWeather
    let hourly: [RunContextHourlyWeather]
    let daily: [RunContextDailyWeather]
}

struct RunContextCurrentWeather: Codable {
    let temperatureC: Double?
    let apparentTemperatureC: Double?
    let humidity: Double?
    let windMps: Double?
    let precipitationIntensityMmPerHour: Double?
    let condition: String
    let symbolName: String
    let isDaylight: Bool
}

struct RunContextHourlyWeather: Codable {
    let time: String
    let temperatureC: Double?
    let apparentTemperatureC: Double?
    let precipitationChance: Double?
    let precipitationAmountMm: Double?
    let precipitationIntensityMmPerHour: Double?
    let condition: String
    let symbolName: String
    let isDaylight: Bool
}

struct RunContextDailyWeather: Codable {
    let date: String
    let minTemperatureC: Double?
    let maxTemperatureC: Double?
    let precipitationChance: Double?
    let precipitationAmountMm: Double?
    let symbolName: String
    let condition: String
}

final class WeatherKitImporter: NSObject, CLLocationManagerDelegate {
    private let locationManager = CLLocationManager()
    private let weatherService = WeatherService.shared
    private var locationCompletion: ((Result<CLLocation, Error>) -> Void)?

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyThreeKilometers
    }

    func fetchForecast(completion: @escaping (Result<RunContextWeatherSnapshot, Error>) -> Void) {
        requestLocation { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let location):
                Task {
                    do {
                        let weather = try await self.weatherService.weather(for: location)
                        let snapshot = self.buildSnapshot(from: weather, location: location)
                        completion(.success(snapshot))
                    } catch {
                        completion(.failure(error))
                    }
                }
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }

    private func requestLocation(completion: @escaping (Result<CLLocation, Error>) -> Void) {
        guard CLLocationManager.locationServicesEnabled() else {
            completion(.failure(WeatherKitImportError.locationUnavailable))
            return
        }

        locationCompletion = completion

        switch locationManager.authorizationStatus {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            locationManager.requestLocation()
        case .denied, .restricted:
            finishLocation(.failure(WeatherKitImportError.authorizationDenied))
        @unknown default:
            finishLocation(.failure(WeatherKitImportError.authorizationDenied))
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .denied, .restricted:
            finishLocation(.failure(WeatherKitImportError.authorizationDenied))
        case .notDetermined:
            break
        @unknown default:
            finishLocation(.failure(WeatherKitImportError.authorizationDenied))
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            finishLocation(.failure(WeatherKitImportError.locationUnavailable))
            return
        }
        finishLocation(.success(location))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finishLocation(.failure(error))
    }

    private func finishLocation(_ result: Result<CLLocation, Error>) {
        guard let completion = locationCompletion else { return }
        locationCompletion = nil
        completion(result)
    }

    private func buildSnapshot(from weather: Weather, location: CLLocation) -> RunContextWeatherSnapshot {
        let current = weather.currentWeather
        let hourly = Array(weather.hourlyForecast.prefix(24)).map { hour in
            let precipitationAmount = millimeters(hour.precipitationAmount)
            return RunContextHourlyWeather(
                time: Self.isoFormatter.string(from: hour.date),
                temperatureC: celsius(hour.temperature),
                apparentTemperatureC: celsius(hour.apparentTemperature),
                precipitationChance: rounded(hour.precipitationChance),
                precipitationAmountMm: precipitationAmount,
                precipitationIntensityMmPerHour: precipitationAmount,
                condition: String(describing: hour.condition),
                symbolName: hour.symbolName,
                isDaylight: hour.isDaylight
            )
        }
        let daily = Array(weather.dailyForecast.prefix(7)).map { day in
            RunContextDailyWeather(
                date: Self.dayFormatter.string(from: day.date),
                minTemperatureC: celsius(day.lowTemperature),
                maxTemperatureC: celsius(day.highTemperature),
                precipitationChance: rounded(day.precipitationChance),
                precipitationAmountMm: nil,
                symbolName: day.symbolName,
                condition: String(describing: day.condition)
            )
        }

        return RunContextWeatherSnapshot(
            locationName: nil,
            observedAt: Self.isoFormatter.string(from: current.date),
            current: RunContextCurrentWeather(
                temperatureC: celsius(current.temperature),
                apparentTemperatureC: celsius(current.apparentTemperature),
                humidity: rounded(current.humidity),
                windMps: rounded(current.wind.speed.converted(to: .metersPerSecond).value),
                precipitationIntensityMmPerHour: nil,
                condition: String(describing: current.condition),
                symbolName: current.symbolName,
                isDaylight: current.isDaylight
            ),
            hourly: hourly,
            daily: daily
        )
    }

    private func celsius(_ measurement: Measurement<UnitTemperature>) -> Double {
        rounded(measurement.converted(to: .celsius).value)
    }

    private func millimeters(_ measurement: Measurement<UnitLength>) -> Double {
        rounded(measurement.converted(to: .millimeters).value)
    }

    private func rounded(_ value: Double) -> Double {
        Self.rounded(value)
    }

    private static func rounded(_ value: Double) -> Double {
        (value * 100).rounded() / 100
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

enum WeatherKitImportError: LocalizedError {
    case authorizationDenied
    case locationUnavailable

    var errorDescription: String? {
        switch self {
        case .authorizationDenied:
            return "위치 권한이 허용되지 않아 기상정보를 가져올 수 없습니다."
        case .locationUnavailable:
            return "현재 위치를 확인할 수 없어 기상정보를 가져올 수 없습니다."
        }
    }
}
