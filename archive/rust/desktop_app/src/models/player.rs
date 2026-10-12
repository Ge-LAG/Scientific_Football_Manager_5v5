use serde::{Deserialize, Serialize};
use crate::models::scientific_domain::ScientificDomain;

/// Attributs numériques d'un joueur (valeurs entre 0.0 et 100.0)
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PlayerStats {
    pub vitesse: f32,        // Vitesse de déplacement
    pub force: f32,          // Force physique
    pub precision: f32,      // Précision des passes/tirs
    pub endurance: f32,      // Endurance
    pub intelligence: f32,   // Intelligence de jeu
    pub creativite: f32,     // Créativité
    pub defense: f32,        // Capacité défensive
    pub attaque: f32,        // Capacité offensive
    pub jeu_de_tete: f32,    // Jeu de tête
}

impl PlayerStats {
    pub fn new(
        vitesse: f32, force: f32, precision: f32, endurance: f32,
        intelligence: f32, creativite: f32, defense: f32, attaque: f32, jeu_de_tete: f32,
    ) -> Self {
        Self { vitesse, force, precision, endurance, intelligence, creativite, defense, attaque, jeu_de_tete }
    }

    /// Note globale du joueur (sur 100)
    pub fn note_globale(&self) -> f32 {
        (self.vitesse + self.force + self.precision + self.endurance
         + self.intelligence + self.creativite + self.defense + self.attaque + self.jeu_de_tete) / 9.0
    }

    /// Appliquer les bonus de domaine scientifique
    pub fn appliquer_bonus_domaine(&self, domaine: &ScientificDomain) -> Self {
        let bonus = domaine.get_domain_bonus();
        Self {
            vitesse: (self.vitesse * bonus.speed).min(99.0),
            force: (self.force * bonus.strength).min(99.0),
            precision: (self.precision * bonus.precision).min(99.0),
            endurance: (self.endurance * bonus.endurance).min(99.0),
            intelligence: (self.intelligence * bonus.intelligence).min(99.0),
            creativite: (self.creativite * bonus.creativity).min(99.0),
            defense: (self.defense * bonus.defense).min(99.0),
            attaque: (self.attaque * bonus.attack).min(99.0),
            jeu_de_tete: (self.jeu_de_tete * bonus.heading).min(99.0),
        }
    }
}

/// Position du joueur sur le terrain
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Position {
    Gardien,
    Defenseur,
    Milieu,
    Attaquant,
}

impl Position {
    pub fn get_name(&self) -> &'static str {
        match self {
            Position::Gardien => "Gardien",
            Position::Defenseur => "Défenseur",
            Position::Milieu => "Milieu",
            Position::Attaquant => "Attaquant",
        }
    }

    pub fn get_bonus_multiplicateur(&self) -> f32 {
        match self {
            Position::Gardien => 1.0,
            Position::Defenseur => 1.0,
            Position::Milieu => 1.0,
            Position::Attaquant => 1.0,
        }
    }
}

/// Capacité spéciale unique du joueur liée à son domaine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapaciteSpeciale {
    pub nom: String,
    pub description: String,
    pub cooldown_max: f32,  // En secondes
    pub cooldown_actuel: f32,
    pub actif: bool,
}

impl CapaciteSpeciale {
    pub fn new(nom: &str, description: &str, cooldown: f32) -> Self {
        Self {
            nom: nom.to_string(),
            description: description.to_string(),
            cooldown_max: cooldown,
            cooldown_actuel: 0.0,
            actif: false,
        }
    }

    pub fn est_disponible(&self) -> bool {
        self.cooldown_actuel <= 0.0
    }

    pub fn utiliser(&mut self) -> bool {
        if self.est_disponible() {
            self.cooldown_actuel = self.cooldown_max;
            self.actif = true;
            true
        } else {
            false
        }
    }

    pub fn mise_a_jour(&mut self, delta: f32) {
        if self.cooldown_actuel > 0.0 {
            self.cooldown_actuel = (self.cooldown_actuel - delta).max(0.0);
        }
        if self.cooldown_actuel <= 0.0 {
            self.actif = false;
        }
    }
}

