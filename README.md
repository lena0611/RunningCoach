# RunningCoach Native Swift

iOS wrapper for RunContext.

The app keeps the UI in the GitHub Pages Vue app and provides native bridges for iOS-only data access.

## Current Setup

- Xcode project: `RunningCoach.xcodeproj`
- WebView URL: `https://lena0611.github.io/RunningCoach/#/`
- Bundle Identifier: `com.lena0611.RunningCoach`
- Supported native bridge: HealthKit running workout import
- Disabled for Personal Team builds: WeatherKit

## Signing Notes

The iPhone Apple ID and Apple Developer account email do not define the Bundle Identifier.

Keep the Bundle Identifier fixed:

```txt
com.lena0611.RunningCoach
```

Do not change it to `com.lenas0611.RunningCoach` even if the iPhone Apple ID uses `lenas0611@gmail.com`.

Personal Team signing does not support WeatherKit provisioning. Keep WeatherKit capability and entitlement off unless the project moves to a paid Apple Developer Program account or uses another weather data path.

## Build Check

For a local compile check without device signing:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
xcodebuild \
  -project RunningCoach.xcodeproj \
  -scheme RunningCoach \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```
