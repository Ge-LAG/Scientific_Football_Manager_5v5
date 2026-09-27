// Tête : visage expressif (yeux, sourcils, 3 bouches), 22 coiffures, pilosité, lunettes et couvre-chefs.
// Géométries construites relativement au centre de la tête C puis translatées ; poids = os de la tête / visage / mèches.
import * as THREE from "three";
import { shape, bake, rings, sweep, twoSided, splitSides, warp, flatShape, ellipseShape, arcRibbon, ell, sg, V3, smoothstep, lerp, orient, bar, cutTris, subdivide } from "./kit.js";
import { B } from "./skeleton.js";
import { rng, hashStr } from "../util.js";

const TAU = Math.PI * 2;
const LASH = "#1a1216";

// ── Surface du crâne ──
function headDeform(v, E) {
  const ny = v.y / E.y;
  if (ny < 0) { const k = ny * ny; v.x *= 1 - 0.13 * k; v.z += 0.016 * k * Math.max(0, v.z / E.z); }
  return v;
}
function surf(E, x, y, lift = 0) {
  const z = E.z * Math.sqrt(Math.max(0, 1 - (x / E.x) ** 2 - (y / E.y) ** 2));
  const n = V3(x / (E.x * E.x), y / (E.y * E.y), z / (E.z * E.z)).normalize();
  const p = headDeform(V3(x, y, z), E).addScaledVector(n, lift);
  return { p, n };
}
// Projette une forme plate (plan XY, relatif à C) sur le visage
function onFace(g0, E, lift) {
  const g = subdivide(g0, 0.01), p = g.attributes.position, nor = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const s = surf(E, p.getX(i), p.getY(i), lift);
    p.setXYZ(i, s.p.x, s.p.y, s.p.z);
    nor[i * 3] = s.n.x; nor[i * 3 + 1] = s.n.y; nor[i * 3 + 2] = s.n.z;
  }
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return g;
}
// Point sur une calotte inclinée (a = angle depuis le pôle, f = azimut)
function capDir(a, f, tilt) {
  return V3(Math.sin(a) * Math.cos(f), Math.cos(a), Math.sin(a) * Math.sin(f)).applyAxisAngle(V3(1, 0, 0), tilt);
}
const onEll = (E, k, dir) => V3(dir.x * E.x * k, dir.y * E.y * k, dir.z * E.z * k);
const faceZone = dir => dir.z > 0.42 && dir.y < 0.62; // zone du visage (pas de mèches)

