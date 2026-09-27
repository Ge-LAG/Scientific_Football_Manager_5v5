// Effets visuels poolés : particules lumineuses, étincelles filantes, confettis (physique « papier »), serpentins,
// ondes au sol, dôme de choc, feux d'artifice, bouffées de poussière, flashs, lignes de vitesse (option).
// Tout est pré-alloué : aucune allocation par effet déclenché.
import * as THREE from "three";
import { glowTexture, ringTexture, NEON, clamp, makeCanvas, canvasTexture } from "./util.js";
import { normLevel } from "../render/quality.js";

const CONFETTI_COLS = [NEON.cyan, NEON.magenta, NEON.lime, NEON.gold, "#ffffff", NEON.coral, NEON.violet];
const POOLS = {
  low: { p: 400, c: 80, s: 90, d: 48, st: 6, scale: 0.35 },
  medium: { p: 1000, c: 200, s: 200, d: 96, st: 12, scale: 0.6 },
  high: { p: 1800, c: 360, s: 340, d: 160, st: 22, scale: 1 },
  ultra: { p: 2400, c: 480, s: 440, d: 200, st: 28, scale: 1.2 },
};
const STREAMER_SEG = 14, STREAMER_LEN = 0.11;

// Bouffée de fumée douce (bords irréguliers)
function puffTexture() {
  const S = 128, c = makeCanvas(S, S), g = c.getContext("2d");
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, r = i === 0 ? 0 : 18 + (i % 3) * 5;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, R = i === 0 ? 50 : 30 + (i % 2) * 8;
    const gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, "rgba(255,255,255,0.55)"); gr.addColorStop(0.6, "rgba(255,255,255,0.18)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  return canvasTexture(c);
}

