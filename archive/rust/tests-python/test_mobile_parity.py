"""
Tests de parité entre la version desktop et mobile.
Vérifie que le code partagé (mobile/shared) est identique ou compatible
avec le code desktop en termes de logique métier.
"""
import sys
import os
import re

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
print("TEST SUITE: Parité Desktop / Mobile")
print("=" * 70)

# Chemins
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESKTOP = os.path.join(BASE, "desktop_app", "src")
MOBILE = os.path.join(BASE, "mobile_app", "shared", "src")

# --- Test 1: Fichiers de modèles présents ---
print("\n--- Test 1: Fichiers de modèles présents (desktop et mobile) ---")
MODEL_FILES = ["player.rs", "team.rs", "match_engine.rs", "power_up.rs", "scientific_domain.rs", "mod.rs"]

for f in MODEL_FILES:
    desktop_path = os.path.join(DESKTOP, "models", f)
    mobile_path = os.path.join(MOBILE, "models", f)
    test(f"Desktop models/{f} existe", os.path.exists(desktop_path))
    test(f"Mobile  models/{f} existe", os.path.exists(mobile_path))

# --- Test 2: Contenu identique pour les modèles ---
print("\n--- Test 2: Contenu identique des modèles ---")
for f in MODEL_FILES:
    desktop_path = os.path.join(DESKTOP, "models", f)
    mobile_path = os.path.join(MOBILE, "models", f)
    if os.path.exists(desktop_path) and os.path.exists(mobile_path):
        with open(desktop_path, "r") as df:
            desktop_content = df.read()
        with open(mobile_path, "r") as mf:
            mobile_content = mf.read()
        is_identical = desktop_content == mobile_content
        if is_identical:
            test(f"models/{f} identique desktop/mobile", True)
        else:
            # Les fichiers desktop peuvent contenir des tests (#[cfg(test)]) que mobile n'a pas
            # Comparer le code hors des sections #[cfg(test)]
            desktop_no_tests = desktop_content.split("#[cfg(test)]")[0].strip()
            mobile_no_tests = mobile_content.split("#[cfg(test)]")[0].strip()
            test(f"models/{f} logique identique desktop/mobile (hors tests)",
                 desktop_no_tests == mobile_no_tests,
                 f"(desktop={len(desktop_no_tests)}B, mobile={len(mobile_no_tests)}B)")
    else:
        test(f"models/{f} comparaison possible", False, "(fichier manquant)")

# --- Test 3: Cargo.toml valides ---
print("\n--- Test 3: Cargo.toml valides ---")
desktop_cargo = os.path.join(BASE, "desktop_app", "Cargo.toml")
mobile_cargo = os.path.join(BASE, "mobile_app", "shared", "Cargo.toml")
android_cargo = os.path.join(BASE, "mobile_app", "android", "Cargo.toml")

for name, path in [("Desktop", desktop_cargo), ("Mobile shared", mobile_cargo), ("Android", android_cargo)]:
    test(f"{name} Cargo.toml existe", os.path.exists(path))
    if os.path.exists(path):
        with open(path, "r") as f:
            content = f.read()
        test(f"{name}: a une section [dependencies]", "[dependencies]" in content)
        # Mobile shared n'utilise PAS Bevy (pure logique métier, pas d'UI)
        if name == "Mobile shared":
            test(f"{name}: n'utilise PAS bevy (pure logique)", "bevy" not in content)
        else:
            test(f"{name}: utilise bevy", "bevy" in content)
        test(f"{name}: utilise serde", "serde" in content)
        test(f"{name}: utilise rand", "rand" in content)

# --- Test 4: Desktop n'a PAS dynamic_linking en dur ---
print("\n--- Test 4: dynamic_linking pas dans les dépendances en dur ---")
with open(desktop_cargo, "r") as f:
    cargo_content = f.read()

# Vérifier que dynamic_linking n'est pas dans les dépendances directes
dep_section = cargo_content.split("[dependencies]")[1] if "[dependencies]" in cargo_content else ""
# Arrêter au prochain [ si il y a
if "[" in dep_section[1:]:
    dep_section = dep_section[:dep_section.index("[", 1)]

test("dynamic_linking absent des dépendances directes",
     "dynamic_linking" not in dep_section,
     f"(trouvé dans la section [dependencies])")