// Calotte de cheveux + bande de fermeture vers le crâne
function capParts(E, d, k, th, tilt, { sx = 1, sy = 1, sz = 1, ws = 26, hs = 12, close = true } = {}) {
  const S = (g, kk) => g.scale(E.x * kk * sx, E.y * kk * sy, E.z * kk * sz);
  const out = [S(new THREE.SphereGeometry(1, sg(ws, d), sg(hs, d), 0, TAU, 0, th).rotateX(tilt), k)];
  if (close && k > 1.02) {
    const n = sg(ws, d), pos = [], idx = [];
    for (const kk of [k, 1.0]) for (let j = 0; j <= n; j++) {
      const f = (j / n) * TAU, v = capDir(th, f, tilt);
      pos.push(v.x * E.x * kk * sx, v.y * E.y * kk * sy, v.z * E.z * kk * sz);
    }
    for (let j = 0; j < n; j++) { const a = j, b = j + 1, c = n + 1 + j, dd = c + 1; idx.push(a, c, b, b, c, dd); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    out.push(g);
  }
  return out;
}

// ════════════════════════ Coiffures ════════════════════════
// Chaque partie : { g, cat: cap|top|side|back|fringe, tone, w: "head"|"back"|"tail" }
const P = (g, cat = "cap", tone = "hair", w = "head") => ({ g, cat, tone, w });

function hairStyle(style, E, d) {
  const r = rng(hashStr("hair:" + style));
  const parts = [];
  const add = (g, cat, tone, w) => { for (const x of Array.isArray(g) ? g : [g]) parts.push(P(x, cat, tone, w)); };
  let vol = { r: 1.08, top: E.y * 1.08 };
  let pivots = null;
  const tufts = (n, k, th, tilt, make, cat = "top") => {
    for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) {
      const a = Math.sqrt(r()) * th, f = r() * TAU, dir = capDir(a, f, tilt);
      if (faceZone(dir)) continue;
      add(make(dir, onEll(E, k, dir), i), cat);
      i++;
    }
  };
  const backShell = (list, th0, th1, tone = "hair") => {
    const g = twoSided(rings(list, sg(22, d), { th0, th1 }), 0.004);
    const [a, b] = splitSides(g);
    add(a, "back", tone, "back"); add(b, "back", "dark", "back");
  };
  switch (style) {
    case "bald":
      vol = { r: 1.0, top: E.y };
      break;
    case "buzz":
      add(capParts(E, d, 1.018, 0.47 * Math.PI, -0.6), "cap", "buzz");
      vol = { r: 1.03, top: E.y * 1.03 };
      break;
    case "short":
      add(capParts(E, d, 1.07, 0.5 * Math.PI, -0.58), "cap");
      add(ell(0.12, 0.07, 0.125, d).translate(0, 0.095, -0.015), "top");
      for (let i = 0; i < 3; i++) {
        const x = -0.055 + i * 0.05, s = surf(E, x, 0.105, 0.01);
        add(orient(ell(0.04, 0.045, 0.016, d, 10, 6), V3(-0.5 + x, -0.35, 1), s.p), "fringe");
      }
      vol = { r: 1.1, top: 0.175 };
      break;
    case "side":
      add(capParts(E, d, 1.07, 0.49 * Math.PI, -0.6), "cap");
      add(ell(0.125, 0.045, 0.1, d).rotateX(-0.15).rotateZ(0.28).translate(-0.02, 0.14, 0.055), "top");
      add(orient(ell(0.03, 0.07, 0.03, d, 10, 6), V3(0.9, 0.2, 0.3), V3(0.12, 0.12, 0.07)), "top");
      vol = { r: 1.1, top: 0.19 };
      break;
    case "slick":
      add(capParts(E, d, 1.06, 0.5 * Math.PI, -0.5, { sz: 1.1 }), "cap");
      add(ell(0.1, 0.055, 0.155, d).translate(0, 0.118, -0.03), "top");
      add(ell(0.12, 0.075, 0.06, d).translate(0, -0.005, -0.14), "cap");
      add([ell(0.014, 0.006, 0.1, d, 8, 4).rotateX(0.35).translate(0.035, 0.158, 0.02), ell(0.01, 0.005, 0.07, d, 6, 4).rotateX(0.3).translate(-0.03, 0.162, 0.0)], "top", "shine");
      vol = { r: 1.09, top: 0.18 };
      break;
    case "spiky":
      add(capParts(E, d, 1.04, 0.49 * Math.PI, -0.6), "cap");
      tufts(17, 1.0, 0.44 * Math.PI, -0.55, dir => {
        const len = 0.1 + r() * 0.06, g = new THREE.ConeGeometry(0.04 + r() * 0.01, len, sg(6, d)).translate(0, len / 2, 0);
        return orient(g, dir.clone().add(V3(0, 0.55, -0.35)), onEll(E, 0.98, dir));
      });
      vol = { r: 1.15, top: 0.27 };
      break;
    case "curly":
      add(capParts(E, d, 1.04, 0.5 * Math.PI, -0.58), "cap");
      tufts(42, 1.1, 0.5 * Math.PI, -0.58, (dir, p) => ell(1, 1, 1, d, 7, 5).scale(0.036 + r() * 0.014, 0.036 + r() * 0.014, 0.036 + r() * 0.014).translate(p.x, p.y, p.z));
      vol = { r: 1.3, top: 0.22 };
      break;
    case "afro": {
      add(capParts(E, d, 1.04, 0.5 * Math.PI, -0.58), "cap");
      const g = new THREE.IcosahedronGeometry(1, d >= 1 ? 4 : d >= 0.75 ? 3 : 2);
      warp(g, v => {
        const n = v.clone().normalize();
        const bump = 1 + 0.045 * Math.sin(n.x * 17 + n.y * 5) * Math.sin(n.y * 15 + n.z * 3) + 0.03 * Math.sin(n.z * 21 - n.x * 9);
        v.copy(n).multiplyScalar(bump).multiply(V3(0.25, 0.23, 0.235)).add(V3(0, 0.09, -0.06));
        if (v.z > 0 && v.y < 0.105) {
          const zs = E.z * Math.sqrt(Math.max(0, 1 - (v.x / E.x) ** 2 - (Math.min(v.y, 0.1) / E.y) ** 2)) - 0.014;
          if (v.z > zs) v.z = lerp(v.z, zs, smoothstep(0.13, 0.06, v.y) * 0.9 + 0.1);
        }
      });
      add(g, "top");
      vol = { r: 1.62, top: 0.32 };
      break;
    }
    case "messy":
      add(capParts(E, d, 1.07, 0.5 * Math.PI, -0.56), "cap");
      tufts(18, 1.02, 0.52 * Math.PI, -0.56, dir => {
        const len = 0.07 + r() * 0.05, g = new THREE.ConeGeometry(0.032, len, sg(5, d)).scale(1, 1, 0.55).rotateY(r() * 3).translate(0, len / 2, 0);
        return orient(g, dir.clone().add(V3(r() - 0.5, r() * 0.4 - 0.1, r() - 0.5)), onEll(E, 1.0, dir));
      });
      vol = { r: 1.15, top: 0.23 };
      break;
    case "long":
      add(capParts(E, d, 1.08, 0.5 * Math.PI, -0.56), "cap");
      backShell([
        { y: -0.33, rx: 0.188, rz: 0.1, z: -0.07 }, { y: -0.25, rx: 0.182, rz: 0.112, z: -0.062 }, { y: -0.15, rx: 0.176, rz: 0.13, z: -0.045 },
        { y: -0.05, rx: 0.172, rz: 0.15, z: -0.022 }, { y: 0.04, rx: 0.165, rz: 0.158, z: -0.008 },
      ], 0.3 * Math.PI, 1.7 * Math.PI);
      add([1, -1].map(s => ell(0.03, 0.11, 0.028, d, 10, 8).rotateZ(s * 0.08).translate(s * 0.14, -0.07, 0.06)), "side");
      vol = { r: 1.1, top: 0.172 };
      break;
    case "ponytail": {
      add(capParts(E, d, 1.04, 0.5 * Math.PI, -0.58), "cap");
      add(new THREE.TorusGeometry(0.024, 0.009, 5, sg(10, d)).rotateX(-0.9).translate(0, 0.085, -0.15), "back", "tie");
      const pts = [[0, 0.085, -0.152], [0, 0.07, -0.2], [0, 0.0, -0.235], [0, -0.1, -0.24], [0, -0.2, -0.225], [0, -0.3, -0.2]];
      add(sweep(pts, [0.03, 0.045, 0.042, 0.035, 0.024, 0.006], sg(10, d), { flat: 0.8 }), "back", "hair", "back");
      pivots = { back: V3(0, 0.085, -0.155), tail: V3(0, -0.08, -0.24) };
      vol = { r: 1.05, top: 0.172 };
      break;
    }
    case "bun":
      add(capParts(E, d, 1.04, 0.5 * Math.PI, -0.58), "cap");
      add(ell(0.066, 0.058, 0.066, d, 14, 10).translate(0, 0.15, -0.08), "top");
      add(new THREE.TorusGeometry(0.05, 0.009, 5, sg(12, d)).rotateX(Math.PI / 2 + 0.5).translate(0, 0.128, -0.066), "top", "tie");
      vol = { r: 1.05, top: 0.21 };
      break;
    case "mohawk":
      add(capParts(E, d, 1.016, 0.47 * Math.PI, -0.6), "cap", "shaved");
      for (let i = 0; i < 9; i++) {
        const t = 0.62 - (i / 8) * 2.35, dir = V3(0, Math.cos(t), Math.sin(t));
        const h = 0.17 - Math.abs(i - 3.5) * 0.013;
        add(orient(new THREE.ConeGeometry(0.05, h, sg(4, d)).scale(0.3, 1, 1).translate(0, h / 2 - 0.012, 0), dir, onEll(E, 0.98, dir)), "top");
      }
      vol = { r: 1.03, top: 0.31 };
      break;
    case "fade":
      add(capParts(E, d, 1.016, 0.47 * Math.PI, -0.6), "cap", "fade1");
      add(capParts(E, d, 1.04, 0.38 * Math.PI, -0.5, { close: false }), "cap", "fade2");
      add(capParts(E, d, 1.1, 0.3 * Math.PI, -0.3, { sy: 1.2 }), "top");
      vol = { r: 1.1, top: 0.2 };
      break;
    case "pompadour":
      add(capParts(E, d, 1.05, 0.49 * Math.PI, -0.6), "cap");
      add(ell(0.105, 0.075, 0.125, d).rotateX(-0.45).translate(0, 0.14, 0.05), "top");
      add(ell(0.095, 0.052, 0.065, d).rotateX(0.35).translate(0, 0.19, 0.115), "top");
      add([ell(0.008, 0.005, 0.08, d, 6, 4).rotateX(-0.5).translate(0.03, 0.2, 0.06)], "top", "shine");
      vol = { r: 1.1, top: 0.26 };
      break;
    case "dreads": {
      add(capParts(E, d, 1.07, 0.5 * Math.PI, -0.56), "cap");
      const n = d >= 0.75 ? 18 : 12;
      for (let i = 0; i < n; i++) {
        const a = 0.3 * Math.PI + (i / (n - 1)) * 1.4 * Math.PI + (r() - 0.5) * 0.1;
        const sx = Math.sin(a), cz = Math.cos(a), front = Math.max(0, cz);
        const root = V3(sx * 0.158, 0.05 - 0.04 * (1 - front), -0.008 + cz * 0.15);
        const len = (0.2 + r() * 0.1) * (1 - front * 0.55);
        const out = V3(sx, 0, cz).multiplyScalar(0.03);
        const pts = [root, root.clone().add(out).add(V3(0, -0.06, 0)), root.clone().add(out.clone().multiplyScalar(1.4)).add(V3(0, -len * 0.6, 0)), root.clone().add(out.clone().multiplyScalar(1.6)).add(V3(0, -len, 0))];
        add(sweep(pts, [0.019, 0.019, 0.017, 0.013], sg(5, d)), "back", i % 3 ? "hair" : "dark", "back");
      }
      vol = { r: 1.12, top: 0.18 };
      break;
    }
    case "bowl": {
      add(capParts(E, d, 1.012, 0.52 * Math.PI, -0.55), "cap", "shaved");
      const th = Math.acos(0.085 / (E.y * 1.1));
      add(capParts(E, d, 1.1, th, 0, { sx: 1.1, sz: 1.1, close: false }), "top");
      const rr = Math.sin(th) * 1.1 * 1.1;
      add(new THREE.TorusGeometry(1, 0.075, 6, sg(28, d)).rotateX(Math.PI / 2).scale(E.x * rr, 0.16, E.z * rr).translate(0, 0.085, 0), "top");
      vol = { r: 1.22, top: 0.176 };
      break;
    }
    case "mullet_modern":
      add(capParts(E, d, 1.03, 0.49 * Math.PI, -0.6), "cap", "fade1");
      add(capParts(E, d, 1.09, 0.32 * Math.PI, -0.45, { sy: 1.08 }), "top");
      tufts(7, 1.08, 0.26 * Math.PI, -0.4, dir => orient(new THREE.ConeGeometry(0.03, 0.06, sg(5, d)).translate(0, 0.03, 0), dir.clone().add(V3(0, 0.3, -0.5)), onEll(E, 1.06, dir)));
      backShell([
        { y: -0.27, rx: 0.15, rz: 0.12, z: -0.085 }, { y: -0.24, rx: 0.13, rz: 0.108, z: -0.07 }, { y: -0.15, rx: 0.12, rz: 0.115, z: -0.055 },
        { y: -0.05, rx: 0.13, rz: 0.13, z: -0.03 }, { y: 0.06, rx: 0.12, rz: 0.14, z: -0.02 },
      ], 0.58 * Math.PI, 1.42 * Math.PI);
      vol = { r: 1.1, top: 0.18 };
      break;
    case "mullet_shaved":
      add(capParts(E, d, 1.014, 0.47 * Math.PI, -0.6), "cap", "shaved");
      add(capParts(E, d, 1.09, 0.3 * Math.PI, -0.42, { sy: 1.12 }), "top");
      add(ell(0.08, 0.035, 0.07, d).rotateZ(0.35).translate(-0.04, 0.155, 0.075), "top");
      backShell([
        { y: -0.31, rx: 0.08, rz: 0.09, z: -0.085 }, { y: -0.22, rx: 0.09, rz: 0.1, z: -0.07 }, { y: -0.1, rx: 0.1, rz: 0.12, z: -0.05 },
        { y: 0.0, rx: 0.1, rz: 0.14, z: -0.03 }, { y: 0.06, rx: 0.09, rz: 0.14, z: -0.02 },
      ], 0.7 * Math.PI, 1.3 * Math.PI);
      for (const x of [-0.045, 0, 0.045]) add(orient(new THREE.ConeGeometry(0.02, 0.07, sg(5, d)).translate(0, 0.035, 0), V3(x, -1, -0.25), V3(x, -0.3, -0.172)), "back", "hair", "back");
      vol = { r: 1.1, top: 0.2 };
      break;
    case "mullet_perm": {
      add(capParts(E, d, 1.04, 0.49 * Math.PI, -0.6), "cap");
      tufts(24, 1.1, 0.42 * Math.PI, -0.5, (dir, p) => ell(1, 1, 1, d, 7, 5).scale(0.04 + r() * 0.012, 0.04 + r() * 0.012, 0.04 + r() * 0.012).translate(p.x, p.y, p.z));
      backShell([
        { y: -0.25, rx: 0.15, rz: 0.12, z: -0.07 }, { y: -0.12, rx: 0.15, rz: 0.14, z: -0.05 }, { y: 0.02, rx: 0.15, rz: 0.15, z: -0.02 },
      ], 0.58 * Math.PI, 1.42 * Math.PI, "dark");
      const n = d >= 0.75 ? 34 : 22;
      for (let i = 0; i < n; i++) {
        const t = r(), a = (0.55 + r() * 0.9) * Math.PI, y = 0.02 - t * 0.27, rad = 0.15 + t * 0.045;
        add(ell(1, 1, 1, d, 7, 5).scale(0.043 + r() * 0.014, 0.043 + r() * 0.014, 0.043 + r() * 0.014).translate(Math.sin(a) * rad, y, -0.03 - t * 0.04 + Math.cos(a) * (rad - 0.01)), "back", "hair", "back");
      }
      vol = { r: 1.3, top: 0.22 };
      break;
    }
    case "mullet_classic":
      add(capParts(E, d, 1.07, 0.5 * Math.PI, -0.56, { sy: 0.97 }), "cap");
      for (let i = 0; i < 4; i++) {
        const x = -0.06 + i * 0.04, s = surf(E, x, 0.098, 0.014);
        add(orient(ell(0.026, 0.04, 0.012, d, 8, 6), V3(x * 1.5, -1, 0.9), s.p), "fringe");
      }
      add([1, -1].map(s => ell(0.03, 0.06, 0.075, d, 10, 8).translate(s * 0.152, 0.0, -0.005)), "side");
      backShell([
        { y: -0.29, rx: 0.16, rz: 0.1, z: -0.068 }, { y: -0.2, rx: 0.158, rz: 0.11, z: -0.06 }, { y: -0.1, rx: 0.156, rz: 0.13, z: -0.04 },
        { y: 0.0, rx: 0.156, rz: 0.145, z: -0.02 }, { y: 0.05, rx: 0.15, rz: 0.15, z: -0.01 },
      ], 0.55 * Math.PI, 1.45 * Math.PI);
      vol = { r: 1.1, top: 0.168 };
      break;
    case "grey_side": {
      const pts = [];
      for (let i = 0; i <= 12; i++) { const a = 0.32 * Math.PI + (i / 12) * 1.36 * Math.PI; pts.push(V3(Math.sin(a) * 0.158, 0.03 - 0.05 * Math.max(0, -Math.cos(a)), -0.01 + Math.cos(a) * 0.146)); }
      add(sweep(pts, 0.036, sg(8, d), { flat: 0.75 }), "side");
      add([1, -1].map(s => ell(0.05, 0.048, 0.06, d, 10, 8).translate(s * 0.15, 0.045, -0.012)), "side");
      for (const s of [1, -1]) for (let i = 0; i < 3; i++) add(orient(new THREE.ConeGeometry(0.02, 0.07, sg(5, d)).translate(0, 0.035, 0), V3(s, 0.4 + i * 0.35, -0.3 + i * 0.2), V3(s * 0.175, 0.04 + i * 0.02, -0.03 - i * 0.03)), "side");
      vol = { r: 1.0, top: E.y };
      break;
    }
    default:
      return hairStyle("short", E, d);
  }
  return { parts, vol, pivots };
}

