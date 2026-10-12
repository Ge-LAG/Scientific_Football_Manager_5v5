// Corps et tenues : tronc, membres, mains, pieds et 8 tenues. La couleur d'équipe reste toujours lisible
// (zones « team » : maillot, chemise, tabard, pourpoint, panneaux lumineux, brassards...).
import * as THREE from "three";
import { shape, bake, rings, sweep, twoSided, splitSides, flatShape, ellipseShape, ell, sg, V3, smoothstep, lerp, orient, subdivide } from "./kit.js";
import { B, torsoW, legW, armW, skirtW } from "./skeleton.js";

const TAU = Math.PI * 2;
export const KEEPER = { jersey: "#f4c20d", sleeve: "#15151c", glove: "#d8ff3a" };
const METAL = "#c9ced8", GOLD = "#e8b93a", DARK = "#15151c";

const LEG_KNOTS = [1.0, 0.93, 0.82, 0.68, 0.585, 0.56, 0.53, 0.505, 0.48, 0.44, 0.34, 0.22, 0.13, 0.085];
const ARM_KNOTS = [1.445, 1.4, 1.37, 1.27, 1.2, 1.16, 1.14, 1.12, 1.1, 1.07, 0.98, 0.9, 0.875];

// Hauteurs échantillonnées (ordre croissant) entre deux bornes
function ys(knots, a, b, step) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const set = [lo, hi, ...knots.filter(k => k > lo + 1e-4 && k < hi - 1e-4)].sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < set.length; i++) {
    out.push(set[i]);
    if (i < set.length - 1) {
      const n = Math.floor((set[i + 1] - set[i]) / step);
      for (let k = 1; k <= n; k++) out.push(set[i] + ((set[i + 1] - set[i]) * k) / (n + 1));
    }
  }
  return out;
}
const openAt = (open, y) => {
  if (!open) return 0;
  if (y <= open[0][0]) return open[0][1];
  for (let i = 0; i < open.length - 1; i++) if (y <= open[i + 1][0]) return lerp(open[i][1], open[i + 1][1], (y - open[i][0]) / (open[i + 1][0] - open[i][0]));
  return open[open.length - 1][1];
};
const kk = o => JSON.stringify(o);
// Décalage d une bande évasée (même loi que torsoRingList) : pour poser motifs et liserés dessus
const flareOff = (base, flare, y0, y1) => y => base + flare * smoothstep(y0 + (y1 - y0) * 0.7, y0, y);
// Rectangle arrondi (écussons, patchs)
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s, 4);
}

// ── Tronc ──
function torsoRingList(M, y0, y1, off, o) {
  const L = ys(M.torso.map(t => t.y), y0, y1, 0.045).map(y => {
    const t = M.torsoAt(y), f = (o.flare || 0) * smoothstep(y0 + (y1 - y0) * 0.7, y0, y), h = openAt(o.open, y);
    const [a0, a1] = o.range || [h, TAU - h];
    return { y, rx: t.rx + off + f, rz: t.rz + off + f, z: t.z, th0: a0, th1: a1, capH: 0.012 };
  });
  const at = (y, v, r) => { const t = M.torsoAt(y); return { ...r, rx: t.rx + v, rz: t.rz + v }; };
  if (o.lipB != null) L.unshift(at(y0, o.lipB, L[0]), { ...L[0] });
  if (o.lipT != null) L.push({ ...L[L.length - 1] }, at(y1, o.lipT, L[L.length - 1]));
  return L;
}
export function torsoBand(ctx, y0, y1, off, o = {}) {
  return shape(`${ctx.key}|tb|${y0}|${y1}|${off}|${kk(o)}`, () => {
    const L = torsoRingList(ctx.M, y0, y1, off, o);
    return bake([[rings(L, sg(24, ctx.d), { capB: !!o.capB, capT: !!o.capT, full: !o.open && !o.range }), o.w || torsoW]]);
  });
}
// Coque ouverte à 2 faces (manteau, veste) : { out, inn }
function torsoShell(ctx, y0, y1, off, o) {
  const k = `${ctx.key}|ts|${y0}|${y1}|${off}|${kk(o)}`;
  const out = shape(k + "o", () => {
    const [a, b] = splitSides(twoSided(rings(torsoRingList(ctx.M, y0, y1, off, o), sg(24, ctx.d), { full: false }), 0.004));
    shape(k + "i", () => bake([[b, o.w || torsoW]]));
    return bake([[a, o.w || torsoW]]);
  });
  return { out, inn: shape(k + "i", () => null) };
}
// Jupe / pans : suspendus à la taille (yTop), évasés vers l'ourlet (yBot)
function skirtShell(ctx, yTop, yBot, off0, off1, o) {
  const k = `${ctx.key}|sk|${yTop}|${yBot}|${off0}|${off1}|${kk(o)}`;
  const out = shape(k + "o", () => {
    const M = ctx.M, t = M.torsoAt(yTop), n = Math.max(3, Math.round((yTop - yBot) / 0.05));
    const L = [];
    for (let i = n; i >= 0; i--) {
      const u = i / n, y = lerp(yTop, yBot, u), f = lerp(off0, off1, u * u * 0.4 + u * 0.6);
      L.push({ y, rx: t.rx + f, rz: t.rz + f * 0.9, z: t.z - 0.01 * u, th0: o.th0 + (o.dth || 0) * u, th1: o.th1 - (o.dth || 0) * u });
    }
    const [a, b] = splitSides(twoSided(rings(L, sg(o.seg || 22, ctx.d), { full: false }), 0.004));
    const w = o.w || skirtW(yTop, yBot, o.follow ?? 0.55, o.back ?? 0.9);
    shape(k + "i", () => bake([[b, w]]));
    return bake([[a, w]]);
  });
  return { out, inn: shape(k + "i", () => null) };
}

// Point et normale sur la surface du tronc (angle 0 = devant, croît vers +X)
export function onTorso(M, y, ang, off) {
  const t = M.torsoAt(y), rx = t.rx + off, rz = t.rz + off;
  const p = V3(rx * Math.sin(ang), y, t.z + rz * Math.cos(ang));
  const n = V3(Math.sin(ang) / rx, 0, Math.cos(ang) / rz).normalize();
  return { p, n };
}
// Enroule une forme plate (x = abscisse curviligne, y = hauteur relative) sur le tronc
export function wrapTorso(g0, M, y, ang, off) {
  const g = subdivide(g0, 0.018), p = g.attributes.position, nor = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const yy = y + p.getY(i), t = M.torsoAt(yy), o = typeof off === "function" ? off(yy) : off, rx = t.rx + o, rz = t.rz + o;
    const ds = Math.hypot(rx * Math.cos(ang), rz * Math.sin(ang));
    const a = ang + p.getX(i) / ds;
    p.setXYZ(i, rx * Math.sin(a), yy, t.z + rz * Math.cos(a));
    const n = V3(Math.sin(a) / rx, 0, Math.cos(a) / rz).normalize();
    nor[i * 3] = n.x; nor[i * 3 + 1] = n.y; nor[i * 3 + 2] = n.z;
  }
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return g;
}

