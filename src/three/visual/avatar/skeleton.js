// Squelette de l'avatar (pose de liaison), morphologies et fonctions de poids de peau.
// Repère : pieds à y=0, regard vers +Z, gauche du joueur = +X ; modèle de référence 1,80 m.
import * as THREE from "three";
import { smoothstep, lerp } from "./kit.js";

export const H0 = 1.8;

export const BONES = [
  "hips", "spine", "chest", "neck", "head",
  "thighL", "shinL", "footL", "thighR", "shinR", "footR",
  "upperArmL", "forearmL", "handL", "upperArmR", "forearmR", "handR",
  "eyeL", "eyeR", "pupilL", "pupilR", "browL", "browR", "mouthN", "mouthS", "mouthO",
  "hairBack", "hairTail", "capeA", "capeB", "coatBack", "scarf", "hatTip",
];
export const B = Object.freeze(Object.fromEntries(BONES.map((n, i) => [n, i])));
const PARENT = {
  hips: null, spine: "hips", chest: "spine", neck: "chest", head: "neck",
  thighL: "hips", shinL: "thighL", footL: "shinL", thighR: "hips", shinR: "thighR", footR: "shinR",
  upperArmL: "chest", forearmL: "upperArmL", handL: "forearmL", upperArmR: "chest", forearmR: "upperArmR", handR: "forearmR",
  eyeL: "head", eyeR: "head", pupilL: "eyeL", pupilR: "eyeR", browL: "head", browR: "head",
  mouthN: "head", mouthS: "head", mouthO: "head",
  hairBack: "head", hairTail: "hairBack", capeA: "chest", capeB: "capeA", coatBack: "hips", scarf: "chest", hatTip: "head",
};
export const PARENT_INDEX = BONES.map(n => (PARENT[n] ? B[PARENT[n]] : -1));

// Morphologies : largeur (w), profondeur (d), poitrine, ventre, épaules, hanches, membres, cou
export const BUILDS = {
  slim:     { w: 0.86, d: 0.88, chest: 0.94, belly: 0.92, sh: 0.92, hip: 0.95, limb: 0.84, neck: 0.9 },
  normal:   { w: 1, d: 1, chest: 1, belly: 1, sh: 1, hip: 1, limb: 1, neck: 1 },
  athletic: { w: 1.04, d: 1.05, chest: 1.16, belly: 0.94, sh: 1.1, hip: 1, limb: 1.13, neck: 1.14 },
  stocky:   { w: 1.17, d: 1.2, chest: 1.08, belly: 1.32, sh: 1.08, hip: 1.12, limb: 1.2, neck: 1.22 },
};

// Profil du tronc (y, demi-largeur, demi-profondeur, décalage z) — morphologie normale
const TORSO = [
  [0.842, 0.07, 0.055, 0, "hip"],
  [0.868, 0.138, 0.1, 0, "hip"],
  [0.915, 0.168, 0.12, -0.004, "hip"],
  [0.985, 0.176, 0.125, -0.004, "hip"],
  [1.06, 0.166, 0.121, 0.004, "belly"],
  [1.14, 0.172, 0.126, 0.006, "belly"],
  [1.235, 0.19, 0.134, 0.008, "chest"],
  [1.315, 0.197, 0.136, 0.004, "chest"],
  [1.375, 0.188, 0.128, -0.002, "chest"],
  [1.418, 0.158, 0.11, -0.006, "sh"],
  [1.448, 0.112, 0.084, -0.006, "neck"],
  [1.462, 0.078, 0.068, -0.006, "neck"],
];
// Profils des membres (hauteur, rayon)
const LEG = [[1.0, 0.09], [0.93, 0.089], [0.82, 0.08], [0.68, 0.068], [0.56, 0.057], [0.5, 0.056], [0.44, 0.06], [0.34, 0.061], [0.22, 0.048], [0.13, 0.04], [0.085, 0.039]];
const ARM = [[1.445, 0.054], [1.37, 0.056], [1.27, 0.05], [1.2, 0.046], [1.13, 0.042], [1.07, 0.045], [0.98, 0.04], [0.9, 0.035], [0.875, 0.034]];

const interp = (tab, y) => {
  if (y >= tab[0][0]) return tab[0][1];
  for (let i = 0; i < tab.length - 1; i++) {
    const [y0, r0] = tab[i], [y1, r1] = tab[i + 1];
    if (y <= y0 && y >= y1) return lerp(r0, r1, (y0 - y) / (y0 - y1));
  }
  return tab[tab.length - 1][1];
};

