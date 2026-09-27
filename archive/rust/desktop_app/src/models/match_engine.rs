use serde::{Deserialize, Serialize};
use rand::Rng;
use crate::models::team::Equipe;
use crate::models::player::Position;
use crate::models::power_up::TypePowerUp;

/// Période du match
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PeriodeMatch {
    PremiereMitemps,
    MiTemps,
    DeuxiemeMitemps,
    Termine,
}

impl PeriodeMatch {
    pub fn get_nom(&self) -> &'static str {
        match self {
            PeriodeMatch::PremiereMitemps => "1ère mi-temps",
            PeriodeMatch::MiTemps => "Mi-temps",
            PeriodeMatch::DeuxiemeMitemps => "2ème mi-temps",
            PeriodeMatch::Termine => "Terminé",
        }
    }
}

/// Événement survenu pendant le match
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EvenementMatch {
    But {
        minute: u32,
        buteur_id: u32,
        equipe_id: u32,
        passeur_id: Option<u32>,
        description: String,
    },
    Substitution {
        minute: u32,
        equipe_id: u32,
        sortant_id: u32,
        entrant_id: u32,
    },
    PowerUpUtilise {
        minute: u32,
        joueur_id: u32,
        type_power_up: TypePowerUp,
    },
    CartonJaune {
        minute: u32,
        joueur_id: u32,
        raison: String,
    },
    DecouverteScientifique {
        minute: u32,
        equipe_id: u32,
        description: String,
        bonus: f32,
    },
    SauvetageGardien {
        minute: u32,
        gardien_id: u32,
    },
    BelleAction {
        minute: u32,
        joueur_id: u32,
        description: String,
    },
}

impl EvenementMatch {
    pub fn get_minute(&self) -> u32 {
        match self {
            EvenementMatch::But { minute, .. } => *minute,
            EvenementMatch::Substitution { minute, .. } => *minute,
            EvenementMatch::PowerUpUtilise { minute, .. } => *minute,
            EvenementMatch::CartonJaune { minute, .. } => *minute,
            EvenementMatch::DecouverteScientifique { minute, .. } => *minute,
            EvenementMatch::SauvetageGardien { minute, .. } => *minute,
            EvenementMatch::BelleAction { minute, .. } => *minute,
        }
    }

    pub fn get_description_courte(&self) -> String {
        match self {
            EvenementMatch::But { minute, description, .. } => format!("{}' ⚽ {}", minute, description),
            EvenementMatch::Substitution { minute, .. } => format!("{}' 🔄 Substitution", minute),
            EvenementMatch::PowerUpUtilise { minute, type_power_up, .. } => {
                format!("{}' ⚡ {}", minute, type_power_up.get_nom())
            },
            EvenementMatch::CartonJaune { minute, raison, .. } => format!("{}' 🟡 {}", minute, raison),
            EvenementMatch::DecouverteScientifique { minute, description, .. } => format!("{}' 🔬 {}", minute, description),
            EvenementMatch::SauvetageGardien { minute, .. } => format!("{}' 🧤 Arrêt du gardien", minute),
            EvenementMatch::BelleAction { minute, description, .. } => format!("{}' ✨ {}", minute, description),
        }
    }
}

/// État de position d'un joueur pendant le match
#[derive(Debug, Clone)]
pub struct EtatJoueurMatch {
    pub joueur_id: u32,
    pub equipe_id: u32,
    pub position_x: f32,   // -50 à 50 (longueur terrain)
    pub position_z: f32,   // -25 à 25 (largeur terrain)
    pub velocite_x: f32,
    pub velocite_z: f32,
    pub a_le_ballon: bool,
    pub stamina: f32,
    pub actif: bool,
}

/// Moteur de simulation de match
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoteurMatch {
    pub id: u32,
    pub equipe_domicile: Equipe,
    pub equipe_exterieur: Equipe,
    pub score_domicile: u32,
    pub score_exterieur: u32,
    pub temps_ecoule: f32,          // En secondes (0 à 1200 = 20 minutes)
    pub duree_match: f32,
    pub periode: PeriodeMatch,
    pub evenements: Vec<EvenementMatch>,
    pub ballon_x: f32,
    pub ballon_z: f32,
    pub en_jeu: bool,
    pub vitesse_simulation: f32,    // Multiplicateur de vitesse
    pub bonus_domicile: f32,        // Bonus scientifique de l'équipe domicile
    pub bonus_exterieur: f32,
}