// Masquage des cheveux sous les couvre-chefs
const HIDE = {
  none: [], headband: [], headset: [], antenna: [], crown: [], laurel: [],
  cap: ["top", "fringe"], beanie: ["top", "fringe"], wizard_hat: ["top"], top_hat: ["top"],
  knight_helmet: ["top", "cap", "side", "fringe"], hood: ["top", "cap", "side", "back", "fringe"],
};

// ════════════════════════ Pilosité faciale ════════════════════════
function facialHair(type, E, d) {
  const out = [];
  const shell = (k, t0, t1, cutMouth = true) => {
    const g = new THREE.SphereGeometry(1, sg(34, d), sg(16, d), 0.02 * Math.PI, 0.96 * Math.PI, t0, t1 - t0);
    warp(g, v => { v.multiply(E); headDeform(v, E); v.multiplyScalar(k); });
    if (!cutMouth) return g;
    // ouverture de la bouche : sommets intérieurs ramenés sur l ellipse, triangles entièrement intérieurs supprimés
    const p = g.attributes.position, inside = [], ax = 0.046, ay = 0.027, cy = -0.079;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), q = (x / ax) ** 2 + ((y - cy) / ay) ** 2;
      inside[i] = z > 0.05 && q < 1;
      if (inside[i]) { const a = Math.atan2((y - cy) / ay, x / ax); p.setXY(i, Math.cos(a) * ax, cy + Math.sin(a) * ay); }
    }
    const ix = g.index, keep = [];
    for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i), b = ix.getX(i + 1), c = ix.getX(i + 2); if (!(inside[a] && inside[b] && inside[c])) keep.push(a, b, c); }
    g.setIndex(keep); g.computeVertexNormals();
    return g;
  };
  const stache = (w = 0.036, h = 0.014, droop = 0.22) => [1, -1].map(s => {
    const q = surf(E, s * 0.024, -0.056, 0.008).p;
    return ell(w, h, 0.016, d, 10, 6).rotateZ(-s * droop).translate(q.x, q.y, q.z);
  });
  const burns = (len = 0.05) => [1, -1].map(s => ell(0.013, len, 0.028, d, 8, 6).translate(s * 0.146, -0.02, 0.035));
  switch (type) {
    case "stubble": out.push({ g: shell(1.008, 0.55 * Math.PI, 0.97 * Math.PI, false), tone: "stubble", o: false }); break;
    case "beard":
      out.push({ g: shell(1.045, 0.6 * Math.PI, 0.98 * Math.PI), tone: "beard", o: true });
      for (const g of [...stache(0.04, 0.012, 0.15), ...burns()]) out.push({ g, tone: "beard", o: true });
      break;
    case "full_beard":
      out.push({ g: shell(1.09, 0.56 * Math.PI, 1.0 * Math.PI), tone: "beard", o: true });
      out.push({ g: ell(0.1, 0.085, 0.08, d).translate(0, -0.158, 0.07), tone: "beard", o: true });
      for (const g of [...stache(0.044, 0.018, 0.3), ...burns(0.06)]) out.push({ g, tone: "beard", o: true });
      break;
    case "goatee": {
      const q = surf(E, 0, -0.13, 0.01).p;
      out.push({ g: ell(0.026, 0.036, 0.02, d, 10, 8).translate(q.x, q.y - 0.006, q.z), tone: "beard", o: true });
      for (const g of stache(0.03, 0.009, 0.2)) out.push({ g, tone: "beard", o: true });
      for (const s of [1, -1]) { const m = surf(E, s * 0.034, -0.095, 0.004).p; out.push({ g: ell(0.006, 0.02, 0.006, d, 6, 4).translate(m.x, m.y, m.z), tone: "beard", o: false }); }
      break;
    }
    case "moustache": for (const g of stache(0.038, 0.016, 0.24)) out.push({ g, tone: "beard", o: true }); break;
    case "handlebar":
      for (const g of stache(0.036, 0.014, 0.1)) out.push({ g, tone: "beard", o: true });
      for (const s of [1, -1]) {
        const pts = [[0.05, -0.062, 0.128], [0.072, -0.062, 0.114], [0.088, -0.048, 0.104], [0.092, -0.028, 0.1], [0.082, -0.018, 0.102]].map(([x, y, z]) => V3(s * x, y, z));
        out.push({ g: sweep(pts, [0.009, 0.008, 0.007, 0.005, 0.004], sg(6, d)), tone: "beard", o: true });
      }
      break;
    case "sideburns":
      for (const s of [1, -1]) {
        out.push({ g: ell(0.015, 0.06, 0.03, d, 8, 6).translate(s * 0.145, -0.025, 0.035), tone: "beard", o: true });
        out.push({ g: ell(0.02, 0.03, 0.03, d, 8, 6).translate(s * 0.14, -0.075, 0.05), tone: "beard", o: true });
      }
      break;
  }
  return out;
}