# Vérifier qu'il est dans les features
test("dynamic_linking présent dans [features]",
     "[features]" in cargo_content and "dynamic_linking" in cargo_content)

# --- Test 5: Android n'a PAS dynamic_linking ---
print("\n--- Test 5: Android Cargo.toml ---")
with open(android_cargo, "r") as f:
    android_content = f.read()
# Le commentaire mentionne dynamic_linking mais ce n'est pas dans les features
dep_lines = [l for l in android_content.split("\n") if "features" in l.lower() and "dynamic_linking" in l]
test("Android: pas de dynamic_linking dans features", len(dep_lines) == 0)
test("Android: a android-game-activity", "android-game-activity" in android_content)
test("Android: a cdylib", "cdylib" in android_content)

# --- Test 6: Lib.rs mobile a les exports FFI ---
print("\n--- Test 6: Lib.rs mobile a les exports FFI ---")
lib_path = os.path.join(MOBILE, "lib.rs")
if os.path.exists(lib_path):
    with open(lib_path, "r") as f:
        lib_content = f.read()
    test("lib.rs a extern \"C\"", "extern \"C\"" in lib_content)
    test("lib.rs exporte sfm_simuler_match_rapide", "sfm_simuler_match_rapide" in lib_content)
    test("lib.rs exporte sfm_get_joueurs_json", "sfm_get_joueurs_json" in lib_content)
    test("lib.rs a #[no_mangle]", "#[no_mangle]" in lib_content)
else:
    test("lib.rs existe", False)

# --- Test 7: Version Bevy cohérente ---
print("\n--- Test 7: Version Bevy cohérente ---")
bevy_versions = []
for name, path in [("Desktop", desktop_cargo), ("Android", android_cargo)]:
    with open(path, "r") as f:
        content = f.read()
    # Chercher la version de bevy
    match = re.search(r'bevy\s*=\s*\{?\s*version\s*=\s*"([^"]+)"', content)
    if not match:
        match = re.search(r'bevy\s*=\s*"([^"]+)"', content)
    if match:
        bevy_versions.append((name, match.group(1)))
        test(f"{name}: utilise bevy 0.15", match.group(1) == "0.15")
    else:
        test(f"{name}: version bevy trouvée", False)

if len(bevy_versions) >= 2:
    test("Même version Bevy partout", bevy_versions[0][1] == bevy_versions[1][1],
         f"({bevy_versions[0][0]}={bevy_versions[0][1]}, {bevy_versions[1][0]}={bevy_versions[1][1]})")

# --- Test 8: Nombre de joueurs cohérent ---
print("\n--- Test 8: Nombre de joueurs cohérent ---")
desktop_player = os.path.join(DESKTOP, "models", "player.rs")
mobile_player = os.path.join(MOBILE, "models", "player.rs")

for name, path in [("Desktop", desktop_player), ("Mobile", mobile_player)]:
    with open(path, "r") as f:
        content = f.read()
    # Compter les Joueur::new
    count = content.count("Joueur::new(")
    test(f"{name}: 15 joueurs créés", count == 15, f"(trouvé {count})")

# --- Test 9: iOS structure minimale ---
print("\n--- Test 9: Structure iOS ---")
ios_path = os.path.join(BASE, "mobile_app", "ios", "ScientificFootball", "ContentView.swift")
test("ContentView.swift existe", os.path.exists(ios_path))
if os.path.exists(ios_path):
    with open(ios_path, "r") as f:
        ios_content = f.read()
    test("iOS: a import SwiftUI", "import SwiftUI" in ios_content)
    test("iOS: a struct ContentView", "struct ContentView" in ios_content)
    test("iOS: a un body", "var body" in ios_content)

# --- Test 10: Android structure ---
print("\n--- Test 10: Structure Android ---")
android_java = os.path.join(BASE, "mobile_app", "android", "app", "src", "main",
                            "java", "com", "scientificfootball", "MainActivity.java")
test("MainActivity.java existe", os.path.exists(android_java))

# --- Résumé ---
print("\n" + "=" * 70)
print(f"RÉSULTAT: {passed}/{total} tests passés, {failed} échecs")
print("=" * 70)
sys.exit(0 if failed == 0 else 1)