impl MoteurMatch {
    pub fn nouveau(id: u32, domicile: Equipe, exterieur: Equipe) -> Self {
        let mut m = Self {
            id,
            equipe_domicile: domicile,
            equipe_exterieur: exterieur,
            score_domicile: 0,
            score_exterieur: 0,
            temps_ecoule: 0.0,
            duree_match: 1200.0, // 20 minutes
            periode: PeriodeMatch::PremiereMitemps,
            evenements: Vec::new(),
            ballon_x: 0.0,
            ballon_z: 0.0,
            en_jeu: false,
            vitesse_simulation: 1.0,
            bonus_domicile: 0.0,
            bonus_exterieur: 0.0,
        };
        m.calculer_bonus_scientifiques();
        m
    }

    fn calculer_bonus_scientifiques(&mut self) {
        // Les découvertes scientifiques entre domaines proches génèrent des bonus
        let chimie_d = self.equipe_domicile.chimie;
        let chimie_e = self.equipe_exterieur.chimie;

        // Bonus si l'équipe a une bonne chimie
        self.bonus_domicile = (chimie_d - 0.5) * 0.2;
        self.bonus_exterieur = (chimie_e - 0.5) * 0.2;
    }

    pub fn demarrer(&mut self) {
        self.en_jeu = true;
        self.periode = PeriodeMatch::PremiereMitemps;

        // Mettre les titulaires sur le terrain
        for j in &mut self.equipe_domicile.joueurs {
            if j.sur_le_terrain {
                j.matchs_joues += 1;
            }
        }
        for j in &mut self.equipe_exterieur.joueurs {
            if j.sur_le_terrain {
                j.matchs_joues += 1;
            }
        }
    }

    pub fn pause(&mut self) {
        self.en_jeu = false;
    }

    pub fn reprendre(&mut self) {
        if self.periode == PeriodeMatch::MiTemps {
            self.periode = PeriodeMatch::DeuxiemeMitemps;
        }
        self.en_jeu = true;
    }

    pub fn mise_a_jour(&mut self, delta: f32) {
        if !self.en_jeu { return; }

        let delta_ajuste = delta * self.vitesse_simulation;
        self.temps_ecoule += delta_ajuste;

        // Gestion des périodes
        if self.temps_ecoule >= 600.0 && self.periode == PeriodeMatch::PremiereMitemps {
            self.periode = PeriodeMatch::MiTemps;
            self.en_jeu = false;
            return;
        }
        if self.temps_ecoule >= 1200.0 && self.periode == PeriodeMatch::DeuxiemeMitemps {
            self.terminer_match();
            return;
        }

        // Simulation du gameplay
        self.simuler_jeu(delta_ajuste);

        // Mise à jour stamina
        self.mise_a_jour_stamina(delta_ajuste);

        // Événements aléatoires
        self.generer_evenements(delta_ajuste);
    }

    fn simuler_jeu(&mut self, delta: f32) {
        let mut rng = rand::thread_rng();

        // Déplacement du ballon (simulation simplifiée)
        let bruit_x: f32 = rng.gen_range(-1.0..1.0) * delta * 8.0;
        let bruit_z: f32 = rng.gen_range(-1.0..1.0) * delta * 8.0;

        self.ballon_x = (self.ballon_x + bruit_x).clamp(-48.0, 48.0);
        self.ballon_z = (self.ballon_z + bruit_z).clamp(-23.0, 23.0);

        // Influence des équipes sur le contrôle du ballon
        let note_d = self.equipe_domicile.note_equipe() * (1.0 + self.bonus_domicile);
        let note_e = self.equipe_exterieur.note_equipe() * (1.0 + self.bonus_exterieur);
        let total = note_d + note_e;

        if total > 0.0 {
            let possession_d = note_d / total;
            // Pousser le ballon vers l'un ou l'autre camp selon la domination
            let tendance = (possession_d - 0.5) * delta * 3.0;
            self.ballon_x = (self.ballon_x + tendance).clamp(-48.0, 48.0);
        }
    }