// ════════════════════════ Lunettes ════════════════════════
function glassesParts(type, E, d, col) {
  const parts = [], lenses = [];
  const z = 0.163, frame = "#1c1b22";
  const L = s => V3(s * 0.057, 0.008, z);
  const temples = (y = 0.016, r = 0.005, c = frame) => [1, -1].forEach(s => parts.push({ g: bar(V3(s * 0.094, y, z - 0.012), V3(s * 0.153, y + 0.004, 0.01), r, 5), c }));
  const glint = s => { const c = L(s); parts.push({ g: new THREE.BoxGeometry(0.02, 0.004, 0.002).rotateZ(0.75).translate(c.x + 0.012, c.y + 0.012, z + 0.003), c: "#ffffff", glow: 1 }); };
  switch (type) {
    case "round":
      for (const s of [1, -1]) { const c = L(s); parts.push({ g: new THREE.TorusGeometry(0.036, 0.0045, 5, sg(22, d)).rotateY(s * 0.12).translate(c.x, c.y, c.z), c: "#3a3027" }); glint(s); }
      parts.push({ g: new THREE.TorusGeometry(0.014, 0.004, 4, 8, Math.PI).translate(0, 0.012, z + 0.002), c: "#3a3027" });
      temples(0.016, 0.004, "#3a3027");
      break;
    case "square": {
      const sh = new THREE.Shape(); sh.moveTo(-0.044, -0.03); sh.lineTo(0.044, -0.03); sh.lineTo(0.046, 0.032); sh.lineTo(-0.046, 0.032); sh.closePath();
      const hole = new THREE.Path(); hole.moveTo(-0.034, -0.021); hole.lineTo(0.034, -0.021); hole.lineTo(0.036, 0.022); hole.lineTo(-0.036, 0.022); hole.closePath();
      sh.holes.push(hole);
      for (const s of [1, -1]) { const c = L(s); parts.push({ g: new THREE.ExtrudeGeometry(sh, { depth: 0.009, bevelEnabled: false }).rotateY(s * 0.1).translate(c.x, c.y, c.z - 0.004), c: "#101014" }); glint(s); }
      parts.push({ g: new THREE.BoxGeometry(0.03, 0.008, 0.008).translate(0, 0.02, z), c: "#101014" });
      temples(0.02, 0.006, "#101014");
      break;
    }
    case "goggles":
      for (const s of [1, -1]) {
        const c = L(s);
        parts.push({ g: new THREE.TorusGeometry(0.039, 0.012, 6, sg(20, d)).scale(1, 0.9, 1.6).rotateY(s * 0.1).translate(c.x, c.y, c.z - 0.006), c: "#2e3a48" });
        lenses.push({ g: new THREE.CircleGeometry(0.038, sg(20, d)).scale(1, 0.9, 1).rotateY(s * 0.1).translate(c.x, c.y, c.z + 0.004), color: "#8ff0ff" });
        glint(s);
      }
      parts.push({ g: new THREE.BoxGeometry(0.03, 0.014, 0.014).translate(0, 0.01, z), c: "#2e3a48" });
      parts.push({ g: new THREE.TorusGeometry(1, 0.07, 5, sg(28, d)).rotateX(Math.PI / 2).scale(E.x * 1.04, 0.15, E.z * 1.04).translate(0, 0.01, -0.008), c: "#1d2430", keepOut: true });
      break;
    case "sunglasses": {
      const tear = [[-0.038, 0.022], [0.034, 0.024], [0.04, 0.0], [0.028, -0.026], [0.0, -0.034], [-0.03, -0.02], [-0.042, 0.004]];
      for (const s of [1, -1]) {
        const c = L(s), pts = tear.map(([x, y]) => [s * x, y]);
        parts.push({ g: new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(...p))), { depth: 0.005, bevelEnabled: false }).rotateY(s * 0.12).translate(c.x, c.y, c.z), c: "#0b0b10" });
        parts.push({ g: new THREE.BoxGeometry(0.026, 0.005, 0.002).rotateZ(-0.6 * s).translate(c.x + s * 0.004, c.y + 0.006, z + 0.008), c: "#ffffff", glow: 0.8 });
      }
      parts.push({ g: bar(V3(-0.02, 0.028, z + 0.004), V3(0.02, 0.028, z + 0.004), 0.003, 4), c: "#d9b24a", glow: 0.1 });
      temples(0.024, 0.0035, "#d9b24a");
      break;
    }
    case "visor": {
      const list = [{ y: -0.022, rx: 0.172, rz: 0.168 }, { y: 0.042, rx: 0.168, rz: 0.166 }];
      lenses.push({ g: rings(list, sg(24, d), { th0: -0.43 * Math.PI, th1: 0.43 * Math.PI }), color: col.acc, glowing: true });
      for (const y of [-0.024, 0.044]) {
        const pts = []; for (let i = 0; i <= 14; i++) { const a = -0.44 * Math.PI + (i / 14) * 0.88 * Math.PI; pts.push(V3(Math.sin(a) * 0.172, y, Math.cos(a) * 0.168)); }
        parts.push({ g: sweep(pts, 0.005, 4), c: col.acc, glow: 1 });
      }
      for (const s of [1, -1]) parts.push({ g: new THREE.CylinderGeometry(0.024, 0.024, 0.02, sg(12, d)).rotateZ(Math.PI / 2).translate(s * 0.162, 0.01, 0.02), c: "#20242e" });
      break;
    }
    case "monocle": {
      const c = L(-1);
      parts.push({ g: new THREE.TorusGeometry(0.038, 0.005, 5, sg(22, d)).translate(c.x, c.y, c.z - 0.004), c: "#e0b64a", glow: 0.15 });
      glint(-1);
      const pts = [[-0.09, -0.02, 0.15], [-0.11, -0.08, 0.13], [-0.12, -0.15, 0.1], [-0.11, -0.2, 0.09]].map(p => V3(...p));
      parts.push({ g: sweep(pts, 0.0025, 4), c: "#e0b64a", glow: 0.1 });
      break;
    }
  }
  return { parts, lenses };
}

