// swift-tools-version: 5.9
import PackageDescription

// RaceCore — 웹 `src/shared/lib/selfRace/ghost.ts`의 네이티브 포팅(GhostRaceEngine)을
// iOS 앱과 watchOS 앱이 공유하는 순수 로직 패키지. Foundation 외 의존성 없음.
// (#250 모노레포 · watchOS 레이싱 앱을 위한 3-소비자 미러: web · iOS · watch)
let package = Package(
    name: "RaceCore",
    platforms: [.iOS(.v17), .watchOS(.v10)],
    products: [
        .library(name: "RaceCore", targets: ["RaceCore"])
    ],
    targets: [
        .target(name: "RaceCore"),
        .testTarget(name: "RaceCoreTests", dependencies: ["RaceCore"])
    ]
)
