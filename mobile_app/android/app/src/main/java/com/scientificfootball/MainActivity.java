package com.scientificfootball;

// Scientific Football Manager 5v5 — Application Android
// Ce fichier servira de point d'entrée pour l'application Android
// En utilisant Bevy avec le feature "android-game-activity"

// Pour Bevy 0.15 sur Android, l'entrée principale est gérée par Rust via GameActivity
// Ce fichier Java n'est qu'un shell minimal

// import android.os.Bundle;
// import com.google.androidgamesdk.GameActivity;

// public class MainActivity extends GameActivity {
//     static {
//         System.loadLibrary("scientific_football_manager");
//     }
// }

// Pour une implémentation Flutter + FFI, voir la documentation dans mobile_app/README.md
// La bibliothèque Rust partagée est dans mobile_app/shared/

/**
 * NOTE D'IMPLÉMENTATION:
 * Pour déployer sur Android, les étapes sont:
 * 1. Installer cargo-apk: cargo install cargo-apk
 * 2. Configurer l'Android NDK
 * 3. Modifier Cargo.toml pour utiliser les features Android de Bevy
 * 4. Compiler: cargo apk build
 */
public class MainActivity {
    // Placeholder - sera remplacé par GameActivity lors de l'implémentation
}
