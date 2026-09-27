// Profil de jeu d'un client (apparences et sélections de power-ups de SES scientifiques).
// Toujours nettoyé : seules les clés des 16 personnages et des valeurs valides sont conservées.
import { PLAYERS, sanitizeLoadouts } from "./data/content.js";
import { sanitizeAppearance } from "./data/appearance.js";

export function sanitizeLooks(obj) {
  const out = Object.create(null);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const p of PLAYERS) if (Object.hasOwn(obj, p.id)) out[p.id] = sanitizeAppearance(obj[p.id], p.id);
  return out;
}

export function sanitizeProfile(msg) {
  return { looks: sanitizeLooks(msg?.looks), loadouts: sanitizeLoadouts(msg?.loadouts) };
}

// Objet ordinaire (sérialisable) à partir d'une table sans prototype.
export const plain = t => Object.fromEntries(Object.entries(t || {}));
