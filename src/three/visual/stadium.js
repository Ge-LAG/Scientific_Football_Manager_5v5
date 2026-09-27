// L'Arène du Labo : terrain stylisé (tonte, grain, lignes lumineuses), cage de verre à reflets, buts à filets souples,
// tribunes + foule animée (ola, variété d'attitudes, flashs), néons HDR pour le bloom, tours d'éclairage à faisceaux,
// bandeaux LED défilants, écran géant. Qualité réglable à chaud via setQuality().
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { NEON, rng, makeCanvas, canvasTexture, fadeTexture, glowTexture, disposeTree } from "./util.js";
import { normLevel, atLeast } from "../render/quality.js";

const HL = 20, HW = 12;                       // demi-longueur / demi-largeur du terrain
const GOAL_HW = 2.5, GOAL_H = 2.2, GOAL_D = 1.2;
const WALL_H = 4;
const ROWS = 7, ROW_D = 0.9, ROW_RISE = 0.5, ROW_H0 = 0.9;
// intensités HDR (> 1 = capté par le bloom)
const HDR = { strip: 2.3, team: 1.7, lamp: 4.2, led: 1.55, screen: 1.25, lines: 0.6 };
const CROWD = { low: 260, medium: 760, high: 1450, ultra: 1800 };
const FLASHES = { low: 0, medium: 140, high: 260, ultra: 360 };
const SHADOW = { high: [2048, 2.5], ultra: [3072, 3.5] };

const UP = new THREE.Vector3(0, 1, 0);

// ───────────────────────── Fragments GLSL partagés ─────────────────────────

