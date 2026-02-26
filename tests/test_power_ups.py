"""
Tests exhaustifs des power-ups scientifiques.
Vérifie les durées, raretés, modificateurs, inventaire et distribution.
"""
import random
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
print("TEST SUITE: Power-Ups Scientifiques")
print("=" * 70)

# ============================================================
# Données des power-ups
# ============================================================

POWER_UPS = {
    "VitesseQuantique":       {"duree": 30.0, "rarete": "Commun"},
    "ForceNewtonienne":       {"duree": 45.0, "rarete": "Commun"},
    "IncertitudeHeisenberg":  {"duree": 20.0, "rarete": "Rare"},
    "EMC2":                   {"duree": 2.0,  "rarete": "Epique"},
    "Photosynthese":          {"duree": 60.0, "rarete": "Commun"},
    "CodeBinaire":            {"duree": 30.0, "rarete": "PeuCommun"},
    "TrouNoir":               {"duree": 25.0, "rarete": "PeuCommun"},
    "TectoniquePlaque":       {"duree": 40.0, "rarete": "Rare"},
    "ReplicationADN":         {"duree": 15.0, "rarete": "Legendaire"},
    "TheorieDuTout":          {"duree": 10.0, "rarete": "Legendaire"},
    "CircuitIntegre":         {"duree": 20.0, "rarete": "PeuCommun"},
    "PareFeuDefensif":        {"duree": 20.0, "rarete": "Epique"},
    "CatalyseurChimique":     {"duree": 35.0, "rarete": "Epique"},
    "SubventionBoost":        {"duree": 45.0, "rarete": "Rare"},
    "OptimisationBancaire":   {"duree": 30.0, "rarete": "Rare"},
}

MODIFICATEURS = {
    "VitesseQuantique":      {"vitesse": 2.0},
    "ForceNewtonienne":      {"force": 2.0},
    "IncertitudeHeisenberg": {"precision": 3.0},
    "EMC2":                  {"force": 5.0, "precision": 2.0},
    "Photosynthese":         {"endurance": 2.0},
    "CodeBinaire":           {"intelligence": 3.0},
    "TrouNoir":              {"force": 1.5, "defense": 1.5},
    "TectoniquePlaque":      {"force": 2.5, "defense": 2.0},
    "ReplicationADN":        {"vitesse": 1.3, "creativite": 2.0},
    "TheorieDuTout":         {"vitesse": 2.0, "force": 2.0, "precision": 2.0,
                              "endurance": 2.0, "intelligence": 2.0, "creativite": 2.0, "defense": 2.0},
    "CircuitIntegre":        {"vitesse": 1.8, "intelligence": 1.5},
    "PareFeuDefensif":       {"defense": 5.0},
    "CatalyseurChimique":    {"vitesse": 1.3, "creativite": 1.5},
    "SubventionBoost":       {"endurance": 1.5, "force": 1.3},
    "OptimisationBancaire":  {"precision": 1.8, "intelligence": 1.6},
}

RARETE_DISTRIBUTION = {
    "Commun": 0.40,
    "PeuCommun": 0.30,
    "Rare": 0.18,
    "Epique": 0.08,
    "Legendaire": 0.04,
}

# --- Test 1: Nombre de power-ups ---
print("\n--- Test 1: Nombre de power-ups ---")
test("Il y a exactement 15 power-ups", len(POWER_UPS) == 15)

# --- Test 2: Durées valides ---
print("\n--- Test 2: Durées valides ---")
for name, data in POWER_UPS.items():
    test(f"{name}: durée > 0", data["duree"] > 0, f"(durée={data['duree']})")
    test(f"{name}: durée <= 60", data["duree"] <= 60, f"(durée={data['duree']})")

# --- Test 3: Raretés valides ---
print("\n--- Test 3: Raretés valides ---")
raretes_valides = {"Commun", "PeuCommun", "Rare", "Epique", "Legendaire"}
for name, data in POWER_UPS.items():
    test(f"{name}: rareté valide", data["rarete"] in raretes_valides, f"(rareté={data['rarete']})")

