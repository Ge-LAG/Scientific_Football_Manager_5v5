"""
Tests exhaustifs des statistiques et caractéristiques des joueurs.
Vérifie l'équilibrage, les bonus de domaine, les capacités spéciales, etc.
"""
import json
import math
import sys

# ============================================================
# Reproduction en Python de la logique Rust pour validation
# ============================================================

JOUEURS_DATA = [
    {"id": 1,  "prenom": "Roland",    "domaine": "Informatique",           "position": "Defenseur",  "stats": [72,82,58,74,78,65,76,52,75], "stamina_mult": 1.0},
    {"id": 2,  "prenom": "Loïc",      "domaine": "PhysiqueMecanique",      "position": "Attaquant",  "stats": [76,78,88,82,74,68,52,90,72], "stamina_mult": 1.0},
    {"id": 3,  "prenom": "David",     "domaine": "BiologieChimie",         "position": "Attaquant",  "stats": [82,68,78,58,72,88,62,80,65], "stamina_mult": 0.8},
    {"id": 4,  "prenom": "Thibault",  "domaine": "PhysiqueChimie",         "position": "Milieu",     "stats": [78,76,82,76,80,80,79,79,74], "stamina_mult": 1.0},
    {"id": 5,  "prenom": "Henry",     "domaine": "Informatique",           "position": "Defenseur",  "stats": [68,84,52,72,80,66,86,50,90], "stamina_mult": 1.0},
    {"id": 6,  "prenom": "Romain",    "domaine": "Electronique",           "position": "Milieu",     "stats": [74,78,74,82,78,74,68,78,84], "stamina_mult": 1.0},
    {"id": 7,  "prenom": "Théo",      "domaine": "Mathematiques",          "position": "Milieu",     "stats": [88,74,62,84,82,58,82,68,70], "stamina_mult": 1.0},
    {"id": 8,  "prenom": "Franck",    "domaine": "BiologieMedecine",       "position": "Attaquant",  "stats": [62,86,82,82,74,74,68,84,74], "stamina_mult": 1.0},
    {"id": 9,  "prenom": "Aurélien",  "domaine": "Chimie",                 "position": "Attaquant",  "stats": [64,72,74,72,78,86,76,80,68], "stamina_mult": 1.0},
    {"id": 10, "prenom": "Lucien",    "domaine": "Informatique",           "position": "Defenseur",  "stats": [70,82,76,74,84,72,88,54,76], "stamina_mult": 1.0},
    {"id": 11, "prenom": "Joffrey",   "domaine": "MathematiquesBancaire",  "position": "Attaquant",  "stats": [76,62,80,82,84,82,70,82,70], "stamina_mult": 1.0},
    {"id": 12, "prenom": "Yacine",    "domaine": "AidesSubventions",       "position": "Attaquant",  "stats": [60,76,80,74,74,88,78,86,82], "stamina_mult": 1.0},
    {"id": 13, "prenom": "Djilani",   "domaine": "Cyberscurite",           "position": "Defenseur",  "stats": [72,88,50,76,82,60,96,38,84], "stamina_mult": 1.0},
    {"id": 14, "prenom": "Médéric",   "domaine": "ElectroniqueBancaire",   "position": "Milieu",     "stats": [88,76,62,76,74,84,74,78,72], "stamina_mult": 1.0},
    {"id": 15, "prenom": "Guillaume", "domaine": "AgroalimentaireGeologie", "position": "Milieu",    "stats": [86,74,62,84,64,70,82,62,70], "stamina_mult": 1.0},
]

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

STAT_KEYS = ["speed", "strength", "precision", "endurance", "intelligence", "creativity", "defense", "attack", "heading"]
STAT_LABELS = ["vitesse", "force", "precision", "endurance", "intelligence", "creativite", "defense", "attaque", "jeu_de_tete"]

def compute_effective_stats(base_stats, domaine):
    bonus = DOMAIN_BONUS[domaine]
    effective = []
    for i, key in enumerate(STAT_KEYS):
        val = min(base_stats[i] * bonus[key], 99.0)
        effective.append(val)
    return effective

