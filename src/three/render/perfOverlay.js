// Petit panneau de performances (F3) : images/s, ms par image (+ graphe), appels de dessin, triangles, niveau.
// Mise à jour du DOM limitée à 4 Hz ; le graphe est un petit canevas 2D.

const W = 150, H = 30, N = 75;

export function createPerfOverlay(container = document.body) {
  const fixed = container === document.body || container === document.documentElement;
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = [
    `position:${fixed ? "fixed" : "absolute"}`, "top:8px", "left:8px", "z-index:40", "pointer-events:none",
    "font:11px/1.35 ui-monospace,Consolas,'Chakra Petch',monospace", "color:#d6fbff",
    "background:rgba(5,8,20,.74)", "border:1px solid rgba(0,240,255,.28)", "border-radius:8px",
    "padding:6px 8px", "min-width:150px", "display:none", "backdrop-filter:blur(4px)",
  ].join(";");
  const text = document.createElement("div");
  text.style.whiteSpace = "pre";
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  cv.style.cssText = `display:block;width:${W}px;height:${H}px;margin-top:4px;`;
  el.append(text, cv);
  container.appendChild(el);
  const g = cv.getContext("2d");

  const ms = new Float32Array(N);
  let head = 0, visible = false, acc = 0, frames = 0, worst = 0, lastT = 0, shown = "";

  function draw() {
    if (!g) return;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(0,240,255,.12)"; g.fillRect(0, H - H * (16.7 / 50), W, 1); // repère 60 i/s
    const bw = W / N;
    for (let i = 0; i < N; i++) {
      const v = ms[(head + i) % N];
      if (!v) continue;
      const h = Math.min(H, (v / 50) * H);
      g.fillStyle = v <= 17.5 ? "#39ff88" : v <= 25 ? "#ffd23f" : "#ff3366";
      g.fillRect(i * bw, H - h, Math.max(1, bw - 0.4), h);
    }
  }

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {number} dt   durée de l'image (s) ; mesurée si absente
   * @param {string|{level:string,scale?:number,pixelRatio?:number}} level
   */
  function update(renderer, dt, level) {
    const now = performance.now();
    if (!(dt > 0)) dt = lastT ? (now - lastT) / 1000 : 1 / 60;
    lastT = now;
    const m = dt * 1000;
    ms[head] = m; head = (head + 1) % N;
    acc += dt; frames++; worst = Math.max(worst, m);
    if (!visible || acc < 0.25) return;
    const fps = frames / acc;
    const info = renderer?.info?.render || {};
    const lv = typeof level === "object" && level ? level : { level };
    const pr = lv.pixelRatio ?? renderer?.getPixelRatio?.();
    const lines = [
      `${fps.toFixed(0).padStart(3)} i/s   ${((acc / frames) * 1000).toFixed(1)} ms  (max ${worst.toFixed(1)})`,
      `appels ${info.calls ?? "?"}   tri ${fmt(info.triangles)}`,
      `qualité ${lv.level ?? "?"}${lv.scale != null && lv.scale < 1 ? ` ×${lv.scale}` : ""}   px ${pr != null ? (+pr).toFixed(2) : "?"}`,
    ];
    const s = lines.join("\n");
    if (s !== shown) { text.textContent = s; shown = s; }
    draw();
    acc = 0; frames = 0; worst = 0;
  }

  function setVisible(v) { visible = !!v; el.style.display = visible ? "block" : "none"; if (visible) { acc = 0; frames = 0; } }

  function dispose() { el.remove(); }

  return { update, setVisible, toggle: () => setVisible(!visible), dispose, get visible() { return visible; }, element: el };
}

function fmt(n) {
  if (n == null) return "?";
  return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n);
}
