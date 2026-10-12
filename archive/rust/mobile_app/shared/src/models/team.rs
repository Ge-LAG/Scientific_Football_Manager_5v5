use serde::{Deserialize, Serialize};
use crate::models::player::{Joueur, Position};
use crate::models::scientific_domain::ScientificDomain;

/// Formation tactique de l'équipe (5v5, donc 1 gardien + 4 joueurs de champ)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Formation {
    F121,   // 1GK - 1DEF - 2MIL - 1ATT
    F112,   // 1GK - 1DEF - 1MIL - 2ATT
    F211,   // 1GK - 2DEF - 1MIL - 1ATT
    F1111,  // 1GK - 1DEF - 1MIL - 1ATT - 1LIBRE
}

impl Formation {
    pub fn get_nom(&self) -> &'static str {
        match self {
            Formation::F121 => "1-2-1 (Équilibré)",
            Formation::F112 => "1-1-2 (Offensif)",
            Formation::F211 => "2-1-1 (Défensif)",
            Formation::F1111 => "1-1-1-1 (Flexible)",
        }
    }

    pub fn get_positions_requises(&self) -> Vec<Position> {
        match self {
            Formation::F121 => vec![
                Position::Gardien, Position::Defenseur,
                Position::Milieu, Position::Milieu, Position::Attaquant,
            ],
            Formation::F112 => vec![
                Position::Gardien, Position::Defenseur,
                Position::Milieu, Position::Attaquant, Position::Attaquant,
            ],
            Formation::F211 => vec![
                Position::Gardien, Position::Defenseur, Position::Defenseur,
                Position::Milieu, Position::Attaquant,
            ],
            Formation::F1111 => vec![
                Position::Gardien, Position::Defenseur,
                Position::Milieu, Position::Attaquant, Position::Milieu,
            ],
        }
    }

    pub fn get_description(&self) -> &'static str {
        match self {
            Formation::F121 => "Équilibre parfait entre défense et attaque",
            Formation::F112 => "Deux attaquants pour un jeu offensif explosif",
            Formation::F211 => "Priorité à la défense avec deux défenseurs",
            Formation::F1111 => "Formation flexible adaptée à toutes les situations",
        }
    }
}

/// Instructions tactiques de l'équipe
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstructionsTactiques {
    pub intensite: f32,       // 0.5 à 1.5 - Intensité du pressing
    pub pressing_haut: bool,  // Pressing haut de terrain
    pub contre_attaque: bool, // Jeu en contre-attaque
    pub possession: bool,     // Jeu de possession
    pub ligne_haute: bool,    // Ligne défensive haute
    pub tirs_a_distance: bool, // Tentatives de tirs à distance
}

impl Default for InstructionsTactiques {
    fn default() -> Self {
        Self {
            intensite: 1.0,
            pressing_haut: false,
            contre_attaque: false,
            possession: true,
            ligne_haute: false,
            tirs_a_distance: false,
        }
    }
}

/// Équipe de football
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Equipe {
    pub id: u32,
    pub nom: String,
    pub joueurs: Vec<Joueur>,
    pub formation: Formation,
    pub instructions: InstructionsTactiques,
    pub budget: u32,
    pub reputation: f32,

    // Statistiques de saison
    pub victoires: u32,
    pub nuls: u32,
    pub defaites: u32,
    pub buts_marques: u32,
    pub buts_encaisses: u32,

    // Chimie d'équipe
    pub chimie: f32,  // 0.0 à 1.0
}

impl Equipe {
    pub fn new(id: u32, nom: &str) -> Self {
        Self {
            id,
            nom: nom.to_string(),
            joueurs: Vec::new(),
            formation: Formation::F121,
            instructions: InstructionsTactiques::default(),
            budget: 100_000,
            reputation: 0.5,
            victoires: 0,
            nuls: 0,
            defaites: 0,
            buts_marques: 0,
            buts_encaisses: 0,
            chimie: 0.5,
        }
    }

    pub fn ajouter_joueur(&mut self, joueur: Joueur) -> Result<(), String> {
        if self.joueurs.len() >= 15 {
            return Err("L'effectif est au complet (15 joueurs max)".to_string());
        }
        self.joueurs.push(joueur);
        self.recalculer_chimie();
        Ok(())
    }

    pub fn retirer_joueur(&mut self, id: u32) -> Option<Joueur> {
        if let Some(idx) = self.joueurs.iter().position(|j| j.id == id) {
            let j = self.joueurs.remove(idx);
            self.recalculer_chimie();
            Some(j)
        } else {
            None
        }
    }

    pub fn get_titulaires(&self) -> Vec<&Joueur> {
        self.joueurs.iter().filter(|j| j.sur_le_terrain).collect()
    }

    pub fn get_remplacants(&self) -> Vec<&Joueur> {
        self.joueurs.iter().filter(|j| !j.sur_le_terrain && j.est_disponible()).collect()
    }

    pub fn get_joueur(&self, id: u32) -> Option<&Joueur> {
        self.joueurs.iter().find(|j| j.id == id)
    }

    pub fn get_joueur_mut(&mut self, id: u32) -> Option<&mut Joueur> {
        self.joueurs.iter_mut().find(|j| j.id == id)
    }