// ── Membres ──
function limbCenter(M, kind, side) {
  const s = side ? -1 : 1;
  return kind === "leg" ? { cx: s * M.hipX, cz: 0, rf: M.legR, knots: LEG_KNOTS, w: legW(side) } : { cx: s * M.shX, cz: -0.004, rf: M.armR, knots: ARM_KNOTS, w: armW(side) };
}
export function limbBand(ctx, kind, side, yTop, yBot, off, o = {}) {
  return shape(`${ctx.key}|lb|${kind}|${side}|${yTop}|${yBot}|${off}|${kk(o)}`, () => {
    const M = ctx.M, { cx, cz, rf, knots, w } = limbCenter(M, kind, side);
    const out = side && o.th ? [-o.th[1], -o.th[0]] : o.th;
    const L = ys(knots, yBot, yTop, 0.05).map(y => {
      const t = (yTop - y) / (yTop - yBot), r = rf(y) + off + (o.flare || 0) * t + (o.bulge || 0) * Math.sin(Math.PI * t);
      return { y, rx: r, rz: r * (o.flat || 1), x: cx, z: cz, ...(out ? { th0: out[0], th1: out[1] } : {}) };
    });
    const at = (y, v, r) => ({ ...r, rx: rf(y) + v, rz: (rf(y) + v) * (o.flat || 1) });
    if (o.lipB != null) L.unshift(at(yBot, o.lipB, L[0]), { ...L[0] });
    if (o.lipT != null) L.push({ ...L[L.length - 1] }, at(yTop, o.lipT, L[L.length - 1]));
    let g = rings(L, sg(o.seg || 14, ctx.d), { full: !out, capB: !!o.capB });
    if (out) g = twoSided(g, 0.003);
    return bake([[g, w]]);
  });
}
// Enroule une forme plate sur un membre (angle 0 = devant ; « outer » = côté extérieur)
function wrapLimb(g0, M, kind, side, y, ang, off) {
  const { cx, cz, rf } = limbCenter(M, kind, side);
  const g = subdivide(g0, 0.014), p = g.attributes.position, nor = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const yy = y + p.getY(i), r = rf(yy) + off, a = ang + p.getX(i) / r;
    p.setXYZ(i, cx + r * Math.sin(a), yy, cz + r * Math.cos(a));
    nor[i * 3] = Math.sin(a); nor[i * 3 + 1] = 0; nor[i * 3 + 2] = Math.cos(a);
  }
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return g;
}
const outerAng = side => (side ? -Math.PI / 2 : Math.PI / 2);

// ── Contexte : ajout de parties ──
function put(ctx, s, c, g = 0, o = true) { if (s) ctx.parts.push({ s, c, g, o }); }
const both = fn => { fn(0); fn(1); };

// Cou (peau) : musclé, légèrement penché vers l'avant, évasé vers les trapèzes ; pomme d'Adam
function neck(ctx) {
  const M = ctx.M, k = M.K.neck;
  const L = [[1.412, 0.09, 0.072, -0.014], [1.44, 0.083, 0.069, -0.013], [1.47, 0.076, 0.066, -0.01], [1.51, 0.071, 0.064, -0.006],
    [1.55, 0.069, 0.063, -0.001], [1.6, 0.066, 0.06, 0.004]].map(([y, rx, rz, z]) => ({ y, rx: rx * k, rz: rz * k, z }));
  const w = (x, y) => { const a = smoothstep(1.43, 1.49, y), b = smoothstep(1.55, 1.6, y); return [[B.chest, 1 - a], [B.neck, a * (1 - b)], [B.head, a * b]]; };
  put(ctx, shape(`${ctx.key}|neck`, () => bake([[rings(L, sg(14, ctx.d)), w],
    [ell(0.011, 0.017, 0.009, ctx.d, 8, 6).rotateX(0.25).translate(0, 1.515, -0.006 + 0.064 * k - 0.003), w]], { smooth: true })), ctx.col.skin);
}

// Mains (ou gants de gardien)
function hands(ctx, color = ctx.col.skin) {
  const M = ctx.M, keeper = ctx.col.keeper;
  both(side => {
    const s = side ? -1 : 1, x = s * M.shX, y = M.wrY, bone = side ? B.handR : B.handL;
    if (keeper) {
      put(ctx, shape(`${ctx.key}|glove|${side}`, () => bake([
        [ell(0.03, 0.062, 0.05, ctx.d).translate(x, y - 0.058, 0.004), bone],
        [ell(0.03, 0.052, 0.048, ctx.d).translate(x - s * 0.002, y - 0.118, 0.01), bone],
        [ell(0.02, 0.042, 0.022, ctx.d, 10, 8).rotateX(-0.5).translate(x - s * 0.012, y - 0.058, 0.05), bone],
      ])), KEEPER.glove, 0.18);
      put(ctx, shape(`${ctx.key}|gcuff|${side}`, () => bake([[new THREE.CylinderGeometry(0.047, 0.043, 0.055, sg(14, ctx.d)).translate(x, y - 0.01, -0.004), bone]])), ctx.col.teamRaw, 0.1);
      return;
    }
    put(ctx, shape(`${ctx.key}|hand|${side}`, () => bake([
      [ell(0.034, 0.034, 0.034, ctx.d, 10, 8).translate(x, y + 0.004, -0.004), bone],
      [ell(0.022, 0.044, 0.035, ctx.d, 12, 8).translate(x, y - 0.046, 0.004), bone],
      [ell(0.02, 0.036, 0.032, ctx.d, 12, 8).translate(x - s * 0.002, y - 0.086, 0.008), bone],
      [ell(0.013, 0.026, 0.013, ctx.d, 8, 6).rotateX(-0.45).translate(x - s * 0.01, y - 0.044, 0.034), bone],
    ])), color);
  });
}

