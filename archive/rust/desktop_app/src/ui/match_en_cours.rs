use bevy::prelude::*;
use crate::game_state::{EcranJeu, EtatJeu};
use crate::models::match_engine::{EvenementMatch, PeriodeMatch};
use crate::ui::styles::*;
use crate::ui::components::*;
use crate::ui::menu_principal::nettoyer_ecran;

pub struct MatchEnCoursPlugin;

impl Plugin for MatchEnCoursPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(EcranJeu::MatchEnCours), afficher_match)
           .add_systems(OnExit(EcranJeu::MatchEnCours), nettoyer_ecran::<EcranMatchEnCours>)
           .add_systems(Update, (
               mettre_a_jour_match,
               mettre_a_jour_ui_match,
               gerer_controles_match,
               verifier_fin_match,
           ).run_if(in_state(EcranJeu::MatchEnCours)));
    }
}

fn afficher_match(
    mut commands: Commands,
    etat_jeu: Res<EtatJeu>,
) {
    let Some(ref match_actuel) = etat_jeu.match_actuel else { return; };

    commands.spawn((
        Node {
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            ..default()
        },
        BackgroundColor(COULEUR_FOND),
        EcranMatchEnCours,
    )).with_children(|parent| {
        // ===== Barre du score =====
        parent.spawn((
            Node {
                width: Val::Percent(100.0),
                height: Val::Px(70.0),
                flex_direction: FlexDirection::Row,
                align_items: AlignItems::Center,
                justify_content: JustifyContent::SpaceBetween,
                padding: UiRect::horizontal(Val::Px(20.0)),
                border: UiRect::bottom(Val::Px(2.0)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.05, 0.05, 0.15, 1.0)),
            BorderColor(COULEUR_BORDURE),
        )).with_children(|barre| {
            // Équipe domicile
            barre.spawn((
                Node {
                    flex_direction: FlexDirection::Row,
                    align_items: AlignItems::Center,
                    column_gap: Val::Px(12.0),
                    width: Val::Px(250.0),
                    ..default()
                },
            )).with_children(|eq| {
                eq.spawn((
                    Text::new(&match_actuel.equipe_domicile.nom),
                    TextFont { font_size: 18.0, ..default() },
                    TextColor(Color::srgb(0.9, 0.3, 0.3)),
                ));
            });

            // Score central
            barre.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    align_items: AlignItems::Center,
                    ..default()
                },
            )).with_children(|centre| {
                centre.spawn((
                    Text::new(match_actuel.get_score_affichage()),
                    TextFont { font_size: 36.0, ..default() },
                    TextColor(Color::WHITE),
                    AffichageScore,
                ));
                centre.spawn((
                    Text::new(format!("{} — {}", match_actuel.periode.get_nom(), match_actuel.get_temps_affichage())),
                    TextFont { font_size: 14.0, ..default() },
                    TextColor(COULEUR_ACCENT),
                    AffichageTemps,
                ));
            });

            // Équipe extérieur
            barre.spawn((
                Node {
                    flex_direction: FlexDirection::Row,
                    align_items: AlignItems::Center,
                    justify_content: JustifyContent::FlexEnd,
                    column_gap: Val::Px(12.0),
                    width: Val::Px(250.0),
                    ..default()
                },
            )).with_children(|eq| {
                eq.spawn((
                    Text::new(&match_actuel.equipe_exterieur.nom),
                    TextFont { font_size: 18.0, ..default() },
                    TextColor(Color::srgb(0.3, 0.3, 0.9)),
                ));
            });
        });

        // ===== Contenu principal =====
        parent.spawn((
            Node {
                width: Val::Percent(100.0),
                flex_direction: FlexDirection::Row,
                flex_grow: 1.0,
                column_gap: Val::Px(8.0),
                padding: UiRect::all(Val::Px(8.0)),
                ..default()
            },
        )).with_children(|main| {
            // Panneau gauche - Équipe domicile
            afficher_panneau_equipe_match(main, &match_actuel.equipe_domicile, true);

            // Zone centrale - Terrain simplifié
            main.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    flex_grow: 1.0,
                    align_items: AlignItems::Center,
                    justify_content: JustifyContent::Center,
                    border: UiRect::all(Val::Px(2.0)),
                    row_gap: Val::Px(8.0),
                    ..default()
                },
                BackgroundColor(Color::srgb(0.05, 0.15, 0.05)),
                BorderColor(Color::srgb(0.2, 0.6, 0.2)),
                BorderRadius::all(Val::Px(8.0)),
            )).with_children(|terrain| {
                // Visualisation 2D simplifiée du terrain
                terrain.spawn((
                    Text::new("⚽ TERRAIN"),
                    TextFont { font_size: 16.0, ..default() },
                    TextColor(Color::srgb(0.4, 0.8, 0.4)),
                ));

                // Représentation ASCII du terrain
                terrain.spawn((
                    Node {
                        flex_direction: FlexDirection::Column,
                        align_items: AlignItems::Center,
                        row_gap: Val::Px(4.0),
                        ..default()
                    },
                )).with_children(|field| {
                    field.spawn((
                        Text::new("🥅 ═══════════════════ 🥅"),
                        TextFont { font_size: 14.0, ..default() },
                        TextColor(Color::srgb(0.5, 0.5, 0.5)),
                    ));
                    field.spawn((
                        Text::new("│                         │"),
                        TextFont { font_size: 14.0, ..default() },
                        TextColor(Color::srgb(0.3, 0.6, 0.3)),
                    ));
                    field.spawn((
                        Text::new("│     Espace de jeu       │"),
                        TextFont { font_size: 14.0, ..default() },
                        TextColor(Color::srgb(0.3, 0.6, 0.3)),
                    ));
                    field.spawn((
                        Text::new("│         ⚽              │"),
                        TextFont { font_size: 14.0, ..default() },
                        TextColor(Color::WHITE),
                    ));
                    field.spawn((
                        Text::new("│                         │"),
                        TextFont { font_size: 14.0, ..default() },
                        TextColor(Color::srgb(0.3, 0.6, 0.3)),
                    ));
                    field.spawn((
                        Text::new("🥅 ═══════════════════ 🥅"),
                        TextFont { font_size: 14.0, ..default() },
                        TextColor(Color::srgb(0.5, 0.5, 0.5)),
                    ));
                });

                // Position du ballon
                terrain.spawn((
                    Text::new(format!("Position ballon: ({:.0}, {:.0})",
                        match_actuel.ballon_x, match_actuel.ballon_z)),
                    TextFont { font_size: 12.0, ..default() },
                    TextColor(COULEUR_TEXTE_SECONDAIRE),
                ));

                // Contrôles
                parent_controles_match(terrain, match_actuel.en_jeu, match_actuel.periode.clone());
            });

            // Panneau droit - Équipe extérieur
            afficher_panneau_equipe_match(main, &match_actuel.equipe_exterieur, false);
        });

        // ===== Log des événements =====
        parent.spawn((
            Node {
                width: Val::Percent(100.0),
                height: Val::Px(140.0),
                flex_direction: FlexDirection::Column,
                padding: UiRect::all(Val::Px(8.0)),
                border: UiRect::top(Val::Px(1.0)),
                overflow: Overflow::clip_y(),
                ..default()
            },
            BackgroundColor(Color::srgba(0.04, 0.04, 0.10, 1.0)),
            BorderColor(COULEUR_BORDURE),
            AffichageEvenements,
        )).with_children(|log| {
            log.spawn((
                Text::new("📋 Journal du match"),
                TextFont { font_size: 13.0, ..default() },
                TextColor(COULEUR_ACCENT),
            ));

            let evenements = match_actuel.get_evenements_recents(5);
            let est_vide = evenements.is_empty();
            for evt in evenements {
                log.spawn((
                    Text::new(evt.get_description_courte()),
                    TextFont { font_size: 12.0, ..default() },
                    TextColor(couleur_evenement(evt)),
                ));
            }

            if est_vide {
                log.spawn((
                    Text::new("Le match vient de commencer..."),
                    TextFont { font_size: 12.0, ..default() },
                    TextColor(COULEUR_TEXTE_SECONDAIRE),
                ));
            }
        });
    });
}

