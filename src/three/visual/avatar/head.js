// Tête : assemblage du visage adulte (face.js), des 22 coiffures (hair.js), lunettes et couvre-chefs.
// Géométries construites relativement au centre de la tête C puis translatées ; poids = os de la tête / visage / mèches.
import * as THREE from "three";
import { shape, bake, rings, sweep, twoSided, splitSides, ell, sg, V3, smoothstep, orient, bar, cutTris } from "./kit.js";
import { B } from "./skeleton.js";
import { headModel, skullGeo, earGeos, noseGeos, eyeGeos, browGeos, mouthGeos, facialHairGeos } from "./face.js";
import { hairStyle } from "./hair.js";

const TAU = Math.PI * 2;
// échelle de la tête (proportions adultes : tête un peu plus petite que le modèle d'origine)
export const HS = 0.93;

// Masquage des cheveux sous les couvre-chefs
const HIDE = {
  none: [], headband: [], headset: [], antenna: [], crown: [], laurel: [],
  cap: ["top", "fringe"], beanie: ["top", "fringe"], wizard_hat: ["top"], top_hat: ["top"],
  knight_helmet: ["top", "cap", "side", "fringe"], hood: ["top", "cap", "side", "back", "fringe"],
};

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
// ctx : { M, d, q, key, parts, col, app, hood (bool|"rat") } ; renvoie { lenses, pivots, face (positions des os du visage), labelLift }
export function buildHead(ctx, hoodMode) {
  const { M, d, col, app } = ctx, E = M.E, C = M.C;
  const H = headModel(app.faceShape);
  const put = (s, c, g = 0, o = true, c2 = null) => { if (s) ctx.parts.push({ s, c, c2, g, o }); };
  // repère tête -> modèle : tête légèrement réduite (proportions adultes), centrée sur C
  const at = g => g.scale(HS, HS, HS).translate(C.x, C.y, C.z);
  const abs = v => [C.x + v.x * HS, C.y + v.y * HS, C.z + v.z * HS];
  const K = `h|${d}`, FK = `${K}|${H.key}`;

  // crâne, oreilles, nez
  put(shape(`${FK}|skull`, () => bake([[at(skullGeo(H, d)), B.head]], { smooth: true })), col.skin);
  put(shape(`${FK}|ears`, () => bake([1, -1].flatMap(s => earGeos(H, d, s).skin.map(g => [at(g), B.head])))), col.skin);
  put(shape(`${FK}|earsIn`, () => bake([1, -1].map(s => [at(earGeos(H, d, s).inner), B.head]))), col.skinDark, 0, false);
  const nk = `${FK}|nose|${app.nose}`;
  put(shape(nk, () => bake(noseGeos(H, d, app.nose).skin.map(g => [at(g), B.head]))), col.nose, 0, false);
  put(shape(nk + "|n", () => bake(noseGeos(H, d, app.nose).dark.map(g => [at(g), B.head]))), col.nostril, 0, false);

  // yeux (paupières + globe + iris), sourcils
  const face = {};
  for (const side of [0, 1]) {
    const s = side ? -1 : 1, eb = side ? B.eyeR : B.eyeL, pb = side ? B.pupilR : B.pupilL, bb = side ? B.browR : B.browL;
    const EY = shape(`${FK}|eye|${app.eyeShape}|${app.eyes}|${side}`, () => {
      const g = eyeGeos(H, d, app.eyeShape, app.eyes, s), lw = g.lidW;
      return {
        C: g.C, boneY: g.boneY, sep: g.Y.sep,
        lids: bake([[at(g.lids), (x, y, z, i) => [[eb, lw[i]], [B.head, 1 - lw[i]]]]]),
        lash: bake([[at(g.lash), eb]]), lower: bake([[at(g.lower), eb]]),
        globe: bake([[at(g.globe), eb]]), iris: bake([[at(g.iris), pb]]), pupil: bake([[at(g.pupil), pb]]),
        glint: bake([[at(g.glint), pb]]), caruncle: ctx.q === "low" ? null : bake([[at(g.caruncle), eb]]),
      };
    });
    put(EY.globe, col.sclera, 0.03, false);
    put(EY.iris, col.eye, 0.1, false, col.irisDark);
    put(EY.pupil, "#060608", 0, false);
    put(EY.glint, "#ffffff", 1, false);
    put(EY.lids, col.skin, 0, false, col.lid);
    put(EY.lash, col.lash, 0, false);
    put(EY.lower, col.lidLine, 0, false);
    put(EY.caruncle, col.caruncle, 0, false);
    face[side ? "eyeR" : "eyeL"] = abs(V3(EY.C.x, EY.boneY, EY.C.z));
    face[side ? "pupilR" : "pupilL"] = abs(EY.C);
    const BR = shape(`${FK}|brow|${app.brows}|${app.eyes}|${EY.sep}|${side}`, () => {
      const b = browGeos(H, d, app.brows, s, EY.sep, app.eyes);
      return { s: bake(b.geos.map(g => [at(g), bb])), pivot: b.pivot, scar: b.scar ? bake([[at(b.scar), B.head]]) : null };
    });
    put(BR.s, col.brow, 0, false);
    put(BR.scar, col.scar, 0, false);
    face[side ? "browR" : "browL"] = abs(BR.pivot);
  }

  // bouches (affichées une à la fois via l'échelle de leur os)
  const MO = shape(`${FK}|mouth`, () => {
    const m = mouthGeos(H, d), b = (g, bone) => bake([[at(g), bone]]);
    return {
      N: b(m.lineN, B.mouthN), NL: b(m.lipN, B.mouthN), S: b(m.smile, B.mouthS), ST: b(m.smileT, B.mouthS), SG: b(m.smileG, B.mouthS),
      O: b(m.open, B.mouthO), OT: b(m.openT, B.mouthO), OD: b(m.openD, B.mouthO), pivot: m.pivot,
    };
  });
  put(MO.N, col.lipLine, 0, false); put(MO.NL, col.lip, 0, false);
  put(MO.S, "#4a1a1e", 0, false); put(MO.ST, "#f4f1ea", 0.05, false); put(MO.SG, "#c65a66", 0, false);
  put(MO.O, "#3e141a", 0, false); put(MO.OT, "#c65a66", 0, false); put(MO.OD, "#f4f1ea", 0.05, false);
  face.mouthN = face.mouthS = face.mouthO = abs(MO.pivot);

  // pilosité faciale
  if (app.facialHair !== "none" && hoodMode !== "rat") {
    const FH = shape(`${FK}|fh|${app.facialHair}`, () => facialHairGeos(H, d, app.facialHair).map(p => ({ s: bake([[at(p.g), B.head]]), tone: p.tone, fade: p.fade, o: p.o })));
    for (const p of FH) put(p.s, p.tone === "stubble" ? col.stubble : col.beard, 0, p.o, p.fade === "skin" ? col.skin : p.fade === "stubble" ? col.stubble : null);
  }

  // cheveux (masqués selon le couvre-chef / la capuche)
  const hw = hoodMode === "rat" ? "hood" : app.headwear;
  const hidden = HIDE[hw] || [];
  const hs = shape(`hs|${app.hairStyle}|${d}|${H.key}|${M.build}`, () => hairStyle(app.hairStyle, H, d, C, y => M.torsoAt(y), HS));
  const piv = hs.pivots;
  const pb = piv ? piv.back : V3(0, 0.02, -0.12), pt = piv ? piv.tail : V3(0, -0.17, -0.17);
  const hang = (x, y) => {
    const ry = (y - C.y) / HS, k = smoothstep(pb.y - 0.01, pb.y - 0.08, ry), t = smoothstep(pt.y, pt.y - 0.09, ry);
    return [[B.head, 1 - k], [B.hairBack, k * (1 - t)], [B.hairTail, k * t]];
  };
  let visible = 0;
  hs.parts.forEach((p, i) => {
    if (hidden.includes(p.cat)) return;
    visible++;
    const c = col.hairTone[p.tone] || col.hair, c2 = p.fade ? col.hairTone[p.fade] || null : null;
    put(shape(`${K}|hair|${app.hairStyle}|${H.key}|${M.build}|${i}`, () => bake([[at(p.g.clone()), p.w === "head" ? B.head : hang]], { smooth: p.cat === "cap" })), c, col.hairGlow, p.o !== false && p.tone !== "tie", c2);
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
  const tipY = C.y + vol.top * HS;
  const tipW = kind => (x, y) => {
    if (kind === "tip") return [[B.hatTip, 1]];
    const lo = kind === "tipY2" ? C.y + 0.28 * HS : tipY + 0.05 * HS, hi = kind === "tipY2" ? C.y + 0.42 * HS : tipY + 0.16 * HS;
    const k = smoothstep(lo, hi, y);
    return [[B.head, 1 - k], [B.hatTip, k]];
  };
  const neckW = (x, y) => { const k = smoothstep(C.y - 0.14 * HS, C.y - 0.24 * HS, y); return [[B.head, 1 - k], [B.chest, k]]; };
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
  const labelLift = (Math.max(0, (hatTop ?? vol.top) - 0.2) + (hoodMode === "rat" ? 0.08 : 0)) * HS;
  const tipRel = { wizard_hat: V3(0, 0.3, -0.03), knight_helmet: V3(0, E.y * 1.22 + 0.02, -0.03), beanie: V3(0, E.y * 1.18, -0.04) }[app.headwear] || V3(0, vol.top, 0);
  const tip = V3(...abs(tipRel));
  return { lenses, pivots: { back: V3(...abs(pb)), tail: V3(...abs(pt)), tip }, face, labelLift };
}