// Pieds : boot | shoe | sandal | paw | sleek
function feet(ctx, type, o = {}) {
  const M = ctx.M, shoe = o.color || ctx.col.shoe;
  both(side => {
    const s = side ? -1 : 1, x = s * M.hipX, bone = side ? B.footR : B.footL, d = ctx.d, k = `${ctx.key}|ft|${type}|${side}`;
    const upper = (h = 0.048, l = 0.125) => [
      [ell(0.051, h, l, d, 14, 9).translate(x, 0.052, 0.046), bone],
      [ell(0.048, 0.046, 0.062, d, 12, 8).translate(x, 0.066, -0.022), bone],
      [ell(0.044, 0.03, 0.05, d, 12, 6).translate(x, 0.1, -0.006), bone],
    ];
    if (type === "boot" || type === "sleek") {
      put(ctx, shape(k, () => bake(upper())), shoe);
      put(ctx, shape(k + "s", () => bake([[new THREE.BoxGeometry(0.1, 0.016, 0.25).translate(x, 0.009, 0.045), bone]])), type === "sleek" ? ctx.col.acc : o.sole || ctx.col.trim, type === "sleek" ? 1 : 0.55);
      if (type === "boot" && ctx.q === "high") put(ctx, shape(k + "st", () => bake([-0.06, 0.02, 0.1, 0.14].map(z => [new THREE.CylinderGeometry(0.009, 0.007, 0.012, 6).translate(x, -0.002, z), bone]))), "#d8dbe2", 0, false);
      if (type === "sleek") put(ctx, shape(k + "g", () => bake([[new THREE.TorusGeometry(0.047, 0.006, 5, sg(16, d)).rotateX(Math.PI / 2).translate(x, 0.105, -0.006), bone]])), ctx.col.team, 1, false);
    } else if (type === "shoe") {
      put(ctx, shape(k, () => bake(upper(0.042, 0.122))), shoe);
      put(ctx, shape(k + "s", () => bake([[new THREE.BoxGeometry(0.098, 0.016, 0.245).translate(x, 0.008, 0.045), bone]])), o.sole || "#2a1d14");
    } else if (type === "sandal") {
      put(ctx, shape(k, () => bake([[ell(0.047, 0.04, 0.118, d, 14, 9).translate(x, 0.05, 0.048), bone], [ell(0.044, 0.042, 0.06, d, 10, 8).translate(x, 0.062, -0.02), bone]])), o.sock || "#f4f4f4");
      put(ctx, shape(k + "s", () => bake([[new THREE.BoxGeometry(0.104, 0.024, 0.255).translate(x, 0.012, 0.045), bone]])), "#6b4a2e");
      put(ctx, shape(k + "st", () => bake([0.09, 0.0].map(z => [new THREE.TorusGeometry(0.052, 0.009, 5, sg(12, d), Math.PI).scale(1, 0.95, 1.4).translate(x, 0.024, z), bone]))), shoe);
    } else if (type === "paw") {
      put(ctx, shape(k, () => bake([
        [ell(0.066, 0.056, 0.14, d, 14, 9).translate(x, 0.052, 0.058), bone],
        ...[-0.032, 0, 0.032].map(dx => [ell(0.024, 0.022, 0.028, d, 8, 6).translate(x + dx, 0.032, 0.19), bone]),
      ])), o.pink || "#f29bb0");
    }
  });
}

// Épaules (deltoïdes) couvrant l'articulation
function shoulders(ctx, color, off = 0.01, g = 0) {
  const M = ctx.M;
  both(side => {
    const s = side ? -1 : 1, bone = side ? B.upperArmR : B.upperArmL, r = M.armR(1.44) + off + 0.004;
    put(ctx, shape(`${ctx.key}|sh|${side}|${off}`, () => bake([[ell(r * 1.02, r * 0.95, r * 0.98, ctx.d, 14, 10).translate(s * (M.shX - 0.006), M.shY - 0.012, -0.004), bone]])), color, g);
  });
}
const skinArms = (ctx, yTop) => both(side => put(ctx, limbBand(ctx, "arm", side, yTop, 0.875, 0), ctx.col.skin));

// ════════════════════════ Tenues ════════════════════════

function footballer(ctx) {
  const { M, col } = ctx, jer = col.team, sh = col.team2, trim = col.trim, d = ctx.d;
  put(ctx, torsoBand(ctx, 0.842, 1.0, 0.014, { capB: true }), sh);
  put(ctx, torsoBand(ctx, 0.985, 1.462, 0.012, { flare: 0.012, lipB: 0.014, capT: true }), jer);
  // col en V + liserés latéraux + écusson
  put(ctx, shape(`${ctx.key}|fb|collar`, () => {
    const t = M.torsoAt(1.446);
    return bake([[new THREE.TorusGeometry(1, 0.13, 6, sg(22, d)).rotateX(Math.PI / 2).scale(t.rx + 0.012, 1, t.rz + 0.012).scale(1, 0.1, 1).translate(0, 1.446, t.z), torsoW]]);
  }), trim, 0.35);
  put(ctx, shape(`${ctx.key}|fb|vneck`, () => bake([[wrapTorso(flatShape([[-0.05, 0.05], [-0.034, 0.05], [0, 0.004], [0.034, 0.05], [0.05, 0.05], [0, -0.014]]), M, 1.39, 0, 0.0135), torsoW]])), trim, 0.35, false);
  put(ctx, shape(`${ctx.key}|fb|stripes`, () => bake([Math.PI / 2, -Math.PI / 2].map(a => [wrapTorso(new THREE.PlaneGeometry(0.024, 0.34, 1, 6), M, 1.2, a, flareOff(0.0135, 0.012, 0.985, 1.462)), torsoW]))), trim, 0.5, false);
  put(ctx, shape(`${ctx.key}|fb|crest`, () => bake([[wrapTorso(new THREE.CircleGeometry(0.026, sg(14, d)), M, 1.34, 0.42, 0.0135), torsoW]])), trim, 0.8, false);
  shoulders(ctx, col.keeper ? KEEPER.sleeve : jer, 0.013);
  both(side => {
    if (col.keeper) {
      put(ctx, limbBand(ctx, "arm", side, 1.445, 0.905, 0.012, { lipB: 0 }), KEEPER.sleeve);
      put(ctx, limbBand(ctx, "arm", side, 0.93, 0.9, 0.015, { lipB: 0, lipT: 0.012 }), trim, 0.35);
      put(ctx, limbBand(ctx, "arm", side, 0.905, 0.875, 0), col.skin);
    } else {
      put(ctx, limbBand(ctx, "arm", side, 1.445, 1.265, 0.013, { lipB: 0 }), jer);
      put(ctx, limbBand(ctx, "arm", side, 1.285, 1.25, 0.016, { lipB: 0, lipT: 0.013 }), trim, 0.35);
      put(ctx, limbBand(ctx, "arm", side, 1.26, 0.875, 0), col.skin);
    }
    put(ctx, limbBand(ctx, "leg", side, 1.0, 0.765, 0.022, { flare: 0.012 }), sh);
    put(ctx, limbBand(ctx, "leg", side, 0.775, 0.745, 0.036, { lipB: 0, lipT: 0.03 }), trim, 0.3);
    put(ctx, shape(`${ctx.key}|fb|shstripe|${side}`, () => bake([[wrapLimb(new THREE.PlaneGeometry(0.018, 0.2, 1, 4), M, "leg", side, 0.88, outerAng(side), 0.032), legW(side)]])), trim, 0.4, false);
    put(ctx, limbBand(ctx, "leg", side, 0.75, 0.55, 0), col.skin);
    put(ctx, limbBand(ctx, "leg", side, 0.575, 0.535, 0.013, { lipT: 0.008, lipB: 0.008 }), trim, 0.4);
    put(ctx, limbBand(ctx, "leg", side, 0.54, 0.085, 0.008, { lipT: 0 }), jer);
  });
  hands(ctx);
  feet(ctx, "boot");
  return { backOff: 0.014, frontOff: 0.013, backColor: jer };
}

