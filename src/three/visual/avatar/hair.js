// Coiffures réalistes : cuir chevelu à ligne d'implantation (tempes, pattes, nuque), mèches sculptées qui suivent
// le crâne, dégradés par couleur de sommet, boucles serrées, nappes longues animées (os hairBack / hairTail).
// Repère : relatif au centre de la tête C (+Z devant, +X gauche du joueur). Chaque partie :
// { g, cat: cap|top|side|back|fringe, tone, fade, w: "head"|"back", o }  (tone/fade : clés de couleur, dégradé par attribut tone)
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ell, sg, V3, smoothstep, lerp, clamp } from "./kit.js";
import { maskedSurface } from "./face.js";
import { rng, hashStr } from "../util.js";

const TAU = Math.PI * 2, PI = Math.PI;
const bell = (x, c, w) => { const t = (x - c) / w; return Math.exp(-t * t); };
const R0 = 0.158; // rayon moyen du crâne (pas angulaire des mèches)
const thOf = u => Math.atan2(u.x, u.z), phOf = u => Math.asin(clamp(u.y / u.length(), -1, 1));

// Courbe symétrique en |θ| (clés [[|θ|, valeur], ...]) interpolée en Hermite
function curve(keys) {
  const A = keys.map(k => k[0]), Vv = keys.map(k => k[1]), n = A.length;
  const m = Vv.map((v, i) => (i === 0 || i === n - 1 ? 0 : (Vv[i + 1] - Vv[i - 1]) / (A[i + 1] - A[i - 1])));
  return th => {
    const a = Math.min(PI, Math.abs(Math.atan2(Math.sin(th), Math.cos(th))));
    let i = 0;
    while (i < n - 2 && a > A[i + 1]) i++;
    const h = A[i + 1] - A[i], t = clamp((a - A[i]) / h, 0, 1), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * Vv[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * Vv[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
// Lignes d'implantation (latitude φ selon l'azimut) : front, golfes temporaux, tempes, au-dessus de l'oreille, nuque
const HAIRLINE = {
  std: curve([[0, 0.56], [0.3, 0.6], [0.5, 0.57], [0.8, 0.38], [1.08, 0.24], [1.35, 0.27], [1.62, 0.33], [1.92, 0.14], [2.3, -0.3], [2.7, -0.68], [PI, -0.82]]),
  low: curve([[0, 0.53], [0.3, 0.56], [0.5, 0.53], [0.8, 0.34], [1.08, 0.2], [1.35, 0.24], [1.62, 0.3], [1.92, 0.1], [2.3, -0.34], [2.7, -0.72], [PI, -0.88]]),
};

// ── Cuir chevelu (masse de cheveux) ──
// o : { hl, lift(θ, φ, din), tone(θ, φ, din), sb (bas des pattes, φ), bald (φ max selon θ), ramp, nu, nv, levels, curls }
function scalp(H, d, o) {
  const hl = o.hl || HAIRLINE.std, ramp = o.ramp || 0.035, sb = o.sb;
  return maskedSurface(H, -PI, PI, -1.0, PI / 2, sg(o.nu || 36, d), sg(o.nv || 15, d), (th, ph) => {
    const din = ph - hl(th);
    let m = smoothstep(-ramp, ramp, din);
    if (sb != null) { const at = Math.abs(th); m = Math.max(m, smoothstep(1.08, 1.16, at) * smoothstep(1.4, 1.33, at) * smoothstep(sb - 0.03, sb + 0.03, ph) * smoothstep(0.45, 0.3, ph)); }
    if (o.bald) m *= smoothstep(ramp, -ramp, ph - o.bald(th));
    const L = o.lift(th, ph, Math.max(din, 0)) + (o.curls ? o.curls(th, ph) * smoothstep(0, 0.12, din) : 0);
    return { m, lift: lerp(-0.0015, L, smoothstep(0.04, 0.6, m)), t: o.tone ? o.tone(th, ph, din, m) : 0 };
  }, o.levels ?? (d >= 0.75 ? 2 : 1), 0.12);
}
// Relief doux (valeur ~[-1, 1]) sur la sphère des directions : volume irrégulier des cheveux bouclés
function curlField(freq, seed = 0) {
  const R = rng(hashStr("curl" + seed)), dirs = [];
  for (let i = 0; i < 5; i++) { const a = R() * TAU, b = (R() - 0.5) * 2; dirs.push(V3(Math.cos(a) * Math.sqrt(1 - b * b), b, Math.sin(a) * Math.sqrt(1 - b * b))); }
  return u => {
    let v = 0;
    for (let i = 0; i < dirs.length; i++) { const k = dirs[i], ph = i * 1.7; v += Math.sin(freq * u.dot(k) + ph) * Math.sin(freq * 0.93 * u.dot(dirs[(i + 2) % 5]) + ph * 0.5); }
    return v / 2.2;
  };
}

// ── Mèches ──
const tangent = (u, v) => { const t = v.clone().addScaledVector(u, -v.dot(u)); return t.lengthSq() < 1e-10 ? V3(0, -1, 0).addScaledVector(u, u.y).normalize() : t.normalize(); };
// Chemin de mèche : suit la masse (base(u) + lift), puis éventuellement tombe librement (fall) avec collisions tête/cou/dos
// o : { th, ph, dir, len, n, base, lift0, lift1, arc, arcK, bend, bendK, curl, rise, fall: { y, body, out, k }, flick }
function lockPath(H, o) {
  const n = o.n || 6, ds = o.len / n, pts = [], nrm = [];
  let u = H.dir(o.th, o.ph).normalize(), dv = tangent(u, o.dir || V3(0, 0, 1));
  let free = false, fd = null;
  for (let k = 0; k <= n; k++) {
    const s = k / n;
    let p, nn;
    if (!free) {
      const lift = (o.base ? o.base(u) : 0) + lerp(o.lift0 ?? 0.004, o.lift1 ?? 0.008, s) + (o.arc || 0) * Math.sin(PI * Math.min(1, s * (o.arcK || 1))) + (o.rise || 0) * s * s;
      const r = H.P(u, lift);
      p = r.p; nn = r.n;
      if (o.fall && k > 0 && p.y < o.fall.y) { free = true; fd = p.clone().sub(pts[k - 1]).normalize(); }
    }
    if (free) {
      // chute libre : vers le bas (+ évasement), hors du crâne puis du cou et du dos
      fd.lerp(V3(o.fall.out?.x || 0, -1, o.fall.out?.z || 0).normalize(), o.fall.k ?? 0.45).normalize();
      p = pts[k - 1].clone().addScaledVector(fd, ds);
      if (p.y > -0.2) { const r = H.P(p.clone(), 0), gap = (o.lift1 ?? 0.008) * 0.8; if (p.length() < r.p.length() + gap) p.copy(r.p).addScaledVector(r.n, gap); }
      if (o.fall.body) o.fall.body(p);
      nn = V3(p.x, 0, p.z + 0.02).normalize();
    }
    pts.push(p); nrm.push(nn);
    if (!free) {
      if (o.bend) dv.lerp(tangent(u, o.bend), o.bendK ?? 0.3).normalize();
      if (o.curl) dv.applyAxisAngle(u, o.curl);
      u = u.clone().addScaledVector(dv, ds / R0).normalize();
      dv = tangent(u, dv);
    }
  }
  if (o.flick) pts[n].addScaledVector(nrm[n], o.flick);
  return { pts, nrm };
}
// Tube aplati orienté (largeur le long de la surface, épaisseur selon la normale) ; tone : racine foncée -> pointe claire
function lockGeo(path, o) {
  const { pts, nrm } = path, n = pts.length, seg = o.seg, cols = seg + 1;
  const pos = [], tone = [], idx = [];
  const T = V3(), N = V3(), Bn = V3();
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    T.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    N.copy(nrm[i]).addScaledVector(T, -nrm[i].dot(T)).normalize();
    Bn.crossVectors(T, N).normalize();
    const w = o.w * (o.wf ? o.wf(s) : Math.pow(Math.max(0, 1 - Math.pow(s, o.taper || 2.2)), 0.8) * (o.root ? lerp(o.root, 1, smoothstep(0, 0.25, s)) : 1));
    const h = o.h * (o.hf ? o.hf(s) : Math.max(0.15, 1 - s * 0.6)) * (w > 1e-6 ? 1 : 0);
    const tt = (o.rootT ?? 0.55) * Math.pow(1 - s, 2) - (o.tipT ?? 0.3) * Math.pow(s, 1.5);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU, c = Math.cos(a), sn = Math.sin(a), lo = sn < 0 && o.flatBack ? 0.25 : 1;
      pos.push(pts[i].x + Bn.x * w * c + N.x * h * sn * lo, pts[i].y + Bn.y * w * c + N.y * h * sn * lo, pts[i].z + Bn.z * w * c + N.z * h * sn * lo);
      tone.push(tt + (sn < -0.3 ? 0.18 : 0) - (o.shine && sn > 0.6 ? o.shine * bell(s, 0.35, 0.22) : 0));
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * cols + j, b = a + 1, c = a + cols, dd = c + 1; idx.push(a, c, b, b, c, dd); }
  const ci = pos.length / 3; pos.push(pts[0].x, pts[0].y, pts[0].z); tone.push(o.rootT ?? 0.55);
  for (let j = 0; j < seg; j++) idx.push(ci, j, j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("tone", new THREE.Float32BufferAttribute(tone, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Nappe de cheveux longs : colonnes jointives (chemins de mèches), bas découpé en pointes (mèches),
// stries par tone, épaisseur (deux faces + bords). o : { th0, th1, ph(f), nu, nv, len(f), clumps, tip, thick, path(f) }
function curtain(H, o) {
  const nu = o.nu, nv = o.nv, P = [], Tn = [], S = [];
  for (let i = 0; i <= nu; i++) {
    const f = i / nu, dc = Math.abs(((f * o.clumps) % 1) - 0.5) * 2; // 0 = centre de mèche, 1 = entre deux mèches
    const len = o.len(f) * (1 - o.tip * Math.pow(dc, 0.9));
    const path = lockPath(H, { th: lerp(o.th0, o.th1, f), ph: o.ph(f), n: nv, len, ...o.path(f) });
    for (let k = 0; k <= nv; k++) {
      const s = k / nv;
      P.push(path.pts[k]);
      Tn.push((o.rootT ?? 0.45) * Math.pow(1 - s, 2) - (o.tipT ?? 0.3) * Math.pow(s, 1.4) + (o.stripe ?? 0.28) * dc * dc * (0.4 + 0.6 * s));
      S.push(s);
    }
  }
  const at = (i, k) => i * (nv + 1) + k, n = P.length;
  // normales de la face externe (orientées hors de la tête)
  const g0 = new THREE.BufferGeometry(), pos0 = new Float32Array(n * 3), idx0 = [];
  P.forEach((p, i) => pos0.set([p.x, p.y, p.z], i * 3));
  for (let i = 0; i < nu; i++) for (let k = 0; k < nv; k++) idx0.push(at(i, k), at(i + 1, k), at(i, k + 1), at(i + 1, k), at(i + 1, k + 1), at(i, k + 1));
  g0.setAttribute("position", new THREE.BufferAttribute(pos0, 3)); g0.setIndex(idx0); g0.computeVertexNormals();
  const nn = g0.attributes.normal;
  if (o.bump) for (let i = 0; i <= nu; i++) for (let k = 0; k <= nv; k++) { const j = at(i, k), b = o.bump(i / nu, k / nv); P[j].x += nn.getX(j) * b; P[j].y += nn.getY(j) * b; P[j].z += nn.getZ(j) * b; }
  let dot = 0;
  for (let i = 0; i < n; i++) dot += nn.getX(i) * P[i].x + nn.getY(i) * (P[i].y - 0.02) + nn.getZ(i) * P[i].z;
  const flip = dot < 0, sgn = flip ? -1 : 1;
  const pos = [], tone = [], idx = [];
  for (let i = 0; i < n; i++) { pos.push(P[i].x, P[i].y, P[i].z); tone.push(Tn[i]); }
  for (let i = 0; i < n; i++) {
    const th = o.thick * lerp(1, 0.35, S[i]);
    pos.push(P[i].x - sgn * nn.getX(i) * th, P[i].y - sgn * nn.getY(i) * th, P[i].z - sgn * nn.getZ(i) * th); tone.push(Tn[i] + 0.25);
  }
  const tri = (a, b, c) => (flip ? idx.push(a, c, b) : idx.push(a, b, c));
  for (let i = 0; i < nu; i++) for (let k = 0; k < nv; k++) {
    const a = at(i, k), b = at(i + 1, k), c = at(i, k + 1), dd = at(i + 1, k + 1);
    tri(a, b, c); tri(b, dd, c);
    tri(n + a, n + c, n + b); tri(n + b, n + c, n + dd);
  }
  // bords : bas et côtés
  for (let i = 0; i < nu; i++) { const a = at(i, nv), b = at(i + 1, nv); tri(a, n + a, b); tri(b, n + a, n + b); }
  for (let k = 0; k < nv; k++) {
    let a = at(0, k), c = at(0, k + 1); tri(a, c, n + a); tri(c, n + c, n + a);
    a = at(nu, k); c = at(nu, k + 1); tri(a, n + a, c); tri(c, n + a, n + c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("tone", new THREE.Float32BufferAttribute(tone, 1));
  g.setIndex(idx); g.computeVertexNormals();
  g0.dispose();
  if (o.deco) for (let i = 0; i <= nu; i++) for (let k = 1; k <= nv; k++) o.deco(P[at(i, k)], V3(sgn * nn.getX(at(i, k)), sgn * nn.getY(at(i, k)), sgn * nn.getZ(at(i, k))), i / nu, k / nv);
  return g;
}

// Collision des mèches tombantes : cou et haut du dos (repère tête mis à l'échelle k ; torso(yMonde) -> { rx, rz, z })
function bodyPush(C, torso, k = 1) {
  return p => {
    const Y = C.y + p.y * k, X = p.x * k, Z = C.z + p.z * k;
    let rx = 0.088, rz = 0.08, zc = -0.012;
    if (Y < 1.47) { const t = torso(Y); rx = Math.max(rx, t.rx + 0.034); rz = Math.max(rz, t.rz + 0.036); zc = t.z; }
    const dx = X / rx, dz = (Z - zc) / rz, r = Math.hypot(dx, dz);
    if (r < 1) { const f = 1 / Math.max(r, 1e-3); p.x = (dx * f * rx) / k; p.z = (zc + dz * f * rz - C.z) / k; }
  };
}

// ════════════════════════ Styles ════════════════════════
export function hairStyle(style, H, d, C, torso, hs = 1) {
  const R = rng(hashStr("hair2:" + style));
  const E = H.E, parts = [], lod = d >= 1 ? 1 : d >= 0.75 ? 0.75 : 0.45;
  const add = (g, cat, tone = "hair", fade = "root", w = "head", o = true) => parts.push({ g, cat, tone, fade, w, o });
  const seg = Math.max(3, sg(6, d)), segS = Math.max(3, sg(5, d));
  const N = k => Math.max(2, Math.round(k * lod));
  const lock = (o, cat = "top", w = "head", out = false) => add(lockGeo(lockPath(H, o), { seg: o.seg || seg, ...o }), cat, o.tone || "hair", o.fade || "root", w, o.outline ?? out);
  const push = bodyPush(C, torso, hs);
  let vol = null, pivots = null, lf = null, lhl = HAIRLINE.std;
  const hlS = HAIRLINE.std;
  const base = u => { if (!lf) return 0; const th = thOf(u), ph = phOf(u); return lf(th, ph, Math.max(0, ph - lhl(th))); }; // épaisseur de la masse sous une mèche
  // épaisseur de la masse : côtés -> dessus (-> arrière)
  const thick = (side, top, back = side) => (th, ph) => {
    const at = Math.abs(th), s = lerp(side, back, smoothstep(1.4, 2.6, at));
    return lerp(s, top, smoothstep(0.35, 1.05, ph));
  };
  const mass = (o, cat = "cap", tone = "hair", fade = "skin") => { lhl = o.hl || HAIRLINE.std; lf = o.curls ? (th, ph, din) => o.lift(th, ph, din) + o.curls(th, ph) : o.lift; add(scalp(H, d, o), cat, tone, fade, "head", true); };
  // semis de racines sur une zone (θ, φ) : rejet des positions trop proches
  const roots = (n, thR, phR, filter, uni = false) => {
    const out = [];
    for (let tries = 0; out.length < n && tries < n * 40; tries++) {
      const th = lerp(thR[0], thR[1], R()), ph = uni ? Math.asin(lerp(Math.sin(phR[0]), Math.sin(phR[1]), R())) : lerp(phR[0], phR[1], Math.sqrt(R()));
      if (filter && !filter(th, ph)) continue;
      if (out.some(([a, b]) => Math.hypot((a - th) * Math.cos(ph), b - ph) < 0.16 * Math.sqrt(12 / n))) continue;
      out.push([th, ph]);
    }
    return out;
  };
  const dirAt = (th, ph) => H.dir(th, ph);
  // boucles serrées : petites mèches enroulées en « C » posées sur la masse
  const curls = (n, thR, phR, filter, o = {}) => {
    for (const [th, ph] of roots(n, thR, phR, filter, true)) {
      const a = R() * TAU, u = dirAt(th, ph), dir = V3(Math.cos(a), Math.sin(a), 0).addScaledVector(u, 0);
      lock({ th, ph, dir, len: (o.len || 0.034) * (0.8 + 0.4 * R()), n: 4, base, lift0: 0.002, lift1: 0.004, arc: 0.004, curl: (R() < 0.5 ? -1 : 1) * (0.75 + 0.3 * R()), w: o.w || 0.0105, h: o.h || 0.0062, taper: 1.5, root: 0.7, rootT: 0.45, tipT: 0.5, seg: Math.max(3, sg(4, d)) }, o.cat || "top", o.wgt || "head", o.outline || false);
    }
  };
  // arrière long (mulets, cheveux longs) : nappe + quelques mèches
  const back = (o) => {
    add(curtain(H, {
      th0: PI - o.span, th1: PI + o.span, nu: Math.max(6, sg(o.nu || 18, d)), nv: Math.max(4, sg(o.nv || 8, d)), clumps: o.clumps, tip: o.tip ?? 0.4, thick: o.thick || 0.009,
      ph: f => o.ph + (o.phArc || 0.08) * bell(f, 0.5, 0.35), len: f => o.len * (1 - (o.lenEdge ?? 0.25) * (1 - bell(f, 0.5, 0.42))), stripe: o.stripe, tipT: o.tipT, bump: o.bump, deco: o.deco,
      path: f => ({ dir: V3(0, -1, -0.15), base, lift0: -0.004, lift1: o.lift || 0.014,
        fall: { y: o.fallY ?? -0.1, body: push, out: V3((f - 0.5) * (o.flare ?? 0.6), 0, -0.35), k: o.k ?? 0.35 }, flick: o.flick || 0 }),
    }), "back", "hair", "root", "back", true);
    pivots = { back: V3(0, 0.02, -0.14), tail: V3(0, -0.15, -0.17) };
  };
  switch (style) {
    case "bald":
      break;

    case "buzz":
      mass({ lift: () => 0.0028, sb: 0.05, tone: (th, ph, din) => 0.25 * (1 - smoothstep(0, 0.12, din)) }, "cap", "buzz", "skin");
      break;

    case "grey_side": {
      const bald = curve([[0, -1], [0.8, -1], [0.98, 0.5], [1.6, 0.66], [2.2, 0.62], [PI, 0.56]]);
      const cf = curlField(21, "prof");
      mass({ bald, sb: 0.02, lift: (th, ph) => 0.008 + 0.004 * smoothstep(1.2, 2.0, Math.abs(th)), curls: (th, ph) => 0.003 * cf(H.dir(th, ph)), tone: (th, ph, din) => 0.3 * (1 - smoothstep(0, 0.1, din)) - 0.2 * cf(H.dir(th, ph)) }, "side", "hair", "skin");
      // mèches ébouriffées au-dessus des oreilles (professeur)
      for (const s of [1, -1]) for (let i = 0; i < N(6); i++) {
        const th = s * (1.1 + i * 0.3), ph = 0.42 + 0.07 * Math.sin(i * 2.3);
        lock({ th, ph, dir: V3(s * 0.5, 0.5, -1), len: 0.04 + 0.012 * (i % 2), n: 4, base, lift0: 0.0, lift1: 0.009, curl: s * 0.3, w: 0.02, h: 0.008, taper: 1.6, tipT: 0.55 }, "side");
      }
      break;
    }

    case "fade":
    case "mullet_shaved": {
      const ms = style === "mullet_shaved";
      mass({ lift: (th, ph) => thick(0.0016, 0.012, 0.0016)(th, ph) + (ms ? 0.012 * smoothstep(2.3, 2.7, Math.abs(th)) * smoothstep(-0.2, 0.3, ph) : 0),
        tone: (th, ph) => (1 - smoothstep(0.08, 0.62, ph)) * smoothstep(0.35, 0.95, Math.abs(th)) * (ms ? smoothstep(2.6, 2.2, Math.abs(th)) : 1) * 0.95, sb: 0.22 });
      // dessus texturé (court, vers l'avant)
      for (const [th, ph] of roots(N(15), [-1.9, 1.9], [0.72, 1.5])) {
        const u = dirAt(th, ph);
        lock({ th, ph, dir: V3(u.x * 0.3, 0, 1), len: 0.045 + R() * 0.02, n: 4, base, lift0: 0.0, lift1: 0.004, arc: 0.003, w: 0.02, h: 0.006, flatBack: true, bend: V3(0, -0.5, 1), bendK: 0.15, tipT: 0.45 });
      }
      for (let i = 0; i < N(5); i++) { const th = -0.42 + i * 0.21; lock({ th, ph: hlS(th) + 0.07, dir: V3(th * 0.3, -0.3, 1), len: 0.032, n: 3, base, lift0: 0.0, lift1: 0.002, w: 0.017, h: 0.005, tipT: 0.4 }, "fringe"); }
      if (ms) back({ span: 0.72, ph: 0.4, len: 0.3, clumps: 6, tip: 0.32, thick: 0.013, lift: 0.016, flare: 0.4, flick: 0.012, nu: 14, stripe: 0.16, tipT: 0.4 });
      break;
    }

    case "mohawk": {
      mass({ lift: () => 0.0016, tone: (th, ph) => 0.6 - 0.3 * smoothstep(0.3, 1.2, ph), sb: 0.15 }, "cap", "shaved", "skin");
      const nc = N(11);
      for (let i = 0; i < nc; i++) {
        const f = i / (nc - 1), a = lerp(0.6, PI - 0.3, f); // angle sagittal depuis l'avant
        const th = a < PI / 2 ? 0 : PI, ph = a < PI / 2 ? a : PI - a;
        const hgt = 0.07 + 0.055 * bell(f, 0.4, 0.38);
        for (const dx of lod < 0.6 ? [0] : [-0.02, 0, 0.02]) {
          const bp = H.P(H.dir(th, ph).add(V3(dx / 0.15, 0, 0)), 0.002);
          const bk = V3(dx * 3, -Math.sin(a) * 0.15, -1).normalize();
          const up = bp.n.clone().lerp(bk, 0.3).add(V3(dx * 6, 0, 0)).normalize();
          const pts = [], nrm = [];
          for (let k = 0; k <= 4; k++) { const s = k / 4; pts.push(bp.p.clone().addScaledVector(up, hgt * (dx ? 0.85 : 1) * s).addScaledVector(bk, 0.035 * s * s)); nrm.push(V3(1, 0, 0)); }
          add(lockGeo({ pts, nrm }, { seg, w: 0.026, h: 0.008, taper: 1.3, tipT: 0.55 }), "top", "hair", "root", "head", true);
        }
      }
      vol = { r: 1.03, top: 0.28 };
      break;
    }

    case "short":
    case "messy":
    case "spiky": {
      const messy = style === "messy", spiky = style === "spiky";
      mass({ lift: thick(0.0045, spiky ? 0.011 : 0.013, 0.005), tone: (th, ph, din) => 0.3 * (1 - smoothstep(0, 0.12, din)), sb: 0.1 });
      const n = N(spiky ? 22 : messy ? 26 : 18);
      for (const [th, ph] of roots(n, [-PI, PI], [spiky ? 0.62 : 0.55, 1.52], (t, p) => p > hlS(t) + 0.06)) {
        const u = dirAt(th, ph);
        if (spiky) {
          const out = u.clone().add(V3(0, 0.6, -0.35)).normalize();
          const bp = H.P(u, 0.006), pts = [], nrm = [], L = 0.06 + R() * 0.04;
          const side = V3().crossVectors(out, V3(0, 1, 0.3)).normalize();
          for (let k = 0; k <= 4; k++) { const s = k / 4; pts.push(bp.p.clone().addScaledVector(out, L * s).addScaledVector(V3(0, 0.3, -1), 0.012 * s * s)); nrm.push(side.clone()); }
          add(lockGeo({ pts, nrm }, { seg, w: 0.021, h: 0.012, taper: 1.2, tipT: 0.55 }), "top", "hair", "root", "head", true);
        } else if (messy) {
          const dir = V3(R() - 0.5 + u.x * 0.5, R() * 0.4 - 0.1, R() - 0.3 + u.z * 0.8);
          const lifted = R() < 0.35;
          lock({ th, ph, dir, len: 0.05 + R() * 0.04, n: 4, base, lift0: 0.0, lift1: 0.004 + (lifted ? 0.012 : 0), arc: 0.004, rise: lifted ? 0.012 : 0, w: 0.019, h: 0.007, curl: (R() - 0.5) * 0.5, tipT: 0.45 }, "top", "head", lifted);
        } else {
          lock({ th, ph, dir: V3(u.x * 0.35 + (R() - 0.5) * 0.3, 0, 1), len: 0.045 + R() * 0.03, n: 4, base, lift0: 0.0, lift1: 0.004, arc: 0.003, w: 0.018 + R() * 0.008, h: 0.006, flatBack: true, taper: 1.6 + R(), bend: V3(u.x * 0.5, -0.4, 1), bendK: 0.2, rootT: 0.35, tipT: 0.35 });
        }
      }
      if (!spiky) for (let i = 0; i < N(4); i++) { const th = -0.36 + i * 0.24 + (R() - 0.5) * 0.08; lock({ th, ph: hlS(th) + 0.07 + R() * 0.03, dir: V3(th * 0.4 + (messy ? R() - 0.5 : (R() - 0.5) * 0.3), -0.6, 1), len: 0.026 + R() * 0.02, n: 3, base, lift0: 0.0, lift1: 0.003, w: 0.019, h: 0.005, taper: 1.8, rootT: 0.3, tipT: 0.35 }, "fringe"); }
      if (spiky) vol = { r: 1.16, top: 0.26 };
      break;
    }

    case "side": {
      const part = 0.42;
      mass({ lift: thick(0.005, 0.014, 0.006), tone: (th, ph, din) => 0.3 * (1 - smoothstep(0, 0.12, din)) + 0.3 * bell(th, part, 0.035) * smoothstep(0.65, 0.85, ph), sb: 0.1 });
      for (let i = 0; i < N(11); i++) {
        const ph = lerp(0.7, 1.45, i / 10), th = part - 0.03;
        lock({ th, ph, dir: V3(-1, 0.1, 0.25 - i * 0.05), len: 0.11 + 0.03 * Math.sin(i), n: 5, base, lift0: 0.0, lift1: 0.002, arc: 0.006, w: 0.026, h: 0.007, flatBack: true, bend: V3(-0.6, -1, 0.1), bendK: 0.18, tipT: 0.35 });
      }
      for (let i = 0; i < N(6); i++) { const ph = lerp(0.75, 1.3, i / 5); lock({ th: part + 0.05, ph, dir: V3(1, -0.6, 0), len: 0.05, n: 3, base, lift0: 0.0, lift1: 0.0, w: 0.02, h: 0.006, tipT: 0.35 }); }
      for (let i = 0; i < N(4); i++) lock({ th: 0.3 - i * 0.12, ph: 0.66, dir: V3(-1, 0.2, 0.6), len: 0.075, n: 4, base, lift0: 0.002, lift1: 0.002, arc: 0.008, w: 0.024, h: 0.007, bend: V3(-1, -0.8, 0.2), bendK: 0.25, tipT: 0.35 }, "fringe");
      break;
    }

    case "slick": {
      mass({ lift: thick(0.005, 0.011, 0.006), tone: (th, ph, din) => 0.25 * (1 - smoothstep(0, 0.1, din)) + 0.12 * Math.pow(Math.sin(th * 11), 2), sb: 0.12 });
      for (let i = 0; i < N(13); i++) {
        const th = lerp(-0.95, 0.95, i / 12), ph = hlS(th) + 0.035;
        lock({ th, ph, dir: V3(th * 0.15, 0.5, -1), len: 0.24 - Math.abs(th) * 0.05, n: 7, base, lift0: -0.001, lift1: 0.001, arc: 0.003, w: 0.024, h: 0.006, flatBack: true, bend: V3(0, -0.6, -1), bendK: 0.12, shine: 0.55, tipT: 0.2, rootT: 0.35 });
      }
      for (const s of [1, -1]) for (let i = 0; i < N(5); i++) lock({ th: s * (1.0 + i * 0.12), ph: 0.36 + i * 0.03, dir: V3(0, 0.2, -1), len: 0.11, n: 5, base, lift0: 0.0, lift1: 0.0, w: 0.02, h: 0.005, flatBack: true, bend: V3(0, -0.4, -1), bendK: 0.2, shine: 0.4, tipT: 0.2 }, "side");
      break;
    }

    case "pompadour": {
      const quiff = (th, ph) => 0.03 * bell(ph, 0.92, 0.3) * smoothstep(1.0, 0.35, Math.abs(th));
      mass({ lift: (th, ph) => thick(0.003, 0.012, 0.004)(th, ph) + quiff(th, ph), tone: (th, ph) => (1 - smoothstep(0.1, 0.55, ph)) * smoothstep(0.35, 0.95, Math.abs(th)) * 0.85 + 0.1 * Math.pow(Math.sin(th * 13), 2), sb: 0.12 });
      for (let i = 0; i < N(12); i++) {
        const th = lerp(-0.72, 0.72, i / 11), ph = hlS(th) + 0.03;
        lock({ th, ph, dir: V3(th * 0.2, 1, 0.1), len: 0.2, n: 7, base, lift0: 0.0, lift1: 0.0, arc: 0.006, w: 0.025, h: 0.007, bend: V3(0, -0.5, -1), bendK: 0.25, shine: 0.45, tipT: 0.25 });
      }
      vol = { r: 1.12, top: 0.21 };
      break;
    }

    case "curly":
    case "afro":
    case "mullet_perm": {
      const afro = style === "afro", perm = style === "mullet_perm";
      const cf = curlField(afro ? 15 : 19, style);
      const ca = V3(0, 0.035, -0.03);
      const big = afro
        ? (th, ph) => clamp(0.205 - H.sph(th, ph).p.distanceTo(ca), 0.012, 0.09)
        : (th, ph) => (perm ? 0.012 + 0.006 * smoothstep(0.4, 1.2, ph) : 0.013 + 0.011 * smoothstep(0.3, 1.2, ph));
      const amp = afro ? 0.008 : 0.005;
      mass({
        nu: afro ? 48 : 40, nv: afro ? 20 : 16, ramp: afro ? 0.025 : 0.035,
        lift: (th, ph, din) => big(th, ph) * (afro ? lerp(0.25, 1, smoothstep(0, 0.28, din)) : smoothstep(0, 0.18, din)) + 0.003,
        curls: (th, ph) => amp * cf(H.dir(th, ph)),
        tone: (th, ph, din) => 0.3 - 0.4 * cf(H.dir(th, ph)) + 0.2 * (1 - smoothstep(0, 0.1, din)),
        sb: afro ? 0.06 : 0.12,
      }, "cap", "hair", "root");
      const nc = d >= 1 ? (afro ? 84 : 56) : d >= 0.75 ? (afro ? 54 : 36) : afro ? 16 : 10;
      curls(nc, [-PI, PI], [afro ? 0.3 : 0.5, 1.55], (t, p) => p > hlS(t) + 0.04, afro ? { len: 0.05, w: 0.015, h: 0.009 } : {});
      if (!afro) for (let i = 0; i < N(5); i++) { const th = -0.36 + i * 0.18; lock({ th, ph: hlS(th) + 0.03, dir: V3(Math.cos(i * 2), -1, 0.4), len: 0.03, n: 4, base, lift0: 0.001, lift1: 0.004, curl: (i % 2 ? 1 : -1) * 0.9, w: 0.0105, h: 0.006, taper: 1.5, tipT: 0.5, seg: Math.max(3, sg(4, d)) }, "fringe"); }
      if (perm) {
        // arrière volumineux et bouclé (années 80) sur la nuque
        // volume bouclé arrondi derrière la nuque (années 80) + boucles en surface
        const cb = curlField(17, "permback"), bc = V3(0, -0.1, -0.12), br = V3(0.135, 0.18, 0.09);
        const bg = new THREE.SphereGeometry(1, Math.max(10, sg(22, d)), Math.max(8, sg(16, d)));
        const bp = bg.attributes.position, bt = new Float32Array(bp.count), pts0 = [];
        for (let i = 0; i < bp.count; i++) {
          const u = V3().fromBufferAttribute(bp, i), c = cb(u), q = V3(u.x * br.x, u.y * br.y * (u.y < 0 ? 1.0 : 0.85), u.z * br.z * (u.z < 0 ? 1.1 : 0.7));
          q.x *= 1 - 0.3 * smoothstep(-0.2, -1, u.y);
          q.addScaledVector(u, 0.009 * c).add(bc);
          push(q);
          bp.setXYZ(i, q.x, q.y, q.z); bt[i] = 0.25 - 0.45 * c + 0.2 * smoothstep(-0.2, -0.9, u.y);
          if (u.z < -0.2 && u.y < 0.6 && i % 3 === 0) pts0.push([q.clone(), u.clone()]);
        }
        bg.setAttribute("tone", new THREE.BufferAttribute(bt, 1)); bg.deleteAttribute("uv"); bg.computeVertexNormals();
        add(bg, "back", "hair", "root", "back", true);
        for (let i = 0, nd = d >= 1 ? 30 : d >= 0.75 ? 18 : 0; i < nd && pts0.length; i++) {
          const [p, n0] = pts0[Math.floor(R() * pts0.length)], n = n0.clone().normalize(), t1 = V3(0, 1, 0).applyAxisAngle(n, R() * TAU), pts = [], nr = [];
          for (let k = 0; k <= 4; k++) { const q = t1.clone().applyAxisAngle(n, k * 0.85); pts.push(p.clone().addScaledVector(n, 0.004).addScaledVector(q, 0.012)); nr.push(n.clone()); }
          add(lockGeo({ pts, nrm: nr }, { seg: Math.max(3, sg(4, d)), w: 0.013, h: 0.008, taper: 1.5, root: 0.7, rootT: 0.4, tipT: 0.5 }), "back", "hair", "root", "back", false);
        }
        pivots = { back: V3(0, 0.0, -0.14), tail: V3(0, -0.15, -0.17) };
        curls(d >= 1 ? 14 : d >= 0.75 ? 9 : 0, [PI - 0.9, PI + 0.9], [0.24, 0.5], null, { cat: "back" });
      }
      vol = afro ? { r: 1.52, top: 0.23 } : { r: 1.2, top: 0.19 };
      break;
    }

    case "mullet_modern": {
      mass({ lift: (th, ph) => thick(0.0035, 0.013, 0.012)(th, ph), tone: (th, ph) => 0.55 * (1 - smoothstep(0.1, 0.55, ph)) * smoothstep(0.35, 0.95, Math.abs(th)) * smoothstep(2.3, 1.7, Math.abs(th)), sb: 0.14 });
      for (const [th, ph] of roots(N(15), [-2.1, 2.1], [0.66, 1.5])) {
        const u = dirAt(th, ph);
        lock({ th, ph, dir: V3(u.x * 0.5 + (R() - 0.5) * 0.4, 0.1, 1), len: 0.055 + R() * 0.02, n: 4, base, lift0: 0.0, lift1: 0.007, arc: 0.005, w: 0.02, h: 0.007, curl: (R() - 0.5) * 0.4, bend: V3(0, -0.6, 1), bendK: 0.18, tipT: 0.5 });
      }
      for (let i = 0; i < N(5); i++) { const th = -0.4 + i * 0.2; lock({ th, ph: hlS(th) + 0.07, dir: V3(th * 0.5, -0.8, 1), len: 0.045, n: 3, base, lift0: 0.0, lift1: 0.003, w: 0.018, h: 0.006, tipT: 0.45 }, "fringe"); }
      back({ span: 1.0, ph: 0.36, len: 0.25, clumps: 8, tip: 0.55, thick: 0.011, lift: 0.016, flare: 0.8, flick: 0.014, nu: 22, stripe: 0.2 });
      break;
    }

    case "mullet_classic":
    case "long": {
      const lg = style === "long";
      mass({ hl: HAIRLINE.low, lift: thick(0.008, 0.013, 0.013), tone: (th, ph, din) => 0.25 * (1 - smoothstep(0, 0.1, din)) + (lg ? 0.3 * bell(th, 0, 0.035) * smoothstep(0.8, 1.2, ph) : 0) + 0.1 * Math.pow(Math.sin(th * 9), 2), sb: lg ? null : 0.0 }, "cap", "hair", "root");
      if (!lg) {
        // dessus plumeux (rejeté en arrière) et côtés plumeux par-dessus le haut des oreilles
        for (let i = 0; i < N(9); i++) { const th = lerp(-0.8, 0.8, i / 8), ph = HAIRLINE.low(th) + 0.03; lock({ th, ph, dir: V3(th * 0.8, 0.8, -0.6), len: 0.13, n: 5, base, lift0: 0.0, lift1: 0.003, arc: 0.01, w: 0.025, h: 0.007, bend: V3(Math.sign(th || 1) * 0.6, -0.3, -1), bendK: 0.25, tipT: 0.35 }, "top", "head", Math.abs(th) > 0.7); }
        for (const s of [1, -1]) for (let i = 0; i < N(5); i++) lock({ th: s * (0.95 + i * 0.12), ph: 0.5 - i * 0.03, dir: V3(0, -0.35, -1), len: 0.12, n: 5, base, lift0: 0.0, lift1: 0.009, w: 0.025, h: 0.007, bend: V3(s * 0.3, -0.5, -1), bendK: 0.2, tipT: 0.3 }, "side", "head", true);
        back({ span: 1.1, ph: 0.36, len: 0.3, clumps: 7, tip: 0.35, thick: 0.01, lift: 0.016, flare: 0.8, flick: 0.01, lenEdge: 0.3 });
      } else {
        // raie au milieu, longueurs sur les épaules, mèches qui encadrent le visage
        for (const s of [1, -1]) for (let i = 0; i < N(7); i++) {
          const th = s * lerp(0.06, 0.8, i / 6), ph = 1.3 - i * 0.08;
          lock({ th, ph, dir: V3(s, -0.4, -0.2 - i * 0.05), len: 0.13, n: 5, base, lift0: -0.001, lift1: 0.004, w: 0.028, h: 0.007, flatBack: true, bend: V3(s * 0.4, -1, -0.3), bendK: 0.3, tipT: 0.1, rootT: 0.3 }, "top");
        }
        add(curtain(H, {
          th0: 0.92, th1: TAU - 0.92, nu: Math.max(10, sg(30, d)), nv: Math.max(5, sg(10, d)), clumps: 12, tip: 0.28, thick: 0.011,
          ph: f => 0.5 + 0.4 * bell(f, 0.5, 0.28), len: f => 0.4 - 0.06 * (1 - bell(f, 0.5, 0.3)),
          path: f => ({ dir: V3(0, -1, -0.1), base, lift0: -0.004, lift1: 0.022, fall: { y: -0.05, body: push, out: V3(Math.sin(lerp(0.92, TAU - 0.92, f)) * 0.35, 0, -0.15), k: 0.35 } }),
        }), "back", "hair", "root", "back", true);
        pivots = { back: V3(0, 0.0, -0.14), tail: V3(0, -0.16, -0.18) };
      }
      vol = { r: 1.12, top: 0.176 };
      break;
    }

    case "bowl": {
      // sous-coupe rasée + bol épais coupé à l'horizontale, stries verticales
      mass({ lift: () => 0.0016, tone: () => 0.35, sb: 0.12 }, "cap", "shaved", "skin");
      const cut = 0.052, nu = sg(36, d), rows = [], nr = sg(9, d);
      const phc = Math.asin(cut / E.y);
      rows.push([phc - 0.004, -0.0005], [phc, 0.019]);
      for (let i = 1; i <= nr; i++) rows.push([lerp(phc, PI / 2, i / nr), 0.019 + 0.006 * (i / nr)]);
      const pos = [], tone = [], idx = [];
      for (let j = 0; j < rows.length; j++) for (let i = 0; i <= nu; i++) {
        const th = -PI + (i / nu) * TAU, [ph, lift] = rows[j], r = H.sph(th, ph, lift);
        pos.push(r.p.x, r.p.y, r.p.z); tone.push(0.28 * Math.pow(Math.sin(th * 18), 2) * (j ? 1 : 0.5) + 0.2 * (j < 2 ? 1 : 0) - 0.1 * (j > 3 ? 1 : 0));
      }
      for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, dd = c + 1; idx.push(a, b, c, b, dd, c); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("tone", new THREE.Float32BufferAttribute(tone, 1));
      g.setIndex(idx); g.computeVertexNormals();
      add(g, "top", "hair", "root");
      vol = { r: 1.2, top: 0.185 };
      break;
    }

    case "bun":
    case "ponytail": {
      const bun = style === "bun";
      const tieP = bun ? H.sph(PI, 0.95, 0.012) : H.sph(PI, 0.42, 0.014);
      mass({ lift: thick(0.006, 0.01, 0.009), tone: (th, ph, din) => 0.3 * (1 - smoothstep(0, 0.1, din)) + 0.12 * Math.pow(Math.sin(th * 10), 2), sb: 0.05 });
      // mèches tirées vers l'attache
      for (let i = 0; i < N(14); i++) {
        const th = lerp(-PI * 0.8, PI * 0.8, i / (N(14) - 1)), ph = hlS(th) + 0.03;
        const o = { th, ph, len: 0.3, n: 7, base, lift0: -0.001, lift1: 0.001, w: 0.026, h: 0.006, flatBack: true, tipT: 0.15, rootT: 0.3 };
        const path = lockPath(H, { ...o, dir: tieP.p.clone().sub(H.sph(th, ph).p), bend: V3(0, bun ? 0.3 : -0.2, -1), bendK: 0.3 });
        let k = path.pts.length;
        for (let j = 1; j < path.pts.length; j++) if (path.pts[j].distanceTo(tieP.p) < 0.03) { k = j + 1; break; }
        add(lockGeo({ pts: path.pts.slice(0, Math.max(2, k)), nrm: path.nrm.slice(0, Math.max(2, k)) }, { seg, ...o }), "top", "hair", "root", "head", false);
      }
      if (bun) {
        const c = tieP.p.clone().addScaledVector(tieP.n, 0.03);
        add(ell(0.05, 0.045, 0.05, d, 14, 10).translate(c.x, c.y, c.z), "top", "hair", "root");
        const tw = [];
        for (let k = 0; k <= 10; k++) { const a = (k / 10) * TAU * 1.1; tw.push(V3(c.x + Math.cos(a) * 0.046, c.y + 0.012 - k * 0.0025, c.z + Math.sin(a) * 0.046)); }
        add(lockGeo({ pts: tw, nrm: tw.map(p => p.clone().sub(c).normalize()) }, { seg, w: 0.014, h: 0.009, taper: 4, tipT: -0.1, rootT: 0.2 }), "top", "hair", "root", "head", false);
        add(new THREE.TorusGeometry(0.036, 0.007, 5, sg(12, d)).lookAt(tieP.n).translate(...tieP.p.clone().addScaledVector(tieP.n, 0.006).toArray()), "top", "tie", null, "head", false);
        vol = { r: 1.05, top: 0.215 };
      } else {
        add(new THREE.TorusGeometry(0.021, 0.0075, 5, sg(10, d)).lookAt(tieP.n).translate(...tieP.p.clone().addScaledVector(tieP.n, 0.004).toArray()), "back", "tie", null, "head", false);
        // queue : faisceau de mèches serrées qui tombe dans le dos
        const nt = N(8);
        for (let i = 0; i < nt; i++) {
          const a = (i / nt) * TAU, off = V3(Math.cos(a) * 0.009, Math.sin(a) * 0.009, 0);
          const pts = [], nrm = [];
          let p = tieP.p.clone().add(off).addScaledVector(tieP.n, 0.012), fd = V3(0, -0.2, -1).normalize();
          for (let k = 0; k <= 8; k++) {
            pts.push(p.clone()); nrm.push(V3(Math.cos(a), 0, -Math.abs(Math.sin(a)) - 0.3).normalize());
            fd.lerp(V3(off.x * 6, -1, -0.1), 0.35).normalize(); p = p.clone().addScaledVector(fd, 0.036); push(p);
          }
          add(lockGeo({ pts, nrm }, { seg, w: 0.017, h: 0.011, taper: 2.2, root: 0.7, tipT: 0.3 }), "back", "hair", "root", "back", i % 2 === 0);
        }
        pivots = { back: V3(0, 0.06, -0.16), tail: V3(0, -0.1, -0.2) };
      }
      break;
    }

    case "dreads": {
      mass({ lift: () => 0.008, tone: (th, ph) => 0.35 * Math.pow(Math.abs(Math.sin(th * 5) * Math.sin(ph * 9)), 3), sb: 0.1 }, "cap", "hair", "root");
      const nd = N(22);
      for (const [th, ph] of roots(nd, [-PI, PI], [0.3, 1.45], (t, p) => p > hlS(t) + 0.06)) {
        const at = Math.abs(Math.atan2(Math.sin(th), Math.cos(th))), front = at < 1.0;
        const len = front ? 0.1 + R() * 0.03 : 0.2 + 0.1 * smoothstep(1.2, 2.6, at) + R() * 0.04;
        const dir = front ? V3(Math.sin(th) * 1.2, 0.3, -0.8) : V3(Math.sin(th) * 0.6, -0.2, Math.cos(th) * 0.6 - 0.4);
        lock({ th, ph, dir, len, n: 7, base, lift0: 0.0, lift1: 0.008, w: 0.011, h: 0.011,
          wf: s => (1 + 0.12 * Math.sin(s * 26)) * (s > 0.92 ? 0.6 : 1), hf: s => (1 + 0.12 * Math.sin(s * 26)) * (s > 0.92 ? 0.6 : 1),
          bend: front ? V3(Math.sign(th) || 1, -0.5, -1) : V3(0, -1, 0), bendK: 0.3, fall: { y: front ? -0.02 : 0.02, body: push, out: V3(Math.sin(th) * 0.5, 0, Math.cos(th) * 0.1 - 0.25), k: 0.35 }, tipT: 0.15, rootT: 0.4 }, "back", at > 1.3 ? "back" : "head", true);
      }
      pivots = { back: V3(0, 0.02, -0.13), tail: V3(0, -0.16, -0.17) };
      vol = { r: 1.12, top: 0.18 };
      break;
    }

    default:
      return hairStyle("short", H, d, C, torso, hs);
  }
  // fusion des mèches par catégorie / couleur / poids / contour (moins de parties)
  const groups = new Map();
  for (const p of parts) {
    const k = `${p.cat}|${p.tone}|${p.fade}|${p.w}|${p.o}`;
    if (!groups.has(k)) groups.set(k, { ...p, list: [] });
    const g = p.g;
    if (!g.attributes.tone) g.setAttribute("tone", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const a of Object.keys(g.attributes)) if (!["position", "normal", "tone"].includes(a)) g.deleteAttribute(a);
    groups.get(k).list.push(g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]));
  }
  const merged = [...groups.values()].map(gp => ({ g: gp.list.length > 1 ? mergeGeometries(gp.list) : gp.list[0], cat: gp.cat, tone: gp.tone, fade: gp.fade, w: gp.w, o: gp.o }));
  // volume pour les couvre-chefs : hauteur max et rayon apparent
  if (!vol) {
    let top = E.y, r = 1;
    for (const p of merged) {
      if (p.cat === "back") continue;
      const a = p.g.attributes.position;
      for (let i = 0; i < a.count; i++) { const y = a.getY(i); if (y > top) top = y; if (y > 0) r = Math.max(r, Math.hypot(a.getX(i) / E.x, a.getZ(i) / E.z)); }
    }
    vol = { r: Math.min(1.6, r), top };
  }
  return { parts: merged, vol, pivots };
}
