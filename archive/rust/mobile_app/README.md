# Scientific Football Manager 5v5 — Applications Mobile

Ce dossier contient la structure prête pour le portage de l'application sur Android et iOS.

## Architecture

```
mobile_app/
├── shared/          # Code Rust partagé (modèles, logique de jeu)
│   ├── src/
│   │   ├── lib.rs   # Bibliothèque partagée
│   │   └── ...      # Mêmes modèles que desktop_app/src/models/
├── android/         # Application Android native
│   ├── Cargo.toml   # Crate Android
│   └── app/
│       └── src/main/
│           ├── java/com/scientificfootball/
│           │   └── MainActivity.java
│           ├── res/
│           └── assets/
└── ios/             # Application iOS native
    └── ScientificFootball/
        └── ContentView.swift
```

## Stratégie de portage

### Option 1 : Bevy Mobile (Recommandée)
Bevy supporte nativement Android et iOS. Il suffit d'ajouter les cibles :
```bash
# Android
rustup target add aarch64-linux-android
cargo install cargo-apk

# iOS
rustup target add aarch64-apple-ios
```

### Option 2 : Flutter + Rust FFI
Utiliser Flutter pour l'UI mobile et Rust (via FFI) pour la logique de jeu.

### Modifications nécessaires pour mobile
1. Adapter la taille des éléments UI (écrans tactiles)
2. Ajouter la gestion des gestes (swipe, pinch, tap)
3. Optimiser les performances pour mobile
4. Adapter les résolutions (différentes densités)

## Configuration Android (Cargo.toml)

```toml
[package]
name = "scientific_football_manager_android"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
bevy = { version = "0.15", features = ["android-game-activity"] }
# Désactiver dynamic_linking pour Android/iOS
```

## Configuration iOS

```toml
[package]
name = "scientific_football_manager_ios"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["staticlib"]

[dependencies]
bevy = { version = "0.15" }
```
