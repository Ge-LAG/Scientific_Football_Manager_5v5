// Visage adulte paramétrique : crâne déformé selon la forme du visage (mâchoire, menton, pommettes, arcades),
// yeux à paupières (forme d'œil + expression), sourcils, nez, oreilles, bouches et pilosité faciale.
// Tout est construit relativement au centre de la tête C (repère tête : +Z devant, +X gauche du joueur).
import * as THREE from "three";
import { sweep, ell, sg, V3, smoothstep, lerp, orient, subdivide, flatShape, ellipseShape, arcRibbon, clamp } from "./kit.js";

const TAU = Math.PI * 2;
export const HEAD_E = Object.freeze(V3(0.15, 0.158, 0.146)); // = M.E (ellipsoïde de base, couvre-chefs)
const bell = (x, c, w) => { const t = (x - c) / w; return Math.exp(-t * t); };

// ════════════════════════ Formes de visage ════════════════════════
// sq : mâchoire carrée (angles et bas du visage plus larges, <0 = en V) ; slim : joues affinées ; chin : largeur du menton ;
// fwd : menton en avant (m) ; len : longueur du bas du visage ; gon : angle de la mâchoire (profil) ;
// cheek : pommettes ; hollow : joues creuses (<0 = pleines) ; fore : largeur du front ; brow : arcades ; cleft : fossette
export const FACES = {
  oval:     { sq: 0.05, slim: 0.08, chin: 1.0, fwd: 0.004, len: 1.03, gon: 1.0, cheek: 1.0, hollow: 0.5, fore: 1.0, brow: 1.0, cleft: 0 },
  square:   { sq: 0.3, slim: 0.05, chin: 1.35, fwd: 0.005, len: 1.0, gon: 1.1, cheek: 0.85, hollow: 0.3, fore: 1.02, brow: 1.15, cleft: 0 },
  round:    { sq: 0.12, slim: -0.03, chin: 1.12, fwd: 0.0, len: 0.95, gon: 1.06, cheek: 0.55, hollow: -1.0, fore: 1.02, brow: 0.8, cleft: 0 },
  long:     { sq: 0.02, slim: 0.11, chin: 1.0, fwd: 0.006, len: 1.14, gon: 0.96, cheek: 0.9, hollow: 0.9, fore: 0.96, brow: 1.0, cleft: 0 },
  diamond:  { sq: -0.12, slim: 0.08, chin: 0.78, fwd: 0.006, len: 1.06, gon: 0.94, cheek: 1.9, hollow: 1.0, fore: 0.9, brow: 1.0, cleft: 0 },
  heart:    { sq: -0.17, slim: 0.06, chin: 0.7, fwd: 0.008, len: 1.03, gon: 0.93, cheek: 1.2, hollow: 0.6, fore: 1.06, brow: 0.95, cleft: 0 },
  chiseled: { sq: 0.24, slim: 0.12, chin: 1.3, fwd: 0.011, len: 1.1, gon: 1.1, cheek: 1.5, hollow: 1.3, fore: 1.0, brow: 1.35, cleft: 1 },
  triangle: { sq: 0.38, slim: 0.0, chin: 1.22, fwd: 0.004, len: 1.0, gon: 1.14, cheek: 0.75, hollow: 0.1, fore: 0.9, brow: 1.0, cleft: 0 },
};