    fn mise_a_jour_stamina(&mut self, delta: f32) {
        let intensite_d = self.equipe_domicile.instructions.intensite;
        let intensite_e = self.equipe_exterieur.instructions.intensite;

        for j in &mut self.equipe_domicile.joueurs {
            if j.sur_le_terrain {
                j.consommer_stamina(1.5 * intensite_d * delta);
            }
        }
        for j in &mut self.equipe_exterieur.joueurs {
            if j.sur_le_terrain {
                j.consommer_stamina(1.5 * intensite_e * delta);
            }
        }
    }

    fn generer_evenements(&mut self, delta: f32) {
        let mut rng = rand::thread_rng();
        let minute = self.get_minute_actuelle();

        // Probabilité de but (ajustée par les notes d'équipe)
        let note_d = self.equipe_domicile.note_equipe() * (1.0 + self.bonus_domicile);
        let note_e = self.equipe_exterieur.note_equipe() * (1.0 + self.bonus_exterieur);
        let total = note_d + note_e;

        let prob_but_base = 0.0018 * delta;

        if rng.gen::<f32>() < prob_but_base {
            let c_domicile = note_d / total;
            if rng.gen::<f32>() < c_domicile {
                self.tenter_but(true, minute);
            } else {
                self.tenter_but(false, minute);
            }
        }

        // Probabilité de carton jaune
        let prob_carton = 0.0003 * delta;
        if rng.gen::<f32>() < prob_carton {
            self.generer_carton(minute);
        }

        // Découvertes scientifiques (boost temporaire)
        let prob_decouverte = 0.0002 * delta;
        if rng.gen::<f32>() < prob_decouverte {
            self.generer_decouverte_scientifique(minute);
        }

        // Belle action
        let prob_belle_action = 0.0005 * delta;
        if rng.gen::<f32>() < prob_belle_action {
            self.generer_belle_action(minute);
        }
    }

    fn tenter_but(&mut self, est_domicile: bool, minute: u32) {
        let mut rng = rand::thread_rng();

        let (equipe, equipe_adverse, equipe_id) = if est_domicile {
            (&self.equipe_domicile, &self.equipe_exterieur, self.equipe_domicile.id)
        } else {
            (&self.equipe_exterieur, &self.equipe_domicile, self.equipe_exterieur.id)
        };

        // Chercher un attaquant ou milieu disponible
        let tireurs: Vec<u32> = equipe.joueurs.iter()
            .filter(|j| j.sur_le_terrain && matches!(j.position_actuelle, Position::Attaquant | Position::Milieu))
            .map(|j| j.id)
            .collect();

        if tireurs.is_empty() { return; }

        let tireur_id = tireurs[rng.gen_range(0..tireurs.len())];
        let tireur = equipe.joueurs.iter().find(|j| j.id == tireur_id).unwrap();

        // Calculer la probabilité de réussite
        let precision_tir = tireur.stats_effectives.precision / 100.0;
        let attaque = tireur.stats_effectives.attaque / 100.0;

        // Résistance du gardien adverse
        let gardien = equipe_adverse.joueurs.iter()
            .find(|j| j.sur_le_terrain && j.position_actuelle == Position::Gardien);

        let resistance_gardien = if let Some(g) = gardien {
            (g.stats_effectives.precision + g.stats_effectives.defense) / 200.0
        } else {
            0.4 // Gardien par défaut si absent
        };

        let chance_reussite = (precision_tir * 0.5 + attaque * 0.5) * (1.0 - resistance_gardien * 0.6);

        if rng.gen::<f32>() < chance_reussite {
            // BUT !
            // Chercher un passeur potentiel
            let passeurs: Vec<u32> = equipe.joueurs.iter()
                .filter(|j| j.sur_le_terrain && j.id != tireur_id)
                .map(|j| j.id)
                .collect();
            let passeur_id = if !passeurs.is_empty() && rng.gen_bool(0.6) {
                Some(passeurs[rng.gen_range(0..passeurs.len())])
            } else { None };

            // Générer une description de but créative
            let descriptions = [
                format!("Magnifique frappe de {} !", tireur.prenom),
                format!("{} conclut brillamment !", tireur.prenom),
                format!("Quel geste technique de {} !", tireur.prenom),
                format!("{} ne rate pas !", tireur.prenom),
                format!("But d'anthologie de {} !", tireur.prenom),
            ];
            let desc = descriptions[rng.gen_range(0..descriptions.len())].clone();

            if est_domicile {
                self.score_domicile += 1;
                // Mettre à jour les stats des joueurs
                if let Some(j) = self.equipe_domicile.joueurs.iter_mut().find(|j| j.id == tireur_id) {
                    j.marquer_but();
                }
                if let Some(pid) = passeur_id {
                    if let Some(j) = self.equipe_domicile.joueurs.iter_mut().find(|j| j.id == pid) {
                        j.faire_passe_decisive();
                    }
                }
                // Moral de l'équipe
                for j in &mut self.equipe_domicile.joueurs {
                    j.moral = (j.moral + 0.05).min(1.5);
                }
                for j in &mut self.equipe_exterieur.joueurs {
                    j.moral = (j.moral - 0.05).max(0.5);
                }
            } else {
                self.score_exterieur += 1;
                if let Some(j) = self.equipe_exterieur.joueurs.iter_mut().find(|j| j.id == tireur_id) {
                    j.marquer_but();
                }
                if let Some(pid) = passeur_id {
                    if let Some(j) = self.equipe_exterieur.joueurs.iter_mut().find(|j| j.id == pid) {
                        j.faire_passe_decisive();
                    }
                }
                for j in &mut self.equipe_exterieur.joueurs {
                    j.moral = (j.moral + 0.05).min(1.5);
                }
                for j in &mut self.equipe_domicile.joueurs {
                    j.moral = (j.moral - 0.05).max(0.5);
                }
            }

            self.evenements.push(EvenementMatch::But {
                minute,
                buteur_id: tireur_id,
                equipe_id,
                passeur_id,
                description: desc,
            });
        } else if let Some(g) = gardien {
            // Arrêt du gardien
            let gardien_id = g.id;
            self.evenements.push(EvenementMatch::SauvetageGardien {
                minute,
                gardien_id,
            });
        }
    }

