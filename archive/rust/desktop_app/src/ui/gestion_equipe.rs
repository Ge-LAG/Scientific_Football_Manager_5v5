use bevy::prelude::*;
use crate::game_state::{EcranJeu, EtatJeu};
use crate::models::team::Formation;
use crate::ui::styles::*;
use crate::ui::components::*;
use crate::ui::menu_principal::nettoyer_ecran;

pub struct GestionEquipePlugin;

impl Plugin for GestionEquipePlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(EcranJeu::GestionEquipe), afficher_gestion_equipe)
           .add_systems(OnExit(EcranJeu::GestionEquipe), nettoyer_ecran::<EcranGestionEquipe>)
           .add_systems(Update, (
               gerer_boutons_gestion,
               mettre_a_jour_affichage_equipes,
           ).run_if(in_state(EcranJeu::GestionEquipe)));
    }
}

fn afficher_gestion_equipe(
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
        EcranGestionEquipe,
    )).with_children(|parent| {
        // Barre du haut
        barre_navigation(parent, "👥 Gestion des Équipes", EcranJeu::MenuPrincipal);

        // Contenu principal
        parent.spawn((
            Node {
                width: Val::Percent(100.0),
                flex_direction: FlexDirection::Row,
                flex_grow: 1.0,
                padding: UiRect::all(Val::Px(16.0)),
                column_gap: Val::Px(16.0),
                ..default()
            },
        )).with_children(|parent| {
            // Panneau Équipe 1
            if etat_jeu.equipes.len() > 0 {
                afficher_panneau_equipe(parent, &etat_jeu, 0);
            }
            // Panneau Équipe 2
            if etat_jeu.equipes.len() > 1 {
                afficher_panneau_equipe(parent, &etat_jeu, 1);
            }
        });
    });
}

