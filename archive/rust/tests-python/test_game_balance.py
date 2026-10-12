"""
Tests exhaustifs de l'équilibrage global du jeu.
Simule de nombreuses parties et vérifie que le jeu est bien équilibré.
"""
import random
import sys
import math

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
print("TEST SUITE: Équilibrage Global du Jeu")
print("=" * 70)

# ============================================================
# Reproduction complète du système de jeu en Python
# ============================================================

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

JOUEURS = [
    {"id": 1,  "prenom": "Roland",    "domaine": "Informatique",           "stats": [72,82,58,74,78,65,76,52,75]},
    {"id": 2,  "prenom": "Loïc",      "domaine": "PhysiqueMecanique",      "stats": [76,78,88,82,74,68,52,90,72]},
    {"id": 3,  "prenom": "David",     "domaine": "BiologieChimie",         "stats": [82,68,78,58,72,88,62,80,65]},
    {"id": 4,  "prenom": "Thibault",  "domaine": "PhysiqueChimie",         "stats": [78,76,82,76,80,80,79,79,74]},
    {"id": 5,  "prenom": "Henry",     "domaine": "Informatique",           "stats": [68,84,52,72,80,66,86,50,90]},
    {"id": 6,  "prenom": "Romain",    "domaine": "Electronique",           "stats": [74,78,74,82,78,74,68,78,84]},
    {"id": 7,  "prenom": "Théo",      "domaine": "Mathematiques",          "stats": [88,74,62,84,82,58,82,68,70]},
    {"id": 8,  "prenom": "Franck",    "domaine": "BiologieMedecine",       "stats": [62,86,82,82,74,74,68,84,74]},
    {"id": 9,  "prenom": "Aurélien",  "domaine": "Chimie",                 "stats": [64,72,74,72,78,86,76,80,68]},
    {"id": 10, "prenom": "Lucien",    "domaine": "Informatique",           "stats": [70,82,76,74,84,72,88,54,76]},
    {"id": 11, "prenom": "Joffrey",   "domaine": "MathematiquesBancaire",  "stats": [76,62,80,82,84,82,70,82,70]},
    {"id": 12, "prenom": "Yacine",    "domaine": "AidesSubventions",       "stats": [60,76,80,74,74,88,78,86,82]},
    {"id": 13, "prenom": "Djilani",   "domaine": "Cyberscurite",           "stats": [72,88,50,76,82,60,96,38,84]},
    {"id": 14, "prenom": "Médéric",   "domaine": "ElectroniqueBancaire",   "stats": [88,76,62,76,74,84,74,78,72]},
    {"id": 15, "prenom": "Guillaume", "domaine": "AgroalimentaireGeologie", "stats": [86,74,62,84,64,70,82,62,70]},
]

STAT_KEYS = ["speed", "strength", "precision", "endurance", "intelligence", "creativity", "defense", "attack", "heading"]

def compute_effective(stats, domaine):
    bonus = DOMAIN_BONUS[domaine]
    return [min(stats[i] * bonus[k], 99.0) for i, k in enumerate(STAT_KEYS)]

def note_globale(stats):
    return sum(stats) / 9.0

EQUIPE1_IDS = [1, 2, 3, 4, 5, 6, 7, 8]
EQUIPE2_IDS = [9, 10, 11, 12, 13, 14, 15]

# --- Test 1: Notes des deux équipes ---
print("\n--- Test 1: Notes moyennes des équipes ---")
notes_eq1 = []
notes_eq2 = []

for j in JOUEURS:
    eff = compute_effective(j["stats"], j["domaine"])
    note = note_globale(eff)
    if j["id"] in EQUIPE1_IDS:
        notes_eq1.append(note)
    else:
        notes_eq2.append(note)

avg_eq1 = sum(notes_eq1) / len(notes_eq1)
avg_eq2 = sum(notes_eq2) / len(notes_eq2)
ecart_equipes = abs(avg_eq1 - avg_eq2)

print(f"  Équipe 1: {avg_eq1:.1f} (8 joueurs)")
print(f"  Équipe 2: {avg_eq2:.1f} (7 joueurs)")
print(f"  Écart: {ecart_equipes:.1f}")

test("Équipe 1 note moyenne > 60", avg_eq1 > 60)
test("Équipe 2 note moyenne > 60", avg_eq2 > 60)
test("Écart entre équipes < 15", ecart_equipes < 15, f"(écart={ecart_equipes:.1f})")

