// Avatar procédural stylisé d'un joueur-scientifique (low-poly, animé).
// Conventions : pieds à y=0, regarde vers +Z local, gauche du joueur = +X local.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  NEON, normQuality, rng, hashStr, makeCanvas, canvasTexture, cached, markShared,
  glowTexture, shadowTexture, ringTexture, beamTexture, luminance, clamp, smooth, lerp, disposeTree,
} from "./util.js";

const H0 = 1.8;          // taille de référence du modèle
const HIP = 0.93;        // hauteur des hanches (référence)
const R = 0.14;          // rayon de la tête
const THIGH = 0.44, SHIN = 0.42, FOOT = 0.07;
const SKIN_A = new THREE.Color("#f6cba6"), SKIN_B = new THREE.Color("#5a3a24");
const KEEPER_JERSEY = "#F4C20D", KEEPER_SLEEVE = "#15151c", GLOVE = "#D8FF3A";
const FONT = `"Segoe UI", "Helvetica Neue", Arial, sans-serif`;

// ───────────────────────── Géométries partagées ─────────────────────────

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
function bar(a, b, t) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  const g = new THREE.CylinderGeometry(t, t, len, 6);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  _m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), _q, _one);
  return g.applyMatrix4(_m);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sphere = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
// Calotte de cheveux (inclinée vers l'arrière)
const cap = (r, theta, tilt, sz = 1) =>
  new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, theta).scale(1, 1, sz).rotateX(tilt);
// Oriente une géométrie (axe +Y) selon une direction et la place à une position
function orient(g, dir, pos) {
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  _m.compose(pos, _q, _one);
  return g.applyMatrix4(_m);
}
const onHead = (theta, phi, rr = R) =>
  V(rr * Math.sin(theta) * Math.sin(phi), rr * Math.cos(theta), rr * Math.sin(theta) * Math.cos(phi));

let GEO = null;
function geos() {
  if (GEO) return GEO;
  const g = {
    thigh: new THREE.CylinderGeometry(0.082, 0.064, THIGH, 10).translate(0, -THIGH / 2, 0),
    shortsLeg: new THREE.CylinderGeometry(0.094, 0.088, 0.2, 10).translate(0, -0.08, 0),
    shin: new THREE.CylinderGeometry(0.067, 0.048, SHIN, 10).translate(0, -SHIN / 2, 0),
    sockRing: new THREE.CylinderGeometry(0.07, 0.07, 0.035, 10).translate(0, -0.05, 0),
    boot: new THREE.BoxGeometry(0.1, 0.075, 0.25).translate(0, -0.035, 0.05),
    sole: new THREE.BoxGeometry(0.106, 0.018, 0.256).translate(0, -0.075, 0.05),
    pelvis: new THREE.CylinderGeometry(0.17, 0.18, 0.22, 14).scale(1, 1, 0.78).translate(0, -0.03, 0),
    torso: new THREE.CylinderGeometry(0.2, 0.16, 0.5, 16).scale(1, 1, 0.72).translate(0, 0.28, 0),
    stripes: mergeGeometries([
      new THREE.BoxGeometry(0.02, 0.44, 0.06).rotateZ(-0.08).translate(0.183, 0.28, 0),
      new THREE.BoxGeometry(0.02, 0.44, 0.06).rotateZ(0.08).translate(-0.183, 0.28, 0),
    ]),
    collar: new THREE.TorusGeometry(0.075, 0.02, 6, 16).rotateX(Math.PI / 2).scale(1, 1, 0.85).translate(0, 0.535, 0),
    emblem: new THREE.CircleGeometry(0.038, 16).translate(0.085, 0.4, 0.128),
    neck: new THREE.CylinderGeometry(0.055, 0.062, 0.12, 8).translate(0, 0.59, 0),
    shoulder: sphere(0.08),
    sleeve: new THREE.CylinderGeometry(0.074, 0.068, 0.17, 10).translate(0, -0.07, 0),
    cuff: new THREE.CylinderGeometry(0.07, 0.07, 0.025, 10).translate(0, -0.155, 0),
    upperArm: new THREE.CylinderGeometry(0.057, 0.05, 0.28, 8).translate(0, -0.15, 0),
    forearm: new THREE.CylinderGeometry(0.05, 0.042, 0.26, 8).translate(0, -0.13, 0),
    hand: sphere(0.05).scale(0.9, 1.1, 0.8).translate(0, -0.28, 0),
    glove: sphere(0.068).scale(0.85, 1.15, 0.72).translate(0, -0.29, 0),
    head: mergeGeometries([
      new THREE.SphereGeometry(R, 20, 14),
      sphere(0.024).scale(0.9, 1, 1.15).translate(0, -0.018, 0.14),       // nez
      sphere(0.036).scale(0.45, 1, 0.75).translate(0.138, 0, 0),          // oreilles
      sphere(0.036).scale(0.45, 1, 0.75).translate(-0.138, 0, 0),
    ]),
    eyes: mergeGeometries([sphere(0.031).translate(0.05, 0.02, 0.118), sphere(0.031).translate(-0.05, 0.02, 0.118)]),
    pupils: mergeGeometries([sphere(0.016, 8, 6).translate(0.051, 0.02, 0.143), sphere(0.016, 8, 6).translate(-0.051, 0.02, 0.143)]),
    mouth: new THREE.TorusGeometry(0.03, 0.0075, 4, 12, Math.PI).rotateZ(Math.PI).rotateX(-0.25).translate(0, -0.052, 0.128),
    brows: mergeGeometries([
      new THREE.BoxGeometry(0.052, 0.013, 0.014).rotateZ(-0.12).translate(0.05, 0.066, 0.122),
      new THREE.BoxGeometry(0.052, 0.013, 0.014).rotateZ(0.12).translate(-0.05, 0.066, 0.122),
    ]),
    beard: mergeGeometries([
      new THREE.SphereGeometry(R * 1.05, 16, 8, -0.06 * Math.PI, 1.12 * Math.PI, 0.56 * Math.PI, 0.38 * Math.PI),
      new THREE.BoxGeometry(0.08, 0.02, 0.024).translate(0, -0.047, 0.134),
    ]),
    glassesFrame: mergeGeometries([
      new THREE.TorusGeometry(0.037, 0.0075, 6, 18).translate(0.052, 0.02, 0.165),
      new THREE.TorusGeometry(0.037, 0.0075, 6, 18).translate(-0.052, 0.02, 0.165),
      new THREE.BoxGeometry(0.03, 0.009, 0.009).translate(0, 0.026, 0.166),
      new THREE.BoxGeometry(0.009, 0.009, 0.16).translate(0.137, 0.025, 0.085),
      new THREE.BoxGeometry(0.009, 0.009, 0.16).translate(-0.137, 0.025, 0.085),
    ]),
    lenses: mergeGeometries([
      new THREE.CircleGeometry(0.034, 16).translate(0.052, 0.02, 0.164),
      new THREE.CircleGeometry(0.034, 16).translate(-0.052, 0.02, 0.164),
    ]),
    decal: new THREE.PlaneGeometry(0.27, 0.3),
    flat: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    beam: new THREE.CylinderGeometry(0.62, 0.5, 2.5, 20, 1, true).translate(0, 1.25, 0),
    star: new THREE.OctahedronGeometry(0.065),
    chevron: new THREE.ConeGeometry(0.1, 0.18, 4).rotateX(Math.PI),
    hair: {},
    acc: {},
  };
  for (const k of Object.keys(g)) if (g[k] && g[k].isBufferGeometry) markShared(g[k]);
  GEO = g;
  return g;
}