// Profil latéral du bas de la tête (angle depuis l'avant vers le bas puis l'arrière -> rayon) :
// menton en avant, dessous de mâchoire remontant vers l'angle, nuque dégagée pour le cou
const PA = [0, 0.45, 0.85, 1.08, 1.3, 1.57, 1.85, 2.17, 2.45, 2.75, Math.PI];
const PR = [0.146, 0.15, 0.176, 0.19, 0.166, 0.138, 0.12, 0.128, 0.134, 0.143, 0.146];
function profileFn(F) {
  const R = PR.slice();
  const ln = [0, 0.5, 1, 1, 1, 0.7, 0.3, 0, 0, 0, 0];
  for (let i = 0; i < R.length; i++) R[i] *= 1 + (F.len - 1) * ln[i];
  R[2] += F.fwd * 0.6; R[3] += F.fwd; R[4] += F.fwd * 0.4;
  R[6] *= F.gon; R[5] *= 1 + (F.gon - 1) * 0.4;
  const m = R.map((r, i) => (i === 0 || i === R.length - 1 ? 0 : (R[i + 1] - R[i - 1]) / (PA[i + 1] - PA[i - 1])));
  return a => {
    let i = 0;
    while (i < PA.length - 2 && a > PA[i + 1]) i++;
    const h = PA[i + 1] - PA[i], t = clamp((a - PA[i]) / h, 0, 1), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * R[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * R[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// Déformation d'un point de l'ellipsoïde de base (modifié en place)
function deformer(F, E) {
  const prof = profileFn(F);
  return v => {
    const nx = v.x / E.x, ny = v.y / E.y, nz = v.z / E.z, ax = Math.abs(nx), sx = nx < 0 ? -1 : 1;
    const front = smoothstep(-0.1, 0.6, nz), face = smoothstep(0.5, 0.9, nz);
    let x = v.x * 0.935, y = v.y, z = v.z;
    // crâne légèrement « carré » (côtés et front plus plats) au-dessus de la mâchoire
    { const b = Math.atan2(nx, nz), q = 2.4, rh = Math.pow(Math.pow(Math.abs(Math.cos(b)), q) + Math.pow(Math.abs(Math.sin(b)), q), -1 / q), w = smoothstep(-0.5, -0.1, ny) * (1 - smoothstep(0.7, 1, ny));
      const k = lerp(1, rh, w); x *= k; z *= k; }
    // arrière du crâne plus profond (occiput), front moins bombé, arcades sourcilières
    z -= 0.012 * smoothstep(-0.2, -0.85, nz) * bell(ny, 0.12, 0.5);
    z -= 0.010 * face * smoothstep(0.4, 0.8, ny);
    z += 0.013 * F.brow * face * bell(ny, 0.3, 0.1) * (1 - smoothstep(0.45, 0.75, ax));
    // tempes resserrées, largeur du front
    x -= sx * 0.005 * bell(ny, 0.28, 0.22) * front;
    x *= 1 + (F.fore - 1) * smoothstep(0.0, 0.4, ny) * (1 - smoothstep(0.75, 1, ny)) * front;
    // orbites (les yeux s'y logent sous l'arcade)
    z -= 0.013 * bell(ax, 0.37, 0.19) * bell(ny, 0.03, 0.13) * face;
    // arête du nez entre les yeux
    z += 0.005 * face * bell(nx, 0, 0.12) * bell(ny, 0.12, 0.12);
    // pommettes saillantes
    const cb = bell(ax, 0.68, 0.2) * bell(ny, -0.14, 0.13) * front;
    x += sx * 0.008 * F.cheek * cb; z += 0.006 * F.cheek * cb;
    // joues creuses (ou pleines)
    const ch = bell(ax, 0.56, 0.2) * bell(ny, -0.48, 0.17) * front;
    x -= sx * 0.004 * F.hollow * ch; z -= 0.006 * F.hollow * ch;
    // museau (bouche) légèrement en avant
    z += 0.007 * face * bell(nx, 0, 0.32) * bell(ny, -0.48, 0.22);
    if (ny < 0) {
      // largeur de la mâchoire (super-ellipse) et du menton
      // joues affinées, angles de mâchoire et bas du visage élargis (carré) ou resserrés (en V)
      x *= (1 - F.slim * bell(ny, -0.42, 0.24)) * (1 + F.sq * smoothstep(-0.45, -0.88, ny) + F.sq * 0.5 * smoothstep(-0.86, -0.99, ny));
      x *= lerp(1, F.chin, smoothstep(-0.5, -0.9, ny) * front);
      // profil : menton, dessous de mâchoire, nuque
      const a = Math.atan2(-y, z), re = 1 / Math.sqrt((Math.cos(a) / E.z) ** 2 + (Math.sin(a) / E.y) ** 2), f = prof(a) / re;
      y *= f; z *= f;
      if (F.cleft) z -= 0.0035 * F.cleft * bell(nx, 0, 0.05) * bell(ny, -0.84, 0.09) * face;
    }
    v.set(x, y, z);
  };
}

// Modèle de tête : surface déformée interrogeable (point + normale) — mis en cache par forme de visage
const MODELS = new Map();
export function headModel(faceShape) {
  const key = FACES[faceShape] ? faceShape : "oval";
  let H = MODELS.get(key);
  if (H) return H;
  const F = FACES[key], E = HEAD_E, D = deformer(F, E);
  const map = u => {
    const k = 1 / Math.sqrt((u.x / E.x) ** 2 + (u.y / E.y) ** 2 + (u.z / E.z) ** 2);
    const v = V3(u.x * k, u.y * k, u.z * k);
    D(v);
    return v;
  };
  const t1 = V3(), t2 = V3(), up = V3(0, 1, 0), side = V3(1, 0, 0);
  // Point de surface dans la direction u (espace de l'ellipsoïde de base) + normale ; lift : décalage le long de la normale
  function P(u0, lift = 0) {
    const u = u0.clone().normalize(), p = map(u);
    t1.crossVectors(Math.abs(u.y) < 0.95 ? up : side, u).normalize(); t2.crossVectors(u, t1).normalize();
    const h = 0.006;
    const dx = map(u.clone().addScaledVector(t1, h)).sub(map(u.clone().addScaledVector(t1, -h)));
    const dy = map(u.clone().addScaledVector(t2, h)).sub(map(u.clone().addScaledVector(t2, -h)));
    const n = V3().crossVectors(dx, dy).normalize();
    if (n.dot(p) < 0) n.negate();
    if (lift) p.addScaledVector(n, lift);
    return { p, n };
  }
  // θ : azimut (0 = devant, + vers +X), φ : latitude
  const dir = (th, ph) => V3(Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph));
  const sph = (th, ph, lift = 0) => P(dir(th, ph), lift);
  // Projection frontale : (x, y) sur l'ellipsoïde de base, face avant
  const front = (x, y, lift = 0) => {
    const nx = clamp(x / E.x, -0.999, 0.999), ny = clamp(y / E.y, -0.999, 0.999), nz = Math.sqrt(Math.max(1e-4, 1 - nx * nx - ny * ny));
    return P(V3(nx * E.x, ny * E.y, nz * E.z), lift);
  };
  H = { key, F, E, P, sph, front, dir };
  MODELS.set(key, H);
  return H;
}

// Grille paramétrique générique : fn(i, j) -> { p, t? } ; (nu+1) x (nv+1) sommets
export function paramGrid(nu, nv, fn) {
  const pos = [], tone = [], idx = [];
  let hasT = false;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const r = fn(i, j);
    pos.push(r.p.x, r.p.y, r.p.z); tone.push(r.t || 0);
    if (r.t) hasT = true;
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (hasT) g.setAttribute("tone", new THREE.Float32BufferAttribute(tone, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Grille (θ, φ) sur la tête : f(θ, φ) -> { lift, t } ; les zones à lift < 0 passent sous la peau (bords doux)
export function headGrid(H, th0, th1, ph0, ph1, nu, nv, f) {
  return paramGrid(nu, nv, (i, j) => {
    const th = lerp(th0, th1, i / nu), ph = lerp(ph0, ph1, j / nv), r = f(th, ph);
    return { p: H.sph(th, ph, r.lift).p, t: r.t };
  });
}

// Surface masquée sur la tête (barbes, calottes de cheveux) : grille (θ, φ) raffinée là où le masque varie
// (bords nets et lisses sans sur-tesseller), triangles entièrement hors masque supprimés.
// f(θ, φ) -> { m: couverture 0..1, lift, t } ; levels : niveaux de raffinement des bords
export function maskedSurface(H, th0, th1, ph0, ph1, nu, nv, f, levels = 2, split = 0.1) {
  const V = [], R = [], map = new Map();
  const vid = (th, ph) => {
    const k = Math.round(th * 1e5) + "," + Math.round(ph * 1e5);
    let i = map.get(k);
    if (i === undefined) { i = R.length; V.push(th, ph); R.push(f(th, ph)); map.set(k, i); }
    return i;
  };
  let tris = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const t0 = lerp(th0, th1, i / nu), t1 = lerp(th0, th1, (i + 1) / nu), p0 = lerp(ph0, ph1, j / nv), p1 = lerp(ph0, ph1, (j + 1) / nv);
    const a = vid(t0, p0), b = vid(t1, p0), c = vid(t0, p1), dd = vid(t1, p1);
    tris.push([a, b, c], [b, dd, c]);
  }
  const ek = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
  for (let l = 0; l < levels; l++) {
    const cut = new Set(), mids = new Map();
    for (const t of tris) for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3], ma = R[a].m, mb = R[b].m;
      if (Math.abs(ma - mb) > split && Math.max(ma, mb) > 0.02) cut.add(ek(a, b));
    }
    if (!cut.size) break;
    const mid = (a, b) => { const k = ek(a, b); let m = mids.get(k); if (m === undefined) { m = vid((V[a * 2] + V[b * 2]) / 2, (V[a * 2 + 1] + V[b * 2 + 1]) / 2); mids.set(k, m); } return m; };
    const out = [];
    for (const t of tris) {
      const s0 = cut.has(ek(t[0], t[1])), s1 = cut.has(ek(t[1], t[2])), s2 = cut.has(ek(t[2], t[0])), n = s0 + s1 + s2;
      if (!n) { out.push(t); continue; }
      if (n === 3) { const [a, b, c] = t, ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); out.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); continue; }
      // rotation : l'arête non coupée (n = 2) ou coupée (n = 1) devient (a, b)
      let r = n === 2 ? (!s0 ? 0 : !s1 ? 1 : 2) : (s0 ? 0 : s1 ? 1 : 2);
      const a = t[r], b = t[(r + 1) % 3], c = t[(r + 2) % 3];
      if (n === 1) { const ab = mid(a, b); out.push([a, ab, c], [ab, b, c]); }
      else { const bc = mid(b, c), ca = mid(c, a); out.push([a, b, bc], [a, bc, ca], [ca, bc, c]); }
    }
    tris = out;
  }
  tris = tris.filter(t => R[t[0]].m > 0.01 || R[t[1]].m > 0.01 || R[t[2]].m > 0.01);
  const used = new Map(), pos = [], tone = [], idx = [];
  let hasT = false;
  for (const t of tris) for (const v of t) {
    let k = used.get(v);
    if (k === undefined) {
      k = used.size; used.set(v, k);
      const r = R[v], p = H.sph(V[v * 2], V[v * 2 + 1], r.lift).p;
      pos.push(p.x, p.y, p.z); tone.push(r.t || 0); if (r.t) hasT = true;
    }
    idx.push(k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (hasT) g.setAttribute("tone", new THREE.Float32BufferAttribute(tone, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Crâne : latitudes plus denses sur le visage
export function skullGeo(H, d) {
  const nu = sg(40, d), ph = [];
  const seg = (a, b, n) => { for (let i = 0; i < n; i++) ph.push(lerp(a, b, i / n)); };
  seg(-Math.PI / 2, -1.2, Math.max(2, sg(3, d))); seg(-1.2, 0.62, sg(21, d)); seg(0.62, Math.PI / 2, sg(6, d)); ph.push(Math.PI / 2);
  return paramGrid(nu, ph.length - 1, (i, j) => ({ p: H.sph(-Math.PI + (i / nu) * TAU, ph[j]).p }));
}

// ════════════════════════ Oreilles ════════════════════════
export function earGeos(H, d, s) {
  const a = H.P(V3(s * 1, -0.1, -0.02)), c = a.p.clone().addScaledVector(a.n, 0.0055);
  // oreille évasée (bord arrière écarté du crâne) et inclinée vers l'arrière
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, -s * 0.34, 0));
  const L = (x, y, z) => V3(x, y, z).applyQuaternion(q).add(c);
  const tr = g => { g.applyQuaternion(q); g.translate(c.x, c.y, c.z); return g; };
  const k = 1.28;
  const shell = tr(ell(0.0075, 0.031 * k, 0.019 * k, d, 10, 8).translate(s * 0.002, 0, -0.004 * k));
  const rim = [[0.004, 0.022, 0.005], [0.006, 0.03, -0.005], [0.007, 0.024, -0.017], [0.007, 0.006, -0.022], [0.006, -0.012, -0.019], [0.004, -0.026, -0.01]]
    .map(([x, y, z]) => L(s * x, y * k, z * k));
  const helix = sweep(rim, [0.0034, 0.0044, 0.005, 0.005, 0.0045, 0.0036], sg(6, d));
  const lobe = tr(ell(0.0062, 0.0095, 0.0082, d, 8, 6).translate(s * 0.002, -0.028 * k, -0.006 * k));
  const inner = tr(ell(0.0035, 0.015 * k, 0.009 * k, d, 8, 6).translate(s * 0.0068, 0.001, -0.007 * k));
  return { skin: [shell, helix, lobe], inner };
}

// ════════════════════════ Nez ════════════════════════
// tip : hauteur de la pointe ; proj : avancée ; bw/tw : demi-largeurs arête/pointe ; hump : bosse (hy = position) ;
// tilt : pointe relevée (+) ou tombante (-) ; crook : déviation latérale ; ala : ailes ; flat : arête écrasée
export const NOSES = {
  straight: { tip: -0.04, proj: 0.031, bw: 0.0085, tw: 0.0135, hump: 0, hy: 0.5, tilt: 0, crook: 0, ala: 1, flat: 0 },
  broad:    { tip: -0.039, proj: 0.028, bw: 0.012, tw: 0.019, hump: 0, hy: 0.5, tilt: 0.001, crook: 0, ala: 1.4, flat: 0.2 },
  aquiline: { tip: -0.044, proj: 0.035, bw: 0.0085, tw: 0.0118, hump: 0.0055, hy: 0.42, tilt: -0.005, crook: 0, ala: 0.95, flat: 0 },
  button:   { tip: -0.034, proj: 0.025, bw: 0.0072, tw: 0.0132, hump: 0, hy: 0.5, tilt: 0.006, crook: 0, ala: 1.05, flat: 0.35 },
  boxer:    { tip: -0.038, proj: 0.027, bw: 0.0125, tw: 0.0175, hump: 0.002, hy: 0.2, tilt: 0.001, crook: 0.0045, ala: 1.25, flat: 0.9 },
  roman:    { tip: -0.044, proj: 0.036, bw: 0.0095, tw: 0.013, hump: 0.0045, hy: 0.25, tilt: -0.002, crook: 0, ala: 1.05, flat: 0 },
  pointed:  { tip: -0.041, proj: 0.037, bw: 0.0068, tw: 0.0092, hump: 0.001, hy: 0.55, tilt: 0.002, crook: 0, ala: 0.85, flat: 0 },
};
export function noseGeos(H, d, type) {
  const N = NOSES[type] || NOSES.straight, yr = 0.034;
  const fz = y => H.front(0, y).p.z, fy = y => H.front(0, y).p.y;
  // anneaux verticaux : [y, avancée, demi-largeur]
  const L = [];
  const nb = 7;
  for (let i = 0; i <= nb; i++) {
    const t = i / nb, y = lerp(yr, N.tip, t);
    const pr = N.proj * Math.pow(t, 1.15) + N.hump * bell(t, N.hy, 0.2) - N.flat * 0.006 * bell(t, 0.42, 0.22) + (t > 0.8 ? N.tilt * 0.4 * (t - 0.8) / 0.2 : 0);
    L.push([y + (t > 0.85 ? N.tilt * 0.5 * (t - 0.85) / 0.15 : 0), Math.max(0.001, pr), lerp(N.bw, N.tw * 0.86, Math.pow(t, 1.6)), N.crook * Math.sin(Math.PI * t) * (t < 0.6 ? 1 : -0.4)]);
  }
  const ty = L[L.length - 1][0];
  L.push([ty - 0.0055 + N.tilt * 0.5, N.proj * 0.86, N.tw * 0.97, 0]);
  L.push([ty - 0.0105 + N.tilt * 0.8, N.proj * 0.5, N.tw * 0.72, 0]);
  L.push([ty - 0.0135 + N.tilt * 0.6, 0.004, N.tw * 0.45, 0]);
  const back = 0.006, seg = sg(12, d);
  const list = L.slice().reverse().map(([y, pr, rx, cx]) => {
    const z0 = fz(y) - back, rz = (pr + back) / 2;
    return { y: fy(y), rx, rz, x: cx, z: z0 + rz };
  });
  // anneaux (bas -> haut), fermés
  const pos = [], idx = [], cols = seg + 1;
  // section en coin : arête étroite devant, large là où le nez rejoint le visage
  for (const r of list) for (let j = 0; j <= seg; j++) { const a = (j / seg) * TAU, w = lerp(0.5, 1.3, (1 - Math.cos(a)) / 2); pos.push(r.x + r.rx * w * Math.sin(a), r.y, r.z + r.rz * Math.cos(a)); }
  for (let i = 0; i < list.length - 1; i++) for (let j = 0; j < seg; j++) { const a = i * cols + j, b = a + 1, c = a + cols, dd = c + 1; idx.push(a, b, c, b, dd, c); }
  const addCap = (ri, top) => { const r = list[ri], ci = pos.length / 3; pos.push(r.x, r.y + (top ? 0.002 : -0.002), r.z); for (let j = 0; j < seg; j++) { const a = ri * cols + j; top ? idx.push(ci, a, a + 1) : idx.push(ci, a + 1, a); } };
  addCap(0, false); addCap(list.length - 1, true);
  const bridge = new THREE.BufferGeometry();
  bridge.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); bridge.setIndex(idx); bridge.computeVertexNormals();
  // ailes du nez + narines
  const tipY = fy(N.tip), tipZ = fz(N.tip);
  const alae = [1, -1].map(s => ell(0.0044 * N.ala, 0.0058, 0.0072, d, 10, 8).rotateY(s * 0.5).translate(s * (N.tw * 0.92 + 0.0012) * (0.82 + 0.18 * N.ala), tipY - 0.0078 + N.tilt * 0.6, tipZ + N.proj * 0.12));
  const nostrils = [1, -1].map(s => ell(0.003 * (0.8 + 0.2 * N.ala), 0.0011, 0.0042, d, 8, 4).rotateX(-0.35).rotateY(-s * 0.35).translate(s * 0.0056 * (0.8 + 0.25 * N.ala), tipY - 0.0118 + N.tilt * 0.8, tipZ + N.proj * 0.42));
  return { skin: [bridge, ...alae], dark: nostrils };
}

// ════════════════════════ Yeux ════════════════════════
// w : demi-largeur ; up/lo : hauteur paupière sup./inf. ; tilt : coin externe (+ relevé) ; pk : pic de la paupière
// sep : écartement ; deep : enfoncement ; crease : pli ; hood : paupière tombante ; shadow : ombre d'arcade ; lash : trait
const EYE0 = { w: 0.0242, up: 0.0122, lo: 0.0074, tilt: 0.0018, pk: -0.1, sep: 0, deep: 0, crease: 0.8, hood: 0, shadow: 0.18, lash: 1.1, full: 0 };
export const EYES = {
  almond: { ...EYE0 },
  round: { ...EYE0, w: 0.0222, up: 0.0162, lo: 0.0118, tilt: 0.0002, pk: 0, crease: 0.7 },
  narrow: { ...EYE0, w: 0.0252, up: 0.0078, lo: 0.0048, tilt: 0.0012, pk: -0.04, crease: 0.55 },
  hooded: { ...EYE0, up: 0.0102, lo: 0.0068, tilt: 0.0006, crease: 0.05, hood: 1.6, shadow: 0.35 },
  deep_set: { ...EYE0, w: 0.0232, up: 0.0112, lo: 0.0068, tilt: 0.001, deep: 0.0022, crease: 0.35, shadow: 0.95, lash: 1.2 },
  droopy: { ...EYE0, up: 0.0116, lo: 0.0078, tilt: -0.0056, pk: -0.36 },
  upturned: { ...EYE0, up: 0.0114, lo: 0.0066, tilt: 0.006, pk: 0.1 },
  monolid: { ...EYE0, w: 0.0252, up: 0.0092, lo: 0.0062, tilt: 0.0034, pk: 0.08, crease: 0, full: 1.6, shadow: 0.05, lash: 1.3 },
  wide_set: { ...EYE0, sep: 0.0085 },
  close_set: { ...EYE0, sep: -0.0072 },
  intense: { ...EYE0, w: 0.0248, up: 0.0086, lo: 0.006, tilt: 0.0014, pk: 0.3, lash: 1.9, shadow: 0.6, crease: 0.45 },
};
// forme de la fente (u horizontal vers l'extérieur, v vertical), selon forme + expression
function eyeAperture(type, expr) {
  const Y = { ...(EYES[type] || EYES.almond) };
  if (expr === "happy") { Y.lo *= 0.3; Y.up *= 0.9; }
  else if (expr === "determined") { Y.up *= 0.74; Y.angry = 1; }
  else if (expr === "sleepy") { Y.up *= 0.46; Y.lo *= 0.9; }
  const a0u = clamp(0.5 + Y.pk * 0.5, 0.2, 0.8), gu = Math.log(0.5) / Math.log(a0u), gl = Math.log(0.5) / Math.log(0.56);
  const vin = -0.0006, vout = Y.tilt;
  const base = a => lerp(vin, vout, a);
  const upF = a => base(a) + Y.up * Math.pow(Math.sin(Math.PI * Math.pow(a, gu)), 0.75) - (Y.angry ? 0.0032 * (1 - a) * Math.sin(Math.PI * a) : 0);
  const loF = a => base(a) - Y.lo * Math.pow(Math.sin(Math.PI * Math.pow(a, gl)), 0.85) + (expr === "happy" ? 0.0022 * Math.sin(Math.PI * a) : 0);
  return { Y, upF, loF, base };
}
// Géométries d'un œil (côté s = +1 gauche / -1 droit) : { center, bone y, globe, iris, pupil, glint, lids (tone), lash, lower, caruncle }
export function eyeGeos(H, d, type, expr, s) {
  const { Y, upF, loF, base } = eyeAperture(type, expr);
  const ex = s * (0.054 + Y.sep), ey = 0.004;
  const zs = H.front(ex, ey).p.z;
  const re = Math.max(0.02, Y.w * 0.93), Rl = re + 0.0011;
  const C = V3(ex, H.front(ex, ey).p.y, zs + 0.0058 - re - Y.deep);
  // aperture 2D -> sphère des paupières (angles : u / R, v / R)
  const onBall = (u, v, R) => { const al = u / R, be = v / R; return V3(C.x + s * R * Math.sin(al) * Math.cos(be), C.y + R * Math.sin(be), C.z + R * Math.cos(al) * Math.cos(be)); };
  const onFace = (u, v, lift) => H.front(C.x + s * u, C.y + v, lift).p;
  const na = sg(12, d), rows = [0, 0.1, 0.24, 0.4, 0.58, 0.78, 1];
  const loop = []; // [a, isUpper]
  for (let i = 0; i <= na; i++) loop.push([i / na, 1]);
  for (let i = na - 1; i >= 1; i--) loop.push([i / na, 0]);
  const lidPos = [], lidTone = [], lidW = [], idx = [];
  const nl = loop.length;
  for (let r = 0; r < rows.length; r++) {
    const rr = rows[r];
    for (const [a, upper] of loop) {
      const u = lerp(-Y.w, Y.w, a), v = upper ? upF(a) : loF(a);
      const bump = Math.sin(Math.PI * a);
      const uo = u * 1.5, vo = upper ? base(a) * 1.3 + Y.up + 0.0125 * (0.55 + 0.45 * bump) : base(a) * 1.3 - Y.lo - 0.0105 * (0.5 + 0.5 * bump);
      let uu = lerp(u, uo, rr), vv = lerp(v, vo, rr);
      // pli de paupière tombante : recouvre le haut de la paupière mobile
      if (upper && Y.hood) vv -= 0.0028 * Y.hood * bell(rr, 0.26, 0.12) * bump;
      const bul = (0.0011 + 0.0012 * Y.full) * Math.sin(Math.PI * Math.min(1, rr * 1.6)) + (upper && Y.hood ? 0.0016 * bell(rr, 0.28, 0.12) * bump : 0);
      const pb = onBall(uu, vv, Rl + bul), pf = onFace(uu, vv, -0.0003);
      const k = smoothstep(0.28, 0.85, rr);
      const p = pb.lerp(pf, k);
      lidPos.push(p.x, p.y, p.z);
      let t = 0;
      if (upper) t = Y.crease * bell(rr, 0.42, 0.09) * Math.pow(bump, 0.6) + 0.22 * bell(rr, 0.06, 0.07) + Y.shadow * bell(rr, 0.62, 0.25) * bump;
      else t = 0.14 * bell(rr, 0.3, 0.14) * bump + 0.08 * bell(rr, 0.05, 0.05);
      lidTone.push(Math.min(1, t));
      lidW.push(1 - smoothstep(0.32, 0.82, rr));
    }
  }
  for (let r = 0; r < rows.length - 1; r++) for (let i = 0; i < nl; i++) {
    const a = r * nl + i, b = r * nl + ((i + 1) % nl), c = a + nl, dd = b + nl;
    if (s > 0) idx.push(a, c, b, b, c, dd); else idx.push(a, b, c, b, dd, c);
  }
  const lids = new THREE.BufferGeometry();
  lids.setAttribute("position", new THREE.Float32BufferAttribute(lidPos, 3));
  lids.setAttribute("tone", new THREE.Float32BufferAttribute(lidTone, 1));
  lids.setIndex(idx); lids.computeVertexNormals();
  // orientation des normales vers l'extérieur
  { const n = lids.attributes.normal, p = lids.attributes.position; let dot = 0; for (let i = 0; i < n.count; i++) dot += n.getX(i) * (p.getX(i) - C.x) + n.getY(i) * (p.getY(i) - C.y) + n.getZ(i) * (p.getZ(i) - C.z); if (dot < 0) { const ix = lids.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } lids.computeVertexNormals(); } }
  // trait de cils (paupière supérieure), plus épais vers l'extérieur
  const lp = [], lr = [];
  const nls = sg(10, d);
  for (let i = 0; i <= nls; i++) { const a = lerp(0.04, 1, i / nls); lp.push(onBall(lerp(-Y.w, Y.w, a), upF(a) + 0.0003, Rl + 0.0004)); lr.push((0.0005 + 0.0013 * Math.pow(a, 0.8)) * Y.lash * (i === nls ? 0.6 : 1)); }
  { const e = lp[lp.length - 1], pr = lp[lp.length - 2]; lp.push(e.clone().add(e.clone().sub(pr).multiplyScalar(0.8)).add(V3(s * 0.001, -0.0006, -0.0006))); lr.push(0.0002); }
  const lash = sweep(lp, lr, 4, { flat: 0.7 });
  const lop = [], lor = [];
  for (let i = 0; i <= 7; i++) { const a = lerp(0.3, 0.98, i / 7); lop.push(onBall(lerp(-Y.w, Y.w, a), loF(a) - 0.0002, Rl + 0.0003)); lor.push(0.00045 * Math.sin(Math.PI * (i / 7) * 0.9 + 0.2)); }
  const lower = sweep(lop, lor, 3, { flat: 0.6 });
  // globe, iris (limbe foncé via tone), pupille, reflet
  // globe un peu aplati sur les côtés : reste sous les paupières aux coins
  const globe = ell(re * 0.84, re * 0.94, re, d, 16, 12).translate(C.x, C.y, C.z);
  const ir = 0.0088 * (re / 0.0195), ai = Math.asin(Math.min(0.95, ir / re));
  const iris = new THREE.SphereGeometry(re + 0.0003, sg(16, d), 4, 0, TAU, 0, ai).rotateX(Math.PI / 2);
  { const p = iris.attributes.position, t = new Float32Array(p.count); for (let i = 0; i < p.count; i++) { const rr = Math.hypot(p.getX(i), p.getY(i)) / ir; t[i] = smoothstep(0.55, 1, rr) * 0.75 - 0.15 * (1 - rr); } iris.setAttribute("tone", new THREE.BufferAttribute(t, 1)); }
  iris.translate(C.x, C.y, C.z);
  const pupil = new THREE.SphereGeometry(re + 0.0005, sg(10, d), 2, 0, TAU, 0, Math.asin(0.0037 / re)).rotateX(Math.PI / 2).translate(C.x, C.y, C.z);
  const glint = ell(0.0019, 0.0017, 0.0008, d, 6, 4).translate(C.x + 0.0034, C.y + 0.0032, C.z + re + 0.0006);
  const caruncle = ell(0.0024, 0.0019, 0.0022, d, 6, 4).translate(...onBall(-Y.w + 0.0012, base(0) - 0.0002, re - 0.0004).toArray());
  // os de l'œil : fermeture vers la ligne des coins
  const boneY = C.y + lerp(base(0.5), (upF(0.5) + loF(0.5)) / 2, 0.35);
  return { C, re, boneY, lids, lidW, globe, iris, pupil, glint, lash, lower, caruncle, Y };
}

// ════════════════════════ Sourcils ════════════════════════
// y0/y1 : hauteur interne/externe ; arch : cambrure (pk = position du sommet, sharp = anguleux) ; h0/h1 : épaisseurs
export const BROWS = {
  straight: { y0: 0.041, y1: 0.039, arch: 0.004, pk: 0.62, h0: 0.0088, h1: 0.0048, lift: 0.0022, x1: 0.089 },
  thick:    { y0: 0.041, y1: 0.039, arch: 0.004, pk: 0.6, h0: 0.0128, h1: 0.0074, lift: 0.0028, x1: 0.09, hairy: 0.25 },
  bushy:    { y0: 0.042, y1: 0.040, arch: 0.005, pk: 0.55, h0: 0.0135, h1: 0.0095, lift: 0.0034, x1: 0.092, hairy: 0.45, tufts: 1 },
  arched:   { y0: 0.039, y1: 0.036, arch: 0.0115, pk: 0.56, h0: 0.0078, h1: 0.0036, lift: 0.002, x1: 0.088 },
  angled:   { y0: 0.039, y1: 0.034, arch: 0.012, pk: 0.66, sharp: 1, h0: 0.0092, h1: 0.004, lift: 0.0022, x1: 0.088 },
  thin:     { y0: 0.042, y1: 0.039, arch: 0.0055, pk: 0.58, h0: 0.0048, h1: 0.0026, lift: 0.0015, x1: 0.086 },
  scarred:  { y0: 0.041, y1: 0.039, arch: 0.004, pk: 0.62, h0: 0.0105, h1: 0.0058, lift: 0.0025, x1: 0.089, gap: [0.5, 0.63], hairy: 0.15 },
  heavy:    { y0: 0.032, y1: 0.037, arch: 0.002, pk: 0.5, h0: 0.0138, h1: 0.0088, lift: 0.0032, x1: 0.09, hairy: 0.3 },
};
export function browGeos(H, d, type, s, eyeSep = 0, expr = "normal") {
  const R0 = BROWS[type] || BROWS.straight, R = R0.gap && s < 0 ? { ...R0, gap: null } : R0; // balafre d'un seul côté
  const x0 = 0.02 + eyeSep * 0.6, x1 = R.x1 + eyeSep * 0.6;
  const gu = Math.log(0.5) / Math.log(R.pk);
  // expression de base : joyeux (relevés), déterminé (froncés vers l'intérieur), endormi (bout externe tombant)
  const ex = t => (expr === "happy" ? 0.0022 + 0.0018 * Math.sin(Math.PI * t) : expr === "determined" ? -0.0048 * (1 - t) + 0.0012 * t : expr === "sleepy" ? -0.0018 * t : 0);
  const cy = t => ex(t) + lerp(R.y0, R.y1, t) + R.arch * (R.sharp ? Math.max(0, 1 - Math.abs(t - R.pk) / (t < R.pk ? R.pk : 1 - R.pk)) ** 0.8 : Math.sin(Math.PI * Math.pow(t, gu)));
  const hh = t => lerp(R.h0, R.h1, Math.pow(t, 1.3)) * (t < 0.08 ? 0.65 + 0.35 * t / 0.08 : 1);
  const strip = (t0, t1, off = 0, scale = 1, lift = R.lift) => {
    const ns = Math.max(4, Math.round(sg(16, d) * (t1 - t0))), nv = 4;
    return paramGrid(ns, nv, (i, j) => {
      const t = lerp(t0, t1, i / ns), v = -1 + (2 * j) / nv;
      const hair = j === nv && R.hairy ? (i % 2 ? R.hairy : -R.hairy * 0.3) : 0;
      const y = cy(t) + off + (v + hair) * hh(t) * 0.5 * scale;
      return { p: H.front(s * lerp(x0, x1, t), y, 0.0004 + lift * Math.sqrt(Math.max(0, 1 - v * v))).p };
    });
  };
  const out = [];
  if (R.gap) { out.push(strip(0, R.gap[0])); out.push(strip(R.gap[1], 1)); }
  else out.push(strip(0, 1));
  if (R.tufts) { out.push(strip(0.05, 0.75, 0.0025, 0.6, R.lift + 0.0012)); out.push(strip(0.3, 1, -0.0015, 0.55, R.lift + 0.0008)); }
  if (s < 0) for (const g of out) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  const pivot = H.front(s * lerp(x0, x1, 0.45), cy(0.45), -0.006).p;
  let scar = null;
  if (R.gap) {
    const tm = (R.gap[0] + R.gap[1]) / 2;
    scar = paramGrid(1, 6, (i, j) => { const v = -1 + j / 3; return { p: H.front(s * (lerp(x0, x1, tm) + (i - 0.5) * 0.0026 + v * 0.002), cy(tm) + v * 0.0115, 0.0003).p }; });
    if (s < 0) { const ix = scar.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } scar.computeVertexNormals(); }
  }
  return { geos: out, pivot, scar };
}

// ════════════════════════ Bouche ════════════════════════
export const MOUTH_Y = -0.074;
// Projette une forme plate (plan XY, relatif à C) sur le visage
export function onFace(H, g0, lift) {
  const g = subdivide(g0, 0.006), p = g.attributes.position, nor = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const r = H.front(p.getX(i), p.getY(i), lift);
    p.setXYZ(i, r.p.x, r.p.y, r.p.z);
    nor[i * 3] = r.n.x; nor[i * 3 + 1] = r.n.y; nor[i * 3 + 2] = r.n.z;
  }
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return g;
}
export function mouthGeos(H, d) {
  const y = MOUTH_Y;
  return {
    // neutre : ligne légèrement arquée + ombre de la lèvre inférieure
    lineN: onFace(H, arcRibbon(0.2, 0.0034, 1.5 * Math.PI - 0.13, 1.5 * Math.PI + 0.13, sg(12, d), 0.65).translate(0, y + 0.2, 0), 0.0032),
    lipN: onFace(H, ellipseShape(0.0165, 0.0042, sg(12, d), Math.PI, TAU).translate(0, y - 0.0028, 0), 0.0026),
    // sourire franc (dents du haut)
    smile: onFace(H, ellipseShape(0.0275, 0.0165, sg(16, d), Math.PI, TAU).translate(0, y + 0.004, 0), 0.003),
    smileT: onFace(H, flatShape([[-0.023, y + 0.0035], [0.023, y + 0.0035], [0.02, y - 0.0025], [-0.02, y - 0.0025]]), 0.0036),
    smileG: onFace(H, ellipseShape(0.011, 0.004, 10).translate(0, y - 0.0095, 0), 0.0034),
    // bouche ouverte (cri, effort)
    open: onFace(H, ellipseShape(0.0175, 0.0215, sg(16, d)).translate(0, y - 0.006, 0), 0.003),
    openT: onFace(H, ellipseShape(0.012, 0.0085, 10, Math.PI, TAU).translate(0, y - 0.0175, 0), 0.0034),
    openD: onFace(H, flatShape([[-0.0125, y + 0.0118], [0.0125, y + 0.0118], [0.01, y + 0.0068], [-0.01, y + 0.0068]]), 0.0036),
    pivot: H.front(0, y, -0.012).p,
  };
}