const GLSL_NOISE = /* glsl */`
  float labH21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float labNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(labH21(i), labH21(i + vec2(1.0, 0.0)), f.x), mix(labH21(i + vec2(0.0, 1.0)), labH21(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;

// ───────────────────────── Textures générées ─────────────────────────

// Lignes du terrain (texture de base : alpha = couverture ; texture émissive : halo)
function drawMarkings(g, s, glow) {
  const X = x => (x + HL) * s, Z = z => (z + HW) * s;
  const shapes = () => {
    g.beginPath();
    g.rect(X(-HL + 0.12), Z(-HW + 0.12), (2 * HL - 0.24) * s, (2 * HW - 0.24) * s);
    g.moveTo(X(0), Z(-HW)); g.lineTo(X(0), Z(HW));
    g.moveTo(X(3), Z(0)); g.arc(X(0), Z(0), 3 * s, 0, Math.PI * 2);
    for (const side of [-1, 1]) {
      const gx = side * HL, px = side * (HL - 6);
      g.moveTo(X(gx), Z(-6)); g.lineTo(X(px), Z(-6)); g.lineTo(X(px), Z(6)); g.lineTo(X(gx), Z(6));
      const sx = side * (HL - 2);
      g.moveTo(X(gx), Z(-3.5)); g.lineTo(X(sx), Z(-3.5)); g.lineTo(X(sx), Z(3.5)); g.lineTo(X(gx), Z(3.5));
      const a0 = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.moveTo(X(px) + Math.cos(a0) * 2 * s, Z(0) + Math.sin(a0) * 2 * s);
      g.arc(X(px), Z(0), 2 * s, a0, a0 + Math.PI, false);
    }
    for (const cx of [-HL, HL]) for (const cz of [-HW, HW]) {
      const a = Math.atan2(-cz, -cx);
      g.moveTo(X(cx) + Math.cos(a - Math.PI / 4) * 0.7 * s, Z(cz) + Math.sin(a - Math.PI / 4) * 0.7 * s);
      g.arc(X(cx), Z(cz), 0.7 * s, a - Math.PI / 4, a + Math.PI / 4);
    }
    g.stroke();
    g.beginPath();
    for (const x of [0, -(HL - 6), HL - 6]) { g.moveTo(X(x) + 0.16 * s, Z(0)); g.arc(X(x), Z(0), 0.16 * s, 0, Math.PI * 2); }
    g.fill();
  };
  g.save();
  g.lineCap = "round"; g.lineJoin = "round";
  // halo cyan
  g.strokeStyle = glow ? "rgba(0,240,255,0.4)" : "rgba(0,240,255,0.22)"; g.fillStyle = g.strokeStyle;
  g.lineWidth = 0.2 * s; g.shadowColor = NEON.cyan; g.shadowBlur = (glow ? 0.6 : 0.35) * s;
  shapes();
  // cœur blanc net
  g.shadowBlur = 0.12 * s; g.shadowColor = "#bffcff";
  g.strokeStyle = "rgba(242,255,255,0.98)"; g.fillStyle = "rgba(242,255,255,0.98)";
  g.lineWidth = 0.1 * s;
  shapes();
  // emblème atomique au centre
  g.shadowBlur = 0.4 * s; g.shadowColor = NEON.cyan;
  g.strokeStyle = glow ? "rgba(0,240,255,0.55)" : "rgba(0,240,255,0.4)";
  g.lineWidth = 0.07 * s;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(X(0), Z(0), 2.2 * s, 0.75 * s, (k * Math.PI) / 3, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = glow ? "rgba(255,0,229,0.85)" : "rgba(255,60,235,0.7)"; g.shadowColor = NEON.magenta;
  g.beginPath(); g.arc(X(0), Z(0), 0.34 * s, 0, Math.PI * 2); g.fill();
  g.restore();
}

function pitchTextures(q) {
  const W = q === "low" ? 1024 : 2048, H = Math.round(W * 0.6), s = W / (2 * HL);
  const base = makeCanvas(W, H), g = base.getContext("2d");
  g.clearRect(0, 0, W, H);
  drawMarkings(g, s, false);
  const emi = makeCanvas(W, H), e = emi.getContext("2d");
  e.fillStyle = "#000"; e.fillRect(0, 0, W, H);
  drawMarkings(e, s, true);
  return { map: canvasTexture(base, { aniso: 8 }), emissiveMap: canvasTexture(emi, { aniso: 8 }) };
}

function apronTexture() {
  const c = makeCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#08080f"; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(139,92,246,0.3)"; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254);
  g.strokeStyle = "rgba(139,92,246,0.1)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  const t = canvasTexture(c, { aniso: 8 });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function hexGrid(g, W, H, r) {
  const hw = Math.sqrt(3) * r, vh = 1.5 * r;
  g.beginPath();
  for (let row = 0, y = 0; y < H + r * 2; row++, y += vh) {
    for (let x = (row % 2) * hw / 2; x < W + hw; x += hw) {
      for (let k = 0; k <= 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3, px = x + r * Math.cos(a), py = y + r * Math.sin(a);
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
    }
  }
  g.stroke();
}

function glassTexture() {
  const c = makeCanvas(256, 256), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "rgba(160,235,255,0.24)"); gr.addColorStop(0.07, "rgba(160,235,255,0.07)");
  gr.addColorStop(0.5, "rgba(160,235,255,0.02)"); gr.addColorStop(0.9, "rgba(160,235,255,0.08)");
  gr.addColorStop(1, "rgba(160,235,255,0.3)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(160,235,255,0.045)"; g.lineWidth = 1;
  hexGrid(g, 256, 256, 18);
  g.fillStyle = "rgba(255,255,255,0.04)";
  g.beginPath(); g.moveTo(40, 0); g.lineTo(90, 0); g.lineTo(30, 256); g.lineTo(-20, 256); g.fill();
  const t = canvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

const FONT = `"Segoe UI", "Arial Black", Arial, sans-serif`;

// Bandeau LED défilant
function ledTexture() {
  const W = 2048, H = 128, c = makeCanvas(W, H), g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#06061a"); bg.addColorStop(0.5, "#030309"); bg.addColorStop(1, "#08041a");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const items = [
    ["LAB LEAGUE", NEON.cyan], ["L'ARÈNE DU LABO", NEON.magenta], ["E = mc²", NEON.lime],
    ["SCIENTIFIC FOOTBALL 5v5", NEON.gold], ["∫ BUT · dt", NEON.coral], ["H₂O · NaCl · ADN", NEON.violet],
  ];
  let size = 66, widths, total;
  const measure = () => { g.font = `900 italic ${size}px ${FONT}`; widths = items.map(([t]) => g.measureText(t).width); total = widths.reduce((a, b) => a + b, 0); };
  measure();
  while (total > W * 0.8 && size > 30) { size -= 2; measure(); }
  const gap = (W - total) / items.length;
  let x = gap / 2;
  g.textBaseline = "middle";
  items.forEach(([t, col], i) => {
    g.shadowColor = col; g.shadowBlur = 16; g.fillStyle = col;
    g.fillText(t, x, H / 2 + 4);
    g.shadowBlur = 0; g.fillStyle = "rgba(255,255,255,0.75)";
    const cx = x + widths[i] + gap / 2;
    g.beginPath(); g.moveTo(cx - 7, H / 2); g.lineTo(cx, H / 2 - 7); g.lineTo(cx + 7, H / 2); g.lineTo(cx, H / 2 + 7); g.fill();
    x += widths[i] + gap;
  });
  g.fillStyle = "rgba(0,240,255,0.5)"; g.fillRect(0, 2, W, 3); g.fillRect(0, H - 5, W, 3);
  const t = canvasTexture(c, { aniso: 8 });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Message « BUT ! » blanc (teinté par le shader à la couleur de l'équipe)
function goalLedTexture() {
  const W = 1024, H = 128, c = makeCanvas(W, H), g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  g.textBaseline = "middle"; g.textAlign = "center";
  g.font = `900 italic 92px ${FONT}`;
  g.shadowColor = "#fff"; g.shadowBlur = 14; g.fillStyle = "#fff";
  g.fillText("BUT !", W * 0.25, H / 2 + 5);
  g.fillText("GOAL !", W * 0.75, H / 2 + 5);
  g.shadowBlur = 0;
  for (const cx of [0, W / 2]) for (let k = 0; k < 3; k++) {
    const x0 = cx - 26 + k * 18;
    g.globalAlpha = 0.5 + k * 0.2;
    g.beginPath(); g.moveTo(x0, H / 2 - 22); g.lineTo(x0 + 14, H / 2); g.lineTo(x0, H / 2 + 22); g.lineTo(x0 + 6, H / 2); g.fill();
  }
  g.globalAlpha = 1;
  const t = canvasTexture(c, { aniso: 8 });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function screenTexture() {
  const W = 1024, H = 410, c = makeCanvas(W, H), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, "#070a22"); gr.addColorStop(1, "#12052a");
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(0,240,255,0.08)"; g.lineWidth = 1;
  for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `900 120px ${FONT}`;
  g.shadowColor = NEON.cyan; g.shadowBlur = 30; g.fillStyle = "#bff9ff";
  g.fillText("LAB LEAGUE", W / 2, H * 0.42);
  g.font = `700 44px "Segoe UI", Arial, sans-serif`;
  g.shadowColor = NEON.magenta; g.fillStyle = NEON.magenta;
  g.fillText("L'ARÈNE DU LABO", W / 2, H * 0.72);
  return canvasTexture(c, { aniso: 4 });
}

function screenGoalTexture() {
  const W = 1024, H = 410, c = makeCanvas(W, H), g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `900 italic 190px ${FONT}`;
  g.shadowColor = "#fff"; g.shadowBlur = 30; g.fillStyle = "#fff";
  g.fillText("BUT !", W / 2, H * 0.45);
  g.font = `800 52px ${FONT}`; g.shadowBlur = 10;
  g.fillText("G O A L", W / 2, H * 0.82);
  return canvasTexture(c, { aniso: 4 });
}

function lampTexture() {
  const W = 256, H = 128, c = makeCanvas(W, H), g = c.getContext("2d");
  g.fillStyle = "#0b0b12"; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
    const x = 24 + i * 41.5, y = 22 + j * 42;
    const rg = g.createRadialGradient(x, y, 0, x, y, 19);
    rg.addColorStop(0, "#ffffff"); rg.addColorStop(0.5, "#e4f9ff"); rg.addColorStop(1, "rgba(120,220,255,0)");
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, 19, 0, Math.PI * 2); g.fill();
  }
  return canvasTexture(c);
}

function skyTexture() {
  const c = makeCanvas(4, 256), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#040409"); gr.addColorStop(0.4, "#07071c"); gr.addColorStop(0.49, "#1b0d38");
  gr.addColorStop(0.53, "#0d0a26"); gr.addColorStop(0.6, "#06061a"); gr.addColorStop(1, "#050508");
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return canvasTexture(c);
}

// Maille de filet en losanges (alpha), répétée
function netTexture() {
  const S = 64, c = makeCanvas(S, S), g = c.getContext("2d");
  g.clearRect(0, 0, S, S);
  g.strokeStyle = "rgba(255,255,255,1)"; g.lineWidth = 3.2; g.lineCap = "square";
  g.beginPath();
  g.moveTo(0, S / 2); g.lineTo(S / 2, 0); g.lineTo(S, S / 2); g.lineTo(S / 2, S); g.closePath();
  g.stroke();
  const t = canvasTexture(c, { aniso: 4 });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ───────────────────────── Aides géométriques ─────────────────────────

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function colorize(geo, color) {
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geo;
}

// Barre (boîte) entre deux points
function bar(a, b, t, color) {
  const dir = _v.subVectors(b, a), len = dir.length();
  const geo = new THREE.BoxGeometry(t, t, len);
  _q.setFromUnitVectors(Z_AXIS, dir.normalize());
  _m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), _q, _s);
  geo.applyMatrix4(_m);
  return color ? colorize(geo, color) : geo;
}

// Plan orienté (normale donnée), largeur le long de cross(up, normal)
function planeFacing(w, h, center, normal, uvScaleX = 1, uvRange = null, segW = 1, segH = 1) {
  const geo = new THREE.PlaneGeometry(w, h, segW, segH);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, uv.getX(i) * uvScaleX);
    if (uvRange) uv.setY(i, uvRange[0] + uv.getY(i) * (uvRange[1] - uvRange[0]));
  }
  const n = normal.clone().normalize();
  const xAxis = new THREE.Vector3().crossVectors(UP, n);
  if (xAxis.lengthSq() < 1e-6) xAxis.set(1, 0, 0); else xAxis.normalize();
  const yAxis = new THREE.Vector3().crossVectors(n, xAxis).normalize();
  _m.makeBasis(xAxis, yAxis, n).setPosition(center);
  geo.applyMatrix4(_m);
  return geo;
}

function V(x, y, z) { return new THREE.Vector3(x, y, z); }

// Matériau émissif HDR (néons) : couleurs par sommet × intensité
function neonMaterial(k) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(k, k, k) });
}

// Panneau LED / écran : défilement, grille de diodes estompée au loin, mode « BUT ! » teinté
function ledMaterial(map, goalMap, { grid, bright, goalRepeat = 1 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map }, uGoalMap: { value: goalMap }, uOffset: { value: 0 }, uGoalOffset: { value: 0 },
      uGoal: { value: 0 }, uGoalColor: { value: new THREE.Color(1, 1, 1) }, uBright: { value: bright },
      uGrid: { value: new THREE.Vector2(grid[0], grid[1]) }, uTime: { value: 0 }, uGoalRepeat: { value: goalRepeat },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap, uGoalMap;
      uniform float uOffset, uGoalOffset, uGoal, uBright, uTime, uGoalRepeat;
      uniform vec3 uGoalColor; uniform vec2 uGrid;
      varying vec2 vUv;
      void main() {
        vec3 a = texture2D(uMap, vec2(vUv.x + uOffset, vUv.y)).rgb;
        vec3 gt = texture2D(uGoalMap, vec2(vUv.x * uGoalRepeat + uGoalOffset, vUv.y)).rgb;
        float blink = 0.72 + 0.28 * step(0.5, fract(uTime * 2.5));
        vec3 g = gt * uGoalColor * blink * 1.6 + uGoalColor * 0.07;
        vec3 col = mix(a, g, uGoal);
        vec2 cell = vUv * uGrid;
        float fw = max(fwidth(cell.x), fwidth(cell.y));
        float amt = 1.0 - smoothstep(0.22, 0.6, fw);
        vec2 f = fract(cell) - 0.5;
        float dotm = 1.0 - smoothstep(0.28, 0.52, length(f));
        col *= mix(1.0, 0.3 + 0.95 * dotm, amt);
        gl_FragColor = vec4(col * uBright, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ───────────────────────── Stade ─────────────────────────

export function createStadium(scene, { quality = "high", homeColor = NEON.coral, awayColor = NEON.cyan } = {}) {
  let q = normLevel(quality);
  const group = new THREE.Group();
  group.name = "stadium";
  const parts = {};
  const extraTex = [];   // textures référencées par des uniforms (libérées à la main)
  const prevFog = scene.fog, prevBg = scene.background;
  scene.background = new THREE.Color(NEON.bg);
  scene.fog = new THREE.Fog(NEON.bg, 70, 190);

  const stripGeos = [];   // barres néon fusionnées (couleurs par sommet)
  const addStrip = g => stripGeos.push(g);
  const clockU = { value: 0 };  // horloge partagée par les shaders du stade

  // ── Terrain : gazon procédural (tonte qui change selon l'angle de vue, grain fin, bords assombris) ──
  const { map: pitchMap, emissiveMap: pitchEmi } = pitchTextures(q);
  const pitchU = {
    uTime: clockU, uDetail: { value: q === "low" ? 0 : 1 },
    uGrassA: { value: new THREE.Color("#1a7d4f") }, uGrassB: { value: new THREE.Color("#0f5a3a") },
    uPulse: { value: 0 }, uPulseColor: { value: new THREE.Color(NEON.cyan) }, uScan: { value: 1 },
  };
  const pitchMat = new THREE.MeshStandardMaterial({
    map: pitchMap, emissiveMap: pitchEmi, emissive: 0xffffff, emissiveIntensity: HDR.lines,
    roughness: 0.86, metalness: 0.0,
  });
  pitchMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, pitchU);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLabW;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLabW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vLabW;
        uniform float uTime, uDetail, uPulse, uScan;
        uniform vec3 uGrassA, uGrassB, uPulseColor;
        ${GLSL_NOISE}
        // distance au bord d'une cellule hexagonale (0 sur l'arête)
        float labHex(vec2 p) {
          const vec2 s = vec2(1.0, 1.7320508);
          vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
          vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
          vec2 q = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
          q = abs(q);
          return 0.5 - max(dot(q, s * 0.5), q.x);
        }
        vec3 labGrass(vec2 w) {
          // bandes de tonte de 4 m (x) + damier discret (z) ; claire/sombre s'inversent selon le côté de la caméra
          float sx = w.x * 0.125, fwx = max(fwidth(sx) * 2.0, 1e-4);
          float bx = smoothstep(0.5 - fwx, 0.5 + fwx, abs(fract(sx + 0.25) - 0.5) * 2.0);
          float sz = w.y * 0.125, fwz = max(fwidth(sz) * 2.0, 1e-4);
          float bz = smoothstep(0.5 - fwz, 0.5 + fwz, abs(fract(sz + 0.25) - 0.5) * 2.0);
          // contraste légèrement dépendant de l'angle de vue (brins couchés)
          float k = 0.75 + 0.25 * clamp(abs(cameraPosition.z - w.y) * 0.06, 0.0, 1.0);
          float stripe = 0.5 + (bx - 0.5) * k;
          vec3 c = mix(uGrassB, uGrassA, stripe * 0.85 + bz * 0.15);
          // variations lentes (teinte) + grain fin estompé au loin
          float big = labNoise(w * 0.16);
          c *= vec3(0.94 + 0.1 * big, 0.95 + 0.08 * big, 0.97);
          if (uDetail > 0.5) {
            vec2 gp = w * 9.0;
            float fade = 1.0 - smoothstep(0.35, 1.2, fwidth(gp.x) + fwidth(gp.y));
            float n = labNoise(gp) * 0.6 + labNoise(gp * 2.7 + 3.1) * 0.4;
            c *= 1.0 + (n - 0.5) * 0.26 * fade;
          }
          // assombrissement au pied de la cage
          float edge = smoothstep(0.0, 2.5, min(${HL.toFixed(1)} - abs(w.x), ${HW.toFixed(1)} - abs(w.y)));
          return c * (0.72 + 0.28 * edge);
        }
        vec3 labHolo(vec2 w) {
          float hx = labHex(w / 0.9);
          float fw = fwidth(w.x / 0.9) + fwidth(w.y / 0.9);
          float line = (1.0 - smoothstep(0.0, fw * 1.5 + 0.02, hx)) * (1.0 - smoothstep(0.08, 0.3, fw));
          // balayage holographique lent + onde de but depuis le centre
          float sp = fract(uTime / 11.0) * 64.0 - 32.0;
          float d = w.x - sp;
          float scan = exp(-d * d * 0.35) * uScan;
          float r = length(w) - (1.0 - uPulse) * 34.0;
          float ring = exp(-r * r * 0.25) * uPulse;
          return line * (vec3(0.0, 0.94, 1.0) * (0.022 + scan * 0.45) + uPulseColor * ring * 2.2) + vec3(0.0, 0.3, 0.35) * scan * 0.05;
        }`)
      .replace("#include <map_fragment>", `
        #ifdef USE_MAP
          vec4 labMk = texture2D(map, vMapUv);
          diffuseColor.rgb *= mix(labGrass(vLabW.xz), labMk.rgb, labMk.a);
        #endif`)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += labHolo(vLabW.xz);");
  };
  pitchMat.customProgramCacheKey = () => "labPitch2";
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(2 * HL, 2 * HW).rotateX(-Math.PI / 2), pitchMat);
  pitch.receiveShadow = true;
  pitch.name = "pitch";
  group.add(pitch);
  parts.pitch = pitch;

  // Parvis autour du terrain
  const apronTex = apronTexture();
  apronTex.repeat.set(80 / 2, 64 / 2);
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 64).rotateX(-Math.PI / 2).translate(0, -0.015, 0),
    new THREE.MeshStandardMaterial({ map: apronTex, roughness: 0.45, metalness: 0.55, color: 0x9a9ab0, emissive: NEON.violet, emissiveMap: apronTex, emissiveIntensity: 0.35 }),
  );
  apron.receiveShadow = true;
  group.add(apron);

  // ── Cage de verre : reflet de Fresnel sur les bords + balayage lent ──
  const glassGeos = [];
  const panel = (w, h, cx, cy, cz, normal, uvRange) =>
    glassGeos.push(planeFacing(w, h, V(cx, cy + h / 2, cz), normal, w / 4, uvRange));
  for (const sz of [-1, 1]) panel(2 * HL, WALL_H, 0, 0, sz * HW, V(0, 0, -sz));
  const segLen = HW - GOAL_HW, segC = (HW + GOAL_HW) / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) panel(segLen, WALL_H, sx * HL, 0, sz * segC, V(-sx, 0, 0));
    panel(2 * GOAL_HW, WALL_H - GOAL_H, sx * HL, GOAL_H, 0, V(-sx, 0, 0), [GOAL_H / WALL_H, 1]);
  }
  const glassTex = glassTexture();
  const glassU = { uMap: { value: glassTex }, uColor: { value: new THREE.Color(0x8feaff) }, uTime: clockU, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) } };
  const glassMat = new THREE.ShaderMaterial({
    uniforms: glassU,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uColor, uFlashColor; uniform float uTime, uFlash;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        float ndv = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
        float y = vW.y / ${WALL_H.toFixed(1)};
        float fres = pow(max(1.0 - ndv, 0.0), 5.0) * smoothstep(0.35, 1.0, y);
        vec4 t = texture2D(uMap, vUv);
                float bb = (fract(y * 0.5 - uTime * 0.08) - 0.5) * 9.0;
        float band = exp(-bb * bb) * 0.035;
        float f = fract((vW.x + vW.z) * 0.012 + vW.y * 0.05 - uTime * 0.03);
        float diag = (1.0 - smoothstep(0.0, 0.025, abs(f - 0.5))) * 0.06;
        vec3 col = uColor * (t.rgb * t.a * 0.9 + fres * 0.12 + band + diag) + uFlashColor * uFlash * (0.08 + fres * 0.5);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const glass = new THREE.Mesh(mergeGeometries(glassGeos), glassMat);
  glass.renderOrder = 2;
  glass.name = "glass";
  glass.userData.noAO = true;
  group.add(glass);
  parts.glass = glass;
  extraTex.push(glassTex);

  // arêtes néon de la cage (haut et bas)
  const T = 0.07;
  for (const sz of [-1, 1]) {
    addStrip(bar(V(-HL, WALL_H, sz * HW), V(HL, WALL_H, sz * HW), T, NEON.cyan));
    addStrip(bar(V(-HL, 0.04, sz * HW), V(HL, 0.04, sz * HW), T, NEON.cyan));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addStrip(bar(V(sx * HL, WALL_H, sz * HW), V(sx * HL, WALL_H, sz * GOAL_HW), T, NEON.cyan));
      addStrip(bar(V(sx * HL, 0.04, sz * HW), V(sx * HL, 0.04, sz * GOAL_HW), T, NEON.cyan));
      addStrip(bar(V(sx * HL, 0, sz * HW), V(sx * HL, WALL_H, sz * HW), 0.1, NEON.cyan)); // coins
    }
    addStrip(bar(V(sx * HL, WALL_H, -GOAL_HW), V(sx * HL, WALL_H, GOAL_HW), T, NEON.cyan));
  }
  // montants de la cage (instanciés)
  {
    const pos = [];
    for (let x = -HL + 4; x <= HL - 4; x += 4) for (const sz of [-1, 1]) pos.push([x, sz * HW]);
    for (const sx of [-1, 1]) for (const z of [-8, -4, 4, 8]) pos.push([sx * HL, z]);
    const mull = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.06, WALL_H, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x1a2030, emissive: NEON.cyan, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.4 }),
      pos.length,
    );
    pos.forEach(([x, z], i) => { _m.makeTranslation(x, WALL_H / 2, z); mull.setMatrixAt(i, _m); });
    group.add(mull);
  }

  // ── Buts ──
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf4fbff, emissive: 0xe6fdff, emissiveIntensity: 0.3, roughness: 0.25, metalness: 0.35 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b8, roughness: 0.35, metalness: 0.75 });
  const netTex = netTexture();
  extraTex.push(netTex);
  const NET_CELL = 0.13;
  // Filet : 3 nappes subdivisées (fond, côtés, toit) ; aW = ancrage (0 sur le cadre), aN = normale sortante
  const netGeo = (() => {
    const gs = [];
    const addSheet = (w, h, center, normal, sw, shh, out) => {
      const g = planeFacing(w, h, center, normal, 1, null, sw, shh);
      const uv = g.attributes.uv, n = uv.count;
      const aW = new Float32Array(n), aN = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        aW[i] = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        aN[i * 3] = out.x; aN[i * 3 + 1] = out.y; aN[i * 3 + 2] = out.z;
        uv.setXY(i, (u * w) / NET_CELL, (v * h) / NET_CELL);
      }
      g.setAttribute("aW", new THREE.BufferAttribute(aW, 1));
      g.setAttribute("aN", new THREE.BufferAttribute(aN, 3));
      gs.push(g);
    };
    const x1 = HL + GOAL_D;
    addSheet(2 * GOAL_HW, GOAL_H, V(x1, GOAL_H / 2, 0), V(-1, 0, 0), 26, 12, V(1, 0, 0));
    for (const sz of [-1, 1]) addSheet(GOAL_D, GOAL_H, V(HL + GOAL_D / 2, GOAL_H / 2, sz * GOAL_HW), V(0, 0, -sz), 7, 12, V(0, 0, sz));
    addSheet(GOAL_D, 2 * GOAL_HW, V(HL + GOAL_D / 2, GOAL_H, 0), V(0, -1, 0), 7, 26, V(0, 1, 0));
    return mergeGeometries(gs);
  })();
  const makeNetMaterial = color => new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: netTex }, uColor: { value: new THREE.Color(0xe8fbff) }, uGlow: { value: new THREE.Color(color) },
      uImp: { value: new THREE.Vector3(HL + GOAL_D, 1, 0) }, uT: { value: 99 }, uAmp: { value: 0 }, uTime: clockU,
    },
    vertexShader: /* glsl */`
      attribute float aW; attribute vec3 aN;
      uniform vec3 uImp; uniform float uT, uAmp, uTime;
      varying vec2 vUv; varying float vGlow; varying float vFade;
      void main() {
        vec3 p = position;
        float sway = sin(uTime * 1.3 + p.z * 1.7 + p.y * 0.9) * 0.012;
        float d = distance(position, uImp);
        float env = exp(-uT * 2.4);
        float bulge = exp(-d * d * 0.9) * env * cos(uT * 10.0);
        float front = uT * 3.2;
        float ripple = sin((d - front) * 7.0) * exp(-abs(d - front) * 1.6) * exp(-uT * 2.2);
        p += aN * aW * (0.07 + sway + uAmp * (0.75 * bulge + 0.12 * ripple));
        vGlow = exp(-d * d * 1.2) * exp(-uT * 2.5) * uAmp;
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vFade = 1.0 - smoothstep(30.0, 90.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uColor, uGlow;
      varying vec2 vUv; varying float vGlow; varying float vFade;
      void main() {
        float a = texture2D(uMap, vUv).a;
        if (a < 0.02) discard;
        vec3 col = uColor * 0.85 + uGlow * vGlow * 4.0;
        gl_FragColor = vec4(col, a * (0.55 + 0.25 * vFade));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });

  const postGeo = (() => {
    const r = 0.06, gs = [];
    for (const sz of [-1, 1]) gs.push(new THREE.CylinderGeometry(r, r, GOAL_H + r, 16).translate(HL, (GOAL_H + r) / 2, sz * GOAL_HW));
    gs.push(new THREE.CylinderGeometry(r, r, 2 * GOAL_HW + 2 * r, 16).rotateX(Math.PI / 2).translate(HL, GOAL_H, 0));
    return mergeGeometries(gs);
  })();
  const frameGeo = (() => {
    const t = 0.05, x1 = HL + GOAL_D, gs = [];
    for (const sz of [-1, 1]) {
      gs.push(bar(V(x1, 0, sz * GOAL_HW), V(x1, GOAL_H, sz * GOAL_HW), t));
      gs.push(bar(V(HL, GOAL_H, sz * GOAL_HW), V(x1, GOAL_H, sz * GOAL_HW), t));
      gs.push(bar(V(HL, 0.025, sz * GOAL_HW), V(x1, 0.025, sz * GOAL_HW), t));
    }
    gs.push(bar(V(x1, GOAL_H, -GOAL_HW), V(x1, GOAL_H, GOAL_HW), t));
    gs.push(bar(V(x1, 0.025, -GOAL_HW), V(x1, 0.025, GOAL_HW), t));
    return mergeGeometries(gs);
  })();

  const teamMats = { home: [], away: [] };
  const teamLights = { home: null, away: null };
  const goalPanels = [];
  const nets = {};
  const postMeshes = [];
  function buildGoal(side /* -1 domicile, +1 extérieur */, key, color) {
    const g = new THREE.Group();
    if (side < 0) g.rotation.y = Math.PI;
    const posts = new THREE.Mesh(postGeo, postMat);
    postMeshes.push(posts);
    const netMat = makeNetMaterial(color);
    const net = new THREE.Mesh(netGeo, netMat);
    net.renderOrder = 3; net.frustumCulled = false; net.userData.noAO = true;
    g.add(posts, new THREE.Mesh(frameGeo, frameMat), net);
    nets[key] = { mesh: net, mat: netMat, group: g, armed: true };
    // panneau lumineux derrière le filet
    const glowMat = new THREE.MeshBasicMaterial({
      map: fadeTexture(), color, transparent: true, opacity: 0.55, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const glowPanel = new THREE.Mesh(planeFacing(7, 3.2, V(HL + GOAL_D + 0.25, 1.6, 0), V(-1, 0, 0)), glowMat);
    glowPanel.renderOrder = 3;
    g.add(glowPanel);
    goalPanels.push(glowMat);
    // zone lumineuse au sol dans le but
    const floorMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(GOAL_D, 2 * GOAL_HW).rotateX(-Math.PI / 2).translate(HL + GOAL_D / 2, 0.012, 0), floorMat));
    // barres néon à la couleur de l'équipe (cadre arrière + haut du mur derrière)
    const stripMat = new THREE.MeshBasicMaterial({ color });
    stripMat.color.multiplyScalar(HDR.team); stripMat.userData.hdr = HDR.team;
    const tg = [];
    const xb = HL + GOAL_D + 0.08, t = 0.11;
    for (const sz of [-1, 1]) tg.push(bar(V(xb, 0, sz * (GOAL_HW + 0.1)), V(xb, GOAL_H + 0.1, sz * (GOAL_HW + 0.1)), t));
    tg.push(bar(V(xb, GOAL_H + 0.1, -GOAL_HW - 0.1), V(xb, GOAL_H + 0.1, GOAL_HW + 0.1), t));
    tg.push(bar(V(xb, 0.04, -GOAL_HW - 0.1), V(xb, 0.04, GOAL_HW + 0.1), t));
    tg.push(bar(V(HL + 0.02, 0.02, -GOAL_HW), V(HL + 0.02, 0.02, GOAL_HW), 0.05)); // ligne de but
    for (const sz of [-1, 1]) tg.push(bar(V(HL, WALL_H - 0.12, sz * (GOAL_HW + 0.2)), V(HL, WALL_H - 0.12, sz * 8), 0.09));
    g.add(new THREE.Mesh(mergeGeometries(tg), stripMat));
    teamMats[key].push(glowMat, floorMat, stripMat, netMat);
    const L = new THREE.PointLight(color, 10, 10, 2);
    L.position.set(HL + GOAL_D + 0.4, 1.8, 0);
    g.add(L);
    teamLights[key] = L;
    group.add(g);
    return g;
  }
  parts.homeGoal = buildGoal(-1, "home", homeColor);
  parts.awayGoal = buildGoal(1, "away", awayColor);
  parts.nets = nets;

  // ── Tribunes ──
  const stands = [
    { o: V(0, 0, HW + 1.4), a: V(1, 0, 0), n: V(0, 0, 1), len: 46 },
    { o: V(0, 0, -HW - 1.4), a: V(-1, 0, 0), n: V(0, 0, -1), len: 46 },
    { o: V(HL + 2.8, 0, 0), a: V(0, 0, -1), n: V(1, 0, 0), len: 26 },
    { o: V(-HL - 2.8, 0, 0), a: V(0, 0, 1), n: V(-1, 0, 0), len: 26 },
  ];
  const standGeos = [], ledGeos = [], slots = [];
  const P = (st, u, d, y) => st.o.clone().addScaledVector(st.a, u).addScaledVector(st.n, d).setY(y);
  const topRowY = ROW_H0 + (ROWS - 1) * ROW_RISE, backD = ROWS * ROW_D;
  for (const st of stands) {
    const basis = new THREE.Matrix4().makeBasis(st.a, UP, st.n);
    const place = (geo, u, y, d) => { geo.applyMatrix4(basis); geo.translate(...P(st, u, d, y).toArray()); return geo; };
    for (let i = 0; i < ROWS; i++) {
      const top = ROW_H0 + i * ROW_RISE;
      standGeos.push(place(new THREE.BoxGeometry(st.len, top, ROW_D), 0, top / 2, (i + 0.5) * ROW_D));
      const col = i === ROWS - 1 ? NEON.magenta : i % 2 ? NEON.violet : "#3b2a7a";
      addStrip(bar(P(st, -st.len / 2, i * ROW_D, top), P(st, st.len / 2, i * ROW_D, top), 0.045, col));
      for (let u = -st.len / 2 + 0.45; u <= st.len / 2 - 0.45; u += 0.56) slots.push({ p: P(st, u, (i + 0.62) * ROW_D, top), n: st.n, x: 0, row: i });
    }
    const backH = topRowY + 3.4;
    standGeos.push(place(new THREE.BoxGeometry(st.len, backH, 0.4), 0, backH / 2, backD + 0.2));
    ledGeos.push(planeFacing(st.len, 1.1, P(st, 0, backD - 0.02, topRowY + 2.2), st.n.clone().negate(), st.len / (16 * 1.1)));
    addStrip(bar(P(st, -st.len / 2, backD - 0.05, backH), P(st, st.len / 2, backD - 0.05, backH), 0.09, NEON.cyan));
    addStrip(bar(P(st, -st.len / 2, backD - 0.05, topRowY + 1.55), P(st, st.len / 2, backD - 0.05, topRowY + 1.55), 0.05, NEON.magenta));
    ledGeos.push(planeFacing(st.len, 0.6, P(st, 0, -0.03, 0.32), st.n.clone().negate(), st.len / (16 * 0.6)));
    addStrip(bar(P(st, -st.len / 2, -0.05, 0.64), P(st, st.len / 2, -0.05, 0.64), 0.04, NEON.cyan));
  }
  const standMesh = new THREE.Mesh(mergeGeometries(standGeos), new THREE.MeshStandardMaterial({ color: 0x131626, roughness: 0.75, metalness: 0.3 }));
  group.add(standMesh);
  const ledTex = ledTexture(), goalLedTex = goalLedTexture();
  extraTex.push(ledTex, goalLedTex);
  const ledMat = ledMaterial(ledTex, goalLedTex, { grid: [16 * 26, 26], bright: HDR.led, goalRepeat: 2 });
  const led = new THREE.Mesh(mergeGeometries(ledGeos), ledMat);
  group.add(led);
  parts.stands = standMesh;
  parts.led = led;

  // ── Foule : attitudes variées (rebond, balancement, applaudissements), ola et joie par équipe ──
  const CROWD_MAX = Math.min(slots.length, CROWD.ultra);
  const crowdU = {
    uTime: { value: 0 }, uExcite: { value: 0.15 }, uCheer: { value: new THREE.Vector2(0, 0) },
    uWaveT: { value: -1 }, uWaveA0: { value: 0 }, uWaveSpeed: { value: 1.25 },
  };
  const crowd = (() => {
    const r = rng(1234);
    // remplissage prioritaire des premiers rangs (qualité basse = moins de spectateurs)
    for (const s of slots) s.k = s.row + r() * ROWS * 1.6;
    slots.sort((a, b) => a.k - b.k);
    const n = CROWD_MAX;
    // deux silhouettes : simple (low/medium) et lissée (high/ultra), échangées à chaud
    const flat = gs => mergeGeometries(gs.map(g => (g.index ? g.toNonIndexed() : g)));
    const geo = flat([
      new THREE.CylinderGeometry(0.2, 0.17, 0.95, 7).translate(0, 0.475, 0),
      new THREE.IcosahedronGeometry(0.14, 0).translate(0, 1.14, 0),
      new THREE.BoxGeometry(0.1, 0.42, 0.1).translate(0.265, 0.66, 0),
      new THREE.BoxGeometry(0.1, 0.42, 0.1).translate(-0.265, 0.66, 0),
    ]);
    const geoHi = flat([
      new THREE.CylinderGeometry(0.19, 0.16, 0.5, 9, 1, true).translate(0, 0.7, 0),
      new THREE.SphereGeometry(0.19, 9, 2, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.2, 0.8).translate(0, 0.95, 0),
      new THREE.CylinderGeometry(0.165, 0.14, 0.42, 9, 1, true).scale(1, 1, 0.8).translate(0, 0.21, 0),
      new THREE.SphereGeometry(0.135, 8, 6).translate(0, 1.13, 0),
      new THREE.CylinderGeometry(0.052, 0.046, 0.42, 5).translate(0.265, 0.66, 0),
      new THREE.CylinderGeometry(0.052, 0.046, 0.42, 5).translate(-0.265, 0.66, 0),
    ]);
    const phase = new Float32Array(n), team = new Float32Array(n);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, crowdU);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
          attribute float aPhase; attribute float aTeam;
          uniform float uTime, uExcite, uWaveT, uWaveA0, uWaveSpeed; uniform vec2 uCheer;
          varying float vHead; varying float vSkin; varying float vLegs;
          vec2 labRot(vec2 p, vec2 piv, float a) { vec2 d = p - piv; float c = cos(a), s = sin(a); return piv + vec2(c * d.x - s * d.y, s * d.x + c * d.y); }`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float rnd = fract(aPhase * 7.13), rnd2 = fract(aPhase * 13.71);
          vHead = step(0.993, position.y) * step(abs(position.x), 0.2);
          vSkin = fract(aPhase * 3.31);
          vLegs = (1.0 - step(0.43, position.y)) * step(abs(position.x), 0.2);
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          // ola : deux fronts partant du but, en sens opposés
          float wave = 0.0;
          if (uWaveT >= 0.0) {
            float ang = atan(ip.z, ip.x);
            for (int k = 0; k < 2; k++) {
              float dir = k == 0 ? 1.0 : -1.0;
              float d = ang - (uWaveA0 + dir * uWaveT * uWaveSpeed);
              d = atan(sin(d), cos(d));
              wave += exp(-d * d * 40.0);
            }
            wave = min(1.0, wave) * (1.0 - smoothstep(5.0, 7.5, uWaveT)) * smoothstep(0.0, 0.3, uWaveT);
          }
          float cheer = aTeam < 0.5 ? uCheer.x : (aTeam < 1.5 ? uCheer.y : 0.4 * max(uCheer.x, uCheer.y));
          float exc = clamp(uExcite + cheer, 0.0, 1.0);
          float raise = clamp(exc * 1.5 - rnd * 0.55, 0.0, 1.0) * (0.8 + 0.2 * sin(uTime * 6.0 + aPhase * 4.0));
          raise = max(raise, wave);
          // attitudes au repos : 0-0.3 rebond, 0.3-0.5 balancement, 0.5-0.65 applaudit, reste calme
          float clap = step(0.5, rnd2) * step(rnd2, 0.65) * (1.0 - raise);
          if (abs(position.x) > 0.205) {
            float sd = sign(position.x);
            float a = raise * 2.7 * sd;
            a += clap * sd * (0.9 + 0.35 * sin(uTime * 9.0 + aPhase * 5.0));
            transformed.xy = labRot(transformed.xy, vec2(0.265 * sd, 0.86), a);
          }
          float sway = step(0.3, rnd2) * step(rnd2, 0.5) * sin(uTime * (1.1 + rnd * 0.8) + aPhase * 3.0) * 0.07;
          transformed.xy = labRot(transformed.xy, vec2(0.0, 0.0), sway);
          float jump = max(0.0, sin(uTime * (3.0 + rnd * 3.5) + aPhase * 6.2831));
          float bob = step(rnd2, 0.3) * 0.035 + 0.012;
          transformed.y += jump * (bob + exc * 0.34 * step(0.3, rnd)) + wave * 0.3;`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          varying float vHead; varying float vSkin; varying float vLegs;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.055, 0.08) + diffuseColor.rgb * 0.12, vLegs * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.86, 0.58, 0.41), vec3(0.11, 0.045, 0.02), vSkin), vHead);`);
    };
    mat.customProgramCacheKey = () => "labCrowd2";
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const o = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const sl = slots[i];
      o.position.copy(sl.p).addScaledVector(sl.n, (r() - 0.5) * 0.12);
      o.rotation.set(0, Math.atan2(-sl.n.x, -sl.n.z) + (r() - 0.5) * 0.5, 0);
      const sc = 0.92 + r() * 0.2;
      o.scale.set(sc, sc * (0.92 + r() * 0.16), sc);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      phase[i] = r() * 100;
      sl.x = o.position.x;
    }
    const aPhase = new THREE.InstancedBufferAttribute(phase, 1), aTeam = new THREE.InstancedBufferAttribute(team, 1);
    for (const g of [geo, geoHi]) { g.setAttribute("aPhase", aPhase); g.setAttribute("aTeam", aTeam); }
    mesh.userData.slots = slots.slice(0, n);
    mesh.userData.geos = { lo: geo, hi: geoHi };
    mesh.frustumCulled = false;
    return mesh;
  })();
  group.add(crowd);
  parts.crowd = crowd;

  const neutralCols = ["#e8e8f0", "#2a2a38", "#8B5CF6", "#FFD700", "#B8FF00", "#555566", "#FF00E5"];
  function paintCrowd(home, away) {
    const r = rng(99), c = new THREE.Color(), sl = crowd.userData.slots;
    const teamAttr = crowd.geometry.attributes.aTeam;
    for (let i = 0; i < CROWD_MAX; i++) {
      const x = sl[i].x, v = r();
      const pHome = 0.5 - Math.tanh(x / 12) * 0.42;
      let col, t = 2;
      if (v < 0.78) { const h = r() < pHome; col = h ? home : away; t = h ? 0 : 1; }
      else col = neutralCols[Math.floor(r() * neutralCols.length)];
      c.set(col).multiplyScalar(0.55 + r() * 0.35);
      crowd.setColorAt(i, c);
      teamAttr.array[i] = t;
    }
    crowd.instanceColor.needsUpdate = true;
    teamAttr.needsUpdate = true;
  }
  paintCrowd(homeColor, awayColor);

  // Flashs d'appareils photo / téléphones dans la foule
  const flashU = { uClock: { value: 0 }, uRate: { value: 0 }, uSize: { value: 5 }, uColor: { value: new THREE.Color(3.2, 3.4, 3.8) } };
  const crowdFlashes = (() => {
    const r = rng(77), n = FLASHES.ultra, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    const sl = crowd.userData.slots;
    for (let i = 0; i < n; i++) {
      const s = sl[Math.floor(r() * sl.length)];
      pos[i * 3] = s.p.x + (r() - 0.5) * 0.3; pos[i * 3 + 1] = s.p.y + 1.25; pos[i * 3 + 2] = s.p.z + (r() - 0.5) * 0.3;
      seed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: flashU,
      vertexShader: /* glsl */`
        attribute float aSeed; uniform float uClock, uRate, uSize; varying float vB;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float ph = fract(uClock * (0.05 + 0.06 * fract(aSeed * 3.7)) + aSeed * 13.0);
          float w = 0.01 + 0.02 * uRate;
          float b = 1.0 - smoothstep(0.0, w, ph);
          vB = b;
          gl_PointSize = b > 0.002 ? uSize * (0.5 + b) * (40.0 / max(1.0, -mv.z)) : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vB;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = exp(-dot(c, c) * 22.0);
          gl_FragColor = vec4(uColor * a * vB, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.renderOrder = 5;
    return pts;
  })();
  group.add(crowdFlashes);

  // ── Tours d'éclairage (fusionnées) + faisceaux volumétriques ──
  const lampTex = lampTexture();
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x151826, roughness: 0.45, metalness: 0.75 });
  const lampMat = new THREE.MeshBasicMaterial({ map: lampTex, color: new THREE.Color(HDR.lamp, HDR.lamp, HDR.lamp) });
  const beamU = { uTime: clockU, uIntensity: { value: 0.1 }, uColor: { value: new THREE.Color(0xcdeeff) } };
  const beamMat = new THREE.ShaderMaterial({
    uniforms: beamU,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vY;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vY = uv.y; vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uIntensity; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vY;
      ${GLSL_NOISE}
      void main() {
        float dist = length(vV);
        float ndv = abs(dot(normalize(vN), vV / dist));
        float soft = pow(clamp(ndv, 0.0, 1.0), 2.2);
        float fall = pow(clamp(vY, 0.0, 1.0), 1.6);
        vec2 np = vec2(vW.x + vW.z, vW.y) * 0.35 + vec2(uTime * 0.05, -uTime * 0.12);
        float dust = 0.6 + 0.55 * labNoise(np) + 0.25 * labNoise(np * 3.1);
        float a = soft * fall * dust * uIntensity * smoothstep(3.0, 14.0, dist);
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const towerH = 17;
  const towerGeos = [], lampGeos = [], beamGeos = [], lampSpots = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const base = V(sx * 26.5, 0, sz * 18.5);
    towerGeos.push(new THREE.BoxGeometry(0.8, towerH, 0.8).translate(base.x, towerH / 2, base.z));
    const inward = V(-sx, 0, -sz).normalize();
    const sp = base.clone().addScaledVector(inward, 0.45);
    addStrip(bar(sp.clone().setY(0.2), sp.clone().setY(towerH - 1), 0.1, sx * sz > 0 ? NEON.magenta : NEON.cyan));
    const head = new THREE.Object3D();
    head.position.set(base.x, towerH + 0.8, base.z);
    const target = V(sx * 9, 0, sz * 4);
    head.lookAt(target);
    head.updateMatrix();
    towerGeos.push(new THREE.BoxGeometry(3.6, 2, 0.5).applyMatrix4(head.matrix));
    lampGeos.push(new THREE.PlaneGeometry(3.3, 1.7).translate(0, 0, 0.26).applyMatrix4(head.matrix));
    lampSpots.push(new THREE.Vector3(0, 0, 0.6).applyMatrix4(head.matrix));
    const from = head.position.clone(), dir = from.clone().sub(target), len = dir.length();
    const cone = new THREE.CylinderGeometry(1.4, 7.5, len, 28, 1, true); // uv.y = 1 côté projecteur
    _q.setFromUnitVectors(UP, dir.normalize());
    _m.compose(from.clone().add(target).multiplyScalar(0.5), _q, _s);
    beamGeos.push(cone.applyMatrix4(_m));
  }
  group.add(new THREE.Mesh(mergeGeometries(towerGeos), towerMat));
  group.add(new THREE.Mesh(mergeGeometries(lampGeos), lampMat));
  const beams = new THREE.Mesh(mergeGeometries(beamGeos), beamMat);
  beams.renderOrder = 4; beams.userData.noAO = true;
  group.add(beams);
  parts.beams = beams;
  // halos des projecteurs (faux bloom, surtout utile en « low »)
  const haloMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xdff6ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 });
  const halos = lampSpots.map(p => {
    const s = new THREE.Sprite(haloMat);
    s.position.copy(p); s.scale.setScalar(6); s.renderOrder = 6;
    group.add(s);
    return s;
  });

  // ── Écran géant au-dessus du milieu ──
  const jumbo = new THREE.Group();
  jumbo.position.set(0, 13, 0);
  const scrTex = screenTexture(), scrGoalTex = screenGoalTexture();
  extraTex.push(scrTex, scrGoalTex);
  const scrMat = ledMaterial(scrTex, scrGoalTex, { grid: [7 * 40 / 2.8, 40], bright: HDR.screen });
  const scrMatSide = ledMaterial(scrTex, scrGoalTex, { grid: [4 * 40 / 2.8, 40], bright: HDR.screen });
  scrMatSide.uniforms = { ...scrMat.uniforms, uGrid: { value: new THREE.Vector2(4 * 40 / 2.8, 40) } };
  {
    const W = 7, H = 2.8, D = 4;
    jumbo.add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, H + 0.3, D + 0.3), towerMat));
    const front = [], side = [];
    for (const s of [-1, 1]) {
      front.push(planeFacing(W, H, V(0, 0, s * (D / 2 + 0.16)), V(0, 0, s)));
      side.push(planeFacing(D, H, V(s * (W / 2 + 0.16), 0, 0), V(s, 0, 0)));
    }
    jumbo.add(new THREE.Mesh(mergeGeometries(front), scrMat), new THREE.Mesh(mergeGeometries(side), scrMatSide));
    const jg = [], w = W / 2 + 0.17, h = H / 2 + 0.17, d = D / 2 + 0.17;
    for (const y of [-h, h]) for (const s of [-1, 1]) {
      jg.push(bar(V(-w, y, s * d), V(w, y, s * d), 0.08, NEON.cyan));
      jg.push(bar(V(s * w, y, -d), V(s * w, y, d), 0.08, NEON.cyan));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) jg.push(bar(V(sx * w, -h, sz * d), V(sx * w, h, sz * d), 0.08, NEON.magenta));
    jg.push(colorize(new THREE.TorusGeometry(1.4, 0.06, 6, 40).rotateX(Math.PI / 2).translate(0, -h - 0.35, 0), NEON.magenta));
    const cables = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cables.push(bar(V(sx * (w - 0.3), h, sz * (d - 0.3)), V(sx * 2.5, 40, sz * 2), 0.03, "#3a3f55"));
    jumbo.add(new THREE.Mesh(mergeGeometries(jg), neonMaterial(HDR.strip)));
    jumbo.add(new THREE.Mesh(mergeGeometries(cables), new THREE.MeshBasicMaterial({ vertexColors: true })));
  }
  group.add(jumbo);
  parts.jumbotron = jumbo;

  // Barres néon au sol autour de la cage
  for (const sz of [-1, 1]) addStrip(bar(V(-HL - 1, 0.01, sz * (HW + 0.7)), V(HL + 1, 0.01, sz * (HW + 0.7)), 0.06, NEON.violet));

  const strips = new THREE.Mesh(mergeGeometries(stripGeos), neonMaterial(HDR.strip));
  strips.name = "neonStrips";
  group.add(strips);

  // ── Ciel + étoiles ──
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -10;
  group.add(sky);
  const stars = (() => {
    const r = rng(5), n = 900, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(0.15 + r() * 0.85);
      p[i * 3] = 200 * Math.sin(ph) * Math.cos(th); p[i * 3 + 1] = 200 * Math.cos(ph); p[i * 3 + 2] = 200 * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xaab8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 }));
  })();
  group.add(stars);

  // ── Éclairage : soleil (clé) chaud, contre-jour froid, débouchage chaud, accent magenta ──
  const hemi = new THREE.HemisphereLight(0xaebcff, 0x2a1830, 0.95);
  const sun = new THREE.DirectionalLight(0xfff0e0, 2.7);
  sun.position.set(15, 26, 16);
  sun.target.position.set(0, 0, 0);
  const rim = new THREE.DirectionalLight(0x66dcff, 1.25); rim.position.set(-18, 11, -24);
  const fill = new THREE.DirectionalLight(0xffb27a, 0.45); fill.position.set(-12, 6, 22);
  const accent = new THREE.DirectionalLight(NEON.magenta, 0.35); accent.position.set(22, 8, -26);
  const flashLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0);
  group.add(hemi, sun, sun.target, rim, fill, accent, flashLight);
  parts.sun = sun;
  parts.lights = { hemi, sun, rim, fill, accent, flash: flashLight, home: teamLights.home, away: teamLights.away };

  // Caméra d'ombre serrée autour du terrain (+ buts, hauteur des joueurs)
  function fitShadowCamera() {
    const cam = sun.shadow.camera;
    const eye = sun.position.clone(), tgt = sun.target.position.clone();
    const view = new THREE.Matrix4().lookAt(eye, tgt, UP).setPosition(eye).invert();
    const mn = V(Infinity, Infinity, Infinity), mx = V(-Infinity, -Infinity, -Infinity), p = V(0, 0, 0);
    for (const x of [-HL - GOAL_D - 0.6, HL + GOAL_D + 0.6]) for (const y of [0, 3.2]) for (const z of [-HW - 0.4, HW + 0.4]) {
      p.set(x, y, z).applyMatrix4(view); mn.min(p); mx.max(p);
    }
    cam.left = mn.x - 0.5; cam.right = mx.x + 0.5; cam.bottom = mn.y - 0.5; cam.top = mx.y + 0.5;
    cam.near = Math.max(0.5, -mx.z - 8); cam.far = -mn.z + 4;
    cam.updateProjectionMatrix();
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.025;
  }
  fitShadowCamera();

  scene.add(group);

  // ── Qualité à chaud ──
  function setQuality(nq) {
    q = normLevel(nq);
    const hi = atLeast(q, "high"), mid = atLeast(q, "medium");
    crowd.count = Math.min(CROWD_MAX, CROWD[q]);
    crowd.geometry = hi ? crowd.userData.geos.hi : crowd.userData.geos.lo;
    crowdFlashes.visible = mid;
    crowdFlashes.geometry.setDrawRange(0, FLASHES[q]);
    if (sun.castShadow !== hi) sun.castShadow = hi;
    if (hi) {
      const [size, radius] = SHADOW[q];
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
      sun.shadow.radius = radius;
    }
    for (const m of postMeshes) m.castShadow = hi;
    beams.visible = mid;
    beamU.uIntensity.value = q === "ultra" ? 0.17 : hi ? 0.16 : 0.13;
    for (const s of halos) s.scale.setScalar(mid ? 5 : 9);
    haloMat.opacity = mid ? 0.35 : 0.6;
    for (const k of ["home", "away"]) if (teamLights[k]) teamLights[k].visible = mid;
    stars.visible = mid;
    pitchU.uDetail.value = mid ? 1 : 0;
  }
  setQuality(q);

  // ── État animé ──
  let excite = 0, flashI = 0, goalPulse = 0, baseExcite = 0.15, clockT = 0, flashClock = 0, flashRate = 0;
  let goalLed = 0, goalLedT = 0, waveT = -1;
  const cheer = new THREE.Vector2(0, 0);
  const _c1 = new THREE.Color(), _c2 = new THREE.Color();

  function setTeamColors(home, away) {
    for (const [k, col] of [["home", home], ["away", away]]) {
      if (!col) continue;
      for (const m of teamMats[k]) {
        if (m.uniforms?.uGlow) m.uniforms.uGlow.value.set(col);
        else m.color.set(col).multiplyScalar(m.userData.hdr || 1);
      }
      if (teamLights[k]) teamLights[k].color.set(col);
    }
    paintCrowd(home || homeColor, away || awayColor);
    if (home) homeColor = home;
    if (away) awayColor = away;
  }

  // Flash de but : lumière, ola partant du but marqué, joie des supporters, LED « BUT ! », onde sur le terrain.
  // opts.side (+1 = but en x>0, -1 = x<0) ; déduit de la couleur si absent (domicile marque en x>0).
  function flash(color = "#ffffff", opts = {}) {
    flashLight.color.set(color);
    flashLight.groundColor.set(color).multiplyScalar(0.3);
    flashI = 2.2;
    excite = 1;
    goalPulse = 1;
    _c1.set(color);
    const dH = colorDist(_c2.set(homeColor), _c1), dA = colorDist(_c2.set(awayColor), _c1);
    let side = opts.side;
    if (dH < 0.06 && dH <= dA) { cheer.x = 1; side ??= 1; }
    else if (dA < 0.06) { cheer.y = 1; side ??= -1; }
    else cheer.set(0.6, 0.6);
    waveT = 0;
    crowdU.uWaveA0.value = (side ?? 1) >= 0 ? 0 : Math.PI;
    goalLed = 1; goalLedT = 4.5;
    ledMat.uniforms.uGoalColor.value.copy(_c1);
    scrMat.uniforms.uGoalColor.value.copy(_c1);
    pitchU.uPulseColor.value.copy(_c1);
    glassU.uFlashColor.value.copy(_c1);
    flashRate = 1;
  }

  // Impact du ballon dans un filet (side : -1 but gauche/domicile, +1 but droit/extérieur)
  const _lp = new THREE.Vector3();
  function netImpact(side, pos, strength = 1) {
    const n = side < 0 ? nets.home : nets.away;
    if (!n || !pos) return;
    n.group.updateWorldMatrix(true, false);
    _lp.set(pos.x, pos.y, pos.z);
    n.group.worldToLocal(_lp);
    _lp.x = Math.min(HL + GOAL_D, Math.max(HL, _lp.x));
    _lp.y = Math.min(GOAL_H, Math.max(0.1, _lp.y));
    _lp.z = Math.min(GOAL_HW, Math.max(-GOAL_HW, _lp.z));
    const u = n.mat.uniforms;
    u.uImp.value.copy(_lp);
    u.uT.value = 0;
    u.uAmp.value = 0.6 * Math.min(1.6, Math.max(0.25, strength));
  }

  // détection automatique (si update reçoit la position du ballon)
  const prevBall = new THREE.Vector3(); let hasPrev = false;
  function trackBall(b, dt) {
    const spd = hasPrev && dt > 0 ? prevBall.distanceTo(b) / dt : 0;
    prevBall.set(b.x, b.y, b.z); hasPrev = true;
    for (const [key, s] of [["home", -1], ["away", 1]]) {
      const ax = s * b.x, n = nets[key];
      const inside = ax > HL && Math.abs(b.z) < GOAL_HW + 0.1 && b.y < GOAL_H + 0.1;
      const touching = inside && (ax > HL + GOAL_D - 0.2 || Math.abs(b.z) > GOAL_HW - 0.25 || b.y > GOAL_H - 0.25);
      if (touching && n.armed && spd > 1.2) { netImpact(s, b, spd / 14); n.armed = false; }
      else if (!touching) n.armed = true;
    }
  }

  function update(dt, time, ball) {
    dt = Math.min(dt || 0, 0.1);
    clockT += dt;
    if (!Number.isFinite(time)) time = clockT;
    clockU.value = time;
    crowdU.uTime.value = time;
    excite *= Math.exp(-dt * 0.3);
    crowdU.uExcite.value = Math.min(1, baseExcite + excite * 0.8);
    cheer.multiplyScalar(Math.exp(-dt * 0.22));
    crowdU.uCheer.value.copy(cheer);
    if (waveT >= 0) { waveT += dt; if (waveT > 8) waveT = -1; }
    crowdU.uWaveT.value = waveT;
    flashI *= Math.exp(-dt * 2.6);
    flashLight.intensity = flashI;
    goalPulse *= Math.exp(-dt * 1.2);
    flashRate *= Math.exp(-dt * 0.35);
    flashClock += dt * (1 + flashRate * 7);
    flashU.uClock.value = flashClock;
    flashU.uRate.value = flashRate;
    // LED : défilement ; mode « BUT ! » pendant quelques secondes
    ledMat.uniforms.uOffset.value = (ledMat.uniforms.uOffset.value + dt * 0.035) % 1;
    if (goalLedT > 0) goalLedT -= dt; else goalLed = Math.max(0, goalLed - dt * 1.5);
    for (const m of [ledMat, scrMat]) {
      m.uniforms.uGoal.value = goalLed;
      m.uniforms.uTime.value = time;
      m.uniforms.uGoalOffset.value = (m.uniforms.uGoalOffset.value + dt * (m === ledMat ? 0.25 : 0)) % 1;
    }
    const pulse = 0.5 + 0.1 * Math.sin(time * 2.2) + goalPulse * 0.45;
    for (const m of goalPanels) m.opacity = pulse;
    pitchU.uPulse.value = goalPulse > 0.02 ? goalPulse : 0;
    pitchMat.emissiveIntensity = HDR.lines * (1 + goalPulse * 0.8);
    glassU.uFlash.value = flashI * 0.25;
    for (const k of ["home", "away"]) { const u = nets[k].mat.uniforms.uT; u.value = Math.min(99, u.value + dt); }
    if (ball) trackBall(ball, dt);
  }

  // Ambiance de la foule (0..1), en plus des flashs de but
  function setCrowdExcitement(v) { baseExcite = 0.1 + Math.max(0, Math.min(1, v)) * 0.6; }

  function dispose() {
    scene.remove(group);
    disposeTree(group);
    for (const g of Object.values(crowd.userData.geos)) g.dispose();
    for (const t of extraTex) t.dispose();
    scene.fog = prevFog;
    scene.background = prevBg;
  }

  return { group, parts, update, setTeamColors, flash, setCrowdExcitement, setQuality, netImpact, dispose, get quality() { return q; } };
}

function colorDist(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b); }
