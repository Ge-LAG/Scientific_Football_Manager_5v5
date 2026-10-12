#!/usr/bin/env python3
"""
Script principal pour exécuter tous les tests de l'application
Scientific Football Manager 5v5.

Usage: python3 tests/run_all_tests.py
"""
import subprocess
import sys
import os
import time

def run_test(name, script_path):
    print(f"\n{'='*70}")
    print(f"  LANCEMENT: {name}")
    print(f"{'='*70}\n")

    start = time.time()
    result = subprocess.run(
        [sys.executable, script_path],
        capture_output=True,
        text=True,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    elapsed = time.time() - start

    print(result.stdout)
    if result.stderr:
        print(f"STDERR: {result.stderr}")

    status = "PASS" if result.returncode == 0 else "FAIL"
    print(f"\n  [{status}] {name} ({elapsed:.2f}s)")
    return result.returncode == 0

def main():
    test_dir = os.path.dirname(os.path.abspath(__file__))

    tests = [
        ("Statistiques des Joueurs",       os.path.join(test_dir, "test_player_stats.py")),
        ("Gestion des Équipes",            os.path.join(test_dir, "test_team_management.py")),
        ("Moteur de Match",                os.path.join(test_dir, "test_match_engine.py")),
        ("Power-Ups Scientifiques",        os.path.join(test_dir, "test_power_ups.py")),
        ("Domaines Scientifiques",         os.path.join(test_dir, "test_scientific_domains.py")),
        ("Équilibrage Global du Jeu",      os.path.join(test_dir, "test_game_balance.py")),
        ("Parité Desktop / Mobile",        os.path.join(test_dir, "test_mobile_parity.py")),
    ]

    print("=" * 70)
    print("  SCIENTIFIC FOOTBALL MANAGER 5v5 — SUITE DE TESTS COMPLÈTE")
    print(f"  {len(tests)} suites de tests à exécuter")
    print("=" * 70)

    results = []
    for name, path in tests:
        success = run_test(name, path)
        results.append((name, success))

    # Résumé final
    print("\n\n" + "=" * 70)
    print("  RÉSUMÉ GLOBAL")
    print("=" * 70)

    passed = sum(1 for _, s in results if s)
    failed = sum(1 for _, s in results if not s)

    for name, success in results:
        status = "PASS" if success else "FAIL"
        icon = "  " if success else "  "
        print(f"  [{status}] {name}")

    print(f"\n  Total: {passed}/{len(results)} suites passées, {failed} en échec")
    print("=" * 70)

    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
