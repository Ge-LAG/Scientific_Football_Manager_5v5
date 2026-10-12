// Avatar 3D cel-shadé d'un joueur-scientifique : un seul maillage skinné (+ contour « coque inversée »),
// apparence personnalisable (shared/data/appearance.js) et animation procédurale par états (avatar/anim.js).
// Conventions : pieds à y=0, regarde vers +Z local, gauche du joueur = +X local, hauteur ≈ player.taille.
import * as THREE from "three";
import {
  NEON, normQuality, makeCanvas, canvasTexture, cached, glowTexture, ringTexture, beamTexture, clamp, lerp, disposeTree,
} from "./util.js";
import { defaultAppearance, sanitizeAppearance } from "../../../shared/data/appearance.js";
import { DETAIL, mergeParts, V3 } from "./avatar/kit.js";
import { H0, BONES, B, PARENT_INDEX, bodyMetrics, torsoW } from "./avatar/skeleton.js";
import { buildBody, KEEPER } from "./avatar/body.js";
import { buildHead } from "./avatar/head.js";
import { buildAccessory, capeSurf, capeW } from "./avatar/accessories.js";
import { bodyMaterial, outlineMaterial, lensMaterial, toonGradient, starMaterial } from "./avatar/materials.js";
import { createAnimator, CELEBRATIONS } from "./avatar/anim.js";
import { drawDecal, drawLabel, drawMarker } from "./avatar/labels.js";

export { CELEBRATIONS };

// ── Couleurs ──
const SKIN = ["#ffe3cf", "#f6cba6", "#e2a77e", "#b97a50", "#8a5634", "#5a3521"].map(c => new THREE.Color(c));
function skinColor(t) {
  const x = clamp(+t || 0, 0, 1) * (SKIN.length - 1), i = Math.min(SKIN.length - 2, Math.floor(x));
  return SKIN[i].clone().lerp(SKIN[i + 1], x - i);
}
const C3 = h => (h && h.isColor ? h.clone() : new THREE.Color(h));
const mix = (a, b, t) => C3(a).lerp(C3(b), t);
const isNeon = c => { const hsl = {}; C3(c).getHSL(hsl); return hsl.s > 0.6 && hsl.l > 0.4; };

function palette(app, teamColor, teamColor2, keeper) {
  const skin = skinColor(app.skin), hair = C3(app.hairColor), beard = C3(app.facialHairColor), team = C3(teamColor);
  const acc = C3(app.outfitColor);
  return {
    skin, skinDark: skin.clone().multiplyScalar(0.78), nose: mix(skin, "#c8705e", 0.07), blush: mix(skin, "#ff6f80", 0.3),
    // détails du visage adulte
    lid: mix(skin, "#4a2018", 0.42), lidLine: mix(skin, "#3a1a16", 0.45), lash: mix(hair, "#0c0808", 0.7), caruncle: mix(skin, "#e07a7a", 0.45),
    nostril: mix(skin, "#1e0c0a", 0.75), lip: mix(skin, "#9c4a44", 0.3), lipLine: mix(skin, "#2e1010", 0.72), scar: mix(skin, "#fff0ea", 0.32),
    sclera: C3("#ece8e1"), irisDark: C3(app.eyeColor).multiplyScalar(0.28),
    team: keeper ? C3(KEEPER.jersey) : team.clone(), teamRaw: team, team2: C3(teamColor2), teamDk: team.clone().multiplyScalar(0.62),
    trim: keeper ? team.clone() : acc.clone(), acc, accDk: acc.clone().multiplyScalar(0.55),
    shoe: C3(app.shoeColor), eye: C3(app.eyeColor), hair, brow: mix(hair, "#000000", 0.28), beard, stubble: mix(skin, beard, 0.42),
    hairTone: {
      hair, buzz: mix(skin, hair, 0.8), shaved: mix(skin, hair, 0.4), fade1: mix(skin, hair, 0.5), fade2: mix(skin, hair, 0.78),
      shine: mix(hair, "#ffffff", 0.45), dark: hair.clone().multiplyScalar(0.62), tie: C3("#1d1d26"),
      root: mix(hair, "#000000", 0.45), skin: mix(skin, hair, 0.18),
    },
    hairGlow: isNeon(hair) ? 0.35 : 0, keeper,
  };
}

