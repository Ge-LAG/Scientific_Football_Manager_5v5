// L'Arène du Labo : terrain, cage de verre, buts, tribunes + foule, néons, tours d'éclairage, écran géant.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { NEON, normQuality, rng, makeCanvas, canvasTexture, fadeTexture, disposeTree } from "./util.js";

const HL = 20, HW = 12;                       // demi-longueur / demi-largeur du terrain
const GOAL_HW = 2.5, GOAL_H = 2.2, GOAL_D = 1.2;
const WALL_H = 4;
const ROWS = 7, ROW_D = 0.9, ROW_RISE = 0.5, ROW_H0 = 0.9;

const UP = new THREE.Vector3(0, 1, 0);

// ───────────────────────── Textures générées ─────────────────────────

function hexGrid(g, W, H, r) {
  const hw = Math.sqrt(3) * r, vh = 1.5 * r;
  g.beginPath();
  for (let row = 0, y = 0; y < H + r * 2; row++, y += vh) {
    for (let x = (row % 2) * hw / 2; x < W + hw; x += hw) {
      for (let k = 0; k <= 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
    }
  }
  g.stroke();
}

// Lignes du terrain (appelé sur la texture de base et sur la texture émissive)
function drawMarkings(g, s, glow) {
  const X = x => (x + HL) * s, Z = z => (z + HW) * s;
  const shapes = () => {
    g.beginPath();
    g.rect(X(-HL + 0.12), Z(-HW + 0.12), (2 * HL - 0.24) * s, (2 * HW - 0.24) * s);
    g.moveTo(X(0), Z(-HW)); g.lineTo(X(0), Z(HW));
    g.moveTo(X(3), Z(0)); g.arc(X(0), Z(0), 3 * s, 0, Math.PI * 2);
    for (const side of [-1, 1]) {
      const gx = side * HL, px = side * (HL - 6);
      // surface de réparation (6 m x 12 m)
      g.moveTo(X(gx), Z(-6)); g.lineTo(X(px), Z(-6)); g.lineTo(X(px), Z(6)); g.lineTo(X(gx), Z(6));
      // petite surface (2 m x 7 m)
      const sx = side * (HL - 2);
      g.moveTo(X(gx), Z(-3.5)); g.lineTo(X(sx), Z(-3.5)); g.lineTo(X(sx), Z(3.5)); g.lineTo(X(gx), Z(3.5));
      // arc devant la surface
      const a0 = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.moveTo(X(px) + Math.cos(a0) * 2 * s, Z(0) + Math.sin(a0) * 2 * s);
      g.arc(X(px), Z(0), 2 * s, a0, a0 + Math.PI, false);
    }
    // arcs de coin
    for (const cx of [-HL, HL]) for (const cz of [-HW, HW]) {
      const a = Math.atan2(-cz, -cx);
      g.moveTo(X(cx) + Math.cos(a - Math.PI / 4) * 0.7 * s, Z(cz) + Math.sin(a - Math.PI / 4) * 0.7 * s);
      g.arc(X(cx), Z(cz), 0.7 * s, a - Math.PI / 4, a + Math.PI / 4);
    }
    g.stroke();
    // points (centre + penalty)
    g.beginPath();
    for (const x of [0, -(HL - 6), HL - 6]) { g.moveTo(X(x) + 0.16 * s, Z(0)); g.arc(X(x), Z(0), 0.16 * s, 0, Math.PI * 2); }
    g.fill();
  };
  g.save();
  g.lineCap = "round"; g.lineJoin = "round";
  // halo cyan
  g.strokeStyle = "rgba(0,240,255,0.55)"; g.fillStyle = "rgba(0,240,255,0.55)";
  g.lineWidth = 0.24 * s; g.shadowColor = NEON.cyan; g.shadowBlur = (glow ? 0.9 : 0.6) * s;
  shapes();
  // cœur blanc net
  g.shadowBlur = 0.15 * s; g.shadowColor = "#bffcff";
  g.strokeStyle = "rgba(240,255,255,0.97)"; g.fillStyle = "rgba(240,255,255,0.97)";
  g.lineWidth = 0.1 * s;
  shapes();
  // emblème atomique au centre
  g.shadowBlur = 0.4 * s; g.shadowColor = NEON.cyan;
  g.strokeStyle = glow ? "rgba(0,240,255,0.45)" : "rgba(0,240,255,0.35)";
  g.lineWidth = 0.06 * s;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.ellipse(X(0), Z(0), 2.2 * s, 0.75 * s, (k * Math.PI) / 3, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = glow ? "rgba(255,0,229,0.7)" : "rgba(255,0,229,0.55)"; g.shadowColor = NEON.magenta;
  g.beginPath(); g.arc(X(0), Z(0), 0.34 * s, 0, Math.PI * 2); g.fill();
  g.restore();
}

function pitchTextures(q) {
  const W = q === "low" ? 1024 : 2048, H = Math.round(W * 0.6), s = W / (2 * HL);
  const base = makeCanvas(W, H), g = base.getContext("2d");
  g.fillStyle = "#052119"; g.fillRect(0, 0, W, H);
  // bandes de tonte (4 m)
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 ? "rgba(30,110,88,0.35)" : "rgba(0,0,0,0.12)";
    g.fillRect(i * 4 * s, 0, 4 * s, H);
  }
  // bruit de gazon
  const r = rng(42);
  for (let i = 0; i < W * 3; i++) {
    const v = r();
    g.fillStyle = v > 0.5 ? "rgba(90,255,210,0.035)" : "rgba(0,0,0,0.12)";
    g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
  // grille hexagonale holographique
  g.strokeStyle = "rgba(0,240,255,0.035)"; g.lineWidth = Math.max(1, s * 0.025);
  hexGrid(g, W, H, 0.9 * s);
  // vignettage
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  drawMarkings(g, s, false);

  const emi = makeCanvas(W, H), e = emi.getContext("2d");
  e.fillStyle = "#000"; e.fillRect(0, 0, W, H);
  e.strokeStyle = "rgba(0,240,255,0.012)"; e.lineWidth = Math.max(1, s * 0.025);
  hexGrid(e, W, H, 0.9 * s);
  drawMarkings(e, s, true);

  const map = canvasTexture(base, { aniso: 8 });
  const emissiveMap = canvasTexture(emi, { aniso: 8 });
  return { map, emissiveMap };
}

function apronTexture() {
  const c = makeCanvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#07070e"; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(139,92,246,0.22)"; g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  g.strokeStyle = "rgba(139,92,246,0.08)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  const t = canvasTexture(c, { aniso: 8 });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function glassTexture() {
  const c = makeCanvas(256, 256), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "rgba(160,235,255,0.20)");
  gr.addColorStop(0.08, "rgba(160,235,255,0.07)");
  gr.addColorStop(0.5, "rgba(160,235,255,0.025)");
  gr.addColorStop(0.9, "rgba(160,235,255,0.09)");
  gr.addColorStop(1, "rgba(160,235,255,0.28)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(160,235,255,0.03)"; g.lineWidth = 1;
  hexGrid(g, 256, 256, 18);
  // reflet diagonal
  g.fillStyle = "rgba(255,255,255,0.035)";
  g.beginPath(); g.moveTo(40, 0); g.lineTo(90, 0); g.lineTo(30, 256); g.lineTo(-20, 256); g.fill();
  const t = canvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Bandeau LED défilant
function ledTexture() {
  const W = 2048, H = 128, c = makeCanvas(W, H), g = c.getContext("2d");
  g.fillStyle = "#04040a"; g.fillRect(0, 0, W, H);
  const items = [
    ["LAB LEAGUE", NEON.cyan], ["L'ARÈNE DU LABO", NEON.magenta], ["E = mc²", NEON.lime],
    ["SCIENTIFIC FOOTBALL 5v5", NEON.gold], ["∫ BUT · dt", NEON.coral], ["H₂O · NaCl · ADN", NEON.violet],
  ];
  let size = 64, widths, total;
  const measure = () => {
    g.font = `900 ${size}px "Segoe UI", "Arial Black", Arial, sans-serif`;
    widths = items.map(([t]) => g.measureText(t).width);
    total = widths.reduce((a, b) => a + b, 0);
  };
  measure();
  while (total > W * 0.82 && size > 30) { size -= 2; measure(); }
  const gap = (W - total) / items.length;
  let x = gap / 2;
  g.textBaseline = "middle";
  items.forEach(([t, col], i) => {
    g.shadowColor = col; g.shadowBlur = 18; g.fillStyle = col;
    g.fillText(t, x, H / 2 + 4);
    g.shadowBlur = 0; g.fillStyle = "rgba(255,255,255,0.6)";
    g.beginPath(); g.arc(x + widths[i] + gap / 2, H / 2, 5, 0, Math.PI * 2); g.fill();
    x += widths[i] + gap;
  });
  // trame LED
  g.fillStyle = "rgba(0,0,0,0.35)";
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  for (let xx = 0; xx < W; xx += 4) g.fillRect(xx, 0, 1, H);
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
  g.font = `900 120px "Segoe UI", "Arial Black", Arial, sans-serif`;
  g.shadowColor = NEON.cyan; g.shadowBlur = 30; g.fillStyle = "#bff9ff";
  g.fillText("LAB LEAGUE", W / 2, H * 0.42);
  g.font = `700 44px "Segoe UI", Arial, sans-serif`;
  g.shadowColor = NEON.magenta; g.fillStyle = NEON.magenta;
  g.fillText("L'ARÈNE DU LABO", W / 2, H * 0.72);
  g.shadowBlur = 0; g.fillStyle = "rgba(0,0,0,0.25)";
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  return canvasTexture(c, { aniso: 4 });
}

function lampTexture() {
  const W = 256, H = 128, c = makeCanvas(W, H), g = c.getContext("2d");
  g.fillStyle = "#0b0b12"; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
    const x = 24 + i * 41.5, y = 22 + j * 42;
    const rg = g.createRadialGradient(x, y, 0, x, y, 19);
    rg.addColorStop(0, "#ffffff"); rg.addColorStop(0.5, "#dff8ff"); rg.addColorStop(1, "rgba(120,220,255,0)");
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, 19, 0, Math.PI * 2); g.fill();
  }
  return canvasTexture(c);
}

function skyTexture() {
  const c = makeCanvas(4, 256), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#050508"); gr.addColorStop(0.42, "#07061a"); gr.addColorStop(0.5, "#160a30");
  gr.addColorStop(0.56, "#07061a"); gr.addColorStop(1, "#050508");
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return canvasTexture(c);
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

function boxAt(w, h, d, x, y, z) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

// Plan orienté (normale donnée), largeur le long de cross(up, normal)
function planeFacing(w, h, center, normal, uvScaleX = 1, uvRange = null) {
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, uv.getX(i) * uvScaleX);
    if (uvRange) uv.setY(i, uvRange[0] + uv.getY(i) * (uvRange[1] - uvRange[0]));
  }
  const n = normal.clone().normalize();
  const xAxis = new THREE.Vector3().crossVectors(UP, n).normalize();
  _m.makeBasis(xAxis, UP, n).setPosition(center);
  geo.applyMatrix4(_m);
  return geo;
}

