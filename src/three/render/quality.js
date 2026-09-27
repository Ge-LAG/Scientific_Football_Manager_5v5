// Niveaux de qualité graphique + gestionnaire adaptatif (baisse vite, remonte prudemment) + détection GPU.
// Aucun import three : utilisable partout (stade, effets, page de banc d'essai).

export const QUALITY_LEVELS = ["low", "medium", "high", "ultra"];
const SCALES = [1, 0.85, 0.72, 0.6]; // échelles de résolution après le niveau « low »

// Normalise un niveau (accepte ultra) ; défaut « high » comme le reste de la couche visuelle
export const normLevel = q => (QUALITY_LEVELS.includes(q) ? q : "high");
export const levelIndex = q => QUALITY_LEVELS.indexOf(normLevel(q));
export const atLeast = (q, min) => levelIndex(q) >= levelIndex(min);

/**
 * Gestionnaire de qualité adaptatif.
 * @param {object} o
 * @param {string} [o.initial="high"]  niveau de départ
 * @param {string} [o.max]             plafond (défaut = initial : on ne dépasse jamais le choix du joueur)
 * @param {(s:{level:string, scale:number, reason:string})=>void} [o.onChange]
 * @param {number} [o.downFps=50]  moyenne sous laquelle on baisse (fenêtre downWindow)
 * @param {number} [o.upFps=58]    seuil à tenir sur toute la fenêtre upWindow pour remonter
 * @param {number} [o.downWindow=2] s
 * @param {number} [o.upWindow=6]   s (doublé à chaque échec déjà constaté sur le niveau visé)
 * @param {number} [o.minScale=0.6]
 */
export function createQualityManager({
  initial = "high", max, onChange, downFps = 50, upFps = 58, downWindow = 2, upWindow = 6, minScale = 0.6,
} = {}) {
  let li = levelIndex(initial), ceil = Math.max(li, levelIndex(max || initial));
  let si = 0, locked = null;
  const scales = SCALES.filter(s => s >= minScale - 1e-6);
  const fails = new Array(QUALITY_LEVELS.length).fill(0);
  // mesures : seaux de 0,5 s
  const BUCKET = 0.5;
  let bT = 0, bN = 0, cooldown = 0.8, goodT = 0, lastT = 0;
  const hist = []; // { t, n } des derniers seaux (≈ downWindow)
  let fpsAvg = 0;

  const state = () => ({ level: QUALITY_LEVELS[li], scale: scales[si] });
  function emit(reason) { const s = state(); onChange?.({ ...s, reason }); }
  function resetStats(cd = 1) { bT = 0; bN = 0; hist.length = 0; goodT = 0; cooldown = cd; }

  function stepDown() {
    if (li > 0) { fails[li]++; li--; }
    else if (si < scales.length - 1) si++;
    else return false;
    resetStats(1.2); emit("down"); return true;
  }
  function stepUp() {
    if (si > 0) si--;
    else if (li < ceil) li++;
    else return false;
    resetStats(1.2); emit("up"); return true;
  }

  /** À appeler une fois par image (dt en secondes ; mesure l'horloge réelle si dt absent). */
  function sample(dt) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!(dt > 0)) dt = lastT ? (now - lastT) / 1000 : 0;
    lastT = now;
    if (!(dt > 0)) return;
    if (dt > 0.5) { bT = 0; bN = 0; return; } // onglet masqué / gel : on ignore
    if (cooldown > 0) { cooldown -= dt; return; } // compilation de shaders après un changement
    bT += dt; bN++;
    if (bT < BUCKET) return;
    const bf = bN / bT;
    hist.push({ t: bT, n: bN });
    let tt = 0, nn = 0;
    for (const h of hist) { tt += h.t; nn += h.n; }
    while (hist.length > 1 && tt - hist[0].t >= downWindow) { tt -= hist[0].t; nn -= hist[0].n; hist.shift(); }
    fpsAvg = nn / tt;
    bT = 0; bN = 0;
    if (locked) return;
    if (tt >= downWindow - 1e-3 && fpsAvg < downFps) { stepDown(); return; }
    goodT = bf > upFps ? goodT + BUCKET : 0;
    const target = si > 0 ? li : li + 1;
    const need = upWindow * Math.min(4, 1 + (si > 0 ? 0 : fails[target] || 0));
    if (goodT >= need) stepUp();
  }

  /** Verrouille un niveau (échelle 1) ou reprend l'adaptation avec null. */
  function lock(level) {
    if (level == null) { locked = null; resetStats(0.5); return; }
    locked = normLevel(level);
    const changed = QUALITY_LEVELS[li] !== locked || si !== 0;
    li = levelIndex(locked); si = 0;
    resetStats(0.5);
    if (changed) emit("lock");
  }

  /** Change le plafond (ex. réglage joueur modifié) ; redescend si besoin. */
  function setMax(level) {
    ceil = levelIndex(level);
    if (li > ceil) { li = ceil; si = 0; resetStats(0.8); emit("max"); }
  }

  return {
    sample, lock, setMax,
    reset: () => { fails.fill(0); resetStats(0.5); },
    get level() { return QUALITY_LEVELS[li]; },
    get scale() { return scales[si]; },
    get fps() { return fpsAvg; },
    get locked() { return locked; },
    get max() { return QUALITY_LEVELS[ceil]; },
  };
}