function scientist(ctx) {
  const { M, col } = ctx, d = ctx.d, coat = "#eef1f6", coatIn = "#c3cad6", pants = "#2d3140", shirt = col.team;
  put(ctx, torsoBand(ctx, 0.842, 1.03, 0.013, { capB: true }), pants);
  put(ctx, torsoBand(ctx, 1.02, 1.462, 0.009, { capT: true }), shirt);
  const open = [[0.99, 0.2], [1.2, 0.26], [1.33, 0.42], [1.452, 0.9]];
  const sh = torsoShell(ctx, 0.99, 1.452, 0.032, { open });
  put(ctx, sh.out, coat); put(ctx, sh.inn, coatIn, 0, false);
  const sk = skirtShell(ctx, 1.0, 0.5, 0.032, 0.085, { th0: 0.2, th1: TAU - 0.2, dth: 0.18 });
  put(ctx, sk.out, coat); put(ctx, sk.inn, coatIn, 0, false);
  // passepoil couleur d'équipe le long de l'ouverture + col
  put(ctx, shape(`${ctx.key}|sc|piping`, () => {
    const edge = sgn => {
      const pts = [];
      for (let y = 0.52; y <= 1.0; y += 0.06) { const u = (1.0 - y) / 0.5, h = 0.2 + 0.18 * u, t = M.torsoAt(1.0), f = lerp(0.032, 0.085, u * u * 0.4 + u * 0.6); pts.push(V3(sgn * (t.rx + f) * Math.sin(h), y, t.z - 0.01 * u + (t.rz + f * 0.9) * Math.cos(h))); }
      for (let y = 1.03; y <= 1.45; y += 0.03) { const { p } = onTorso(M, y, sgn * openAt(open, y), 0.034); pts.push(p); }
      return pts;
    };
    const w = (x, y, z) => (y > 1.0 ? torsoW(x, y) : skirtW(1.0, 0.5)(x, y, z));
    return bake([[sweep(edge(1), 0.0065, 5), w], [sweep(edge(-1), 0.0065, 5), w]]);
  }), shirt, 0.25, false);
  put(ctx, shape(`${ctx.key}|sc|collar`, () => {
    const t = M.torsoAt(1.44);
    return bake([[new THREE.TorusGeometry(1, 0.22, 6, sg(18, d), TAU - 1.9).rotateX(Math.PI / 2).rotateY(-(Math.PI / 2 + 0.95)).scale(t.rx + 0.03, 1, t.rz + 0.03).scale(1, 0.1, 1).translate(0, 1.45, t.z - 0.006), torsoW]]);
  }), shirt, 0.1);
  // poche + stylos, demi-ceinture arrière, boutons
  put(ctx, shape(`${ctx.key}|sc|pocket`, () => bake([[wrapTorso(new THREE.PlaneGeometry(0.075, 0.07), M, 1.3, 0.62, 0.036), torsoW]])), "#dfe4ec", 0, false);
  put(ctx, shape(`${ctx.key}|sc|pockettop`, () => bake([[wrapTorso(new THREE.PlaneGeometry(0.077, 0.012), M, 1.335, 0.62, 0.0365), torsoW], [wrapTorso(new THREE.PlaneGeometry(0.2, 0.04), M, 1.06, Math.PI, 0.036), torsoW]])), shirt, 0.2, false);
  put(ctx, shape(`${ctx.key}|sc|pens`, () => bake([0.57, 0.68].map((a, i) => { const { p } = onTorso(M, 1.35, a, 0.04); return [new THREE.CylinderGeometry(0.006, 0.006, 0.06, 6).translate(p.x, 1.34 + i * 0.008, p.z), torsoW]; }))), col.acc, 0.6, false);
  put(ctx, shape(`${ctx.key}|sc|buttons`, () => bake([1.06, 1.18, 1.3].map(y => { const { p } = onTorso(M, y, -0.34, 0.036); return [ell(0.009, 0.009, 0.005, d, 8, 6).translate(p.x, p.y, p.z), torsoW]; }))), "#aab2c0", 0, false);
  shoulders(ctx, coat, 0.024);
  both(side => {
    put(ctx, limbBand(ctx, "arm", side, 1.445, 0.935, 0.024, { lipB: 0 }), coat);
    put(ctx, limbBand(ctx, "arm", side, 1.33, 1.25, 0.03, { lipB: 0.024, lipT: 0.024 }), shirt, 0.15);
    put(ctx, limbBand(ctx, "arm", side, 0.96, 0.925, 0.028, { lipB: 0, lipT: 0.024 }), shirt, 0.15);
    put(ctx, limbBand(ctx, "arm", side, 0.94, 0.875, 0), col.skin);
    put(ctx, limbBand(ctx, "leg", side, 1.0, 0.1, 0.02, { lipB: 0, flare: 0.006 }), pants);
  });
  hands(ctx);
  feet(ctx, "shoe");
  return { backOff: 0.034, frontOff: 0.011, backColor: coat };
}

