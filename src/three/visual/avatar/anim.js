// Animation procédurale : machine à états + fondus enchaînés entre poses, cycle de course calé sur la vitesse,
// mouvements secondaires (ressorts : cheveux, cape, pans de blouse, écharpe, pompon), regard et expressions.
import * as THREE from "three";
import { B } from "./skeleton.js";
import { clamp, smoothstep, lerp } from "./kit.js";

const TAU = Math.PI * 2;
const BODY = ["hips", "spine", "chest", "neck", "head", "thighL", "shinL", "footL", "thighR", "shinR", "footR",
  "upperArmL", "forearmL", "handL", "upperArmR", "forearmR", "handR"];
const R = Object.fromEntries(BODY.map((n, i) => [n, i * 3]));
const PX = BODY.length * 3, PY = PX + 1, PZ = PX + 2;
const SMILE = PX + 3, OPEN = PX + 4, BROW = PX + 5, FURROW = PX + 6, SQUINT = PX + 7, LOOKW = PX + 8;
const NCH = PX + 9;
const THIGH = 0.42, SHIN = 0.417, ANKLE = 0.088, HIP_DROP = 0.05, PELVIS = 0.975;

// Durées internes des gestes (s) si actionT n'est pas piloté
const DUR = { kick: 0.55, pass: 0.45, header: 0.62, tackle: 0.75, poke: 0.45, dive: 1.0,
  // gestes techniques de l'Arène
  roulette: 0.45, feint: 0.35, stepover: 0.35, nutmeg: 0.3, wallpass: 0.35, wallkick: 0.4, cut: 0.3 };
const ONE_SHOT = new Set(Object.keys(DUR));
// Poids du regard selon l'état
const LOOK = { loco: 1, charge: 0.45, kick: 0.25, pass: 0.5, header: 0.1, tackle: 0.25, poke: 0.4, dive: 0.15, celebrate: 0, stunned: 0,
  roulette: 0.1, feint: 0.5, stepover: 0.4, nutmeg: 0.3, wallpass: 0.5, wallkick: 0.2, cut: 0.4, press: 0.9 };
// gestes orientés (côté donné par diveDir : +1 = gauche du joueur)
const SIDED = new Set(["feint", "stepover", "cut", "wallkick"]);
export const CELEBRATIONS = ["kneeSlide", "jumpPump", "robot", "dab"];

// ── Écriture de poses ──
const rot = (p, b, x, y = 0, z = 0) => { const i = R[b]; p[i] = x; p[i + 1] = y; p[i + 2] = z; };
const add = (p, b, x, y = 0, z = 0) => { const i = R[b]; p[i] += x; p[i + 1] += y; p[i + 2] += z; };
// jambe : flexion (avant +), écart, rotation externe, genou (+ = talon vers l'arrière), cheville (+ = pointe basse)
function leg(p, side, flex, abd = 0, twist = 0, knee = 0, ankle = 0) {
  const s = side ? -1 : 1;
  rot(p, side ? "thighR" : "thighL", -flex, twist * s, abd * s);
  rot(p, side ? "shinR" : "shinL", knee);
  rot(p, side ? "footR" : "footL", ankle);
}
// bras : flexion (avant/haut +), abduction (écart +), balayage horizontal, coude, poignet
function arm(p, side, flex, abd = 0, swing = 0, elbow = 0, wrist = 0) {
  const s = side ? -1 : 1;
  rot(p, side ? "upperArmR" : "upperArmL", -flex, -swing * s, abd * s);
  rot(p, side ? "forearmR" : "forearmL", -elbow);
  rot(p, side ? "handR" : "handL", wrist);
}
const thighFlex = (p, side) => -p[R[side ? "thighR" : "thighL"]];
const knee = (p, side) => p[R[side ? "shinR" : "shinL"]];
// cheville à plat au sol
const flatFoot = (p, side, w = 1, extra = 0) => {
  const i = R[side ? "footR" : "footL"];
  p[i] = lerp(p[i], thighFlex(p, side) - knee(p, side) - p[R.hips], w) + extra;
};
// hauteur du bassin pour que le pied le plus bas touche le sol
function groundY(p) {
  const hx = p[R.hips], hz = p[R.hips + 2];
  let ext = 0;
  for (const side of [0, 1]) {
    const a = thighFlex(p, side) - hx, k = knee(p, side);
    const abd = Math.abs(p[R[side ? "thighR" : "thighL"] + 2]);
    ext = Math.max(ext, (THIGH * Math.cos(a) + SHIN * Math.cos(a - k)) * Math.cos(abd) + ANKLE);
  }
  return ext + HIP_DROP * Math.cos(hx) * Math.cos(hz) - PELVIS;
}
const ease = t => t * t * (3 - 2 * t);

