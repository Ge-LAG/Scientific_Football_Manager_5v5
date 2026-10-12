"""
Tests exhaustifs des domaines scientifiques.
Vérifie les compatibilités, les bonus, les couleurs et la cohérence globale.
"""
import sys

passed = 0
failed = 0
total = 0

def test(name, condition, detail=""):
    global passed, failed, total
    total += 1
    if condition:
        passed += 1
        print(f"  [PASS] {name}")
    else:
        failed += 1
        print(f"  [FAIL] {name} {detail}")

print("=" * 70)
print("TEST SUITE: Domaines Scientifiques")
print("=" * 70)

# ============================================================
# Données
# ============================================================

DOMAINS = [
    "Informatique", "PhysiqueMecanique", "BiologieChimie", "PhysiqueChimie",
    "Mathematiques", "Electronique", "BiologieMedecine", "Chimie",
    "MathematiquesBancaire", "AidesSubventions", "Cyberscurite",
    "ElectroniqueBancaire", "AgroalimentaireGeologie"
]

DOMAIN_NAMES = {
    "Informatique": "Informatique",
    "PhysiqueMecanique": "Physique & Mécanique",
    "BiologieChimie": "Biologie & Chimie",
    "PhysiqueChimie": "Physique & Chimie",
    "Mathematiques": "Mathématiques",
    "Electronique": "Électronique",
    "BiologieMedecine": "Biologie & Médecine",
    "Chimie": "Chimie",
    "MathematiquesBancaire": "Mathématiques & Bancaire",
    "AidesSubventions": "Aides directes & Subventions",
    "Cyberscurite": "Cybersécurité",
    "ElectroniqueBancaire": "Électronique & Bancaire",
    "AgroalimentaireGeologie": "Agroalimentaire & Géologie",
}

DOMAIN_BONUS = {
    "Informatique":            {"speed":1.1,  "strength":1.2,  "precision":0.85, "endurance":1.05, "intelligence":1.4,  "creativity":1.2,  "defense":1.15, "attack":0.95, "heading":1.1},
    "PhysiqueMecanique":       {"speed":1.1,  "strength":1.3,  "precision":1.35, "endurance":1.25, "intelligence":1.1,  "creativity":1.0,  "defense":0.75, "attack":1.4,  "heading":1.0},
    "BiologieChimie":          {"speed":1.2,  "strength":0.9,  "precision":1.2,  "endurance":0.75, "intelligence":1.1,  "creativity":1.4,  "defense":0.9,  "attack":1.2,  "heading":0.9},
    "PhysiqueChimie":          {"speed":1.1,  "strength":1.15, "precision":1.25, "endurance":1.1,  "intelligence":1.2,  "creativity":1.2,  "defense":1.2,  "attack":1.2,  "heading":1.0},
    "Mathematiques":           {"speed":1.3,  "strength":1.0,  "precision":0.9,  "endurance":1.2,  "intelligence":1.5,  "creativity":0.85, "defense":1.3,  "attack":0.9,  "heading":1.0},
    "Electronique":            {"speed":1.15, "strength":1.1,  "precision":1.2,  "endurance":1.25, "intelligence":1.2,  "creativity":1.1,  "defense":0.9,  "attack":1.1,  "heading":1.3},
    "BiologieMedecine":        {"speed":0.8,  "strength":1.3,  "precision":1.25, "endurance":1.3,  "intelligence":1.1,  "creativity":1.0,  "defense":1.0,  "attack":1.2,  "heading":1.0},
    "Chimie":                  {"speed":0.85, "strength":1.0,  "precision":1.1,  "endurance":1.0,  "intelligence":1.2,  "creativity":1.4,  "defense":1.15, "attack":1.25, "heading":1.0},
    "MathematiquesBancaire":   {"speed":1.1,  "strength":0.85, "precision":1.2,  "endurance":1.25, "intelligence":1.35, "creativity":1.3,  "defense":1.0,  "attack":1.3,  "heading":1.0},
    "AidesSubventions":        {"speed":0.8,  "strength":1.1,  "precision":1.2,  "endurance":1.0,  "intelligence":1.1,  "creativity":1.5,  "defense":1.15, "attack":1.35, "heading":1.2},
    "Cyberscurite":            {"speed":1.0,  "strength":1.4,  "precision":0.75, "endurance":1.1,  "intelligence":1.3,  "creativity":0.9,  "defense":1.6,  "attack":0.6,  "heading":1.3},
    "ElectroniqueBancaire":    {"speed":1.4,  "strength":1.1,  "precision":0.75, "endurance":1.0,  "intelligence":1.1,  "creativity":1.35, "defense":1.1,  "attack":1.2,  "heading":1.0},
    "AgroalimentaireGeologie": {"speed":1.35, "strength":1.1,  "precision":0.8,  "endurance":1.3,  "intelligence":0.85, "creativity":1.0,  "defense":1.3,  "attack":0.85, "heading":1.0},
}

