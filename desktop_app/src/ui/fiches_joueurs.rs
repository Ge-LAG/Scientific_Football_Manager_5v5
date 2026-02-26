use bevy::prelude::*;
use crate::game_state::{EcranJeu, EtatJeu};
use crate::models::player::Joueur;
use crate::ui::styles::*;
use crate::ui::components::*;
use crate::ui::menu_principal::nettoyer_ecran;

pub struct FichesJoueursPlugin;

impl Plugin for FichesJoueursPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(EcranJeu::FichesJoueurs), afficher_fiches)
           .add_systems(OnExit(EcranJeu::FichesJoueurs), nettoyer_ecran::<EcranFichesJoueurs>)
           .add_systems(Update, gerer_boutons_fiches.run_if(in_state(EcranJeu::FichesJoueurs)));
    }
}

fn afficher_fiches(
    mut commands: Commands,
    etat_jeu: Res<EtatJeu>,
) {
    // Collecter tous les joueurs de toutes les équipes
    let mut tous_joueurs: Vec<(&Joueur, &str)> = Vec::new();
    for equipe in &etat_jeu.equipes {
        for joueur in &equipe.joueurs {
            tous_joueurs.push((joueur, &equipe.nom));
        }
    }

    commands.spawn((
        Node {
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            ..default()
        },
        BackgroundColor(COULEUR_FOND),
        EcranFichesJoueurs,
    )).with_children(|parent| {
        // En-tête
        parent.spawn((
            Node {
                width: Val::Percent(100.0),
                height: Val::Px(56.0),
                flex_direction: FlexDirection::Row,
                align_items: AlignItems::Center,
                padding: UiRect::horizontal(Val::Px(16.0)),
                border: UiRect::bottom(Val::Px(1.0)),
                column_gap: Val::Px(16.0),
                ..default()
            },
            BackgroundColor(Color::srgba(0.06, 0.06, 0.14, 1.0)),
            BorderColor(COULEUR_BORDURE),
        )).with_children(|nav| {
            nav.spawn((
                Button,
                Node {
                    width: Val::Px(100.0),
                    height: Val::Px(36.0),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    border: UiRect::all(Val::Px(1.0)),
                    ..default()
                },
                BackgroundColor(COULEUR_BTN_NORMAL),
                BorderColor(COULEUR_BORDURE),
                BorderRadius::all(Val::Px(4.0)),
                BoutonNavigation(EcranJeu::MenuPrincipal),
            )).with_children(|btn| {
                btn.spawn((
                    Text::new("← Retour"),
                    TextFont { font_size: 14.0, ..default() },
                    TextColor(COULEUR_TEXTE),
                ));
            });

            nav.spawn((
                Text::new(format!("📋 Fiches Joueurs ({} joueurs)", tous_joueurs.len())),
                TextFont { font_size: 22.0, ..default() },
                TextColor(COULEUR_ACCENT),
            ));
        });

        // Grille des joueurs
        parent.spawn((
            Node {
                width: Val::Percent(100.0),
                flex_grow: 1.0,
                flex_direction: FlexDirection::Row,
                flex_wrap: FlexWrap::Wrap,
                padding: UiRect::all(Val::Px(12.0)),
                overflow: Overflow::scroll_y(),
                align_content: AlignContent::FlexStart,
                row_gap: Val::Px(8.0),
                column_gap: Val::Px(8.0),
                ..default()
            },
        )).with_children(|grille| {
            for (joueur, equipe_nom) in &tous_joueurs {
                afficher_fiche_joueur(grille, joueur, equipe_nom);
            }

            if tous_joueurs.is_empty() {
                grille.spawn((
                    Text::new("Aucun joueur. Initialisez les équipes depuis le menu principal."),
                    TextFont { font_size: 16.0, ..default() },
                    TextColor(COULEUR_TEXTE_SECONDAIRE),
                ));
            }
        });
    });
}

