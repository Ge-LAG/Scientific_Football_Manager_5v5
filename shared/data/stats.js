// Caractéristiques libres : chaque scientifique dispose du MÊME budget de points, que le joueur répartit
// à sa guise (sauvegardé sur son appareil et son compte). Profil par défaut = « forme » des stats d'origine
// (prototype) ramenée au budget commun. Isomorphe : serveur (validation), salles, moteurs, interface.

export const STAT_KEYS = Object.freeze(["Finition", "Tacle", "Dribble", "Endurance", "Force", "Vitesse", "Vision", "Sang-froid", "Réflexes"]);
export const STAT_BUDGET = 612;   // 68 de moyenne (moyenne des totaux d'origine ≈ 610)
export const STAT_MIN = 25;
export const STAT_MAX = 95;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Ajuste une répartition réelle au budget exact en entiers bornés (plus grands restes d'abord).
export function fitToBudget(values, budget = STAT_BUDGET) {
  let v = values.map(x => clamp(Number.isFinite(x) ? x : STAT_MIN, STAT_MIN, STAT_MAX));
  // mise à l'échelle itérative (les bornes peuvent absorber une partie de l'écart)
  for (let it = 0; it < 8; it++) {
    const sum = v.reduce((s, x) => s + x, 0); const diff = budget - sum;
    if (Math.abs(diff) < 0.5) break;
    const free = v.map(x => (diff > 0 ? STAT_MAX - x : x - STAT_MIN));
    const room = free.reduce((s, x) => s + x, 0); if (room <= 0) break;
    v = v.map((x, i) => clamp(x + diff * (free[i] / room), STAT_MIN, STAT_MAX));
  }
  const out = v.map(Math.floor);
  let rest = budget - out.reduce((s, x) => s + x, 0);
  const order = v.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest !== 0 && k < 200; k++) {
    const i = order[k % order.length][1];
    if (rest > 0 && out[i] < STAT_MAX) { out[i]++; rest--; } else if (rest < 0 && out[i] > STAT_MIN) { out[i]--; rest++; }
  }
  return out;
}

// Profil par défaut d'un scientifique à partir de ses caractéristiques d'origine (objet { stat: valeur }).
export function scaledProfile(orig) {
  const vals = STAT_KEYS.map(k => orig?.[k] ?? 60);
  const sum = vals.reduce((s, x) => s + x, 0) || 1;
  const fitted = fitToBudget(vals.map(x => x * STAT_BUDGET / sum));
  return Object.fromEntries(STAT_KEYS.map((k, i) => [k, fitted[i]]));
}

// Répartition valide : 9 entiers dans les bornes, total exactement égal au budget.
export function isValidStats(obj) {
  try {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    let sum = 0;
    for (const k of STAT_KEYS) {
      const v = Object.hasOwn(obj, k) ? obj[k] : undefined;
      if (!Number.isInteger(v) || v < STAT_MIN || v > STAT_MAX) return false;
      sum += v;
    }
    return sum === STAT_BUDGET;
  } catch { return false; }
}

// Répartition fournie par un client : valeurs lues avec précaution ; invalide → null (profil par défaut appliqué).
export function cleanStats(obj) {
  if (!isValidStats(obj)) return null;
  return Object.fromEntries(STAT_KEYS.map(k => [k, obj[k]]));
}

export const statsTotal = obj => STAT_KEYS.reduce((s, k) => s + (obj?.[k] || 0), 0);
