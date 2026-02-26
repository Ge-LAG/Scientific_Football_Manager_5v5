use bevy::prelude::*;
use crate::game_state::{EcranJeu, EtatJeu};
use crate::ui::styles::*;
use crate::ui::components::*;

/// Plugin du menu principal
pub struct MenuPrincipalPlugin;

impl Plugin for MenuPrincipalPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(EcranJeu::MenuPrincipal), afficher_menu_principal)
           .add_systems(OnExit(EcranJeu::MenuPrincipal), nettoyer_ecran::<EcranMenuPrincipal>)
           .add_systems(Update, gerer_boutons_menu.run_if(in_state(EcranJeu::MenuPrincipal)));
    }
}

fn afficher_menu_principal(mut commands: Commands) {
    commands.spawn((
        Node {
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            align_items: AlignItems::Center,
            justify_content: JustifyContent::Center,
            ..default()
        },
        BackgroundColor(COULEUR_FOND),
        EcranMenuPrincipal,
    )).with_children(|parent| {
        // Titre principal
        parent.spawn((
            Text::new("⚽ Scientific Football Manager"),
            TextFont {
                font_size: 42.0,
                ..default()
            },
            TextColor(COULEUR_ACCENT),
            Node {
                margin: UiRect::bottom(Val::Px(8.0)),
                ..default()
            },
        ));

        parent.spawn((
            Text::new("5v5 — L'Intelligence au Service du Ballon"),
            TextFont {
                font_size: 20.0,
                ..default()
            },
            TextColor(COULEUR_TEXTE_SECONDAIRE),
            Node {
                margin: UiRect::bottom(Val::Px(48.0)),
                ..default()
            },
        ));

        // Ligne décorative
        parent.spawn((
            Node {
                width: Val::Px(500.0),
                height: Val::Px(2.0),
                margin: UiRect::bottom(Val::Px(40.0)),
                ..default()
            },
            BackgroundColor(COULEUR_BORDURE),
        ));

        // Boutons de navigation
        let boutons = [
            ("🏟️  Jouer", EcranJeu::SelectionEquipe),
            ("👥  Gestion des Équipes", EcranJeu::GestionEquipe),
            ("🏆  Classement", EcranJeu::Classement),
            ("📋  Fiches Joueurs", EcranJeu::FichesJoueurs),
        ];

        for (label, ecran) in boutons.iter() {
            parent.spawn((
                Button,
                Node {
                    width: Val::Px(320.0),
                    height: Val::Px(55.0),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    margin: UiRect::vertical(Val::Px(6.0)),
                    border: UiRect::all(Val::Px(2.0)),
                    ..default()
                },
                BackgroundColor(COULEUR_BTN_NORMAL),
                BorderColor(COULEUR_BORDURE),
                BorderRadius::all(Val::Px(8.0)),
                BoutonNavigation(*ecran),
            )).with_children(|btn| {
                btn.spawn((
                    Text::new(*label),
                    TextFont {
                        font_size: 18.0,
                        ..default()
                    },
                    TextColor(COULEUR_TEXTE),
                ));
            });
        }

        // Bouton init démo
        parent.spawn((
            Button,
            Node {
                width: Val::Px(320.0),
                height: Val::Px(45.0),
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                margin: UiRect { top: Val::Px(24.0), ..UiRect::all(Val::Px(6.0)) },
                border: UiRect::all(Val::Px(1.0)),
                ..default()
            },
            BackgroundColor(Color::srgb(0.1, 0.3, 0.1)),
            BorderColor(COULEUR_SUCCES),
            BorderRadius::all(Val::Px(6.0)),
            BoutonInitDemo,
        )).with_children(|btn| {
            btn.spawn((
                Text::new("🔬 Initialiser les équipes de démonstration"),
                TextFont { font_size: 14.0, ..default() },
                TextColor(COULEUR_SUCCES),
            ));
        });

        // Version
        parent.spawn((
            Text::new("v0.1.0 — Rust + Bevy"),
            TextFont { font_size: 12.0, ..default() },
            TextColor(Color::srgb(0.4, 0.4, 0.5)),
            Node {
                position_type: PositionType::Absolute,
                bottom: Val::Px(16.0),
                right: Val::Px(16.0),
                ..default()
            },
        ));
    });
}

fn gerer_boutons_menu(
    mut interactions: Query<(&Interaction, &mut BackgroundColor, Option<&BoutonNavigation>, Option<&BoutonInitDemo>),
        (Changed<Interaction>, With<Button>)>,
    mut etat_jeu: ResMut<EtatJeu>,
    mut prochaine_etat: ResMut<NextState<EcranJeu>>,
) {
    for (interaction, mut couleur, nav, demo) in interactions.iter_mut() {
        match interaction {
            Interaction::Pressed => {
                *couleur = BackgroundColor(COULEUR_BTN_PRESSE);
                if let Some(BoutonNavigation(ecran)) = nav {
                    prochaine_etat.set(*ecran);
                }
                if demo.is_some() {
                    etat_jeu.initialiser_equipes_demo();
                    info!("Équipes de démonstration initialisées !");
                }
            }
            Interaction::Hovered => {
                *couleur = BackgroundColor(COULEUR_BTN_SURVOL);
            }
            Interaction::None => {
                *couleur = BackgroundColor(COULEUR_BTN_NORMAL);
            }
        }
    }
}

pub fn nettoyer_ecran<T: Component>(
    mut commands: Commands,
    query: Query<Entity, With<T>>,
) {
    for entity in query.iter() {
        commands.entity(entity).despawn_recursive();
    }
}