// ════════════════════════ Couvre-chefs ════════════════════════
function hoodShell(E, d, drape = true) {
  const k = V3(E.x * 1.28, E.y * 1.28, E.z * 1.28);
  let g = new THREE.SphereGeometry(1, sg(26, d), sg(18, d)).scale(k.x, k.y, k.z).translate(0, 0.012, -0.02);
  cutTris(g, (x, y, z) => z > 0.02 && (x / 0.126) ** 2 + ((y + 0.004) / 0.138) ** 2 < 1);
  const out = [];
  const [a, b] = splitSides(twoSided(g, 0.006));
  out.push({ g: a, tone: "main" }, { g: b, tone: "inner", o: false });
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * TAU, x = 0.126 * Math.cos(t), y = -0.004 + 0.138 * Math.sin(t);
    const zz = k.z * Math.sqrt(Math.max(0, 1 - (x / k.x) ** 2 - ((y - 0.012) / k.y) ** 2)) - 0.02;
    pts.push(V3(x, y, zz));
  }
  out.push({ g: sweep(pts, 0.017, sg(7, d), { closeStart: false, closeEnd: false }), tone: "rim" });
  if (drape) {
    const list = [{ y: -0.27, rx: 0.2, rz: 0.19, z: -0.05 }, { y: -0.19, rx: 0.19, rz: 0.18, z: -0.04 }, { y: -0.1, rx: 0.18, rz: 0.17, z: -0.03 }];
    const [c, dd] = splitSides(twoSided(rings(list, sg(22, d), { th0: 0.28 * Math.PI, th1: 1.72 * Math.PI }), 0.005));
    out.push({ g: c, tone: "main", w: "neck" }, { g: dd, tone: "inner", o: false, w: "neck" });
  }
  return out;
}