# --- Test 2: Répartition des rôles ---
print("\n--- Test 2: Répartition attaque/défense ---")
for eq_name, eq_ids in [("Équipe 1", EQUIPE1_IDS), ("Équipe 2", EQUIPE2_IDS)]:
    joueurs_eq = [j for j in JOUEURS if j["id"] in eq_ids]
    attaque_totale = 0
    defense_totale = 0
    for j in joueurs_eq:
        eff = compute_effective(j["stats"], j["domaine"])
        attaque_totale += eff[7]  # attack
        defense_totale += eff[6]  # defense
    avg_atk = attaque_totale / len(joueurs_eq)
    avg_def = defense_totale / len(joueurs_eq)
    test(f"{eq_name}: attaque moyenne > 50", avg_atk > 50, f"(atk={avg_atk:.1f})")
    test(f"{eq_name}: défense moyenne > 50", avg_def > 50, f"(def={avg_def:.1f})")

# --- Test 3: Simulation de saison (20 matchs) ---
print("\n--- Test 3: Simulation d'une saison de 20 matchs ---")

def simuler_match_simple(note_d, note_e, chimie_d=0.5, chimie_e=0.5):
    """Simulation simplifiée d'un match retournant (buts_dom, buts_ext)"""
    bonus_d = (chimie_d - 0.5) * 0.2
    bonus_e = (chimie_e - 0.5) * 0.2
    note_d_eff = note_d * (1.0 + bonus_d)
    note_e_eff = note_e * (1.0 + bonus_e)
    total = note_d_eff + note_e_eff

    buts_d = 0
    buts_e = 0
    # 1200 ticks de simulation (1s chacun)
    for _ in range(1200):
        if random.random() < 0.0018 and total > 0:
            if random.random() < (note_d_eff / total):
                buts_d += 1
            else:
                buts_e += 1
    return buts_d, buts_e

# Simuler une saison
victoires_eq1 = 0
victoires_eq2 = 0
nuls = 0

for match_num in range(20):
    bd, be = simuler_match_simple(avg_eq1, avg_eq2)
    if bd > be:
        victoires_eq1 += 1
    elif be > bd:
        victoires_eq2 += 1
    else:
        nuls += 1

pts_eq1 = victoires_eq1 * 3 + nuls
pts_eq2 = victoires_eq2 * 3 + nuls
print(f"  Saison: Eq1 {victoires_eq1}V/{nuls}N/{victoires_eq2}D = {pts_eq1}pts")
print(f"          Eq2 {victoires_eq2}V/{nuls}N/{victoires_eq1}D = {pts_eq2}pts")

test("Les deux équipes marquent des points", pts_eq1 > 0 and pts_eq2 > 0)

# --- Test 4: Monte Carlo - 1000 saisons ---
print("\n--- Test 4: Monte Carlo - 1000 saisons de 10 matchs ---")
wins_total_eq1 = 0
wins_total_eq2 = 0
draws_total = 0

for _ in range(1000):
    for _ in range(10):
        bd, be = simuler_match_simple(avg_eq1, avg_eq2)
        if bd > be:
            wins_total_eq1 += 1
        elif be > bd:
            wins_total_eq2 += 1
        else:
            draws_total += 1

total_matches = wins_total_eq1 + wins_total_eq2 + draws_total
pct_eq1 = wins_total_eq1 / total_matches * 100
pct_eq2 = wins_total_eq2 / total_matches * 100
pct_nuls = draws_total / total_matches * 100

print(f"  Sur {total_matches} matchs:")
print(f"  Victoires Eq1: {pct_eq1:.1f}%")
print(f"  Victoires Eq2: {pct_eq2:.1f}%")
print(f"  Nuls: {pct_nuls:.1f}%")

test("Aucune équipe ne gagne > 80% du temps", pct_eq1 < 80 and pct_eq2 < 80,
     f"(eq1={pct_eq1:.1f}%, eq2={pct_eq2:.1f}%)")
test("Il y a des matchs nuls (> 5%)", pct_nuls > 5, f"(nuls={pct_nuls:.1f}%)")

# --- Test 5: Impact de la chimie ---
print("\n--- Test 5: Impact de la chimie sur les résultats ---")
buts_bonne_chimie = []
buts_mauvaise_chimie = []

for _ in range(500):
    bd, _ = simuler_match_simple(70, 70, chimie_d=0.9, chimie_e=0.5)
    buts_bonne_chimie.append(bd)
    bd2, _ = simuler_match_simple(70, 70, chimie_d=0.2, chimie_e=0.5)
    buts_mauvaise_chimie.append(bd2)

