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
            // #229 PoC① 측정 중 임시 진입점. 측정이 끝나면 ContentView() 로 되돌린다(이 브랜치 전용).
            LiveRunPoCView()
        }
    }
}
