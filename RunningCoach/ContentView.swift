import SwiftUI

struct ContentView: View {
    var body: some View {
        RunContextWebView()
            .ignoresSafeArea(edges: .bottom)
    }
}

#Preview {
    ContentView()
}
