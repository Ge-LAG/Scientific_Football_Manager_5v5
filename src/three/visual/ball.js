// Ballon « labo » : panneaux blancs, pentagones marine à liseré lumineux, coutures en creux (normal map),
// vernis (clearcoat) en haute qualité ; rotation physique tirée du déplacement réel (roulement au sol, effet
// conservé en l'air), écrasement au rebond, traînée + flou de mouvement étiré à grande vitesse, ombre douce, halo.
import * as THREE from "three";
import { makeCanvas, canvasTexture, cached, glowTexture, shadowTexture, clamp, smooth } from "./util.js";
import { normLevel, atLeast } from "../render/quality.js";

const VIS_R = 0.16;   // rayon affiché
const PHYS_R = 0.11;  // rayon physique (position reçue = centre physique)
const TRAIL_N = 22;   // points de traînée
const TRAIL_STEP = 0.14;
const RIM = new THREE.Color("#00F0FF");
const WHITE = new THREE.Color(1, 1, 1);

// Textures équirectangulaires : Voronoï sphérique des 32 faces d'un icosaèdre tronqué
// → couleur (sRGB), masque émissif (liseré des pentagones), normal map (coutures en creux, panneaux bombés)
function ballTextures(q) {
  return cached(`tex:ball2:${q === "low" ? "low" : "hi"}`, () => {
    const W = q === "low" ? 256 : 512, H = W / 2;
    const t = (1 + Math.sqrt(5)) / 2;
    const ico = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .map(v => new THREE.Vector3(...v).normalize());
    const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const centers = [...ico.map(v => [v, 1]), ...faces.map(f => [ico[f[0]].clone().add(ico[f[1]]).add(ico[f[2]]).normalize(), 0])];
    const cx = new Float32Array(32), cy = new Float32Array(32), cz = new Float32Array(32);
    centers.forEach(([v], i) => { cx[i] = v.x; cy[i] = v.y; cz[i] = v.z; });
    const col = makeCanvas(W, H), gc = col.getContext("2d"), imgC = gc.createImageData(W, H), dc = imgC.data;
    const emi = makeCanvas(W, H), ge = emi.getContext("2d"), imgE = ge.createImageData(W, H), de = imgE.data;
    const height = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const th = (y + 0.5) / H * Math.PI, st = Math.sin(th), ct = Math.cos(th);
      for (let x = 0; x < W; x++) {
        const ph = (x + 0.5) / W * Math.PI * 2;
        // même paramétrage que SphereGeometry
        const px = -Math.cos(ph) * st, py = ct, pz = Math.sin(ph) * st;
        let b1 = -2, b2 = -2, k1 = 0;
        for (let i = 0; i < 32; i++) {
          const dd = px * cx[i] + py * cy[i] + pz * cz[i];
          if (dd > b1) { b2 = b1; b1 = dd; k1 = i; } else if (dd > b2) b2 = dd;
        }
        const pent = centers[k1][1] === 1;
        const sd = b1 - b2;             // ~ distance à la couture
        const o = (y * W + x) * 4;
        let r, g, b, e = 0;
        if (sd < 0.011) { r = 92; g = 98; b = 116; }
        else if (pent) {
          r = 18; g = 24; b = 46;
          if (sd > 0.02 && sd < 0.036) { e = 255; r = 40; g = 190; b = 220; } // liseré néon
        } else { const s = 236 + (b1 - 0.9) * 110; r = s; g = s + 1; b = s + 6; }
        dc[o] = r; dc[o + 1] = g; dc[o + 2] = b; dc[o + 3] = 255;
        de[o] = de[o + 1] = de[o + 2] = e; de[o + 3] = 255;
        height[y * W + x] = Math.sqrt(Math.min(1, sd / 0.03)) * 0.85 + (b1 - 0.88) * 1.2;
      }
    }
    gc.putImageData(imgC, 0, 0);
    ge.putImageData(imgE, 0, 0);
    const map = canvasTexture(col, { aniso: 4 });
    const emissiveMap = canvasTexture(emi, { aniso: 4 });
    let normalMap = null;
    if (q !== "low") {
      const nc = makeCanvas(W, H), gn = nc.getContext("2d"), imgN = gn.createImageData(W, H), dn = imgN.data;
      const K = 2.2;
      for (let y = 0; y < H; y++) {
        const st = Math.max(0.2, Math.sin((y + 0.5) / H * Math.PI));
        const ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1);
        for (let x = 0; x < W; x++) {
          const xm = (x - 1 + W) % W, xp = (x + 1) % W;
          const dx = (height[y * W + xp] - height[y * W + xm]) * 0.5 / st;
          const dy = (height[yp * W + x] - height[ym * W + x]) * 0.5; // ligne suivante = v décroissant
          let nx = -dx * K, ny = dy * K, nz = 1;
          const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
          const o = (y * W + x) * 4;
          dn[o] = (nx * 0.5 + 0.5) * 255; dn[o + 1] = (ny * 0.5 + 0.5) * 255; dn[o + 2] = (nz * 0.5 + 0.5) * 255; dn[o + 3] = 255;
        }
      }
      gn.putImageData(imgN, 0, 0);
      normalMap = canvasTexture(nc, { srgb: false, aniso: 4 });
    }
    for (const tx of [map, emissiveMap, normalMap]) if (tx) tx.userData.shared = true;
    return { map, emissiveMap, normalMap };
  });
}

