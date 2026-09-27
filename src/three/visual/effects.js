// Effets visuels poolés : étincelles (Points additifs), confettis (instanciés), ondes de choc, flashs.
import * as THREE from "three";
import { normQuality, glowTexture, ringTexture, NEON, clamp } from "./util.js";

const CONFETTI_COLS = [NEON.cyan, NEON.magenta, NEON.lime, NEON.gold, "#ffffff", NEON.coral, NEON.violet];

export function createEffects(scene, { quality = "high" } = {}) {
  const q = normQuality(quality);
  const MAXP = { high: 1800, medium: 1000, low: 400 }[q];
  const MAXC = { high: 360, medium: 200, low: 80 }[q];
  const SCALE = { high: 1, medium: 0.6, low: 0.35 }[q];
  const root = new THREE.Group();
  root.name = "effects";
  scene.add(root);
  const _c = new THREE.Color();

  // ── Particules ──
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
    blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false,
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

  function burst(pos, colorHex = "#ffffff", { count = 30, speed = 4, size = 0.35, gravity = 6, life: lf = 0.8, up = 0.4, drag: dk = 1.2, spread = 1 } = {}) {
    _c.set(colorHex);
    const n = Math.max(1, Math.round(count * SCALE));
    for (let k = 0; k < n; k++) {
      // direction aléatoire sur la sphère, biaisée vers le haut
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const sp = speed * (0.35 + Math.random() * 0.65);
      const dx = s * Math.cos(a) * spread, dz = s * Math.sin(a) * spread, dy = u * spread + up;
      const bright = 0.7 + Math.random() * 0.5;
      spawn(pos.x, pos.y, pos.z, dx * sp, dy * sp, dz * sp, _c.r * bright, _c.g * bright, _c.b * bright,
        size * (0.6 + Math.random() * 0.8), lf * (0.6 + Math.random() * 0.6), gravity, dk);
    }
    pAlive = MAXP;
  }

  // ── Confettis ──
  const cGeo = new THREE.PlaneGeometry(0.13, 0.08);
  const cMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
  const confetti = new THREE.InstancedMesh(cGeo, cMat, MAXC);
  confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  confetti.frustumCulled = false;
  const cPos = new Float32Array(MAXC * 3), cVel = new Float32Array(MAXC * 3), cRot = new Float32Array(MAXC * 3), cSpin = new Float32Array(MAXC * 3);
  const cLife = new Float32Array(MAXC), cPhase = new Float32Array(MAXC);
  let cCursor = 0, cAny = false;
  const dummy = new THREE.Object3D();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAXC; i++) { confetti.setMatrixAt(i, ZERO); confetti.setColorAt(i, _c.set("#ffffff")); }
  root.add(confetti);

  function confettiBurst(pos, colorHex, count) {
    const n = Math.min(MAXC, Math.round(count * SCALE));
    for (let k = 0; k < n; k++) {
      const i = cCursor;
      cCursor = (cCursor + 1) % MAXC;
      const o = i * 3, a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 6;
      cPos[o] = pos.x + (Math.random() - 0.5) * 2; cPos[o + 1] = pos.y + 0.5 + Math.random() * 2; cPos[o + 2] = pos.z + (Math.random() - 0.5) * 2;
      cVel[o] = Math.cos(a) * r; cVel[o + 1] = 5 + Math.random() * 8; cVel[o + 2] = Math.sin(a) * r;
      for (let j = 0; j < 3; j++) { cRot[o + j] = Math.random() * 6.28; cSpin[o + j] = (Math.random() - 0.5) * 14; }
      cLife[i] = 3 + Math.random() * 2.5;
      cPhase[i] = Math.random() * 6.28;
      const col = Math.random() < 0.45 ? colorHex : CONFETTI_COLS[Math.floor(Math.random() * CONFETTI_COLS.length)];
      confetti.setColorAt(i, _c.set(col));
    }
    confetti.instanceColor.needsUpdate = true;
    cAny = true;
  }

  // ── Ondes au sol ──
  const RING_N = 12;
  const ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const rings = Array.from({ length: RING_N }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    m.visible = false;
    m.renderOrder = 6;
    root.add(m);
    return { m, t: 0, dur: 1, radius: 1 };
  });
  let ringCursor = 0;
  function ring(pos, colorHex = "#ffffff", { radius = 3, duration = 0.6 } = {}) {
    const r = rings[ringCursor];
    ringCursor = (ringCursor + 1) % RING_N;
    r.m.position.set(pos.x, Math.max(0.03, pos.y < 0.5 ? 0.03 : pos.y), pos.z);
    r.m.material.color.set(colorHex);
    r.t = 0; r.dur = Math.max(0.05, duration); r.radius = radius;
    r.m.visible = true;
    r.m.scale.setScalar(0.01);
  }

  // ── Flashs (sprites) ──
  const FLASH_N = 6;
  const flashes = Array.from({ length: FLASH_N }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    s.visible = false;
    s.renderOrder = 9;
    root.add(s);
    return { s, t: 0, dur: 0.3, size: 1 };
  });
  let flashCursor = 0;
  function flash(pos, colorHex, size, dur) {
    const f = flashes[flashCursor];
    flashCursor = (flashCursor + 1) % FLASH_N;
    f.s.position.set(pos.x, pos.y, pos.z);
    f.s.material.color.set(colorHex);
    f.t = 0; f.dur = dur; f.size = size;
    f.s.visible = true;
  }

  // ── API haut niveau ──
  function kickSpark(pos, colorHex = "#ffffff") {
    burst(pos, colorHex, { count: 16, speed: 5.5, size: 0.2, gravity: 4, life: 0.35, up: 0.3, drag: 3 });
    burst(pos, "#ffffff", { count: 6, speed: 3, size: 0.14, gravity: 2, life: 0.25, up: 0.2, drag: 3 });
    ring({ x: pos.x, y: 0, z: pos.z }, colorHex, { radius: 0.8, duration: 0.28 });
    flash(pos, colorHex, 0.9, 0.16);
  }

  function goalExplosion(pos, colorHex = NEON.gold) {
    burst(pos, colorHex, { count: 220, speed: 10, size: 0.5, gravity: 4.5, life: 1.7, up: 0.7, drag: 0.9 });
    burst(pos, "#ffffff", { count: 70, speed: 13, size: 0.3, gravity: 3, life: 1.0, up: 0.5, drag: 1.2 });
    burst(pos, NEON.gold, { count: 60, speed: 7, size: 0.26, gravity: 2, life: 2.2, up: 1.1, drag: 0.6 });
    confettiBurst(pos, colorHex, 260);
    const g = { x: pos.x, y: 0, z: pos.z };
    ring(g, colorHex, { radius: 10, duration: 1.3 });
    ring(g, "#ffffff", { radius: 5, duration: 0.6 });
    ring(g, colorHex, { radius: 16, duration: 2.0 });
    flash(pos, colorHex, 9, 0.55);
    flash(pos, "#ffffff", 4, 0.25);
  }

  // ── Mise à jour ──
  function update(dt) {
    dt = clamp(dt || 0, 0, 0.1);
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
      if (alive === 0) pAlive = 0;
    }

    if (cAny) {
      let any = false;
      for (let i = 0; i < MAXC; i++) {
        if (cLife[i] <= 0) continue;
        cLife[i] -= dt;
        if (cLife[i] <= 0) { confetti.setMatrixAt(i, ZERO); continue; }
        any = true;
        const o = i * 3;
        const dk = Math.max(0, 1 - 1.6 * dt);
        cVel[o] = cVel[o] * dk + Math.sin(cPhase[i] + cLife[i] * 3) * 1.5 * dt;
        cVel[o + 2] = cVel[o + 2] * dk + Math.cos(cPhase[i] + cLife[i] * 2.3) * 1.5 * dt;
        cVel[o + 1] = Math.max(-1.6, cVel[o + 1] * dk - 6 * dt);
        cPos[o] += cVel[o] * dt; cPos[o + 1] += cVel[o + 1] * dt; cPos[o + 2] += cVel[o + 2] * dt;
        let s = 1;
        if (cPos[o + 1] < 0.02) { cPos[o + 1] = 0.02; cVel[o] = cVel[o + 2] = 0; cSpin[o] = cSpin[o + 1] = cSpin[o + 2] = 0; cRot[o] = -Math.PI / 2; }
        if (cLife[i] < 0.6) s = cLife[i] / 0.6;
        cRot[o] += cSpin[o] * dt; cRot[o + 1] += cSpin[o + 1] * dt; cRot[o + 2] += cSpin[o + 2] * dt;
        dummy.position.set(cPos[o], cPos[o + 1], cPos[o + 2]);
        dummy.rotation.set(cRot[o], cRot[o + 1], cRot[o + 2]);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        confetti.setMatrixAt(i, dummy.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
      cAny = any;
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
    for (const f of flashes) {
      if (!f.s.visible) continue;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) { f.s.visible = false; continue; }
      f.s.scale.setScalar(f.size * (0.6 + 0.4 * k));
      f.s.material.opacity = 1 - k;
    }
  }

  function dispose() {
    scene.remove(root);
    pGeo.dispose(); pMat.dispose();
    cGeo.dispose(); cMat.dispose(); confetti.dispose();
    ringGeo.dispose();
    for (const r of rings) r.m.material.dispose();
    for (const f of flashes) f.s.material.dispose();
  }

  return { group: root, burst, goalExplosion, ring, kickSpark, update, dispose };
}
