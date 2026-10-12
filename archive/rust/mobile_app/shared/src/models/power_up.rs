use serde::{Deserialize, Serialize};

/// Types de power-ups scientifiques disponibles
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TypePowerUp {
    VitesseQuantique,         // Vitesse x2 pendant 30s (Physique)
    ForceNewtonienne,         // Force de tir doublée (Physique)
    IncertitudeHeisenberg,    // Précision parfaite mais position aléatoire (Physique quantique)
    EMC2,                     // Énergie explosive, super tir (Physique)
    Photosynthese,            // Régénération d'endurance (Biologie)
    CodeBinaire,              // Anticipation des mouvements adverses (Informatique)
    TrouNoir,                 // Attraction du ballon (Astronomie)
    TectoniquePlaque,         // Défense impénétrable (Géologie)
    ReplicationADN,           // Clone temporaire (Biologie)
    TheorieDuTout,            // Tous les stats max 10s (Physique théorique)
    CircuitIntegre,           // Réactivité maximale (Électronique)
    PareFeuDefensif,          // Mur défensif (Cybersécurité)
    CatalyseurChimique,       // Accélération réactions équipe (Chimie)
    SubventionBoost,          // Boost d'énergie distribué à l'équipe (Aides)
    OptimisationBancaire,     // Maximisation du rendement offensif (Bancaire/Math)
}