/// Trait de personnalité du joueur (bonus spécifiques)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraitPersonnalite {
    pub nom: String,
    pub description: String,
    pub effet: String,
}

/// Représentation complète d'un joueur
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Joueur {
    pub id: u32,
    pub prenom: String,
    pub domaine: ScientificDomain,
    pub position_preferee: Position,
    pub position_actuelle: Position,

    // Statistiques de base (avant bonus)
    pub stats_base: PlayerStats,
    // Statistiques effectives (après bonus domaine + forme + moral)
    pub stats_effectives: PlayerStats,

    pub niveau: u32,
    pub experience: u32,

    // État physique
    pub stamina: f32,         // Endurance actuelle (0-100)
    pub stamina_max: f32,
    pub forme: f32,           // Forme du jour (0.5-1.5)
    pub moral: f32,           // Moral (0.5-1.5)

    // Statistiques du match
    pub buts: u32,
    pub passes_decisives: u32,
    pub matchs_joues: u32,
    pub cartons_jaunes: u32,
    pub cartons_rouges: u32,

    // État du joueur
    pub sur_le_terrain: bool,
    pub blesse: bool,
    pub suspendu: bool,

    // Capacité spéciale
    pub capacite_speciale: CapaciteSpeciale,

    // Traits de personnalité
    pub traits: Vec<TraitPersonnalite>,
}

impl Joueur {
    pub fn new(id: u32, prenom: &str, domaine: ScientificDomain, position: Position, stats_base: PlayerStats) -> Self {
        let stats_effectives = stats_base.appliquer_bonus_domaine(&domaine);
        let stamina_max = 80.0 + stats_base.endurance * 0.2;
        let capacite = Self::get_capacite_pour_domaine(&domaine);

        Self {
            id,
            prenom: prenom.to_string(),
            domaine,
            position_preferee: position,
            position_actuelle: position,
            stats_base,
            stats_effectives,
            niveau: 1,
            experience: 0,
            stamina: stamina_max,
            stamina_max,
            forme: 1.0,
            moral: 1.0,
            buts: 0,
            passes_decisives: 0,
            matchs_joues: 0,
            cartons_jaunes: 0,
            cartons_rouges: 0,
            sur_le_terrain: false,
            blesse: false,
            suspendu: false,
            capacite_speciale: capacite,
            traits: Vec::new(),
        }
    }

    pub fn note_globale(&self) -> f32 {
        let base = self.stats_effectives.note_globale();
        base * self.forme * self.moral * (self.stamina / self.stamina_max).max(0.5)
    }

    pub fn consommer_stamina(&mut self, montant: f32) {
        self.stamina = (self.stamina - montant).max(0.0);
        // Impact sur la forme si très fatigué
        if self.stamina < 15.0 {
            self.forme = (self.forme - 0.002).max(0.5);
        }
    }

    pub fn recuperer_stamina(&mut self, montant: f32) {
        self.stamina = (self.stamina + montant).min(self.stamina_max);
    }

    pub fn marquer_but(&mut self) {
        self.buts += 1;
        self.experience += 100;
        self.moral = (self.moral + 0.05).min(1.5);
        self.verifier_montee_niveau();
    }

    pub fn faire_passe_decisive(&mut self) {
        self.passes_decisives += 1;
        self.experience += 50;
        self.verifier_montee_niveau();
    }

    fn verifier_montee_niveau(&mut self) {
        let exp_requise = self.niveau * 1000;
        if self.experience >= exp_requise {
            self.niveau += 1;
            self.experience -= exp_requise;
            // Amélioration légère des stats de base
            self.stats_base.vitesse = (self.stats_base.vitesse + 0.3).min(95.0);
            self.stats_base.precision = (self.stats_base.precision + 0.3).min(95.0);
            self.stats_base.endurance = (self.stats_base.endurance + 0.3).min(95.0);
            // Recalculer les stats effectives
            self.stats_effectives = self.stats_base.appliquer_bonus_domaine(&self.domaine);
        }
    }

    pub fn est_disponible(&self) -> bool {
        !self.blesse && !self.suspendu
    }

