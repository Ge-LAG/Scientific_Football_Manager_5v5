// Scientific Football Manager 5v5 — Bibliothèque Partagée
// Cette crate contient toute la logique de jeu partagée entre les plateformes
// (Desktop Windows, Android, iOS)

// Les modules de logique sont directement copiés depuis desktop_app/src/models/
// En production, utilisez un workspace Cargo pour éviter la duplication

pub mod models {
    // Re-exportation des modèles partagés
    // Ces modules sont identiques à ceux de desktop_app/src/models/
    // Ils sont séparés ici pour permettre un usage sans dépendance Bevy

    pub use scientific_domain::*;
    pub use player::*;
    pub use team::*;
    pub use match_engine::*;
    pub use power_up::*;

    pub mod scientific_domain;
    pub mod player;
    pub mod team;
    pub mod match_engine;
    pub mod power_up;
}

/// Interface C pour l'intégration FFI (Android NDK, iOS)
pub mod ffi {
    use std::ffi::{CStr, CString};
    use std::os::raw::c_char;
    use super::models::*;

    /// Obtenir la liste des joueurs en JSON
    #[no_mangle]
    pub extern "C" fn sfm_get_joueurs_json() -> *mut c_char {
        let joueurs = creer_joueurs_reels();
        let json = serde_json::to_string(&joueurs).unwrap_or_default();
        CString::new(json).unwrap().into_raw()
    }

    /// Libérer la mémoire d'une chaîne C allouée par Rust
    #[no_mangle]
    pub extern "C" fn sfm_free_string(ptr: *mut c_char) {
        if !ptr.is_null() {
            unsafe { drop(CString::from_raw(ptr)) };
        }
    }

    /// Simuler un match rapidement et retourner le résultat en JSON
    #[no_mangle]
    pub extern "C" fn sfm_simuler_match_rapide() -> *mut c_char {
        use crate::models::{Equipe, MoteurMatch, creer_joueurs_reels};

        let tous_joueurs = creer_joueurs_reels();
        let mut equipe1 = Equipe::new(1, "Équipe Rouge");
        let mut equipe2 = Equipe::new(2, "Équipe Bleue");

        let mut idx = 0;
        for joueur in tous_joueurs {
            if idx < 8 {
                let mut j = joueur;
                j.sur_le_terrain = idx < 5;
                let _ = equipe1.ajouter_joueur(j);
            } else {
                let mut j = joueur;
                j.sur_le_terrain = idx < 13;
                let _ = equipe2.ajouter_joueur(j);
            }
            idx += 1;
        }

        let mut moteur = MoteurMatch::nouveau(1, equipe1, equipe2);
        moteur.demarrer();

        // Simuler tout le match rapidement
        let dt = 0.1_f32;
        let duree = moteur.duree_match;
        let mut temps = 0.0_f32;

        while temps < duree {
            moteur.mise_a_jour(dt);
            temps += dt;

            // Gestion de la mi-temps
            if moteur.periode == crate::models::PeriodeMatch::MiTemps {
                moteur.reprendre();
            }
        }

        let resultat = serde_json::json!({
            "score_domicile": moteur.score_domicile,
            "score_exterieur": moteur.score_exterieur,
            "equipe_domicile": moteur.equipe_domicile.nom,
            "equipe_exterieur": moteur.equipe_exterieur.nom,
            "nombre_evenements": moteur.evenements.len(),
        });

        let json = serde_json::to_string(&resultat).unwrap_or_default();
        CString::new(json).unwrap().into_raw()
    }
}

#[cfg(test)]
mod tests {
    use super::models::*;

    #[test]
    fn test_creation_joueurs() {
        let joueurs = creer_joueurs_reels();
        assert_eq!(joueurs.len(), 15, "Il doit y avoir exactement 15 joueurs");
    }

    #[test]
    fn test_notes_equilibrees() {
        let joueurs = creer_joueurs_reels();
        let notes: Vec<f32> = joueurs.iter().map(|j| j.note_globale()).collect();
        let min = notes.iter().cloned().fold(f32::INFINITY, f32::min);
        let max = notes.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let ecart = max - min;
        println!("Notes: min={:.1}, max={:.1}, écart={:.1}", min, max, ecart);
        // Les notes ne doivent pas être trop déséquilibrées (max 30 pts d'écart)
        assert!(ecart <= 35.0, "Les joueurs doivent être équilibrés (écart: {:.1})", ecart);
    }

    #[test]
    fn test_moteur_match() {
        let tous_joueurs = creer_joueurs_reels();
        let mut equipe1 = Equipe::new(1, "Test Rouge");
        let mut equipe2 = Equipe::new(2, "Test Bleu");

        for (i, mut j) in tous_joueurs.into_iter().enumerate() {
            j.sur_le_terrain = if i < 5 { i < 5 } else { i < 10 };
            if i < 8 {
                let _ = equipe1.ajouter_joueur(j);
            } else {
                let _ = equipe2.ajouter_joueur(j);
            }
        }

        let mut moteur = MoteurMatch::nouveau(1, equipe1, equipe2);
        moteur.demarrer();
        moteur.mise_a_jour(1.0);
        assert!(moteur.en_jeu, "Le match doit être en cours");
    }

    #[test]
    fn test_noms_joueurs() {
        let joueurs = creer_joueurs_reels();
        let prenoms: Vec<&str> = joueurs.iter().map(|j| j.prenom.as_str()).collect();
        assert!(prenoms.contains(&"Roland"));
        assert!(prenoms.contains(&"Loïc"));
        assert!(prenoms.contains(&"David"));
        assert!(prenoms.contains(&"Thibault"));
        assert!(prenoms.contains(&"Henry"));
        assert!(prenoms.contains(&"Romain"));
        assert!(prenoms.contains(&"Théo"));
        assert!(prenoms.contains(&"Franck"));
        assert!(prenoms.contains(&"Aurélien"));
        assert!(prenoms.contains(&"Lucien"));
        assert!(prenoms.contains(&"Joffrey"));
        assert!(prenoms.contains(&"Yacine"));
        assert!(prenoms.contains(&"Djilani"));
        assert!(prenoms.contains(&"Médéric"));
        assert!(prenoms.contains(&"Guillaume"));
    }
}