export function createAnimator({ bones, rest, keeper = false, height = 1.8, root }) {
  const out = new Float32Array(NCH), from = new Float32Array(NCH), live = new Float32Array(NCH), base = new Float32Array(NCH);
  const tmpA = new Float32Array(NCH), tmpB = new Float32Array(NCH), tmpK = new Float32Array(NCH);
  const st = {
    sid: "loco", t: 0, fade: 1, fadeDur: 0.15, first: true, clock: Math.random() * 10,
    phase: 0, speed: 0, sprintW: 0, keeperW: keeper ? 1 : 0, keeper,
    act: { t0: 0, ext: false, lastT: 0, u: 0 }, variant: 0, celebN: Math.floor(Math.random() * 4),
    diveDir: 1, side: 1, look: { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, timer: 2, sacc: 0, saccT: 1, px: 0, py: 0 },
    blink: { next: 2 + Math.random() * 3, t: -1 }, target: null,
    vel: new THREE.Vector3(), prevPos: null, prevYaw: 0, yawRate: 0, accF: 0, prevVF: 0, prevPY: 0, vY: 0, aY: 0,
  };
  const springs = {};
  for (const k of ["hairBack", "hairTail", "capeA", "capeB", "coatBack", "scarf", "hatTip"]) springs[k] = { x: 0, vx: 0, z: 0, vz: 0 };

  // ── Poses ──
  function poseIdle(p, t, kp) {
    p.fill(0);
    const br = Math.sin(t * 2.1), sw = Math.sin(t * 0.43), sw2 = Math.sin(t * 0.61 + 1);
    rot(p, "hips", 0.02, 0.05 * sw, 0.03 * sw);
    p[PX] = 0.018 * sw;
    leg(p, 0, 0.02, 0.05, 0.14, 0.05 + 0.16 * Math.max(0, -sw), 0);
    leg(p, 1, 0.02, 0.05, 0.14, 0.05 + 0.16 * Math.max(0, sw), 0);
    rot(p, "spine", 0.01, -0.02 * sw, -0.03 * sw);
    rot(p, "chest", 0.015 * br, 0, 0);
    rot(p, "head", 0, 0, 0.03 * sw2);
    arm(p, 0, 0.06, 0.1 + 0.012 * br, 0, 0.2 + 0.03 * br);
    arm(p, 1, 0.06, 0.1 + 0.012 * br, 0, 0.2 + 0.03 * br);
    if (kp > 0) {
      const b = Math.sin(t * 7);
      const k = tmpK; k.fill(0);
      rot(k, "hips", 0.22, 0, 0);
      leg(k, 0, 0.62, 0.2, 0.18, 1.0 + 0.04 * b); leg(k, 1, 0.62, 0.2, 0.18, 1.0 - 0.04 * b);
      rot(k, "spine", 0.14); rot(k, "chest", 0.06); rot(k, "neck", -0.1); rot(k, "head", -0.22);
      arm(k, 0, 0.55, 0.55, 0, 0.75, -0.3); arm(k, 1, 0.55, 0.55, 0, 0.75, -0.3);
      for (let i = 0; i < NCH; i++) p[i] = lerp(p[i], k[i], kp);
    }
    flatFoot(p, 0); flatFoot(p, 1);
    p[PY] = groundY(p) + (kp > 0 ? 0.01 * Math.sin(t * 7) * kp : 0.004 * br);
    return p;
  }

  function poseMove(p, v, spr, ph) {
    p.fill(0);
    const run = smoothstep(1.8, 4.2, v), mv = 1;
    const amp = clamp(0.24 + 0.095 * v, 0, 0.98) * (1 + 0.08 * spr);
    const sL = Math.sin(ph), cL = Math.cos(ph);
    const lean = 0.03 + 0.026 * v + 0.12 * spr;
    rot(p, "hips", 0.06 * run, -0.13 * amp * sL, 0.03 * amp * sL);
    rot(p, "spine", lean * 0.55, 0.1 * amp * sL, -0.02 * amp * sL);
    rot(p, "chest", lean * 0.45, 0.18 * amp * sL, 0);
    rot(p, "neck", -lean * 0.4, 0, 0);
    rot(p, "head", -(lean + 0.06 * run) * 0.55 + 0.035 * amp * Math.cos(2 * ph), -0.06 * amp * sL, 0);
    for (const side of [0, 1]) {
      const f = side ? ph + Math.PI : ph, s = Math.sin(f), c = Math.cos(f);
      // flexion avant ample, extension arrière limitée (course réelle)
      const flex = amp * (s > 0 ? s : 0.6 * s) + 0.08 * run + p[R.hips];
      const swing = Math.pow(Math.max(0, Math.cos(f + 0.5)), 1.3);
      const kn = mv * (0.14 + 0.2 * run * Math.max(0, -c) + 0.28 * run * Math.max(0, s) * Math.max(0, s) + (0.35 + 1.05 * run + 0.45 * spr) * swing);
      leg(p, side, flex, 0.03, 0.08, kn, 0);
      flatFoot(p, side, 1 - swing, 0.4 * swing + 0.35 * run * Math.max(0, -s) * Math.max(0, -c));
      // bras opposés aux jambes
      const aAmp = amp * (0.7 + 0.45 * run + 0.3 * spr);
      arm(p, side, -aAmp * s + 0.1 * run, 0.1 + 0.06 * run, 0.12 * run * Math.max(0, -s), 0.3 + 0.85 * run + 0.3 * spr + 0.2 * Math.max(0, -s) * run, 0);
    }
    p[PY] = groundY(p) + run * (0.018 + 0.004 * v) * -Math.cos(2 * ph);
    return p;
  }

  function poseCharge(p, u) {
    p.fill(0);
    rot(p, "hips", 0.06, -0.28 * u, 0.02);
    rot(p, "spine", 0.06 - 0.1 * u, 0, 0); rot(p, "chest", 0.02, -0.18 * u, 0);
    rot(p, "head", 0.28, 0.1 * u, 0);
    leg(p, 0, 0.32, 0.1, 0.1, 0.45);
    leg(p, 1, -0.3 - 0.55 * u, 0.06, 0.05, 0.45 + 1.15 * u, 0.6);
    arm(p, 0, 0.25, 0.75 + 0.5 * u, 0, 0.3);
    arm(p, 1, -0.4 * u, 0.35, 0, 0.5);
    flatFoot(p, 0);
    p[PY] = groundY(p);
    p[FURROW] = 0.9; p[OPEN] = 0.25 * u; p[BROW] = -0.3;
    return p;
  }

  function poseKick(p, u) {
    p.fill(0);
    const strike = smoothstep(0.1, 0.36, u), fol = smoothstep(0.32, 0.6, u), rec = smoothstep(0.68, 1, u), keep = 1 - rec;
    const hy = lerp(-0.32, 0.38, strike) * keep;
    rot(p, "hips", 0.06, hy, 0.02);
    rot(p, "spine", (lerp(0.02, -0.2, strike) + 0.28 * fol) * keep, 0, 0);
    rot(p, "chest", 0.04, -hy * 0.6, 0);
    rot(p, "head", 0.3 * keep, 0, 0);
    leg(p, 0, 0.32 * keep + 0.02, 0.1, 0.1, 0.42 * keep + 0.06, 0);
    const kf = (lerp(-0.85, 1.28, strike) + 0.32 * fol) * keep;
    const kk = (lerp(1.55, 0.05, smoothstep(0.16, 0.34, u)) + 0.25 * fol) * keep + 0.08;
    leg(p, 1, kf, 0.06, 0.05, kk, 0.6 * keep);
    arm(p, 0, 0.3 * strike * keep, 0.25 + 1.0 * keep, 0, 0.35);
    arm(p, 1, lerp(-0.45, 0.85, strike) * keep, 0.3, 0.3 * strike * keep, 0.6);
    flatFoot(p, 0, 1, 0.35 * fol * keep);
    p[PY] = groundY(p) + 0.05 * fol * keep;
    const sh = smoothstep(0.18, 0.32, u) * (1 - smoothstep(0.6, 0.85, u));
    p[OPEN] = sh; p[FURROW] = 0.8 * keep; p[SQUINT] = 0.3 * sh;
    return p;
  }

  // passe intérieur du pied ; str > 0 : une-deux contre le mur (accompagnement plus appuyé)
  function posePass(p, u, str = 0) {
    p.fill(0);
    const back = smoothstep(0, 0.3, u), sw = smoothstep(0.3, 0.55, u), fol = smoothstep(0.5, 0.75, u) * (1 + 1.2 * str), rec = smoothstep(0.75, 1, u), keep = 1 - rec;
    rot(p, "hips", 0.04, (0.28 * sw * (1 + 0.4 * str) - 0.12 * back) * keep, 0);
    rot(p, "spine", 0.08 + (0.08 + 0.08 * str) * sw * keep, 0, 0); rot(p, "chest", 0, -0.15 * sw * (1 + 0.5 * str) * keep, 0);
    rot(p, "head", 0.3 * keep, 0, 0);
    leg(p, 0, 0.24 * keep + 0.02, 0.08, 0.1, 0.36 * keep + 0.06);
    leg(p, 1, (lerp(-0.65 * back, 0.8, sw) + 0.2 * fol) * keep, (0.18 + 0.15 * sw) * keep, 0.95 * keep, (0.7 - 0.45 * sw) * keep + 0.06, -0.2 * keep);
    arm(p, 0, 0.2, 0.25 + 0.4 * keep, 0, 0.35);
    arm(p, 1, 0.25 * sw, 0.2 + 0.3 * keep, 0, 0.4);
    flatFoot(p, 0);
    p[PY] = groundY(p);
    p[FURROW] = 0.3;
    return p;
  }

  function poseHeader(p, u) {
    p.fill(0);
    const jump = Math.sin(Math.PI * smoothstep(0.02, 0.85, u)), snap = smoothstep(0.34, 0.5, u);
    rot(p, "hips", 0.05, 0, 0);
    rot(p, "spine", lerp(-0.3, 0.32, snap) * jump, 0, 0);
    rot(p, "neck", lerp(-0.3, 0.3, snap) * jump, 0, 0);
    rot(p, "head", lerp(-0.35, 0.45, snap) * jump, 0, 0);
    leg(p, 0, 0.1 + 0.35 * jump, 0.08, 0.1, 0.2 + 0.9 * jump, 0.4 * jump);
    leg(p, 1, 0.05 + 0.15 * jump, 0.08, 0.1, 0.25 + 1.1 * jump, 0.5 * jump);
    arm(p, 0, 0.5 * jump, 0.25 + 0.8 * jump, 0, 0.9);
    arm(p, 1, 0.5 * jump, 0.25 + 0.8 * jump, 0, 0.9);
    flatFoot(p, 0, 1 - jump); flatFoot(p, 1, 1 - jump);
    p[PY] = groundY(p) + 0.4 * jump;
    p[OPEN] = snap * jump; p[FURROW] = 0.8; p[SQUINT] = 0.5 * snap * jump;
    return p;
  }

  function poseTackle(p, u) {
    p.fill(0);
    const e = smoothstep(0, 0.16, u) * (1 - smoothstep(0.82, 1, u));
    rot(p, "hips", -0.95 * e, 0.1 * e, 0.12 * e);
    rot(p, "spine", 0.45 * e, 0, -0.05 * e); rot(p, "chest", 0.15 * e, 0, 0);
    rot(p, "neck", 0.1 * e, 0, 0); rot(p, "head", 0.35 * e, 0, 0);
    leg(p, 0, lerp(0.05, 0.55, e), 0.05, 0.1, 0.05 + 0.1 * (1 - e), -0.3 * e);
    leg(p, 1, lerp(0.05, -0.25, e), lerp(0.05, 0.4, e), 0.4 * e, 1.9 * e + 0.05, 0.5 * e);
    arm(p, 0, -0.7 * e, 0.3 + 0.35 * e, 0, 0.2);
    arm(p, 1, 0.6 * e, 0.2 + 1.1 * e, 0, 0.45);
    const g = groundY(p);
    p[PY] = lerp(g, -0.66, e);
    p[OPEN] = e; p[FURROW] = e;
    return p;
  }

  function posePoke(p, u) {
    p.fill(0);
    const e = smoothstep(0, 0.2, u) * (1 - smoothstep(0.75, 1, u));
    rot(p, "hips", 0.15 * e, 0.25 * e, 0);
    rot(p, "spine", 0.22 * e, 0, 0); rot(p, "head", 0.35 * e, 0, 0);
    leg(p, 1, 1.0 * e + 0.05, 0.08, 0.3 * e, 0.12, -0.2 * e);
    leg(p, 0, -0.3 * e + 0.05, 0.05, 0.1, 0.55 * e + 0.05);
    arm(p, 0, 0.4 * e, 0.3 + 0.5 * e, 0, 0.4);
    arm(p, 1, -0.3 * e, 0.3 + 0.6 * e, 0, 0.4);
    flatFoot(p, 0);
    p[PY] = groundY(p);
    p[OPEN] = 0.5 * e; p[FURROW] = e;
    return p;
  }

  function poseDive(p, u, d) {
    p.fill(0);
    const cr = smoothstep(0, 0.12, u) * (1 - smoothstep(0.12, 0.28, u)), fly = smoothstep(0.1, 0.4, u), land = smoothstep(0.55, 0.85, u);
    rot(p, "hips", 0.15 * cr, 0.1 * d * fly, -d * (1.45 + 0.1 * land) * fly);
    rot(p, "spine", 0.05, 0, -d * 0.15 * fly); rot(p, "chest", 0, 0, -d * 0.1 * fly);
    rot(p, "head", -0.05, 0, d * 0.25 * fly);
    const ab = 0.3 * cr + (2.75 - 0.35 * land) * fly;
    arm(p, 0, 0.25 * fly + 0.3 * cr, ab, 0, 0.15);
    arm(p, 1, 0.25 * fly + 0.3 * cr, ab, 0, 0.15);
    const lead = d > 0 ? 0 : 1;
    leg(p, lead, 0.35 * cr + 0.1 * fly, 0.12 * fly, 0.1, 0.85 * cr + 0.15 * fly, 0.3 * fly);
    leg(p, 1 - lead, 0.35 * cr + 0.05 * fly, 0.08 * fly, 0.1, 0.85 * cr + 0.55 * fly, 0.3 * fly);
    flatFoot(p, 0, 1 - fly); flatFoot(p, 1, 1 - fly);
    p[PX] = d * (0.55 * fly + 0.22 * land);
    p[PY] = lerp(groundY(p), lerp(-0.2, -0.68, land), fly);
    p[OPEN] = 0.8 * fly; p[FURROW] = 0.8; p[SQUINT] = 0.4 * fly;
    return p;
  }

  const ROBOT = [
    { l: [1.57, 1.45, 0, 1.57], r: [0.1, 0.3, 0, 1.57], hy: 0.4, cy: 0.12 },
    { l: [0.1, 0.3, 0, 1.57], r: [1.57, 1.45, 0, 1.57], hy: -0.4, cy: -0.12 },
    { l: [1.5, 0.12, 0, 0.05], r: [1.5, 0.12, 0, 0.05], hy: 0, cy: 0 },
    { l: [1.57, 1.45, 0, 1.57], r: [1.57, 1.45, 0, 1.57], hy: 0, cy: 0.25 },
  ];
  function poseCelebrate(p, ct, variant) {
    p.fill(0);
    const name = CELEBRATIONS[variant % CELEBRATIONS.length];
    if (name === "kneeSlide") {
      const k = smoothstep(0, 0.45, ct), sh = Math.sin(ct * 14);
      rot(p, "hips", -0.25 * k, 0, 0);
      leg(p, 0, lerp(0.05, -0.25, k), 0.12 * k, 0.1, 1.62 * k, 0.9 * k);
      leg(p, 1, lerp(0.05, -0.25, k), 0.12 * k, 0.1, 1.62 * k, 0.9 * k);
      rot(p, "spine", -0.2 * k); rot(p, "chest", -0.15 * k); rot(p, "neck", -0.1 * k); rot(p, "head", -0.35 * k);
      arm(p, 0, 0.35 * k, 1.9 * k + 0.1, 0, 0.3 + 0.15 * sh * k);
      arm(p, 1, 0.35 * k, 1.9 * k + 0.1, 0, 0.3 - 0.15 * sh * k);
      p[PY] = lerp(groundY(p), -0.445, k);
      p[OPEN] = 1; p[BROW] = 0.5; p[SQUINT] = 0.5;
    } else if (name === "jumpPump") {
      const ph = (ct / 0.8) * TAU, j = Math.max(0, Math.sin(ph)), c = Math.max(0, -Math.sin(ph));
      leg(p, 0, 0.2 + 0.35 * j + 0.2 * c, 0.08, 0.1, 0.2 + 0.7 * j + 0.55 * c, 0.4 * j);
      leg(p, 1, 0.2 + 0.25 * j + 0.2 * c, 0.08, 0.1, 0.2 + 0.9 * j + 0.55 * c, 0.4 * j);
      rot(p, "spine", -0.1 * j + 0.1 * c); rot(p, "head", -0.25);
      arm(p, 1, 2.7 + 0.2 * Math.sin(ph * 2), 0.35, 0, 0.4 + 0.6 * c);
      arm(p, 0, 0.6, 0.12, 0, 1.9);
      flatFoot(p, 0, 1 - j); flatFoot(p, 1, 1 - j);
      p[PY] = groundY(p) + 0.32 * j;
      p[SMILE] = 1; p[OPEN] = 0.3 + 0.5 * j; p[SQUINT] = 0.6;
    } else if (name === "robot") {
      const beat = ct / 0.32, i = Math.floor(beat), f = smoothstep(0, 0.3, beat - i);
      const A = ROBOT[(i + 3) % 4], Bk = ROBOT[i % 4], L = (a, b) => a.map((x, k) => lerp(x, b[k], f));
      const l = L(A.l, Bk.l), r = L(A.r, Bk.r);
      arm(p, 0, l[0], l[1], l[2], l[3]); arm(p, 1, r[0], r[1], r[2], r[3]);
      rot(p, "head", 0, lerp(A.hy, Bk.hy, f), 0); rot(p, "chest", 0, lerp(A.cy, Bk.cy, f), 0);
      const dip = 0.15 + 0.2 * (1 - f);
      leg(p, 0, dip * 0.5, 0.1, 0.1, dip); leg(p, 1, dip * 0.5, 0.1, 0.1, dip);
      flatFoot(p, 0); flatFoot(p, 1);
      p[PY] = groundY(p);
      p[SMILE] = 1; p[SQUINT] = 0.2;
    } else {
      const k = Math.floor(ct / 0.9) % 2, f = smoothstep(0, 0.18, ct % 0.9);
      const dab = (q, s) => {
        q.fill(0);
        const a = s > 0 ? 0 : 1;
        arm(q, a, 1.35, -0.35, 0.2, 1.95);
        arm(q, 1 - a, 0.95, 1.95, 0, 0.02);
        rot(q, "head", 0.45, 0.35 * s, 0.2 * s); rot(q, "spine", 0.1, 0, -0.12 * s);
        leg(q, 0, 0.18, 0.1, 0.1, 0.3); leg(q, 1, 0.18, 0.1, 0.1, 0.3);
        flatFoot(q, 0); flatFoot(q, 1);
        q[PY] = groundY(q);
      };
      dab(tmpA, k ? -1 : 1); dab(tmpB, k ? 1 : -1);
      for (let i = 0; i < NCH; i++) p[i] = ct < 0.9 ? tmpA[i] : lerp(tmpB[i], tmpA[i], f);
      p[SMILE] = 1; p[SQUINT] = 0.7;
    }
    return p;
  }

  function poseStunned(p, t) {
    p.fill(0);
    rot(p, "spine", 0.1 + 0.08 * Math.sin(t * 1.9), 0, 0.14 * Math.sin(t * 2.6));
    rot(p, "chest", 0, 0, 0.06 * Math.sin(t * 2.6 + 0.5));
    rot(p, "head", 0.15, 0.3 * Math.sin(t * 1.7), 0.3 * Math.sin(t * 3.3));
    arm(p, 0, 0.1 * Math.sin(t * 2), 0.3 + 0.12 * Math.sin(t * 3), 0, 0.25);
    arm(p, 1, 0.1 * Math.sin(t * 2 + 1), 0.3 - 0.12 * Math.sin(t * 3), 0, 0.25);
    leg(p, 0, 0.2, 0.08, 0.1, 0.3 + 0.12 * Math.sin(t * 2.6));
    leg(p, 1, 0.2, 0.08, 0.1, 0.3 - 0.12 * Math.sin(t * 2.6));
    flatFoot(p, 0); flatFoot(p, 1);
    p[PY] = groundY(p);
    p[OPEN] = 0.5; p[BROW] = 0.8; p[SQUINT] = 0.2;
    return p;
  }

  // ── Gestes techniques de l'Arène (durées internes, actionT non piloté) ──
  // Roulette marseillaise : tour complet du corps (bassin), bras écartés, semelle qui traîne le ballon
  function poseRoulette(p, u) {
    p.fill(0);
    const e = ease(clamp(u / 0.9, 0, 1)), k = smoothstep(0, 0.12, u) * (1 - smoothstep(0.86, 1, u));
    let yaw = TAU * e;
    if (yaw > Math.PI) yaw -= TAU;
    rot(p, "hips", 0.12 * k, yaw, 0);
    rot(p, "spine", 0.14 * k, -0.15 * k * Math.sin(TAU * e), 0); rot(p, "chest", 0.05 * k, 0, 0);
    rot(p, "head", 0.3 * k, 0.25 * k * Math.sin(TAU * e), 0);
    arm(p, 0, 0.3 * k, 0.2 + 1.05 * k, 0, 0.35 + 0.2 * k); arm(p, 1, 0.3 * k, 0.2 + 1.05 * k, 0, 0.35 + 0.2 * k);
    leg(p, 0, 0.22 * k + 0.02, 0.08, 0.1, 0.5 * k + 0.05, 0);
    leg(p, 1, 0.35 * k + 0.02, 0.28 * k + 0.05, 0.25 * k, 0.3 * k + 0.05, -0.35 * k);
    flatFoot(p, 0);
    p[PY] = groundY(p) + 0.025 * Math.sin(Math.PI * e) * k;
    p[FURROW] = 0.5 * k;
    return p;
  }
  // Feinte de corps : épaule et bassin plongent d'un côté puis reviennent
  function poseFeint(p, u, s) {
    p.fill(0);
    const e = Math.sin(Math.PI * smoothstep(0, 0.9, u)), out = s > 0 ? 0 : 1;
    rot(p, "hips", 0.1, -0.22 * s * e, -0.16 * s * e);
    rot(p, "spine", 0.14, 0, -0.24 * s * e); rot(p, "chest", 0.05, 0.22 * s * e, -0.16 * s * e);
    rot(p, "head", 0.15, 0.18 * s * e, 0.22 * s * e);
    leg(p, out, 0.25, 0.08 + 0.38 * e, 0.2, 0.12 + 0.55 * e);
    leg(p, 1 - out, 0.2, 0.06, 0.1, 0.35 + 0.2 * e);
    arm(p, out, 0.2, 0.3 + 0.75 * e, 0, 0.5); arm(p, 1 - out, 0.35, 0.2 + 0.2 * e, 0, 0.7);
    flatFoot(p, 0); flatFoot(p, 1);
    p[PY] = groundY(p);
    p[FURROW] = 0.6;
    return p;
  }
  // Passement de jambe : une jambe décrit un cercle au-dessus du ballon (intérieur -> extérieur)
  function poseStepover(p, u, s) {
    p.fill(0);
    const k = smoothstep(0, 0.15, u) * (1 - smoothstep(0.85, 1, u)), a = TAU * smoothstep(0.05, 0.9, u), lg = s > 0 ? 1 : 0;
    rot(p, "hips", 0.1, 0.18 * s * Math.sin(a) * k, 0.1 * s * Math.sin(a / 2) * k);
    rot(p, "spine", 0.14 * k, -0.1 * s * Math.sin(a) * k, -0.12 * s * Math.sin(a / 2) * k); rot(p, "head", 0.32 * k, 0, 0);
    leg(p, lg, 0.55 * Math.sin(a / 2) * k + 0.05, 0.06 + 0.5 * Math.sin(a - 0.7) * k, 0.3 * k, 0.1 + 0.95 * Math.sin(a / 2) * k, 0.25 * k);
    leg(p, 1 - lg, 0.18 + 0.12 * k, 0.08, 0.1, 0.1 + 0.4 * k);
    arm(p, 0, 0.2, 0.3 + 0.55 * k, 0, 0.5); arm(p, 1, 0.2, 0.3 + 0.55 * k, 0, 0.5);
    flatFoot(p, 1 - lg);
    p[PY] = groundY(p);
    p[FURROW] = 0.5 * k;
    return p;
  }
  // Petit pont : pointe du pied courte et sèche entre les jambes de l'adversaire
  function poseNutmeg(p, u) {
    p.fill(0);
    const back = smoothstep(0, 0.3, u), strike = smoothstep(0.3, 0.5, u), keep = 1 - smoothstep(0.6, 1, u);
    rot(p, "hips", 0.1, -0.08 * strike * keep, 0);
    rot(p, "spine", 0.2 * keep + 0.04, 0, 0); rot(p, "head", 0.38 * keep, 0, 0);
    leg(p, 0, 0.25 * keep + 0.03, 0.08, 0.1, 0.42 * keep + 0.06);
    leg(p, 1, lerp(-0.4 * back, 0.7, strike) * keep, 0.05, -0.1, lerp(0.95 * back, 0.1, strike) * keep + 0.06, 0.55 * strike * keep);
    arm(p, 0, 0.3 * keep, 0.3 + 0.45 * keep, 0, 0.5); arm(p, 1, -0.3 * strike * keep, 0.3, 0, 0.5);
    flatFoot(p, 0);
    p[PY] = groundY(p);
    p[OPEN] = 0.3 * strike * keep; p[FURROW] = 0.6 * keep;
    return p;
  }
  // Appui sur le mur : pied posé haut sur le côté, genou levé, corps penché à l'opposé, petit saut
  function poseWallkick(p, u, s) {
    p.fill(0);
    const plant = smoothstep(0, 0.3, u), push = smoothstep(0.3, 0.55, u), land = smoothstep(0.72, 1, u), w = plant * (1 - land);
    const air = Math.sin(Math.PI * smoothstep(0.3, 0.95, u)), lg = s > 0 ? 0 : 1;
    rot(p, "hips", 0.1 * w, 0.2 * s * w, 0.2 * s * w);
    rot(p, "spine", 0.1 * w, 0, 0.26 * s * w); rot(p, "chest", 0, 0, 0.12 * s * w); rot(p, "head", 0.1, 0, -0.3 * s * w);
    leg(p, lg, 0.55 * w + 0.3 * push * w, 0.05 + 0.85 * w * (1 - 0.4 * push), 0.2 * w, 0.08 + 1.3 * w * (1 - 0.65 * push), 0.2 * w);
    leg(p, 1 - lg, 0.15 + 0.3 * air, 0.1, 0.1, 0.25 + 0.7 * air, 0.3 * air);
    arm(p, lg, 0.5 * w, 0.4 + 0.5 * w, 0, 0.6); arm(p, 1 - lg, 0.4 * w, 0.4 + 0.9 * w, 0, 0.4);
    flatFoot(p, 1 - lg, 1 - air);
    p[PX] = -s * 0.05 * push * (1 - land);
    p[PY] = groundY(p) + 0.16 * air;
    p[OPEN] = 0.4 * push * (1 - land); p[FURROW] = 0.7 * w;
    return p;
  }
  // Crochet : appui sec d'un pied sur le côté puis poussée latérale
  function poseCut(p, u, s) {
    p.fill(0);
    const plant = smoothstep(0, 0.3, u), push = smoothstep(0.3, 0.65, u), k = plant * (1 - smoothstep(0.65, 1, u)), lg = s > 0 ? 1 : 0;
    rot(p, "hips", 0.2 * k, 0.35 * s * k, 0.12 * s * k);
    rot(p, "spine", 0.24 * k, 0.12 * s * k, -0.22 * s * k); rot(p, "head", 0.12 * k, 0.25 * s * k, 0.15 * s * k);
    leg(p, lg, 0.3 * k, 0.06 + 0.55 * k * (1 - 0.4 * push), 0.2 * k, 0.08 + 0.7 * k * (1 - 0.6 * push));
    leg(p, 1 - lg, 0.45 * k, 0.1, 0.1, 0.1 + 0.85 * k, 0.2 * push);
    arm(p, lg, 0.2, 0.3 + 0.65 * k, 0, 0.6); arm(p, 1 - lg, 0.5 * k, 0.2, 0, 0.9);
    flatFoot(p, lg);
    p[PX] = s * 0.06 * push * k;
    p[PY] = groundY(p);
    p[FURROW] = 0.8 * k;
    return p;
  }
  // Pressing (boucle) : centre de gravité bas, de biais, bras écartés, petits pas rapides
  function posePress(p, t) {
    p.fill(0);
    const sh = Math.sin(t * 9);
    rot(p, "hips", 0.22, 0.45, 0);
    rot(p, "spine", 0.18, -0.2, 0); rot(p, "chest", 0.05, -0.15, 0);
    rot(p, "neck", -0.08, 0, 0); rot(p, "head", -0.14, -0.1, 0);
    leg(p, 0, 0.5 + 0.1 * Math.max(0, sh), 0.24, 0.25, 0.9 + 0.3 * Math.max(0, sh));
    leg(p, 1, 0.42 + 0.1 * Math.max(0, -sh), 0.24, 0.2, 0.8 + 0.3 * Math.max(0, -sh));
    arm(p, 0, 0.35, 0.55, 0, 0.9); arm(p, 1, 0.35, 0.55, 0, 0.9);
    flatFoot(p, 0); flatFoot(p, 1);
    p[PY] = groundY(p) + 0.008 * Math.abs(Math.cos(t * 9));
    p[FURROW] = 0.7;
    return p;
  }

  // ── Mise à jour ──
  const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
  function stateOf(action) {
    if (action === "run" || action === "sprint" || action === "idle" || action === "keeperReady" || !action) return "loco";
    if (action === "celebrate" || action === "stunned" || action === "charge" || action === "press" || ONE_SHOT.has(action)) return action;
    return "loco";
  }
  function fadeFor(prev, next) {
    if (next === "kick" && prev === "charge") return 0.05;
    if (next === "dive" || next === "tackle" || next === "roulette" || next === "cut" || next === "nutmeg") return 0.08;
    if (prev === "roulette" || prev === "wallkick") return 0.14;
    if (prev === "dive" || prev === "tackle" || (prev === "celebrate" && CELEBRATIONS[st.variant] === "kneeSlide")) return 0.35;
    if (next === "celebrate") return 0.2;
    return 0.15;
  }

  function update({ speed = 0, action = "idle", actionT = 0, diveDir = 1, variant } = {}, dt = 1 / 60) {
    dt = clamp(dt || 0, 0, 0.1);
    st.clock += dt;
    const t = st.clock, sid = stateOf(action), aT = clamp(+actionT || 0, 0, 1);
    // changement d'état (ou relance d'un geste)
    const restart = ONE_SHOT.has(sid) && sid === st.sid && st.act.ext && aT < st.act.lastT - 0.3;
    if (sid !== st.sid || restart || st.first) {
      if (!st.first) from.set(base); // pose avant couches additives (regard)
      const prev = st.sid;
      st.sid = sid; st.t = 0; st.fade = st.first ? 1 : 0; st.fadeDur = fadeFor(prev, sid);
      st.act = { t0: aT, ext: false, lastT: aT, u: 0 };
      if (sid === "celebrate") st.variant = Number.isInteger(variant) ? Math.abs(variant) % CELEBRATIONS.length : (st.celebN++ + Math.floor(Math.random() * 3)) % CELEBRATIONS.length;
      if (sid === "dive") st.diveDir = diveDir >= 0 ? 1 : -1;
      if (SIDED.has(sid)) st.side = diveDir >= 0 ? 1 : -1;
    }
    st.t += dt;
    if (Math.abs(aT - st.act.lastT) > 1e-4) st.act.ext = true;
    st.act.lastT = aT;
    const u = ONE_SHOT.has(sid) ? (st.act.ext ? aT : clamp(st.t / DUR[sid], 0, 1)) : aT;

    // locomotion : phase calée sur la distance parcourue (foulée ~1,9 m à 7 m/s)
    const v = clamp(speed || 0, 0, 12);
    st.speed = v;
    st.sprintW += ((action === "sprint" ? 1 : 0) - st.sprintW) * (1 - Math.exp(-dt * 6));
    const wantKeeper = (st.keeper && v < 1.2) || action === "keeperReady" ? 1 : 0;
    st.keeperW += (wantKeeper - st.keeperW) * (1 - Math.exp(-dt * 5));
    const stride = 0.5 + 0.2 * v, cadence = Math.min(3.9, v / stride);
    st.phase = (st.phase + dt * cadence * Math.PI) % TAU;

    switch (sid) {
      case "loco": {
        const mv = smoothstep(0.15, 1.1, v);
        poseIdle(tmpA, t, st.keeperW);
        if (mv > 0) {
          poseMove(tmpB, Math.max(v, 0.6), st.sprintW, st.phase);
          for (let i = 0; i < NCH; i++) live[i] = lerp(tmpA[i], tmpB[i], mv);
        } else live.set(tmpA);
        if (st.sprintW > 0.3) { live[FURROW] = 0.5 * st.sprintW; live[OPEN] = 0.3 * st.sprintW; }
        break;
      }
      case "charge": poseCharge(live, aT); break;
      case "kick": poseKick(live, u); break;
      case "pass": posePass(live, u); break;
      case "header": poseHeader(live, u); break;
      case "tackle": poseTackle(live, u); break;
      case "poke": posePoke(live, u); break;
      case "dive": poseDive(live, u, st.diveDir); break;
      case "celebrate": poseCelebrate(live, st.t, st.variant); break;
      case "stunned": poseStunned(live, t); break;
      case "roulette": poseRoulette(live, u); break;
      case "feint": poseFeint(live, u, st.side); break;
      case "stepover": poseStepover(live, u, st.side); break;
      case "nutmeg": poseNutmeg(live, u); break;
      case "wallpass": posePass(live, u, 1); break;
      case "wallkick": poseWallkick(live, u, st.side); break;
      case "cut": poseCut(live, u, st.side); break;
      case "press": {
        // pressing : garde basse de biais, piétinement ; se fond dans la course quand on accélère
        const run = smoothstep(2.5, 5.5, v);
        posePress(tmpA, t);
        if (run > 0) { poseMove(tmpB, Math.max(v, 0.6), st.sprintW, st.phase); for (let i = 0; i < NCH; i++) live[i] = lerp(tmpA[i], tmpB[i], run); }
        else live.set(tmpA);
        break;
      }
    }
    live[LOOKW] = LOOK[sid] ?? 1;

    // fondu enchaîné
    st.fade = Math.min(1, st.fade + dt / st.fadeDur);
    const w = ease(st.fade);
    for (let i = 0; i < NCH; i++) out[i] = w >= 1 ? live[i] : lerp(from[i], live[i], w);
    base.set(out);
    st.first = false;

    motion(dt);
    lookAt(dt, t);
    face(dt, t);
    secondary(dt, t);
    apply();
  }

  // Vitesse / accélération de la racine (repère local) pour les ressorts
  function motion(dt) {
    if (!root || dt <= 0) return;
    const p = root.position;
    if (!st.prevPos) { st.prevPos = p.clone(); st.prevYaw = root.rotation.y; }
    _v.subVectors(p, st.prevPos).divideScalar(dt);
    if (_v.lengthSq() > 400) _v.set(0, 0, 0); // téléportation
    st.prevPos.copy(p);
    const yaw = root.rotation.y;
    let dy = yaw - st.prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    st.prevYaw = yaw;
    st.yawRate += (clamp(dy / dt, -8, 8) - st.yawRate) * (1 - Math.exp(-dt * 8));
    const c = Math.cos(-yaw), s = Math.sin(-yaw);
    const lx = _v.x * c + _v.z * s, lz = -_v.x * s + _v.z * c;
    st.vel.x += (lx - st.vel.x) * (1 - Math.exp(-dt * 10));
    st.vel.z += (lz - st.vel.z) * (1 - Math.exp(-dt * 10));
    let vF = st.vel.z;
    if (Math.abs(vF) < 0.2 && st.sid === "loco") vF = st.speed; // aperçu immobile : vitesse annoncée
    st.accF += (clamp((vF - st.prevVF) / dt, -40, 40) - st.accF) * (1 - Math.exp(-dt * 12));
    st.prevVF = vF; st.vF = vF;
    const vy = (out[PY] - st.prevPY) / dt;
    st.aY += (clamp((vy - st.vY) / dt, -60, 60) - st.aY) * (1 - Math.exp(-dt * 15));
    st.vY = vy; st.prevPY = out[PY];
  }

  // Regard : tête / cou / buste vers la cible (monde), sinon coups d'œil au repos
  function lookAt(dt, t) {
    const L = st.look, w = out[LOOKW];
    let yaw = 0, pitch = 0, has = false;
    if (st.target && root) {
      root.updateWorldMatrix(true, false);
      _m.copy(root.matrixWorld).invert();
      _v.copy(st.target).applyMatrix4(_m);
      _v.y -= height * 0.9;
      const hz = Math.hypot(_v.x, _v.z);
      if (hz > 0.05) {
        yaw = Math.atan2(_v.x, _v.z); pitch = Math.atan2(-_v.y, hz);
        if (Math.abs(yaw) > 2.3) yaw = Math.sign(yaw) * 1.2 * (1 - smoothstep(2.3, 2.9, Math.abs(yaw)));
        has = true;
      }
    }
    if (!has) {
      L.timer -= dt;
      if (L.timer <= 0) {
        const idle = st.sid === "loco" && st.speed < 0.5;
        L.tYaw = idle && Math.random() < 0.65 ? (Math.random() - 0.5) * 1.3 : 0;
        L.tPitch = idle ? (Math.random() - 0.4) * 0.3 : 0;
        L.timer = 1.4 + Math.random() * 2.6;
      }
      yaw = L.tYaw; pitch = L.tPitch;
    }
    yaw = clamp(yaw, -1.25, 1.25); pitch = clamp(pitch, -0.5, 0.6);
    const k = 1 - Math.exp(-dt * 7);
    L.yaw += (yaw - L.yaw) * k; L.pitch += (pitch - L.pitch) * k;
    out[R.neck + 1] += L.yaw * 0.35 * w; out[R.head + 1] += L.yaw * 0.45 * w; out[R.chest + 1] += L.yaw * 0.12 * w;
    out[R.neck] += L.pitch * 0.3 * w; out[R.head] += L.pitch * 0.5 * w;
    // yeux : reste du regard + saccades
    L.saccT -= dt;
    if (L.saccT <= 0) { L.sacc = (Math.random() - 0.5) * 0.25; L.saccT = 0.6 + Math.random() * 1.8; }
    let py = clamp(L.yaw * (1 - 0.8 * w) + L.yaw * 0.25 + L.sacc * 0.5, -0.32, 0.32), px = clamp(L.pitch * 0.35, -0.2, 0.25);
    if (st.sid === "stunned") { py = 0.3 * Math.cos(t * 9); px = 0.25 * Math.sin(t * 9); }
    L.py += (py - L.py) * (1 - Math.exp(-dt * 25)); L.px += (px - L.px) * (1 - Math.exp(-dt * 25));
  }

  // Clignements + expression (bouches, sourcils, paupières)
  function face(dt, t) {
    const b = st.blink;
    b.next -= dt;
    if (b.next <= 0 && b.t < 0) { b.t = 0; b.next = 2 + Math.random() * 3.5; if (Math.random() < 0.15) b.next = 0.25; }
    let blink = 1;
    if (b.t >= 0) { b.t += dt; blink = 1 - Math.sin(Math.PI * clamp(b.t / 0.15, 0, 1)); if (b.t > 0.15) b.t = -1; }
    st.eyeY = Math.max(0.06, (1 - 0.45 * out[SQUINT]) * blink);
  }

  // Ressort amorti 2 axes (sous-pas pour la stabilité)
  function spring(s, tx, tz, k, c, dt, lim) {
    const n = 2, h = dt / n;
    for (let i = 0; i < n; i++) {
      s.vx += (k * (tx - s.x) - c * s.vx) * h; s.x += s.vx * h;
      s.vz += (k * (tz - s.z) - c * s.vz) * h; s.z += s.vz * h;
    }
    if (s.x < lim[0]) { s.x = lim[0]; s.vx *= -0.2; } else if (s.x > lim[1]) { s.x = lim[1]; s.vx *= -0.2; }
    if (s.z < lim[2]) { s.z = lim[2]; s.vz *= -0.2; } else if (s.z > lim[3]) { s.z = lim[3]; s.vz *= -0.2; }
  }
  function secondary(dt, t) {
    if (dt <= 0) return;
    // rotation rapide du bassin (roulette) : fait aussi réagir cheveux et cape
    let hy = out[R.hips + 1] - (st.prevHipYaw ?? out[R.hips + 1]); hy = Math.atan2(Math.sin(hy), Math.cos(hy));
    st.prevHipYaw = out[R.hips + 1];
    st.hipRate = (st.hipRate || 0) + (clamp(hy / dt, -16, 16) - (st.hipRate || 0)) * (1 - Math.exp(-dt * 10));
    const vF = clamp(st.vF || 0, -3, 12), vX = clamp(st.vel.x, -8, 8), aF = st.accF, om = clamp(st.yawRate + st.hipRate, -12, 12);
    const hp = out[R.hips] + out[R.spine] + out[R.chest] + out[R.neck] + out[R.head];
    const hr = out[R.hips + 2] + out[R.spine + 2] + out[R.chest + 2] + out[R.neck + 2] + out[R.head + 2];
    const cp = out[R.hips] + out[R.spine] + out[R.chest], cr = out[R.hips + 2] + out[R.spine + 2] + out[R.chest + 2];
    const run = smoothstep(1.5, 6, vF), flut = Math.sin(t * 11) * 0.5 + Math.sin(t * 17.3) * 0.5;
    const S = springs;
    S.hairBack.vx += aF * 0.25 * dt;
    S.hairBack.vx -= st.aY * 0.02 * dt;
    spring(S.hairBack, -hp * 0.9 + 0.05 * vF + 0.04 * run * flut, -hr * 0.9 - 0.04 * vX + om * 0.03 * vF, 70, 9, dt, [-0.45, 1.3, -1.0, 1.0]);
    spring(S.hairTail, (-hp * 0.9 + 0.05 * vF - S.hairBack.x) * 0.5 + 0.03 * vF, (-hr * 0.9 - S.hairBack.z) * 0.5, 45, 6, dt, [-0.6, 1.0, -0.8, 0.8]);
    S.capeA.vx += aF * 0.2 * dt;
    spring(S.capeA, -cp * 0.95 + 0.12 + 0.12 * vF + 0.05 * run * flut, -cr * 0.9 - 0.05 * vX + om * 0.04 * vF, 32, 6, dt, [0.02, 1.45, -1.2, 1.2]);
    spring(S.capeB, 0.04 * vF + 0.12 * run * Math.sin(t * 9 + 1.2) + (-cp * 0.95 + 0.12 + 0.12 * vF - S.capeA.x) * 0.6, (-cr * 0.9 - S.capeA.z) * 0.5, 26, 5, dt, [-0.3, 0.9, -0.6, 0.6]);
    spring(S.coatBack, -out[R.hips] * 0.85 + 0.075 * vF + 0.05 * run * Math.sin(st.phase * 2), -out[R.hips + 2] * 0.8 - 0.03 * vX, 45, 7, dt, [-0.05, 1.1, -0.5, 0.5]);
    spring(S.scarf, Math.min(0.03, -cp * 0.95 - 0.03 * vF), -cr * 0.9 - 0.05 * vX, 50, 7, dt, [-1.3, 0.05, -0.8, 0.8]);
    S.hatTip.vx -= st.aY * 0.03 * dt;
    spring(S.hatTip, -hp * 0.3 + 0.025 * vF, -hr * 0.3 - 0.02 * vX, 110, 7, dt, [-0.7, 0.7, -0.7, 0.7]);
  }

  // Application aux os
  function apply() {
    for (let i = 0; i < BODY.length; i++) {
      const bone = bones[B[BODY[i]]];
      bone.rotation.set(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
    }
    const hips = bones[B.hips], r0 = rest[B.hips];
    hips.position.set(r0.x + out[PX], r0.y + out[PY], r0.z + out[PZ]);
    // visage
    const ey = st.eyeY ?? 1;
    bones[B.eyeL].scale.set(1, ey, 1); bones[B.eyeR].scale.set(1, ey, 1);
    const L = st.look;
    bones[B.pupilL].rotation.set(L.px, L.py, 0); bones[B.pupilR].rotation.set(L.px, L.py, 0);
    const bu = out[BROW], fu = out[FURROW];
    for (const [n, s] of [["browL", 1], ["browR", -1]]) {
      const b = bones[B[n]], r = rest[B[n]];
      b.position.set(r.x, r.y + 0.009 * bu - 0.004 * fu, r.z);
      b.rotation.set(0, 0, s * (0.32 * fu - 0.12 * bu));
    }
    const sm = out[SMILE], op = out[OPEN], tiny = 1e-4;
    const showO = op >= 0.45, showS = !showO && sm >= 0.5;
    bones[B.mouthN].scale.setScalar(showO || showS ? tiny : 1);
    bones[B.mouthS].scale.setScalar(showS ? 1 : tiny);
    const o = clamp((op - 0.45) / 0.55, 0, 1);
    bones[B.mouthO].scale.set(showO ? 0.85 + 0.2 * o : tiny, showO ? 0.7 + 0.5 * o : tiny, showO ? 1 : tiny);
    // secondaires
    const S = springs;
    bones[B.hairBack].rotation.set(S.hairBack.x, 0, S.hairBack.z);
    bones[B.hairTail].rotation.set(S.hairTail.x, 0, S.hairTail.z);
    bones[B.capeA].rotation.set(S.capeA.x, 0, S.capeA.z);
    bones[B.capeB].rotation.set(S.capeB.x, 0, S.capeB.z);
    bones[B.coatBack].rotation.set(S.coatBack.x, 0, S.coatBack.z);
    bones[B.scarf].rotation.set(S.scarf.x, 0, S.scarf.z);
    bones[B.hatTip].rotation.set(S.hatTip.x, 0, S.hatTip.z);
  }

  return {
    update,
    setKeeper(v) { st.keeper = !!v; },
    setTarget(v) { st.target = v ? (st.target || new THREE.Vector3()).copy(v) : null; },
    get state() { return st.sid; },
    get variant() { return st.variant; },
    pose: out,
  };
}
