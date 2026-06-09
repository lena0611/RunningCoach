//
//  RunningCoachApp.swift
//  RunningCoach
//
//  Created by SMART-TN-083 on 5/21/26.
//

import SwiftUI
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        .portrait
    }
}

@main
struct RunningCoachApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            // #229 본구현 검증 중 임시 진입점. 검증이 끝나면 ContentView() 로 복원한다(이 브랜치 전용).
            LiveRunDebugView()
        }
    }
}