function headwear(type, E, d, vol, col) {
  const parts = [];
  const add = (g, c, glow = 0, o = true, w = "head") => parts.push({ g, c, glow, o, w });
  const R = Math.max(1, vol.r), top = vol.top;
  switch (type) {
    case "cap": {
      add(new THREE.SphereGeometry(1, sg(24, d), sg(10, d), 0, TAU, 0, 0.5 * Math.PI).scale(E.x * 1.14, E.y * 1.05, E.z * 1.16).rotateX(-0.42).translate(0, 0.03, -0.006), col.team);
      const brim = new THREE.CylinderGeometry(0.125, 0.125, 0.012, sg(20, d), 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.95).rotateX(0.16).translate(0, 0.088, 0.12);
      add(brim, col.team);
      add(new THREE.CylinderGeometry(0.122, 0.122, 0.004, sg(20, d), 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.95).rotateX(0.16).translate(0, 0.08, 0.121), col.team2, 0, false);
      add(new THREE.SphereGeometry(0.014, 6, 4).translate(0, E.y * 1.05 + 0.024, -0.03), col.team2, 0, false);
      const q = V3(0, 0.13, 0.135);
      add(new THREE.CircleGeometry(0.026, sg(14, d)).rotateX(-0.5).translate(q.x, q.y, q.z), col.trim, 0.6, false);
      break;
    }
    case "headband": {
      const k = R * 1.04;
      add(rings([{ y: 0.07, rx: E.x * k + 0.004, rz: E.z * k + 0.008 }, { y: 0.118, rx: E.x * k * 0.97, rz: E.z * k * 0.97 }], sg(26, d)).rotateX(-0.1), col.team, 0.1);
      add(rings([{ y: 0.088, rx: E.x * k + 0.007, rz: E.z * k + 0.011 }, { y: 0.1, rx: E.x * k + 0.0055, rz: E.z * k + 0.0095 }], sg(26, d)).rotateX(-0.1), "#ffffff", 0.2, false);
      for (const s of [1, -1]) add(ell(0.014, 0.05, 0.008, d, 6, 4).rotateZ(s * 0.35).translate(s * 0.02, 0.04, -E.z * k - 0.02), col.team);
      break;
    }
    case "beanie": {
      add(new THREE.SphereGeometry(1, sg(24, d), sg(12, d), 0, TAU, 0, 0.47 * Math.PI).rotateX(-0.45).scale(E.x * 1.14, E.y * 1.18, E.z * 1.14), col.team);
      add(new THREE.SphereGeometry(1, sg(24, d), 3, 0, TAU, 0.4 * Math.PI, 0.12 * Math.PI).rotateX(-0.45).scale(E.x * 1.19, E.y * 1.2, E.z * 1.19), col.team2);
      add(ell(0.048, 0.048, 0.048, d, 10, 8).translate(0, E.y * 1.18 + 0.03, -0.05), "#ffffff", 0.05, true, "tip");
      break;
    }
    case "headset": {
      const rb = Math.max(E.x * 1.15, E.x * R + 0.012);
      add(new THREE.TorusGeometry(rb, 0.011, 6, sg(22, d), Math.PI).scale(1, (top + 0.02) / rb, 1).translate(0, 0.0, -0.01), "#23232d");
      for (const s of [1, -1]) {
        add(new THREE.CylinderGeometry(0.055, 0.055, 0.036, sg(16, d)).rotateZ(Math.PI / 2).translate(s * (rb + 0.008), -0.01, -0.005), "#23232d");
        add(new THREE.CylinderGeometry(0.04, 0.04, 0.012, sg(16, d)).rotateZ(Math.PI / 2).translate(s * (rb + 0.03), -0.01, -0.005), col.team, 0.8, false);
      }
      add(sweep([V3(rb + 0.01, -0.04, 0.03), V3(0.15, -0.08, 0.1), V3(0.06, -0.09, 0.145)], 0.006, 5), "#23232d");
      add(new THREE.SphereGeometry(0.017, 8, 6).translate(0.058, -0.09, 0.148), col.acc, 0.9, false);
      break;
    }
    case "antenna": {
      const rb = Math.max(E.x * 1.1, E.x * R + 0.008);
      add(new THREE.TorusGeometry(rb, 0.008, 5, sg(20, d), Math.PI).scale(1, (top + 0.012) / rb, 1).translate(0, 0.0, 0.01), "#2a2a33");
      for (const s of [1, -1]) {
        const base = V3(s * 0.07, top - 0.01, 0.01);
        add(sweep([base, base.clone().add(V3(s * 0.02, 0.08, -0.01)), base.clone().add(V3(s * 0.05, 0.16, -0.03)), base.clone().add(V3(s * 0.07, 0.2, -0.04))], 0.007, 5), "#2a2a33", 0, true, "tipY");
        add(new THREE.SphereGeometry(0.03, sg(10, d), sg(8, d)).translate(base.x + s * 0.07, base.y + 0.22, base.z - 0.04), col.team, 0.9, true, "tip");
      }
      break;
    }
    case "hood":
      for (const p of hoodShell(E, d)) add(p.g, p.tone === "inner" ? col.team2 : p.tone === "rim" ? col.teamDk : col.team, 0, p.o !== false, p.w || "head");
      break;
    case "knight_helmet": {
      const steel = "#b3bac6", dark = "#7d8594";
      add(new THREE.SphereGeometry(1, sg(26, d), sg(12, d), 0, TAU, 0, 0.5 * Math.PI).rotateX(-0.42).scale(E.x * 1.18, E.y * 1.22, E.z * 1.18), steel, 0.05);
      add(new THREE.SphereGeometry(1, sg(26, d), 3, 0, TAU, 0.46 * Math.PI, 0.08 * Math.PI).rotateX(-0.42).scale(E.x * 1.22, E.y * 1.24, E.z * 1.22), dark);
      add(new THREE.BoxGeometry(0.02, 0.085, 0.014).rotateX(-0.2).translate(0, 0.045, 0.172), steel, 0.05);
      for (const s of [1, -1]) {
        const g = new THREE.SphereGeometry(1, sg(10, d), sg(8, d), s > 0 ? 0.62 * Math.PI : 0.02 * Math.PI, 0.36 * Math.PI, 0.52 * Math.PI, 0.26 * Math.PI).scale(E.x * 1.14, E.y * 1.12, E.z * 1.14);
        add(twoSided(g, 0.004), steel, 0.05);
      }
      add(new THREE.SphereGeometry(1, sg(22, d), 3, 0, TAU, 0.12 * Math.PI, 0.05 * Math.PI).rotateX(-0.42).scale(E.x * 1.19, E.y * 1.23, E.z * 1.19), "#e3e7ee", 0.2, false);
      add(new THREE.CylinderGeometry(0.018, 0.024, 0.04, 8).translate(0, E.y * 1.22 + 0.01, -0.03), dark);
      for (let i = 0; i < 5; i++) {
        const a = -0.5 + i * 0.25;
        add(orient(ell(0.022, 0.1, 0.012, d, 8, 6).translate(0, 0.09, 0), V3(Math.sin(a) * 0.6, 1, -0.7), V3(0, E.y * 1.22 + 0.02, -0.03)), col.team, 0.12, true, "tip");
      }
      break;
    }
    case "crown": {
      const y0 = top - 0.05, rx = 0.098 * Math.min(R, 1.3), rz = 0.094 * Math.min(R, 1.3);
      add(twoSided(rings([{ y: y0, rx, rz }, { y: y0 + 0.05, rx: rx * 1.06, rz: rz * 1.06 }], sg(20, d)), 0.004), "#ffc93a", 0.15);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        add(new THREE.ConeGeometry(0.02, 0.055, 4).translate(Math.sin(a) * rx * 1.06, y0 + 0.075, Math.cos(a) * rz * 1.06), "#ffc93a", 0.15);
        add(new THREE.SphereGeometry(0.011, 6, 4).translate(Math.sin(a) * rx * 1.08, y0 + 0.103, Math.cos(a) * rz * 1.08), "#ffe9a8", 0.4, false);
        add(new THREE.SphereGeometry(0.012, 6, 4).translate(Math.sin(a + 0.63) * rx * 1.08, y0 + 0.025, Math.cos(a + 0.63) * rz * 1.08), i % 2 ? col.acc : "#ff2a55", 0.8, false);
      }
      add(ell(rx * 0.95, 0.04, rz * 0.95, d, 12, 6).translate(0, y0 + 0.02, 0), "#8c1b2b");
      break;
    }
    case "wizard_hat": {
      const hat = col.teamDk, yb = 0.1;
      add(new THREE.CylinderGeometry(0.25, 0.25, 0.01, sg(28, d)).rotateX(-0.08).translate(0, yb, -0.01), hat);
      const list = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; list.push({ y: yb + t * 0.36, rx: 0.14 * (1 - t) + 0.004, rz: 0.14 * (1 - t) + 0.004, z: -0.01 - 0.12 * t * t }); }
      add(rings(list, sg(18, d), { capB: false, capT: true }), hat, 0, true, "tipY2");
      add(rings([{ y: yb + 0.005, rx: 0.143, rz: 0.143 }, { y: yb + 0.04, rx: 0.13, rz: 0.13 }], sg(18, d)), "#ffc93a", 0.3);
      for (const [y, a] of [[0.2, 0.3], [0.3, -0.6], [0.15, 2.2]]) {
        const st = new THREE.Shape(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? 0.01 : 0.024, aa = (i / 10) * TAU + Math.PI / 2; i ? st.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr) : st.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
        const t = (y - yb) / 0.36, rr = 0.14 * (1 - t) + 0.006;
        add(new THREE.ShapeGeometry(st).rotateY(a).translate(Math.sin(a) * rr, y, -0.01 - 0.12 * t * t + Math.cos(a) * rr), "#ffe36b", 1, false, "tipY2");
      }
      break;
    }
    case "laurel": {
      const k = R * 1.05;
      for (const s of [1, -1]) {
        const pts = [];
        for (let i = 0; i <= 10; i++) { const a = s * (0.08 + (i / 10) * 0.85) * Math.PI; pts.push(V3(Math.sin(a) * E.x * k, 0.085 + 0.01 * Math.sin(i), Math.cos(a) * E.z * k)); }
        add(sweep(pts, 0.004, 4), "#5d7f2e");
        for (let i = 1; i <= 9; i++) for (const up of [1, -1]) {
          const p = pts[i], tan = pts[i + 1].clone().sub(pts[i - 1]).normalize();
          add(orient(ell(0.01, 0.028, 0.004, d, 6, 4), tan.clone().multiplyScalar(-s).add(V3(0, up * 0.8, 0)), p.clone().add(V3(0, up * 0.012, 0))), up > 0 ? "#79a83f" : "#5f8f32", 0.05, false);
        }
      }
      break;
    }
    case "top_hat": {
      const blk = "#18181e";
      add(new THREE.CylinderGeometry(0.17, 0.17, 0.012, sg(24, d)).scale(1, 1, 1.12).rotateX(-0.1).translate(0, 0.11, -0.01), blk);
      add(new THREE.CylinderGeometry(0.118, 0.106, 0.23, sg(20, d)).rotateX(-0.1).translate(0, 0.23, -0.022), blk);
      add(new THREE.CylinderGeometry(0.109, 0.108, 0.04, sg(20, d), 1, true).rotateX(-0.1).translate(0, 0.14, -0.012), col.team, 0.15, false);
      add(new THREE.TorusGeometry(0.17, 0.01, 4, sg(24, d)).rotateX(Math.PI / 2).scale(1, 1, 1.12).rotateX(-0.1).translate(0, 0.116, -0.01), blk);
      break;
    }
  }
  return parts;
}

