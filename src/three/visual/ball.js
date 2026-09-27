// Ballon : texture « football » générée, rotation selon la vitesse, ombre douce et traînée.
import * as THREE from "three";
import { normQuality, makeCanvas, canvasTexture, cached, glowTexture, shadowTexture, clamp, smooth } from "./util.js";

const VIS_R = 0.16;   // rayon affiché
const PHYS_R = 0.11;  // rayon physique (position reçue = centre physique)
const TRAIL_N = 22;   // points de traînée
const TRAIL_STEP = 0.14;

// Texture équirectangulaire : Voronoï sphérique des 32 faces d'un icosaèdre tronqué
function ballTexture(q) {
  return cached(`tex:ball:${q}`, () => {
    const W = q === "low" ? 256 : 512, H = W / 2;
    const c = makeCanvas(W, H), g = c.getContext("2d");
    const img = g.createImageData(W, H), d = img.data;
    const t = (1 + Math.sqrt(5)) / 2;
    const ico = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .map(v => new THREE.Vector3(...v).normalize());
    const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const centers = [...ico.map(v => [v, 1]), ...faces.map(f => [ico[f[0]].clone().add(ico[f[1]]).add(ico[f[2]]).normalize(), 0])];
    const p = new THREE.Vector3();
    for (let y = 0; y < H; y++) {
      const th = (y + 0.5) / H * Math.PI;
      for (let x = 0; x < W; x++) {
        const ph = (x + 0.5) / W * Math.PI * 2;
        // même paramétrage que SphereGeometry
        p.set(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
        let b1 = -2, b2 = -2, k1 = 0;
        for (let i = 0; i < 32; i++) {
          const dd = p.dot(centers[i][0]);
          if (dd > b1) { b2 = b1; b1 = dd; k1 = i; } else if (dd > b2) b2 = dd;
        }
        const pent = centers[k1][1] === 1;
        const seam = b1 - b2 < 0.012;
        let r, gg, bb;
        if (seam) { r = 150; gg = 158; bb = 170; }
        else if (pent) { r = 22; gg = 24; bb = 34; }
        else { const s = 238 + (b1 - 0.9) * 120; r = s; gg = s; bb = s + 6; }
        const o = (y * W + x) * 4;
        d[o] = r; d[o + 1] = gg; d[o + 2] = bb; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return canvasTexture(c, { aniso: 4 });
  });
}

export function createBall({ quality = "high" } = {}) {
  const q = normQuality(quality);
  const tex = ballTexture(q);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.42, metalness: 0.05,
    emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22,
  });
  const seg = q === "low" ? 16 : 28;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(VIS_R, seg, Math.round(seg * 0.7)), mat);
  mesh.castShadow = q === "high";
  mesh.name = "ball";

  // halo (power-up / tir puissant)
  const haloMat = new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(1.1);
  mesh.add(halo);

  const trail = new THREE.Group();
  trail.name = "ballTrail";

  // ombre douce au sol
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.6 });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6).rotateX(-Math.PI / 2), shadowMat);
  shadow.renderOrder = 1;
  trail.add(shadow);

  // ruban croisé (horizontal + vertical) en dégradé additif
  const hist = new Float32Array(TRAIL_N * 3);
  const vCount = TRAIL_N * 4;
  const tPos = new Float32Array(vCount * 3), tCol = new Float32Array(vCount * 3);
  const idx = [];
  for (let i = 0; i < TRAIL_N - 1; i++) {
    for (let s = 0; s < 2; s++) {
      const a = i * 4 + s * 2, b = a + 4;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute("position", new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
  tGeo.setAttribute("color", new THREE.BufferAttribute(tCol, 3).setUsage(THREE.DynamicDrawUsage));
  tGeo.setIndex(idx);
  const tMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const ribbon = new THREE.Mesh(tGeo, tMat);
  ribbon.frustumCulled = false;
  ribbon.renderOrder = 5;
  trail.add(ribbon);

  const trailColor = new THREE.Color("#9ff6ff");
  const baseTrail = new THREE.Color("#9ff6ff");
  let glowOn = false, intensity = 0, init = false;
  const _axis = new THREE.Vector3(), _dq = new THREE.Quaternion();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3();
  const UPV = new THREE.Vector3(0, 1, 0);

  function resetHistory(x, y, z) {
    for (let i = 0; i < TRAIL_N; i++) { hist[i * 3] = x; hist[i * 3 + 1] = y; hist[i * 3 + 2] = z; }
  }

  function update(pos, vel, dt = 1 / 60) {
    dt = clamp(dt || 0, 0, 0.1);
    const x = pos.x, y = pos.y + (VIS_R - PHYS_R), z = pos.z;
    const vx = vel ? vel.x : 0, vy = vel ? vel.y : 0, vz = vel ? vel.z : 0;
    mesh.position.set(x, y, z);

    // rotation : ω = (haut × v) / r
    const hs = Math.hypot(vx, vz);
    if (hs > 1e-3) {
      _axis.set(vz, 0, -vx).normalize();
      _dq.setFromAxisAngle(_axis, (hs / VIS_R) * dt);
      mesh.quaternion.premultiply(_dq);
    }

    // ombre
    const h = Math.max(0, pos.y - PHYS_R);
    shadow.position.set(x, 0.013, z);
    shadow.scale.setScalar(1 + h * 0.35);
    shadowMat.opacity = 0.62 / (1 + h * 0.9);

    // traînée
    if (!init || Math.hypot(x - hist[0], y - hist[1], z - hist[2]) > 3) { resetHistory(x, y, z); init = true; }
    const dx = x - hist[3], dy = y - hist[4], dz = z - hist[5];
    if (Math.hypot(dx, dy, dz) > TRAIL_STEP) hist.copyWithin(3, 0, (TRAIL_N - 1) * 3);
    hist[0] = x; hist[1] = y; hist[2] = z;
    const speed = Math.hypot(vx, vy, vz);
    const target = smooth(8, 14, speed);
    intensity += (target - intensity) * (1 - Math.exp(-dt * (target > intensity ? 12 : 4)));
    ribbon.visible = intensity > 0.01;
    if (ribbon.visible) {
      for (let i = 0; i < TRAIL_N; i++) {
        _a.fromArray(hist, i * 3);
        if (i < TRAIL_N - 1) _b.fromArray(hist, (i + 1) * 3); else _b.fromArray(hist, (i - 1) * 3).sub(_a).negate().add(_a);
        _d.subVectors(_a, _b);
        if (_d.lengthSq() < 1e-8) _d.set(1, 0, 0);
        _d.normalize();
        _s1.crossVectors(_d, UPV);
        if (_s1.lengthSq() < 1e-6) _s1.set(1, 0, 0);
        _s1.normalize();
        _s2.crossVectors(_d, _s1).normalize();
        const f = 1 - i / (TRAIL_N - 1);
        const w = VIS_R * 0.9 * f;
        const o = i * 12;
        tPos[o] = _a.x + _s1.x * w; tPos[o + 1] = _a.y + _s1.y * w; tPos[o + 2] = _a.z + _s1.z * w;
        tPos[o + 3] = _a.x - _s1.x * w; tPos[o + 4] = _a.y - _s1.y * w; tPos[o + 5] = _a.z - _s1.z * w;
        tPos[o + 6] = _a.x + _s2.x * w; tPos[o + 7] = _a.y + _s2.y * w; tPos[o + 8] = _a.z + _s2.z * w;
        tPos[o + 9] = _a.x - _s2.x * w; tPos[o + 10] = _a.y - _s2.y * w; tPos[o + 11] = _a.z - _s2.z * w;
        const k = intensity * f * f * 0.9;
        for (let v = 0; v < 4; v++) {
          tCol[o + v * 3] = trailColor.r * k; tCol[o + v * 3 + 1] = trailColor.g * k; tCol[o + v * 3 + 2] = trailColor.b * k;
        }
      }
      tGeo.attributes.position.needsUpdate = true;
      tGeo.attributes.color.needsUpdate = true;
    }
    haloMat.opacity = glowOn ? 0.85 : Math.min(0.5, intensity * 0.45);
  }

  function setGlow(colorHex) {
    glowOn = !!colorHex;
    if (glowOn) {
      haloMat.color.set(colorHex);
      trailColor.set(colorHex);
      mat.emissive.set(colorHex);
      mat.emissiveIntensity = 0.35;
    } else {
      haloMat.color.set(0xffffff);
      trailColor.copy(baseTrail);
      mat.emissive.set(0xffffff);
      mat.emissiveIntensity = 0.22;
    }
  }

  function dispose() {
    for (const o of [mesh, trail]) if (o.parent) o.parent.remove(o);
    mesh.geometry.dispose(); mat.dispose(); haloMat.dispose();
    shadow.geometry.dispose(); shadowMat.dispose(); tGeo.dispose(); tMat.dispose();
  }

  return { mesh, trail, update, setGlow, dispose };
}
