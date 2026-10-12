// Scientific Football Manager 5v5 — Application iOS
// Ce fichier définit la structure de l'interface iOS
// L'application utilise Bevy via un MetalView pour le rendu

import SwiftUI

// NOTE: Pour l'intégration Bevy sur iOS:
// 1. Ajouter la cible iOS: rustup target add aarch64-apple-ios
// 2. Compiler la lib Rust: cargo build --target aarch64-apple-ios
// 3. Intégrer le .a statique dans le projet Xcode
// 4. Appeler la fonction main Rust depuis AppDelegate

struct ContentView: View {
    @State private var gameStarted = false

    var body: some View {
        ZStack {
            Color.black.edgesIgnoringSafeArea(.all)

            if gameStarted {
                // Ici sera intégré le MetalView de Bevy
                Text("Chargement du jeu...")
                    .foregroundColor(.white)
                    .font(.title)
            } else {
                VStack(spacing: 24) {
                    Text("⚽ Scientific Football Manager")
                        .foregroundColor(.cyan)
                        .font(.largeTitle)
                        .bold()

                    Text("5v5 — L'Intelligence au Service du Ballon")
                        .foregroundColor(.gray)
                        .font(.subheadline)

                    Divider()
                        .background(Color.cyan)
                        .frame(width: 300)

                    Button(action: { gameStarted = true }) {
                        Text("🏟️ JOUER")
                            .frame(width: 200, height: 50)
                            .background(Color.blue.opacity(0.3))
                            .foregroundColor(.white)
                            .cornerRadius(10)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.cyan, lineWidth: 2))
                    }

                    Text("Version iOS - En développement")
                        .foregroundColor(.gray)
                        .font(.caption)
                }
            }
        }
    }
}

// Pour l'intégration Bevy sur iOS, les modifications à faire:
// 1. Créer un AppDelegate qui initialise le runtime Rust
// 2. Passer le MetalLayer à Bevy pour le rendu
// 3. Adapter les touches/gestes pour le tactile

#Preview {
    ContentView()
}
