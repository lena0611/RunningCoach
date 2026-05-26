import SwiftUI

struct ContentView: View {
    var body: some View {
        RunContextWebView()
            .background(RunContextColors.swiftUIBackground)
            .ignoresSafeArea()
    }
}

#Preview {
    ContentView()
}