fn afficher_panneau_equipe(
    parent: &mut ChildBuilder,
    etat_jeu: &EtatJeu,
    equipe_idx: usize,
) {
    let equipe = &etat_jeu.equipes[equipe_idx];
    let couleur_equipe = if equipe_idx == 0 {
        Color::srgb(0.8, 0.2, 0.2)
    } else {
        Color::srgb(0.2, 0.2, 0.8)
    };

    parent.spawn((
        Node {
            flex_direction: FlexDirection::Column,
            width: Val::Percent(50.0),
            height: Val::Percent(100.0),
            padding: UiRect::all(Val::Px(12.0)),
            border: UiRect::all(Val::Px(2.0)),
            row_gap: Val::Px(8.0),
            overflow: Overflow::clip_y(),
            ..default()
        },
        BackgroundColor(COULEUR_PANNEAU),
        BorderColor(couleur_equipe),
        BorderRadius::all(Val::Px(8.0)),
        PanneauEquipe { equipe_id: equipe.id },
    )).with_children(|parent| {
        // En-tête de l'équipe
        parent.spawn((
            Text::new(format!("🏟️ {}", equipe.nom)),
            TextFont { font_size: 20.0, ..default() },
            TextColor(couleur_equipe),
        ));

        // Stats équipe
        parent.spawn((
            Text::new(format!(
                "Note: {:.1} | Chimie: {:.0}% | {}-{}-{}",
                equipe.note_equipe(),
                equipe.chimie * 100.0,
                equipe.victoires, equipe.nuls, equipe.defaites
            )),
            TextFont { font_size: 13.0, ..default() },
            TextColor(COULEUR_TEXTE_SECONDAIRE),
        ));

        // Formation
        parent.spawn((
            Text::new(format!("Formation: {}", equipe.formation.get_nom())),
            TextFont { font_size: 14.0, ..default() },
            TextColor(COULEUR_ACCENT),
        ));

        // Bouton sélection auto
        parent.spawn((
            Button,
            Node {
                width: Val::Percent(100.0),
                height: Val::Px(36.0),
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                border: UiRect::all(Val::Px(1.0)),
                ..default()
            },
            BackgroundColor(Color::srgb(0.1, 0.3, 0.2)),
            BorderColor(COULEUR_SUCCES),
            BorderRadius::all(Val::Px(4.0)),
            BoutonEntrainement(equipe.id),
        )).with_children(|btn| {
            btn.spawn((
                Text::new("🏃 Entraînement (+forme)"),
                TextFont { font_size: 13.0, ..default() },
                TextColor(COULEUR_SUCCES),
            ));
        });

        // Séparateur
        parent.spawn((
            Node {
                width: Val::Percent(100.0),
                height: Val::Px(1.0),
                margin: UiRect::vertical(Val::Px(4.0)),
                ..default()
            },
            BackgroundColor(COULEUR_BORDURE),
        ));

        // Liste des joueurs
        parent.spawn((
            Text::new(format!("Joueurs ({}/15):", equipe.joueurs.len())),
            TextFont { font_size: 14.0, ..default() },
            TextColor(COULEUR_TEXTE),
        ));

        // Conteneur scrollable pour les joueurs
        parent.spawn((
            Node {
                flex_direction: FlexDirection::Column,
                row_gap: Val::Px(4.0),
                overflow: Overflow::clip_y(),
                flex_grow: 1.0,
                ..default()
            },
        )).with_children(|parent| {
            for joueur in &equipe.joueurs {
                let couleur_statut = if joueur.sur_le_terrain {
                    COULEUR_SUCCES
                } else if !joueur.est_disponible() {
                    COULEUR_ERREUR
                } else {
                    COULEUR_TEXTE_SECONDAIRE
                };

                let statut = if joueur.sur_le_terrain { "★" } else if joueur.blesse { "🤕" } else { " " };
                let domaine_couleur = couleur_domaine(&joueur.domaine);

                parent.spawn((
                    Node {
                        flex_direction: FlexDirection::Row,
                        align_items: AlignItems::Center,
                        width: Val::Percent(100.0),
                        padding: UiRect { left: Val::Px(6.0), right: Val::Px(6.0), ..UiRect::all(Val::Px(3.0)) },
                        border: UiRect::all(Val::Px(1.0)),
                        column_gap: Val::Px(6.0),
                        ..default()
                    },
                    BackgroundColor(COULEUR_PANNEAU_CLAIR),
                    BorderColor(Color::srgba(domaine_couleur.to_srgba().red, domaine_couleur.to_srgba().green, domaine_couleur.to_srgba().blue, 0.4)),
                    BorderRadius::all(Val::Px(3.0)),
                )).with_children(|row| {
                    // Indicateur titulaire
                    row.spawn((
                        Text::new(statut),
                        TextFont { font_size: 12.0, ..default() },
                        TextColor(couleur_statut),
                    ));

                    // Nom
                    row.spawn((
                        Text::new(format!("{}", joueur.prenom)),
                        TextFont { font_size: 13.0, ..default() },
                        TextColor(COULEUR_TEXTE),
                        Node { flex_grow: 1.0, ..default() },
                    ));

                    // Position
                    row.spawn((
                        Text::new(joueur.position_preferee.get_name()),
                        TextFont { font_size: 11.0, ..default() },
                        TextColor(COULEUR_TEXTE_SECONDAIRE),
                    ));

                    // Note
                    row.spawn((
                        Text::new(format!("{:.0}", joueur.note_globale())),
                        TextFont { font_size: 12.0, ..default() },
                        TextColor(COULEUR_ACCENT),
                    ));

                    // Bouton select titulaire
                    row.spawn((
                        Button,
                        Node {
                            width: Val::Px(28.0),
                            height: Val::Px(22.0),
                            justify_content: JustifyContent::Center,
                            align_items: AlignItems::Center,
                            border: UiRect::all(Val::Px(1.0)),
                            ..default()
                        },
                        BackgroundColor(if joueur.sur_le_terrain { Color::srgb(0.15, 0.35, 0.15) } else { Color::srgb(0.25, 0.15, 0.15) }),
                        BorderColor(if joueur.sur_le_terrain { COULEUR_SUCCES } else { COULEUR_ERREUR }),
                        BorderRadius::all(Val::Px(3.0)),
                        BoutonSelectionnerTitulaire { joueur_id: joueur.id, equipe_id: equipe.id },
                    )).with_children(|btn| {
                        btn.spawn((
                            Text::new(if joueur.sur_le_terrain { "✓" } else { "+" }),
                            TextFont { font_size: 12.0, ..default() },
                            TextColor(if joueur.sur_le_terrain { COULEUR_SUCCES } else { COULEUR_AVERTISSEMENT }),
                        ));
                    });
                });
            }
        });

        // Si aucun joueur
        if equipe.joueurs.is_empty() {
            parent.spawn((
                Text::new("Aucun joueur. Utilisez 'Init. démo' depuis le menu principal."),
                TextFont { font_size: 13.0, ..default() },
                TextColor(COULEUR_TEXTE_SECONDAIRE),
            ));
        }
    });
}

