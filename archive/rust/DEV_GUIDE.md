# Scientific Football Manager 5v5 - Guide de Developpement

## Prerequis

### Outils necessaires

| Outil | Version | Installation |
|-------|---------|-------------|
| Rust | 1.75+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Cargo | (inclus avec Rust) | - |
| Python 3 | 3.8+ | Pour les tests uniquement |
| Git | 2.x | - |

### Verification de l'installation

```bash
rustc --version    # Doit afficher >= 1.75.0
cargo --version
python3 --version  # >= 3.8 (pour les tests)
```

---

## Structure du Projet

```
Scientific_Football_Manager_5v5/
|-- desktop_app/              # Application desktop (Rust + Bevy 0.15)
|   |-- Cargo.toml
|   |-- src/
|   |   |-- main.rs           # Point d'entree
|   |   |-- game_state.rs     # Etat global du jeu, ecrans, ressources
|   |   |-- models/
|   |   |   |-- mod.rs         # Re-exports des modeles
|   |   |   |-- player.rs     # Joueurs, stats, capacites speciales
|   |   |   |-- team.rs       # Equipes, formations, chimie
|   |   |   |-- match_engine.rs  # Moteur de simulation de match
|   |   |   |-- power_up.rs   # Power-ups scientifiques
|   |   |   |-- scientific_domain.rs  # Domaines scientifiques
|   |   |-- ui/
|   |       |-- mod.rs         # Plugins UI
|   |       |-- styles.rs     # Constantes de style (couleurs, etc.)
|   |       |-- components.rs # Composants UI partages
|   |       |-- menu_principal.rs
|   |       |-- gestion_equipe.rs
|   |       |-- preparation_match.rs
|   |       |-- match_en_cours.rs
|   |       |-- resultat_match.rs
|   |       |-- classement.rs
|   |       |-- fiches_joueurs.rs
|
|-- mobile_app/               # Applications mobiles
|   |-- shared/               # Code Rust partage (sans Bevy)
|   |   |-- Cargo.toml
|   |   |-- src/
|   |       |-- lib.rs        # Bibliotheque + FFI
|   |       |-- models/       # Memes modeles que desktop
|   |-- android/              # Application Android
|   |   |-- Cargo.toml
|   |   |-- app/
|   |-- ios/                  # Application iOS
|       |-- ScientificFootball/
|           |-- ContentView.swift
|
|-- tests/                    # Tests Python
|   |-- run_all_tests.py      # Runner principal
|   |-- test_player_stats.py
|   |-- test_team_management.py
|   |-- test_match_engine.py
|   |-- test_power_ups.py
|   |-- test_scientific_domains.py
|   |-- test_game_balance.py
|   |-- test_mobile_parity.py
```

---

## Lancer l'Application en Mode Dev

### Desktop (Recommande pour le developpement)

```bash
cd desktop_app

# Mode dev avec compilation rapide (dynamic linking)
cargo run --features dev

# Mode release (optimise, pour tester les performances)
cargo run --release

# Build uniquement (sans executer)
cargo build --features dev
```

> **Note** : Le feature `dev` active `bevy/dynamic_linking` qui accelere
> considerablement la recompilation incrementale (de ~30s a ~2s).
> Ne JAMAIS utiliser `--features dev` pour un build de production.

### Build de Production

```bash
cd desktop_app

# Build de production optimise
cargo build --release

# L'executable se trouve dans :
# target/release/scientific_football_manager
```

---

## Lancer les Tests

### Tests Python (logique metier)

```bash
# Depuis la racine du projet
python3 tests/run_all_tests.py

# Ou un test specifique
python3 tests/test_player_stats.py
python3 tests/test_match_engine.py
python3 tests/test_game_balance.py
```

### Tests Rust integres

```bash
cd desktop_app
cargo test

# Tests avec output visible
cargo test -- --nocapture

# Test specifique
cargo test test_creation_tous_joueurs -- --nocapture
```