fn afficher_panneau_equipe_match(
    parent: &mut ChildBuilder,
    equipe: &crate::models::Equipe,
    est_domicile: bool,
) {
    let couleur = if est_domicile { Color::srgb(0.9, 0.3, 0.3) } else { Color::srgb(0.3, 0.3, 0.9) };

    parent.spawn((
        Node {
            flex_direction: FlexDirection::Column,
            width: Val::Px(220.0),
            height: Val::Percent(100.0),
            padding: UiRect::all(Val::Px(8.0)),
            border: UiRect::all(Val::Px(1.0)),
            row_gap: Val::Px(4.0),
            overflow: Overflow::clip_y(),
            ..default()
        },
        BackgroundColor(COULEUR_PANNEAU),
        BorderColor(Color::srgba(couleur.to_srgba().red, couleur.to_srgba().green, couleur.to_srgba().blue, 0.5)),
        BorderRadius::all(Val::Px(6.0)),
    )).with_children(|panel| {
        // En-tête
        panel.spawn((
            Text::new(format!("{}", if est_domicile { "🏠" } else { "✈️" })),
            TextFont { font_size: 12.0, ..default() },
            TextColor(couleur),
        ));

        panel.spawn((
            Text::new(&equipe.nom),
            TextFont { font_size: 13.0, ..default() },
            TextColor(couleur),
        ));

        panel.spawn((
            Text::new(format!("Note: {:.1} | Chimie: {:.0}%", equipe.note_equipe(), equipe.chimie * 100.0)),
            TextFont { font_size: 11.0, ..default() },
            TextColor(COULEUR_TEXTE_SECONDAIRE),
        ));

        // Séparateur
        panel.spawn((
            Node {
                width: Val::Percent(100.0),
                height: Val::Px(1.0),
                ..default()
            },
            BackgroundColor(COULEUR_BORDURE),
        ));

        // Joueurs sur le terrain
        panel.spawn((
            Text::new("Titulaires:"),
            TextFont { font_size: 12.0, ..default() },
            TextColor(COULEUR_ACCENT),
        ));

        for joueur in equipe.joueurs.iter().filter(|j| j.sur_le_terrain) {
            let stamina_pct = (joueur.stamina / joueur.stamina_max * 100.0) as u32;
            let couleur_stamina = if stamina_pct > 60 { COULEUR_SUCCES }
                else if stamina_pct > 30 { COULEUR_AVERTISSEMENT }
                else { COULEUR_ERREUR };

            panel.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    width: Val::Percent(100.0),
                    padding: UiRect::all(Val::Px(2.0)),
                    ..default()
                },
            )).with_children(|jrow| {
                jrow.spawn((
                    Text::new(format!("⚡ {} ({})", joueur.prenom, joueur.position_actuelle.get_name())),
                    TextFont { font_size: 11.0, ..default() },
                    TextColor(COULEUR_TEXTE),
                ));

                // Barre de stamina simplifiée
                let bars = (stamina_pct / 10) as usize;
                let barre = format!("[{}{}] {}%",
                    "█".repeat(bars),
                    "░".repeat(10 - bars),
                    stamina_pct);
                jrow.spawn((
                    Text::new(barre),
                    TextFont { font_size: 9.0, ..default() },
                    TextColor(couleur_stamina),
                ));
            });
        }
    });
}