// Géométrie de coiffure par style (cache)
function hairGeo(style) {
  const G = geos();
  if (style in G.hair) return G.hair[style];
  const r = rng(hashStr(style));
  const parts = [];
  const around = (n, t0, t1, fn) => {
    for (let i = 0; i < n; i++) {
      const th = t0 + r() * (t1 - t0), ph = r() * Math.PI * 2;
      // pas de mèches sur le visage
      if (Math.cos(ph) > 0.55 && th > 0.32 * Math.PI) continue;
      fn(th, ph);
    }
  };
  switch (style) {
    case "bald": {
      parts.push(new THREE.TorusGeometry(R * 0.985, 0.028, 6, 20, 1.2 * Math.PI).rotateZ(-0.1 * Math.PI).rotateX(-Math.PI / 2).translate(0, 0.012, 0));
      break;
    }
    case "buzz": case "cap":
      parts.push(cap(R * 1.025, 0.53 * Math.PI, -0.3)); break;
    case "grey":
      parts.push(cap(R * 1.05, 0.5 * Math.PI, -0.6));
      parts.push(sphere(0.05).scale(0.6, 1, 1.2).translate(0.125, 0.02, -0.03), sphere(0.05).scale(0.6, 1, 1.2).translate(-0.125, 0.02, -0.03));
      break;
    case "side":
      parts.push(cap(R * 1.07, 0.55 * Math.PI, -0.32));
      parts.push(new THREE.BoxGeometry(0.2, 0.05, 0.09).rotateZ(0.3).rotateX(0.2).translate(0.03, 0.11, 0.075));
      break;
    case "slick":
      parts.push(cap(R * 1.065, 0.55 * Math.PI, -0.3, 1.14));
      break;
    case "spiky": {
      parts.push(cap(R * 1.04, 0.52 * Math.PI, -0.3));
      around(16, 0.05 * Math.PI, 0.42 * Math.PI, (th, ph) => {
        const d = onHead(th, ph, 1);
        parts.push(orient(new THREE.ConeGeometry(0.036, 0.13, 5).translate(0, 0.05, 0), d, d.clone().multiplyScalar(R * 0.98)));
      });
      break;
    }
    case "messy": {
      parts.push(cap(R * 1.07, 0.56 * Math.PI, -0.25));
      around(16, 0.05 * Math.PI, 0.5 * Math.PI, (th, ph) => {
        const d = onHead(th, ph, 1);
        const b = new THREE.BoxGeometry(0.07, 0.03, 0.1).rotateY(r() * 3).rotateX(r() - 0.5);
        parts.push(orient(b, d, d.clone().multiplyScalar(R * 1.08)));
      });
      break;
    }
    case "curly": {
      parts.push(cap(R * 1.03, 0.52 * Math.PI, -0.3));
      around(38, 0, 0.55 * Math.PI, (th, ph) => {
        const d = onHead(th, ph, 1);
        parts.push(sphere(0.042 + r() * 0.012, 6, 5).translate(d.x * R * 1.08, d.y * R * 1.08, d.z * R * 1.08));
      });
      break;
    }
    case "long":
      parts.push(cap(R * 1.07, 0.56 * Math.PI, -0.3));
      parts.push(new THREE.CylinderGeometry(R * 1.08, R * 1.2, 0.3, 16, 1, true, Math.PI / 2 + 0.25, Math.PI - 0.5).translate(0, -0.11, -0.005));
      break;
    case "fade":
      parts.push(cap(R * 1.02, 0.55 * Math.PI, -0.3));
      parts.push(cap(R * 1.1, 0.3 * Math.PI, -0.12).translate(0, 0.014, 0));
      break;
    case "mohawk":
      for (let i = 0; i < 8; i++) {
        const t = 0.32 * Math.PI - (i / 7) * 0.85 * Math.PI;
        const d = V(0, Math.cos(t), Math.sin(t));
        const h = 0.16 - Math.abs(i - 3) * 0.012;
        parts.push(orient(new THREE.ConeGeometry(0.04, h, 4).scale(0.35, 1, 1).translate(0, h / 2 - 0.01, 0), d, d.clone().multiplyScalar(R * 0.96)));
      }
      break;
    case "short":
    default:
      parts.push(cap(R * 1.07, 0.56 * Math.PI, -0.35));
  }
  const geo = markShared(mergeGeometries(parts.map(p => (p.index ? p.toNonIndexed() : p))));
  G.hair[style] = geo;
  return geo;
}