### Tests de la bibliotheque mobile partagee

```bash
cd mobile_app/shared
cargo test
```

---

## Suites de Tests Disponibles

| Suite | Fichier | Description |
|-------|---------|-------------|
| Stats Joueurs | `test_player_stats.py` | Statistiques, bonus de domaine, stamina, notes |
| Gestion Equipe | `test_team_management.py` | Formations, chimie, selection auto, gardien |
| Moteur Match | `test_match_engine.py` | Simulation, periodes, scores, pause/reprise |
| Power-Ups | `test_power_ups.py` | Durees, raretes, modificateurs, inventaire |
| Domaines | `test_scientific_domains.py` | Bonus, compatibilites, couleurs, equilibrage |
| Equilibrage | `test_game_balance.py` | Monte Carlo 1000 saisons, variete scores |
| Parite Mobile | `test_mobile_parity.py` | Coherence desktop/mobile, FFI, Cargo.toml |

---

## Architecture Technique

### Moteur de jeu : Bevy 0.15

L'application utilise l'ECS (Entity Component System) de Bevy :

- **Etats** : `EcranJeu` (enum) gere les ecrans via `States`
- **Systemes** : Chaque ecran a ses systemes `OnEnter`, `OnExit`, `Update`
- **Ressources** : `EtatJeu` (Resource) contient tout l'etat du jeu
- **Composants** : Marqueurs d'ecran (`EcranMenuPrincipal`, etc.) pour le nettoyage

### Flux de jeu

```
MenuPrincipal
    |-- Init Demo --> Cree 2 equipes avec 15 joueurs
    |-- Jouer --> SelectionEquipe --> MatchEnCours --> ResultatMatch
    |-- Gestion Equipes --> Selection titulaires, entrainement
    |-- Classement --> Tableau des points
    |-- Fiches Joueurs --> Details par joueur
```

### Modele de donnees

- **15 joueurs** reels avec stats personnalisees
- **13 domaines scientifiques** avec bonus/malus uniques
- **4 formations** (1-2-1, 1-1-2, 2-1-1, 1-1-1-1)
- **15 power-ups** de 5 raretes differentes
- **Chimie d'equipe** basee sur les compatibilites de domaines

---

## Mobile

### Android

```bash
# Prerequis
rustup target add aarch64-linux-android
cargo install cargo-apk

# Build
cd mobile_app/android
cargo apk build --release
```

### iOS

```bash
# Prerequis
rustup target add aarch64-apple-ios

# Build la lib statique
cd mobile_app/shared
cargo build --target aarch64-apple-ios --release

# Integrer le .a dans le projet Xcode
```

---

## Corrections de Production Appliquees

### Bugs Critiques Corriges

1. **`dynamic_linking` en production** : Deplace dans un feature `dev` optionnel
2. **Gardien jamais assigne** : L'auto-selection choisit maintenant le meilleur
   joueur defensif comme gardien (score = defense * 0.6 + jeu_de_tete * 0.4)
3. **`position_actuelle` non mise a jour** : Chaque joueur titulaire a maintenant
   sa `position_actuelle` correctement definie lors de la selection auto
4. **Query conflicts Bevy** : Les 4 queries mutables sur `BackgroundColor` dans
   `gerer_controles_match` ont ete fusionnees en une seule query avec `Option<>`
5. **Limite d'effectif** : Corrigee de 10 a 15 joueurs (coherent avec `team.rs`)
6. **Commentaire Bevy** : Corrige "0.13" en "0.15" dans `main.rs`
7. **Import inutile** : `use crate::ui::gestion_equipe::*` retire de `preparation_match.rs`

---

## Conventions de Code

- Noms en francais pour la logique metier (joueur, equipe, match, etc.)
- Noms en anglais pour les aspects techniques (Plugin, Component, Resource)
- Documentation des fonctions publiques
- Tests unitaires dans les modules (`#[cfg(test)]`)