fn gerer_boutons_gestion(
    mut interactions: Query<(&Interaction, &mut BackgroundColor, Option<&BoutonNavigation>,
        Option<&BoutonEntrainement>, Option<&BoutonSelectionnerTitulaire>),
        (Changed<Interaction>, With<Button>)>,
    mut etat_jeu: ResMut<EtatJeu>,
    mut prochaine_etat: ResMut<NextState<EcranJeu>>,
) {
    for (interaction, mut couleur, nav, entrainement, select_tit) in interactions.iter_mut() {
        if *interaction == Interaction::Pressed {
            if let Some(BoutonNavigation(ecran)) = nav {
                prochaine_etat.set(*ecran);
            }
            if let Some(BoutonEntrainement(equipe_id)) = entrainement {
                if let Some(equipe) = etat_jeu.get_equipe_mut(*equipe_id) {
                    equipe.entrainement();
                    info!("Entraînement effectué pour l'équipe {}", equipe.nom);
                }
            }
            if let Some(BoutonSelectionnerTitulaire { joueur_id, equipe_id }) = select_tit {
                if let Some(equipe) = etat_jeu.get_equipe_mut(*equipe_id) {
                    let actuellement_titulaire = equipe.joueurs.iter()
                        .find(|j| j.id == *joueur_id)
                        .map(|j| j.sur_le_terrain)
                        .unwrap_or(false);

                    if actuellement_titulaire {
                        // Retirer du terrain
                        if let Some(j) = equipe.get_joueur_mut(*joueur_id) {
                            j.sur_le_terrain = false;
                        }
                    } else {
                        // Vérifier qu'il y a de la place (5 titulaires max)
                        let nb_titulaires = equipe.get_titulaires().len();
                        if nb_titulaires < 5 {
                            if let Some(j) = equipe.get_joueur_mut(*joueur_id) {
                                if j.est_disponible() {
                                    j.sur_le_terrain = true;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Feedback visuel
        match interaction {
            Interaction::Hovered => *couleur = BackgroundColor(COULEUR_BTN_SURVOL),
            Interaction::None => *couleur = BackgroundColor(COULEUR_BTN_NORMAL),
            _ => {}
        }
    }
}

fn mettre_a_jour_affichage_equipes(
    _etat_jeu: Res<EtatJeu>,
    // Pour l'instant la mise à jour se fait à la reconstruction de l'écran
    // Dans une version future, on pourrait mettre à jour les textes dynamiquement
) {
    // Les textes sont reconstruits lors de chaque changement d'écran
}

fn barre_navigation(parent: &mut ChildBuilder, titre: &str, ecran_retour: EcranJeu) {
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
        // Bouton retour
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

        // Titre
        nav.spawn((
            Text::new(titre),
            TextFont { font_size: 22.0, ..default() },
            TextColor(COULEUR_ACCENT),
        ));
    });
}
