// Défis du jour : stockage local (ll.challenges) et raccordement aux fins de match.
// La logique (génération, évaluation, série) vit dans shared/challenges.js — module pur.
import { dailyFor, applyMatch, streakOf } from "../../shared/challenges.js";

const KEY = "ll.challenges";

// Date locale « AAAA-MM-JJ » (le fuseau du joueur pilote les défis).
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function loadChallenges() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
export function saveChallenges(st) {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* stockage indisponible */ }
}

// État du jour courant (créé et persisté à la première lecture du jour).
export function currentChallenges() {
  const prev = loadChallenges();
  const st = dailyFor(localDate(), prev);
  if (st !== prev) saveChallenges(st);
  return st;
}

// Appelé en fin de match (Arène ou Manager, solo ou en ligne) avec le résultat normalisé.
export function recordMatchResult(match) {
  const st = applyMatch(currentChallenges(), match);
  if (st) saveChallenges(st);
  return st;
}

export { streakOf };
