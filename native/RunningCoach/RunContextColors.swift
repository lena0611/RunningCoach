import SwiftUI
import UIKit

enum RunContextColors {
    static let darkBackground = UIColor(red: 11 / 255, green: 15 / 255, blue: 20 / 255, alpha: 1)
    static let lightBackground = UIColor(red: 243 / 255, green: 246 / 255, blue: 244 / 255, alpha: 1)

    static var nativeBackground: UIColor {
        UIColor { traits in
            traits.userInterfaceStyle == .dark ? darkBackground : lightBackground
        }
    }

    static var swiftUIBackground: Color {
        Color(nativeBackground)
    }
}
