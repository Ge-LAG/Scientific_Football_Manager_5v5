// Smoke test navigateur (Chrome/Edge sans interface, protocole DevTools) : parcourt les écrans principaux,
// joue un match Manager contre un bot et lance l'Arène 3D ; capture des images dans le dossier indiqué.
// Usage : node scripts/smoke-browser.mjs [url=http://localhost:8787] [dossier=smoke-out]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const BASE = process.argv[2] || "http://localhost:8787";
const OUT = process.argv[3] || "smoke-out";
mkdirSync(OUT, { recursive: true });
const CANDIDATES = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
const exe = CANDIDATES.find(p => existsSync(p));
if (!exe) { console.error("Aucun navigateur Chrome/Edge trouvé (variable CHROME)."); process.exit(2); }

const port = 9300 + Math.floor(Math.random() * 500);
const profile = path.join(tmpdir(), "ll-smoke-" + Date.now());
const chrome = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1366,900", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required", "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 50; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.find(x => x.type === "page"); if (p) return p; } catch { /* démarrage */ } await sleep(200); }
  throw new Error("DevTools injoignable");
}
const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise(r => ws.once("open", r));
let id = 0; const pending = new Map(); const logs = [];
ws.on("message", raw => {
  const m = JSON.parse(raw.toString());
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") logs.push("EXCEPTION " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) logs.push(m.params.type.toUpperCase() + " " + m.params.args.map(a => a.value ?? a.description).join(" "));
});
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => { const r = await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval"); return r.result?.result?.value; };
const shot = async name => { const r = await cmd("Page.captureScreenshot", { format: "png" }); writeFileSync(path.join(OUT, name + ".png"), Buffer.from(r.result.data, "base64")); console.log("📸", name); };
const click = text => evaluate(`(() => { const n = ${JSON.stringify(text)}.toLowerCase(); const b = [...document.querySelectorAll("button")].find(b => b.textContent.toLowerCase().includes(n) && !b.disabled); if (!b) return false; b.click(); return true; })()`);
const has = (...needles) => `(${JSON.stringify(needles.map(n => n.toLowerCase()))}).some(n => (document.body?.innerText || "").toLowerCase().includes(n))`;
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evaluate(expr)) return true; await sleep(250); } throw new Error("Attente dépassée : " + expr); };
const text = () => evaluate("document.body.innerText");

const results = [];
const step = async (name, fn) => { try { await fn(); results.push(["✔", name]); } catch (e) { results.push(["✖", name + " — " + e.message]); } };