// Géométries d'accessoires : { dark?, glow?, white?, metal?, cloth? } par repère (head|body|armU|armL)
function accGeo(type) {
  const G = geos();
  if (type in G.acc) return G.acc[type];
  const ni = arr => markShared(mergeGeometries(arr.map(p => (p.index ? p.toNonIndexed() : p))));
  let a = {};
  switch (type) {
    case "headset":
      a = {
        head: {
          dark: ni([
            new THREE.TorusGeometry(R * 1.12, 0.014, 6, 20, Math.PI).translate(0, 0, -0.01),
            new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14).rotateZ(Math.PI / 2).translate(0.152, 0, 0),
            new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14).rotateZ(Math.PI / 2).translate(-0.152, 0, 0),
            bar(V(0.16, -0.03, 0.03), V(0.07, -0.078, 0.13), 0.008),
          ]),
          glow: ni([
            new THREE.CylinderGeometry(0.036, 0.036, 0.012, 14).rotateZ(Math.PI / 2).translate(0.175, 0, 0),
            new THREE.CylinderGeometry(0.036, 0.036, 0.012, 14).rotateZ(Math.PI / 2).translate(-0.175, 0, 0),
            sphere(0.018, 8, 6).translate(0.065, -0.08, 0.135),
          ]),
        },
      };
      break;
    case "goggles":
      a = {
        head: {
          dark: ni([
            new THREE.TorusGeometry(R * 0.98, 0.013, 6, 24).rotateX(Math.PI / 2 - 0.35).translate(0, 0.075, -0.005),
            new THREE.CylinderGeometry(0.047, 0.047, 0.03, 16).rotateX(Math.PI / 2 - 0.55).translate(0.048, 0.112, 0.1),
            new THREE.CylinderGeometry(0.047, 0.047, 0.03, 16).rotateX(Math.PI / 2 - 0.55).translate(-0.048, 0.112, 0.1),
          ]),
          glow: ni([
            new THREE.CylinderGeometry(0.037, 0.037, 0.036, 16).rotateX(Math.PI / 2 - 0.55).translate(0.048, 0.115, 0.104),
            new THREE.CylinderGeometry(0.037, 0.037, 0.036, 16).rotateX(Math.PI / 2 - 0.55).translate(-0.048, 0.115, 0.104),
          ]),
        },
      };
      break;
    case "labcoat":
      a = {
        body: {
          white: ni([
            new THREE.CylinderGeometry(0.218, 0.242, 0.8, 18, 1, true, 0.42, Math.PI * 2 - 0.84).scale(1, 1, 0.8).translate(0, 0.13, 0),
            new THREE.BoxGeometry(0.055, 0.2, 0.014).rotateZ(-0.35).rotateX(-0.1).translate(0.07, 0.44, 0.158),
            new THREE.BoxGeometry(0.055, 0.2, 0.014).rotateZ(0.35).rotateX(-0.1).translate(-0.07, 0.44, 0.158),
            new THREE.BoxGeometry(0.07, 0.07, 0.012).translate(0.12, 0.33, 0.15),
          ]),
          glow: ni([
            new THREE.CylinderGeometry(0.007, 0.007, 0.09, 6).translate(0.108, 0.38, 0.156),
            new THREE.CylinderGeometry(0.007, 0.007, 0.09, 6).translate(0.13, 0.385, 0.154),
          ]),
        },
        armU: { white: ni([sphere(0.088), new THREE.CylinderGeometry(0.08, 0.07, 0.3, 10).translate(0, -0.14, 0)]) },
        armL: { white: ni([new THREE.CylinderGeometry(0.062, 0.055, 0.18, 10).translate(0, -0.08, 0)]) },
      };
      break;
    case "antenna":
      a = {
        head: {
          dark: ni([bar(V(0.045, 0.12, 0), V(0.1, 0.32, -0.02), 0.01), bar(V(-0.045, 0.12, 0), V(-0.1, 0.32, -0.02), 0.01)]),
          glow: ni([sphere(0.032).translate(0.1, 0.33, -0.02), sphere(0.032).translate(-0.1, 0.33, -0.02)]),
        },
      };
      break;
    case "stethoscope":
      a = {
        body: {
          dark: ni([
            new THREE.TorusGeometry(0.12, 0.012, 6, 22, 1.25 * Math.PI).rotateZ(0.875 * Math.PI).rotateX(Math.PI / 2).translate(0, 0.565, 0),
            bar(V(0.111, 0.565, 0.046), V(0.085, 0.53, 0.165), 0.011), bar(V(0.085, 0.53, 0.165), V(0.045, 0.31, 0.15), 0.011),
            bar(V(-0.111, 0.565, 0.046), V(-0.085, 0.53, 0.165), 0.011), bar(V(-0.085, 0.53, 0.165), V(0.03, 0.3, 0.15), 0.011),
          ]),
          metal: ni([new THREE.CylinderGeometry(0.032, 0.032, 0.014, 16).rotateX(Math.PI / 2).translate(0.04, 0.29, 0.152)]),
        },
      };
      break;
    case "tie":
      a = {
        body: {
          glow: ni([
            new THREE.BoxGeometry(0.05, 0.045, 0.03).translate(0, 0.5, 0.15),
            new THREE.CylinderGeometry(0.03, 0.052, 0.3, 4).rotateY(Math.PI / 4).scale(1, 1, 0.35).rotateX(0.07).translate(0, 0.33, 0.142),
          ]),
          white: ni([
            new THREE.BoxGeometry(0.06, 0.05, 0.012).rotateZ(-0.6).translate(0.04, 0.52, 0.14),
            new THREE.BoxGeometry(0.06, 0.05, 0.012).rotateZ(0.6).translate(-0.04, 0.52, 0.14),
          ]),
        },
      };
      break;
    case "bowtie":
      a = {
        body: {
          glow: ni([
            new THREE.ConeGeometry(0.036, 0.065, 4).rotateZ(Math.PI / 2).translate(0.035, 0.555, 0.085),
            new THREE.ConeGeometry(0.036, 0.065, 4).rotateZ(-Math.PI / 2).translate(-0.035, 0.555, 0.085),
            sphere(0.017, 8, 6).translate(0, 0.555, 0.09),
          ]),
        },
      };
      break;
    case "hood":
      a = {
        head: { cloth: ni([new THREE.SphereGeometry(R * 1.3, 18, 12, Math.PI / 2 + 0.9, Math.PI * 2 - 1.8, 0, 0.72 * Math.PI).translate(0, 0.012, -0.03)]) },
        body: { cloth: ni([new THREE.TorusGeometry(0.12, 0.045, 8, 18).rotateX(Math.PI / 2).scale(1, 1, 0.85).translate(0, 0.56, -0.01)]) },
      };
      break;
    case "cap":
      a = {
        head: {
          accent: ni([
            new THREE.SphereGeometry(R * 1.1, 18, 8, 0, Math.PI * 2, 0, 0.5 * Math.PI).rotateX(-0.12).translate(0, 0.016, 0),
            new THREE.CylinderGeometry(0.115, 0.115, 0.014, 18, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.1).rotateX(0.14).translate(0, 0.03, 0.06),
          ]),
          white: ni([sphere(0.016, 8, 6).translate(0, R * 1.1 + 0.012, -0.015)]),
        },
      };
      break;
    default:
      a = {};
  }
  G.acc[type] = a;
  return a;
}

