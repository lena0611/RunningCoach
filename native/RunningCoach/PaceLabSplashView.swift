import SwiftUI

struct PaceLabSplashView: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 10 / 255, green: 13 / 255, blue: 18 / 255),
                    Color(red: 14 / 255, green: 17 / 255, blue: 22 / 255)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .overlay(alignment: .topTrailing) {
                Circle()
                    .fill(Color(red: 214 / 255, green: 255 / 255, blue: 53 / 255).opacity(0.12))
                    .frame(width: 360, height: 360)
                    .blur(radius: 78)
                    .offset(x: 110, y: -140)
            }
            .overlay(alignment: .bottomLeading) {
                Circle()
                    .fill(Color.indigo.opacity(0.14))
                    .frame(width: 320, height: 320)
                    .blur(radius: 92)
                    .offset(x: -120, y: 130)
            }

            VStack(spacing: 24) {
                PaceLabMark()
                    .frame(width: 92, height: 92)
                    .padding(20)
                    .background(
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .fill(Color(red: 214 / 255, green: 255 / 255, blue: 53 / 255).opacity(0.08))
                            .overlay(
                                RoundedRectangle(cornerRadius: 28, style: .continuous)
                                    .stroke(Color(red: 214 / 255, green: 255 / 255, blue: 53 / 255).opacity(0.3), lineWidth: 1)
                            )
                    )

                VStack(spacing: 10) {
                    HStack(spacing: 0) {
                        Text("PACE")
                            .foregroundStyle(.white)
                        Text("LAB")
                            .foregroundStyle(Color(red: 214 / 255, green: 255 / 255, blue: 53 / 255))
                    }
                    .font(.system(size: 40, weight: .black, design: .default).italic())

                    Text("AI POWERED TRAINING LAB")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Color(red: 148 / 255, green: 163 / 255, blue: 184 / 255))
                        .tracking(4)
                }
            }
        }
        .ignoresSafeArea()
    }
}

private struct PaceLabMark: View {
    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            let lime = Color(red: 214 / 255, green: 255 / 255, blue: 53 / 255)
            ZStack {
                Path { path in
                    path.move(to: CGPoint(x: size * 0.31, y: size * 0.26))
                    path.addCurve(
                        to: CGPoint(x: size * 0.57, y: size * 0.22),
                        control1: CGPoint(x: size * 0.36, y: size * 0.16),
                        control2: CGPoint(x: size * 0.49, y: size * 0.16)
                    )
                    path.move(to: CGPoint(x: size * 0.56, y: size * 0.22))
                    path.addLine(to: CGPoint(x: size * 0.69, y: size * 0.22))
                }
                .stroke(lime, style: StrokeStyle(lineWidth: size * 0.065, lineCap: .round, lineJoin: .round))

                Circle()
                    .fill(lime)
                    .frame(width: size * 0.16, height: size * 0.16)
                    .position(x: size * 0.49, y: size * 0.31)

                Path { path in
                    path.move(to: CGPoint(x: size * 0.50, y: size * 0.44))
                    path.addLine(to: CGPoint(x: size * 0.42, y: size * 0.58))
                    path.addLine(to: CGPoint(x: size * 0.56, y: size * 0.64))
                    path.move(to: CGPoint(x: size * 0.45, y: size * 0.53))
                    path.addLine(to: CGPoint(x: size * 0.30, y: size * 0.55))
                    path.move(to: CGPoint(x: size * 0.56, y: size * 0.64))
                    path.addLine(to: CGPoint(x: size * 0.47, y: size * 0.81))
                    path.move(to: CGPoint(x: size * 0.58, y: size * 0.65))
                    path.addLine(to: CGPoint(x: size * 0.75, y: size * 0.71))
                    path.move(to: CGPoint(x: size * 0.50, y: size * 0.45))
                    path.addLine(to: CGPoint(x: size * 0.66, y: size * 0.49))
                    path.addLine(to: CGPoint(x: size * 0.76, y: size * 0.38))
                }
                .stroke(lime, style: StrokeStyle(lineWidth: size * 0.075, lineCap: .round, lineJoin: .round))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

#Preview {
    PaceLabSplashView()
}