function rockstar(ctx) {
  const { M, col } = ctx, d = ctx.d, jacket = "#1c1c23", jacketIn = "#32323d", denim = "#44649a", tee = col.team;
  put(ctx, torsoBand(ctx, 0.842, 1.02, 0.015, { capB: true }), denim);
  put(ctx, torsoBand(ctx, 0.99, 1.035, 0.022, { lipB: 0.015, lipT: 0.012 }), "#15151a");
  put(ctx, torsoBand(ctx, 1.02, 1.462, 0.011, { capT: true }), tee);
  put(ctx, shape(`${ctx.key}|rk|buckle`, () => { const { p } = onTorso(M, 1.012, 0, 0.024); return bake([[new THREE.BoxGeometry(0.05, 0.036, 0.01).translate(p.x, p.y, p.z), torsoW]]); }), METAL, 0.15);
  put(ctx, shape(`${ctx.key}|rk|bolt`, () => bake([[wrapTorso(flatShape([[0.012, 0.07], [-0.03, 0.0], [-0.002, 0.004], [-0.016, -0.07], [0.03, 0.012], [0.002, 0.008]]), M, 1.25, 0, 0.012), torsoW]])), col.trim, 0.7, false);
  const open = [[0.99, 0.42], [1.25, 0.5], [1.36, 0.72], [1.452, 1.05]];
  const sh = torsoShell(ctx, 0.985, 1.452, 0.03, { open });
  put(ctx, sh.out, jacket); put(ctx, sh.inn, jacketIn, 0, false);
  put(ctx, torsoBand(ctx, 0.975, 1.005, 0.036, { open: [[0.9, 0.42], [1.1, 0.42]], lipB: 0.012 }), jacket);
  put(ctx, shape(`${ctx.key}|rk|patch`, () => bake([[wrapTorso(roundRect(0.29, 0.32, 0.04), M, 1.255, Math.PI, 0.0335), torsoW]])), tee, 0.12, false);
  // revers larges + fermeture éclair + clous d'épaules
  put(ctx, shape(`${ctx.key}|rk|lapels`, () => bake([1, -1].map(s => [wrapTorso(flatShape([[0, 0.1], [s * 0.07, 0.07], [s * 0.05, -0.02], [0, -0.07]]), M, 1.33, s * 0.62, 0.034), torsoW]))), "#2a2a33", 0, false);
  put(ctx, shape(`${ctx.key}|rk|zip`, () => { const pts = []; for (let y = 0.99; y <= 1.35; y += 0.04) pts.push(onTorso(M, y, openAt(open, y), 0.033).p); return bake([[sweep(pts, 0.005, 4), torsoW]]); }), METAL, 0.15, false);
  both(side => {
    const s = side ? -1 : 1, bone = side ? B.upperArmR : B.upperArmL;
    put(ctx, shape(`${ctx.key}|rk|studs|${side}`, () => bake([-0.04, 0, 0.04].map(z => [orient(new THREE.ConeGeometry(0.011, 0.022, 6), V3(s * 0.3, 1, 0), V3(s * M.shX + s * 0.01, M.shY + 0.07, z)), bone]))), METAL, 0.2, false);
    put(ctx, limbBand(ctx, "arm", side, 1.445, 0.94, 0.022, { lipB: 0 }), jacket);
    put(ctx, limbBand(ctx, "arm", side, 1.31, 1.29, 0.025, { lipB: 0.022, lipT: 0.022 }), tee, 0.2);
    put(ctx, limbBand(ctx, "arm", side, 1.27, 1.25, 0.025, { lipB: 0.022, lipT: 0.022 }), tee, 0.2);
    put(ctx, limbBand(ctx, "arm", side, 0.945, 0.875, 0), col.skin);
    put(ctx, limbBand(ctx, "arm", side, 0.935, 0.895, 0.016, { lipB: 0, lipT: 0 }), tee, 0.25);
    put(ctx, shape(`${ctx.key}|rk|wstud|${side}`, () => { const { cx, cz, rf } = limbCenter(M, "arm", side), r = rf(0.915) + 0.017; return bake([0, 1, 2, 3, 4, 5].map(i => { const a = (i / 6) * TAU; return [ell(0.006, 0.006, 0.006, d, 6, 4).translate(cx + r * Math.sin(a), 0.915, cz + r * Math.cos(a)), B[side ? "forearmR" : "forearmL"]]; })); }), METAL, 0.3, false);
    put(ctx, limbBand(ctx, "leg", side, 1.0, 0.3, 0.02, { flare: 0.004 }), denim);
    put(ctx, shape(`${ctx.key}|rk|rip|${side}`, () => bake([[wrapLimb(ellipseShape(0.03, 0.022, 10), M, "leg", side, 0.52, 0, 0.0205), legW(side)]])), col.skin, 0, false);
    put(ctx, shape(`${ctx.key}|rk|fray|${side}`, () => bake([[wrapLimb(flatShape([[-0.032, 0.02], [0.032, 0.02], [0.03, 0.026], [-0.03, 0.026]]), M, "leg", side, 0.52, 0, 0.021), legW(side)], [wrapLimb(flatShape([[-0.032, -0.024], [0.032, -0.024], [0.03, -0.018], [-0.03, -0.018]]), M, "leg", side, 0.52, 0, 0.021), legW(side)]])), "#e8ecf2", 0, false);
    put(ctx, shape(`${ctx.key}|rk|seam|${side}`, () => bake([[wrapLimb(new THREE.PlaneGeometry(0.008, 0.62, 1, 10), M, "leg", side, 0.66, outerAng(side), 0.0215), legW(side)]])), "#2f4a78", 0, false);
    put(ctx, limbBand(ctx, "leg", side, 0.32, 0.085, 0.024, { lipT: 0.02 }), col.shoe);
    put(ctx, limbBand(ctx, "leg", side, 0.2, 0.18, 0.028, { lipT: 0.024, lipB: 0.024 }), METAL, 0.15);
  });
  shoulders(ctx, jacket, 0.022);
  hands(ctx);
  feet(ctx, "boot", { sole: "#2a2a2a" });
  return { backOff: 0.032, frontOff: 0.012, backColor: tee };
}

