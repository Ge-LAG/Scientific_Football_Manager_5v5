// Scientific Football Manager 5v5
// Application de gestion d'équipes de football avec des scientifiques !
// Développé avec Bevy 0.13

#![allow(unused_imports, dead_code)]

mod models;
mod game_state;
mod ui;

use bevy::prelude::*;
use bevy::window::{Window, WindowPlugin, WindowMode};
use game_state::{EcranJeu, EtatJeu, EvtChangerEcran, EvtDemarrerMatch, EvtPauseMatch, EvtReprendreMatch, EvtSubstitution};
use ui::UIPlugin;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Scientific Football Manager 5v5 🔬⚽".to_string(),
                resolution: (1280.0, 800.0).into(),
                mode: WindowMode::Windowed,
                resizable: true,
                ..default()
            }),
            ..default()
        }))
        // État du jeu (machine à états pour les écrans)
        .init_state::<EcranJeu>()
        // Ressource principale
        .init_resource::<EtatJeu>()
        // Événements
        .add_event::<EvtChangerEcran>()
        .add_event::<EvtDemarrerMatch>()
        .add_event::<EvtPauseMatch>()
        .add_event::<EvtReprendreMatch>()
        .add_event::<EvtSubstitution>()
        // Plugins UI
        .add_plugins(UIPlugin)
        // Systèmes de démarrage
        .add_systems(Startup, (
            initialiser_camera,
            initialiser_jeu,
        ))
        .run();
}

/// Initialiser la caméra 2D pour l'interface
fn initialiser_camera(mut commands: Commands) {
    commands.spawn(Camera2d);
}

/// Initialiser le jeu avec les équipes de démo
fn initialiser_jeu(mut etat_jeu: ResMut<EtatJeu>) {
    etat_jeu.initialiser_equipes_demo();
    info!("🔬 Scientific Football Manager 5v5 démarré !");
    info!("📊 {} équipes initialisées", etat_jeu.equipes.len());
    for equipe in &etat_jeu.equipes {
        info!("  🏟️ {} - {} joueurs ({} titulaires)",
            equipe.nom,
            equipe.joueurs.len(),
            equipe.get_titulaires().len()
        );
    }
}