await cmd("Runtime.enable"); await cmd("Page.enable");
await cmd("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

await step("Accueil en français par défaut", async () => {
  await cmd("Page.navigate", { url: BASE + "/#/" }); await waitFor(has("Le Labo Tactique"));
  await shot("01-accueil");
});
await step("Pages de contenu (scientifiques, fiche, power-ups, aide, club, classement)", async () => {
  for (const [hash, needle, name] of [["#/roster", "Roland", "02-scientifiques"], ["#/player/djilani", "Pare-feu Total", "03-fiche-djilani"], ["#/powerups", "Board Call", "04-powerups"], ["#/help", "Matrice tactique", "05-aide"], ["#/club", "Mon club", "06-club"], ["#/leaderboard", "Classement", "07-classement"]]) {
    await evaluate(`location.hash = ${JSON.stringify(hash)}`); await waitFor(has(needle)); await sleep(400); await shot(name);
  }
});
await step("Bascule en anglais", async () => {
  await evaluate(`(() => { const s = document.querySelector("header select"); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "en"); s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await evaluate(`location.hash = "#/"`); await waitFor(has("The Tactics Lab")); await shot("08-home-en");
  await evaluate(`(() => { const s = document.querySelector("header select"); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "fr"); s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
});
await step("Manager contre un bot : draft auto, composition, match, rapport", async () => {
  await evaluate(`location.hash = "#/manager"`); await waitFor(`!!document.querySelector("button")`); await sleep(300);
  await click("×4"); await click("Courte"); await click("Lancer");
  await waitFor(has("Draft automatique")); await shot("09-draft");
  await click("Draft automatique");
  await waitFor(has("Prêt, coup d'envoi"), 30000); await sleep(300); await shot("10-composition");
  await click("Prêt, coup d'envoi");
  await waitFor(has("Fil du match"), 15000); await sleep(4000); await shot("11-match-2d");
  await click("Vue Stade 3D"); await sleep(8000); await shot("12-match-3d");
  const c3 = await evaluate(`[...document.querySelectorAll(".pitch-wrap canvas")].map(c => [c.width, c.height, c.clientWidth, c.clientHeight, getComputedStyle(c).visibility].join("x"))`);
  results.push(["ℹ", "Vue Stade 3D, canevas : " + JSON.stringify(c3)]);
  const cam = await evaluate(`(() => { const v = window.__ll3d; if (!v) return null; const c = v.camera.position; return { cam: [c.x, c.y, c.z].map(n => +n.toFixed(2)), mode: v.camMode, children: v.scene.children.length, ball: v.latest && v.latest.b.slice(0, 3), p0: v.latest && v.latest.p[0].slice(0, 2) }; })()`);
  results.push(["ℹ", "Vue Stade 3D, caméra : " + JSON.stringify(cam)]);
  // caméras du match simulé (match en pause pour qu'il ne se termine pas pendant la vérification)
  if (!(await click("Pause"))) throw new Error("bouton Pause introuvable");
  const modes = [];
  for (const [label, mode] of [["Frontale", "goal"], ["Ballon", "ball"], ["Joueur", "player"], ["Tribune", "tactical"], ["Libre", "free"], ["Latérale", "tv"], ["Réalisateur", "auto"]]) {
    if (!(await click(label))) throw new Error("bouton de caméra introuvable : " + label);
    await sleep(900); const m = await evaluate("window.__ll3d?.camMode"); modes.push(m);
    if (m !== mode) throw new Error(`caméra ${label} : ${m}`);
    if (mode === "goal" || mode === "free" || mode === "player") await shot("12-cam-" + mode);
  }
  results.push(["ℹ", "Caméras 3D : " + modes.join(", ")]);
  await click("Reprendre");
  await click("Vue tactique");
  await waitFor(has("Homme du match"), 150000); await sleep(500); await shot("13-rapport");
  await click("Accueil");
});
await step("Arène contre les bots : lobby, match 3D, déplacement", async () => {
  await evaluate(`location.hash = "#/arena"`); await waitFor(has("Niveau des bots"));
  await click("1 min"); await click("Jouer");
  await waitFor(has("Votre scientifique"), 15000); await sleep(300);
  // sélection des 2 power-ups : on remplace le second par le 4e
  const lo = await evaluate(`(() => { const b = [...document.querySelectorAll(".loadout .lo-item")]; if (b.length !== 4) return "items:" + b.length; b[3].click(); return "ok"; })()`);
  if (lo !== "ok") throw new Error("sélection de power-ups : " + lo);
  await waitFor(`document.querySelectorAll(".loadout .lo-item.on").length === 2 && document.querySelectorAll(".loadout .lo-item")[3].classList.contains("on")`, 5000);
  await shot("14-arene-lobby");
  await click("Coup d'envoi");
  await waitFor(`!!document.querySelector(".arena-root canvas")`, 20000); await sleep(4000); await shot("15-arene-jeu");
  // schéma par défaut : flèches (main droite) + Espace (sprint, pouce)
  const x0 = await evaluate(`window.__ll3d.latest.p[window.__ll3d.mySlot][0]`);
  await evaluate(`(() => { const k = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })); k("keydown", "ArrowUp"); k("keydown", "Space"); setTimeout(() => { k("keyup", "ArrowUp"); k("keyup", "Space"); }, 2500); })()`);
  await sleep(3000); await shot("16-arene-course");
  const x1 = await evaluate(`window.__ll3d.latest.p[window.__ll3d.mySlot][0]`);
  results.push(["ℹ", `Flèche haut : x ${x0.toFixed(1)} → ${x1.toFixed(1)}`]);
  if (!(Math.abs(x1 - x0) > 1)) throw new Error("le joueur n'avance pas aux flèches");
  // 2 power-ups dans le HUD, bandeau d'équipe, changement de joueur (Q physique)
  const hudPu = await evaluate(`document.querySelectorAll(".hud-pus .hud-pu").length`);
  if (hudPu !== 2) throw new Error("HUD power-ups : " + hudPu);
  const s0 = await evaluate(`window.__ll3d.mySlot`);
  await evaluate(`(() => { const k = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })); k("keydown", "KeyQ"); setTimeout(() => k("keyup", "KeyQ"), 120); })()`);
  await waitFor(`window.__ll3d.mySlot !== ${s0}`, 6000); await sleep(1200);
  const s1 = await evaluate(`window.__ll3d.mySlot`);
  results.push(["ℹ", `Changement de joueur : ${s0} → ${s1}`]); await shot("16b-arene-switch");
  await evaluate(`document.querySelectorAll(".hud-team .hud-mate:not(.cur):not(:disabled)")[0]?.click()`);
  await waitFor(`window.__ll3d.mySlot !== ${s1}`, 6000);
  const fps = await evaluate(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(Math.round(n / 2)); }; requestAnimationFrame(f); })`);
  results.push(["ℹ", `Arène : ${fps} images/s (rendu logiciel SwiftShader, sans GPU)`]);
  // menu pause (Échap) puis sortie propre (la fin de match est couverte par tests/server.test.js)
  await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true })); setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Escape", bubbles: true })), 200)`);
  await waitFor(`!!document.querySelector(".hud-menu")`, 30000); await sleep(500); await shot("17-arene-menu");
  await click("Quitter"); await waitFor(has("Niveau des bots"), 20000);
});

