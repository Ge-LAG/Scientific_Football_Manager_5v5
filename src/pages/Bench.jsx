// Banc d'essai graphique : l'arène (stade + 10 joueurs + ballon + effets) tourne ~5 s à chaque niveau de qualité,
// on mesure images/s (et temps GPU si le navigateur le permet), puis on recommande un niveau et on peut l'enregistrer.
// Route prévue : #/bench (chargée à la demande, elle embarque three.js).
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useI18n } from "../i18n/index.jsx";
import { useSession } from "../store/session.jsx";
import { createStadium } from "../three/visual/stadium.js";
import { createAvatar } from "../three/visual/avatar.js";
import { createBall } from "../three/visual/ball.js";
import { createEffects } from "../three/visual/effects.js";
import { createPipeline } from "../three/render/pipeline.js";
import { QUALITY_LEVELS, detectInitialQuality, getGpuInfo } from "../three/render/quality.js";
import { createPerfOverlay } from "../three/render/perfOverlay.js";
import { PLAYERS } from "../../shared/data/content.js";

const WARMUP = 1.0;   // s ignorées (compilation des shaders, allocation)
const MEASURE = 5.0;  // s mesurées par niveau
const TARGET_FPS = 55, MAX_P95 = 25, MAX_GPU = 13.5;
const HOME = "#FF3366", AWAY = "#00F0FF";

const TXT = {
  fr: {
    title: "Banc d'essai graphique", running: "Mesure en cours", warmup: "Préparation", level: "Niveau",
    results: "Résultats", fps: "i/s moy.", p95: "95e centile", gpu: "GPU", recommended: "Recommandé",
    apply: q => `Appliquer « ${q} »`, applied: "Réglage enregistré ✓", rerun: "Relancer", back: "Retour", cancel: "Annuler",
    detected: "Détection automatique", gpuName: "Carte graphique", note: "Le niveau recommandé est le plus élevé qui tient ≥ 55 i/s sans à-coups. Le jeu ajuste ensuite la qualité en direct si besoin.",
    hint: "F3 : panneau de performances · Échap : retour", error: "WebGL indisponible sur ce navigateur : le banc d'essai ne peut pas démarrer.",
    hidden: "Onglet masqué : mesure reprise pour ce niveau.",
    q: { low: "Basse", medium: "Moyenne", high: "Élevée", ultra: "Ultra" },
  },
  en: {
    title: "Graphics benchmark", running: "Measuring", warmup: "Warming up", level: "Level",
    results: "Results", fps: "avg fps", p95: "95th pct", gpu: "GPU", recommended: "Recommended",
    apply: q => `Apply “${q}”`, applied: "Setting saved ✓", rerun: "Run again", back: "Back", cancel: "Cancel",
    detected: "Auto-detection", gpuName: "Graphics card", note: "The recommended level is the highest one holding ≥ 55 fps without stutter. In game, quality still adapts live if needed.",
    hint: "F3: performance panel · Esc: back", error: "WebGL is not available in this browser: the benchmark cannot start.",
    hidden: "Tab hidden: measurement restarted for this level.",
    q: { low: "Low", medium: "Medium", high: "High", ultra: "Ultra" },
  },
};

function stats(level, frames, gpu) {
  const n = frames.length;
  if (!n) return { level, fps: 0, p95: 0, gpu: null };
  const sum = frames.reduce((a, b) => a + b, 0);
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
  const g = gpu.length >= 5 ? gpu.reduce((a, b) => a + b, 0) / gpu.length : null;
  return { level, fps: (n * 1000) / sum, p95, gpu: g };
}

function recommend(res) {
  let best = "low";
  for (const r of res) {
    const ok = r.fps >= TARGET_FPS && r.p95 <= MAX_P95 && (r.gpu == null || r.gpu <= MAX_GPU);
    if (ok) best = r.level;
  }
  return best;
}

// Mesure GPU asynchrone (EXT_disjoint_timer_query_webgl2), si disponible
function createGpuTimer(gl) {
  let ext = null;
  try { ext = gl.getExtension("EXT_disjoint_timer_query_webgl2"); } catch { ext = null; }
  const pending = [];
  return {
    available: !!ext,
    begin() { if (!ext) return null; const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); return q; },
    end(q, tag) { if (!ext || !q) return; gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push({ q, tag }); },
    poll(onResult) {
      if (!ext) return;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      while (pending.length) {
        const { q, tag } = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        pending.shift();
        if (!disjoint) onResult(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6, tag);
        gl.deleteQuery(q);
      }
    },
    dispose() { for (const { q } of pending) gl.deleteQuery(q); pending.length = 0; },
  };
}