// ───────────────────────── Matériaux ─────────────────────────

// Matériau unique partagé par tous les avatars : couleur par sommet + lueur par sommet (aGlow).
// Chaque segment du corps est une seule géométrie fusionnée => peu d'appels de rendu.
function avatarMaterial(low) {
  return cached(`am:avatar:${low ? 1 : 0}`, () => {
    const m = low
      ? new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.06, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aGlow;\nvarying float vGlow;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = aGlow;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vGlow;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;");
    };
    m.customProgramCacheKey = () => (low ? "labAvatarL" : "labAvatarS");
    return m;
  });
}

function lensMaterial() {
  return cached("am:lens", () => new THREE.MeshStandardMaterial({ color: "#9befff", roughness: 0.1, transparent: true, opacity: 0.3, depthWrite: false }));
}

// Fusionne [géométrie, couleur, lueur] en une géométrie colorée par sommet
function buildPart(items) {
  const list = [];
  const c = new THREE.Color();
  for (const it of items) {
    if (!it || !it[0]) continue;
    const [g, hex, glow = 0] = it;
    const gg = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(gg.attributes)) if (k !== "position" && k !== "normal") gg.deleteAttribute(k);
    const n = gg.attributes.position.count, col = new Float32Array(n * 3), gl = new Float32Array(n).fill(glow);
    c.set(hex);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    gg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    gg.setAttribute("aGlow", new THREE.BufferAttribute(gl, 1));
    list.push(gg);
  }
  const merged = mergeGeometries(list);
  for (const g of list) g.dispose();
  return merged;
}

const isNeon = hex => { const hsl = {}; new THREE.Color(hex).getHSL(hsl); return hsl.s > 0.6 && hsl.l > 0.4; };

// ───────────────────────── Textures par joueur ─────────────────────────

function drawDecal(canvas, name, num, jerseyHex, accent) {
  const g = canvas.getContext("2d"), W = canvas.width;
  g.clearRect(0, 0, W, W);
  const dark = luminance(jerseyHex) > 0.55;
  const fill = dark ? "#0b0b12" : "#ffffff";
  g.textAlign = "center"; g.textBaseline = "middle";
  let fs = 34;
  const label = name.toUpperCase();
  do { g.font = `900 ${fs}px ${FONT}`; fs -= 2; } while (g.measureText(label).width > W * 0.86 && fs > 14);
  g.fillStyle = fill; g.fillText(label, W / 2, 34);
  g.font = `900 158px ${FONT}`;
  g.lineJoin = "round";
  g.shadowColor = accent; g.shadowBlur = 14;
  g.strokeStyle = accent; g.lineWidth = 10;
  g.strokeText(String(num), W / 2, 150);
  g.shadowBlur = 0;
  g.fillStyle = fill; g.fillText(String(num), W / 2, 150);
}