// ════════════════════════ Pilosité faciale ════════════════════════
// Masques en coordonnées normalisées de l'ellipsoïde de base (nx, ny, nz) ; bouche : (0, MOUTH_Y)
const nyM = MOUTH_Y / HEAD_E.y;
const lipsMask = (nx, ny) => smoothstep(1.25, 0.85, (nx / 0.21) ** 2 + ((ny - nyM + 0.012) / 0.07) ** 2);
function beardMask(nx, ny, nz, th, { cheek = 0, must = 1, neck = 1 } = {}) {
  const at = Math.abs(th);
  const line = lerp(-0.4 + cheek, 0.05 + cheek, smoothstep(0.32, 1.3, at));
  let m = smoothstep(line + 0.07, line - 0.05, ny);
  const mu = must * smoothstep(0.44, 0.34, Math.abs(nx)) * smoothstep(-0.27, -0.33, ny) * smoothstep(0.5, 0.75, nz);
  m = Math.max(m, mu);
  m *= 1 - lipsMask(nx, ny);
  m *= smoothstep(-0.45, -0.05, nz) * (neck ? 1 : smoothstep(-0.85, -0.7, ny));
  m *= smoothstep(1.52, 1.38, at);
  return m;
}
// bord doux : le poil rejoint la peau en couleur (tone -> peau) avant de passer sous la surface
const soft = (m, L) => ({ m, lift: lerp(-0.0018, L, smoothstep(0.06, 0.55, m)), t: smoothstep(0.8, 0.2, m) });
export function facialHairGeos(H, d, type) {
  const E = H.E, out = [];
  const nrm = (th, ph) => { const u = H.dir(th, ph), k = 1 / Math.sqrt((u.x / E.x) ** 2 + (u.y / E.y) ** 2 + (u.z / E.z) ** 2); return [u.x * k / E.x, u.y * k / E.y, u.z * k / E.z]; };
  const grid = (th0, th1, ph0, ph1, nu, nv, f) => maskedSurface(H, th0, th1, ph0, ph1, sg(nu, d), sg(nv, d), (th, ph) => { const [nx, ny, nz] = nrm(th, ph); return f(nx, ny, nz, th, ph); }, d >= 0.75 ? 2 : 1);
  const beardShell = (thick, extra, o = {}) => grid(-1.55, 1.55, -1.52, 0.12, 30, 18, (nx, ny, nz, th) => {
    const m = beardMask(nx, ny, nz, th, o);
    const L = thick + extra(nx, ny, nz);
    return soft(m, L);
  });
  switch (type) {
    case "stubble":
      out.push({ g: grid(-1.55, 1.55, -1.52, 0.12, 28, 16, (nx, ny, nz, th) => { const m = beardMask(nx, ny, nz, th, { cheek: 0.02 }); return { m, lift: lerp(-0.0014, 0.0016, smoothstep(0.05, 0.45, m)), t: 1 - smoothstep(0.25, 0.9, m) }; }), tone: "stubble", fade: "skin", o: false });
      break;
    case "beard":
      out.push({ g: beardShell(0.0042, (nx, ny, nz) => 0.004 * smoothstep(-0.6, -0.95, ny) * smoothstep(0, 0.7, nz)), tone: "beard", fade: "skin", o: true });
      break;
    case "full_beard":
      out.push({ g: beardShell(0.008, (nx, ny, nz) => 0.026 * smoothstep(-0.5, -1.0, ny) * smoothstep(-0.1, 0.7, nz) + 0.006 * smoothstep(-0.2, -0.6, ny), { cheek: 0.03 }), tone: "beard", fade: "skin", o: true });
      // mèches de barbe sur le pourtour du menton
      for (let i = 0; i < 9; i++) {
        const th = lerp(-0.95, 0.95, i / 8), r = H.sph(th, -1.05 + 0.25 * Math.abs(th), 0.018);
        const dn = V3(Math.sin(th) * 0.25, -1, 0.35).normalize();
        const pts = [r.p, r.p.clone().addScaledVector(dn, 0.018), r.p.clone().addScaledVector(dn, 0.034).add(V3(0, 0, -0.004))];
        out.push({ g: sweep(pts, [0.011, 0.009, 0.003], sg(5, d), { flat: 0.55 }), tone: "beard", o: true });
      }
      break;
    case "goatee":
      out.push({ g: grid(-0.75, 0.75, -1.35, -0.3, 18, 14, (nx, ny, nz) => {
        const chin = smoothstep(0.34, 0.26, Math.abs(nx)) * smoothstep(-0.52, -0.6, ny);
        const mu = smoothstep(0.36, 0.3, Math.abs(nx)) * smoothstep(-0.28, -0.33, ny) * smoothstep(-0.5, -0.46, ny);
        const link = smoothstep(0.34, 0.27, Math.abs(nx)) * smoothstep(0.2, 0.26, Math.abs(nx));
        let m = Math.max(chin, mu, link * smoothstep(-0.3, -0.36, ny)) * (1 - lipsMask(nx, ny)) * smoothstep(0.1, 0.4, nz);
        return soft(m, 0.0045 + 0.004 * smoothstep(-0.75, -0.95, ny));
      }), tone: "beard", fade: "skin", o: true });
      break;
    case "moustache":
    case "handlebar": {
      const hb = type === "handlebar";
      out.push({ g: grid(-0.62, 0.62, -0.62, -0.22, 18, 9, (nx, ny, nz) => {
        const ax = Math.abs(nx), w = hb ? 0.3 : 0.37, top = -0.29 - 0.05 * (ax / 0.37) ** 2;
        const bot = nyM + 0.045 - (hb ? 0 : 0.1 * smoothstep(0.2, 0.37, ax));
        const m = smoothstep(w + 0.02, w - 0.02, ax) * smoothstep(top + 0.015, top - 0.015, ny) * smoothstep(bot - 0.015, bot + 0.015, ny) * smoothstep(0.35, 0.6, nz);
        return soft(Math.min(1, m * 1.15), 0.0058 + 0.0022 * smoothstep(0.3, 0.05, ax));
      }), tone: "beard", fade: "skin", o: true });
      if (hb) for (const s of [1, -1]) {
        const pts = [[0.041, -0.068], [0.056, -0.068], [0.068, -0.059], [0.072, -0.046], [0.065, -0.038]].map(([x, y], i) => H.front(s * x, y, 0.0045 - i * 0.0004).p);
        out.push({ g: sweep(pts, [0.0056, 0.0048, 0.0039, 0.0029, 0.0012], sg(6, d)), tone: "beard", o: true });
      }
      break;
    }
    case "sideburns":
      out.push({ g: grid(-1.5, 1.5, -0.95, 0.2, 28, 12, (nx, ny, nz, th) => {
        const at = Math.abs(th);
        const band = smoothstep(1.06, 1.14, at) * smoothstep(1.42, 1.34, at);
        const m = band * smoothstep(-0.62, -0.54, ny) * smoothstep(0.25, 0.18, ny);
        return soft(m, 0.005);
      }), tone: "beard", fade: "skin", o: true });
      break;
  }
  return out;
}
