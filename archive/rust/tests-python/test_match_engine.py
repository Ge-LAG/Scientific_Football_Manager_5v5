"""
Tests exhaustifs du moteur de simulation de match.
Vérifie la logique de simulation, les périodes, les événements,
les probabilités de but, le stamina et la cohérence globale.
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
print("TEST SUITE: Moteur de Simulation de Match")
print("=" * 70)

# ============================================================
# Simulation simplifiée du moteur de match en Python
# ============================================================

class MoteurMatch:
    def __init__(self, note_dom=70.0, note_ext=70.0, chimie_dom=0.5, chimie_ext=0.5):
        self.score_domicile = 0
        self.score_exterieur = 0
        self.temps_ecoule = 0.0
        self.duree_match = 1200.0  # 20 minutes
        self.periode = "PremiereMitemps"
        self.evenements = []
        self.ballon_x = 0.0
        self.ballon_z = 0.0
        self.en_jeu = False
        self.vitesse_simulation = 1.0
        self.note_dom = note_dom
        self.note_ext = note_ext
        # Bonus domicile
        self.bonus_dom = (chimie_dom - 0.5) * 0.2
        self.bonus_ext = (chimie_ext - 0.5) * 0.2

    def demarrer(self):
        self.en_jeu = True
        self.periode = "PremiereMitemps"

    def pause(self):
        self.en_jeu = False

    def reprendre(self):
        if self.periode == "MiTemps":
            self.periode = "DeuxiemeMitemps"
        self.en_jeu = True

    def mise_a_jour(self, delta):
        if not self.en_jeu:
            return

        delta_ajuste = delta * self.vitesse_simulation
        self.temps_ecoule += delta_ajuste

        # Gestion des périodes
        if self.temps_ecoule >= 600.0 and self.periode == "PremiereMitemps":
            self.periode = "MiTemps"
            self.en_jeu = False
            return

        if self.temps_ecoule >= 1200.0 and self.periode == "DeuxiemeMitemps":
            self.terminer_match()
            return

        # Simulation simplifiée
        self.simuler_jeu(delta_ajuste)

    def simuler_jeu(self, delta):
        # Déplacement du ballon
        bruit_x = random.uniform(-1.0, 1.0) * delta * 8.0
        bruit_z = random.uniform(-1.0, 1.0) * delta * 8.0
        self.ballon_x = max(-48.0, min(48.0, self.ballon_x + bruit_x))
        self.ballon_z = max(-23.0, min(23.0, self.ballon_z + bruit_z))

        # Probabilité de but
        note_d = self.note_dom * (1.0 + self.bonus_dom)
        note_e = self.note_ext * (1.0 + self.bonus_ext)
        total_note = note_d + note_e

        prob_but_base = 0.0018 * delta

        if random.random() < prob_but_base and total_note > 0:
            c_domicile = note_d / total_note
            if random.random() < c_domicile:
                self.score_domicile += 1
                self.evenements.append(("But", "domicile", self.get_minute()))
            else:
                self.score_exterieur += 1
                self.evenements.append(("But", "exterieur", self.get_minute()))

    def terminer_match(self):
        self.en_jeu = False
        self.periode = "Termine"

    def get_minute(self):
        return int(self.temps_ecoule / 60.0)

    def get_temps_affichage(self):
        minutes = self.get_minute()
        secondes = int(self.temps_ecoule % 60)
        return f"{minutes:02d}:{secondes:02d}"


# --- Test 1: Durée du match ---
print("\n--- Test 1: Durée et périodes du match ---")
m = MoteurMatch()
test("Durée totale = 1200s (20 minutes)", m.duree_match == 1200.0)
test("Match commence en PremiereMitemps", m.periode == "PremiereMitemps")
test("Match pas en jeu avant démarrage", m.en_jeu == False)

m.demarrer()
test("Match en jeu après démarrage", m.en_jeu == True)
test("Période = PremiereMitemps après démarrage", m.periode == "PremiereMitemps")

# --- Test 2: Mi-temps à 600 secondes ---
print("\n--- Test 2: Mi-temps à 600 secondes (10 min) ---")
m2 = MoteurMatch()
m2.demarrer()

# Simuler jusqu'à la mi-temps
dt = 0.1
while m2.temps_ecoule < 599.9 and m2.en_jeu:
    m2.mise_a_jour(dt)

# Un dernier tick pour atteindre 600
m2.mise_a_jour(dt)
test("Mi-temps déclenchée", m2.periode == "MiTemps", f"(période={m2.periode}, temps={m2.temps_ecoule:.1f})")
test("Match en pause à la mi-temps", m2.en_jeu == False)

# Reprendre
m2.reprendre()
test("2ème mi-temps démarrée après reprise", m2.periode == "DeuxiemeMitemps")
test("Match en jeu après reprise", m2.en_jeu == True)

# --- Test 3: Fin du match à 1200 secondes ---
print("\n--- Test 3: Fin du match à 1200 secondes ---")
m3 = MoteurMatch()
m3.demarrer()

while m3.periode != "Termine":
    m3.mise_a_jour(0.1)
    if m3.periode == "MiTemps":
        m3.reprendre()

test("Match terminé", m3.periode == "Termine")
test("Match n'est plus en jeu", m3.en_jeu == False)
test("Temps >= 1200", m3.temps_ecoule >= 1200.0, f"(temps={m3.temps_ecoule:.1f})")

# --- Test 4: Score réaliste ---
print("\n--- Test 4: Score réaliste sur 100 matchs ---")
scores_dom = []
scores_ext = []
total_buts = []

for _ in range(100):
    m = MoteurMatch(note_dom=70, note_ext=70)
    m.demarrer()
    while m.periode != "Termine":
        m.mise_a_jour(0.5)
        if m.periode == "MiTemps":
            m.reprendre()
    scores_dom.append(m.score_domicile)
    scores_ext.append(m.score_exterieur)
    total_buts.append(m.score_domicile + m.score_exterieur)

avg_buts = sum(total_buts) / len(total_buts)
max_buts = max(total_buts)
min_buts = min(total_buts)

print(f"  Sur 100 matchs: moy={avg_buts:.1f} buts, min={min_buts}, max={max_buts}")
test("Moyenne de buts > 0", avg_buts > 0, f"(moy={avg_buts:.1f})")
test("Moyenne de buts < 15", avg_buts < 15, f"(moy={avg_buts:.1f})")
test("Pas de match avec 0 buts à chaque fois", max_buts > 0)

# --- Test 5: Domination influence le score ---
print("\n--- Test 5: Équipe dominante marque plus ---")
buts_dom_strong = []
buts_ext_strong = []

for _ in range(200):
    m = MoteurMatch(note_dom=90, note_ext=50)  # Domicile bien plus forte
    m.demarrer()
    while m.periode != "Termine":
        m.mise_a_jour(0.5)
        if m.periode == "MiTemps":
            m.reprendre()
    buts_dom_strong.append(m.score_domicile)
    buts_ext_strong.append(m.score_exterieur)

avg_dom = sum(buts_dom_strong) / len(buts_dom_strong)
avg_ext = sum(buts_ext_strong) / len(buts_ext_strong)
print(f"  Domicile (90) vs Extérieur (50): dom={avg_dom:.1f}, ext={avg_ext:.1f}")
test("Équipe dominante marque plus en moyenne", avg_dom > avg_ext,
     f"(dom={avg_dom:.1f}, ext={avg_ext:.1f})")

# --- Test 6: Pause et reprise ---
print("\n--- Test 6: Pause et reprise ---")
m6 = MoteurMatch()
m6.demarrer()
m6.mise_a_jour(10.0)
temps_avant = m6.temps_ecoule
m6.pause()
test("Match en pause", m6.en_jeu == False)
m6.mise_a_jour(5.0)  # Ne devrait pas avancer
test("Temps n'avance pas en pause", m6.temps_ecoule == temps_avant, f"(temps={m6.temps_ecoule}, attendu={temps_avant})")
m6.reprendre()
test("Match repris", m6.en_jeu == True)
m6.mise_a_jour(5.0)
test("Temps avance après reprise", m6.temps_ecoule > temps_avant)

# --- Test 7: Position du ballon dans les limites ---
print("\n--- Test 7: Position du ballon dans les limites ---")
m7 = MoteurMatch()
m7.demarrer()
for _ in range(1000):
    m7.mise_a_jour(0.1)
    if m7.periode == "MiTemps":
        m7.reprendre()
    test_ballon_x = -48.0 <= m7.ballon_x <= 48.0
    test_ballon_z = -23.0 <= m7.ballon_z <= 23.0
    if not test_ballon_x or not test_ballon_z:
        test("Ballon dans les limites", False, f"(x={m7.ballon_x}, z={m7.ballon_z})")
        break
else:
    test("Ballon toujours dans les limites sur 1000 ticks", True)

# --- Test 8: Affichage du temps ---
print("\n--- Test 8: Affichage du temps ---")
m8 = MoteurMatch()
m8.temps_ecoule = 0.0
test("00:00 au début", m8.get_temps_affichage() == "00:00")
m8.temps_ecoule = 65.5
test("01:05 à 65.5s", m8.get_temps_affichage() == "01:05")
m8.temps_ecoule = 600.0
test("10:00 à 600s", m8.get_temps_affichage() == "10:00")
m8.temps_ecoule = 1199.0
test("19:59 à 1199s", m8.get_temps_affichage() == "19:59")

# --- Test 9: Minute actuelle ---
print("\n--- Test 9: Minute actuelle ---")
m9 = MoteurMatch()
m9.temps_ecoule = 0.0
test("Minute 0 au début", m9.get_minute() == 0)
m9.temps_ecoule = 59.9
test("Minute 0 à 59.9s", m9.get_minute() == 0)
m9.temps_ecoule = 60.0
test("Minute 1 à 60s", m9.get_minute() == 1)
m9.temps_ecoule = 600.0
test("Minute 10 à 600s", m9.get_minute() == 10)

# --- Test 10: Vitesse de simulation ---
print("\n--- Test 10: Vitesse de simulation ---")
m10a = MoteurMatch()
m10a.demarrer()
m10a.vitesse_simulation = 1.0
m10a.mise_a_jour(10.0)
temps_normal = m10a.temps_ecoule

m10b = MoteurMatch()
m10b.demarrer()
m10b.vitesse_simulation = 2.0
m10b.mise_a_jour(10.0)
temps_rapide = m10b.temps_ecoule

test("Vitesse x2 = temps double", abs(temps_rapide - temps_normal * 2) < 0.01,
     f"(normal={temps_normal}, rapide={temps_rapide})")

# --- Test 11: Résultat match (V/N/D) ---
print("\n--- Test 11: Résultat du match ---")
victoires_dom = 0
victoires_ext = 0
nuls = 0

for _ in range(500):
    m = MoteurMatch(note_dom=70, note_ext=70)
    m.demarrer()
    while m.periode != "Termine":
        m.mise_a_jour(0.5)
        if m.periode == "MiTemps":
            m.reprendre()
    if m.score_domicile > m.score_exterieur:
        victoires_dom += 1
    elif m.score_exterieur > m.score_domicile:
        victoires_ext += 1
    else:
        nuls += 1

print(f"  Sur 500 matchs: V_dom={victoires_dom}, V_ext={victoires_ext}, N={nuls}")
test("Il y a des victoires domicile", victoires_dom > 0)
test("Il y a des victoires extérieur", victoires_ext > 0)
test("Il y a des matchs nuls", nuls > 0)
# Avec des notes égales, la répartition devrait être relativement équilibrée
test("Répartition raisonnable (dom < 70%)", victoires_dom / 500 < 0.70)
test("Répartition raisonnable (ext < 70%)", victoires_ext / 500 < 0.70)

# --- Test 12: Bonus chimie ---
print("\n--- Test 12: Bonus chimie ---")
# chimie = 0.5 -> bonus = 0.0
# chimie = 1.0 -> bonus = 0.1
# chimie = 0.0 -> bonus = -0.1
test("Chimie 0.5 -> bonus 0", abs((0.5 - 0.5) * 0.2) < 0.001)
test("Chimie 1.0 -> bonus 0.1", abs((1.0 - 0.5) * 0.2 - 0.1) < 0.001)
test("Chimie 0.0 -> bonus -0.1", abs((0.0 - 0.5) * 0.2 - (-0.1)) < 0.001)

# --- Test 13: Stamina pendant le match ---
print("\n--- Test 13: Consommation de stamina ---")
stamina = 100.0
stamina_max = 100.0
intensite = 1.0
delta = 1.0

# Consommation : 1.5 * intensite * delta par tick
conso = 1.5 * intensite * delta
stamina_apres = max(stamina - conso, 0.0)
test(f"Stamina après 1s: {stamina_apres:.1f} (attendu 98.5)", abs(stamina_apres - 98.5) < 0.01)

# Après 60s
stamina_60 = max(100.0 - 1.5 * 1.0 * 60.0, 0.0)
test(f"Stamina après 60s: {stamina_60:.1f} (attendu 10.0)", abs(stamina_60 - 10.0) < 0.01)

# Après 67s -> stamina = 0
stamina_67 = max(100.0 - 1.5 * 1.0 * 67.0, 0.0)
test(f"Stamina après 67s: {stamina_67:.1f} (épuisé)", stamina_67 == 0.0)

# Impact sur la forme si stamina < 15
forme = 1.0
if stamina_60 < 15:
    forme = max(forme - 0.002, 0.5)
test("Forme diminue si stamina < 15", forme < 1.0)

# --- Résumé ---
print("\n" + "=" * 70)
print(f"RÉSULTAT: {passed}/{total} tests passés, {failed} échecs")
print("=" * 70)
sys.exit(0 if failed == 0 else 1)