// Couvre-chef supplémentaire de la mascotte (tenue « funny ») : capuche de rat
function ratHood(E, d, fur) {
  const parts = hoodShell(E, d).map(p => ({ g: p.g, c: p.tone === "inner" ? "#8b8e98" : fur, glow: 0, o: p.o !== false, w: p.w || "head" }));
  const pink = "#f29bb0";
  for (const s of [1, -1]) {
    parts.push({ g: ell(0.078, 0.078, 0.02, d, 16, 10).rotateY(s * 0.3).rotateZ(-s * 0.35).translate(s * 0.15, 0.2, -0.03), c: fur, glow: 0, o: true });
    parts.push({ g: ell(0.052, 0.052, 0.01, d, 12, 8).rotateY(s * 0.3).rotateZ(-s * 0.35).translate(s * 0.153, 0.2, -0.015), c: pink, glow: 0, o: false });
    parts.push({ g: ell(0.024, 0.026, 0.02, d, 10, 8).translate(s * 0.05, 0.195, 0.155), c: "#111117", glow: 0, o: true });
    parts.push({ g: ell(0.008, 0.008, 0.005, d, 6, 4).translate(s * 0.05 + 0.008, 0.204, 0.173), c: "#ffffff", glow: 1, o: false });
    for (const k of [-1, 1]) parts.push({ g: bar(V3(s * 0.04, 0.155 + k * 0.008, 0.2), V3(s * 0.14, 0.16 + k * 0.03, 0.2), 0.0022, 3), c: "#f4f4f4", glow: 0.3, o: false });
  }
  parts.push({ g: new THREE.ConeGeometry(0.058, 0.1, sg(14, d)).rotateX(Math.PI / 2).translate(0, 0.15, 0.2), c: fur, glow: 0, o: true });
  parts.push({ g: new THREE.SphereGeometry(0.022, 10, 8).translate(0, 0.15, 0.252), c: pink, glow: 0.1, o: true });
  for (const s of [1, -1]) parts.push({ g: new THREE.BoxGeometry(0.018, 0.028, 0.008).translate(s * 0.011, 0.11, 0.195), c: "#ffffff", glow: 0.1, o: true });
  return parts;
}

