use bevy::prelude::*;

// Couleurs principales de l'interface
pub const COULEUR_FOND: Color = Color::srgb(0.05, 0.05, 0.12);
pub const COULEUR_PANNEAU: Color = Color::srgba(0.08, 0.08, 0.18, 0.95);
pub const COULEUR_PANNEAU_CLAIR: Color = Color::srgba(0.12, 0.12, 0.25, 0.95);
pub const COULEUR_BORDURE: Color = Color::srgb(0.0, 0.6, 0.9);
pub const COULEUR_TEXTE: Color = Color::srgb(0.9, 0.9, 0.95);
pub const COULEUR_TEXTE_SECONDAIRE: Color = Color::srgb(0.6, 0.7, 0.8);
pub const COULEUR_ACCENT: Color = Color::srgb(0.0, 0.8, 1.0);
pub const COULEUR_SUCCES: Color = Color::srgb(0.2, 0.9, 0.3);
pub const COULEUR_ERREUR: Color = Color::srgb(0.9, 0.2, 0.2);
pub const COULEUR_AVERTISSEMENT: Color = Color::srgb(0.9, 0.8, 0.1);

// Boutons
pub const COULEUR_BTN_NORMAL: Color = Color::srgb(0.1, 0.25, 0.45);
pub const COULEUR_BTN_SURVOL: Color = Color::srgb(0.15, 0.4, 0.65);
pub const COULEUR_BTN_PRESSE: Color = Color::srgb(0.0, 0.5, 0.8);
pub const COULEUR_BTN_DESACTIVE: Color = Color::srgb(0.15, 0.15, 0.2);

// Couleurs scientifiques
pub const COULEUR_PHYSIQUE: Color = Color::srgb(0.9, 0.2, 0.2);
pub const COULEUR_CHIMIE: Color = Color::srgb(0.2, 0.9, 0.3);
pub const COULEUR_BIO: Color = Color::srgb(0.2, 0.8, 0.4);
pub const COULEUR_MATH: Color = Color::srgb(0.2, 0.2, 0.9);
pub const COULEUR_INFO: Color = Color::srgb(0.9, 0.5, 0.0);
pub const COULEUR_ELEC: Color = Color::srgb(0.0, 0.9, 0.9);
pub const COULEUR_MED: Color = Color::srgb(0.9, 0.2, 0.6);
pub const COULEUR_CYBER: Color = Color::srgb(0.5, 0.0, 0.8);

// Tailles
pub const TAILLE_TITRE: f32 = 36.0;
pub const TAILLE_SOUS_TITRE: f32 = 24.0;
pub const TAILLE_TEXTE: f32 = 16.0;
pub const TAILLE_PETIT_TEXTE: f32 = 13.0;

pub fn style_bouton_principal() -> Node {
    Node {
        width: Val::Px(220.0),
        height: Val::Px(50.0),
        justify_content: JustifyContent::Center,
        align_items: AlignItems::Center,
        margin: UiRect::all(Val::Px(6.0)),
        border: UiRect::all(Val::Px(2.0)),
        ..default()
    }
}

pub fn style_bouton_petit() -> Node {
    Node {
        width: Val::Px(140.0),
        height: Val::Px(36.0),
        justify_content: JustifyContent::Center,
        align_items: AlignItems::Center,
        margin: UiRect::all(Val::Px(3.0)),
        border: UiRect::all(Val::Px(1.0)),
        ..default()
    }
}

pub fn style_panneau_principal() -> Node {
    Node {
        width: Val::Percent(100.0),
        height: Val::Percent(100.0),
        flex_direction: FlexDirection::Column,
        align_items: AlignItems::Center,
        justify_content: JustifyContent::Center,
        ..default()
    }
}

pub fn couleur_domaine(domaine: &crate::models::ScientificDomain) -> Color {
    use crate::models::ScientificDomain::*;
    match domaine {
        Informatique => COULEUR_INFO,
        PhysiqueMecanique => COULEUR_PHYSIQUE,
        BiologieChimie => COULEUR_BIO,
        PhysiqueChimie => Color::srgb(0.9, 0.6, 0.2),
        Mathematiques => COULEUR_MATH,
        Electronique => COULEUR_ELEC,
        BiologieMedecine => COULEUR_MED,
        Chimie => COULEUR_CHIMIE,
        MathematiquesBancaire => Color::srgb(0.8, 0.8, 0.0),
        AidesSubventions => Color::srgb(0.5, 0.8, 0.9),
        Cyberscurite => COULEUR_CYBER,
        ElectroniqueBancaire => Color::srgb(0.9, 0.9, 0.2),
        AgroalimentaireGeologie => Color::srgb(0.5, 0.35, 0.1),
    }
}