fn parent_controles_match(
    parent: &mut ChildBuilder,
    en_jeu: bool,
    periode: PeriodeMatch,
) {
    parent.spawn((
        Node {
            flex_direction: FlexDirection::Row,
            column_gap: Val::Px(8.0),
            margin: UiRect::top(Val::Px(8.0)),
            ..default()
        },
    )).with_children(|ctrl| {
        match periode {
            PeriodeMatch::PremiereMitemps | PeriodeMatch::DeuxiemeMitemps => {
                if en_jeu {
                    // Bouton pause
                    ctrl.spawn((
                        Button,
                        Node {
                            width: Val::Px(120.0),
                            height: Val::Px(40.0),
                            justify_content: JustifyContent::Center,
                            align_items: AlignItems::Center,
                            border: UiRect::all(Val::Px(1.0)),
                            ..default()
                        },
                        BackgroundColor(Color::srgb(0.3, 0.2, 0.1)),
                        BorderColor(COULEUR_AVERTISSEMENT),
                        BorderRadius::all(Val::Px(4.0)),
                        BoutonPauseMatch,
                    )).with_children(|btn| {
                        btn.spawn((
                            Text::new("⏸ Pause"),
                            TextFont { font_size: 14.0, ..default() },
                            TextColor(COULEUR_AVERTISSEMENT),
                        ));
                    });
                } else {
                    // Bouton reprendre
                    ctrl.spawn((
                        Button,
                        Node {
                            width: Val::Px(120.0),
                            height: Val::Px(40.0),
                            justify_content: JustifyContent::Center,
                            align_items: AlignItems::Center,
                            border: UiRect::all(Val::Px(1.0)),
                            ..default()
                        },
                        BackgroundColor(Color::srgb(0.1, 0.3, 0.1)),
                        BorderColor(COULEUR_SUCCES),
                        BorderRadius::all(Val::Px(4.0)),
                        BoutonReprendreMatch,
                    )).with_children(|btn| {
                        btn.spawn((
                            Text::new("▶ Reprendre"),
                            TextFont { font_size: 14.0, ..default() },
                            TextColor(COULEUR_SUCCES),
                        ));
                    });
                }
            }
            PeriodeMatch::MiTemps => {
                ctrl.spawn((
                    Button,
                    Node {
                        width: Val::Px(160.0),
                        height: Val::Px(40.0),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        border: UiRect::all(Val::Px(1.0)),
                        ..default()
                    },
                    BackgroundColor(Color::srgb(0.1, 0.3, 0.1)),
                    BorderColor(COULEUR_SUCCES),
                    BorderRadius::all(Val::Px(4.0)),
                    BoutonMiTemps,
                )).with_children(|btn| {
                    btn.spawn((
                        Text::new("▶ 2ème mi-temps"),
                        TextFont { font_size: 14.0, ..default() },
                        TextColor(COULEUR_SUCCES),
                    ));
                });
            }
            PeriodeMatch::Termine => {
                ctrl.spawn((
                    Text::new("🏁 Match Terminé"),
                    TextFont { font_size: 18.0, ..default() },
                    TextColor(COULEUR_ACCENT),
                ));
            }
        }
    });
}