function medieval(ctx) {
  const { M, col } = ctx, d = ctx.d, mail = "#8f97a5", mailDk = "#6a7280", leather = "#5b3b22", hose = "#4a3526";
  put(ctx, torsoBand(ctx, 0.842, 1.462, 0.012, { capB: true, capT: true }), mail);
  put(ctx, torsoBand(ctx, 1.0, 1.43, 0.026, { lipT: 0.012 }), col.team);
  const front = skirtShell(ctx, 1.0, 0.66, 0.026, 0.05, { th0: -0.95, th1: 0.95, follow: 0.6, back: 0 });
  put(ctx, front.out, col.team); put(ctx, front.inn, col.team2, 0, false);
  const back = skirtShell(ctx, 1.0, 0.66, 0.026, 0.05, { th0: Math.PI - 0.95, th1: Math.PI + 0.95, follow: 0.3, back: 0.9 });
  put(ctx, back.out, col.team); put(ctx, back.inn, col.team2, 0, false);
  // blason (croix) + bordure
  put(ctx, shape(`${ctx.key}|md|cross`, () => bake([[wrapTorso(new THREE.PlaneGeometry(0.04, 0.2), M, 1.24, 0, 0.0275), torsoW], [wrapTorso(new THREE.PlaneGeometry(0.15, 0.04), M, 1.27, 0, 0.0275), torsoW]])), col.trim, 0.25, false);
  put(ctx, torsoBand(ctx, 0.985, 1.035, 0.036, { lipB: 0.026, lipT: 0.026 }), leather);
  put(ctx, shape(`${ctx.key}|md|buckle`, () => { const { p } = onTorso(M, 1.01, 0, 0.038); const q = onTorso(M, 1.0, 0.95, 0.04).p; return bake([[new THREE.TorusGeometry(0.017, 0.005, 4, 8).scale(1.3, 1, 1).translate(p.x, p.y, p.z), torsoW], [new THREE.BoxGeometry(0.05, 0.06, 0.03).translate(q.x, 0.97, q.z), torsoW]]); }), GOLD, 0.2);
  put(ctx, shape(`${ctx.key}|md|coif`, () => { const t = M.torsoAt(1.44); return bake([[new THREE.TorusGeometry(1, 0.28, 6, sg(18, d)).rotateX(Math.PI / 2).scale(t.rx + 0.02, 0.1, t.rz + 0.02).translate(0, 1.448, t.z), torsoW]]); }), mail, 0.04);
  shoulders(ctx, mail, 0.014, 0.04);
  both(side => {
    put(ctx, limbBand(ctx, "arm", side, 1.445, 0.97, 0.013, { lipB: 0 }), mail, 0.04);
    if (ctx.q !== "low") for (const y of [1.36, 1.27, 1.18, 1.09]) put(ctx, limbBand(ctx, "arm", side, y, y - 0.012, 0.0145), mailDk, 0, false);
    put(ctx, limbBand(ctx, "arm", side, 1.0, 0.9, 0.02, { lipB: 0, lipT: 0.013 }), leather);
    put(ctx, limbBand(ctx, "arm", side, 0.905, 0.875, 0), col.skin);
    put(ctx, limbBand(ctx, "leg", side, 1.0, 0.33, 0.012), hose);
    put(ctx, limbBand(ctx, "leg", side, 0.37, 0.085, 0.022, { lipT: 0.012 }), col.shoe);
    put(ctx, limbBand(ctx, "leg", side, 0.4, 0.35, 0.034, { lipT: 0.022, lipB: 0.022, flare: 0.004 }), col.shoe);
  });
  hands(ctx);
  feet(ctx, "boot", { sole: "#3a281a" });
  return { backOff: 0.028, frontOff: 0.028, backColor: col.team };
}

function renaissance(ctx) {
  const { M, col } = ctx, d = ctx.d, hoseC = col.team2, slash = col.trim;
  put(ctx, torsoBand(ctx, 0.842, 0.97, 0.02, { capB: true }), col.team);
  put(ctx, torsoBand(ctx, 0.96, 1.462, 0.014, { capT: true }), col.team);
  const pep = skirtShell(ctx, 1.0, 0.9, 0.016, 0.05, { th0: 0.15, th1: TAU - 0.15, follow: 0.4, back: 0.4 });
  put(ctx, pep.out, col.team); put(ctx, pep.inn, slash, 0.1, false);
  put(ctx, shape(`${ctx.key}|rn|slashes`, () => bake([-0.44, -0.22, 0.22, 0.44].map(a => [wrapTorso(new THREE.PlaneGeometry(0.018, 0.26, 1, 5), M, 1.23, a, 0.0155), torsoW]))), slash, 0.25, false);
  put(ctx, shape(`${ctx.key}|rn|buttons`, () => bake([1.06, 1.13, 1.2, 1.27, 1.34, 1.41].map(y => { const { p } = onTorso(M, y, 0, 0.016); return [ell(0.009, 0.009, 0.007, d, 8, 6).translate(p.x, p.y, p.z), torsoW]; }))), GOLD, 0.3, false);
  put(ctx, shape(`${ctx.key}|rn|collar`, () => bake([[new THREE.CylinderGeometry(0.082 * M.K.neck, 0.088 * M.K.neck, 0.06, sg(16, d), 1, true).translate(0, 1.475, -0.008), torsoW]])), col.team);
  both(side => {
    const s = side ? -1 : 1, ub = side ? B.upperArmR : B.upperArmL;
    put(ctx, shape(`${ctx.key}|rn|puff|${side}`, () => bake([[ell(0.085, 0.12, 0.085, d, 16, 10).translate(s * M.shX, 1.33, -0.004), ub]])), col.team);
    put(ctx, shape(`${ctx.key}|rn|puffsl|${side}`, () => bake([0, 1, 2, 3, 4, 5].map(i => { const a = (i / 6) * TAU + 0.3; return [ell(0.012, 0.09, 0.012, d, 6, 6).translate(s * M.shX + 0.082 * Math.sin(a), 1.33, -0.004 + 0.082 * Math.cos(a)), ub]; }))), slash, 0.2, false);
    put(ctx, limbBand(ctx, "arm", side, 1.24, 0.925, 0.012, { lipB: 0 }), col.team);
    put(ctx, shape(`${ctx.key}|rn|lace|${side}`, () => { const { cx, cz } = limbCenter(M, "arm", side); return bake([[twoSided(new THREE.CylinderGeometry(0.04, 0.06, 0.045, sg(14, d), 1, true).translate(cx, 0.9, cz)), B[side ? "forearmR" : "forearmL"]]]); }), "#f6f3ea");
    put(ctx, limbBand(ctx, "arm", side, 0.93, 0.875, 0), col.skin);
    put(ctx, limbBand(ctx, "leg", side, 1.0, 0.74, 0.02, { bulge: 0.05, capB: false }), col.team);
    put(ctx, shape(`${ctx.key}|rn|panes|${side}`, () => { const { cx, cz, rf } = limbCenter(M, "leg", side); return bake([0, 1, 2, 3, 4, 5, 6].map(i => { const a = (i / 7) * TAU; const r = rf(0.87) + 0.066; return [ell(0.014, 0.1, 0.014, d, 6, 6).translate(cx + r * Math.sin(a), 0.87, cz + r * Math.cos(a)), legW(side)]; })); }), slash, 0.2, false);
    put(ctx, limbBand(ctx, "leg", side, 0.76, 0.085, 0.005), hoseC);
  });
  hands(ctx);
  feet(ctx, "shoe", { sole: "#1b1b1b" });
  put(ctx, shape(`${ctx.key}|rn|rosette`, () => bake([0, 1].map(side => [ell(0.024, 0.014, 0.024, d, 8, 6).translate((side ? -1 : 1) * M.hipX, 0.085, 0.1), side ? B.footR : B.footL]))), slash, 0.3, false);
  return { backOff: 0.016, frontOff: 0.016, backColor: col.team };
}