fn afficher_fiche_joueur(parent: &mut ChildBuilder, joueur: &Joueur, equipe_nom: &str) {
    let couleur_domaine = couleur_domaine(&joueur.domaine);
    let note = joueur.note_globale();

    let couleur_note = if note >= 80.0 { COULEUR_SUCCES }
        else if note >= 65.0 { COULEUR_ACCENT }
        else if note >= 50.0 { COULEUR_AVERTISSEMENT }
        else { COULEUR_ERREUR };

    parent.spawn((
        Node {
            flex_direction: FlexDirection::Column,
            width: Val::Px(210.0),
            padding: UiRect::all(Val::Px(10.0)),
            border: UiRect::all(Val::Px(2.0)),
            row_gap: Val::Px(4.0),
            ..default()
        },
        BackgroundColor(COULEUR_PANNEAU),
        BorderColor(couleur_domaine),
        BorderRadius::all(Val::Px(8.0)),
    )).with_children(|card| {
        // En-tête de la carte
        card.spawn((
            Node {
                flex_direction: FlexDirection::Row,
                justify_content: JustifyContent::SpaceBetween,
                align_items: AlignItems::Center,
                width: Val::Percent(100.0),
                ..default()
            },
        )).with_children(|header| {
            header.spawn((
                Text::new(&joueur.prenom),
                TextFont { font_size: 16.0, ..default() },
                TextColor(COULEUR_TEXTE),
            ));
            // Note globale
            header.spawn((
                Node {
                    padding: UiRect { left: Val::Px(6.0), right: Val::Px(6.0), ..UiRect::all(Val::Px(2.0)) },
                    border: UiRect::all(Val::Px(1.0)),
                    ..default()
                },
                BackgroundColor(Color::srgba(couleur_note.to_srgba().red, couleur_note.to_srgba().green, couleur_note.to_srgba().blue, 0.2)),
                BorderColor(couleur_note),
                BorderRadius::all(Val::Px(4.0)),
            )).with_children(|note_box| {
                note_box.spawn((
                    Text::new(format!("{:.0}", note)),
                    TextFont { font_size: 14.0, ..default() },
                    TextColor(couleur_note),
                ));
            });
        });

        // Domaine scientifique
        card.spawn((
            Text::new(joueur.domaine.get_name()),
            TextFont { font_size: 10.0, ..default() },
            TextColor(couleur_domaine),
        ));

        // Équipe & Position
        card.spawn((
            Text::new(format!("{} | {}", equipe_nom, joueur.position_preferee.get_name())),
            TextFont { font_size: 11.0, ..default() },
            TextColor(COULEUR_TEXTE_SECONDAIRE),
        ));

        // Séparateur
        card.spawn((
            Node {
                width: Val::Percent(100.0),
                height: Val::Px(1.0),
                ..default()
            },
            BackgroundColor(Color::srgba(couleur_domaine.to_srgba().red, couleur_domaine.to_srgba().green, couleur_domaine.to_srgba().blue, 0.3)),
        ));

        // Stats en barres
        let stats = [
            ("VIT", joueur.stats_effectives.vitesse, Color::srgb(0.9, 0.9, 0.2)),
            ("FOR", joueur.stats_effectives.force, Color::srgb(0.9, 0.4, 0.2)),
            ("PRE", joueur.stats_effectives.precision, Color::srgb(0.2, 0.9, 0.9)),
            ("END", joueur.stats_effectives.endurance, Color::srgb(0.2, 0.9, 0.4)),
            ("INT", joueur.stats_effectives.intelligence, Color::srgb(0.4, 0.4, 0.9)),
            ("CRE", joueur.stats_effectives.creativite, Color::srgb(0.9, 0.2, 0.9)),
            ("DEF", joueur.stats_effectives.defense, Color::srgb(0.5, 0.7, 0.9)),
            ("ATT", joueur.stats_effectives.attaque, Color::srgb(0.9, 0.5, 0.1)),
        ];

        for (label, val, couleur) in stats.iter() {
            let pct = (*val / 99.0).clamp(0.0, 1.0);
            card.spawn((
                Node {
                    flex_direction: FlexDirection::Row,
                    align_items: AlignItems::Center,
                    width: Val::Percent(100.0),
                    column_gap: Val::Px(4.0),
                    ..default()
                },
            )).with_children(|stat_row| {
                stat_row.spawn((
                    Text::new(*label),
                    TextFont { font_size: 9.0, ..default() },
                    TextColor(COULEUR_TEXTE_SECONDAIRE),
                    Node { width: Val::Px(28.0), ..default() },
                ));

                // Barre de fond
                stat_row.spawn((
                    Node {
                        width: Val::Px(120.0),
                        height: Val::Px(6.0),
                        border: UiRect::all(Val::Px(1.0)),
                        ..default()
                    },
                    BackgroundColor(Color::srgb(0.1, 0.1, 0.1)),
                    BorderColor(Color::srgb(0.2, 0.2, 0.3)),
                    BorderRadius::all(Val::Px(3.0)),
                )).with_children(|barre_fond| {
                    barre_fond.spawn((
                        Node {
                            width: Val::Percent(pct * 100.0),
                            height: Val::Percent(100.0),
                            ..default()
                        },
                        BackgroundColor(*couleur),
                        BorderRadius::all(Val::Px(3.0)),
                    ));
                });

                stat_row.spawn((
                    Text::new(format!("{:.0}", val)),
                    TextFont { font_size: 9.0, ..default() },
                    TextColor(*couleur),
                ));
            });
        }

        // Capacité spéciale
        card.spawn((
            Node {
                width: Val::Percent(100.0),
                height: Val::Px(1.0),
                margin: UiRect::vertical(Val::Px(2.0)),
                ..default()
            },
            BackgroundColor(Color::srgba(couleur_domaine.to_srgba().red, couleur_domaine.to_srgba().green, couleur_domaine.to_srgba().blue, 0.3)),
        ));

        card.spawn((
            Text::new(format!("⚡ {}", joueur.capacite_speciale.nom)),
            TextFont { font_size: 10.0, ..default() },
            TextColor(COULEUR_ACCENT),
        ));

        // Traits
        for trait_joueur in joueur.traits.iter().take(2) {
            card.spawn((
                Text::new(format!("• {}", trait_joueur.nom)),
                TextFont { font_size: 9.0, ..default() },
                TextColor(COULEUR_TEXTE_SECONDAIRE),
            ));
        }

        // Stats de carrière
        card.spawn((
            Text::new(format!("⚽{} 🅰{} 🎮{}", joueur.buts, joueur.passes_decisives, joueur.matchs_joues)),
            TextFont { font_size: 10.0, ..default() },
            TextColor(COULEUR_TEXTE_SECONDAIRE),
        ));
    });
}

fn gerer_boutons_fiches(
    mut interactions: Query<(&Interaction, &mut BackgroundColor, &BoutonNavigation),
        (Changed<Interaction>, With<Button>)>,
    mut prochaine_etat: ResMut<NextState<EcranJeu>>,
) {
    for (interaction, mut couleur, nav) in interactions.iter_mut() {
        match interaction {
            Interaction::Pressed => prochaine_etat.set(nav.0),
            Interaction::Hovered => *couleur = BackgroundColor(COULEUR_BTN_SURVOL),
            Interaction::None => *couleur = BackgroundColor(COULEUR_BTN_NORMAL),
        }
    }
}