export function createEffects(scene, { quality = "high" } = {}) {
  let q = normLevel(quality);
  const pool = POOLS[q];
  const MAXP = pool.p, MAXC = pool.c, MAXS = pool.s, MAXD = pool.d, NST = pool.st;
  let SCALE = pool.scale;
  const root = new THREE.Group();
  root.name = "effects";
  scene.add(root);
  const _c = new THREE.Color(), _c2 = new THREE.Color();
  const disposables = [];

  // ── Particules lumineuses (Points additifs) ──
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3), pSize = new Float32Array(MAXP);
  const vel = new Float32Array(MAXP * 3), base = new Float32Array(MAXP * 3);
  const life = new Float32Array(MAXP), maxLife = new Float32Array(MAXP), bSize = new Float32Array(MAXP);
  const grav = new Float32Array(MAXP), drag = new Float32Array(MAXP);
  let pCursor = 0, pAlive = 0;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute("aSize", new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
  const pMat = new THREE.PointsMaterial({
    size: 1, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  pMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSize;")
      .replace("gl_PointSize = size;", "gl_PointSize = size * aSize;");
  };
  pMat.customProgramCacheKey = () => "labFxPoints";
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.renderOrder = 8;
  root.add(points);
  disposables.push(pGeo, pMat);

  function spawn(x, y, z, vx, vy, vz, r, g, b, size, lifeS, gravity, dragK) {
    const i = pCursor;
    pCursor = (pCursor + 1) % MAXP;
    const o = i * 3;
    pPos[o] = x; pPos[o + 1] = y; pPos[o + 2] = z;
    vel[o] = vx; vel[o + 1] = vy; vel[o + 2] = vz;
    base[o] = r; base[o + 1] = g; base[o + 2] = b;
    bSize[i] = size; life[i] = lifeS; maxLife[i] = lifeS;
    grav[i] = gravity; drag[i] = dragK;
  }

  function burst(pos, colorHex = "#ffffff", { count = 30, speed = 4, size = 0.35, gravity = 6, life: lf = 0.8, up = 0.4, drag: dk = 1.2, spread = 1, bright = 1.3 } = {}) {
    _c.set(colorHex);
    const n = Math.max(1, Math.round(count * SCALE));
    for (let k = 0; k < n; k++) {
      // direction aléatoire sur la sphère, biaisée vers le haut
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const sp = speed * (0.35 + Math.random() * 0.65);
      const dx = s * Math.cos(a) * spread, dz = s * Math.sin(a) * spread, dy = u * spread + up;
      const br = bright * (0.7 + Math.random() * 0.5);
      spawn(pos.x, pos.y, pos.z, dx * sp, dy * sp, dz * sp, _c.r * br, _c.g * br, _c.b * br,
        size * (0.6 + Math.random() * 0.8), lf * (0.6 + Math.random() * 0.6), gravity, dk);
    }
    pAlive = MAXP;
  }

  // ── Étincelles filantes (segments étirés le long de la vitesse) ──
  const sHead = new Float32Array(MAXS * 3), sVel = new Float32Array(MAXS * 3), sBase = new Float32Array(MAXS * 3);
  const sLife = new Float32Array(MAXS), sMax = new Float32Array(MAXS), sGrav = new Float32Array(MAXS), sDrag = new Float32Array(MAXS), sStretch = new Float32Array(MAXS);
  const sPos = new Float32Array(MAXS * 6), sCol = new Float32Array(MAXS * 6);
  let sCursor = 0, sAny = false;
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute("color", new THREE.BufferAttribute(sCol, 3).setUsage(THREE.DynamicDrawUsage));
  const sMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparkLines = new THREE.LineSegments(sGeo, sMat);
  sparkLines.frustumCulled = false; sparkLines.renderOrder = 8;
  root.add(sparkLines);
  disposables.push(sGeo, sMat);

  function spark(x, y, z, vx, vy, vz, r, g, b, lifeS, gravity, dragK, stretch) {
    const i = sCursor; sCursor = (sCursor + 1) % MAXS;
    const o = i * 3;
    sHead[o] = x; sHead[o + 1] = y; sHead[o + 2] = z;
    sVel[o] = vx; sVel[o + 1] = vy; sVel[o + 2] = vz;
    sBase[o] = r; sBase[o + 1] = g; sBase[o + 2] = b;
    sLife[i] = lifeS; sMax[i] = lifeS; sGrav[i] = gravity; sDrag[i] = dragK; sStretch[i] = stretch;
    sAny = true;
  }

  function sparks(pos, colorHex = "#ffffff", { count = 24, speed = 9, up = 0.3, life: lf = 0.55, gravity = 9, drag: dk = 1.4, spread = 1, dir = null, bright = 2.6, stretch = 0.035 } = {}) {
    _c.set(colorHex);
    const n = Math.max(1, Math.round(count * SCALE));
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      let dx = s * Math.cos(a) * spread, dy = u * spread + up, dz = s * Math.sin(a) * spread;
      if (dir) { dx += dir.x; dy += dir.y; dz += dir.z; }
      const sp = speed * (0.45 + Math.random() * 0.55);
      const br = bright * (0.6 + Math.random() * 0.6);
      // cœur blanc chaud pour une partie des étincelles
      const w = Math.random() < 0.3 ? 0.6 : 0;
      spark(pos.x, pos.y, pos.z, dx * sp, dy * sp, dz * sp,
        (_c.r + (1 - _c.r) * w) * br, (_c.g + (1 - _c.g) * w) * br, (_c.b + (1 - _c.b) * w) * br,
        lf * (0.6 + Math.random() * 0.7), gravity, dk, stretch);
    }
  }

  // ── Confettis (instanciés, éclairés : scintillent en tournant) ──
  const cGeo = new THREE.PlaneGeometry(0.13, 0.08);
  const cMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  cMat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.45;");
  };
  cMat.customProgramCacheKey = () => "labConfetti";
  const confetti = new THREE.InstancedMesh(cGeo, cMat, MAXC);
  confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  confetti.frustumCulled = false;
  const cPos = new Float32Array(MAXC * 3), cVel = new Float32Array(MAXC * 3), cRot = new Float32Array(MAXC * 3), cSpin = new Float32Array(MAXC * 3);
  const cLife = new Float32Array(MAXC), cPhase = new Float32Array(MAXC), cFlut = new Float32Array(MAXC);
  let cCursor = 0, cAny = false;
  const dummy = new THREE.Object3D();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAXC; i++) { confetti.setMatrixAt(i, ZERO); confetti.setColorAt(i, _c.set("#ffffff")); }
  root.add(confetti);
  disposables.push(cGeo, cMat);

  /** Confettis : canon (dir) ou gerbe. */
  function confettiBurst(pos, colorHex, count, { dir = null, speed = 1, spread = 1 } = {}) {
    const n = Math.min(MAXC, Math.round(count * SCALE));
    for (let k = 0; k < n; k++) {
      const i = cCursor;
      cCursor = (cCursor + 1) % MAXC;
      const o = i * 3, a = Math.random() * Math.PI * 2, r = (2 + Math.random() * 6) * spread;
      cPos[o] = pos.x + (Math.random() - 0.5) * 1.2; cPos[o + 1] = pos.y + 0.3 + Math.random() * 1.2; cPos[o + 2] = pos.z + (Math.random() - 0.5) * 1.2;
      if (dir) {
        const sp = (9 + Math.random() * 7) * speed;
        cVel[o] = dir.x * sp + Math.cos(a) * r * 0.35; cVel[o + 1] = dir.y * sp + Math.random() * 2; cVel[o + 2] = dir.z * sp + Math.sin(a) * r * 0.35;
      } else {
        cVel[o] = Math.cos(a) * r * speed; cVel[o + 1] = (5 + Math.random() * 8) * speed; cVel[o + 2] = Math.sin(a) * r * speed;
      }
      for (let j = 0; j < 3; j++) { cRot[o + j] = Math.random() * 6.28; cSpin[o + j] = (Math.random() - 0.5) * 14; }
      cLife[i] = 3.5 + Math.random() * 3;
      cPhase[i] = Math.random() * 6.28;
      cFlut[i] = 0.7 + Math.random() * 0.8;
      const col = Math.random() < 0.45 ? colorHex : CONFETTI_COLS[Math.floor(Math.random() * CONFETTI_COLS.length)];
      confetti.setColorAt(i, _c.set(col));
    }
    confetti.instanceColor.needsUpdate = true;
    cAny = true;
  }

  // ── Serpentins (rubans suivant une tête balistique, torsadés) ──
  const stPts = new Float32Array(NST * STREAMER_SEG * 3), stHeadV = new Float32Array(NST * 3);
  const stLife = new Float32Array(NST), stTw = new Float32Array(NST), stCol = new Float32Array(NST * 3);
  const stVerts = NST * STREAMER_SEG * 2;
  const stPos = new Float32Array(stVerts * 3), stC = new Float32Array(stVerts * 3);
  const stIdx = [];
  for (let s = 0; s < NST; s++) for (let i = 0; i < STREAMER_SEG - 1; i++) {
    const a = (s * STREAMER_SEG + i) * 2, b = a + 2;
    stIdx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const stGeo = new THREE.BufferGeometry();
  stGeo.setAttribute("position", new THREE.BufferAttribute(stPos, 3).setUsage(THREE.DynamicDrawUsage));
  stGeo.setAttribute("color", new THREE.BufferAttribute(stC, 3).setUsage(THREE.DynamicDrawUsage));
  stGeo.setIndex(stIdx);
  const stMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const streamerMesh = new THREE.Mesh(stGeo, stMat);
  streamerMesh.frustumCulled = false; streamerMesh.visible = false;
  root.add(streamerMesh);
  disposables.push(stGeo, stMat);
  let stCursor = 0, stAny = false;

  function streamers(pos, colors = CONFETTI_COLS, count = NST, { dir = null } = {}) {
    const n = Math.min(NST, Math.max(1, Math.round(count)));
    for (let k = 0; k < n; k++) {
      const s = stCursor; stCursor = (stCursor + 1) % NST;
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4;
      const sp = 1;
      let vx = Math.cos(a) * r, vy = 8 + Math.random() * 6, vz = Math.sin(a) * r;
      if (dir) { vx = dir.x * 10 + Math.cos(a) * 2; vy = dir.y * 10 + 4 + Math.random() * 3; vz = dir.z * 10 + Math.sin(a) * 2; }
      stHeadV[s * 3] = vx * sp; stHeadV[s * 3 + 1] = vy * sp; stHeadV[s * 3 + 2] = vz * sp;
      for (let i = 0; i < STREAMER_SEG; i++) {
        const o = (s * STREAMER_SEG + i) * 3;
        stPts[o] = pos.x; stPts[o + 1] = pos.y - i * 0.02; stPts[o + 2] = pos.z;
      }
      stLife[s] = 4 + Math.random() * 2.5;
      stTw[s] = Math.random() * 6.28;
      _c.set(colors[Math.floor(Math.random() * colors.length)]).multiplyScalar(1.15);
      stCol[s * 3] = _c.r; stCol[s * 3 + 1] = _c.g; stCol[s * 3 + 2] = _c.b;
    }
    stAny = true; streamerMesh.visible = true;
  }

  // ── Ondes au sol ──
  const RING_N = 12;
  const ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const rings = Array.from({ length: RING_N }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    m.visible = false;
    m.renderOrder = 6;
    root.add(m);
    return { m, t: 0, dur: 1, radius: 1 };
  });
  disposables.push(ringGeo, ...rings.map(r => r.m.material));
  let ringCursor = 0;
  function ring(pos, colorHex = "#ffffff", { radius = 3, duration = 0.6, bright = 1.5 } = {}) {
    const r = rings[ringCursor];
    ringCursor = (ringCursor + 1) % RING_N;
    r.m.position.set(pos.x, Math.max(0.03, pos.y < 0.5 ? 0.03 : pos.y), pos.z);
    r.m.material.color.set(colorHex).multiplyScalar(bright);
    r.t = 0; r.dur = Math.max(0.05, duration); r.radius = radius;
    r.m.visible = true;
    r.m.scale.setScalar(0.01);
  }

  // ── Dôme de choc (Fresnel additif) ──
  const DOME_N = 3;
  const domeGeo = new THREE.SphereGeometry(1, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const domes = Array.from({ length: DOME_N }, () => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vV; varying float vH;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - wp.xyz; vH = position.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uAlpha;
        varying vec3 vN; varying vec3 vV; varying float vH;
        void main() {
          float ndv = abs(dot(normalize(vN), normalize(vV)));
          float rim = pow(max(1.0 - ndv, 0.0), 2.5);
          float a = rim * 1.1 * uAlpha * (1.0 - smoothstep(0.2, 1.0, vH));
          gl_FragColor = vec4(uColor * a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(domeGeo, mat);
    m.visible = false; m.renderOrder = 7;
    root.add(m);
    return { m, t: 0, dur: 0.7, radius: 6 };
  });
  disposables.push(domeGeo, ...domes.map(d => d.m.material));
  let domeCursor = 0;
  function shockwave(pos, colorHex = "#ffffff", { radius = 7, duration = 0.75, bright = 2.2 } = {}) {
    const d = domes[domeCursor]; domeCursor = (domeCursor + 1) % DOME_N;
    d.m.position.set(pos.x, 0, pos.z);
    d.m.material.uniforms.uColor.value.set(colorHex).multiplyScalar(bright);
    d.t = 0; d.dur = duration; d.radius = radius; d.m.visible = true; d.m.scale.setScalar(0.01);
  }

  // ── Poussière (bouffées douces, mélange normal) ──
  const puffTex = puffTexture();
  const dPos = new Float32Array(MAXD * 3), dCol = new Float32Array(MAXD * 4), dSize = new Float32Array(MAXD);
  const dVel = new Float32Array(MAXD * 3), dLife = new Float32Array(MAXD), dMax = new Float32Array(MAXD), dB = new Float32Array(MAXD), dA = new Float32Array(MAXD);
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3).setUsage(THREE.DynamicDrawUsage));
  dGeo.setAttribute("color", new THREE.BufferAttribute(dCol, 4).setUsage(THREE.DynamicDrawUsage));
  dGeo.setAttribute("aSize", new THREE.BufferAttribute(dSize, 1).setUsage(THREE.DynamicDrawUsage));
  const dMat = new THREE.PointsMaterial({ size: 1, map: puffTex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
  dMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSize;")
      .replace("gl_PointSize = size;", "gl_PointSize = size * aSize;");
  };
  dMat.customProgramCacheKey = () => "labFxDust";
  const dustPts = new THREE.Points(dGeo, dMat);
  dustPts.frustumCulled = false; dustPts.renderOrder = 7;
  root.add(dustPts);
  disposables.push(dGeo, dMat, puffTex);
  let dCursor = 0, dAny = false;

  /** Bouffée de poussière (tacle, réception, glissade). */
  function dust(pos, { count = 8, color = "#b7c4bb", size = 0.9, spread = 0.9, up = 0.35, life: lf = 1.1, opacity = 0.42, dir = null } = {}) {
    _c.set(color);
    const n = Math.max(2, Math.round(count * Math.max(0.5, SCALE)));
    for (let k = 0; k < n; k++) {
      const i = dCursor; dCursor = (dCursor + 1) % MAXD;
      const a = Math.random() * Math.PI * 2, s = spread * (0.4 + Math.random() * 0.8);
      dPos[i * 3] = pos.x + Math.cos(a) * 0.15; dPos[i * 3 + 1] = Math.max(0.12, (pos.y || 0) * 0.3 + 0.12); dPos[i * 3 + 2] = pos.z + Math.sin(a) * 0.15;
      dVel[i * 3] = Math.cos(a) * s + (dir ? dir.x * 1.5 : 0); dVel[i * 3 + 1] = up * (0.5 + Math.random()); dVel[i * 3 + 2] = Math.sin(a) * s + (dir ? dir.z * 1.5 : 0);
      const sh = 0.85 + Math.random() * 0.3;
      dCol[i * 4] = _c.r * sh; dCol[i * 4 + 1] = _c.g * sh; dCol[i * 4 + 2] = _c.b * sh; dCol[i * 4 + 3] = 0;
      dLife[i] = lf * (0.7 + Math.random() * 0.6); dMax[i] = dLife[i];
      dB[i] = size * (0.6 + Math.random() * 0.7); dA[i] = opacity;
    }
    dAny = true;
  }

  // ── Flashs (sprites) ──
  const FLASH_N = 8;
  const flashes = Array.from({ length: FLASH_N }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.visible = false;
    s.renderOrder = 9;
    root.add(s);
    return { s, t: 0, dur: 0.3, size: 1 };
  });
  disposables.push(...flashes.map(f => f.s.material));
  let flashCursor = 0;
  function flash(pos, colorHex, size, dur, bright = 1.6) {
    const f = flashes[flashCursor];
    flashCursor = (flashCursor + 1) % FLASH_N;
    f.s.position.set(pos.x, pos.y, pos.z);
    f.s.material.color.set(colorHex).multiplyScalar(bright);
    f.t = 0; f.dur = dur; f.size = size;
    f.s.visible = true;
  }

  // ── Lignes de vitesse (option, style manga) : quads radiaux collés à la caméra ──
  const SL_N = 56;
  const slGeo = new THREE.BufferGeometry();
  {
    const corner = new Float32Array(SL_N * 4 * 2), seed = new Float32Array(SL_N * 4 * 4), idx = [];
    for (let i = 0; i < SL_N; i++) {
      const s = [Math.random() * Math.PI * 2, Math.random(), Math.random(), Math.random()];
      for (let v = 0; v < 4; v++) {
        corner.set([v & 1 ? 1 : -1, v >> 1], (i * 4 + v) * 2);
        seed.set(s, (i * 4 + v) * 4);
      }
      const b = i * 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    slGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SL_N * 4 * 3), 3));
    slGeo.setAttribute("aCorner", new THREE.BufferAttribute(corner, 2));
    slGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    slGeo.setIndex(idx);
  }
  const slU = { uAmount: { value: 0 }, uTime: { value: 0 }, uTan: { value: 0.6 }, uAspect: { value: 1.6 }, uColor: { value: new THREE.Color(1, 1, 1) } };
  const slMat = new THREE.ShaderMaterial({
    uniforms: slU,
    vertexShader: /* glsl */`
      attribute vec2 aCorner; attribute vec4 aSeed;
      uniform float uAmount, uTime, uTan, uAspect;
      varying float vA; varying float vT;
      void main() {
        float ang = aSeed.x;
        float cyc = fract(uTime * (0.9 + aSeed.w * 1.6) + aSeed.z);
        float r0 = 0.62 + aSeed.y * 0.45 - cyc * 0.1;
        float len = 0.25 + aSeed.w * 0.45;
        float r = r0 + aCorner.y * len;
        vec2 d = vec2(cos(ang), sin(ang));
        vec2 p = d * r + vec2(-d.y, d.x) * aCorner.x * 0.0035 * r;
        vec3 cp = vec3(p.x * uTan * uAspect, p.y * uTan, -1.0);
        vT = aCorner.y;
        vA = uAmount * smoothstep(0.0, 0.25, cyc) * (1.0 - smoothstep(0.55, 1.0, cyc));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(cp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vA; varying float vT;
      void main() {
        float a = vA * smoothstep(0.0, 0.35, vT) * 0.55;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const speedLines = new THREE.Mesh(slGeo, slMat);
  speedLines.frustumCulled = false; speedLines.visible = false; speedLines.renderOrder = 30; speedLines.matrixAutoUpdate = false;
  root.add(speedLines);
  disposables.push(slGeo, slMat);
  let slTarget = 0;
  function setSpeedLines(amount = 0, colorHex) { slTarget = clamp(+amount || 0, 0, 1); if (colorHex) slU.uColor.value.set(colorHex); }

  // ── Évènements différés (feux d'artifice) ──
  const queue = [];
  const later = (delay, fn) => queue.push({ t: delay, fn });

  // ── API haut niveau ──
  function kickSpark(pos, colorHex = "#ffffff") {
    burst(pos, colorHex, { count: 14, speed: 5.5, size: 0.2, gravity: 4, life: 0.35, up: 0.3, drag: 3 });
    burst(pos, "#ffffff", { count: 5, speed: 3, size: 0.14, gravity: 2, life: 0.25, up: 0.2, drag: 3 });
    sparks(pos, colorHex, { count: 14, speed: 8, up: 0.35, life: 0.3, gravity: 6, drag: 3, stretch: 0.03 });
    ring({ x: pos.x, y: 0, z: pos.z }, colorHex, { radius: 0.8, duration: 0.28 });
    flash(pos, colorHex, 0.9, 0.16);
  }

  /** Feu d'artifice : fusée + gerbe d'étincelles colorées en altitude. */
  function firework(pos, colorHex = NEON.gold, { height = 11 } = {}) {
    _c2.set(colorHex);
    const vy = Math.sqrt(2 * 9 * height), t = vy / 9;
    spark(pos.x, pos.y, pos.z, 0, vy, 0, 2.2, 2.0, 1.6, t, 9, 0, 0.05);
    later(t, () => {
      const p = { x: pos.x, y: pos.y + height, z: pos.z };
      sparks(p, colorHex, { count: 70, speed: 8, up: 0, life: 1.3, gravity: 2.5, drag: 1.1, stretch: 0.05, bright: 3 });
      burst(p, colorHex, { count: 36, speed: 6, size: 0.45, gravity: 1.5, life: 1.4, up: 0, drag: 1.3, bright: 1.6 });
      flash(p, colorHex, 7, 0.45, 1.3);
    });
  }

  function goalExplosion(pos, colorHex = NEON.gold) {
    const g = { x: pos.x, y: 0, z: pos.z };
    burst(pos, colorHex, { count: 200, speed: 10, size: 0.5, gravity: 4.5, life: 1.7, up: 0.7, drag: 0.9, bright: 1.6 });
    burst(pos, "#ffffff", { count: 60, speed: 13, size: 0.3, gravity: 3, life: 1.0, up: 0.5, drag: 1.2 });
    burst(pos, NEON.gold, { count: 50, speed: 7, size: 0.26, gravity: 2, life: 2.2, up: 1.1, drag: 0.6 });
    sparks(pos, colorHex, { count: 110, speed: 16, up: 0.45, life: 0.9, gravity: 9, drag: 1.2, stretch: 0.045, bright: 3 });
    sparks(pos, "#ffffff", { count: 40, speed: 20, up: 0.3, life: 0.5, gravity: 6, drag: 1.5 });
    // canons à confettis depuis les poteaux, vers l'intérieur et le haut
    const inward = -Math.sign(pos.x || 1);
    for (const sz of [-1, 1]) {
      const c = { x: pos.x, y: 0.3, z: sz * 2.4 };
      const dir = new THREE.Vector3(inward * 0.45, 0.85, -sz * 0.25).normalize();
      confettiBurst(c, colorHex, 110, { dir, speed: 0.9 });
      streamers(c, [colorHex, "#ffffff", NEON.gold, colorHex], Math.ceil(NST / 2), { dir });
    }
    confettiBurst(pos, colorHex, 120);
    ring(g, colorHex, { radius: 10, duration: 1.3 });
    ring(g, "#ffffff", { radius: 5, duration: 0.6, bright: 2 });
    ring(g, colorHex, { radius: 16, duration: 2.0 });
    shockwave(g, colorHex, { radius: 8, duration: 0.8, bright: 1.8 });
    later(0.12, () => shockwave(g, "#ffffff", { radius: 4.5, duration: 0.5, bright: 1.1 }));
    flash(pos, colorHex, 9, 0.55);
    flash(pos, "#ffffff", 4, 0.25, 2.2);
    // feux d'artifice depuis les coins de la tribune derrière le but
    const bx = Math.sign(pos.x || 1) * 22.5;
    const n = SCALE >= 1 ? 6 : SCALE >= 0.6 ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const z = (i % 2 ? 1 : -1) * (6 + (i >> 1) * 4);
      const col = i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? colorHex : NEON.gold;
      later(0.25 + i * 0.28 + Math.random() * 0.15, () => firework({ x: bx, y: 3, z }, col, { height: 9 + Math.random() * 4 }));
    }
    dust(g, { count: 10, size: 1.4, spread: 2.2, up: 0.5, opacity: 0.3 });
  }

  // ── Mise à jour ──
  function update(dt, camera) {
    dt = clamp(dt || 0, 0, 0.1);
    for (let i = queue.length - 1; i >= 0; i--) { const e = queue[i]; e.t -= dt; if (e.t <= 0) { queue.splice(i, 1); e.fn(); } }

    if (pAlive > 0) {
      let alive = 0;
      for (let i = 0; i < MAXP; i++) {
        if (life[i] <= 0) { if (pSize[i] !== 0) pSize[i] = 0; continue; }
        life[i] -= dt;
        const o = i * 3;
        if (life[i] <= 0) { pSize[i] = 0; continue; }
        alive++;
        const dk = Math.max(0, 1 - drag[i] * dt);
        vel[o] *= dk; vel[o + 1] = vel[o + 1] * dk - grav[i] * dt; vel[o + 2] *= dk;
        pPos[o] += vel[o] * dt; pPos[o + 1] += vel[o + 1] * dt; pPos[o + 2] += vel[o + 2] * dt;
        if (pPos[o + 1] < 0.03) { pPos[o + 1] = 0.03; vel[o + 1] *= -0.35; }
        const f = life[i] / maxLife[i];
        const a = f * f * (3 - 2 * f);
        pCol[o] = base[o] * a; pCol[o + 1] = base[o + 1] * a; pCol[o + 2] = base[o + 2] * a;
        pSize[i] = bSize[i] * (0.35 + 0.65 * f);
      }
      pAlive = alive;
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
      pGeo.attributes.aSize.needsUpdate = true;
    }

    if (sAny) {
      let any = false;
      for (let i = 0; i < MAXS; i++) {
        const o = i * 3, o2 = i * 6;
        if (sLife[i] <= 0) continue;
        sLife[i] -= dt;
        if (sLife[i] <= 0) { sCol.fill(0, o2, o2 + 6); continue; }
        any = true;
        const dk = Math.max(0, 1 - sDrag[i] * dt);
        sVel[o] *= dk; sVel[o + 1] = sVel[o + 1] * dk - sGrav[i] * dt; sVel[o + 2] *= dk;
        sHead[o] += sVel[o] * dt; sHead[o + 1] += sVel[o + 1] * dt; sHead[o + 2] += sVel[o + 2] * dt;
        if (sHead[o + 1] < 0.02) { sHead[o + 1] = 0.02; sVel[o + 1] *= -0.4; sVel[o] *= 0.6; sVel[o + 2] *= 0.6; }
        const st = sStretch[i];
        sPos[o2] = sHead[o]; sPos[o2 + 1] = sHead[o + 1]; sPos[o2 + 2] = sHead[o + 2];
        sPos[o2 + 3] = sHead[o] - sVel[o] * st; sPos[o2 + 4] = sHead[o + 1] - sVel[o + 1] * st; sPos[o2 + 5] = sHead[o + 2] - sVel[o + 2] * st;
        const f = sLife[i] / sMax[i], a = Math.min(1, f * 1.6);
        sCol[o2] = sBase[o] * a; sCol[o2 + 1] = sBase[o + 1] * a; sCol[o2 + 2] = sBase[o + 2] * a;
        sCol[o2 + 3] = sBase[o] * a * 0.15; sCol[o2 + 4] = sBase[o + 1] * a * 0.15; sCol[o2 + 5] = sBase[o + 2] * a * 0.15;
      }
      sGeo.attributes.position.needsUpdate = true;
      sGeo.attributes.color.needsUpdate = true;
      sAny = any;
    }

    if (cAny) {
      let any = false;
      for (let i = 0; i < MAXC; i++) {
        if (cLife[i] <= 0) continue;
        cLife[i] -= dt;
        if (cLife[i] <= 0) { confetti.setMatrixAt(i, ZERO); continue; }
        any = true;
        const o = i * 3;
        const grounded = cPos[o + 1] <= 0.021;
        if (!grounded) {
          // papier : forte traînée, chute plafonnée qui dépend de l'orientation, flottement latéral
          const dk = Math.max(0, 1 - 1.8 * dt);
          const face = Math.abs(Math.cos(cRot[o]) * Math.cos(cRot[o + 2]));
          const term = -0.9 - 1.1 * (1 - face);
          const fl = cFlut[i];
          cVel[o] = cVel[o] * dk + Math.sin(cPhase[i] + cLife[i] * 3.1 * fl) * 2.2 * fl * dt;
          cVel[o + 2] = cVel[o + 2] * dk + Math.cos(cPhase[i] + cLife[i] * 2.3 * fl) * 2.2 * fl * dt;
          cVel[o + 1] = Math.max(term, cVel[o + 1] * dk - 7 * dt);
          cPos[o] += cVel[o] * dt; cPos[o + 1] += cVel[o + 1] * dt; cPos[o + 2] += cVel[o + 2] * dt;
          cRot[o] += cSpin[o] * dt; cRot[o + 1] += cSpin[o + 1] * dt; cRot[o + 2] += cSpin[o + 2] * dt;
          if (cPos[o + 1] < 0.02) { cPos[o + 1] = 0.02; cRot[o] = -Math.PI / 2; cRot[o + 2] = 0; }
        }
        const s = cLife[i] < 0.6 ? cLife[i] / 0.6 : 1;
        dummy.position.set(cPos[o], cPos[o + 1], cPos[o + 2]);
        dummy.rotation.set(cRot[o], cRot[o + 1], cRot[o + 2]);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        confetti.setMatrixAt(i, dummy.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
      cAny = any;
    }

    if (stAny) {
      let any = false;
      for (let s = 0; s < NST; s++) {
        const vb = s * STREAMER_SEG * 2 * 3;
        if (stLife[s] <= 0) { stPos.fill(0, vb, vb + STREAMER_SEG * 6); continue; }
        stLife[s] -= dt;
        any = true;
        const h = s * 3, p0 = s * STREAMER_SEG * 3;
        // tête : balistique freinée, dérive latérale
        const dk = Math.max(0, 1 - 1.5 * dt);
        stHeadV[h] = stHeadV[h] * dk + Math.sin(stTw[s] + stLife[s] * 2) * 1.2 * dt;
        stHeadV[h + 1] = Math.max(-1.3, stHeadV[h + 1] * dk - 7 * dt);
        stHeadV[h + 2] = stHeadV[h + 2] * dk + Math.cos(stTw[s] + stLife[s] * 1.7) * 1.2 * dt;
        stPts[p0] += stHeadV[h] * dt; stPts[p0 + 1] = Math.max(0.02, stPts[p0 + 1] + stHeadV[h + 1] * dt); stPts[p0 + 2] += stHeadV[h + 2] * dt;
        // corps : suit la tête (longueur fixe) en pendant légèrement
        for (let i = 1; i < STREAMER_SEG; i++) {
          const a = p0 + (i - 1) * 3, b = p0 + i * 3;
          stPts[b + 1] = Math.max(0.02, stPts[b + 1] - 0.35 * dt);
          let dx = stPts[b] - stPts[a], dy = stPts[b + 1] - stPts[a + 1], dz = stPts[b + 2] - stPts[a + 2];
          const l = Math.hypot(dx, dy, dz) || 1e-6;
          const k = STREAMER_LEN / l;
          stPts[b] = stPts[a] + dx * k; stPts[b + 1] = Math.max(0.02, stPts[a + 1] + dy * k); stPts[b + 2] = stPts[a + 2] + dz * k;
        }
        // ruban torsadé : largeur tournant autour de l'axe local
        const fade = Math.min(1, stLife[s] / 0.8);
        const W = 0.035 * fade;
        for (let i = 0; i < STREAMER_SEG; i++) {
          const b = p0 + i * 3, a = p0 + Math.max(0, i - 1) * 3, c = p0 + Math.min(STREAMER_SEG - 1, i + 1) * 3;
          let tx = stPts[c] - stPts[a], ty = stPts[c + 1] - stPts[a + 1], tz = stPts[c + 2] - stPts[a + 2];
          const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
          // vecteur perpendiculaire (horizontal), tourné autour de la tangente
          let px = -tz, pz = tx, pl = Math.hypot(px, pz) || 1; px /= pl; pz /= pl;
          const ang = stTw[s] + i * 0.55 + stLife[s] * 3;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          // Rodrigues (p ⟂ t) : p·cos + (t × p)·sin
          const cx = ty * pz, cy = tz * px - tx * pz, cz = -ty * px;
          const wx = (px * ca + cx * sa) * W, wy = (cy * sa) * W, wz = (pz * ca + cz * sa) * W;
          const v = vb + i * 6;
          stPos[v] = stPts[b] + wx; stPos[v + 1] = stPts[b + 1] + wy; stPos[v + 2] = stPts[b + 2] + wz;
          stPos[v + 3] = stPts[b] - wx; stPos[v + 4] = stPts[b + 1] - wy; stPos[v + 5] = stPts[b + 2] - wz;
          const shade = 0.75 + 0.35 * Math.abs(ca);
          for (let k2 = 0; k2 < 2; k2++) {
            stC[v + k2 * 3] = stCol[h] * shade; stC[v + k2 * 3 + 1] = stCol[h + 1] * shade; stC[v + k2 * 3 + 2] = stCol[h + 2] * shade;
          }
        }
      }
      stGeo.attributes.position.needsUpdate = true;
      stGeo.attributes.color.needsUpdate = true;
      stAny = any; streamerMesh.visible = any;
    }

    if (dAny) {
      let any = false;
      for (let i = 0; i < MAXD; i++) {
        if (dLife[i] <= 0) { if (dSize[i] !== 0) dSize[i] = 0; continue; }
        dLife[i] -= dt;
        if (dLife[i] <= 0) { dSize[i] = 0; dCol[i * 4 + 3] = 0; continue; }
        any = true;
        const o = i * 3, dk = Math.max(0, 1 - 3 * dt);
        dVel[o] *= dk; dVel[o + 1] = dVel[o + 1] * Math.max(0, 1 - 1.2 * dt); dVel[o + 2] *= dk;
        dPos[o] += dVel[o] * dt; dPos[o + 1] += dVel[o + 1] * dt; dPos[o + 2] += dVel[o + 2] * dt;
        const age = 1 - dLife[i] / dMax[i];
        dSize[i] = dB[i] * (0.6 + age * 1.6);
        dCol[i * 4 + 3] = dA[i] * Math.min(1, age * 8) * Math.pow(1 - age, 1.4);
      }
      dGeo.attributes.position.needsUpdate = true;
      dGeo.attributes.color.needsUpdate = true;
      dGeo.attributes.aSize.needsUpdate = true;
      dAny = any;
    }

    for (const r of rings) {
      if (!r.m.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { r.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 3);
      r.m.scale.setScalar(Math.max(0.01, r.radius * e));
      r.m.material.opacity = 1 - k;
    }
    for (const d of domes) {
      if (!d.m.visible) continue;
      d.t += dt;
      const k = d.t / d.dur;
      if (k >= 1) { d.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 2.5);
      d.m.scale.set(d.radius * e, d.radius * e * 0.7, d.radius * e);
      d.m.material.uniforms.uAlpha.value = (1 - k) * (1 - k);
    }
    for (const f of flashes) {
      if (!f.s.visible) continue;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) { f.s.visible = false; continue; }
      f.s.scale.setScalar(f.size * (0.6 + 0.4 * k));
      f.s.material.opacity = 1 - k;
    }

    // lignes de vitesse : suivent la caméra fournie
    const cur = slU.uAmount.value;
    slU.uAmount.value = cur + (slTarget - cur) * (1 - Math.exp(-dt * 8));
    speedLines.visible = !!camera && slU.uAmount.value > 0.01;
    if (speedLines.visible) {
      camera.updateMatrixWorld();
      speedLines.matrix.copy(camera.matrixWorld);
      speedLines.matrixWorldNeedsUpdate = true;
      slU.uTime.value += dt;
      slU.uTan.value = camera.isPerspectiveCamera ? Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) : 1;
      slU.uAspect.value = camera.aspect || 1.6;
    }
  }

  /** Ajuste les quantités émises (les réserves restent celles de la création). */
  function setQuality(nq) { q = normLevel(nq); SCALE = POOLS[q].scale; }

  function dispose() {
    scene.remove(root);
    for (const d of disposables) d.dispose();
    confetti.dispose();
  }

  return {
    group: root, burst, goalExplosion, ring, kickSpark, update, dispose,
    sparks, dust, shockwave, firework, streamers, confetti: confettiBurst, flash, setSpeedLines, setQuality,
  };
}