function V(x, y, z) { return new THREE.Vector3(x, y, z); }

// ───────────────────────── Stade ─────────────────────────

export function createStadium(scene, { quality = "high", homeColor = NEON.coral, awayColor = NEON.cyan } = {}) {
  const q = normQuality(quality);
  const group = new THREE.Group();
  group.name = "stadium";
  const parts = {};
  const prevFog = scene.fog, prevBg = scene.background;
  scene.background = new THREE.Color(NEON.bg);
  scene.fog = new THREE.Fog(NEON.bg, 70, 190);

  const stripGeos = [];   // barres néon fusionnées (couleurs par sommet)
  const addStrip = g => stripGeos.push(g);

  // ── Terrain ──
  const { map: pitchMap, emissiveMap: pitchEmi } = pitchTextures(q);
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * HL, 2 * HW).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      map: pitchMap, emissiveMap: pitchEmi, emissive: 0xffffff, emissiveIntensity: 0.85,
      roughness: 0.62, metalness: 0.15,
    }),
  );
  pitch.receiveShadow = true;
  pitch.name = "pitch";
  group.add(pitch);
  parts.pitch = pitch;

  // Parvis autour du terrain
  const apronTex = apronTexture();
  apronTex.repeat.set(80 / 2, 64 / 2);
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 64).rotateX(-Math.PI / 2).translate(0, -0.015, 0),
    new THREE.MeshStandardMaterial({ map: apronTex, roughness: 0.55, metalness: 0.4, color: 0x9a9ab0 }),
  );
  apron.receiveShadow = true;
  group.add(apron);

  // ── Cage de verre ──
  const glassGeos = [];
  const panel = (w, h, cx, cy, cz, normal, uvRange) =>
    glassGeos.push(planeFacing(w, h, V(cx, cy + h / 2, cz), normal, w / 4, uvRange));
  for (const sz of [-1, 1]) panel(2 * HL, WALL_H, 0, 0, sz * HW, V(0, 0, -sz));
  const segLen = HW - GOAL_HW, segC = (HW + GOAL_HW) / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) panel(segLen, WALL_H, sx * HL, 0, sz * segC, V(-sx, 0, 0));
    panel(2 * GOAL_HW, WALL_H - GOAL_H, sx * HL, GOAL_H, 0, V(-sx, 0, 0), [GOAL_H / WALL_H, 1]);
  }
  const glass = new THREE.Mesh(
    mergeGeometries(glassGeos),
    new THREE.MeshBasicMaterial({
      map: glassTexture(), color: 0x8feaff, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }),
  );
  glass.renderOrder = 2;
  glass.name = "glass";
  group.add(glass);
  parts.glass = glass;

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
      new THREE.MeshStandardMaterial({ color: 0x1a2030, emissive: NEON.cyan, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.4 }),
      pos.length,
    );
    pos.forEach(([x, z], i) => { _m.makeTranslation(x, WALL_H / 2, z); mull.setMatrixAt(i, _m); });
    group.add(mull);
  }

  // ── Buts ──
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe6fdff, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.3 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b8, roughness: 0.4, metalness: 0.7 });
  const netMat = new THREE.LineBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.38, depthWrite: false });
  const netGeo = (() => {
    const p = [], st = 0.22, x0 = HL, x1 = HL + GOAL_D;
    const seg = (a, b, c, d, e, f) => p.push(a, b, c, d, e, f);
    for (let z = -GOAL_HW; z <= GOAL_HW + 1e-6; z += st) seg(x1, 0, z, x1, GOAL_H, z);
    for (let y = 0; y <= GOAL_H + 1e-6; y += st) seg(x1, y, -GOAL_HW, x1, y, GOAL_HW);
    for (const sz of [-1, 1]) {
      for (let x = x0; x <= x1 + 1e-6; x += st) seg(x, 0, sz * GOAL_HW, x, GOAL_H, sz * GOAL_HW);
      for (let y = 0; y <= GOAL_H + 1e-6; y += st) seg(x0, y, sz * GOAL_HW, x1, y, sz * GOAL_HW);
    }
    for (let z = -GOAL_HW; z <= GOAL_HW + 1e-6; z += st) seg(x0, GOAL_H, z, x1, GOAL_H, z);
    for (let x = x0; x <= x1 + 1e-6; x += st) seg(x, GOAL_H, -GOAL_HW, x, GOAL_H, GOAL_HW);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    return g;
  })();
  const postGeo = (() => {
    const r = 0.06, gs = [];
    for (const sz of [-1, 1]) gs.push(new THREE.CylinderGeometry(r, r, GOAL_H + r, 14).translate(HL, (GOAL_H + r) / 2, sz * GOAL_HW));
    gs.push(new THREE.CylinderGeometry(r, r, 2 * GOAL_HW + 2 * r, 14).rotateX(Math.PI / 2).translate(HL, GOAL_H, 0));
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
  function buildGoal(side /* -1 domicile, +1 extérieur */, key, color) {
    const g = new THREE.Group();
    if (side < 0) g.rotation.y = Math.PI;
    const posts = new THREE.Mesh(postGeo, postMat); posts.castShadow = q === "high";
    g.add(posts, new THREE.Mesh(frameGeo, frameMat), new THREE.LineSegments(netGeo, netMat));
    // panneau lumineux derrière le filet
    const glowMat = new THREE.MeshBasicMaterial({
      map: fadeTexture(), color, transparent: true, opacity: 0.55, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    const glowPanel = new THREE.Mesh(planeFacing(7, 3.2, V(HL + GOAL_D + 0.25, 1.6, 0), V(-1, 0, 0)), glowMat);
    glowPanel.renderOrder = 3;
    g.add(glowPanel);
    goalPanels.push(glowMat);
    // zone lumineuse au sol dans le but
    const floorMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_D, 2 * GOAL_HW).rotateX(-Math.PI / 2).translate(HL + GOAL_D / 2, 0.012, 0), floorMat);
    g.add(floor);
    // barres néon à la couleur de l'équipe (cadre arrière + haut du mur derrière)
    const stripMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const tg = [];
    const xb = HL + GOAL_D + 0.08, t = 0.11;
    for (const sz of [-1, 1]) tg.push(bar(V(xb, 0, sz * (GOAL_HW + 0.1)), V(xb, GOAL_H + 0.1, sz * (GOAL_HW + 0.1)), t));
    tg.push(bar(V(xb, GOAL_H + 0.1, -GOAL_HW - 0.1), V(xb, GOAL_H + 0.1, GOAL_HW + 0.1), t));
    tg.push(bar(V(xb, 0.04, -GOAL_HW - 0.1), V(xb, 0.04, GOAL_HW + 0.1), t));
    tg.push(bar(V(HL + 0.02, 0.02, -GOAL_HW), V(HL + 0.02, 0.02, GOAL_HW), 0.05)); // ligne de but
    for (const sz of [-1, 1]) tg.push(bar(V(HL, WALL_H - 0.12, sz * (GOAL_HW + 0.2)), V(HL, WALL_H - 0.12, sz * 8), 0.09));
    g.add(new THREE.Mesh(mergeGeometries(tg), stripMat));
    teamMats[key].push(glowMat, floorMat, stripMat);
    if (q !== "low") {
      const L = new THREE.PointLight(color, 14, 11, 2);
      L.position.set(HL + GOAL_D + 0.4, 1.8, 0);
      g.add(L);
      teamLights[key] = L;
    }
    group.add(g);
    return g;
  }
  parts.homeGoal = buildGoal(-1, "home", homeColor);
  parts.awayGoal = buildGoal(1, "away", awayColor);

  // ── Tribunes ──
  const stands = [
    // origine (bord avant), axe le long, normale vers l'extérieur, longueur
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
      // places de la foule
      for (let u = -st.len / 2 + 0.45; u <= st.len / 2 - 0.45; u += 0.56) slots.push({ p: P(st, u, (i + 0.62) * ROW_D, top), n: st.n, x: 0, row: i });
    }
    // mur du fond + écran LED
    const backH = topRowY + 3.4;
    standGeos.push(place(new THREE.BoxGeometry(st.len, backH, 0.4), 0, backH / 2, backD + 0.2));
    ledGeos.push(planeFacing(st.len, 1.1, P(st, 0, backD - 0.02, topRowY + 2.2), st.n.clone().negate(), st.len / (16 * 1.1)));
    addStrip(bar(P(st, -st.len / 2, backD - 0.05, backH), P(st, st.len / 2, backD - 0.05, backH), 0.09, NEON.cyan));
    addStrip(bar(P(st, -st.len / 2, backD - 0.05, topRowY + 1.55), P(st, st.len / 2, backD - 0.05, topRowY + 1.55), 0.05, NEON.magenta));
    // panneaux LED bas (devant la première rangée)
    ledGeos.push(planeFacing(st.len, 0.6, P(st, 0, -0.03, 0.32), st.n.clone().negate(), st.len / (16 * 0.6)));
    addStrip(bar(P(st, -st.len / 2, -0.05, 0.64), P(st, st.len / 2, -0.05, 0.64), 0.04, NEON.cyan));
  }
  const standMesh = new THREE.Mesh(mergeGeometries(standGeos), new THREE.MeshStandardMaterial({ color: 0x10121e, roughness: 0.8, metalness: 0.25 }));
  standMesh.receiveShadow = q === "high";
  group.add(standMesh);
  const ledTex = ledTexture();
  const led = new THREE.Mesh(mergeGeometries(ledGeos), new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: false }));
  group.add(led);
  parts.stands = standMesh;

  // ── Foule ──
  const crowdCount = { high: 1600, medium: 700, low: 200 }[q];
  const crowdUniforms = { uTime: { value: 0 }, uExcite: { value: 0.15 } };
  const crowd = (() => {
    const r = rng(1234);
    // remplissage prioritaire des premiers rangs (qualité basse = moins de spectateurs)
    for (const s of slots) s.k = s.row + r() * ROWS * (q === "high" ? 4 : 0.9);
    slots.sort((a, b) => a.k - b.k);
    const n = Math.min(crowdCount, slots.length);
    let geo;
    if (q === "low") {
      geo = mergeGeometries([
        new THREE.BoxGeometry(0.4, 0.95, 0.3).translate(0, 0.48, 0),
        new THREE.BoxGeometry(0.24, 0.26, 0.24).translate(0, 1.15, 0),
        new THREE.BoxGeometry(0.1, 0.42, 0.1).translate(0.27, 0.66, 0),
        new THREE.BoxGeometry(0.1, 0.42, 0.1).translate(-0.27, 0.66, 0),
      ]);
    } else {
      geo = mergeGeometries([
        new THREE.CylinderGeometry(0.2, 0.17, 0.95, 7).translate(0, 0.475, 0),
        new THREE.IcosahedronGeometry(0.14, 0).translate(0, 1.14, 0),
        new THREE.BoxGeometry(0.1, 0.42, 0.1).translate(0.265, 0.66, 0),
        new THREE.BoxGeometry(0.1, 0.42, 0.1).translate(-0.265, 0.66, 0),
      ].map(g => (g.index ? g.toNonIndexed() : g)));
    }
    const phase = new Float32Array(n);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = crowdUniforms.uTime;
      sh.uniforms.uExcite = crowdUniforms.uExcite;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
          attribute float aPhase; uniform float uTime; uniform float uExcite;
          varying float vHead; varying float vSkin;`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float rnd = fract(aPhase * 7.13);
          vHead = step(0.985, position.y) * step(abs(position.x), 0.2);
          vSkin = fract(aPhase * 3.31);
          float raise = clamp(uExcite * 1.5 - rnd * 0.55, 0.0, 1.0) * (0.8 + 0.2 * sin(uTime * 6.0 + aPhase * 4.0));
          if (abs(position.x) > 0.205) {
            float sd = sign(position.x);
            vec2 piv = vec2(0.265 * sd, 0.86);
            vec2 d = position.xy - piv;
            float a = raise * 2.7 * sd;
            float c = cos(a), s = sin(a);
            transformed.xy = piv + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
          }
          float jump = max(0.0, sin(uTime * (3.0 + rnd * 3.5) + aPhase * 6.2831));
          transformed.y += jump * (0.025 + uExcite * 0.34 * step(0.3, rnd));`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          varying float vHead; varying float vSkin;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.86, 0.58, 0.41), vec3(0.11, 0.045, 0.02), vSkin), vHead);`);
    };
    mat.customProgramCacheKey = () => "labCrowd";
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
    geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
    mesh.userData.slots = slots.slice(0, n);
    mesh.frustumCulled = false;
    return mesh;
  })();
  group.add(crowd);
  parts.crowd = crowd;

  const neutralCols = ["#e8e8f0", "#2a2a38", "#8B5CF6", "#FFD700", "#B8FF00", "#555566", "#FF00E5"];
  function paintCrowd(home, away) {
    const r = rng(99), c = new THREE.Color(), sl = crowd.userData.slots;
    for (let i = 0; i < crowd.count; i++) {
      const x = sl[i].x, v = r();
      const pHome = 0.5 - Math.tanh(x / 12) * 0.42;
      let col;
      if (v < 0.78) col = r() < pHome ? home : away;
      else col = neutralCols[Math.floor(r() * neutralCols.length)];
      c.set(col).multiplyScalar(0.55 + r() * 0.35);
      crowd.setColorAt(i, c);
    }
    crowd.instanceColor.needsUpdate = true;
  }
  paintCrowd(homeColor, awayColor);

  // ── Tours d'éclairage ──
  const lampTex = lampTexture();
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x151826, roughness: 0.5, metalness: 0.7 });
  const lampMat = new THREE.MeshBasicMaterial({ map: lampTex, toneMapped: false });
  const beamMat = new THREE.MeshBasicMaterial({
    map: fadeTexture(), color: 0xbfefff, transparent: true, opacity: 0.05, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const towerH = 17;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const base = V(sx * 26.5, 0, sz * 18.5);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.8, towerH, 0.8).translate(base.x, towerH / 2, base.z), towerMat);
    group.add(t);
    const inward = V(-sx, 0, -sz).normalize();
    const sp = base.clone().addScaledVector(inward, 0.45);
    addStrip(bar(sp.clone().setY(0.2), sp.clone().setY(towerH - 1), 0.1, sx * sz > 0 ? NEON.magenta : NEON.cyan));
    const head = new THREE.Group();
    head.position.set(base.x, towerH + 0.8, base.z);
    const target = V(sx * 9, 0, sz * 4);
    head.lookAt(target);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2, 0.5), towerMat);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.7), lampMat);
    lamp.position.z = 0.26;
    head.add(frame, lamp);
    group.add(head);
    if (q !== "low") {
      const from = head.position.clone(), dir = from.clone().sub(target), len = dir.length();
      const cone = new THREE.CylinderGeometry(1.5, 8, len, 24, 1, true);
      const uv = cone.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      const beam = new THREE.Mesh(cone, beamMat);
      beam.position.copy(from).add(target).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(UP, dir.normalize());
      beam.renderOrder = 4;
      group.add(beam);
    }
  }

  // ── Écran géant (cadre) au-dessus du milieu ──
  const jumbo = new THREE.Group();
  jumbo.position.set(0, 13, 0);
  {
    const W = 7, H = 2.8, D = 4;
    jumbo.add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, H + 0.3, D + 0.3), towerMat));
    const scrTex = screenTexture();
    const scrMat = new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false, color: 0xcccccc });
    const scr = [];
    for (const s of [-1, 1]) {
      scr.push(planeFacing(W, H, V(0, 0, s * (D / 2 + 0.16)), V(0, 0, s)));
      scr.push(planeFacing(D, H, V(s * (W / 2 + 0.16), 0, 0), V(s, 0, 0)));
    }
    jumbo.add(new THREE.Mesh(mergeGeometries(scr), scrMat));
    const jg = [], w = W / 2 + 0.17, h = H / 2 + 0.17, d = D / 2 + 0.17;
    for (const y of [-h, h]) for (const s of [-1, 1]) {
      jg.push(bar(V(-w, y, s * d), V(w, y, s * d), 0.08, NEON.cyan));
      jg.push(bar(V(s * w, y, -d), V(s * w, y, d), 0.08, NEON.cyan));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) jg.push(bar(V(sx * w, -h, sz * d), V(sx * w, h, sz * d), 0.08, NEON.magenta));
    // anneau inférieur + câbles
    jg.push(colorize(new THREE.TorusGeometry(1.4, 0.06, 6, 40).rotateX(Math.PI / 2).translate(0, -h - 0.35, 0), NEON.magenta));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) jg.push(bar(V(sx * (w - 0.3), h, sz * (d - 0.3)), V(sx * 2.5, 40, sz * 2), 0.03, "#3a3f55"));
    jumbo.add(new THREE.Mesh(mergeGeometries(jg), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  }
  group.add(jumbo);
  parts.jumbotron = jumbo;

  // Barres néon au sol autour de la cage
  for (const sz of [-1, 1]) addStrip(bar(V(-HL - 1, 0.01, sz * (HW + 0.7)), V(HL + 1, 0.01, sz * (HW + 0.7)), 0.06, NEON.violet));

  const strips = new THREE.Mesh(mergeGeometries(stripGeos), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  strips.name = "neonStrips";
  group.add(strips);

  // ── Ciel ──
  if (q !== "low") {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(220, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    sky.renderOrder = -10;
    group.add(sky);
    const r = rng(5), n = q === "high" ? 900 : 450, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(0.15 + r() * 0.85);
      p[i * 3] = 200 * Math.sin(ph) * Math.cos(th);
      p[i * 3 + 1] = 200 * Math.cos(ph);
      p[i * 3 + 2] = 200 * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(p, 3));
    group.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xaab8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 })));
  }

  // ── Éclairage ──
  const hemi = new THREE.HemisphereLight(0xc4ccff, 0x2a1830, 1.05);
  const sun = new THREE.DirectionalLight(0xfff4ea, 2.4);
  sun.position.set(14, 32, 18);
  sun.target.position.set(0, 0, 0);
  if (q === "high") {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -28; c.right = 28; c.top = 22; c.bottom = -22; c.near = 5; c.far = 90;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
  }
  const rimA = new THREE.DirectionalLight(NEON.magenta, 0.45); rimA.position.set(-22, 9, -26);
  const rimB = new THREE.DirectionalLight(NEON.cyan, 0.3); rimB.position.set(22, 9, -26);
  const flashLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0);
  group.add(hemi, sun, sun.target, rimA, rimB, flashLight);
  parts.sun = sun;

  scene.add(group);

  // ── État animé ──
  let excite = 0, flashI = 0, goalPulse = 0, baseExcite = 0.15, clockT = 0;

  function setTeamColors(home, away) {
    for (const [k, col] of [["home", home], ["away", away]]) {
      if (!col) continue;
      for (const m of teamMats[k]) m.color.set(col);
      if (teamLights[k]) teamLights[k].color.set(col);
    }
    paintCrowd(home || homeColor, away || awayColor);
    if (home) homeColor = home;
    if (away) awayColor = away;
  }

  function flash(color = "#ffffff") {
    flashLight.color.set(color);
    flashLight.groundColor.set(color).multiplyScalar(0.3);
    flashI = 2.2;
    excite = 1;
    goalPulse = 1;
  }

  function update(dt, time) {
    dt = Math.min(dt || 0, 0.1);
    clockT += dt;
    if (!Number.isFinite(time)) time = clockT;
    crowdUniforms.uTime.value = time;
    excite *= Math.exp(-dt * 0.3);
    crowdUniforms.uExcite.value = Math.min(1, baseExcite + excite);
    flashI *= Math.exp(-dt * 2.6);
    flashLight.intensity = flashI;
    goalPulse *= Math.exp(-dt * 1.2);
    ledTex.offset.x = (ledTex.offset.x + dt * 0.035) % 1;
    const pulse = 0.8 + 0.15 * Math.sin(time * 2.2) + goalPulse * 0.6;
    for (const m of goalPanels) m.opacity = pulse;
  }

  // Ambiance de la foule (0..1), en plus des flashs de but
  function setCrowdExcitement(v) { baseExcite = 0.1 + Math.max(0, Math.min(1, v)) * 0.6; }

  function dispose() {
    scene.remove(group);
    disposeTree(group);
    scene.fog = prevFog;
    scene.background = prevBg;
  }

  return { group, parts, update, setTeamColors, flash, setCrowdExcitement, dispose };
}
