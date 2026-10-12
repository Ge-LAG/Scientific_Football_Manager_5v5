use bevy::prelude::*;
use crate::game_state::{EcranJeu, EtatJeu};
use crate::ui::styles::*;
use crate::ui::components::*;
use crate::ui::menu_principal::nettoyer_ecran;

pub struct ClassementPlugin;

impl Plugin for ClassementPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(EcranJeu::Classement), afficher_classement)
           .add_systems(OnExit(EcranJeu::Classement), nettoyer_ecran::<EcranClassement>)
           .add_systems(Update, gerer_boutons_classement.run_if(in_state(EcranJeu::Classement)));
    }
}

fn afficher_classement(
    mut commands: Commands,
    etat_jeu: Res<EtatJeu>,
) {
    // Trier les équipes par points décroissants
    let mut equipes_triees: Vec<_> = etat_jeu.equipes.iter().collect();
    equipes_triees.sort_by(|a, b| {
        b.points().cmp(&a.points())
            .then(b.difference_buts().cmp(&a.difference_buts()))
    });

    commands.spawn((
        Node {
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            ..default()
        },
        BackgroundColor(COULEUR_FOND),
        EcranClassement,
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
                Text::new("🏆 Classement"),
                TextFont { font_size: 22.0, ..default() },
                TextColor(COULEUR_ACCENT),
            ));
        });

        parent.spawn((
            Node {
                width: Val::Percent(100.0),
                flex_grow: 1.0,
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                padding: UiRect::all(Val::Px(24.0)),
                row_gap: Val::Px(8.0),
                ..default()
            },
        )).with_children(|content| {
            // En-tête du tableau
            content.spawn((
                Node {
                    flex_direction: FlexDirection::Row,
                    width: Val::Px(800.0),
                    padding: UiRect { left: Val::Px(12.0), right: Val::Px(12.0), ..UiRect::all(Val::Px(8.0)) },
                    column_gap: Val::Px(8.0),
                    ..default()
                },
                BackgroundColor(Color::srgb(0.1, 0.1, 0.2)),
                BorderRadius::all(Val::Px(4.0)),
            )).with_children(|header| {
                let colonnes = [
                    ("#", 30.0), ("Équipe", 240.0), ("J", 40.0), ("V", 40.0),
                    ("N", 40.0), ("D", 40.0), ("BP", 50.0), ("BC", 50.0), ("+/-", 60.0), ("Pts", 60.0),
                ];
                for (label, largeur) in colonnes.iter() {
                    header.spawn((
                        Text::new(*label),
                        TextFont { font_size: 13.0, ..default() },
                        TextColor(COULEUR_ACCENT),
                        Node { width: Val::Px(*largeur), ..default() },
                    ));
                }
            });

            // Lignes du classement
            for (rang, equipe) in equipes_triees.iter().enumerate() {
                let couleur_rang = match rang {
                    0 => Color::srgb(1.0, 0.8, 0.0), // Or
                    1 => Color::srgb(0.7, 0.7, 0.7), // Argent
                    2 => Color::srgb(0.7, 0.4, 0.2), // Bronze
                    _ => COULEUR_TEXTE,
                };

                content.spawn((
                    Node {
                        flex_direction: FlexDirection::Row,
                        width: Val::Px(800.0),
                        padding: UiRect { left: Val::Px(12.0), right: Val::Px(12.0), ..UiRect::all(Val::Px(8.0)) },
                        column_gap: Val::Px(8.0),
                        border: UiRect::all(Val::Px(1.0)),
                        ..default()
                    },
                    BackgroundColor(COULEUR_PANNEAU),
                    BorderColor(Color::srgba(couleur_rang.to_srgba().red, couleur_rang.to_srgba().green, couleur_rang.to_srgba().blue, 0.3)),
                    BorderRadius::all(Val::Px(4.0)),
                )).with_children(|row| {
                    let valeurs: Vec<(&str, f32, String)> = vec![
                        ("#", 30.0, format!("{}", rang + 1)),
                        ("Équipe", 240.0, equipe.nom.clone()),
                        ("J", 40.0, format!("{}", equipe.victoires + equipe.nuls + equipe.defaites)),
                        ("V", 40.0, format!("{}", equipe.victoires)),
                        ("N", 40.0, format!("{}", equipe.nuls)),
                        ("D", 40.0, format!("{}", equipe.defaites)),
                        ("BP", 50.0, format!("{}", equipe.buts_marques)),
                        ("BC", 50.0, format!("{}", equipe.buts_encaisses)),
                        ("+/-", 60.0, format!("{:+}", equipe.difference_buts())),
                        ("Pts", 60.0, format!("{}", equipe.points())),
                    ];

                    for (_, largeur, valeur) in valeurs.iter() {
                        let _is_pts = valeur == &format!("{}", equipe.points());
                        row.spawn((
                            Text::new(valeur),
                            TextFont { font_size: 13.0, ..default() },
                            TextColor(if rang < 3 { couleur_rang } else { COULEUR_TEXTE }),
                            Node { width: Val::Px(*largeur), ..default() },
                        ));
                    }
                });
            }

            if equipes_triees.is_empty() {
                content.spawn((
                    Text::new("Aucune équipe enregistrée. Initialisez les équipes depuis le menu principal."),
                    TextFont { font_size: 16.0, ..default() },
                    TextColor(COULEUR_TEXTE_SECONDAIRE),
                ));
            }
        });
    });
}

fn gerer_boutons_classement(
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