impl TypePowerUp {
    pub fn get_nom(&self) -> &'static str {
        match self {
            TypePowerUp::VitesseQuantique => "Vitesse Quantique",
            TypePowerUp::ForceNewtonienne => "Force Newtonienne",
            TypePowerUp::IncertitudeHeisenberg => "Incertitude d'Heisenberg",
            TypePowerUp::EMC2 => "E=mc²",
            TypePowerUp::Photosynthese => "Photosynthèse",
            TypePowerUp::CodeBinaire => "Code Binaire",
            TypePowerUp::TrouNoir => "Trou Noir",
            TypePowerUp::TectoniquePlaque => "Tectonique des Plaques",
            TypePowerUp::ReplicationADN => "Réplication ADN",
            TypePowerUp::TheorieDuTout => "Théorie du Tout",
            TypePowerUp::CircuitIntegre => "Circuit Intégré",
            TypePowerUp::PareFeuDefensif => "Pare-feu Défensif",
            TypePowerUp::CatalyseurChimique => "Catalyseur Chimique",
            TypePowerUp::SubventionBoost => "Subvention Boost",
            TypePowerUp::OptimisationBancaire => "Optimisation Bancaire",
        }
    }

    pub fn get_description(&self) -> &'static str {
        match self {
            TypePowerUp::VitesseQuantique => "Déplacement quantique instantané pendant 30 secondes",
            TypePowerUp::ForceNewtonienne => "Chaque action produit une réaction... explosive ! Force x2",
            TypePowerUp::IncertitudeHeisenberg => "Précision maximale mais position imprévisible",
            TypePowerUp::EMC2 => "Masse convertie en énergie pure pour un tir dévastateur",
            TypePowerUp::Photosynthese => "Régénération constante d'endurance, comme une plante au soleil",
            TypePowerUp::CodeBinaire => "0 ou 1, vous anticipez tous les mouvements adverses",
            TypePowerUp::TrouNoir => "Attraction gravitationnelle du ballon vers vous",
            TypePowerUp::TectoniquePlaque => "Défense solide comme les plaques continentales",
            TypePowerUp::ReplicationADN => "Votre présence se multiplie sur le terrain",
            TypePowerUp::TheorieDuTout => "Unification parfaite de toutes vos capacités",
            TypePowerUp::CircuitIntegre => "Réactivité d'un processeur survolté",
            TypePowerUp::PareFeuDefensif => "Aucun tir ne passe votre défense pendant 20s",
            TypePowerUp::CatalyseurChimique => "Toute l'équipe accélère ses réactions",
            TypePowerUp::SubventionBoost => "Distribution d'énergie à tous vos coéquipiers",
            TypePowerUp::OptimisationBancaire => "Rendement offensif maximisé, ROI garanti",
        }
    }

    pub fn get_duree(&self) -> f32 {
        match self {
            TypePowerUp::VitesseQuantique => 30.0,
            TypePowerUp::ForceNewtonienne => 45.0,
            TypePowerUp::IncertitudeHeisenberg => 20.0,
            TypePowerUp::EMC2 => 2.0,
            TypePowerUp::Photosynthese => 60.0,
            TypePowerUp::CodeBinaire => 30.0,
            TypePowerUp::TrouNoir => 25.0,
            TypePowerUp::TectoniquePlaque => 40.0,
            TypePowerUp::ReplicationADN => 15.0,
            TypePowerUp::TheorieDuTout => 10.0,
            TypePowerUp::CircuitIntegre => 20.0,
            TypePowerUp::PareFeuDefensif => 20.0,
            TypePowerUp::CatalyseurChimique => 35.0,
            TypePowerUp::SubventionBoost => 45.0,
            TypePowerUp::OptimisationBancaire => 30.0,
        }
    }

    pub fn get_rarete(&self) -> Rarete {
        match self {
            TypePowerUp::VitesseQuantique => Rarete::Commun,
            TypePowerUp::ForceNewtonienne => Rarete::Commun,
            TypePowerUp::Photosynthese => Rarete::Commun,
            TypePowerUp::CodeBinaire => Rarete::Peu_Commun,
            TypePowerUp::CircuitIntegre => Rarete::Peu_Commun,
            TypePowerUp::TrouNoir => Rarete::Peu_Commun,
            TypePowerUp::TectoniquePlaque => Rarete::Rare,
            TypePowerUp::IncertitudeHeisenberg => Rarete::Rare,
            TypePowerUp::SubventionBoost => Rarete::Rare,
            TypePowerUp::OptimisationBancaire => Rarete::Rare,
            TypePowerUp::EMC2 => Rarete::Epique,
            TypePowerUp::PareFeuDefensif => Rarete::Epique,
            TypePowerUp::CatalyseurChimique => Rarete::Epique,
            TypePowerUp::ReplicationADN => Rarete::Legendaire,
            TypePowerUp::TheorieDuTout => Rarete::Legendaire,
        }
    }

    pub fn get_couleur(&self) -> [f32; 4] {
        let (r, g, b) = self.get_rarete().get_couleur();
        [r, g, b, 1.0]
    }

    /// Modificateurs d'attributs appliqués lors de l'activation
    pub fn get_modificateurs(&self) -> ModificateursPowerUp {
        match self {
            TypePowerUp::VitesseQuantique => ModificateursPowerUp { vitesse: 2.0, ..Default::default() },
            TypePowerUp::ForceNewtonienne => ModificateursPowerUp { force: 2.0, ..Default::default() },
            TypePowerUp::IncertitudeHeisenberg => ModificateursPowerUp { precision: 3.0, ..Default::default() },
            TypePowerUp::EMC2 => ModificateursPowerUp { force: 5.0, precision: 2.0, ..Default::default() },
            TypePowerUp::Photosynthese => ModificateursPowerUp { endurance: 2.0, ..Default::default() },
            TypePowerUp::CodeBinaire => ModificateursPowerUp { intelligence: 3.0, ..Default::default() },
            TypePowerUp::TrouNoir => ModificateursPowerUp { force: 1.5, defense: 1.5, ..Default::default() },
            TypePowerUp::TectoniquePlaque => ModificateursPowerUp { force: 2.5, defense: 2.0, ..Default::default() },
            TypePowerUp::ReplicationADN => ModificateursPowerUp { vitesse: 1.3, creativite: 2.0, ..Default::default() },
            TypePowerUp::TheorieDuTout => ModificateursPowerUp {
                vitesse: 2.0, force: 2.0, precision: 2.0,
                endurance: 2.0, intelligence: 2.0, creativite: 2.0, defense: 2.0,
            },
            TypePowerUp::CircuitIntegre => ModificateursPowerUp { vitesse: 1.8, intelligence: 1.5, ..Default::default() },
            TypePowerUp::PareFeuDefensif => ModificateursPowerUp { defense: 5.0, ..Default::default() },
            TypePowerUp::CatalyseurChimique => ModificateursPowerUp { vitesse: 1.3, creativite: 1.5, ..Default::default() },
            TypePowerUp::SubventionBoost => ModificateursPowerUp { endurance: 1.5, force: 1.3, ..Default::default() },
            TypePowerUp::OptimisationBancaire => ModificateursPowerUp { precision: 1.8, intelligence: 1.6, ..Default::default() },
        }
    }

    pub fn generer_aleatoire() -> TypePowerUp {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let roll: f32 = rng.gen();

        // Distribution par rareté
        if roll < 0.40 {
            // Commun (40%)
            let communs = [TypePowerUp::VitesseQuantique, TypePowerUp::ForceNewtonienne, TypePowerUp::Photosynthese];
            communs[rng.gen_range(0..communs.len())]
        } else if roll < 0.70 {
            // Peu commun (30%)
            let peu_communs = [TypePowerUp::CodeBinaire, TypePowerUp::CircuitIntegre, TypePowerUp::TrouNoir];
            peu_communs[rng.gen_range(0..peu_communs.len())]
        } else if roll < 0.88 {
            // Rare (18%)
            let rares = [TypePowerUp::TectoniquePlaque, TypePowerUp::IncertitudeHeisenberg, TypePowerUp::SubventionBoost, TypePowerUp::OptimisationBancaire];
            rares[rng.gen_range(0..rares.len())]
        } else if roll < 0.96 {
            // Épique (8%)
            let epiques = [TypePowerUp::EMC2, TypePowerUp::PareFeuDefensif, TypePowerUp::CatalyseurChimique];
            epiques[rng.gen_range(0..epiques.len())]
        } else {
            // Légendaire (4%)
            if rng.gen_bool(0.5) { TypePowerUp::ReplicationADN } else { TypePowerUp::TheorieDuTout }
        }
    }
}