def compute_note_globale(effective_stats):
    return sum(effective_stats) / 9.0

def compute_stamina_max(endurance_base, stamina_mult):
    return (80.0 + endurance_base * 0.2) * stamina_mult

def compute_note_joueur(effective_stats, forme=1.0, moral=1.0, stamina_ratio=1.0):
    base = compute_note_globale(effective_stats)
    return base * forme * moral * max(stamina_ratio, 0.5)

# ============================================================
# Tests
# ============================================================

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
print("TEST SUITE: Statistiques et Caractéristiques des Joueurs")
print("=" * 70)

# --- Test 1: Vérification du nombre de joueurs ---
print("\n--- Test 1: Nombre de joueurs ---")
test("Il y a exactement 15 joueurs", len(JOUEURS_DATA) == 15)

# --- Test 2: Unicité des IDs ---
print("\n--- Test 2: Unicité des IDs ---")
ids = [j["id"] for j in JOUEURS_DATA]
test("Tous les IDs sont uniques", len(set(ids)) == 15)
test("IDs vont de 1 à 15", sorted(ids) == list(range(1, 16)))

# --- Test 3: Unicité des prénoms ---
print("\n--- Test 3: Unicité des prénoms ---")
prenoms = [j["prenom"] for j in JOUEURS_DATA]
test("Tous les prénoms sont uniques", len(set(prenoms)) == 15)
expected_names = ["Roland", "Loïc", "David", "Thibault", "Henry", "Romain",
                  "Théo", "Franck", "Aurélien", "Lucien", "Joffrey", "Yacine",
                  "Djilani", "Médéric", "Guillaume"]
for name in expected_names:
    test(f"Joueur '{name}' est présent", name in prenoms)

# --- Test 4: Statistiques de base valides ---
print("\n--- Test 4: Statistiques de base dans les bornes ---")
for j in JOUEURS_DATA:
    for i, label in enumerate(STAT_LABELS):
        val = j["stats"][i]
        test(f"{j['prenom']}.{label} dans [0, 99]", 0 <= val <= 99, f"(valeur={val})")

# --- Test 5: Statistiques effectives après bonus ---
print("\n--- Test 5: Statistiques effectives après bonus de domaine ---")
for j in JOUEURS_DATA:
    eff = compute_effective_stats(j["stats"], j["domaine"])
    for i, label in enumerate(STAT_LABELS):
        test(f"{j['prenom']}.eff.{label} <= 99", eff[i] <= 99.0, f"(valeur={eff[i]:.1f})")
        test(f"{j['prenom']}.eff.{label} >= 0", eff[i] >= 0.0, f"(valeur={eff[i]:.1f})")

# --- Test 6: Notes globales ---
print("\n--- Test 6: Notes globales équilibrées ---")
notes = []
for j in JOUEURS_DATA:
    eff = compute_effective_stats(j["stats"], j["domaine"])
    note = compute_note_joueur(eff)
    notes.append((j["prenom"], note))
    test(f"{j['prenom']} note > 30", note > 30, f"(note={note:.1f})")
    test(f"{j['prenom']} note < 99", note < 99, f"(note={note:.1f})")

notes_vals = [n[1] for n in notes]
ecart = max(notes_vals) - min(notes_vals)
test(f"Écart max de notes <= 35", ecart <= 35, f"(écart={ecart:.1f})")

print(f"\n  Notes: min={min(notes_vals):.1f} ({min(notes, key=lambda x:x[1])[0]}), "
      f"max={max(notes_vals):.1f} ({max(notes, key=lambda x:x[1])[0]}), écart={ecart:.1f}")