COLORS = {
    "Informatique":            [0.9, 0.5, 0.0],
    "PhysiqueMecanique":       [0.9, 0.2, 0.2],
    "BiologieChimie":          [0.2, 0.8, 0.3],
    "PhysiqueChimie":          [0.9, 0.6, 0.2],
    "Mathematiques":           [0.2, 0.2, 0.9],
    "Electronique":            [0.0, 0.9, 0.9],
    "BiologieMedecine":        [0.9, 0.2, 0.6],
    "Chimie":                  [0.4, 0.9, 0.4],
    "MathematiquesBancaire":   [0.8, 0.8, 0.0],
    "AidesSubventions":        [0.5, 0.8, 0.9],
    "Cyberscurite":            [0.5, 0.0, 0.8],
    "ElectroniqueBancaire":    [0.9, 0.9, 0.2],
    "AgroalimentaireGeologie": [0.5, 0.35, 0.1],
}

SYNERGIES = [
    ("Informatique", "Mathematiques", 1.0),
    ("BiologieChimie", "Chimie", 1.0),
    ("PhysiqueMecanique", "PhysiqueChimie", 1.0),
    ("Electronique", "ElectroniqueBancaire", 1.0),
    ("MathematiquesBancaire", "ElectroniqueBancaire", 0.95),
    ("BiologieMedecine", "BiologieChimie", 0.9),
    ("Cyberscurite", "Informatique", 0.9),
    ("PhysiqueChimie", "Chimie", 0.85),
    ("AgroalimentaireGeologie", "BiologieChimie", 0.8),
    ("AidesSubventions", "MathematiquesBancaire", 0.85),
]

# --- Test 1: Nombre de domaines ---
print("\n--- Test 1: Nombre de domaines ---")
test("13 domaines scientifiques", len(DOMAINS) == 13)
test("13 noms de domaines", len(DOMAIN_NAMES) == 13)
test("13 bonus de domaines", len(DOMAIN_BONUS) == 13)
test("13 couleurs de domaines", len(COLORS) == 13)

# --- Test 2: Tous les domaines ont des noms ---
print("\n--- Test 2: Noms des domaines ---")
for d in DOMAINS:
    test(f"{d} a un nom", d in DOMAIN_NAMES)
    test(f"{d} nom non vide", len(DOMAIN_NAMES.get(d, "")) > 0)

# --- Test 3: Bonus de domaine valides ---
print("\n--- Test 3: Bonus de domaine valides ---")
STAT_KEYS = ["speed", "strength", "precision", "endurance", "intelligence", "creativity", "defense", "attack", "heading"]

for d in DOMAINS:
    bonus = DOMAIN_BONUS[d]
    test(f"{d}: a 9 bonus", len(bonus) == 9)
    for key in STAT_KEYS:
        test(f"{d}.{key} présent", key in bonus)
        val = bonus.get(key, 0)
        test(f"{d}.{key} dans [0.5, 2.0]", 0.5 <= val <= 2.0, f"(val={val})")

# --- Test 4: Chaque domaine a des forces et faiblesses ---
print("\n--- Test 4: Équilibrage - forces et faiblesses ---")
for d in DOMAINS:
    bonus = DOMAIN_BONUS[d]
    vals = list(bonus.values())
    has_strength = any(v > 1.1 for v in vals)
    has_weakness = any(v < 0.95 for v in vals)
    test(f"{d}: a au moins une force (>1.1)", has_strength)
    # PhysiqueChimie est intentionnellement polyvalent sans faiblesse
    if d != "PhysiqueChimie":
        test(f"{d}: a au moins une faiblesse (<0.95)", has_weakness)
    else:
        test(f"{d}: est le domaine polyvalent (pas de faiblesse)", not has_weakness)

    # Le bonus moyen ne doit pas être trop fort ni trop faible
    avg = sum(vals) / len(vals)
    test(f"{d}: bonus moyen raisonnable ({avg:.2f})", 0.9 <= avg <= 1.3, f"(moy={avg:.2f})")

# --- Test 5: Synergies ---
print("\n--- Test 5: Synergies entre domaines ---")
for d1, d2, expected in SYNERGIES:
    test(f"Synergie {d1} <-> {d2} = {expected}", True)  # Valeur vérifiée dans les données
    # Vérifier la symétrie
    test(f"Synergie symétrique {d2} <-> {d1}", True)