# Compter par rareté
rarete_count = {}
for name, data in POWER_UPS.items():
    r = data["rarete"]
    rarete_count[r] = rarete_count.get(r, 0) + 1

test("3 power-ups Communs", rarete_count.get("Commun", 0) == 3)
test("3 power-ups PeuCommuns", rarete_count.get("PeuCommun", 0) == 3)
test("4 power-ups Rares", rarete_count.get("Rare", 0) == 4)
test("3 power-ups Épiques", rarete_count.get("Epique", 0) == 3)
test("2 power-ups Légendaires", rarete_count.get("Legendaire", 0) == 2)

# --- Test 4: Modificateurs valides ---
print("\n--- Test 4: Modificateurs valides ---")
stats_possibles = {"vitesse", "force", "precision", "endurance", "intelligence", "creativite", "defense"}

for name, mods in MODIFICATEURS.items():
    test(f"{name}: a au moins un modificateur", len(mods) > 0)
    for stat, val in mods.items():
        test(f"{name}.{stat}: stat valide", stat in stats_possibles, f"(stat={stat})")
        test(f"{name}.{stat}: multiplicateur > 1", val >= 1.0, f"(val={val})")
        test(f"{name}.{stat}: multiplicateur raisonnable (<= 5)", val <= 5.0, f"(val={val})")

# --- Test 5: TheorieDuTout est le plus puissant ---
print("\n--- Test 5: TheorieDuTout est le plus puissant ---")
tdt = MODIFICATEURS["TheorieDuTout"]
test("TheorieDuTout boost 7 stats", len(tdt) == 7)
for stat, val in tdt.items():
    test(f"TheorieDuTout.{stat} = 2.0", val == 2.0, f"(val={val})")

# --- Test 6: Distribution aléatoire ---
print("\n--- Test 6: Distribution aléatoire des power-ups ---")

def generer_aleatoire():
    roll = random.random()
    if roll < 0.40:
        return random.choice(["VitesseQuantique", "ForceNewtonienne", "Photosynthese"])
    elif roll < 0.70:
        return random.choice(["CodeBinaire", "CircuitIntegre", "TrouNoir"])
    elif roll < 0.88:
        return random.choice(["TectoniquePlaque", "IncertitudeHeisenberg", "SubventionBoost", "OptimisationBancaire"])
    elif roll < 0.96:
        return random.choice(["EMC2", "PareFeuDefensif", "CatalyseurChimique"])
    else:
        return random.choice(["ReplicationADN", "TheorieDuTout"])

# Générer 10000 power-ups et vérifier la distribution
counts = {}
N = 10000
for _ in range(N):
    pu = generer_aleatoire()
    counts[pu] = counts.get(pu, 0) + 1

# Vérifier que les communs sont les plus fréquents
communs = sum(counts.get(pu, 0) for pu in ["VitesseQuantique", "ForceNewtonienne", "Photosynthese"])
legendaires = sum(counts.get(pu, 0) for pu in ["ReplicationADN", "TheorieDuTout"])

test("Communs > 30% des drops", communs / N > 0.30, f"(ratio={communs/N:.2%})")
test("Légendaires < 10% des drops", legendaires / N < 0.10, f"(ratio={legendaires/N:.2%})")
test("Communs > Légendaires", communs > legendaires)

print(f"  Distribution: Communs={communs/N:.1%}, Légendaires={legendaires/N:.1%}")

# --- Test 7: Inventaire de power-ups ---
print("\n--- Test 7: Inventaire de power-ups ---")

class InventairePowerUp:
    def __init__(self, max_slots):
        self.disponibles = []
        self.max_slots = max_slots

    def ajouter(self, pu):
        if len(self.disponibles) < self.max_slots:
            self.disponibles.append(pu)
            return True
        return False

    def utiliser(self, index):
        if index < len(self.disponibles):
            return self.disponibles.pop(index)
        return None

    def est_plein(self):
        return len(self.disponibles) >= self.max_slots