    fn get_capacite_pour_domaine(domaine: &ScientificDomain) -> CapaciteSpeciale {
        match domaine {
            ScientificDomain::Informatique => CapaciteSpeciale::new(
                "Anticipation Algorithmique",
                "Prédit les mouvements adverses grâce aux algorithmes. +40% intelligence pendant 20s.",
                40.0,
            ),
            ScientificDomain::PhysiqueMecanique => CapaciteSpeciale::new(
                "Tir Balistique",
                "Calcule la trajectoire parfaite pour un tir imparable. Puissance x2.",
                35.0,
            ),
            ScientificDomain::BiologieChimie => CapaciteSpeciale::new(
                "Dribble Cellulaire",
                "Réactions chimiques ultra-rapides permettant des dribbles fulgurants.",
                25.0,
            ),
            ScientificDomain::PhysiqueChimie => CapaciteSpeciale::new(
                "Équilibre Parfait",
                "Synthèse physico-chimique : tous les attributs boostés de 20% pendant 15s.",
                45.0,
            ),
            ScientificDomain::Mathematiques => CapaciteSpeciale::new(
                "Géométrie du Jeu",
                "Calcule l'angle parfait pour la passe ou le tir. Précision maximale pendant 25s.",
                35.0,
            ),
            ScientificDomain::Electronique => CapaciteSpeciale::new(
                "Circuit Intégré",
                "Réactivité électronique : vitesse et coordination maximales pendant 20s.",
                30.0,
            ),
            ScientificDomain::BiologieMedecine => CapaciteSpeciale::new(
                "Adrénali-Shot",
                "Injection d'adrénaline : force et endurance x1.8 pendant 15s.",
                40.0,
            ),
            ScientificDomain::Chimie => CapaciteSpeciale::new(
                "Catalyseur",
                "Accélère les réactions de l'équipe. Tout l'équipe +15% vitesse pendant 30s.",
                50.0,
            ),
            ScientificDomain::MathematiquesBancaire => CapaciteSpeciale::new(
                "ROI Optimal",
                "Calcul du retour sur investissement tactique. +30% efficacité offensive.",
                40.0,
            ),
            ScientificDomain::AidesSubventions => CapaciteSpeciale::new(
                "Volée Flamboyante",
                "Reprise de volée spectaculaire, inattendue et imparable.",
                30.0,
            ),
            ScientificDomain::Cyberscurite => CapaciteSpeciale::new(
                "Pare-feu Défensif",
                "Défense impénétrable : toutes les attaques adverses bloquées pendant 20s.",
                45.0,
            ),
            ScientificDomain::ElectroniqueBancaire => CapaciteSpeciale::new(
                "Sprint Overclocked",
                "Overdrive électronique : vitesse x2.5 pendant 10s.",
                35.0,
            ),
            ScientificDomain::AgroalimentaireGeologie => CapaciteSpeciale::new(
                "Pressing Tellurique",
                "Récupération de balle intensifiée, force de la nature. +50% récupération.",
                30.0,
            ),
        }
    }
}