function drawLabel(canvas, name, num, accent) {
  const g = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const rr = 22;
  g.beginPath();
  g.roundRect ? g.roundRect(4, 14, W - 8, H - 28, rr) : g.rect(4, 14, W - 8, H - 28);
  g.fillStyle = "rgba(6,6,14,0.72)"; g.fill();
  g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,0.14)"; g.stroke();
  g.fillStyle = accent; g.shadowColor = accent; g.shadowBlur = 12;
  g.fillRect(22, 34, 10, H - 68);
  g.shadowBlur = 0;
  g.textBaseline = "middle"; g.textAlign = "left";
  let fs = 52;
  do { g.font = `800 ${fs}px ${FONT}`; fs -= 2; } while (g.measureText(name).width > W - 170 && fs > 20);
  g.fillStyle = "#ffffff"; g.fillText(name, 48, H / 2 + 2);
  g.textAlign = "right"; g.font = `900 44px ${FONT}`;
  g.fillStyle = accent; g.fillText(`#${num}`, W - 24, H / 2 + 2);
}

// ───────────────────────── Avatar ─────────────────────────

const KEYS = ["by", "bx", "bz", "brx", "bry", "brz", "hipL", "hipR", "hipLZ", "hipRZ", "hipRY", "kneeL", "kneeR",
  "shL", "shR", "shLZ", "shRZ", "elL", "elR", "hrx", "hry", "hrz", "comp", "foot"];

