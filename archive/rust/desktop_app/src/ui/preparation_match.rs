use bevy::prelude::*;
use crate::game_state::{EcranJeu, EtatJeu};
use crate::ui::styles::*;
use crate::ui::components::*;
use crate::ui::menu_principal::nettoyer_ecran;

pub struct PreparationMatchPlugin;

impl Plugin for PreparationMatchPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(EcranJeu::SelectionEquipe), afficher_selection_equipe)
           .add_systems(OnEnter(EcranJeu::PreparationMatch), afficher_preparation_match)
           .add_systems(OnExit(EcranJeu::SelectionEquipe), nettoyer_ecran::<EcranPreparationMatch>)
           .add_systems(OnExit(EcranJeu::PreparationMatch), nettoyer_ecran::<EcranPreparationMatch>)
           .add_systems(Update, (
               gerer_selection_equipe,
               gerer_bouton_demarrer,
           ).run_if(in_state(EcranJeu::SelectionEquipe).or(in_state(EcranJeu::PreparationMatch))));
    }
}

fn afficher_selection_equipe(
    mut commands: Commands,
    etat_jeu: Res<EtatJeu>,
) {
    commands.spawn((
        Node {
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            ..default()
        },
        BackgroundColor(COULEUR_FOND),
        EcranPreparationMatch,
    )).with_children(|parent| {
        // Barre navigation
        barre_navigation_simple(parent, "🏟️ Sélection du Match", EcranJeu::MenuPrincipal);

        parent.spawn((
            Node {
                width: Val::Percent(100.0),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                flex_grow: 1.0,
                padding: UiRect::all(Val::Px(24.0)),
                row_gap: Val::Px(16.0),
                ..default()
            },
        )).with_children(|parent| {
            parent.spawn((
                Text::new("Choisissez les équipes qui s'affrontent :"),
                TextFont { font_size: 20.0, ..default() },
                TextColor(COULEUR_TEXTE),
            ));

            // Afficher les équipes disponibles
            if etat_jeu.equipes.is_empty() {
                parent.spawn((
                    Text::new("⚠️ Aucune équipe configurée. Initialisez les équipes depuis le menu principal."),
                    TextFont { font_size: 16.0, ..default() },
                    TextColor(COULEUR_AVERTISSEMENT),
                ));
            } else {
                parent.spawn((
                    Node {
                        flex_direction: FlexDirection::Row,
                        column_gap: Val::Px(32.0),
                        ..default()
                    },
                )).with_children(|parent| {
                    for (idx, equipe) in etat_jeu.equipes.iter().enumerate() {
                        let couleur = if idx == 0 { Color::srgb(0.8, 0.2, 0.2) } else { Color::srgb(0.2, 0.2, 0.8) };
                        let nb_titulaires = equipe.get_titulaires().len();

                        parent.spawn((
                            Node {
                                flex_direction: FlexDirection::Column,
                                align_items: AlignItems::Center,
                                padding: UiRect::all(Val::Px(20.0)),
                                border: UiRect::all(Val::Px(2.0)),
                                width: Val::Px(280.0),
                                row_gap: Val::Px(8.0),
                                ..default()
                            },
                            BackgroundColor(COULEUR_PANNEAU),
                            BorderColor(couleur),
                            BorderRadius::all(Val::Px(8.0)),
                        )).with_children(|card| {
                            card.spawn((
                                Text::new(&equipe.nom),
                                TextFont { font_size: 18.0, ..default() },
                                TextColor(couleur),
                            ));
                            card.spawn((
                                Text::new(format!("{} titulaires / 5", nb_titulaires)),
                                TextFont { font_size: 14.0, ..default() },
                                TextColor(if nb_titulaires >= 5 { COULEUR_SUCCES } else { COULEUR_ERREUR }),
                            ));
                            card.spawn((
                                Text::new(format!("Note: {:.1}", equipe.note_equipe())),
                                TextFont { font_size: 14.0, ..default() },
                                TextColor(COULEUR_ACCENT),
                            ));
                            card.spawn((
                                Text::new(format!("{}", equipe.formation.get_nom())),
                                TextFont { font_size: 12.0, ..default() },
                                TextColor(COULEUR_TEXTE_SECONDAIRE),
                            ));
                        });
                    }
                });

                // Bouton lancer le match
                parent.spawn((
                    Button,
                    Node {
                        width: Val::Px(280.0),
                        height: Val::Px(60.0),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        border: UiRect::all(Val::Px(2.0)),
                        margin: UiRect::top(Val::Px(32.0)),
                        ..default()
                    },
                    BackgroundColor(Color::srgb(0.1, 0.3, 0.1)),
                    BorderColor(COULEUR_SUCCES),
                    BorderRadius::all(Val::Px(8.0)),
                    BoutonDemarrerMatch,
                )).with_children(|btn| {
                    btn.spawn((
                        Text::new("⚽ LANCER LE MATCH !"),
                        TextFont { font_size: 20.0, ..default() },
                        TextColor(COULEUR_SUCCES),
                    ));
                });
            }
        });
    });
}

