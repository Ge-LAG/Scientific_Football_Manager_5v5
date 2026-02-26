use bevy::prelude::*;
use crate::models::{Equipe, MoteurMatch, Joueur, creer_joueurs_reels};
use crate::models::player::Position;

/// Écrans disponibles dans l'application
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, States, Default)]
pub enum EcranJeu {
    #[default]
    MenuPrincipal,
    SelectionEquipe,
    GestionEquipe,
    PreparationMatch,
    MatchEnCours,
    ResultatMatch,
    Classement,
    FichesJoueurs,
    Options,
}

/// Ressource principale du jeu
#[derive(Resource)]
pub struct EtatJeu {
    pub equipes: Vec<Equipe>,
    pub match_actuel: Option<MoteurMatch>,
    pub equipe_selectionnee_idx: Option<usize>,
    pub joueur_selectionne_id: Option<u32>,
    pub id_compteur: u32,
    pub match_compteur: u32,
    pub saison: u32,
    pub joueurs_disponibles: Vec<Joueur>,
}

impl Default for EtatJeu {
    fn default() -> Self {
        let joueurs = creer_joueurs_reels();

        // Créer deux équipes de base
        let mut equipe1 = Equipe::new(1, "Les Scientifiques Rouges");
        equipe1.budget = 500_000;

        let mut equipe2 = Equipe::new(2, "Les Chercheurs Bleus");
        equipe2.budget = 500_000;

        Self {
            equipes: vec![equipe1, equipe2],
            match_actuel: None,
            equipe_selectionnee_idx: None,
            joueur_selectionne_id: None,
            id_compteur: 100,
            match_compteur: 1,
            saison: 1,
            joueurs_disponibles: joueurs,
        }
    }
}

impl EtatJeu {
    pub fn get_equipe(&self, id: u32) -> Option<&Equipe> {
        self.equipes.iter().find(|e| e.id == id)
    }

    pub fn get_equipe_mut(&mut self, id: u32) -> Option<&mut Equipe> {
        self.equipes.iter_mut().find(|e| e.id == id)
    }

    pub fn get_equipe_selectionnee(&self) -> Option<&Equipe> {
        self.equipe_selectionnee_idx.and_then(|idx| self.equipes.get(idx))
    }

    pub fn get_equipe_selectionnee_mut(&mut self) -> Option<&mut Equipe> {
        self.equipe_selectionnee_idx.and_then(|idx| self.equipes.get_mut(idx))
    }

    pub fn creer_match(&mut self, equipe1_id: u32, equipe2_id: u32) -> Result<(), String> {
        let equipe1 = self.equipes.iter().find(|e| e.id == equipe1_id)
            .ok_or("Équipe 1 non trouvée")?.clone();
        let equipe2 = self.equipes.iter().find(|e| e.id == equipe2_id)
            .ok_or("Équipe 2 non trouvée")?.clone();

        if equipe1.get_titulaires().len() < 5 {
            return Err(format!("L'équipe {} n'a pas assez de titulaires (min 5)", equipe1.nom));
        }
        if equipe2.get_titulaires().len() < 5 {
            return Err(format!("L'équipe {} n'a pas assez de titulaires (min 5)", equipe2.nom));
        }

        let id = self.match_compteur;
        self.match_compteur += 1;
        self.match_actuel = Some(MoteurMatch::nouveau(id, equipe1, equipe2));
        Ok(())
    }

    /// Ajouter un joueur de la liste disponible à une équipe
    pub fn ajouter_joueur_a_equipe(&mut self, joueur_idx: usize, equipe_id: u32) -> Result<(), String> {
        if joueur_idx >= self.joueurs_disponibles.len() {
            return Err("Joueur non trouvé".to_string());
        }

        let equipe = self.equipes.iter_mut().find(|e| e.id == equipe_id)
            .ok_or("Équipe non trouvée")?;

        if equipe.joueurs.len() >= 10 {
            return Err("L'équipe est complète (10 joueurs max)".to_string());
        }

        let joueur = self.joueurs_disponibles.remove(joueur_idx);
        equipe.joueurs.push(joueur);
        Ok(())
    }

    /// Générer des équipes de démonstration avec les vrais joueurs
    pub fn initialiser_equipes_demo(&mut self) {
        let tous_joueurs = creer_joueurs_reels();

        // Équipe 1: Roland, Loïc, David, Thibault, Henry, Romain, Théo, Franck
        let mut equipe1 = Equipe::new(1, "Les Scientifiques Rouges");
        let ids_equipe1 = [1u32, 2, 3, 4, 5, 6, 7, 8]; // Roland, Loïc, David, Thibault, Henry, Romain, Théo, Franck

        // Équipe 2: Aurélien, Lucien, Joffrey, Yacine, Djilani, Médéric, Guillaume
        let mut equipe2 = Equipe::new(2, "Les Chercheurs Bleus");
        let ids_equipe2 = [9u32, 10, 11, 12, 13, 14, 15]; // Aurélien, Lucien, Joffrey, Yacine, Djilani, Médéric, Guillaume

        for j in tous_joueurs {
            if ids_equipe1.contains(&j.id) {
                let _ = equipe1.ajouter_joueur(j);
            } else if ids_equipe2.contains(&j.id) {
                let _ = equipe2.ajouter_joueur(j);
            }
        }

        // Sélectionner automatiquement les titulaires
        equipe1.selectionner_titulaires_auto();
        equipe2.selectionner_titulaires_auto();

        self.equipes = vec![equipe1, equipe2];
        self.joueurs_disponibles.clear();
    }

    pub fn synchroniser_match_vers_equipes(&mut self) {
        if let Some(ref match_fini) = self.match_actuel {
            if match_fini.periode == crate::models::match_engine::PeriodeMatch::Termine {
                let domicile_id = match_fini.equipe_domicile.id;
                let exterieur_id = match_fini.equipe_exterieur.id;

                if let Some(equipe) = self.equipes.iter_mut().find(|e| e.id == domicile_id) {
                    *equipe = match_fini.equipe_domicile.clone();
                }
                if let Some(equipe) = self.equipes.iter_mut().find(|e| e.id == exterieur_id) {
                    *equipe = match_fini.equipe_exterieur.clone();
                }
            }
        }
    }
}

/// Événements de jeu globaux
#[derive(Event)]
pub struct EvtChangerEcran(pub EcranJeu);

#[derive(Event)]
pub struct EvtDemarrerMatch;

#[derive(Event)]
pub struct EvtPauseMatch;

#[derive(Event)]
pub struct EvtReprendreMatch;

#[derive(Event)]
pub struct EvtSubstitution {
    pub equipe_id: u32,
    pub sortant_id: u32,
    pub entrant_id: u32,
}