export function createAvatar(player, { teamColor = NEON.cyan, teamColor2 = "#111111", isKeeper = false, quality = "high" } = {}) {
  const q = normQuality(quality), low = q === "low";
  const G = geos();
  const look = player.look || {};
  const accent = player.color || NEON.cyan;
  const hairStyle = look.hair || "short";
  const hairColor = look.hairColor || "#2a1c12";
  const skinHex = "#" + new THREE.Color().lerpColors(SKIN_A, SKIN_B, clamp(Math.round((look.skin ?? 0.3) * 20) / 20, 0, 1)).getHexString();
  const shadows = q === "high";

  const skin = skinHex;
  const hairGlow = isNeon(hairColor) ? 0.55 : 0;
  const ACC = { dark: ["#1c1c26", 0], glow: [accent, 0.6], accent: [accent, 0.12], white: ["#eef1f7", 0], metal: ["#c8ccd6", 0.08], cloth: ["#262733", 0] };
  const acc = accGeo(look.accessory || "none");
  const accItems = where => Object.entries(acc[where] || {}).map(([k, g]) => [g, ACC[k][0], ACC[k][1]]);
  const material = avatarMaterial(low);

  const root = new THREE.Group();
  root.name = `avatar:${player.id}`;
  const height = player.taille || H0;
  const rig = new THREE.Group();
  rig.scale.setScalar(height / H0);
  root.add(rig);

  const add = (geo, parent, m = material) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = shadows;
    parent.add(mesh);
    return mesh;
  };

  // ── Tenue (dépend du rôle gardien) ──
  let keeper = !!isKeeper;
  const jerseyCol = () => (keeper ? KEEPER_JERSEY : teamColor);
  const sleeveCol = () => (keeper ? KEEPER_SLEEVE : teamColor);
  const trimCol = () => (keeper ? teamColor : accent);
  const bodyGeo = () => buildPart([
    [G.pelvis, teamColor2], [G.torso, jerseyCol()], [G.stripes, trimCol(), 0.7], [G.collar, trimCol(), 0.7],
    [G.emblem, accent, 0.9], [G.neck, skin], ...accItems("body"),
  ]);
  const upperGeo = () => buildPart([[G.shoulder, sleeveCol()], [G.sleeve, sleeveCol()], [G.cuff, trimCol(), 0.7], [G.upperArm, skin], ...accItems("armU")]);
  const foreGeo = () => buildPart([[G.forearm, skin], keeper ? [G.glove, GLOVE, 0.3] : [G.hand, skin], ...accItems("armL")]);

  // ── Corps ──
  const body = new THREE.Group();
  body.position.y = HIP;
  rig.add(body);
  const bodyMesh = add(bodyGeo(), body);

  // dos : nom + numéro
  const decalCanvas = makeCanvas(256, 256);
  const decalTex = canvasTexture(decalCanvas);
  const decalMat = new THREE.MeshStandardMaterial({ map: decalTex, transparent: true, alphaTest: 0.05, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  const decal = add(G.decal, body, decalMat);
  decal.castShadow = false;
  decal.position.set(0, 0.29, -0.137);
  decal.rotation.set(-0.08, Math.PI, 0);

  const thighGeo = buildPart([[G.thigh, skin], [G.shortsLeg, teamColor2]]);
  const shinGeo = buildPart([[G.shin, teamColor], [G.sockRing, accent, 0.7]]);
  const footGeo = buildPart([[G.boot, "#15151d"], [G.sole, accent, 1.0]]);
  const legs = [1, -1].map(side => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.095, 0, 0);
    body.add(hip);
    add(thighGeo, hip);
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    hip.add(knee);
    add(shinGeo, knee);
    const ankle = new THREE.Group();
    ankle.position.y = -SHIN;
    knee.add(ankle);
    add(footGeo, ankle);
    return { hip, knee, ankle };
  });

  const upG = upperGeo(), foG = foreGeo();
  const arms = [1, -1].map(side => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.235, 0.47, 0);
    body.add(sh);
    const upper = add(upG, sh);
    const el = new THREE.Group();
    el.position.y = -0.29;
    sh.add(el);
    const fore = add(foG, el);
    return { sh, el, upper, fore };
  });

  // ── Tête ──
  const head = new THREE.Group();
  head.position.y = 0.72;
  head.scale.set(1, 1.06, 1);
  body.add(head);
  add(buildPart([
    [G.head, skin], [G.eyes, "#ffffff", 0.08], [G.pupils, "#0d0d14"], [G.mouth, "#5a1f1f"], [G.brows, hairColor, hairGlow],
    hairStyle !== "none" ? [hairGeo(hairStyle), hairColor, hairGlow] : null,
    look.beard ? [G.beard, hairColor, hairGlow] : null,
    look.glasses ? [G.glassesFrame, "#14141b"] : null,
    ...accItems("head"),
  ]), head);
  if (look.glasses) add(G.lenses, head, lensMaterial()).castShadow = false;

  // ── Étiquette flottante ──
  const labelCanvas = makeCanvas(512, 128);
  drawLabel(labelCanvas, player.nom || player.id, player.numero ?? "", accent);
  const labelTex = canvasTexture(labelCanvas);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, depthTest: false, depthWrite: false, transparent: true }));
  label.scale.set(1.3, 0.325, 1);
  label.position.y = height + 0.42;
  label.renderOrder = 20;
  root.add(label);

  // ── Ombre portée simplifiée (sans shadow map) ──
  if (!shadows) {
    const blobMat = cached("am:blob", () => new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.7 }));
    const blob = new THREE.Mesh(G.flat, blobMat);
    blob.scale.setScalar(0.95);
    blob.position.y = 0.012;
    blob.renderOrder = 1;
    root.add(blob);
  }

  // ── Marqueur joueur local ──
  const hlMat = new THREE.MeshBasicMaterial({ map: ringTexture(), color: NEON.lime, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const hlRing = new THREE.Mesh(G.flat, hlMat);
  hlRing.scale.setScalar(1.25);
  hlRing.position.y = 0.02;
  hlRing.renderOrder = 2;
  const chevMat = new THREE.MeshBasicMaterial({ color: NEON.lime, toneMapped: false, depthTest: false, transparent: true });
  const chevron = new THREE.Mesh(G.chevron, chevMat);
  chevron.renderOrder = 21;
  const hlGroup = new THREE.Group();
  hlGroup.add(hlRing, chevron);
  hlGroup.visible = false;
  root.add(hlGroup);

  // ── Aura de power-up (créée à la demande) ──
  let aura = null;
  function buildAura() {
    const g = new THREE.Group();
    const add2 = (mesh, ro) => { mesh.renderOrder = ro; g.add(mesh); return mesh; };
    const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const ring1 = add2(new THREE.Mesh(G.flat, ringMat), 3); ring1.position.y = 0.03; ring1.scale.setScalar(1.7);
    const ring2 = add2(new THREE.Mesh(G.flat, ringMat), 3); ring2.position.y = 0.035; ring2.scale.setScalar(1.1);
    const beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const beam = add2(new THREE.Mesh(G.beam, beamMat), 4);
    const N = low ? 12 : 28;
    const pos = new Float32Array(N * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const pm = new THREE.PointsMaterial({ map: glowTexture(), size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const pts = add2(new THREE.Points(pg, pm), 5);
    pts.frustumCulled = false;
    const seeds = Array.from({ length: N }, (_, i) => [Math.random() * Math.PI * 2, 0.35 + Math.random() * 0.3, Math.random(), 0.5 + Math.random() * 0.8]);
    g.visible = false;
    root.add(g);
    return { g, ring1, ring2, beam, pts, pos, seeds, mats: [ringMat, beamMat, pm] };
  }

  // ── Étoiles d'étourdissement (créées à la demande) ──
  let stars = null;
  function buildStars() {
    const g = new THREE.Group();
    const sm = cached("am:star", () => new THREE.MeshBasicMaterial({ color: NEON.gold, toneMapped: false }));
    for (let i = 0; i < 3; i++) g.add(new THREE.Mesh(G.star, sm));
    g.position.y = 0.26;
    head.add(g);
    return g;
  }

  // ── Maillot (joueur / gardien) ──
  function refreshDecal() {
    drawDecal(decalCanvas, player.nom || player.id, player.numero ?? "", jerseyCol(), trimCol());
    decalTex.needsUpdate = true;
  }
  function setKeeper(v) {
    if (!!v === keeper) return;
    keeper = !!v;
    const ob = bodyMesh.geometry, ou = arms[0].upper.geometry, of = arms[0].fore.geometry;
    bodyMesh.geometry = bodyGeo();
    const up = upperGeo(), fo = foreGeo();
    for (const a of arms) { a.upper.geometry = up; a.fore.geometry = fo; }
    ob.dispose(); ou.dispose(); of.dispose();
    refreshDecal();
  }
  refreshDecal();

  // ── Animation ──
  const cur = {}, tgt = {};
  let first = true, phase = 0, clock = 0, hl = false;

  const legExtent = (hip, knee) => {
    const tA = hip + (tgt.comp - 1) * tgt.brx;
    return THIGH * Math.cos(tA) + SHIN * Math.cos(tA - knee) + FOOT;
  };
  const standY = () => Math.max(legExtent(tgt.hipL, tgt.kneeL), legExtent(tgt.hipR, tgt.kneeR));

  function resetTarget() {
    for (const k of KEYS) tgt[k] = 0;
    tgt.by = HIP; tgt.comp = 1; tgt.foot = 1;
    tgt.shLZ = tgt.shRZ = 0.08; tgt.elL = tgt.elR = 0.15;
  }

  function poseLocomotion(speed, action, dt) {
    const sp = clamp(speed || 0, 0, 12);
    const amp = clamp(sp / 6.5, 0, 1.2);
    const freq = sp < 0.15 ? 0 : 1.15 + sp * 0.3;
    phase += dt * freq * Math.PI * 2;
    const s = Math.sin(phase), c = Math.cos(phase);
    tgt.hipL = s * 0.8 * amp; tgt.hipR = -s * 0.8 * amp;
    tgt.kneeL = amp * (0.15 + 1.1 * Math.max(0, c));
    tgt.kneeR = amp * (0.15 + 1.1 * Math.max(0, -c));
    tgt.shL = -s * 0.75 * amp; tgt.shR = s * 0.75 * amp;
    tgt.elL = tgt.elR = 0.2 + amp * 0.95;
    tgt.brx = 0.09 * amp + (action === "sprint" ? 0.14 : 0);
    tgt.bry = s * 0.07 * amp;
    tgt.brz = s * 0.025 * amp;
    tgt.hrx = -tgt.brx * 0.6;
    // respiration au repos
    const idle = 1 - clamp(sp / 1.2, 0, 1);
    tgt.shLZ = tgt.shRZ = 0.08 + idle * Math.sin(clock * 2.2) * 0.025;
    // posture de gardien prêt
    if (keeper && idle > 0) {
      const w = idle;
      tgt.hipL += 0.35 * w; tgt.hipR += 0.35 * w;
      tgt.kneeL += 0.65 * w; tgt.kneeR += 0.65 * w;
      tgt.hipLZ = tgt.hipRZ = 0.12 * w;
      tgt.brx += 0.22 * w;
      tgt.shL += 0.45 * w; tgt.shR += 0.45 * w;
      tgt.shLZ += 0.45 * w; tgt.shRZ += 0.45 * w;
      tgt.elL += 0.5 * w; tgt.elR += 0.5 * w;
      tgt.hrx -= 0.15 * w;
    }
    tgt.by = standY() + Math.abs(s) * 0.055 * amp + idle * Math.sin(clock * 2.2) * 0.005;
  }

  function poseKick(t, k) {
    const wind = smooth(0, 0.3, t) * (1 - smooth(0.3, 0.45, t));
    const strike = smooth(0.3, 0.5, t) * (1 - smooth(0.62, 1, t));
    tgt.hipR = (-0.75 * wind + 1.35 * strike) * k;
    tgt.kneeR = (1.5 * wind + 0.12 * strike) * k;
    tgt.hipRY = k < 1 ? -0.7 * strike : 0;
    tgt.hipL = 0.12 + 0.12 * strike; tgt.kneeL = 0.32;
    tgt.brx = (0.12 * wind - 0.2 * strike) * k;
    tgt.bry = (-0.25 * wind + 0.3 * strike) * k;
    tgt.shL = 0.5 * strike - 0.2 * wind; tgt.shLZ = 0.35 + 0.55 * strike * k;
    tgt.shR = -0.55 * strike + 0.3 * wind; tgt.shRZ = 0.3 + 0.3 * strike * k;
    tgt.elL = tgt.elR = 0.4;
    tgt.hrx = 0.18 * strike;
    tgt.by = standY();
  }

  function poseTackle(t) {
    const e = smooth(0, 0.18, t) * (1 - smooth(0.78, 1, t));
    tgt.comp = 1 - e; tgt.foot = 1 - e;
    tgt.brx = -1.05 * e;
    tgt.brz = 0.12 * e;
    tgt.bz = 0.3 * e;
    tgt.hipR = 0.25 * e; tgt.kneeR = 0.05;
    tgt.hipL = 0.25 * e; tgt.kneeL = 0.15 + 2.1 * e;
    tgt.hipLZ = 0.2 * e;
    tgt.shL = -0.9 * e; tgt.shLZ = 0.08 + 0.35 * e; tgt.elL = 0.2;
    tgt.shR = 0.6 * e; tgt.shRZ = 0.08 + 0.6 * e; tgt.elR = 0.5;
    tgt.hrx = 0.75 * e;
    tgt.by = lerp(HIP, 0.42, e);
  }

  function poseDive(t, dir) {
    const d = dir >= 0 ? 1 : -1;
    const crouch = smooth(0, 0.12, t) * (1 - smooth(0.12, 0.3, t));
    const fly = smooth(0.1, 0.42, t);
    const land = smooth(0.5, 0.8, t);
    tgt.comp = 1 - fly; tgt.foot = 1 - fly;
    tgt.kneeL = tgt.kneeR = 0.7 * crouch + 0.2 * fly;
    tgt.hipL = tgt.hipR = 0.4 * crouch;
    tgt.hipLZ = tgt.hipRZ = 0.15 * fly;
    tgt.brz = -d * 1.42 * fly;
    tgt.bx = d * 0.55 * fly;
    tgt.brx = 0.15 * crouch;
    tgt.shLZ = tgt.shRZ = 0.3 * crouch + 2.85 * fly;
    tgt.shL = tgt.shR = 0.5 * crouch + 0.25 * fly;
    tgt.elL = tgt.elR = 0.15;
    tgt.hrz = d * 0.2 * fly;
    tgt.by = lerp(standY(), lerp(0.8, 0.26, land), fly);
  }

  function poseCelebrate() {
    const j = Math.abs(Math.sin(clock * 6));
    tgt.hipL = tgt.hipR = 0.25 * (1 - j);
    tgt.kneeL = tgt.kneeR = 0.1 + 0.55 * (1 - j);
    tgt.shLZ = tgt.shRZ = 2.55 + 0.28 * Math.sin(clock * 12);
    tgt.shL = tgt.shR = 0.2;
    tgt.elL = tgt.elR = 0.35 + 0.3 * Math.sin(clock * 12);
    tgt.hrx = -0.25;
    tgt.bry = Math.sin(clock * 2) * 0.3;
    tgt.by = standY() + j * 0.28;
  }

  function poseStunned() {
    tgt.brz = Math.sin(clock * 2.6) * 0.16;
    tgt.brx = 0.08 + Math.sin(clock * 1.9) * 0.08;
    tgt.hrz = Math.sin(clock * 3.3) * 0.28;
    tgt.hrx = 0.15;
    tgt.hry = Math.sin(clock * 1.7) * 0.3;
    tgt.shLZ = 0.45 + Math.sin(clock * 3) * 0.15;
    tgt.shRZ = 0.45 - Math.sin(clock * 3) * 0.15;
    tgt.elL = tgt.elR = 0.2;
    tgt.hipL = tgt.hipR = 0.15;
    tgt.kneeL = 0.3 + Math.sin(clock * 2.6) * 0.1;
    tgt.kneeR = 0.3 - Math.sin(clock * 2.6) * 0.1;
    tgt.by = standY();
  }

  function apply() {
    body.position.set(cur.bx, cur.by, cur.bz);
    body.rotation.set(cur.brx, cur.bry, cur.brz);
    const c = cur.comp * cur.brx;
    const [L, Rl] = legs;
    L.hip.rotation.set(-(cur.hipL + c), 0, cur.hipLZ);
    Rl.hip.rotation.set(-(cur.hipR + c), cur.hipRY, -cur.hipRZ);
    L.knee.rotation.x = cur.kneeL;
    Rl.knee.rotation.x = cur.kneeR;
    L.ankle.rotation.x = cur.foot * 0.6 * (cur.hipL - cur.kneeL);
    Rl.ankle.rotation.x = cur.foot * 0.6 * (cur.hipR - cur.kneeR);
    const [AL, AR] = arms;
    AL.sh.rotation.set(-cur.shL, 0, cur.shLZ);
    AR.sh.rotation.set(-cur.shR, 0, -cur.shRZ);
    AL.el.rotation.x = -cur.elL;
    AR.el.rotation.x = -cur.elR;
    head.rotation.set(cur.hrx, cur.hry, cur.hrz);
  }

  let auraColor = null;
  function setState({ speed = 0, action = "idle", actionT = 0, diveDir = 1 } = {}, dt = 1 / 60) {
    dt = clamp(dt || 0, 0, 0.1);
    clock += dt;
    resetTarget();
    const t = clamp(actionT || 0, 0, 1);
    let rate = 20;
    switch (action) {
      case "kick": poseKick(t, 1); rate = 30; break;
      case "pass": poseKick(t, 0.65); rate = 30; break;
      case "tackle": poseTackle(t); rate = 18; break;
      case "dive": poseDive(t, diveDir); rate = 16; break;
      case "celebrate": poseCelebrate(); rate = 22; break;
      case "stunned": poseStunned(); rate = 10; break;
      default: poseLocomotion(speed, action, dt); rate = 24;
    }
    if (first) { Object.assign(cur, tgt); first = false; }
    const k = 1 - Math.exp(-dt * rate);
    for (const key of KEYS) cur[key] += (tgt[key] - cur[key]) * k;
    apply();

    // étoiles
    const stun = action === "stunned";
    if (stun && !stars) stars = buildStars();
    if (stars) {
      stars.visible = stun;
      if (stun) stars.children.forEach((m, i) => {
        const a = clock * 4 + (i * Math.PI * 2) / 3;
        m.position.set(Math.cos(a) * 0.17, Math.sin(clock * 6 + i) * 0.02, Math.sin(a) * 0.17);
        m.rotation.y = clock * 5;
      });
    }
    // marqueur local
    if (hl) {
      hlRing.material.opacity = 0.75 + 0.25 * Math.sin(clock * 5);
      chevron.position.y = height + 0.78 + Math.sin(clock * 4) * 0.06;
      chevron.rotation.y = clock * 2;
    }
    // aura
    if (aura && aura.g.visible) {
      aura.ring1.rotation.y = clock * 1.5;
      aura.ring2.rotation.y = -clock * 2.2;
      const pz = 1 + Math.sin(clock * 6) * 0.08;
      aura.ring2.scale.setScalar(1.1 * pz);
      aura.beam.rotation.y = clock * 0.9;
      aura.beam.scale.set(1, (height / H0) * (0.95 + Math.sin(clock * 3) * 0.05), 1);
      const N = aura.seeds.length, p = aura.pos;
      for (let i = 0; i < N; i++) {
        const [a0, rad, off, spd] = aura.seeds[i];
        const u = (clock * 0.45 * spd + off) % 1;
        const a = a0 + clock * 2 * spd;
        const rr = rad * (1 - u * 0.4);
        p[i * 3] = Math.cos(a) * rr; p[i * 3 + 1] = u * 2.3; p[i * 3 + 2] = Math.sin(a) * rr;
      }
      aura.pts.geometry.attributes.position.needsUpdate = true;
    }
  }

  function setHighlight(v) {
    hl = !!v;
    hlGroup.visible = hl;
    chevron.position.y = height + 0.78;
  }

  function setPowerUp(active, colorHex) {
    if (active && !aura) aura = buildAura();
    if (!aura) return;
    aura.g.visible = !!active;
    const col = colorHex || auraColor || accent;
    auraColor = col;
    for (const m of aura.mats) m.color.set(col);
  }

  function setLabelVisible(v) { label.visible = !!v; }

  function dispose() {
    if (root.parent) root.parent.remove(root);
    disposeTree(root);
  }

  setState({ speed: 0, action: "idle" }, 0);

  return {
    group: root, player, height,
    setState, setKeeper, setHighlight, setPowerUp, setLabelVisible, dispose,
    get isKeeper() { return keeper; },
  };
}
