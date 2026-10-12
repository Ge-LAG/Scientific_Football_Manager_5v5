// Aperçu 3D d'un scientifique (éditeur d'apparence, fiche joueur) : plateau tournant, éclairage studio,
// animation au choix, rotation à la souris / au doigt, cadrage silhouette ou visage.
import * as THREE from "three";
import { createAvatar } from "./visual/index.js";
import { getPlayer } from "../../shared/data/content.js";

export function createAvatarPreview(container, { charId, appearance, teamColor = "#00F0FF", quality = "high", action = "idle" } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement; canvas.style.touchAction = "none"; canvas.style.cursor = "grab";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  // éclairage studio : lumière principale chaude, contre-jour froid, remplissage
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x1a1030, 0.9));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.2); key.position.set(2.5, 4, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: 0.5, far: 12 }); scene.add(key);
  const rim = new THREE.DirectionalLight(0x66e8ff, 2.4); rim.position.set(-3, 2.5, -3); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xff66e5, 1.4); rim2.position.set(3, 1.5, -2.5); scene.add(rim2);
  // socle néon
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.12, 64), new THREE.MeshStandardMaterial({ color: 0x0c1022, roughness: 0.35, metalness: 0.6 }));
  base.position.y = -0.06; base.receiveShadow = true; scene.add(base);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(teamColor), transparent: true, opacity: 0.9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.012, 8, 96), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.005; scene.add(ring);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(teamColor), transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = -0.11; scene.add(glow);

  let avatar = null, cur = { charId, appearance, teamColor, action };
  let yaw = 0.35, targetYaw = 0.35, zoom = 0, targetZoom = 0, drag = null, auto = true, t = 0, actionT = 0;
  function build() {
    if (avatar) { scene.remove(avatar.group); avatar.dispose(); avatar = null; }
    const p = getPlayer(cur.charId); if (!p) return;
    avatar = createAvatar(p, { teamColor: cur.teamColor, teamColor2: "#10131f", isKeeper: false, quality, appearance: cur.appearance || undefined, teamMarker: false });
    avatar.group.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    avatar.setLabelVisible?.(false);
    scene.add(avatar.group);
  }
  build();

  const onDown = e => { drag = { x: e.clientX }; auto = false; canvas.setPointerCapture?.(e.pointerId); canvas.style.cursor = "grabbing"; };
  const onMove = e => { if (!drag) return; targetYaw += (e.clientX - drag.x) * 0.012; drag.x = e.clientX; };
  const onUp = () => { drag = null; canvas.style.cursor = "grab"; };
  const onWheel = e => { e.preventDefault(); targetZoom = Math.max(0, Math.min(1, targetZoom - Math.sign(e.deltaY) * 0.2)); };
  canvas.addEventListener("pointerdown", onDown); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  let raf = 0, last = performance.now(), alive = true;
  function frame(now) {
    if (!alive) return; raf = requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; t += dt;
    if (auto) targetYaw += dt * 0.35;
    yaw += (targetYaw - yaw) * (1 - Math.exp(-dt * 8)); zoom += (targetZoom - zoom) * (1 - Math.exp(-dt * 6));
    if (avatar) {
      avatar.group.rotation.y = yaw;
      // boucle d'animation de démonstration
      actionT = (actionT + dt / (cur.action === "charge" ? 1.2 : 0.9)) % 1;
      const a = cur.action;
      const st = a === "run" ? { speed: 5.5, action: "run" } : a === "sprint" ? { speed: 8, action: "sprint" } : a === "charge" ? { speed: 0, action: actionT < 0.75 ? "charge" : "kick", actionT: Math.min(1, actionT / 0.75) }
        : a === "kick" ? { speed: 0, action: actionT < 0.5 ? "kick" : "idle" } : { speed: 0, action: a };
      avatar.setState({ actionT: 0.5, diveDir: 1, celebrateSeed: 1, ...st }, dt);
    }
    const h = getPlayer(cur.charId)?.taille || 1.8;
    const lookY = h * (0.55 + zoom * 0.36), dist = 4.2 - zoom * 2.2;
    camera.position.set(0, lookY + 0.25 - zoom * 0.1, dist); camera.lookAt(0, lookY, 0);
    ring.material.opacity = 0.7 + Math.sin(t * 2.4) * 0.2;
    renderer.render(scene, camera);
  }
  function resize() { const w = container.clientWidth || 300, h = container.clientHeight || 400; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  raf = requestAnimationFrame(frame);

  return {
    setAppearance(a) { cur.appearance = a; if (avatar?.setAppearance) avatar.setAppearance(a || undefined); else build(); },
    setChar(id, a) { cur.charId = id; cur.appearance = a; build(); },
    setTeamColor(c) { cur.teamColor = c; ringMat.color.set(c); glow.material.color.set(c); if (avatar?.setTeamColors) avatar.setTeamColors(c, "#10131f"); else build(); },
    setAction(a) { cur.action = a; actionT = 0; },
    setZoom(z) { targetZoom = z; },
    spin(on) { auto = on; },
    snapshot() { renderer.render(scene, camera); return canvas.toDataURL("image/png"); },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); canvas.removeEventListener("wheel", onWheel);
      if (avatar) avatar.dispose();
      for (const o of [base, ring, glow]) { o.geometry.dispose(); o.material.dispose(); }
      renderer.dispose(); canvas.remove();
    },
  };
}
