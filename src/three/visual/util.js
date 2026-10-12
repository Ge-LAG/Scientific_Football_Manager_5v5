// Utilitaires partagés de la couche visuelle (textures générées, couleurs, aléatoire).
import * as THREE from "three";

export const NEON = {
  cyan: "#00F0FF", magenta: "#FF00E5", lime: "#B8FF00", coral: "#FF3366",
  violet: "#8B5CF6", gold: "#FFD700", bg: "#050508",
};

export const normQuality = q => (q === "low" || q === "medium" ? q : "high");

// Générateur pseudo-aléatoire déterministe (mulberry32)
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

export function canvasTexture(canvas, { srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Cache global (géométries/textures partagées entre instances)
const CACHE = new Map();
export function cached(key, fn) {
  let v = CACHE.get(key);
  if (v === undefined) {
    v = fn();
    if (v && v.userData) v.userData.shared = true;
    CACHE.set(key, v);
  }
  return v;
}

// Luminance perçue (0..1) d'une couleur hex
export function luminance(hex) {
  const c = new THREE.Color(hex);
  const r = Math.pow(c.r, 1 / 2.2), g = Math.pow(c.g, 1 / 2.2), b = Math.pow(c.b, 1 / 2.2);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Halo radial doux (blanc -> transparent)
export function glowTexture() {
  return cached("tex:glow", () => {
    const c = makeCanvas(128, 128), g = c.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,255,255,0.75)");
    gr.addColorStop(0.55, "rgba(255,255,255,0.2)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return canvasTexture(c);
  });
}

// Ombre ronde (noir -> transparent)
export function shadowTexture() {
  return cached("tex:shadow", () => {
    const c = makeCanvas(128, 128), g = c.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(0,0,0,0.85)");
    gr.addColorStop(0.5, "rgba(0,0,0,0.45)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return canvasTexture(c, { srgb: false });
  });
}

// Anneau lumineux (onde de choc / aura au sol)
export function ringTexture() {
  return cached("tex:ring", () => {
    const c = makeCanvas(256, 256), g = c.getContext("2d");
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.55, "rgba(255,255,255,0.08)");
    gr.addColorStop(0.82, "rgba(255,255,255,0.55)");
    gr.addColorStop(0.9, "rgba(255,255,255,1)");
    gr.addColorStop(0.96, "rgba(255,255,255,0.35)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return canvasTexture(c);
  });
}

// Colonne de lumière : stries verticales + fondu vers le haut
export function beamTexture() {
  return cached("tex:beam", () => {
    const W = 128, H = 128, c = makeCanvas(W, H), g = c.getContext("2d");
    const r = rng(7);
    for (let x = 0; x < W; x++) {
      const v = 0.25 + 0.75 * Math.pow(r(), 3);
      for (let y = 0; y < H; y++) {
        const f = Math.pow(1 - y / H, 1.6) * (y > H - 3 ? 0 : 1);
        const a = v * (1 - y / H) * f;
        g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        g.fillRect(x, H - 1 - y, 1, 1);
      }
    }
    const t = canvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}

// Dégradé vertical simple (cône de projecteur, panneaux)
export function fadeTexture() {
  return cached("tex:fade", () => {
    const c = makeCanvas(4, 128), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.6, "rgba(255,255,255,0.35)");
    gr.addColorStop(1, "rgba(255,255,255,1)");
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
    return canvasTexture(c);
  });
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// Libère récursivement géométries / matériaux / textures non partagés (userData.shared ignoré)
const isShared = o => !!(o && o.userData && o.userData.shared);
export function markShared(o) { if (o && o.userData) o.userData.shared = true; return o; }
export function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry && !isShared(o.geometry)) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (isShared(m)) continue;
      for (const k of ["map", "emissiveMap", "alphaMap"]) {
        const t = m[k];
        if (t && !isShared(t)) t.dispose();
      }
      m.dispose();
    }
  });
}