export function bodyMetrics(build) {
  const K = BUILDS[build] || BUILDS.normal;
  const fac = t => (t === "chest" ? K.chest : t === "belly" ? K.belly : t === "hip" ? K.hip : t === "sh" ? (K.chest + K.sh) / 2 : K.neck);
  const torso = TORSO.map(([y, rx, rz, z, t]) => {
    const f = fac(t);
    const bz = t === "belly" ? (K.belly - 1) * 0.05 : 0;
    return { y, rx: rx * K.w * f, rz: rz * K.d * (t === "belly" ? K.belly : Math.sqrt(f)), z: z + bz };
  });
  const M = {
    K, build: BUILDS[build] ? build : "normal",
    hipX: 0.09 * K.hip, hipY: 0.925, kneeY: 0.505, ankleY: 0.088,
    pelvisY: 0.975, spineY: 1.1, chestY: 1.265, neckY: 1.452, headY: 1.525,
    shX: 0.2 * K.sh + 0.012, shY: 1.39, elY: 1.13, wrY: 0.878,
    C: new THREE.Vector3(0, 1.648, 0.012), E: new THREE.Vector3(0.15, 0.158, 0.146),
    torso,
    torsoAt(y) {
      const t = this.torso;
      if (y <= t[0].y) return t[0];
      for (let i = 0; i < t.length - 1; i++) {
        const a = t[i], b = t[i + 1];
        if (y >= a.y && y <= b.y) { const k = (y - a.y) / (b.y - a.y); return { y, rx: lerp(a.rx, b.rx, k), rz: lerp(a.rz, b.rz, k), z: lerp(a.z, b.z, k) }; }
      }
      return t[t.length - 1];
    },
    legR: y => interp(LEG, y) * K.limb,
    armR: y => interp(ARM, y) * (0.5 + 0.5 * K.limb) * (y > 1.2 ? K.limb * 0.5 + 0.5 : 1),
  };
  // os : positions de liaison (repère modèle)
  const eyeY = M.C.y + 0.008, eyeZ = M.C.z + 0.117;
  M.bind = {
    hips: [0, M.pelvisY, 0], spine: [0, M.spineY, 0], chest: [0, M.chestY, 0], neck: [0, M.neckY, -0.004], head: [0, M.headY, 0],
    thighL: [M.hipX, M.hipY, 0], shinL: [M.hipX, M.kneeY, 0], footL: [M.hipX, M.ankleY, 0],
    thighR: [-M.hipX, M.hipY, 0], shinR: [-M.hipX, M.kneeY, 0], footR: [-M.hipX, M.ankleY, 0],
    upperArmL: [M.shX, M.shY, -0.004], forearmL: [M.shX, M.elY, -0.004], handL: [M.shX, M.wrY, -0.004],
    upperArmR: [-M.shX, M.shY, -0.004], forearmR: [-M.shX, M.elY, -0.004], handR: [-M.shX, M.wrY, -0.004],
    eyeL: [0.057, eyeY, eyeZ], eyeR: [-0.057, eyeY, eyeZ], pupilL: [0.057, eyeY, eyeZ], pupilR: [-0.057, eyeY, eyeZ],
    browL: [0.058, M.C.y + 0.07, M.C.z + 0.13], browR: [-0.058, M.C.y + 0.07, M.C.z + 0.13],
    mouthN: [0, M.C.y - 0.078, M.C.z + 0.128], mouthS: [0, M.C.y - 0.078, M.C.z + 0.128], mouthO: [0, M.C.y - 0.078, M.C.z + 0.128],
    hairBack: [0, M.C.y + 0.02, M.C.z - 0.12], hairTail: [0, M.C.y - 0.17, M.C.z - 0.17],
    capeA: [0, 1.43, -0.13], capeB: [0, 1.06, -0.2], coatBack: [0, 1.0, -0.12], scarf: [0.04, 1.43, 0.1], hatTip: [0, M.C.y + 0.17, M.C.z],
  };
  return M;
}

// ── Poids de peau ──
const W = (...p) => p;
// Tronc : bassin -> colonne -> poitrine
export function torsoW(x, y) {
  const s1 = smoothstep(0.99, 1.1, y), s2 = smoothstep(1.15, 1.26, y);
  return W([B.hips, 1 - s1], [B.spine, s1 * (1 - s2)], [B.chest, s2]);
}
// Jambe : bassin -> cuisse -> tibia -> pied
export function legW(side) {
  const th = side ? B.thighR : B.thighL, sh = side ? B.shinR : B.shinL, ft = side ? B.footR : B.footL;
  return (x, y) => {
    const h = smoothstep(0.985, 0.89, y), k = smoothstep(0.545, 0.47, y), a = smoothstep(0.13, 0.095, y);
    return W([B.hips, 1 - h], [th, h * (1 - k)], [sh, k * (1 - a)], [ft, a]);
  };
}
// Bras : bras -> avant-bras (coude doux)
export function armW(side) {
  const u = side ? B.upperArmR : B.upperArmL, f = side ? B.forearmR : B.forearmL;
  return (x, y) => { const k = smoothstep(1.16, 1.1, y); return W([u, 1 - k], [f, k]); };
}
// Jupe / pans de manteau : suivent bassin + cuisses, le dos flotte (coatBack)
export function skirtW(topY, hemY, follow = 0.55, back = 0.9) {
  return (x, y, z) => {
    const t = smoothstep(topY, hemY, y);
    const ang = Math.atan2(x, z); // 0 devant
    const b = smoothstep(0.45 * Math.PI, 0.85 * Math.PI, Math.abs(ang));
    const l = smoothstep(-0.05, 0.05, x);
    const wt = t * (1 - b) * follow, wb = t * b * back;
    return W([B.hips, 1 - wt - wb], [B.thighL, wt * l], [B.thighR, wt * (1 - l)], [B.coatBack, wb]);
  };
}
// Chaîne à 2 os le long d'une hauteur (cheveux longs, cape)
export function chainW(a, b, y0, y1, root = -1, rootY = null) {
  return (x, y) => {
    const k = smoothstep(y0, y1, y);
    if (root >= 0 && rootY != null) {
      const r = smoothstep(rootY[0], rootY[1], y);
      return W([root, 1 - r], [a, r * (1 - k)], [b, r * k]);
    }
    return W([a, 1 - k], [b, k]);
  };
}