/// Créer tous les joueurs de l'équipe avec leurs vraies caractéristiques
pub fn creer_joueurs_reels() -> Vec<Joueur> {
    vec![
        // Roland - Informatique, costaud, jeu physique, erreurs devant le but
        {
            let mut j = Joueur::new(
                1, "Roland", ScientificDomain::Informatique, Position::Defenseur,
                PlayerStats::new(72.0, 82.0, 58.0, 74.0, 78.0, 65.0, 76.0, 52.0, 75.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Jeu Physique".to_string(),
                description: "Utilise sa stature pour dominer physiquement".to_string(),
                effet: "Force +10%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Frappe Approximative".to_string(),
                description: "Peut rater des occasions devant le but".to_string(),
                effet: "Précision tir -15%".to_string(),
            });
            j
        },

        // Loïc - Physique et Mécanique, excellent finisseur, droitier, défense faible, bon cardio
        {
            let mut j = Joueur::new(
                2, "Loïc", ScientificDomain::PhysiqueMecanique, Position::Attaquant,
                PlayerStats::new(76.0, 78.0, 88.0, 82.0, 74.0, 68.0, 52.0, 90.0, 72.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Finisseur Net".to_string(),
                description: "Excellente précision devant le gardien".to_string(),
                effet: "Précision tir +20%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Droitier Dominant".to_string(),
                description: "Pied droit exceptionnel".to_string(),
                effet: "Tirs droite +15%".to_string(),
            });
            j
        },

        // David - Biologie et Chimie, ailier, dribbles, petits ponts, cardio limité
        {
            let mut j = Joueur::new(
                3, "David", ScientificDomain::BiologieChimie, Position::Attaquant,
                PlayerStats::new(82.0, 68.0, 78.0, 58.0, 72.0, 88.0, 62.0, 80.0, 65.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Ailier Virtuose".to_string(),
                description: "Maître du dribble et des petits ponts".to_string(),
                effet: "Dribble +25%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Cardio Limité".to_string(),
                description: "S'essouffle rapidement après les efforts".to_string(),
                effet: "Stamina -20%".to_string(),
            });
            j.stamina_max *= 0.8;
            j.stamina = j.stamina_max;
            j
        },

        // Thibault - Physique et Chimie, très technique, équilibré, bonne défense et attaque
        {
            let mut j = Joueur::new(
                4, "Thibault", ScientificDomain::PhysiqueChimie, Position::Milieu,
                PlayerStats::new(78.0, 76.0, 82.0, 76.0, 80.0, 80.0, 79.0, 79.0, 74.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Joueur Complet".to_string(),
                description: "Excelle aussi bien en défense qu'en attaque".to_string(),
                effet: "Équilibre +10%".to_string(),
            });
            j
        },

        // Henry - Informatique, très grand, jeu de tête défensif, gène adversaires, précision faible
        {
            let mut j = Joueur::new(
                5, "Henry", ScientificDomain::Informatique, Position::Defenseur,
                PlayerStats::new(68.0, 84.0, 52.0, 72.0, 80.0, 66.0, 86.0, 50.0, 90.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Très Grand".to_string(),
                description: "Stature imposante, domine les airs".to_string(),
                effet: "Jeu de tête +20%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Présence Défensive".to_string(),
                description: "Gêne physiquement les adversaires".to_string(),
                effet: "Défense +15%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Frappe Imprécise".to_string(),
                description: "Difficultés à viser juste".to_string(),
                effet: "Précision tir -20%".to_string(),
            });
            j
        },

        // Romain - Électronique, très grand, équilibré, bon cardio, bon jeu de tête, quelques difficultés défensives
        {
            let mut j = Joueur::new(
                6, "Romain", ScientificDomain::Electronique, Position::Milieu,
                PlayerStats::new(74.0, 78.0, 74.0, 82.0, 78.0, 74.0, 68.0, 78.0, 84.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Très Grand".to_string(),
                description: "Grande stature, jeu de tête impressionnant".to_string(),
                effet: "Jeu de tête +15%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Réactivité Électronique".to_string(),
                description: "Réactions ultrarapides comme un circuit".to_string(),
                effet: "Vitesse réaction +10%".to_string(),
            });
            j
        },

        // Théo - Mathématiques, court beaucoup, moins de technique, bon en récupération, fait des fautes mais sympa arbitre
        {
            let mut j = Joueur::new(
                7, "Théo", ScientificDomain::Mathematiques, Position::Milieu,
                PlayerStats::new(88.0, 74.0, 62.0, 84.0, 82.0, 58.0, 82.0, 68.0, 70.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Runner Infatigable".to_string(),
                description: "Court sans cesse, couvre tout le terrain".to_string(),
                effet: "Vitesse +10%, Endurance +15%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Charmeur d'Arbitre".to_string(),
                description: "Tellement sympa que l'arbitre lui pardonne tout".to_string(),
                effet: "Chances carton jaune -30%".to_string(),
            });
            j
        },

        // Franck - Biologie et Médecine, frappes puissantes et précises, bonne technique, bon cardio, manque vitesse
        {
            let mut j = Joueur::new(
                8, "Franck", ScientificDomain::BiologieMedecine, Position::Attaquant,
                PlayerStats::new(62.0, 86.0, 82.0, 82.0, 74.0, 74.0, 68.0, 84.0, 74.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Frappe Médicale".to_string(),
                description: "Puissance et précision anatomiquement calculées".to_string(),
                effet: "Puissance tir +20%, Précision +10%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Manque de Vitesse".to_string(),
                description: "La puissance prime sur la vitesse".to_string(),
                effet: "Vitesse -15%".to_string(),
            });
            j
        },

        // Aurélien - Chimie, appel de balle sur les ailes, déstabilise adversaires, bon placement attaque et défense, vitesse faible
        {
            let mut j = Joueur::new(
                9, "Aurélien", ScientificDomain::Chimie, Position::Attaquant,
                PlayerStats::new(64.0, 72.0, 74.0, 72.0, 78.0, 86.0, 76.0, 80.0, 68.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Provocateur Dosé".to_string(),
                description: "Déstabilise les adversaires avec des provocations calculées".to_string(),
                effet: "Intelligence adversaire -10%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Appel en Profondeur".to_string(),
                description: "Crée des espaces et exploite les ailes".to_string(),
                effet: "Placement offensif +15%".to_string(),
            });
            j
        },

        // Lucien - Informatique, expert passes, jeu physique, défense efficace, évite montées en attaque
        {
            let mut j = Joueur::new(
                10, "Lucien", ScientificDomain::Informatique, Position::Defenseur,
                PlayerStats::new(70.0, 82.0, 76.0, 74.0, 84.0, 72.0, 88.0, 54.0, 76.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Passeur Distribué".to_string(),
                description: "Expert en systèmes distribués de passes de qualité".to_string(),
                effet: "Précision passes +20%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Défenseur Fiable".to_string(),
                description: "Efficace en défense, évite les remontées risquées".to_string(),
                effet: "Défense +15%, Retours défensifs -10%".to_string(),
            });
            j
        },

        // Joffrey - Mathématiques et Bancaire, équilibré, bon cardio, bonne technique, créatif, efficace but, physique insuffisant face défenseurs
        {
            let mut j = Joueur::new(
                11, "Joffrey", ScientificDomain::MathematiquesBancaire, Position::Attaquant,
                PlayerStats::new(76.0, 62.0, 80.0, 82.0, 84.0, 82.0, 70.0, 82.0, 70.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Créatif Stratégique".to_string(),
                description: "Solutions inattendues et gestion optimale des ressources".to_string(),
                effet: "Créativité +15%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Léger Physiquement".to_string(),
                description: "Difficultés à s'imposer face aux défenseurs costauds".to_string(),
                effet: "Force -15% face défenseurs puissants".to_string(),
            });
            j
        },

        // Yacine - Aides directes, flamboyant, reprises de volée, gène défense, vitesse faible
        {
            let mut j = Joueur::new(
                12, "Yacine", ScientificDomain::AidesSubventions, Position::Attaquant,
                PlayerStats::new(60.0, 76.0, 80.0, 74.0, 74.0, 88.0, 78.0, 86.0, 82.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Joueur Flamboyant".to_string(),
                description: "Spectaculaire et imprévisible, l'artiste du terrain".to_string(),
                effet: "Reprises de volée +30%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Présence en Défense".to_string(),
                description: "Gêne efficacement les adversaires même en défense".to_string(),
                effet: "Défense -20% vs vitesse".to_string(),
            });
            j
        },

        // Djilani - Cybersécurité, top défenseur, jeu physique, mauvais en attaque, excellent gardien
        {
            let mut j = Joueur::new(
                13, "Djilani", ScientificDomain::Cyberscurite, Position::Defenseur,
                PlayerStats::new(72.0, 88.0, 50.0, 76.0, 82.0, 60.0, 96.0, 38.0, 84.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Mur Défensif".to_string(),
                description: "Défenseur d'élite, tacle net et sûr".to_string(),
                effet: "Défense +25%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Attaque Limitée".to_string(),
                description: "Ne monte pas facilement en attaque".to_string(),
                effet: "Attaque -20%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Gardien de Sécurité".to_string(),
                description: "Aussi efficace entre les poteaux".to_string(),
                effet: "Peut jouer Gardien avec bonus".to_string(),
            });
            j
        },

        // Médéric - Électronique et Bancaire, explosif, sprint, technique créative, équilibré, mental fragile, imprécis sur frappes puissantes
        {
            let mut j = Joueur::new(
                14, "Médéric", ScientificDomain::ElectroniqueBancaire, Position::Milieu,
                PlayerStats::new(88.0, 76.0, 62.0, 76.0, 74.0, 84.0, 74.0, 78.0, 72.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Explosivité Pure".to_string(),
                description: "Sprints foudroyants digne d'un court-circuit".to_string(),
                effet: "Vitesse sprint +30%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Mental Fragile".to_string(),
                description: "Peut perdre ses moyens sous pression".to_string(),
                effet: "Moral peut baisser rapidement".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Frappe Imprécise".to_string(),
                description: "Puissant mais imprecis sur les grosses frappes".to_string(),
                effet: "Précision tir puissant -20%".to_string(),
            });
            j
        },

        // Guillaume - Agroalimentaire et Géologie, court beaucoup, récupération et vitesse, meilleur défense, imprécis devant but, vision de jeu limitée
        {
            let mut j = Joueur::new(
                15, "Guillaume", ScientificDomain::AgroalimentaireGeologie, Position::Milieu,
                PlayerStats::new(86.0, 74.0, 62.0, 84.0, 64.0, 70.0, 82.0, 62.0, 70.0),
            );
            j.traits.push(TraitPersonnalite {
                nom: "Machine à Courir".to_string(),
                description: "Court sans relâche, couvre le terrain à la manière d'un tracteur".to_string(),
                effet: "Endurance +15%, Récupération de balle +20%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Vision Limitée".to_string(),
                description: "Manque de vision du jeu, perd parfois le fil".to_string(),
                effet: "Intelligence de jeu -15%".to_string(),
            });
            j.traits.push(TraitPersonnalite {
                nom: "Imprécis Devant le But".to_string(),
                description: "La finition n'est pas son fort".to_string(),
                effet: "Précision tir -15%".to_string(),
            });
            j
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_creation_tous_joueurs() {
        let joueurs = creer_joueurs_reels();
        assert_eq!(joueurs.len(), 15, "Doit avoir 15 joueurs");
    }

    #[test]
    fn test_joueurs_equilibres() {
        let joueurs = creer_joueurs_reels();
        let notes: Vec<f32> = joueurs.iter().map(|j| j.note_globale()).collect();
        let min = notes.iter().cloned().fold(f32::INFINITY, f32::min);
        let max = notes.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        // Vérifier que les notes sont raisonnables
        assert!(min > 30.0, "Note minimum trop basse: {}", min);
        assert!(max < 100.0, "Note maximum trop haute: {}", max);
        println!("Notes joueurs: min={:.1}, max={:.1}", min, max);
    }

    #[test]
    fn test_prenoms_correct() {
        let joueurs = creer_joueurs_reels();
        let prenoms: Vec<&str> = joueurs.iter().map(|j| j.prenom.as_str()).collect();
        for prenom in &["Roland", "Loïc", "David", "Thibault", "Henry",
                        "Romain", "Théo", "Franck", "Aurélien", "Lucien",
                        "Joffrey", "Yacine", "Djilani", "Médéric", "Guillaume"] {
            assert!(prenoms.contains(prenom), "Joueur manquant: {}", prenom);
        }
    }

    #[test]
    fn test_djilani_meilleur_defenseur() {
        let joueurs = creer_joueurs_reels();
        let djilani = joueurs.iter().find(|j| j.prenom == "Djilani").unwrap();
        // Djilani doit avoir la meilleure défense
        let defense_djilani = djilani.stats_effectives.defense;
        assert!(defense_djilani > 80.0, "Djilani doit avoir une excellente défense: {}", defense_djilani);
    }

    #[test]
    fn test_loic_bon_finisseur() {
        let joueurs = creer_joueurs_reels();
        let loic = joueurs.iter().find(|j| j.prenom == "Loïc").unwrap();
        let attaque = loic.stats_effectives.attaque;
        assert!(attaque > 80.0, "Loïc doit être un bon finisseur: {}", attaque);
    }
}
