import CoreLocation
import Foundation
import OpenClawKit

/// Monitors significant location changes and pushes `location.update`
/// events to the gateway so the severance hook can determine whether
/// the user is at their configured work location.
@MainActor
final class SignificantLocationMonitor {
    private let locationService: any LocationServicing
    private let locationMode: () -> OpenClawLocationMode
    private let sendEvent: @Sendable (String, String) async -> Void

    init(
        locationService: any LocationServicing,
        locationMode: @escaping () -> OpenClawLocationMode,
        sendEvent: @escaping @Sendable (String, String) async -> Void
    ) {
        self.locationService = locationService
        self.locationMode = locationMode
        self.sendEvent = sendEvent
    }

    func start() {
        let mode = self.locationMode()
        guard mode == .always else { return }
        let status = self.locationService.authorizationStatus()
        guard status == .authorizedAlways else { return }
        self.locationService.startMonitoringSignificantLocationChanges { [weak self] location in
            guard self != nil else { return }
            struct Payload: Codable {
                var lat: Double
                var lon: Double
                var accuracyMeters: Double
                var source: String?
            }
            let payload = Payload(
                lat: location.coordinate.latitude,
                lon: location.coordinate.longitude,
                accuracyMeters: location.horizontalAccuracy,
                source: "ios-significant-location")
            guard let data = try? JSONEncoder().encode(payload),
                  let json = String(data: data, encoding: .utf8)
            else { return }
            Task { @MainActor in
                await self?.sendEvent("location.update", json)
            }
        }
    }
}