/// Rareté du power-up
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[allow(non_camel_case_types)]
pub enum Rarete {
    Commun,
    Peu_Commun,
    Rare,
    Epique,
    Legendaire,
}

impl Rarete {
    pub fn get_nom(&self) -> &'static str {
        match self {
            Rarete::Commun => "Commun",
            Rarete::Peu_Commun => "Peu Commun",
            Rarete::Rare => "Rare",
            Rarete::Epique => "Épique",
            Rarete::Legendaire => "Légendaire",
        }
    }

    pub fn get_couleur(&self) -> (f32, f32, f32) {
        match self {
            Rarete::Commun => (0.7, 0.7, 0.7),
            Rarete::Peu_Commun => (0.2, 0.8, 0.2),
            Rarete::Rare => (0.2, 0.4, 1.0),
            Rarete::Epique => (0.6, 0.2, 0.8),
            Rarete::Legendaire => (1.0, 0.8, 0.0),
        }
    }
}

/// Modificateurs appliqués par un power-up
#[derive(Debug, Clone, Copy)]
pub struct ModificateursPowerUp {
    pub vitesse: f32,
    pub force: f32,
    pub precision: f32,
    pub endurance: f32,
    pub intelligence: f32,
    pub creativite: f32,
    pub defense: f32,
}

impl Default for ModificateursPowerUp {
    fn default() -> Self {
        Self {
            vitesse: 1.0,
            force: 1.0,
            precision: 1.0,
            endurance: 1.0,
            intelligence: 1.0,
            creativite: 1.0,
            defense: 1.0,
        }
    }
}

/// Power-up actuellement actif sur un joueur
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PowerUpActif {
    pub type_power_up: TypePowerUp,
    pub temps_restant: f32,
    pub joueur_id: u32,
}

impl PowerUpActif {
    pub fn new(type_power_up: TypePowerUp, joueur_id: u32) -> Self {
        let duree = type_power_up.get_duree();
        Self { type_power_up, temps_restant: duree, joueur_id }
    }

    pub fn mise_a_jour(&mut self, delta: f32) -> bool {
        self.temps_restant -= delta;
        self.temps_restant > 0.0
    }

    pub fn est_actif(&self) -> bool {
        self.temps_restant > 0.0
    }
}

/// Inventaire de power-ups d'un joueur
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct InventairePowerUp {
    pub disponibles: Vec<TypePowerUp>,
    pub max_slots: usize,
}

impl InventairePowerUp {
    pub fn new(max_slots: usize) -> Self {
        Self { disponibles: Vec::new(), max_slots }
    }

    pub fn ajouter(&mut self, power_up: TypePowerUp) -> bool {
        if self.disponibles.len() < self.max_slots {
            self.disponibles.push(power_up);
            true
        } else {
            false
        }
    }

    pub fn utiliser(&mut self, index: usize) -> Option<TypePowerUp> {
        if index < self.disponibles.len() {
            Some(self.disponibles.remove(index))
        } else {
            None
        }
    }

    pub fn est_plein(&self) -> bool {
        self.disponibles.len() >= self.max_slots
    }
}