// ════════════════════════ Assemblage de la tête ════════════════════════
// ctx : { M, d, q, key, parts, col, app, hood (bool|"rat") } ; renvoie { lenses, pivots, labelLift }
export function buildHead(ctx, hoodMode) {
  const { M, d, col, app } = ctx, E = M.E, C = M.C;
  const put = (s, c, g = 0, o = true) => { if (s) ctx.parts.push({ s, c, g, o }); };
  const at = g => g.translate(C.x, C.y, C.z);
  const K = `h|${d}`;

  // crâne, oreilles, nez, joues
  put(shape(`${K}|skull`, () => bake([[at(warp(new THREE.SphereGeometry(1, sg(30, d), sg(22, d)).scale(E.x, E.y, E.z), v => headDeform(v, E))), B.head]], { smooth: true })), col.skin);
  put(shape(`${K}|ears`, () => bake([1, -1].map(s => [at(ell(0.018, 0.036, 0.027, d, 10, 8).rotateY(s * 0.3).translate(s * 0.147, -0.012, -0.006)), B.head]))), col.skin);
  put(shape(`${K}|earsIn`, () => bake([1, -1].map(s => [at(ell(0.007, 0.022, 0.015, d, 8, 6).rotateY(s * 0.3).translate(s * 0.158, -0.012, 0.0)), B.head]))), col.skinDark, 0, false);
  put(shape(`${K}|nose`, () => bake([[at(ell(0.022, 0.019, 0.02, d, 12, 8).translate(0, -0.028, 0.14)), B.head]])), col.nose, 0, true);
  if (ctx.q !== "low") put(shape(`${K}|blush`, () => bake([1, -1].map(s => [at(onFace(ellipseShape(0.022, 0.012, 12).translate(s * 0.088, -0.047, 0), E, 0.0012)), B.head]))), col.blush, 0, false);

  // yeux
  const eyeType = app.eyes;
  for (const side of [0, 1]) {
    const s = side ? -1 : 1, eb = side ? B.eyeR : B.eyeL, pb = side ? B.pupilR : B.pupilL;
    const EC = V3(s * 0.057, 0.008, 0.117);
    const T = g => at(g.translate(EC.x, EC.y, EC.z));
    put(shape(`${K}|sclera|${side}`, () => bake([[T(ell(0.036, 0.043, 0.026, d, 16, 12)), eb]])), "#fbfbff", 0.06, false);
    put(shape(`${K}|iris|${side}`, () => bake([[T(new THREE.SphereGeometry(1, sg(18, d), 5, 0, TAU, 0, 0.64).rotateX(Math.PI / 2).scale(0.0372, 0.0443, 0.0283)), pb]])), col.eye, 0.12, false);
    put(shape(`${K}|pupil|${side}`, () => bake([[T(new THREE.SphereGeometry(1, sg(12, d), 3, 0, TAU, 0, 0.32).rotateX(Math.PI / 2).scale(0.0378, 0.045, 0.0298)), pb]])), "#07070b", 0, false);
    put(shape(`${K}|glint|${side}`, () => bake([[T(ell(0.0085, 0.0085, 0.004, d, 8, 6).translate(0.011, 0.015, 0.028)), pb], [T(ell(0.0042, 0.0042, 0.003, d, 6, 4).translate(-0.009, -0.011, 0.029)), pb]])), "#ffffff", 1, false);
    const upper = eyeType === "determined" || eyeType === "sleepy";
    if (!upper) {
      const ae = side ? 0.89 * Math.PI : 0.11 * Math.PI;
      put(shape(`${K}|lash|${side}`, () => bake([
        [T(new THREE.TorusGeometry(0.037, 0.0042, 4, sg(14, d), 0.78 * Math.PI).rotateZ(0.11 * Math.PI).scale(1, 1.17, 1).translate(0, 0, 0.003)), eb],
        [T(orient(new THREE.ConeGeometry(0.0055, 0.02, 4).translate(0, 0.01, 0), V3(s * 0.8, 0.6, 0), V3(0.037 * Math.cos(ae), 0.037 * 1.17 * Math.sin(ae), 0.003))), eb],
      ])), LASH, 0, false);
    }
    const lid = (th, tilt, lower) => {
      const g = new THREE.SphereGeometry(1, sg(16, d), sg(6, d), 0, TAU, 0, th);
      const line = new THREE.TorusGeometry(Math.sin(th), 0.075, 4, sg(14, d), Math.PI).rotateX(Math.PI / 2).translate(0, Math.cos(th), 0);
      for (const x of [g, line]) { if (lower) x.rotateX(Math.PI); x.rotateZ(tilt).scale(0.0396, 0.0473, 0.036); }
      return [T(g), T(line)];
    };
    if (eyeType !== "normal") {
      const [g, line] = eyeType === "happy" ? lid(0.95, -s * 0.12, true) : eyeType === "determined" ? lid(0.98, s * 0.4, false) : lid(1.22, 0, false);
      put(shape(`${K}|lid|${eyeType}|${side}`, () => bake([[g, eb]])), col.skin, 0, false);
      put(shape(`${K}|lidline|${eyeType}|${side}`, () => bake([[line, eb]])), LASH, 0, false);
    }
    // sourcils
    const [tilt, dy] = { normal: [0.06, 0], happy: [-0.16, 0.008], determined: [0.34, -0.006], sleepy: [-0.06, 0.004] }[eyeType] || [0, 0];
    const bb = side ? B.browR : B.browL;
    put(shape(`${K}|brow|${eyeType}|${side}`, () => {
      const g = new THREE.CapsuleGeometry(0.0085, 0.044, 2, sg(6, d)).rotateZ(Math.PI / 2);
      warp(g, v => { v.y -= 7 * v.x * v.x; v.z *= 0.55; });
      const q = surf(E, s * 0.058, 0.07 + dy, 0.006);
      g.rotateZ(s * tilt).rotateX(-Math.atan2(q.n.y, q.n.z) * 0.8).rotateY(Math.atan2(q.n.x, q.n.z)).translate(q.p.x, q.p.y, q.p.z);
      return bake([[at(g), bb]]);
    }), col.brow, 0, false);
  }

  // bouches (affichées une à la fois via l'échelle de leur os)
  put(shape(`${K}|mouthN`, () => bake([[at(onFace(arcRibbon(0.03, 0.0065, 1.2 * Math.PI, 1.8 * Math.PI, sg(12, d), 0.5).translate(0, -0.05, 0), E, 0.0035)), B.mouthN]])), "#4a1820", 0, false);
  put(shape(`${K}|mouthS`, () => bake([[at(onFace(ellipseShape(0.034, 0.026, sg(16, d), Math.PI, TAU).translate(0, -0.066, 0), E, 0.003)), B.mouthS]])), "#5b1a24", 0, false);
  put(shape(`${K}|mouthSt`, () => bake([[at(onFace(flatShape([[-0.029, -0.0668], [0.029, -0.0668], [0.025, -0.0748], [-0.025, -0.0748]]), E, 0.0037)), B.mouthS]])), "#ffffff", 0.1, false);
  put(shape(`${K}|mouthSg`, () => bake([[at(onFace(ellipseShape(0.016, 0.0065, 10).translate(0, -0.0845, 0), E, 0.0034)), B.mouthS]])), "#e06a78", 0, false);
  put(shape(`${K}|mouthO`, () => bake([[at(onFace(ellipseShape(0.024, 0.03, sg(16, d)).translate(0, -0.08, 0), E, 0.003)), B.mouthO]])), "#4a1420", 0, false);
  put(shape(`${K}|mouthOt`, () => bake([[at(onFace(ellipseShape(0.016, 0.011, 10, Math.PI, TAU).translate(0, -0.096, 0), E, 0.0034)), B.mouthO]])), "#e06a78", 0, false);
  put(shape(`${K}|mouthOd`, () => bake([[at(onFace(flatShape([[-0.016, -0.0535], [0.016, -0.0535], [0.013, -0.059], [-0.013, -0.059]]), E, 0.0036)), B.mouthO]])), "#ffffff", 0.1, false);

  // pilosité faciale
  if (app.facialHair !== "none" && hoodMode !== "rat") {
    for (const [i, p] of facialHair(app.facialHair, E, d).entries()) {
      const c = p.tone === "stubble" ? col.stubble : col.beard;
      put(shape(`${K}|fh|${app.facialHair}|${i}`, () => bake([[at(p.g), B.head]])), c, 0, p.o);
    }
  }

  // cheveux (masqués selon le couvre-chef / la capuche)
  const hw = hoodMode === "rat" ? "hood" : app.headwear;
  const hidden = HIDE[hw] || [];
  const hs = shape(`hs|${app.hairStyle}|${d}`, () => hairStyle(app.hairStyle, E, d));
  const piv = hs.pivots;
  const pb = piv ? piv.back : V3(0, 0.02, -0.12), pt = piv ? piv.tail : V3(0, -0.17, -0.17);
  const hang = (x, y) => {
    const ry = y - C.y, k = smoothstep(pb.y - 0.01, pb.y - 0.08, ry), t = smoothstep(pt.y, pt.y - 0.09, ry);
    return [[B.head, 1 - k], [B.hairBack, k * (1 - t)], [B.hairTail, k * t]];
  };
  let visible = 0;
  hs.parts.forEach((p, i) => {
    if (hidden.includes(p.cat)) return;
    visible++;
    const c = col.hairTone[p.tone] || col.hair;
    put(shape(`${K}|hair|${app.hairStyle}|${i}`, () => bake([[at(p.g.clone()), p.w === "head" ? B.head : hang]])), c, p.tone === "shine" ? 0.35 : col.hairGlow, p.tone !== "shine" && p.tone !== "tie");
  });
  let vol = hs.vol;
  if (hidden.includes("top")) vol = { r: Math.min(vol.r, 1.1), top: Math.min(vol.top, E.y * 1.09) };
  if (!visible && hoodMode !== "rat") vol = { r: 1.0, top: E.y };

  // lunettes
  const lenses = [];
  if (app.glasses !== "none") {
    const gp = glassesParts(app.glasses, E, d, col);
    gp.parts.forEach((p, i) => {
      if (hoodMode === "rat" && p.keepOut) return;
      put(shape(`${K}|gl|${app.glasses}|${i}|${p.c}`, () => bake([[at(p.g.clone()), B.head]])), p.c, p.glow || 0, false);
    });
    for (const l of gp.lenses) lenses.push({ g: at(l.g.clone()), color: l.color, glowing: !!l.glowing });
  }

  // couvre-chef
  const tipY = C.y + vol.top;
  const tipW = kind => (x, y) => {
    if (kind === "tip") return [[B.hatTip, 1]];
    const lo = kind === "tipY2" ? C.y + 0.28 : tipY + 0.05, hi = kind === "tipY2" ? C.y + 0.42 : tipY + 0.16;
    const k = smoothstep(lo, hi, y);
    return [[B.head, 1 - k], [B.hatTip, k]];
  };
  const neckW = (x, y) => { const k = smoothstep(C.y - 0.14, C.y - 0.24, y); return [[B.head, 1 - k], [B.chest, k]]; };
  const wOf = w => (w === "head" ? B.head : w === "neck" ? neckW : tipW(w));
  let hwParts = [];
  if (hoodMode === "rat") hwParts = ratHood(E, d, ctx.furColor).map(p => ({ ...p, rat: true }));
  if (app.headwear !== "none") {
    const hv = hoodMode === "rat" ? { r: 1.3, top: 0.24 } : vol;
    hwParts = hwParts.concat(headwear(app.headwear, E, d, hv, col).map(p => ({ ...p, c: p.c })));
  }
  const hwKey = hoodMode === "rat" ? "rat" : `${app.headwear}|${vol.r.toFixed(2)}|${vol.top.toFixed(3)}`;
  hwParts.forEach((p, i) => {
    const key = `${K}|hw|${hwKey}|${p.rat ? "r" : app.headwear}|${i}`;
    put(shape(key, () => bake([[at(p.g.clone()), wOf(p.w)]])), p.c, p.glow || 0, p.o !== false);
  });
  const hatTop = { top_hat: 0.36, wizard_hat: 0.47, knight_helmet: 0.33, crown: vol.top + 0.08, antenna: vol.top + 0.25, beanie: 0.24, cap: 0.2 }[app.headwear];
  const labelLift = Math.max(0, (hatTop ?? vol.top) - 0.2) + (hoodMode === "rat" ? 0.08 : 0);
  const tipRel = { wizard_hat: V3(0, 0.3, -0.03), knight_helmet: V3(0, E.y * 1.22 + 0.02, -0.03), beanie: V3(0, E.y * 1.18, -0.04) }[app.headwear] || V3(0, vol.top, 0);
  const tip = V3(C.x + tipRel.x, C.y + tipRel.y, C.z + tipRel.z);
  return { lenses, pivots: { back: V3(C.x + pb.x, C.y + pb.y, C.z + pb.z), tail: V3(C.x + pt.x, C.y + pt.y, C.z + pt.z), tip }, labelLift };
}