# --- Test 7: Stamina ---
print("\n--- Test 7: Stamina des joueurs ---")
for j in JOUEURS_DATA:
    stamina_max = compute_stamina_max(j["stats"][3], j["stamina_mult"])  # endurance = index 3
    min_stamina = 60.0 if j["stamina_mult"] < 1.0 else 80.0
    test(f"{j['prenom']} stamina_max > {min_stamina:.0f}", stamina_max >= min_stamina, f"(stamina={stamina_max:.1f})")
    test(f"{j['prenom']} stamina_max < 120", stamina_max <= 120.0, f"(stamina={stamina_max:.1f})")

# David doit avoir un stamina réduit
david_stamina = compute_stamina_max(58, 0.8)
normal_stamina = compute_stamina_max(58, 1.0)
test("David a un stamina réduit (x0.8)", david_stamina < normal_stamina)

# --- Test 8: Bonus de domaine cohérents ---
print("\n--- Test 8: Bonus de domaine cohérents ---")
for domaine, bonus in DOMAIN_BONUS.items():
    for key, val in bonus.items():
        test(f"{domaine}.{key} bonus raisonnable", 0.5 <= val <= 2.0, f"(val={val})")

# --- Test 9: Caractéristiques spécifiques par joueur ---
print("\n--- Test 9: Caractéristiques joueurs spécifiques ---")

# Djilani doit être le meilleur défenseur
djilani = [j for j in JOUEURS_DATA if j["prenom"] == "Djilani"][0]
djilani_def = compute_effective_stats(djilani["stats"], djilani["domaine"])[6]
for j in JOUEURS_DATA:
    if j["prenom"] != "Djilani":
        other_def = compute_effective_stats(j["stats"], j["domaine"])[6]
        test(f"Djilani def ({djilani_def:.0f}) > {j['prenom']} def ({other_def:.0f})",
             djilani_def >= other_def)

# Loïc doit être un bon attaquant
loic = [j for j in JOUEURS_DATA if j["prenom"] == "Loïc"][0]
loic_atk = compute_effective_stats(loic["stats"], loic["domaine"])[7]
test("Loïc a attaque effective > 90", loic_atk > 90, f"(atk={loic_atk:.1f})")

# Théo doit être rapide (88 * 1.3 = 114.4, capped at 99)
theo = [j for j in JOUEURS_DATA if j["prenom"] == "Théo"][0]
theo_speed = compute_effective_stats(theo["stats"], theo["domaine"])[0]
test("Théo a vitesse effective = 99 (cap)", theo_speed >= 99.0, f"(speed={theo_speed:.1f})")

# Médéric doit être explosif
mederic = [j for j in JOUEURS_DATA if j["prenom"] == "Médéric"][0]
mederic_speed = compute_effective_stats(mederic["stats"], mederic["domaine"])[0]
test("Médéric a vitesse effective > 99 (cap)", mederic_speed >= 99.0, f"(speed={mederic_speed:.1f})")

# --- Test 10: Répartition des positions ---
print("\n--- Test 10: Répartition des positions ---")
positions = {}
for j in JOUEURS_DATA:
    pos = j["position"]
    positions[pos] = positions.get(pos, 0) + 1

test("Au moins 3 défenseurs", positions.get("Defenseur", 0) >= 3)
test("Au moins 3 attaquants", positions.get("Attaquant", 0) >= 3)
test("Au moins 3 milieux", positions.get("Milieu", 0) >= 3)
test("Aucun gardien désigné (bug connu corrigé)", positions.get("Gardien", 0) == 0)

# --- Test 11: Répartition des domaines scientifiques ---
print("\n--- Test 11: Répartition des domaines scientifiques ---")
domaines_count = {}
for j in JOUEURS_DATA:
    d = j["domaine"]
    domaines_count[d] = domaines_count.get(d, 0) + 1
test("Tous les 13 domaines sont utilisés", len(domaines_count) == 13)
for d, count in domaines_count.items():
    test(f"Domaine '{d}' utilisé ({count} joueur(s))", count >= 1)

# --- Résumé ---
print("\n" + "=" * 70)
print(f"RÉSULTAT: {passed}/{total} tests passés, {failed} échecs")
print("=" * 70)
sys.exit(0 if failed == 0 else 1)