// ── Géométries partagées (effets) ──
const sharedGeo = (k, fn) => cached(`av:geo:${k}`, fn);
const G = {
  flat: () => sharedGeo("flat", () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
  beam: () => sharedGeo("beam", () => new THREE.CylinderGeometry(0.62, 0.5, 2.5, 20, 1, true).translate(0, 1.25, 0)),
  chevron: () => sharedGeo("chevron", () => new THREE.ConeGeometry(0.1, 0.18, 4).rotateX(Math.PI)),
  stars: () => sharedGeo("stars", () => {
    const list = [], col = [];
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.028 : 0.065, a = (i / 10) * Math.PI * 2 + Math.PI / 2; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2, g = new THREE.ExtrudeGeometry(star, { depth: 0.018, bevelEnabled: false }).translate(0, 0, -0.009).rotateY(a + Math.PI / 2).translate(Math.cos(a) * 0.19, (i % 2) * 0.035, Math.sin(a) * 0.19);
      list.push(g.index ? g.toNonIndexed() : g); col.push(i % 2 ? "#ffe36b" : "#ffc21a");
      const sp = new THREE.OctahedronGeometry(0.022).translate(Math.cos(a + 0.8) * 0.16, 0.06, Math.sin(a + 0.8) * 0.16);
      list.push(sp.index ? sp.toNonIndexed() : sp); col.push("#ffffff");
    }
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), cc = new Float32Array(n * 3), c = new THREE.Color();
    let o = 0;
    list.forEach((g, k) => { pos.set(g.attributes.position.array, o * 3); c.set(col[k]); for (let i = 0; i < g.attributes.position.count; i++) cc.set([c.r, c.g, c.b], (o + i) * 3); o += g.attributes.position.count; g.dispose(); });
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("color", new THREE.BufferAttribute(cc, 3));
    return out;
  }),
};
const markerTex = blob => cached(`av:marker:${blob ? 1 : 0}`, () => { const c = makeCanvas(128, 128); drawMarker(c, blob); return canvasTexture(c); });

// Dossard enroulé sur le dos (ou la cape), skinné comme le tronc
function decalGeometry(M, backOff, cape) {
  const nu = 8, nv = 6, pos = [], nor = [], uv = [], si = [], sw = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv;
    let p, n, w;
    if (cape) {
      p = capeSurf(M, backOff, lerp(0.62, -0.62, u), lerp(0.07, 0.43, v));
      p.z -= 0.007; n = V3(0, 0, -1); w = capeW(p.x, p.y);
    } else {
      const y = lerp(1.405, 1.105, v), t = M.torsoAt(y), rx = t.rx + backOff + 0.004, rz = t.rz + backOff + 0.004;
      const ds = rz, s = lerp(0.135, -0.135, u), a = Math.PI - s / ds;
      p = V3(rx * Math.sin(a), y, t.z + rz * Math.cos(a));
      n = V3(Math.sin(a) / rx, 0, Math.cos(a) / rz).normalize();
      w = torsoW(p.x, p.y);
    }
    pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(u, 1 - v);
    const ws = w.filter(e => e[1] > 1e-4).slice(0, 4), tot = ws.reduce((a, e) => a + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) { si.push(ws[k] ? ws[k][0] : 0); sw.push(ws[k] ? ws[k][1] / tot : 0); }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  return g;
}

// ───────────────────────── Avatar ─────────────────────────