    /// Note globale de l'équipe
    pub fn note_equipe(&self) -> f32 {
        let titulaires = self.get_titulaires();
        if titulaires.is_empty() { return 0.0; }
        let somme: f32 = titulaires.iter().map(|j| j.note_globale()).sum();
        let moy = somme / titulaires.len() as f32;
        moy * (1.0 + self.chimie * 0.1) // Bonus chimie
    }

    pub fn faire_substitution(&mut self, sortant_id: u32, entrant_id: u32) -> Result<(), String> {
        // Vérifier que le sortant est sur le terrain
        let sortant = self.joueurs.iter_mut().find(|j| j.id == sortant_id)
            .ok_or("Joueur sortant non trouvé")?;
        if !sortant.sur_le_terrain {
            return Err("Le joueur n'est pas sur le terrain".to_string());
        }
        sortant.sur_le_terrain = false;

        // Mettre le joueur entrant sur le terrain
        let entrant = self.joueurs.iter_mut().find(|j| j.id == entrant_id)
            .ok_or("Joueur entrant non trouvé")?;
        if entrant.sur_le_terrain {
            return Err("Le joueur est déjà sur le terrain".to_string());
        }
        if !entrant.est_disponible() {
            return Err("Le joueur n'est pas disponible (blessé/suspendu)".to_string());
        }
        entrant.sur_le_terrain = true;
        Ok(())
    }

    pub fn set_formation(&mut self, formation: Formation) {
        self.formation = formation;
    }

    fn recalculer_chimie(&mut self) {
        let titulaires = self.get_titulaires();
        if titulaires.len() < 2 {
            self.chimie = 0.5;
            return;
        }

        let mut total_compatibilite = 0.0;
        let mut nb_paires = 0;

        for i in 0..titulaires.len() {
            for j in (i + 1)..titulaires.len() {
                let compat = titulaires[i].domaine.compatibility_with(&titulaires[j].domaine);
                total_compatibilite += compat;
                nb_paires += 1;
            }
        }

        self.chimie = if nb_paires > 0 {
            (total_compatibilite / nb_paires as f32 * 0.7 + 0.3).min(1.0)
        } else {
            0.5
        };
    }

    pub fn selectionner_titulaires_auto(&mut self) {
        // Désélectionner tout le monde et réinitialiser position_actuelle
        for j in &mut self.joueurs {
            j.sur_le_terrain = false;
            j.position_actuelle = j.position_preferee;
        }

        let positions = self.formation.get_positions_requises();
        let mut positions_restantes = positions.clone();

        // D'abord, assigner le gardien : choisir le meilleur joueur défensif
        // (aucun joueur n'a Position::Gardien par défaut)
        if let Some(gk_slot) = positions_restantes.iter().position(|p| *p == Position::Gardien) {
            // Trouver le meilleur candidat gardien (meilleure défense + jeu de tête)
            let meilleur_gardien_idx = self.joueurs.iter()
                .enumerate()
                .filter(|(_, j)| j.est_disponible())
                .max_by(|(_, a), (_, b)| {
                    let score_a = a.stats_effectives.defense * 0.6 + a.stats_effectives.jeu_de_tete * 0.4;
                    let score_b = b.stats_effectives.defense * 0.6 + b.stats_effectives.jeu_de_tete * 0.4;
                    score_a.partial_cmp(&score_b).unwrap_or(std::cmp::Ordering::Equal)
                })
                .map(|(idx, _)| idx);

            if let Some(idx) = meilleur_gardien_idx {
                self.joueurs[idx].sur_le_terrain = true;
                self.joueurs[idx].position_actuelle = Position::Gardien;
                positions_restantes.remove(gk_slot);
            }
        }

        // Trier les joueurs restants par note décroissante
        let mut indices_joueurs: Vec<usize> = (0..self.joueurs.len())
            .filter(|&idx| !self.joueurs[idx].sur_le_terrain)
            .collect();
        indices_joueurs.sort_by(|&a, &b| {
            self.joueurs[b].note_globale()
                .partial_cmp(&self.joueurs[a].note_globale())
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Assigner les positions restantes
        for idx in indices_joueurs {
            let joueur = &self.joueurs[idx];
            if !joueur.est_disponible() { continue; }

            // Chercher une position correspondante à la préférence du joueur
            if let Some(pos_idx) = positions_restantes.iter()
                .position(|p| *p == joueur.position_preferee)
            {
                let pos = positions_restantes.remove(pos_idx);
                self.joueurs[idx].sur_le_terrain = true;
                self.joueurs[idx].position_actuelle = pos;
            } else if !positions_restantes.is_empty() {
                // Prendre la première position disponible
                let pos = positions_restantes.remove(0);
                self.joueurs[idx].sur_le_terrain = true;
                self.joueurs[idx].position_actuelle = pos;
            }

            if positions_restantes.is_empty() { break; }
        }

        self.recalculer_chimie();
    }

    pub fn entrainement(&mut self) {
        for j in &mut self.joueurs {
            j.forme = (j.forme + 0.03).min(1.5);
            j.recuperer_stamina(20.0);
        }
    }

    pub fn repos_equipe(&mut self) {
        for j in &mut self.joueurs {
            j.stamina = j.stamina_max;
            j.moral = (j.moral + 0.05).min(1.5);
        }
    }

    pub fn points(&self) -> u32 {
        self.victoires * 3 + self.nuls
    }

    pub fn difference_buts(&self) -> i32 {
        self.buts_marques as i32 - self.buts_encaisses as i32
    }
}