    fn generer_carton(&mut self, minute: u32) {
        let mut rng = rand::thread_rng();

        // Domaine à risque = Mathématiques (Théo fait des fautes)
        let equipes = [
            (self.equipe_domicile.id, true),
            (self.equipe_exterieur.id, false),
        ];

        let (_equipe_id, est_domicile) = equipes[rng.gen_range(0..equipes.len())];

        let equipe = if est_domicile { &self.equipe_domicile } else { &self.equipe_exterieur };
        let joueurs_terrain: Vec<u32> = equipe.joueurs.iter()
            .filter(|j| j.sur_le_terrain)
            .map(|j| j.id)
            .collect();

        if joueurs_terrain.is_empty() { return; }

        let joueur_id = joueurs_terrain[rng.gen_range(0..joueurs_terrain.len())];
        let equipe_mut = if est_domicile { &mut self.equipe_domicile } else { &mut self.equipe_exterieur };

        if let Some(j) = equipe_mut.joueurs.iter_mut().find(|j| j.id == joueur_id) {
            // Théo a moins de chances de carton (charmeur d'arbitre)
            let reduction = if j.traits.iter().any(|t| t.nom == "Charmeur d'Arbitre") { 0.3 } else { 1.0 };
            if rng.gen::<f32>() > reduction * 0.7 { return; }

            j.cartons_jaunes += 1;
            let raisons = [
                "Tacle trop appuyé",
                "Contestation de décision",
                "Retard de jeu",
                "Faute tactique",
            ];
            let raison = raisons[rng.gen_range(0..raisons.len())].to_string();

            self.evenements.push(EvenementMatch::CartonJaune {
                minute,
                joueur_id,
                raison,
            });
        }
    }

    fn generer_decouverte_scientifique(&mut self, minute: u32) {
        let mut rng = rand::thread_rng();
        let est_domicile = rng.gen_bool(0.5);
        let equipe_id = if est_domicile { self.equipe_domicile.id } else { self.equipe_exterieur.id };

        let decouvertes = [
            ("Synergie moléculaire découverte !", 0.1),
            ("Calcul tactique optimisé par algorithme !", 0.08),
            ("Réaction catalytique explosive !", 0.12),
            ("Équation du mouvement parfaitement calculée !", 0.09),
            ("Circuit neuronal activé !", 0.07),
        ];

        let (desc, bonus) = decouvertes[rng.gen_range(0..decouvertes.len())];

        // Appliquer le bonus temporaire à l'équipe
        let equipe = if est_domicile { &mut self.equipe_domicile } else { &mut self.equipe_exterieur };
        for j in equipe.joueurs.iter_mut().filter(|j| j.sur_le_terrain) {
            j.forme = (j.forme + bonus).min(1.5);
        }

        self.evenements.push(EvenementMatch::DecouverteScientifique {
            minute,
            equipe_id,
            description: desc.to_string(),
            bonus,
        });
    }