fn afficher_preparation_match(
    commands: Commands,
    etat_jeu: Res<EtatJeu>,
) {
    // Même que selection equipe pour l'instant
    afficher_selection_equipe(commands, etat_jeu);
}

fn gerer_selection_equipe(
    mut interactions: Query<(&Interaction, &mut BackgroundColor, Option<&BoutonNavigation>),
        (Changed<Interaction>, With<Button>)>,
    mut prochaine_etat: ResMut<NextState<EcranJeu>>,
) {
    for (interaction, mut couleur, nav) in interactions.iter_mut() {
        match interaction {
            Interaction::Pressed => {
                if let Some(BoutonNavigation(ecran)) = nav {
                    prochaine_etat.set(*ecran);
                }
            }
            Interaction::Hovered => *couleur = BackgroundColor(COULEUR_BTN_SURVOL),
            Interaction::None => *couleur = BackgroundColor(COULEUR_BTN_NORMAL),
        }
    }
}

fn gerer_bouton_demarrer(
    mut interactions: Query<(&Interaction, &mut BackgroundColor), (Changed<Interaction>, With<BoutonDemarrerMatch>)>,
    mut etat_jeu: ResMut<EtatJeu>,
    mut prochaine_etat: ResMut<NextState<EcranJeu>>,
) {
    for (interaction, mut couleur) in interactions.iter_mut() {
        match interaction {
            Interaction::Pressed => {
                *couleur = BackgroundColor(COULEUR_BTN_PRESSE);

                // Vérifier qu'on a 2 équipes
                if etat_jeu.equipes.len() >= 2 {
                    let equipe1_id = etat_jeu.equipes[0].id;
                    let equipe2_id = etat_jeu.equipes[1].id;

                    match etat_jeu.creer_match(equipe1_id, equipe2_id) {
                        Ok(_) => {
                            if let Some(ref mut m) = etat_jeu.match_actuel {
                                m.demarrer();
                            }
                            prochaine_etat.set(EcranJeu::MatchEnCours);
                        }
                        Err(e) => {
                            warn!("Impossible de démarrer le match: {}", e);
                        }
                    }
                }
            }
            Interaction::Hovered => *couleur = BackgroundColor(Color::srgb(0.15, 0.4, 0.15)),
            Interaction::None => *couleur = BackgroundColor(Color::srgb(0.1, 0.3, 0.1)),
        }
    }
}

fn barre_navigation_simple(parent: &mut ChildBuilder, titre: &str, ecran_retour: EcranJeu) {
    parent.spawn((
        Node {
            width: Val::Percent(100.0),
            height: Val::Px(56.0),
            flex_direction: FlexDirection::Row,
            align_items: AlignItems::Center,
            padding: UiRect { left: Val::Px(16.0), right: Val::Px(16.0), ..UiRect::all(Val::Px(0.0)) },
            border: UiRect::bottom(Val::Px(1.0)),
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
                margin: UiRect::right(Val::Px(16.0)),
                ..default()
            },
            BackgroundColor(COULEUR_BTN_NORMAL),
            BorderColor(COULEUR_BORDURE),
            BorderRadius::all(Val::Px(4.0)),
            BoutonNavigation(ecran_retour),
        )).with_children(|btn| {
            btn.spawn((
                Text::new("← Retour"),
                TextFont { font_size: 14.0, ..default() },
                TextColor(COULEUR_TEXTE),
            ));
        });

        nav.spawn((
            Text::new(titre),
            TextFont { font_size: 22.0, ..default() },
            TextColor(COULEUR_ACCENT),
        ));
    });
}