export function createBall({ quality = "high" } = {}) {
  let q = normLevel(quality);
  const tex = ballTextures(q);
  const common = {
    map: tex.map, emissiveMap: tex.emissiveMap, emissive: RIM.clone(), emissiveIntensity: 1.4,
    roughness: 0.4, metalness: 0.02,
  };
  const mat = atLeast(q, "high")
    ? new THREE.MeshPhysicalMaterial({ ...common, normalMap: tex.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), clearcoat: 0.75, clearcoatRoughness: 0.2, roughness: 0.48 })
    : new THREE.MeshStandardMaterial({ ...common, ...(tex.normalMap ? { normalMap: tex.normalMap, normalScale: new THREE.Vector2(0.7, 0.7) } : {}) });
  const seg = q === "low" ? 18 : 32;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(VIS_R, seg, Math.round(seg * 0.7)), mat);
  mesh.castShadow = atLeast(q, "high");
  mesh.name = "ball";
  mesh.matrixAutoUpdate = false; // matrice composée à la main (écrasement vertical + rotation)

  // halo (power-up / tir puissant)
  const haloMat = new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
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

  // flou de mouvement : copie translucide étirée le long de la vitesse
  const smearMat = new THREE.MeshBasicMaterial({ color: 0xdff3ff, transparent: true, opacity: 0, depthWrite: false });
  const smear = new THREE.Mesh(new THREE.SphereGeometry(VIS_R * 0.97, 16, 10), smearMat);
  smear.visible = false; smear.renderOrder = 4;
  trail.add(smear);

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
  const tMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const ribbon = new THREE.Mesh(tGeo, tMat);
  ribbon.frustumCulled = false;
  ribbon.renderOrder = 5;
  trail.add(ribbon);

  const trailColor = new THREE.Color("#9ff6ff");
  const baseTrail = new THREE.Color("#9ff6ff");
  let glowOn = false, intensity = 0, init = false, squash = 0, squashT = 1;
  const omega = new THREE.Vector3(), vS = new THREE.Vector3(), measV = new THREE.Vector3(), prevPos = new THREE.Vector3();
  let hasPrev = false, prevVy = 0;
  const _axis = new THREE.Vector3(), _dq = new THREE.Quaternion(), _target = new THREE.Vector3(), _sm = new THREE.Matrix4();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3();
  const UPV = new THREE.Vector3(0, 1, 0);

  function resetHistory(x, y, z) {
    for (let i = 0; i < TRAIL_N; i++) { hist[i * 3] = x; hist[i * 3 + 1] = y; hist[i * 3 + 2] = z; }
  }

  function update(pos, vel, dt = 1 / 60) {
    dt = clamp(dt || 0, 0, 0.1);
    const x = pos.x, z = pos.z, h = Math.max(0, pos.y - PHYS_R);
    const y = pos.y + (VIS_R - PHYS_R);

    // vitesse réelle (déplacement entre deux images), repli sur la vitesse fournie
    const teleport = hasPrev && Math.hypot(x - prevPos.x, pos.y - prevPos.y, z - prevPos.z) > 3;
    if (hasPrev && dt > 1e-4 && !teleport) measV.set((x - prevPos.x) / dt, (pos.y - prevPos.y) / dt, (z - prevPos.z) / dt);
    else if (vel) measV.set(vel.x || 0, vel.y || 0, vel.z || 0);
    else measV.set(0, 0, 0);
    if (teleport) { omega.set(0, 0, 0); vS.copy(measV); }
    prevPos.set(x, pos.y, z); hasPrev = true;
    if (dt > 0) vS.lerp(measV, 1 - Math.exp(-dt * 22));

    // rotation : roulement sans glissement au sol (ω = haut × v / r), effet conservé en l'air
    if (h < 0.06) {
      _target.set(vS.z, 0, -vS.x).multiplyScalar(1 / VIS_R);
      omega.lerp(_target, 1 - Math.exp(-dt * 25));
    } else omega.multiplyScalar(Math.exp(-dt * 0.35));
    const w = omega.length();
    if (w > 1e-4 && dt > 0) {
      _axis.copy(omega).multiplyScalar(1 / w);
      _dq.setFromAxisAngle(_axis, w * dt);
      mesh.quaternion.premultiply(_dq);
    }

    // écrasement au rebond (vitesse verticale qui s'inverse près du sol)
    if (h < 0.12 && prevVy < -2.5 && vS.y > -0.5) { squash = Math.min(0.2, -prevVy * 0.018); squashT = 0; }
    prevVy = vS.y;
    squashT += dt;
    const sq = squash * Math.exp(-squashT * 14) * Math.cos(squashT * 38);
    mesh.position.set(x, y - sq * VIS_R, z);
    _sm.makeScale(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    mesh.matrix.makeRotationFromQuaternion(mesh.quaternion).premultiply(_sm).setPosition(mesh.position);
    mesh.scale.set(1, 1, 1);
    mesh.matrixWorldNeedsUpdate = true;

    // ombre
    shadow.position.set(x, 0.013, z);
    shadow.scale.setScalar(1 + h * 0.35);
    shadowMat.opacity = 0.62 / (1 + h * 0.9);

    // traînée
    if (!init || teleport || Math.hypot(x - hist[0], y - hist[1], z - hist[2]) > 3) { resetHistory(x, y, z); init = true; }
    const dx = x - hist[3], dy = y - hist[4], dz = z - hist[5];
    if (Math.hypot(dx, dy, dz) > TRAIL_STEP) hist.copyWithin(3, 0, (TRAIL_N - 1) * 3);
    hist[0] = x; hist[1] = y; hist[2] = z;
    const speed = vS.length();
    const target = smooth(8, 14, speed);
    intensity += (target - intensity) * (1 - Math.exp(-dt * (target > intensity ? 12 : 4)));
    ribbon.visible = intensity > 0.01;
    if (ribbon.visible) {
      const hdr = 1 + smooth(14, 26, speed) * 0.9;
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
        const wd = VIS_R * 0.9 * f;
        const o = i * 12;
        tPos[o] = _a.x + _s1.x * wd; tPos[o + 1] = _a.y + _s1.y * wd; tPos[o + 2] = _a.z + _s1.z * wd;
        tPos[o + 3] = _a.x - _s1.x * wd; tPos[o + 4] = _a.y - _s1.y * wd; tPos[o + 5] = _a.z - _s1.z * wd;
        tPos[o + 6] = _a.x + _s2.x * wd; tPos[o + 7] = _a.y + _s2.y * wd; tPos[o + 8] = _a.z + _s2.z * wd;
        tPos[o + 9] = _a.x - _s2.x * wd; tPos[o + 10] = _a.y - _s2.y * wd; tPos[o + 11] = _a.z - _s2.z * wd;
        const k = intensity * f * f * 0.9 * hdr;
        for (let v = 0; v < 4; v++) {
          tCol[o + v * 3] = trailColor.r * k; tCol[o + v * 3 + 1] = trailColor.g * k; tCol[o + v * 3 + 2] = trailColor.b * k;
        }
      }
      tGeo.attributes.position.needsUpdate = true;
      tGeo.attributes.color.needsUpdate = true;
    }

    // flou de mouvement étiré (longueur ≈ vitesse × obturateur)
    const ks = smooth(6, 20, speed);
    smear.visible = ks > 0.02;
    if (smear.visible) {
      const L = Math.min(1.1, speed * 0.03);
      _d.copy(vS).multiplyScalar(1 / Math.max(1e-3, speed));
      smear.position.set(x - _d.x * L * 0.5, y - _d.y * L * 0.5, z - _d.z * L * 0.5);
      smear.quaternion.setFromUnitVectors(UPV, _d);
      smear.scale.set(1, 1 + L / (2 * VIS_R), 1);
      smearMat.opacity = 0.34 * ks;
      smearMat.color.copy(trailColor).lerp(WHITE, 0.65);
    }
    haloMat.opacity = glowOn ? 0.85 : Math.min(0.5, intensity * 0.45);
  }

  function setGlow(colorHex) {
    glowOn = !!colorHex;
    if (glowOn) {
      haloMat.color.set(colorHex);
      trailColor.set(colorHex);
      mat.emissive.set(colorHex);
      mat.emissiveIntensity = 3;
    } else {
      haloMat.color.set(0xffffff);
      trailColor.copy(baseTrail);
      mat.emissive.copy(RIM);
      mat.emissiveIntensity = 1.4;
    }
  }

  // Ombres portées selon la qualité (optionnel)
  function setQuality(nq) { q = normLevel(nq); mesh.castShadow = atLeast(q, "high"); }

  function dispose() {
    for (const o of [mesh, trail]) if (o.parent) o.parent.remove(o);
    mesh.geometry.dispose(); mat.dispose(); haloMat.dispose();
    shadow.geometry.dispose(); shadowMat.dispose(); tGeo.dispose(); tMat.dispose();
    smear.geometry.dispose(); smearMat.dispose();
  }

  return { mesh, trail, update, setGlow, setQuality, dispose };
}