    fn generer_belle_action(&mut self, minute: u32) {
        let mut rng = rand::thread_rng();
        let est_domicile = rng.gen_bool(0.5);
        let equipe = if est_domicile { &self.equipe_domicile } else { &self.equipe_exterieur };

        let joueurs_terrain: Vec<u32> = equipe.joueurs.iter()
            .filter(|j| j.sur_le_terrain)
            .map(|j| j.id)
            .collect();

        if joueurs_terrain.is_empty() { return; }
        let joueur_id = joueurs_terrain[rng.gen_range(0..joueurs_terrain.len())];

        let actions = [
            "Dribble dévastateur !",
            "Frappe de loin spectaculaire !",
            "Petit pont humiliant !",
            "Tête piquée précise !",
            "Reprise de volée technique !",
            "Passe en profondeur parfaite !",
        ];
        let desc = actions[rng.gen_range(0..actions.len())].to_string();

        self.evenements.push(EvenementMatch::BelleAction {
            minute,
            joueur_id,
            description: desc,
        });
    }

    fn terminer_match(&mut self) {
        self.en_jeu = false;
        self.periode = PeriodeMatch::Termine;

        // Mettre à jour les statistiques des équipes
        match self.score_domicile.cmp(&self.score_exterieur) {
            std::cmp::Ordering::Greater => {
                self.equipe_domicile.victoires += 1;
                self.equipe_exterieur.defaites += 1;
            }
            std::cmp::Ordering::Less => {
                self.equipe_exterieur.victoires += 1;
                self.equipe_domicile.defaites += 1;
            }
            std::cmp::Ordering::Equal => {
                self.equipe_domicile.nuls += 1;
                self.equipe_exterieur.nuls += 1;
            }
        }

        self.equipe_domicile.buts_marques += self.score_domicile;
        self.equipe_domicile.buts_encaisses += self.score_exterieur;
        self.equipe_exterieur.buts_marques += self.score_exterieur;
        self.equipe_exterieur.buts_encaisses += self.score_domicile;
    }

    pub fn get_minute_actuelle(&self) -> u32 {
        (self.temps_ecoule / 60.0) as u32
    }

    pub fn get_temps_affichage(&self) -> String {
        let minutes = self.get_minute_actuelle();
        let secondes = (self.temps_ecoule % 60.0) as u32;
        format!("{:02}:{:02}", minutes, secondes)
    }

    pub fn get_vainqueur(&self) -> Option<u32> {
        if self.periode != PeriodeMatch::Termine { return None; }
        match self.score_domicile.cmp(&self.score_exterieur) {
            std::cmp::Ordering::Greater => Some(self.equipe_domicile.id),
            std::cmp::Ordering::Less => Some(self.equipe_exterieur.id),
            std::cmp::Ordering::Equal => None,
        }
    }

    pub fn get_score_affichage(&self) -> String {
        format!("{} - {}", self.score_domicile, self.score_exterieur)
    }

    pub fn get_evenements_recents(&self, n: usize) -> Vec<&EvenementMatch> {
        self.evenements.iter().rev().take(n).collect()
    }

    pub fn faire_substitution(&mut self, equipe_id: u32, sortant_id: u32, entrant_id: u32) -> Result<(), String> {
        let equipe = if equipe_id == self.equipe_domicile.id {
            &mut self.equipe_domicile
        } else if equipe_id == self.equipe_exterieur.id {
            &mut self.equipe_exterieur
        } else {
            return Err("Équipe non trouvée".to_string());
        };

        equipe.faire_substitution(sortant_id, entrant_id)?;

        self.evenements.push(EvenementMatch::Substitution {
            minute: self.get_minute_actuelle(),
            equipe_id,
            sortant_id,
            entrant_id,
        });

        Ok(())
    }
}
