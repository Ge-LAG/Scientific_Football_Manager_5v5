use bevy::prelude::*;
use crate::game_state::{EcranJeu, EtatJeu};
use crate::ui::styles::*;
use crate::ui::components::*;
use crate::ui::menu_principal::nettoyer_ecran;

pub struct ResultatMatchPlugin;

impl Plugin for ResultatMatchPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(EcranJeu::ResultatMatch), afficher_resultat)
           .add_systems(OnExit(EcranJeu::ResultatMatch), (
               nettoyer_ecran::<EcranResultat>,
               synchroniser_resultats,
           ))
           .add_systems(Update, gerer_boutons_resultat.run_if(in_state(EcranJeu::ResultatMatch)));
    }
}

fn afficher_resultat(
    mut commands: Commands,
    etat_jeu: Res<EtatJeu>,
) {
    let Some(ref m) = etat_jeu.match_actuel else { return; };

    let vainqueur = m.get_vainqueur();
    let est_nul = vainqueur.is_none();

    let titre_resultat = if est_nul {
        "⚽ Match Nul !".to_string()
    } else if vainqueur == Some(m.equipe_domicile.id) {
        format!("🏆 {} Gagne !", m.equipe_domicile.nom)
    } else {
        format!("🏆 {} Gagne !", m.equipe_exterieur.nom)
    };

    commands.spawn((
        Node {
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            align_items: AlignItems::Center,
            justify_content: JustifyContent::Center,
            row_gap: Val::Px(16.0),
            ..default()
        },
        BackgroundColor(COULEUR_FOND),
        EcranResultat,
    )).with_children(|parent| {
        // Titre
        parent.spawn((
            Text::new(&titre_resultat),
            TextFont { font_size: 40.0, ..default() },
            TextColor(if est_nul { COULEUR_TEXTE } else { COULEUR_AVERTISSEMENT }),
        ));

        // Score
        parent.spawn((
            Node {
                flex_direction: FlexDirection::Row,
                align_items: AlignItems::Center,
                column_gap: Val::Px(24.0),
                padding: UiRect::all(Val::Px(20.0)),
                border: UiRect::all(Val::Px(3.0)),
                ..default()
            },
            BackgroundColor(COULEUR_PANNEAU),
            BorderColor(COULEUR_BORDURE),
            BorderRadius::all(Val::Px(12.0)),
        )).with_children(|score| {
            // Équipe domicile
            score.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    align_items: AlignItems::Center,
                    width: Val::Px(200.0),
                    ..default()
                },
            )).with_children(|eq| {
                eq.spawn((
                    Text::new(&m.equipe_domicile.nom),
                    TextFont { font_size: 18.0, ..default() },
                    TextColor(Color::srgb(0.9, 0.3, 0.3)),
                ));
                eq.spawn((
                    Text::new(format!("{} pts", m.equipe_domicile.points())),
                    TextFont { font_size: 13.0, ..default() },
                    TextColor(COULEUR_TEXTE_SECONDAIRE),
                ));
            });

            // Score
            score.spawn((
                Text::new(m.get_score_affichage()),
                TextFont { font_size: 56.0, ..default() },
                TextColor(Color::WHITE),
            ));

            // Équipe extérieur
            score.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    align_items: AlignItems::Center,
                    width: Val::Px(200.0),
                    ..default()
                },
            )).with_children(|eq| {
                eq.spawn((
                    Text::new(&m.equipe_exterieur.nom),
                    TextFont { font_size: 18.0, ..default() },
                    TextColor(Color::srgb(0.3, 0.3, 0.9)),
                ));
                eq.spawn((
                    Text::new(format!("{} pts", m.equipe_exterieur.points())),
                    TextFont { font_size: 13.0, ..default() },
                    TextColor(COULEUR_TEXTE_SECONDAIRE),
                ));
            });
        });

        // Statistiques du match
        parent.spawn((
            Node {
                flex_direction: FlexDirection::Row,
                column_gap: Val::Px(24.0),
                ..default()
            },
        )).with_children(|stats| {
            // Meilleurs buteurs
            stats.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    padding: UiRect::all(Val::Px(12.0)),
                    border: UiRect::all(Val::Px(1.0)),
                    row_gap: Val::Px(4.0),
                    min_width: Val::Px(200.0),
                    ..default()
                },
                BackgroundColor(COULEUR_PANNEAU),
                BorderColor(COULEUR_BORDURE),
                BorderRadius::all(Val::Px(6.0)),
            )).with_children(|buts| {
                buts.spawn((
                    Text::new("⚽ Buts"),
                    TextFont { font_size: 14.0, ..default() },
                    TextColor(COULEUR_ACCENT),
                ));

                let buts_events: Vec<_> = m.evenements.iter()
                    .filter(|e| matches!(e, crate::models::EvenementMatch::But { .. }))
                    .collect();

                if buts_events.is_empty() {
                    buts.spawn((
                        Text::new("Aucun but"),
                        TextFont { font_size: 12.0, ..default() },
                        TextColor(COULEUR_TEXTE_SECONDAIRE),
                    ));
                }

                for evt in &buts_events {
                    if let crate::models::EvenementMatch::But { minute, buteur_id, equipe_id, .. } = evt {
                        // Trouver le nom du buteur
                        let nom_buteur = trouver_nom_joueur(&m, *buteur_id).unwrap_or_else(|| "Inconnu".to_string());
                        let equipe_nom = if *equipe_id == m.equipe_domicile.id {
                            &m.equipe_domicile.nom
                        } else {
                            &m.equipe_exterieur.nom
                        };

                        buts.spawn((
                            Text::new(format!("{}' {} ({})", minute, nom_buteur, equipe_nom)),
                            TextFont { font_size: 11.0, ..default() },
                            TextColor(COULEUR_AVERTISSEMENT),
                        ));
                    }
                }
            });

            // Événements marquants
            stats.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    padding: UiRect::all(Val::Px(12.0)),
                    border: UiRect::all(Val::Px(1.0)),
                    row_gap: Val::Px(4.0),
                    min_width: Val::Px(280.0),
                    max_height: Val::Px(200.0),
                    overflow: Overflow::clip_y(),
                    ..default()
                },
                BackgroundColor(COULEUR_PANNEAU),
                BorderColor(COULEUR_BORDURE),
                BorderRadius::all(Val::Px(6.0)),
            )).with_children(|evts| {
                evts.spawn((
                    Text::new("📋 Événements marquants"),
                    TextFont { font_size: 14.0, ..default() },
                    TextColor(COULEUR_ACCENT),
                ));

                for evt in m.evenements.iter().rev().take(8) {
                    match evt {
                        crate::models::EvenementMatch::But { .. } |
                        crate::models::EvenementMatch::DecouverteScientifique { .. } |
                        crate::models::EvenementMatch::BelleAction { .. } => {
                            evts.spawn((
                                Text::new(evt.get_description_courte()),
                                TextFont { font_size: 11.0, ..default() },
                                TextColor(COULEUR_TEXTE),
                            ));
                        }
                        _ => {}
                    }
                }
            });
        });

        // Boutons de navigation
        parent.spawn((
            Node {
                flex_direction: FlexDirection::Row,
                column_gap: Val::Px(16.0),
                margin: UiRect::top(Val::Px(16.0)),
                ..default()
            },
        )).with_children(|btns| {
            // Rejouer
            btns.spawn((
                Button,
                Node {
                    width: Val::Px(180.0),
                    height: Val::Px(50.0),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    border: UiRect::all(Val::Px(2.0)),
                    ..default()
                },
                BackgroundColor(Color::srgb(0.1, 0.3, 0.1)),
                BorderColor(COULEUR_SUCCES),
                BorderRadius::all(Val::Px(6.0)),
                BoutonNavigation(EcranJeu::SelectionEquipe),
            )).with_children(|btn| {
                btn.spawn((
                    Text::new("⚽ Rejouer"),
                    TextFont { font_size: 16.0, ..default() },
                    TextColor(COULEUR_SUCCES),
                ));
            });

            // Menu principal
            btns.spawn((
                Button,
                Node {
                    width: Val::Px(180.0),
                    height: Val::Px(50.0),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    border: UiRect::all(Val::Px(2.0)),
                    ..default()
                },
                BackgroundColor(COULEUR_BTN_NORMAL),
                BorderColor(COULEUR_BORDURE),
                BorderRadius::all(Val::Px(6.0)),
                BoutonNavigation(EcranJeu::MenuPrincipal),
            )).with_children(|btn| {
                btn.spawn((
                    Text::new("🏠 Menu Principal"),
                    TextFont { font_size: 16.0, ..default() },
                    TextColor(COULEUR_TEXTE),
                ));
            });

            // Classement
            btns.spawn((
                Button,
                Node {
                    width: Val::Px(180.0),
                    height: Val::Px(50.0),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    border: UiRect::all(Val::Px(2.0)),
                    ..default()
                },
                BackgroundColor(COULEUR_BTN_NORMAL),
                BorderColor(COULEUR_BORDURE),
                BorderRadius::all(Val::Px(6.0)),
                BoutonNavigation(EcranJeu::Classement),
            )).with_children(|btn| {
                btn.spawn((
                    Text::new("🏆 Classement"),
                    TextFont { font_size: 16.0, ..default() },
                    TextColor(COULEUR_TEXTE),
                ));
            });
        });
    });
}

fn trouver_nom_joueur(m: &crate::models::MoteurMatch, joueur_id: u32) -> Option<String> {
    m.equipe_domicile.joueurs.iter()
        .chain(m.equipe_exterieur.joueurs.iter())
        .find(|j| j.id == joueur_id)
        .map(|j| j.prenom.clone())
}

fn gerer_boutons_resultat(
    mut interactions: Query<(&Interaction, &mut BackgroundColor, &BoutonNavigation),
        (Changed<Interaction>, With<Button>)>,
    mut prochaine_etat: ResMut<NextState<EcranJeu>>,
) {
    for (interaction, mut couleur, nav) in interactions.iter_mut() {
        match interaction {
            Interaction::Pressed => {
                *couleur = BackgroundColor(COULEUR_BTN_PRESSE);
                prochaine_etat.set(nav.0);
            }
            Interaction::Hovered => *couleur = BackgroundColor(COULEUR_BTN_SURVOL),
            Interaction::None => *couleur = BackgroundColor(COULEUR_BTN_NORMAL),
        }
    }
}

fn synchroniser_resultats(mut etat_jeu: ResMut<EtatJeu>) {
    etat_jeu.synchroniser_match_vers_equipes();
}