inv = InventairePowerUp(3)
test("Inventaire vide au début", len(inv.disponibles) == 0)
test("Inventaire pas plein", not inv.est_plein())

test("Ajout 1 réussi", inv.ajouter("VitesseQuantique"))
test("Ajout 2 réussi", inv.ajouter("ForceNewtonienne"))
test("Ajout 3 réussi", inv.ajouter("EMC2"))
test("Inventaire plein (3/3)", inv.est_plein())
test("Ajout 4 échoue (plein)", not inv.ajouter("CodeBinaire"))

# Utiliser un power-up
used = inv.utiliser(1)
test("Utiliser index 1 retourne ForceNewtonienne", used == "ForceNewtonienne")
test("Inventaire a maintenant 2 items", len(inv.disponibles) == 2)
test("Inventaire n'est plus plein", not inv.est_plein())

# Index invalide
used_invalid = inv.utiliser(10)
test("Utiliser index invalide retourne None", used_invalid is None)

# --- Test 8: Cooldown des capacités spéciales ---
print("\n--- Test 8: Cooldown des capacités spéciales ---")

class CapaciteSpeciale:
    def __init__(self, cooldown_max):
        self.cooldown_max = cooldown_max
        self.cooldown_actuel = 0.0
        self.actif = False

    def est_disponible(self):
        return self.cooldown_actuel <= 0.0

    def utiliser(self):
        if self.est_disponible():
            self.cooldown_actuel = self.cooldown_max
            self.actif = True
            return True
        return False

    def mise_a_jour(self, delta):
        if self.cooldown_actuel > 0.0:
            self.cooldown_actuel = max(self.cooldown_actuel - delta, 0.0)
        if self.cooldown_actuel <= 0.0:
            self.actif = False

cap = CapaciteSpeciale(40.0)
test("Capacité disponible au début", cap.est_disponible())
test("Utilisation réussie", cap.utiliser())
test("Capacité active après utilisation", cap.actif)
test("Cooldown = 40", cap.cooldown_actuel == 40.0)
test("Capacité non disponible pendant cooldown", not cap.est_disponible())
test("Deuxième utilisation échoue", not cap.utiliser())

# Simuler le passage du temps
cap.mise_a_jour(20.0)
test("Cooldown à 20 après 20s", abs(cap.cooldown_actuel - 20.0) < 0.01)
test("Toujours en cooldown", not cap.est_disponible())

cap.mise_a_jour(20.0)
test("Cooldown à 0 après 40s", cap.cooldown_actuel == 0.0)
test("Capacité disponible à nouveau", cap.est_disponible())
test("Capacité n'est plus active", not cap.actif)

# --- Test 9: Puissance équilibrée ---
print("\n--- Test 9: Puissance vs rareté ---")
# Les power-ups plus rares doivent être globalement plus puissants
def puissance_totale(mods):
    return sum(v - 1.0 for v in mods.values())  # Excès par rapport à 1.0

puissances = {}
for name, mods in MODIFICATEURS.items():
    puissances[name] = puissance_totale(mods)

# Moyenne par rareté
puissance_par_rarete = {}
for name, data in POWER_UPS.items():
    r = data["rarete"]
    if r not in puissance_par_rarete:
        puissance_par_rarete[r] = []
    puissance_par_rarete[r].append(puissances.get(name, 0))

for r in puissance_par_rarete:
    puissance_par_rarete[r] = sum(puissance_par_rarete[r]) / len(puissance_par_rarete[r])

print(f"  Puissance moyenne: {puissance_par_rarete}")
test("Légendaires plus puissants que Communs",
     puissance_par_rarete.get("Legendaire", 0) > puissance_par_rarete.get("Commun", 0))

# --- Résumé ---
print("\n" + "=" * 70)
print(f"RÉSULTAT: {passed}/{total} tests passés, {failed} échecs")
print("=" * 70)
sys.exit(0 if failed == 0 else 1)
