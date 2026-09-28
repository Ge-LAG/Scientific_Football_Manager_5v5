use serde::{Deserialize, Serialize};

/// Domaines scientifiques disponibles pour les joueurs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ScientificDomain {
    Informatique,
    PhysiqueMecanique,
    BiologieChimie,
    PhysiqueChimie,
    Mathematiques,
    Electronique,
    BiologieMedecine,
    Chimie,
    MathematiquesBancaire,
    AidesSubventions,
    Cyberscurite,
    ElectroniqueBancaire,
    AgroalimentaireGeologie,
}

impl ScientificDomain {
    pub fn get_name(&self) -> &'static str {
        match self {
            ScientificDomain::Informatique => "Informatique",
            ScientificDomain::PhysiqueMecanique => "Physique & Mécanique",
            ScientificDomain::BiologieChimie => "Biologie & Chimie",
            ScientificDomain::PhysiqueChimie => "Physique & Chimie",
            ScientificDomain::Mathematiques => "Mathématiques",
            ScientificDomain::Electronique => "Électronique",
            ScientificDomain::BiologieMedecine => "Biologie & Médecine",
            ScientificDomain::Chimie => "Chimie",
            ScientificDomain::MathematiquesBancaire => "Mathématiques & Bancaire",
            ScientificDomain::AidesSubventions => "Aides directes & Subventions",
            ScientificDomain::Cyberscurite => "Cybersécurité",
            ScientificDomain::ElectroniqueBancaire => "Électronique & Bancaire",
            ScientificDomain::AgroalimentaireGeologie => "Agroalimentaire & Géologie",
        }
    }

    pub fn get_description(&self) -> &'static str {
        match self {
            ScientificDomain::Informatique => "Algorithmes et traitement de l'information. Anticipation et jeu collectif.",
            ScientificDomain::PhysiqueMecanique => "Maîtrise des forces et lois du mouvement. Puissance balistique.",
            ScientificDomain::BiologieChimie => "Agilité cellulaire et réactions précises. Dribbles et contrôle.",
            ScientificDomain::PhysiqueChimie => "Équilibre parfait entre puissance et précision. Polyvalence totale.",
            ScientificDomain::Mathematiques => "Calculs tactiques parfaits. Géométrie du jeu.",
            ScientificDomain::Electronique => "Réactivité des circuits. Précision et coordination.",
            ScientificDomain::BiologieMedecine => "Endurance biologique et récupération rapide. Puissance organique.",
            ScientificDomain::Chimie => "Réactions catalytiques. Créativité et déstabilisation.",
            ScientificDomain::MathematiquesBancaire => "Analyse stratégique et gestion du risque. Jeu créatif.",
            ScientificDomain::AidesSubventions => "Distribution de ressources. Jeu flamboyant et généreux.",
            ScientificDomain::Cyberscurite => "Défense impénétrable et contre-mesures actives.",
            ScientificDomain::ElectroniqueBancaire => "Explosivité et optimisation des ressources.",
            ScientificDomain::AgroalimentaireGeologie => "Endurance terrestre et récupération des ressources.",
        }
    }

    /// Bonus spécifique au domaine scientifique (multiplicateurs sur les attributs)
    pub fn get_domain_bonus(&self) -> DomainBonus {
        match self {
            ScientificDomain::Informatique => DomainBonus {
                speed: 1.1,
                strength: 1.2,        // Costaud, jeu physique
                precision: 0.85,      // Erreurs devant le but
                endurance: 1.05,
                intelligence: 1.4,    // Anticipation algorithmique
                creativity: 1.2,
                defense: 1.15,
                attack: 0.95,
                heading: 1.1,
            },
            ScientificDomain::PhysiqueMecanique => DomainBonus {
                speed: 1.1,
                strength: 1.3,        // Puissance balistique
                precision: 1.35,      // Très bon finisseur
                endurance: 1.25,      // Bon cardio
                intelligence: 1.1,
                creativity: 1.0,
                defense: 0.75,        // Moins bon en défense
                attack: 1.4,          // Excellent finisseur
                heading: 1.0,
            },
            ScientificDomain::BiologieChimie => DomainBonus {
                speed: 1.2,
                strength: 0.9,
                precision: 1.2,       // Bon pour les dribbles
                endurance: 0.75,      // Cardio limité
                intelligence: 1.1,
                creativity: 1.4,      // Dribbles, petits ponts
                defense: 0.9,
                attack: 1.2,
                heading: 0.9,
            },
            ScientificDomain::PhysiqueChimie => DomainBonus {
                speed: 1.1,
                strength: 1.15,
                precision: 1.25,      // Très technique
                endurance: 1.1,
                intelligence: 1.2,
                creativity: 1.2,
                defense: 1.2,         // Bonne défense
                attack: 1.2,          // Bonne attaque
                heading: 1.0,
            },
            ScientificDomain::Mathematiques => DomainBonus {
                speed: 1.3,           // Court beaucoup
                strength: 1.0,
                precision: 0.9,       // Moins de technique
                endurance: 1.2,
                intelligence: 1.5,    // Calculs tactiques
                creativity: 0.85,
                defense: 1.3,         // Bon en récupération
                attack: 0.9,
                heading: 1.0,
            },
            ScientificDomain::Electronique => DomainBonus {
                speed: 1.15,
                strength: 1.1,        // Grand, équilibré
                precision: 1.2,
                endurance: 1.25,      // Bon cardio
                intelligence: 1.2,
                creativity: 1.1,
                defense: 0.9,         // Quelques difficultés défensives
                attack: 1.1,
                heading: 1.3,         // Bon jeu de tête
            },
            ScientificDomain::BiologieMedecine => DomainBonus {
                speed: 0.8,           // Manque de vitesse
                strength: 1.3,        // Frappes puissantes
                precision: 1.25,      // Précision
                endurance: 1.3,       // Bon cardio
                intelligence: 1.1,
                creativity: 1.0,
                defense: 1.0,
                attack: 1.2,          // Frappes puissantes
                heading: 1.0,
            },
            ScientificDomain::Chimie => DomainBonus {
                speed: 0.85,          // Vitesse en deçà
                strength: 1.0,
                precision: 1.1,
                endurance: 1.0,
                intelligence: 1.2,
                creativity: 1.4,      // Provocations, déstabilisation
                defense: 1.15,        // Défense efficace
                attack: 1.25,         // Bon placement en attaque
                heading: 1.0,
            },
            ScientificDomain::MathematiquesBancaire => DomainBonus {
                speed: 1.1,
                strength: 0.85,       // Difficultés physiques face défenseurs
                precision: 1.2,
                endurance: 1.25,      // Bon cardio
                intelligence: 1.35,
                creativity: 1.3,      // Créatif
                defense: 1.0,
                attack: 1.3,          // Efficace devant le but
                heading: 1.0,
            },
            ScientificDomain::AidesSubventions => DomainBonus {
                speed: 0.8,           // Point faible vitesse
                strength: 1.1,
                precision: 1.2,
                endurance: 1.0,
                intelligence: 1.1,
                creativity: 1.5,      // Flamboyant, reprises de volée
                defense: 1.15,        // Gène les adversaires
                attack: 1.35,         // Flamboyant en attaque
                heading: 1.2,
            },
            ScientificDomain::Cyberscurite => DomainBonus {
                speed: 1.0,
                strength: 1.4,        // Jeu physique défensif
                precision: 0.75,      // Difficultés en attaque
                endurance: 1.1,
                intelligence: 1.3,    // Analyse et contre-mesures
                creativity: 0.9,
                defense: 1.6,         // Excellent défenseur
                attack: 0.6,          // Difficultés en attaque
                heading: 1.3,         // Bon gardien
            },
            ScientificDomain::ElectroniqueBancaire => DomainBonus {
                speed: 1.4,           // Explosif, sprinteur
                strength: 1.1,
                precision: 0.75,      // Manque de précision
                endurance: 1.0,
                intelligence: 1.1,
                creativity: 1.35,     // Technique créative
                defense: 1.1,
                attack: 1.2,
                heading: 1.0,
            },
            ScientificDomain::AgroalimentaireGeologie => DomainBonus {
                speed: 1.35,          // Court beaucoup
                strength: 1.1,
                precision: 0.8,       // Imprécisions devant le but
                endurance: 1.3,       // Bon cardio
                intelligence: 0.85,   // Carences en vision du jeu
                creativity: 1.0,
                defense: 1.3,         // Meilleur en défense
                attack: 0.85,         // Moins bon en attaque
                heading: 1.0,
            },
        }
    }

    /// Compatibilité entre deux domaines (pour la chimie d'équipe)
    pub fn compatibility_with(&self, other: &ScientificDomain) -> f32 {
        use ScientificDomain::*;
        match (self, other) {
            // Synergies parfaites
            (Informatique, Mathematiques) | (Mathematiques, Informatique) => 1.0,
            (BiologieChimie, Chimie) | (Chimie, BiologieChimie) => 1.0,
            (PhysiqueMecanique, PhysiqueChimie) | (PhysiqueChimie, PhysiqueMecanique) => 1.0,
            (Electronique, ElectroniqueBancaire) | (ElectroniqueBancaire, Electronique) => 1.0,
            (MathematiquesBancaire, ElectroniqueBancaire) | (ElectroniqueBancaire, MathematiquesBancaire) => 0.95,
            (BiologieMedecine, BiologieChimie) | (BiologieChimie, BiologieMedecine) => 0.9,
            (Cyberscurite, Informatique) | (Informatique, Cyberscurite) => 0.9,
            (PhysiqueChimie, Chimie) | (Chimie, PhysiqueChimie) => 0.85,
            (AgroalimentaireGeologie, BiologieChimie) | (BiologieChimie, AgroalimentaireGeologie) => 0.8,
            (AidesSubventions, MathematiquesBancaire) | (MathematiquesBancaire, AidesSubventions) => 0.85,
            // Même domaine = compétition
            _ if self == other => 0.6,
            // Synergies générales
            _ => 0.5,
        }
    }

    pub fn get_color(&self) -> [f32; 3] {
        match self {
            ScientificDomain::Informatique => [0.9, 0.5, 0.0],       // Orange
            ScientificDomain::PhysiqueMecanique => [0.9, 0.2, 0.2],  // Rouge
            ScientificDomain::BiologieChimie => [0.2, 0.8, 0.3],     // Vert
            ScientificDomain::PhysiqueChimie => [0.9, 0.6, 0.2],     // Ambre
            ScientificDomain::Mathematiques => [0.2, 0.2, 0.9],      // Bleu
            ScientificDomain::Electronique => [0.0, 0.9, 0.9],       // Cyan
            ScientificDomain::BiologieMedecine => [0.9, 0.2, 0.6],   // Rose
            ScientificDomain::Chimie => [0.4, 0.9, 0.4],             // Vert clair
            ScientificDomain::MathematiquesBancaire => [0.8, 0.8, 0.0], // Jaune
            ScientificDomain::AidesSubventions => [0.5, 0.8, 0.9],   // Bleu clair
            ScientificDomain::Cyberscurite => [0.5, 0.0, 0.8],       // Violet
            ScientificDomain::ElectroniqueBancaire => [0.9, 0.9, 0.2], // Jaune électrique
            ScientificDomain::AgroalimentaireGeologie => [0.5, 0.35, 0.1], // Marron
        }
    }
}

/// Bonus numériques du domaine scientifique
#[derive(Debug, Clone, Copy)]
pub struct DomainBonus {
    pub speed: f32,
    pub strength: f32,
    pub precision: f32,
    pub endurance: f32,
    pub intelligence: f32,
    pub creativity: f32,
    pub defense: f32,
    pub attack: f32,
    pub heading: f32,
}