await step("Réglages : contrôles (schéma, disposition, clavier visuel, réaffectation)", async () => {
  await evaluate(`location.hash = "#/settings"`); await waitFor(has("Schéma de contrôle")); await sleep(400);
  await click("QWERTY");
  await waitFor(`[...document.querySelectorAll(".kb-key.on .kb-cap")].some(e => e.textContent === "Q")`, 5000);
  await click("AZERTY");
  // sur AZERTY, la touche physique KeyQ (changer de joueur) s'affiche « A »
  await waitFor(`[...document.querySelectorAll(".bind-table tr")].some(tr => tr.textContent.includes("Changer de joueur") && tr.querySelector(".kbd.bind")?.textContent === "A")`, 5000);
  await shot("18-reglages-controles");
});
await step("Vestiaire : apparence (mulet permanenté, tenue rockstar), aperçu 3D", async () => {
  await evaluate(`location.hash = "#/look/loic"`); await waitFor(`!!document.querySelector(".look-canvas canvas")`, 20000); await sleep(1500);
  await click("Cheveux et barbe"); await sleep(200); await click("Mulet permanenté");
  await click("Tenue"); await sleep(200); await click("Rockstar"); await sleep(2500);
  const saved = await evaluate(`JSON.parse(localStorage.getItem("ll.looks") || "{}").loic`);
  if (saved?.hairStyle !== "mullet_perm" || saved?.outfit !== "rockstar") throw new Error("apparence non enregistrée : " + JSON.stringify(saved));
  await shot("19-vestiaire");
  await click("Visage"); await sleep(2000); await shot("19b-vestiaire-visage");
  await click("Silhouette"); await sleep(200);
  // les mulets sont dans la liste des coiffures, sans catégorie à part
  const cats = await evaluate(`document.querySelectorAll(".look-sub").length`);
  if (cats !== 0) throw new Error("catégorie de coiffures séparée encore présente");
  // répartition des points : préréglage « Attaquant », enregistrée, bio adaptée
  await evaluate(`location.hash = "#/look/loic/stats"`); await waitFor(has("Répartition des points"), 20000); await sleep(800);
  await click("Attaquant"); await sleep(600);
  const st = await evaluate(`JSON.parse(localStorage.getItem("ll.statAlloc") || "{}").loic`);
  if (!st || Object.values(st).reduce((a, b) => a + b, 0) !== 612) throw new Error("répartition non enregistrée : " + JSON.stringify(st));
  await shot("19c-vestiaire-stats");
  await evaluate(`location.hash = "#/player/loic"`); await waitFor(has("Répartition personnalisée"), 10000); await shot("19d-fiche-perso");
});

await step("Affichage mobile (390 px) sans défilement horizontal", async () => {
  await cmd("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  for (const [hash, name] of [["#/", "20-mobile-accueil"], ["#/manager", "21-mobile-manager"], ["#/player/mederic", "22-mobile-fiche"], ["#/club", "23-mobile-club"], ["#/look/roland", "24-mobile-vestiaire"], ["#/settings", "25-mobile-reglages"]]) {
    await evaluate(`location.hash = ${JSON.stringify(hash)}`); await sleep(900); await shot(name);
    const over = await evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
    if (over > 2) throw new Error(`${hash} déborde de ${over}px`);
  }
});

console.log("\n" + results.map(r => r.join(" ")).join("\n"));
if (logs.length) console.log("\nConsole :\n" + [...new Set(logs)].slice(0, 30).join("\n"));
ws.close(); chrome.kill();
process.exit(results.some(r => r[0] === "✖") ? 1 : 0);