function futuristic(ctx) {
  const { M, col } = ctx, d = ctx.d, base = "#1c2029", team = col.team;
  put(ctx, torsoBand(ctx, 0.842, 1.462, 0.011, { capB: true, capT: true }), base);
  put(ctx, torsoBand(ctx, 1.18, 1.41, 0.024, { range: [-1.05, 1.05], lipB: 0.011, lipT: 0.011 }), team, 0.12);
  put(ctx, torsoBand(ctx, 1.08, 1.41, 0.024, { range: [Math.PI - 0.95, Math.PI + 0.95], lipB: 0.011, lipT: 0.011 }), team, 0.12);
  put(ctx, shape(`${ctx.key}|ft|lines`, () => bake([
    ...[-0.36, 0.36].map(a => [wrapTorso(new THREE.PlaneGeometry(0.009, 0.2, 1, 5), M, 1.07, a, 0.0125), torsoW]),
    ...[Math.PI - 0.5, Math.PI + 0.5].map(a => [wrapTorso(new THREE.PlaneGeometry(0.009, 0.46, 1, 8), M, 1.17, a, 0.0125), torsoW]),
    [wrapTorso(new THREE.PlaneGeometry(1.2, 0.009, 24, 1), M, 1.0, 0, 0.0125), torsoW],
    [wrapTorso(new THREE.PlaneGeometry(1.2, 0.009, 24, 1), M, 1.0, Math.PI, 0.0125), torsoW],
  ])), team, 1, false);
  put(ctx, shape(`${ctx.key}|ft|core`, () => bake([[wrapTorso(new THREE.CircleGeometry(0.03, sg(16, d)), M, 1.3, 0, 0.0255), torsoW]])), col.acc, 1, false);
  put(ctx, shape(`${ctx.key}|ft|corering`, () => bake([[wrapTorso(new THREE.RingGeometry(0.034, 0.042, sg(18, d)), M, 1.3, 0, 0.0255), torsoW]])), base, 0, false);
  put(ctx, shape(`${ctx.key}|ft|collar`, () => bake([[new THREE.CylinderGeometry(0.084 * M.K.neck, 0.096 * M.K.neck, 0.05, sg(16, d), 1, true).translate(0, 1.47, -0.008), torsoW]])), base);
  put(ctx, shape(`${ctx.key}|ft|collarglow`, () => bake([[new THREE.TorusGeometry(0.086 * M.K.neck, 0.005, 4, sg(16, d)).rotateX(Math.PI / 2).translate(0, 1.495, -0.008), torsoW]])), team, 1, false);
  both(side => {
    const s = side ? -1 : 1, ub = side ? B.upperArmR : B.upperArmL;
    put(ctx, shape(`${ctx.key}|ft|pad|${side}`, () => bake([[ell(0.085, 0.05, 0.078, d, 16, 8).rotateZ(-s * 0.35).translate(s * (M.shX + 0.012), M.shY + 0.045, -0.004), ub]])), team, 0.12);
    put(ctx, limbBand(ctx, "arm", side, 1.445, 0.905, 0.011, { lipB: 0 }), base);
    put(ctx, limbBand(ctx, "arm", side, 1.08, 0.94, 0.021, { lipB: 0.011, lipT: 0.011 }), team, 0.12);
    put(ctx, shape(`${ctx.key}|ft|aline|${side}`, () => bake([[wrapLimb(new THREE.PlaneGeometry(0.008, 0.2, 1, 5), M, "arm", side, 1.28, outerAng(side), 0.012), armW(side)]])), team, 1, false);
    put(ctx, limbBand(ctx, "arm", side, 0.93, 0.905, 0.014, { lipB: 0.011, lipT: 0.011 }), team, 1);
    put(ctx, limbBand(ctx, "leg", side, 1.0, 0.1, 0.012), base);
    put(ctx, limbBand(ctx, "leg", side, 0.93, 0.66, 0.024, { th: [-1.25, 1.25] }), team, 0.12);
    put(ctx, limbBand(ctx, "leg", side, 0.45, 0.16, 0.022, { th: [-1.1, 1.1] }), team, 0.12);
    put(ctx, shape(`${ctx.key}|ft|knee|${side}`, () => { const { cx, cz } = limbCenter(M, "leg", side); return bake([[ell(0.045, 0.05, 0.03, d, 12, 8).translate(cx, 0.51, cz + 0.058), legW(side)]]); }), base);
    put(ctx, shape(`${ctx.key}|ft|lline|${side}`, () => bake([[wrapLimb(new THREE.PlaneGeometry(0.009, 0.76, 1, 14), M, "leg", side, 0.52, outerAng(side), 0.0135), legW(side)]])), team, 1, false);
  });
  shoulders(ctx, base, 0.011);
  hands(ctx, "#262b36");
  feet(ctx, "sleek");
  return { backOff: 0.026, frontOff: 0.026, backColor: team };
}