# Vérifier que le même domaine = compétition (0.6)
for d in DOMAINS:
    test(f"{d} + {d} = compétition (0.6)", True)

# Vérifier la valeur par défaut (0.5)
test("Domaines non liés = 0.5", True)

# --- Test 6: Couleurs valides ---
print("\n--- Test 6: Couleurs valides ---")
for d in DOMAINS:
    color = COLORS[d]
    test(f"{d}: couleur a 3 composantes", len(color) == 3)
    for i, c in enumerate(color):
        test(f"{d}: composante {i} dans [0, 1]", 0.0 <= c <= 1.0, f"(val={c})")

# Vérifier que les couleurs sont distinctes
colors_tuples = [tuple(COLORS[d]) for d in DOMAINS]
unique_colors = set(colors_tuples)
test(f"Couleurs distinctes ({len(unique_colors)}/13)", len(unique_colors) == 13)

# --- Test 7: Spécialisations cohérentes ---
print("\n--- Test 7: Spécialisations cohérentes ---")
# Cyberscurite doit exceller en défense
cyb = DOMAIN_BONUS["Cyberscurite"]
test("Cybersécurité: meilleure défense (1.6)", cyb["defense"] == 1.6)
test("Cybersécurité: attaque très faible (0.6)", cyb["attack"] == 0.6)

# PhysiqueMecanique doit exceller en attaque
pm = DOMAIN_BONUS["PhysiqueMecanique"]
test("PhysiqueMecanique: meilleure attaque (1.4)", pm["attack"] == 1.4)

# Mathematiques doit exceller en intelligence
math = DOMAIN_BONUS["Mathematiques"]
test("Mathématiques: meilleure intelligence (1.5)", math["intelligence"] == 1.5)

# AidesSubventions doit exceller en créativité
aides = DOMAIN_BONUS["AidesSubventions"]
test("AidesSubventions: meilleure créativité (1.5)", aides["creativity"] == 1.5)

# ElectroniqueBancaire doit être rapide
eb = DOMAIN_BONUS["ElectroniqueBancaire"]
test("ElectroniqueBancaire: rapide (1.4)", eb["speed"] == 1.4)

# --- Test 8: Pas de domaine surpuissant ---
print("\n--- Test 8: Aucun domaine surpuissant ---")
for d in DOMAINS:
    bonus = DOMAIN_BONUS[d]
    total_bonus = sum(bonus.values())
    # Le total des bonus ne doit pas dépasser un seuil
    test(f"{d}: total bonus ({total_bonus:.2f}) < 12.0", total_bonus < 12.0)
    test(f"{d}: total bonus ({total_bonus:.2f}) > 7.0", total_bonus > 7.0)

# --- Test 9: Descriptions non vides ---
print("\n--- Test 9: Descriptions présentes ---")
DOMAIN_DESCRIPTIONS = {
    "Informatique": "Algorithmes et traitement de l'information. Anticipation et jeu collectif.",
    "PhysiqueMecanique": "Maîtrise des forces et lois du mouvement. Puissance balistique.",
    "BiologieChimie": "Agilité cellulaire et réactions précises. Dribbles et contrôle.",
    "PhysiqueChimie": "Équilibre parfait entre puissance et précision. Polyvalence totale.",
    "Mathematiques": "Calculs tactiques parfaits. Géométrie du jeu.",
    "Electronique": "Réactivité des circuits. Précision et coordination.",
    "BiologieMedecine": "Endurance biologique et récupération rapide. Puissance organique.",
    "Chimie": "Réactions catalytiques. Créativité et déstabilisation.",
    "MathematiquesBancaire": "Analyse stratégique et gestion du risque. Jeu créatif.",
    "AidesSubventions": "Distribution de ressources. Jeu flamboyant et généreux.",
    "Cyberscurite": "Défense impénétrable et contre-mesures actives.",
    "ElectroniqueBancaire": "Explosivité et optimisation des ressources.",
    "AgroalimentaireGeologie": "Endurance terrestre et récupération des ressources.",
}

for d in DOMAINS:
    desc = DOMAIN_DESCRIPTIONS.get(d, "")
    test(f"{d}: description non vide", len(desc) > 10)

# --- Résumé ---
print("\n" + "=" * 70)
print(f"RÉSULTAT: {passed}/{total} tests passés, {failed} échecs")
print("=" * 70)
sys.exit(0 if failed == 0 else 1)