// ───────────────────────── Détection du matériel ─────────────────────────

const RX = {
  software: /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|microsoft basic|mesa offscreen|gdi generic/,
  discrete: /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|rx ?\d{3,4}|arc\(tm\)? ?[ab]\d|arc [ab]\d|firepro|radeon r9|radeon hd [78]\d{3}/,
  integrated: /intel|uhd|iris|hd graphics|mali|adreno|powervr|videocore|apple gpu|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|radeon \d{3}m|tegra/,
  appleSilicon: /apple m\d/,
  highEnd: /rtx ?(20[78]0|30[6-9]0|40[6-9]0|50[6-9]0)|rx ?(6[789]\d0|7[6-9]\d0|90[67]0)|apple m\d (pro|max|ultra)/,
};

/** Informations GPU / appareil (chaînes brutes + classement). */
export function getGpuInfo(renderer) {
  let vendor = "", name = "";
  try {
    const gl = renderer?.getContext?.();
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) { vendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || ""); name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || ""); }
      if (!name) name = String(gl.getParameter(gl.RENDERER) || "");
      if (!vendor) vendor = String(gl.getParameter(gl.VENDOR) || "");
    }
  } catch { /* extension indisponible */ }
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const ua = String(nav.userAgent || "");
  const s = `${name} ${vendor}`.toLowerCase();
  const mobile = /mobi|android|iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && (nav.maxTouchPoints || 0) > 1);
  const software = RX.software.test(s);
  const appleSilicon = RX.appleSilicon.test(s);
  const discrete = !software && (RX.discrete.test(s) || appleSilicon);
  const integrated = !software && !discrete && RX.integrated.test(s);
  return {
    name, vendor, mobile, software, discrete, integrated, appleSilicon,
    highEnd: discrete && RX.highEnd.test(s),
    memory: nav.deviceMemory || null, // Go (Chrome seulement, plafonné à 8)
    cores: nav.hardwareConcurrency || null,
  };
}

/** Niveau de départ conseillé : logiciel → low, intégré → medium/low, dédié → high (ultra si très haut de gamme). */
export function detectInitialQuality(renderer) {
  const g = getGpuInfo(renderer);
  const mem = g.memory ?? 8, cores = g.cores ?? 4;
  let q;
  if (g.software) q = "low";
  else if (g.mobile) q = /adreno \(tm\) [6-9]\d\d|apple gpu|mali-g7\d|mali-g[6-9]\d\d|immortalis/i.test(g.name) && mem >= 4 ? "medium" : "low";
  else if (g.discrete) q = g.highEnd && cores >= 8 && mem >= 8 ? "ultra" : "high";
  else if (g.integrated) q = mem <= 4 || cores <= 4 ? "low" : "medium";
  else q = "medium";
  if (mem <= 2 || cores <= 2) q = "low";
  return q;
}