fn mettre_a_jour_match(
    time: Res<Time>,
    mut etat_jeu: ResMut<EtatJeu>,
) {
    if let Some(ref mut m) = etat_jeu.match_actuel {
        m.mise_a_jour(time.delta_secs());
    }
}

fn mettre_a_jour_ui_match(
    etat_jeu: Res<EtatJeu>,
    mut q_score: Query<&mut Text, (With<AffichageScore>, Without<AffichageTemps>)>,
    mut q_temps: Query<&mut Text, (With<AffichageTemps>, Without<AffichageScore>)>,
    _q_evenements: Query<&Children, With<AffichageEvenements>>,
    _q_texte: Query<&mut Text, (Without<AffichageScore>, Without<AffichageTemps>)>,
) {
    if let Some(ref m) = etat_jeu.match_actuel {
        // Mettre à jour le score
        for mut text in q_score.iter_mut() {
            *text = Text::new(m.get_score_affichage());
        }

        // Mettre à jour le temps
        for mut text in q_temps.iter_mut() {
            *text = Text::new(format!("{} — {}", m.periode.get_nom(), m.get_temps_affichage()));
        }
    }
}

fn gerer_controles_match(
    mut interactions: Query<(
        &Interaction,
        &mut BackgroundColor,
        Option<&BoutonPauseMatch>,
        Option<&BoutonReprendreMatch>,
        Option<&BoutonMiTemps>,
        Option<&BoutonNavigation>,
    ), (Changed<Interaction>, With<Button>)>,
    mut etat_jeu: ResMut<EtatJeu>,
    mut prochaine_etat: ResMut<NextState<EcranJeu>>,
) {
    for (interaction, mut couleur, pause, reprendre, mitemps, nav) in interactions.iter_mut() {
        if pause.is_some() {
            match interaction {
                Interaction::Pressed => {
                    if let Some(ref mut m) = etat_jeu.match_actuel {
                        m.pause();
                    }
                }
                Interaction::Hovered => *couleur = BackgroundColor(Color::srgb(0.4, 0.3, 0.1)),
                Interaction::None => *couleur = BackgroundColor(Color::srgb(0.3, 0.2, 0.1)),
            }
        } else if reprendre.is_some() {
            match interaction {
                Interaction::Pressed => {
                    if let Some(ref mut m) = etat_jeu.match_actuel {
                        m.reprendre();
                    }
                }
                Interaction::Hovered => *couleur = BackgroundColor(Color::srgb(0.15, 0.4, 0.15)),
                Interaction::None => *couleur = BackgroundColor(Color::srgb(0.1, 0.3, 0.1)),
            }
        } else if mitemps.is_some() {
            match interaction {
                Interaction::Pressed => {
                    if let Some(ref mut m) = etat_jeu.match_actuel {
                        m.reprendre();
                    }
                }
                Interaction::Hovered => *couleur = BackgroundColor(Color::srgb(0.15, 0.4, 0.15)),
                Interaction::None => *couleur = BackgroundColor(Color::srgb(0.1, 0.3, 0.1)),
            }
        } else if let Some(nav) = nav {
            match interaction {
                Interaction::Pressed => prochaine_etat.set(nav.0),
                Interaction::Hovered => *couleur = BackgroundColor(COULEUR_BTN_SURVOL),
                Interaction::None => *couleur = BackgroundColor(COULEUR_BTN_NORMAL),
            }
        }
    }
}

fn verifier_fin_match(
    etat_jeu: Res<EtatJeu>,
    mut prochaine_etat: ResMut<NextState<EcranJeu>>,
) {
    if let Some(ref m) = etat_jeu.match_actuel {
        if m.periode == PeriodeMatch::Termine {
            prochaine_etat.set(EcranJeu::ResultatMatch);
        }
    }
}

fn couleur_evenement(evt: &EvenementMatch) -> Color {
    match evt {
        EvenementMatch::But { .. } => Color::srgb(1.0, 0.9, 0.0),
        EvenementMatch::CartonJaune { .. } => COULEUR_AVERTISSEMENT,
        EvenementMatch::DecouverteScientifique { .. } => COULEUR_ACCENT,
        EvenementMatch::SauvetageGardien { .. } => Color::srgb(0.5, 0.8, 0.9),
        EvenementMatch::BelleAction { .. } => COULEUR_SUCCES,
        _ => COULEUR_TEXTE,
    }
}