export default function Bench({ navigate }) {
  const lang = useI18n()?.lang || "fr";
  const T = TXT[lang] || TXT.fr;
  const session = useSession();
  const hostRef = useRef(null);
  const [runId, setRunId] = useState(0);
  const [phase, setPhase] = useState("run"); // run | done | error
  const [live, setLive] = useState({ idx: 0, level: "low", t: 0, fps: 0, warm: true });
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState({ gpu: "", detected: "", timer: false });
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState("");

  const back = () => { if (navigate) navigate("/settings"); else history.back(); };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    setPhase("run"); setResults([]); setSaved(false); setNote("");
    setLive({ idx: 0, level: QUALITY_LEVELS[0], t: 0, fps: 0, warm: true });
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false });
    } catch {
      setPhase("error");
      return undefined;
    }
    const canvas = renderer.domElement;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
    const stadium = createStadium(scene, { quality: "ultra", homeColor: HOME, awayColor: AWAY });
    const effects = createEffects(scene, { quality: "ultra" });
    const ball = createBall({ quality: "ultra" });
    scene.add(ball.mesh, ball.trail);
    const pipeline = createPipeline(renderer, scene, camera, { quality: QUALITY_LEVELS[0] });
    const overlay = createPerfOverlay(host);
    const timer = createGpuTimer(renderer.getContext());
    setMeta({ gpu: getGpuInfo(renderer).name, detected: detectInitialQuality(renderer), timer: timer.available });

    // 10 joueurs (reconstruits à chaque niveau : même coût que dans un vrai match)
    let avatars = [];
    function buildAvatars(q) {
      for (const a of avatars) a.dispose();
      avatars = [];
      for (let i = 0; i < 10; i++) {
        const p = PLAYERS[i % PLAYERS.length];
        if (!p) continue;
        const team = i < 5 ? 0 : 1;
        const a = createAvatar(p, { teamColor: team ? AWAY : HOME, teamColor2: "#10131f", isKeeper: i % 5 === 0, quality: q });
        a.orbit = { r: 2.5 + (i % 5) * 1.5, w: (0.45 + (i % 3) * 0.15) * (i % 2 ? 1 : -1), cx: team ? 8 : -8, cz: ((i % 5) - 2) * 1.6, ph: i * 1.3 };
        scene.add(a.group);
        avatars.push(a);
      }
    }

    function resize() {
      const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
      pipeline.setSize(w, h, window.devicePixelRatio || 1);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let li = 0, phaseT = 0, frames = [], gpu = [], simT = 0, goalT = 0, kickT = 0, uiT = 0, done = false, raf = 0, last = performance.now();
    const res = [];
    function setLevel(i) {
      const q = QUALITY_LEVELS[i];
      pipeline.setQuality(q); stadium.setQuality(q); effects.setQuality(q); ball.setQuality(q);
      buildAvatars(q);
      phaseT = 0; frames = []; gpu = [];
    }
    setLevel(0);
    resize();

    const onVis = () => { if (document.hidden && !done) { phaseT = 0; frames = []; gpu = []; setNote(T.hidden); } };
    document.addEventListener("visibilitychange", onVis);
    const onKey = e => {
      if (e.key === "F3") { e.preventDefault(); overlay.toggle(); }
      else if (e.key === "Escape") back();
    };
    window.addEventListener("keydown", onKey);

    function animate(dt) {
      simT += dt;
      for (const a of avatars) {
        const o = a.orbit, ang = simT * o.w + o.ph;
        const x = o.cx + Math.cos(ang) * o.r, z = o.cz + Math.sin(ang) * o.r * 0.75;
        const vx = -Math.sin(ang) * o.r * o.w, vz = Math.cos(ang) * o.r * 0.75 * o.w;
        const speed = Math.hypot(vx, vz);
        a.group.position.set(x, 0, z);
        a.group.rotation.y = Math.atan2(vx, vz);
        a.setState({ speed, action: speed > 4.5 ? "sprint" : "run", actionT: 0.5 }, dt);
      }
      // ballon : grand huit avec des ballons levés, puis frappe au but toutes les 5 s
      const k = simT % 5;
      let bp;
      if (k < 4.4) bp = { x: Math.sin(simT * 0.7) * 15, y: 0.11 + Math.max(0, Math.sin(simT * 1.7)) * 2.4, z: Math.sin(simT * 1.1) * 7 };
      else { const u = (k - 4.4) / 0.6, side = Math.floor(simT / 5) % 2 ? -1 : 1; bp = { x: side * (14 + u * 7.05), y: 0.3 + u * 0.6, z: (1 - u) * 3 }; }
      ball.update(bp, null, dt);
      goalT += dt; kickT += dt;
      if (goalT >= 5) {
        goalT = 0;
        const side = Math.floor(simT / 5) % 2 ? 1 : -1; // but qui vient d'être marqué (même côté que la frappe)
        const col = side > 0 ? HOME : AWAY;
        effects.goalExplosion(new THREE.Vector3(side * 20, 1.1, 0), col);
        stadium.flash(col, { side });
        pipeline.flash(col, 0.18);
      }
      if (kickT >= 1.1 && avatars.length) {
        kickT = 0;
        const a = avatars[Math.floor(Math.random() * avatars.length)].group.position;
        effects.kickSpark(new THREE.Vector3(a.x, 0.3, a.z), "#ffffff");
        effects.dust({ x: a.x, y: 0, z: a.z });
      }
      const ca = simT * 0.09;
      camera.position.set(Math.cos(ca) * 34, 13 + Math.sin(simT * 0.21) * 2.5, Math.sin(ca) * 26);
      camera.lookAt(0, 0.5, 0);
      stadium.update(dt, simT, ball.mesh.position);
      effects.update(dt, camera);
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const rdt = Math.max(0, (now - last) / 1000); last = now;
      const dt = Math.min(0.05, rdt);
      animate(dt);
      const q = timer.begin();
      pipeline.render(dt);
      timer.end(q, li);
      timer.poll((ms, tag) => { if (!done && tag === li && phaseT > WARMUP) gpu.push(ms); });
      overlay.update(renderer, rdt, { level: pipeline.level, pixelRatio: renderer.getPixelRatio() });
      if (done) return;
      phaseT += rdt;
      if (phaseT > WARMUP && rdt > 0) frames.push(rdt * 1000);
      uiT += rdt;
      if (uiT > 0.25) {
        uiT = 0;
        const n = frames.length, sum = frames.reduce((a, b) => a + b, 0);
        setLive({ idx: li, level: QUALITY_LEVELS[li], t: phaseT, fps: n ? (n * 1000) / sum : 0, warm: phaseT <= WARMUP });
      }
      if (phaseT >= WARMUP + MEASURE) {
        res.push(stats(QUALITY_LEVELS[li], frames, gpu));
        setResults([...res]);
        li++;
        if (li >= QUALITY_LEVELS.length) {
          done = true;
          const best = recommend(res);
          // fond animé au niveau recommandé derrière la carte de résultats
          pipeline.setQuality(best); stadium.setQuality(best); effects.setQuality(best); ball.setQuality(best);
          setPhase("done");
        } else setLevel(li);
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey);
      timer.dispose();
      overlay.dispose();
      for (const a of avatars) a.dispose();
      ball.dispose(); effects.dispose(); stadium.dispose(); pipeline.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    };
  }, [runId]); // eslint-disable-line react-hooks/exhaustive-deps

  const best = results.length === QUALITY_LEVELS.length ? recommend(results) : null;

  function apply() {
    if (!best) return;
    let current = {};
    try { current = JSON.parse(localStorage.getItem("ll.settings") || "{}") || {}; } catch { current = {}; }
    try { localStorage.setItem("ll.settings", JSON.stringify({ ...current, quality: best })); } catch { /* stockage indisponible */ }
    session?.setSettings?.({ quality: best }); // garde l'état de session synchronisé
    setSaved(true);
  }

  const maxFps = Math.max(60, ...results.map(r => r.fps));
  const progress = Math.min(1, (live.idx + Math.min(1, live.t / (WARMUP + MEASURE))) / QUALITY_LEVELS.length);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "#050508", overflow: "hidden" }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />

      {phase === "run" && (
        <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", width: "min(520px, calc(100% - 32px))", pointerEvents: "none" }}>
          <div className="card tight" style={{ padding: "10px 14px" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <div className="kicker" style={{ margin: 0 }}>🧪 {T.title}</div>
              <div className="num" style={{ fontSize: 13, color: "var(--muted)" }}>{live.idx + 1}/{QUALITY_LEVELS.length}</div>
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 6, gap: 12 }}>
              <div style={{ fontWeight: 700 }}>{T.level} : <span style={{ color: "var(--cyan)" }}>{T.q[live.level]}</span> · <span className="muted">{live.warm ? T.warmup : T.running}</span></div>
              <div className="num" style={{ color: "var(--lime)" }}>{live.warm ? "—" : `${live.fps.toFixed(0)} i/s`}</div>
            </div>
            <div style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,.08)", marginTop: 8, overflow: "hidden" }}>
              <div style={{ width: `${(progress * 100).toFixed(1)}%`, height: "100%", background: "linear-gradient(90deg, var(--cyan), var(--magenta))", transition: "width .25s linear" }} />
            </div>
            {note && <div className="tiny muted" style={{ marginTop: 6 }}>{note}</div>}
          </div>
        </div>
      )}
      {phase === "run" && (
        <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 12, alignItems: "center" }}>
          <span className="tiny muted" style={{ background: "rgba(5,8,20,.6)", padding: "4px 10px", borderRadius: 8 }}>{T.hint}</span>
          <button className="btn small ghost" onClick={back}>{T.cancel}</button>
        </div>
      )}

      {phase === "done" && best && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 16, background: "radial-gradient(circle at 50% 50%, rgba(5,5,8,.35), rgba(5,5,8,.75))" }}>
          <div className="card elevated" style={{ width: "min(560px, 100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div className="kicker">🧪 {T.title}</div>
            <h2 className="h2" style={{ marginBottom: 14 }}>{T.results}</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {results.map(r => {
                const isBest = r.level === best;
                return (
                  <div key={r.level} style={{ display: "grid", gridTemplateColumns: "92px 1fr auto", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 10, border: `1px solid ${isBest ? "var(--cyan)" : "rgba(255,255,255,.08)"}`, background: isBest ? "rgba(0,240,255,.08)" : "rgba(255,255,255,.02)" }}>
                    <div style={{ fontWeight: 800 }}>{T.q[r.level]}{isBest && <div className="tiny" style={{ color: "var(--cyan)", fontWeight: 700 }}>★ {T.recommended}</div>}</div>
                    <div>
                      <div style={{ height: 8, borderRadius: 6, background: "rgba(255,255,255,.07)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, (r.fps / maxFps) * 100).toFixed(1)}%`, height: "100%", background: r.fps >= TARGET_FPS ? "var(--lime)" : r.fps >= 40 ? "var(--gold)" : "var(--coral)" }} />
                      </div>
                      <div className="tiny muted" style={{ marginTop: 4 }}>{T.p95} {r.p95.toFixed(1)} ms{r.gpu != null ? ` · ${T.gpu} ${r.gpu.toFixed(1)} ms` : ""}</div>
                    </div>
                    <div className="num" style={{ fontSize: 20, textAlign: "right" }}>{r.fps.toFixed(0)}<span className="tiny muted"> {T.fps}</span></div>
                  </div>
                );
              })}
            </div>
            <p className="tiny muted" style={{ marginTop: 12 }}>{T.note}</p>
            <p className="tiny muted" style={{ marginTop: 6 }}>{T.gpuName} : {meta.gpu || "?"} · {T.detected} : {T.q[meta.detected] || "?"}</p>
            <div className="row" style={{ gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button className="btn primary" onClick={apply} disabled={saved}>{saved ? T.applied : T.apply(T.q[best])}</button>
              <button className="btn ghost" onClick={() => setRunId(n => n + 1)}>{T.rerun}</button>
              <button className="btn ghost" onClick={back}>{T.back}</button>
            </div>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 16 }}>
          <div className="card" style={{ width: "min(480px, 100%)" }}>
            <div className="kicker">🧪 {T.title}</div>
            <p style={{ margin: "8px 0 16px" }}>{T.error}</p>
            <button className="btn ghost" onClick={back}>{T.back}</button>
          </div>
        </div>
      )}
    </div>
  );
}