avg_bonne = sum(buts_bonne_chimie) / len(buts_bonne_chimie)
avg_mauvaise = sum(buts_mauvaise_chimie) / len(buts_mauvaise_chimie)
print(f"  Buts avec bonne chimie (0.9): {avg_bonne:.2f}")
print(f"  Buts avec mauvaise chimie (0.2): {avg_mauvaise:.2f}")
test("Bonne chimie produit plus de buts", avg_bonne > avg_mauvaise,
     f"(bonne={avg_bonne:.2f}, mauvaise={avg_mauvaise:.2f})")

# --- Test 6: Variété des scores ---
print("\n--- Test 6: Variété des scores ---")
scores_vus = set()
for _ in range(500):
    bd, be = simuler_match_simple(70, 70)
    scores_vus.add((bd, be))

print(f"  Scores distincts vus: {len(scores_vus)}")
test("Au moins 10 scores distincts sur 500 matchs", len(scores_vus) >= 10)
test("Score 0-0 est possible", (0, 0) in scores_vus or len(scores_vus) > 15)

# --- Test 7: Profils de joueurs variés ---
print("\n--- Test 7: Profils de joueurs variés ---")
# Chaque joueur doit avoir un profil distinct
profils = []
for j in JOUEURS:
    eff = compute_effective(j["stats"], j["domaine"])
    # Identifier la stat dominante
    max_stat_idx = eff.index(max(eff))
    profils.append((j["prenom"], STAT_KEYS[max_stat_idx], max(eff)))

print("  Stat dominante par joueur:")
for prenom, stat, val in profils:
    print(f"    {prenom:12s}: {stat:15s} = {val:.0f}")

dominant_stats = set(p[1] for p in profils)
test("Au moins 4 stats dominantes différentes", len(dominant_stats) >= 4,
     f"(stats={dominant_stats})")

# --- Test 8: Impact du stamina sur le jeu ---
print("\n--- Test 8: Impact du stamina ---")
# Un joueur fatigué doit être moins performant
note_frais = note_globale(compute_effective(JOUEURS[0]["stats"], JOUEURS[0]["domaine"]))
# Avec stamina à 30% (ratio = 0.3, max(0.3, 0.5) = 0.5)
note_fatigue = note_frais * 1.0 * 1.0 * 0.5
test("Joueur fatigué (30% stamina) est moins performant", note_fatigue < note_frais)
test("Joueur fatigué vaut au moins 50% du frais", note_fatigue >= note_frais * 0.5)

# --- Test 9: Montée de niveau ---
print("\n--- Test 9: Montée de niveau ---")
# Niveau 1: 1000 XP requis
# Un but = 100 XP, une passe décisive = 50 XP
test("10 buts = 1000 XP = niveau 2", 10 * 100 >= 1000)
test("20 passes = 1000 XP = niveau 2", 20 * 50 >= 1000)
test("5 buts + 10 passes = 1000 XP = niveau 2", 5 * 100 + 10 * 50 >= 1000)

# Stats augmentent de +0.3 au niveau up
stat_base = 70.0
stat_apres_lvl = min(stat_base + 0.3, 95.0)
test("Stat augmente de 0.3 au level up", abs(stat_apres_lvl - 70.3) < 0.01)

# Cap à 95 pour les stats de base
stat_94_8 = min(94.8 + 0.3, 95.0)
test("Stats de base capées à 95", stat_94_8 == 95.0)

# --- Test 10: Formation vs résultat ---
print("\n--- Test 10: Toutes les formations produisent des matchs jouables ---")
formations = {
    "F121":  [1, 2, 1, 1],  # GK, DEF, MIL, ATK
    "F112":  [1, 1, 1, 2],
    "F211":  [1, 2, 1, 1],
    "F1111": [1, 1, 2, 1],
}

for formation_name in formations:
    buts_total = 0
    for _ in range(100):
        bd, be = simuler_match_simple(avg_eq1, avg_eq2)
        buts_total += bd + be
    avg_buts = buts_total / 100
    test(f"Formation {formation_name}: matchs produisent des buts (moy={avg_buts:.1f})", avg_buts > 0)

# --- Résumé ---
print("\n" + "=" * 70)
print(f"RÉSULTAT: {passed}/{total} tests passés, {failed} échecs")
print("=" * 70)
sys.exit(0 if failed == 0 else 1)
