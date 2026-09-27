// Effets visuels spécifiques des power-ups dans l'Arène : chaque effet a une forme lisible.
import * as THREE from "three";

// effet → { kind, radius, color }
const STYLE = {
  firewall:       { kind: "dome", radius: 3.2, color: "#39FF14" },
  slowAura:       { kind: "field", radius: 9, color: "#FF00E5" },
  tackleImmune:   { kind: "dome", radius: 1.0, color: "#00F0FF" },
  tackleRange:    { kind: "ring", radius: 2.2, color: "#00CCFF" },
  sureTackle:     { kind: "ring", radius: 1.4, color: "#FF3366" },
  perfectPass:    { kind: "ring", radius: 1.6, color: "#FFD700" },
  passBoost:      { kind: "ring", radius: 1.6, color: "#FFD700" },
  teamAura:       { kind: "field", radius: 4, color: "#FF8C00" },
  noStaminaDrain: { kind: "ring", radius: 1.2, color: "#8B5CF6" },
  speedBoost:     { kind: "trail", color: "#00CCFF" },
  freeSprint:     { kind: "trail", color: "#9D4EDD" },
  ballGlue:       { kind: "trail", color: "#B8FF00" },
  perfectShot:    { kind: "ballGlow", color: "#FF6B35" },
  powerShot:      { kind: "ballGlow", color: "#FF3366" },
  teamStamina:    { kind: "ring", radius: 1.2, color: "#66FF66" },
};

export function createPuVisuals(scene, effects) {
  const active = new Map(); // slot → { group, kind, t }
  const geoDome = new THREE.IcosahedronGeometry(1, 1);
  const geoRing = new THREE.RingGeometry(0.92, 1, 48);

  function make(style) {
    const g = new THREE.Group();
    const color = new THREE.Color(style.color);
    if (style.kind === "dome") {
      const m = new THREE.Mesh(geoDome, new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.35, depthWrite: false }));
      m.scale.setScalar(style.radius); m.position.y = style.radius * 0.35; g.add(m);
      const fill = new THREE.Mesh(geoDome, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }));
      fill.scale.setScalar(style.radius); fill.position.y = style.radius * 0.35; g.add(fill);
    } else if (style.kind === "ring" || style.kind === "field") {
      const m = new THREE.Mesh(geoRing, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.scale.setScalar(style.radius); g.add(m);
      if (style.kind === "field") {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending }));
        disc.rotation.x = -Math.PI / 2; disc.position.y = 0.035; disc.scale.setScalar(style.radius); g.add(disc);
      }
    }
    return g;
  }

  // à appeler à chaque image : avatars (positions), drapeaux (bit 8 = power-up actif), effets actifs par slot
  function update(avatars, flagsOf, effectOf, dt, time, ballOwner) {
    let ballGlow = null;
    for (const av of avatars) {
      const on = !!(flagsOf(av.slot) & 8); const fx = on ? effectOf(av.slot) : null; const st = fx && STYLE[fx];
      let cur = active.get(av.slot);
      if (cur && (!st || cur.fx !== fx)) { scene.remove(cur.group); cur.group.traverse(o => { o.material?.dispose?.(); if (o.geometry && o.geometry !== geoDome && o.geometry !== geoRing) o.geometry.dispose(); }); active.delete(av.slot); cur = null; }
      if (!st) continue;
      if (!cur) { cur = { group: make(st), fx, kind: st.kind, acc: 0 }; scene.add(cur.group); active.set(av.slot, cur); }
      const p = av.group.position; cur.group.position.set(p.x, 0, p.z);
      cur.group.rotation.y += dt * 0.6;
      const pulse = 1 + Math.sin(time * 5) * 0.04; cur.group.scale.setScalar(pulse);
      if (st.kind === "trail") { cur.acc += dt; if (cur.acc > 0.08) { cur.acc = 0; effects.burst(new THREE.Vector3(p.x, 0.3, p.z), st.color, { count: 3, speed: 0.6, up: 0.4, size: 0.6 }); } }
      if (st.kind === "ballGlow" && ballOwner === av.slot) ballGlow = st.color;
    }
    return ballGlow;
  }

  function dispose() { for (const c of active.values()) { scene.remove(c.group); c.group.traverse(o => { o.material?.dispose?.(); if (o.geometry && o.geometry !== geoDome && o.geometry !== geoRing) o.geometry.dispose(); }); } active.clear(); geoDome.dispose(); geoRing.dispose(); }
  return { update, dispose };
}