export function createAvatar(player, {
  teamColor = NEON.cyan, teamColor2 = "#111111", isKeeper = false, quality = "high", appearance, teamMarker = true,
} = {}) {
  const q = normQuality(quality), low = q === "low", d = DETAIL[q], withOutline = !low, shadows = q === "high";
  const accent = player.color || NEON.cyan;
  let app = appearance ? sanitizeAppearance(appearance, player.id) : defaultAppearance(player.id);
  let keeper = !!isKeeper, team1 = teamColor, team2 = teamColor2;

  const root = new THREE.Group();
  root.name = `avatar:${player.id}`;
  const height = player.taille || H0;
  const scale = height / H0;
  const rig = new THREE.Group();
  rig.scale.setScalar(scale);
  root.add(rig);

  // ── Squelette ──
  const bones = BONES.map(n => { const b = new THREE.Bone(); b.name = n; return b; });
  BONES.forEach((n, i) => { if (PARENT_INDEX[i] >= 0) bones[PARENT_INDEX[i]].add(bones[i]); });
  const skeleton = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
  const rest = bones.map(() => new THREE.Vector3());
  const abs = bones.map(() => new THREE.Vector3());
  const sphere = new THREE.Sphere(V3(0, 0.95, 0), 1.55);
  const mkSkinned = (geo, mat) => {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.bind(skeleton, new THREE.Matrix4());
    m.boundingSphere = sphere.clone();
    return m;
  };

  // ── Construction du visuel (géométrie fusionnée + infos) ──
  let furColor = null;
  function buildVisual() {
    const M = bodyMetrics(app.build);
    const col = palette(app, team1, team2, keeper);
    furColor = mix(app.outfitColor, "#bfc2cc", 0.6);
    const ctx = { M, d, q, key: `${M.build}|${d}`, parts: [], col, app, furColor };
    const info = buildBody(ctx, app.outfit);
    const headInfo = buildHead(ctx, info.hood || null);
    if (app.accessory !== "none") buildAccessory(ctx, app.accessory, info);
    const parts = ctx.parts.map(p => ({ s: p.s, c: C3(p.c), c2: p.c2 != null ? C3(p.c2) : null, g: p.g || 0, o: p.o !== false }));
    const merged = mergeParts(parts, withOutline);
    return { M, info, headInfo, col, ...merged };
  }
  function setRest(M, pv, face) {
    // os du visage (yeux, sourcils, bouche) placés selon la forme du visage et des yeux
    const bind = { ...M.bind, ...(face || {}), hairBack: pv.back.toArray(), hairTail: pv.tail.toArray(), hatTip: pv.tip.toArray() };
    BONES.forEach((n, i) => abs[i].fromArray(bind[n]));
    BONES.forEach((n, i) => {
      const p = PARENT_INDEX[i];
      rest[i].copy(abs[i]);
      if (p >= 0) rest[i].sub(abs[p]);
      bones[i].position.copy(rest[i]);
      skeleton.boneInverses[i].makeTranslation(-abs[i].x, -abs[i].y, -abs[i].z);
    });
  }

  let vis = buildVisual();
  setRest(vis.M, vis.headInfo.pivots, vis.headInfo.face);
  const body = mkSkinned(vis.geo, bodyMaterial(q));
  body.add(bones[B.hips]);
  body.castShadow = shadows;
  rig.add(body);
  let outline = null;
  if (withOutline) {
    outline = mkSkinned(vis.ogeo || new THREE.BufferGeometry(), outlineMaterial());
    outline.castShadow = false;
    rig.add(outline);
  }

  // dossard (nom + numéro)
  const decalCanvas = makeCanvas(256, 256);
  const decalTex = canvasTexture(decalCanvas);
  const decalMat = new THREE.MeshToonMaterial({ map: decalTex, gradientMap: toonGradient(), transparent: true, alphaTest: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const decal = mkSkinned(decalGeometry(vis.M, vis.info.backOff, app.accessory === "cape"), decalMat);
  decal.castShadow = false;
  decal.renderOrder = 1;
  rig.add(decal);
  function refreshDecal() {
    const back = app.accessory === "cape" ? vis.col.teamRaw : C3(vis.info.backColor || vis.col.team);
    drawDecal(decalCanvas, player.nom || player.id, player.numero ?? "", "#" + back.getHexString(), "#" + vis.col.trim.getHexString());
    decalTex.needsUpdate = true;
  }

  // verres translucides (enfants de l'os de la tête)
  let lensMeshes = [];
  function buildLenses() {
    for (const m of lensMeshes) { m.parent?.remove(m); m.geometry.dispose(); }
    lensMeshes = vis.headInfo.lenses.map(l => {
      const hex = "#" + C3(l.color).getHexString();
      const m = new THREE.Mesh(l.g.translate(-abs[B.head].x, -abs[B.head].y, -abs[B.head].z), lensMaterial(hex));
      m.renderOrder = 3;
      bones[B.head].add(m);
      return m;
    });
  }
  buildLenses();

  // ── Étiquette flottante ──
  const labelCanvas = makeCanvas(512, 128);
  drawLabel(labelCanvas, player.nom || player.id, player.numero ?? "", accent);
  const labelTex = canvasTexture(labelCanvas);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, depthTest: false, depthWrite: false, transparent: true }));
  label.scale.set(1.3, 0.325, 1);
  label.renderOrder = 20;
  root.add(label);
  const placeLabel = () => { label.position.y = height + 0.42 + vis.headInfo.labelLift * scale; };
  placeLabel();

  // ── Marqueur au sol : ombre douce (sans shadow map) + anneau couleur d'équipe ──
  const markerMat = new THREE.MeshBasicMaterial({ map: markerTex(!shadows), color: team1, transparent: true, depthWrite: false, opacity: teamMarker ? 0.62 : 0.75 });
  if (!teamMarker) markerMat.map = cached("av:marker:blobOnly", () => { const c = makeCanvas(128, 128); const g = c.getContext("2d"); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(0,0,0,0.85)"); gr.addColorStop(0.5, "rgba(0,0,0,0.45)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return canvasTexture(c, { srgb: false }); });
  const marker = new THREE.Mesh(G.flat(), markerMat);
  marker.scale.setScalar(teamMarker ? 1.15 : 0.95);
  marker.position.y = 0.012;
  marker.renderOrder = 1;
  marker.visible = teamMarker || !shadows;
  root.add(marker);

  // ── Marqueur joueur local ──
  const hlMat = new THREE.MeshBasicMaterial({ map: ringTexture(), color: NEON.lime, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const hlRing = new THREE.Mesh(G.flat(), hlMat);
  hlRing.scale.setScalar(1.35);
  hlRing.position.y = 0.02;
  hlRing.renderOrder = 2;
  const chevMat = new THREE.MeshBasicMaterial({ color: NEON.lime, toneMapped: false, depthTest: false, transparent: true });
  const chevron = new THREE.Mesh(G.chevron(), chevMat);
  chevron.renderOrder = 21;
  const hlGroup = new THREE.Group();
  hlGroup.add(hlRing, chevron);
  hlGroup.visible = false;
  root.add(hlGroup);

  // ── Aura de power-up (créée à la demande) ──
  let aura = null, auraColor = null;
  function buildAura() {
    const g = new THREE.Group();
    const add2 = (mesh, ro) => { mesh.renderOrder = ro; g.add(mesh); return mesh; };
    const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const ring1 = add2(new THREE.Mesh(G.flat(), ringMat), 3); ring1.position.y = 0.03; ring1.scale.setScalar(1.7);
    const ring2 = add2(new THREE.Mesh(G.flat(), ringMat), 3); ring2.position.y = 0.035; ring2.scale.setScalar(1.1);
    const beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const beam = add2(new THREE.Mesh(G.beam(), beamMat), 4);
    const N = low ? 12 : 28;
    const pos = new Float32Array(N * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const pm = new THREE.PointsMaterial({ map: glowTexture(), size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const pts = add2(new THREE.Points(pg, pm), 5);
    pts.frustumCulled = false;
    const seeds = Array.from({ length: N }, () => [Math.random() * Math.PI * 2, 0.35 + Math.random() * 0.3, Math.random(), 0.5 + Math.random() * 0.8]);
    g.visible = false;
    root.add(g);
    return { g, ring1, ring2, beam, pts, pos, seeds, mats: [ringMat, beamMat, pm] };
  }

  // ── Étoiles d'étourdissement (créées à la demande, enfant de la tête) ──
  let stars = null;
  function buildStars() {
    const m = new THREE.Mesh(G.stars(), starMaterial());
    m.castShadow = false;
    bones[B.head].add(m);
    return m;
  }
  const placeStars = () => { if (stars) stars.position.set(0, (vis.M.C.y - abs[B.head].y) + 0.28 + vis.headInfo.labelLift * 0.6, 0); };

  // ── Animation ──
  const anim = createAnimator({ bones, rest, keeper, height, root });

  // ── Reconstruction (apparence, couleurs, gardien) : garde la pose et l'état ──
  function rebuild() {
    const old = [body.geometry, outline?.geometry, decal.geometry];
    vis = buildVisual();
    setRest(vis.M, vis.headInfo.pivots, vis.headInfo.face);
    body.geometry = vis.geo;
    if (outline) outline.geometry = vis.ogeo || new THREE.BufferGeometry();
    decal.geometry = decalGeometry(vis.M, vis.info.backOff, app.accessory === "cape");
    for (const g of old) g?.dispose();
    buildLenses();
    placeLabel();
    placeStars();
    refreshDecal();
    markerMat.color.set(team1);
  }
  refreshDecal();

  // ── API ──
  let clock = 0, hl = false;
  function setState(state = {}, dt = 1 / 60) {
    dt = clamp(dt || 0, 0, 0.1);
    clock += dt;
    anim.update(state || {}, dt);
    const stun = anim.state === "stunned";
    if (stun && !stars) { stars = buildStars(); placeStars(); }
    if (stars) {
      stars.visible = stun;
      if (stun) { stars.rotation.set(0.25 * Math.sin(clock * 3), clock * 4, 0.2 * Math.cos(clock * 2.3)); }
    }
    if (hl) {
      hlRing.material.opacity = 0.75 + 0.25 * Math.sin(clock * 5);
      chevron.position.y = height + 0.78 + vis.headInfo.labelLift * scale + Math.sin(clock * 4) * 0.06;
      chevron.rotation.y = clock * 2;
    }
    if (aura && aura.g.visible) {
      aura.ring1.rotation.y = clock * 1.5;
      aura.ring2.rotation.y = -clock * 2.2;
      aura.ring2.scale.setScalar(1.1 * (1 + Math.sin(clock * 6) * 0.08));
      aura.beam.rotation.y = clock * 0.9;
      aura.beam.scale.set(1, scale * (0.95 + Math.sin(clock * 3) * 0.05), 1);
      const N = aura.seeds.length, p = aura.pos;
      for (let i = 0; i < N; i++) {
        const [a0, rad, off, spd] = aura.seeds[i];
        const u = (clock * 0.45 * spd + off) % 1, a = a0 + clock * 2 * spd, rr = rad * (1 - u * 0.4);
        p[i * 3] = Math.cos(a) * rr; p[i * 3 + 1] = u * 2.3; p[i * 3 + 2] = Math.sin(a) * rr;
      }
      aura.pts.geometry.attributes.position.needsUpdate = true;
    }
  }

  function setKeeper(v) {
    if (!!v === keeper) return;
    keeper = !!v;
    anim.setKeeper(keeper);
    rebuild();
  }
  function setAppearance(a) {
    app = sanitizeAppearance(a, player.id);
    rebuild();
  }
  function setTeamColors(c1, c2) {
    if (c1) team1 = c1;
    if (c2) team2 = c2;
    rebuild();
  }
  function setLookAt(v) { anim.setTarget(v && v.isVector3 ? v : null); }
  function setHighlight(v) {
    hl = !!v;
    hlGroup.visible = hl;
    chevron.position.y = height + 0.78 + vis.headInfo.labelLift * scale;
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
    for (const m of lensMeshes) m.geometry.dispose();
    lensMeshes = [];
    disposeTree(root);
    skeleton.dispose();
  }

  setState({ speed: 0, action: "idle" }, 0);

  return {
    group: root, player, height,
    setState, setKeeper, setHighlight, setPowerUp, setLabelVisible, dispose,
    setAppearance, setLookAt, setTeamColors,
    get isKeeper() { return keeper; },
    get appearance() { return { ...app }; },
    get celebration() { return CELEBRATIONS[anim.variant % CELEBRATIONS.length]; },
    get stats() { return { vertices: vis.verts, outlineVertices: vis.ogeo ? vis.ogeo.attributes.position.count : 0, bones: bones.length }; },
  };
}