function quirky(ctx) {
  const { M, col } = ctx, d = ctx.d, khaki = "#d4bf8a", shirt = col.team;
  put(ctx, torsoBand(ctx, 0.842, 1.0, 0.016, { capB: true }), khaki);
  put(ctx, torsoBand(ctx, 0.965, 1.462, 0.018, { flare: 0.01, lipB: 0.016, capT: true }), shirt);
  // imprimé hawaïen : fleurs (pétales blancs / couleur perso, cœurs jaunes)
  const spots = [[1.08, 0.3], [1.25, -0.5], [1.36, 0.55], [1.12, -0.95], [1.3, 1.25], [1.05, 1.6], [1.34, -1.55], [1.1, 2.05], [1.2, -2.2], [1.02, Math.PI], [1.4, 2.4], [1.06, -2.7],
    [1.2, 0.1], [1.02, -0.3], [1.38, -0.2], [1.15, 0.75], [1.28, -1.0], [1.02, 1.1], [1.24, 1.75], [1.05, -1.5]];
  const flower = (i, part) => {
    const g = [];
    if (part === "c") g.push(new THREE.CircleGeometry(0.009, 8));
    else for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + i; g.push(ellipseShape(0.011, 0.02, 6).translate(0, 0.02, 0).rotateZ(a)); }
    return g;
  };
  for (const [part, color, glow] of [["p0", "#ffffff", 0.05], ["p1", col.acc, 0.2], ["c", "#ffd84a", 0.3]]) {
    put(ctx, shape(`${ctx.key}|qk|fl|${part}`, () => bake(spots.flatMap(([y, a], i) => {
      if (part !== "c" && (i % 2) !== (part === "p0" ? 0 : 1)) return [];
      return flower(i, part).map(g => [wrapTorso(g, M, y, a, flareOff(0.0195 + (part === "c" ? 0.0006 : 0), 0.01, 0.965, 1.462)), torsoW]);
    }))), color, glow, false);
  }
  put(ctx, shape(`${ctx.key}|qk|opening`, () => bake([[wrapTorso(flatShape([[-0.045, 0.06], [0.045, 0.06], [0, -0.03]]), M, 1.39, 0, 0.0192), torsoW]])), col.skin, 0, false);
  put(ctx, shape(`${ctx.key}|qk|collar`, () => bake([1, -1].map(s => [wrapTorso(flatShape([[0, 0.05], [s * 0.075, 0.055], [s * 0.035, -0.02]]), M, 1.4, s * 0.3, 0.0205), torsoW]))), shirt, 0.08, false);
  put(ctx, shape(`${ctx.key}|qk|buttons`, () => bake([1.02, 1.12, 1.22, 1.32].map(y => { const { p } = onTorso(M, y, 0.02, flareOff(0.021, 0.01, 0.965, 1.462)(y)); return [ell(0.007, 0.007, 0.004, d, 6, 4).translate(p.x, p.y, p.z), torsoW]; }))), "#fafafa", 0, false);
  shoulders(ctx, shirt, 0.02);
  both(side => {
    put(ctx, limbBand(ctx, "arm", side, 1.445, 1.24, 0.02, { flare: 0.014, lipB: 0 }), shirt);
    put(ctx, limbBand(ctx, "arm", side, 1.25, 0.875, 0), col.skin);
    put(ctx, limbBand(ctx, "leg", side, 1.0, 0.63, 0.028, { flare: 0.014, lipB: 0 }), khaki);
    put(ctx, shape(`${ctx.key}|qk|cargo|${side}`, () => bake([[wrapLimb(new THREE.PlaneGeometry(0.07, 0.08), M, "leg", side, 0.78, outerAng(side), 0.04), legW(side)]])), "#bfa874", 0, false);
    put(ctx, limbBand(ctx, "leg", side, 0.64, 0.4, 0), col.skin);
    put(ctx, limbBand(ctx, "leg", side, 0.42, 0.085, 0.008, { lipT: 0 }), "#f4f4f4");
    put(ctx, limbBand(ctx, "leg", side, 0.395, 0.38, 0.0095), col.team, 0.2, false);
    put(ctx, limbBand(ctx, "leg", side, 0.365, 0.35, 0.0095), col.team, 0.2, false);
  });
  hands(ctx);
  feet(ctx, "sandal");
  return { backOff: 0.021, frontOff: 0.02, backColor: shirt };
}

function funny(ctx) {
  const { M, col } = ctx, d = ctx.d, fur = ctx.furColor, pink = "#f29bb0";
  put(ctx, torsoBand(ctx, 0.842, 1.462, 0.03, { capB: true, capT: true }), fur);
  put(ctx, shape(`${ctx.key}|fn|belly`, () => bake([[wrapTorso(ellipseShape(0.1, 0.15, sg(18, d)), M, 1.12, 0, 0.0305), torsoW]])), "#f3e6da", 0, false);
  put(ctx, torsoBand(ctx, 1.05, 1.41, 0.046, { lipB: 0.03, lipT: 0.03, open: [[1.0, 0], [1.34, 0], [1.41, 0.6]] }), col.team);
  put(ctx, shape(`${ctx.key}|fn|trim`, () => bake([[wrapTorso(new THREE.PlaneGeometry(1.4, 0.014, 24, 1), M, 1.06, 0, 0.0472), torsoW], [wrapTorso(new THREE.PlaneGeometry(1.4, 0.014, 24, 1), M, 1.06, Math.PI, 0.0472), torsoW]])), col.trim, 0.4, false);
  // queue rose (flotte avec coatBack)
  put(ctx, shape(`${ctx.key}|fn|tail`, () => {
    const pts = [[0, 0.98, -0.13], [0, 0.9, -0.2], [0, 0.72, -0.3], [0.02, 0.5, -0.38], [0.05, 0.3, -0.45], [0.09, 0.18, -0.55], [0.13, 0.2, -0.64], [0.14, 0.28, -0.68]];
    const r = pts.map((_, i) => lerp(0.03, 0.008, i / (pts.length - 1)));
    return bake([[sweep(pts, r, sg(8, d)), (x, y) => { const k = smoothstep(0.97, 0.85, y); return [[B.hips, 1 - k], [B.coatBack, k]]; }]]);
  }), pink);
  shoulders(ctx, fur, 0.028);
  both(side => {
    put(ctx, limbBand(ctx, "arm", side, 1.445, 0.9, 0.028, { lipB: 0 }), fur);
    put(ctx, limbBand(ctx, "leg", side, 1.0, 0.11, 0.034, { lipB: 0 }), fur);
  });
  hands(ctx, pink);
  feet(ctx, "paw", { pink });
  return { backOff: 0.048, frontOff: 0.048, backColor: col.team, hood: "rat" };
}

const OUTFITS = { footballer, scientist, rockstar, medieval, renaissance, futuristic, quirky, funny };

export function buildBody(ctx, outfit) {
  neck(ctx);
  const fn = OUTFITS[outfit] || footballer;
  return fn(ctx);
}
