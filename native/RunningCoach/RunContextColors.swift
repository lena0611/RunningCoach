import SwiftUI
import UIKit

enum RunContextColors {
    // 웹이 다크 단일 테마(--color-bg #0E1116)라 기기 라이트 모드에서도 배경을 다크로 고정한다.
    static let darkBackground = UIColor(red: 14 / 255, green: 17 / 255, blue: 22 / 255, alpha: 1)

    static var nativeBackground: UIColor {
        darkBackground
    }

    static var swiftUIBackground: Color {
        Color(nativeBackground)
    }
}
