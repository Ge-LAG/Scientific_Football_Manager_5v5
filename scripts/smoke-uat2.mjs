// Retest navigateur des correctifs issus de la recette UAT-002 (TD-002, TD-003, TD-004, TD-006, TD-007, TD-008).
// Chrome/Edge sans interface (protocole DevTools), clics et touches réels ; captures JPEG dans le dossier indiqué.
// Usage : node scripts/smoke-uat2.mjs [url=http://localhost:8787] [dossier=smoke-uat2] [étapes=all|td002,td003…]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const BASE = process.argv[2] || "http://localhost:8787";
const OUT = process.argv[3] || "smoke-uat2";
const ONLY = (process.argv[4] || "all").split(",");
const run = k => ONLY.includes("all") || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });
const CANDIDATES = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
const exe = CANDIDATES.find(p => existsSync(p));
if (!exe) { console.error("Aucun navigateur Chrome/Edge trouvé (variable CHROME)."); process.exit(2); }

const port = 9300 + Math.floor(Math.random() * 500);
const profile = path.join(tmpdir(), "ll-uat2-" + Date.now());
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
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") logs.push("ERROR " + m.params.args.map(a => a.value ?? a.description).join(" "));
});
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => { const r = await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval"); return r.result?.result?.value; };
const shot = async name => { const r = await cmd("Page.captureScreenshot", { format: "jpeg", quality: 72 }); writeFileSync(path.join(OUT, name + ".jpg"), Buffer.from(r.result.data, "base64")); console.log("📸", name); };
const has = (...needles) => `(${JSON.stringify(needles.map(n => n.toLowerCase()))}).some(n => (document.body?.innerText || "").toLowerCase().includes(n))`;
const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evaluate(expr)) return true; await sleep(250); } throw new Error("Attente dépassée : " + expr); };
const size = (width, height, mobile = false) => cmd("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
// vrai clic souris (test de recouvrement : c'est l'élément au premier plan qui le reçoit)
const mouse = async (x, y) => { for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await cmd("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }); };
const centerOf = async sel => evaluate(`(() => { const e = ${sel}; if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const realClickText = async (text, scope = "button") => {
  const c = await centerOf(`[...document.querySelectorAll(${JSON.stringify(scope)})].find(b => b.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}) && !b.disabled)`);
  if (!c) throw new Error("bouton introuvable : " + text);
  await sleep(150); await mouse(c.x, c.y);
};
const key = (code, holdMs = 120) => evaluate(`(() => { const k = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })); k("keydown", ${JSON.stringify(code)}); setTimeout(() => k("keyup", ${JSON.stringify(code)}), ${holdMs}); })()`);
// réglages et langue via le stockage local, puis rechargement
const prefs = async ({ lang, settings }) => {
  await evaluate(`(() => { ${lang ? `localStorage.setItem("ll.lang", ${JSON.stringify(lang)});` : ""} ${settings ? `localStorage.setItem("ll.settings", JSON.stringify(Object.assign(JSON.parse(localStorage.getItem("ll.settings") || "{}"), ${JSON.stringify(settings)})));` : ""} })()`);
};
// chargement complet (paramètre unique) : la langue et les réglages sont relus depuis le stockage local
const go = async hash => { await cmd("Page.navigate", { url: `${BASE}/?r=${Date.now()}${hash}` }); await waitFor(`document.readyState === "complete" && !!document.querySelector("header")`, 60000); await sleep(600); };

const results = [];
const info = s => { results.push(["ℹ", s]); console.log("ℹ", s); };
const step = async (name, fn) => { const t0 = Date.now(); try { await fn(); results.push(["✔", name + ` (${Math.round((Date.now() - t0) / 1000)} s)`]); } catch (e) { results.push(["✖", name + " — " + e.message]); } console.log(results.at(-1).join(" ")); };

await cmd("Runtime.enable"); await cmd("Page.enable");
await size(1366, 900);
await go("#/");
await evaluate(`localStorage.clear()`);

// ── Arène solo : lancement jusqu'au jeu ─────────────────────
const LBL = {
  fr: { half: "3 min", play: "Jouer", kickoff: "Coup d'envoi", resume: "Reprendre", paused: "Match suspendu", quit: "Quitter", lvl: "Niveau des bots", callLabel: "Appel de balle" },
  en: { half: "3 min", play: "Play", kickoff: "Kick-off", resume: "Resume", paused: "Match paused", quit: "Leave", lvl: "Bot level", callLabel: "Call for the ball" },
};
async function startArena(lang) {
  const L = LBL[lang];
  await go("#/arena"); await waitFor(has(L.lvl));
  await realClickText(L.half); await realClickText(L.play);
  await waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes(${JSON.stringify(L.kickoff)}))`, 20000); await sleep(300);
  await realClickText(L.kickoff);
  await waitFor(`!!document.querySelector(".arena-root canvas") && !!window.__ll3d?.latest`, 30000);
  await waitFor(`window.__ll3d.latest.ph === "play"`, 30000);
}
const localRoom = `[...window.__llLocal.rooms.values()].find(r => r.mode === "arena")`;
const simState = () => evaluate(`(() => { const r = ${localRoom}; const s = r.sim, me = s.players[window.__ll3d.mySlot]; return { time: s.time, tick: s.tick, clock: s.clock(), score: s.score.join("-"), phase: s.phase, half: s.half, paused: r.paused, cds: me.pus.map(u => +(u.cd - s.time).toFixed(3)), pos: s.players.map(p => [p.x, p.z].map(v => +v.toFixed(3))).join("|"), snapK: window.__ll3d.latest.k, hudClock: document.querySelector(".hud-top .c")?.textContent }; })()`);

if (run("td002")) {
  await step("TD-002 FR : Échap met le match solo en pause ≥ 30 s (temps, score, états, recharges figés), reprise sans saut", async () => {
    await prefs({ lang: "fr" }); await startArena("fr");
    await sleep(2500);
    await key("KeyE"); await sleep(600); // power-up 1 : recharge en cours pendant la pause
    await key("Escape"); await waitFor(has(LBL.fr.paused), 5000);
    const a = await simState(); await shot("td002-fr-pause-debut");
    if (!a.paused) throw new Error("salle non suspendue");
    info(`pause FR : horloge ${a.hudClock}, score ${a.score}, tick ${a.tick}, recharges ${a.cds.join("/")}`);
    await sleep(31000);
    const b = await simState(); await shot("td002-fr-pause-31s");
    for (const k of ["time", "tick", "clock", "score", "phase", "pos", "snapK", "hudClock"]) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) throw new Error(`${k} a changé pendant la pause : ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`);
    if (JSON.stringify(a.cds) !== JSON.stringify(b.cds)) throw new Error("recharges modifiées pendant la pause");
    const tr = Date.now();
    await realClickText(LBL.fr.resume);
    await waitFor(`!document.querySelector(".hud-menu")`, 5000);
    await sleep(1500);
    const c = await simState(); const real = (Date.now() - tr) / 1000;
    if (c.paused) throw new Error("toujours en pause après Reprendre");
    const dt = c.time - b.time;
    info(`reprise : +${dt.toFixed(2)} s de simulation pour ${real.toFixed(2)} s réelles (pas de rattrapage des 31 s de pause)`);
    if (!(dt > 0.3 && dt <= real + 0.2)) throw new Error("saut de simulation à la reprise : " + dt);
  });

  await step("TD-002 FR : pause à l'approche de la mi-temps puis d'un but", async () => {
    // mi-temps dans ~2 s de jeu (depuis une phase de jeu : un coup franc arrête le chrono)
    await waitFor(`(${localRoom}).sim.phase === "play"`, 60000);
    await evaluate(`(() => { const s = (${localRoom}).sim; s.playClock = s.halfSeconds * s.half - 2.2; })()`);
    await sleep(300);
    await key("Escape"); await waitFor(has(LBL.fr.paused), 5000);
    const a = await simState(); await sleep(8000); const b = await simState();
    if (a.half !== b.half || a.phase !== b.phase || a.clock !== b.clock) throw new Error("mi-temps atteinte pendant la pause");
    await realClickText(LBL.fr.resume); await sleep(300);
    // (rendu logiciel : la simulation locale peut tourner bien plus lentement que le temps réel)
    await waitFor(`(${localRoom}).sim.phase === "halftime" || (${localRoom}).sim.half === 2`, 120000);
    info(`mi-temps après la reprise uniquement (horloge figée à ${a.clock} s pendant 8 s)`);
    // but imminent : en pause, ballon à 8 cm de la ligne, lancé vers le but ; rien ne bouge avant la reprise, puis le but est accordé
    await waitFor(`(${localRoom}).sim.half === 2 && (${localRoom}).sim.phase === "play"`, 30000);
    await key("Escape", 60); await waitFor(`(${localRoom}).paused`, 5000);
    await evaluate(`(() => { const s = (${localRoom}).sim; for (const p of s.players) if (p.team === 1) { p.x = Math.min(p.x, 10); p.vx = 0; } Object.assign(s.ball, { owner: -1, x: 19.92, z: 0.4, y: 0.3, vx: 5, vz: 0, vy: 0, last: window.__ll3d.mySlot }); })()`);
    const g0 = await simState(); await sleep(6000); const g1 = await simState(); await shot("td002-fr-pause-but");
    if (g0.score !== g1.score || g0.tick !== g1.tick) throw new Error("but ou jeu pendant la pause");
    await realClickText(LBL.fr.resume);
    await waitFor(`(${localRoom}).sim.score.join("-") !== ${JSON.stringify(g0.score)}`, 8000);
    const g2 = await simState();
    info(`but imminent : score ${g0.score} figé pendant 6 s de pause → ${g2.score} juste après la reprise (phase ${g2.phase})`);
    await key("Escape"); await waitFor(`!!document.querySelector(".hud-menu")`, 5000); await realClickText(LBL.fr.quit); await waitFor(has(LBL.fr.lvl), 20000);
  });

  await step("TD-002 EN + TD-008 (aide en match) : pause, libellés anglais, appel de balle réaffecté sur B", async () => {
    await prefs({ lang: "en", settings: { controls: { layout: "qwerty", keys: { call: ["KeyB"] } } } });
    await startArena("en");
    await waitFor(`!!document.querySelector(".hud-help")`, 8000);
    const row = await evaluate(`[...document.querySelectorAll(".hud-help > div")].find(d => d.textContent.includes(${JSON.stringify(LBL.en.callLabel)}))?.querySelector(".kbd")?.textContent`);
    if (row !== "B") throw new Error("aide en match : appel de balle = " + row);
    await shot("td008-en-aide-match");
    await key("Escape"); await waitFor(has(LBL.en.paused), 5000);
    const a = await simState(); await shot("td002-en-pause"); await sleep(6000); const b = await simState();
    if (a.tick !== b.tick || a.hudClock !== b.hudClock) throw new Error("le match avance pendant la pause (EN)");
    await realClickText(LBL.en.resume); await sleep(1500);
    if ((await simState()).tick <= b.tick) throw new Error("pas de reprise (EN)");
    info(`EN : horloge ${a.hudClock} figée 6 s, reprise OK ; aide en match : « ${LBL.en.callLabel} » = B`);
    await key("Escape"); await waitFor(`!!document.querySelector(".hud-menu")`, 5000); await realClickText(LBL.en.quit); await waitFor(has(LBL.en.lvl), 20000);
    await evaluate(`localStorage.removeItem("ll.settings")`);
  });
}

// ── Manager solo : préparation libre (TD-003) et coup d'envoi recadré (TD-006) ──
const MLBL = {
  fr: { short: "Courte", start: "Lancer", auto: "Draft automatique", go: "Prêt, coup d'envoi", noLimit: "Sans limite de temps", setup: "Composition", playing: "En jeu", leave: "Quitter" },
  en: { short: "Short", start: "Start", auto: "Auto draft", go: "Ready, kick-off", noLimit: "No time limit", setup: "Line-up", playing: "In play", leave: "Leave" },
};
async function managerToSetup(lang) {
  const L = MLBL[lang];
  await go("#/manager"); await waitFor(`!!document.querySelector("button")`); await sleep(300);
  await realClickText(L.short); await realClickText(L.start);
  await waitFor(has(L.auto), 20000); await realClickText(L.auto);
  await waitFor(has(L.go), 40000); await sleep(400);
}
async function kickoffFromBottom(lang, tag) {
  const L = MLBL[lang];
  await evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`); await sleep(400);
  const y0 = await evaluate(`Math.round(window.scrollY)`);
  await realClickText(L.go);
  await waitFor(`!!document.querySelector(".mv-top") && !!window.__llGame?.room && window.__llGame.room.phase === "playing"`, 20000);
  await sleep(1200);
  const g = await evaluate(`(() => { const top = document.querySelector(".mv-top").getBoundingClientRect(), pitch = document.querySelector(".mv-pitch").getBoundingClientRect(), hdr = document.querySelector(".header").getBoundingClientRect();
    return { scrollY: Math.round(scrollY), vh: innerHeight, vw: innerWidth, hdr: Math.round(hdr.bottom), top: Math.round(top.top), pitchTop: Math.round(pitch.top), pitchBottom: Math.round(pitch.bottom), focus: document.activeElement?.classList.contains("mv-top"), score: document.querySelector(".mv-top .score")?.textContent }; })()`);
  await shot(tag);
  info(`${tag} : défilement ${y0} → ${g.scrollY}px ; score à y=${g.top} (en-tête ${g.hdr}px), terrain ${g.pitchTop}–${g.pitchBottom} / ${g.vh}px ; focus sur la zone du match : ${g.focus}`);
  if (g.top < g.hdr - 1 || g.top > g.hdr + 40) throw new Error("score hors du haut de l'écran : " + JSON.stringify(g));
  if (g.pitchBottom > g.vh + 1) throw new Error("terrain coupé en bas : " + JSON.stringify(g));
  if (!g.focus) throw new Error("focus non placé sur la zone du match");
}
async function leaveManager(lang) { await realClickText(MLBL[lang].leave); await sleep(800); }

if (run("td003") || run("td006")) {
  await step("TD-003 FR + TD-006 FR (886×620) : préparation sans limite (≥ 62 s), puis coup d'envoi depuis le bas de page", async () => {
    await size(886, 620); await prefs({ lang: "fr" });
    await managerToSetup("fr");
    const chip = await evaluate(`[...document.querySelectorAll(".chip")].some(c => c.textContent.includes(${JSON.stringify(MLBL.fr.noLimit)}))`);
    const countdown = await evaluate(`[...document.querySelectorAll(".num")].some(e => /⏱/.test(e.textContent))`);
    if (!chip || countdown) throw new Error(`indicateur : chip=${chip}, compte à rebours=${countdown}`);
    await evaluate(`window.scrollTo(0, 0)`); await sleep(300); await shot("td003-fr-sans-limite");
    if (run("td003")) {
      await sleep(62000);
      const ph = await evaluate(`window.__llGame.room.phase`);
      if (ph !== "setup") throw new Error("le match a démarré seul : " + ph);
      info("TD-003 : toujours en composition après 62 s, départ uniquement sur « Prêt, coup d'envoi ! »");
    }
    await kickoffFromBottom("fr", "td006-fr-886x620");
    await leaveManager("fr");
  });
  await step("TD-003 EN + TD-006 EN (1366×768) : libellé anglais, coup d'envoi recadré", async () => {
    await size(1366, 768); await prefs({ lang: "en" });
    await managerToSetup("en");
    const chip = await evaluate(`[...document.querySelectorAll(".chip")].some(c => c.textContent.includes(${JSON.stringify(MLBL.en.noLimit)}))`);
    if (!chip) throw new Error("libellé « No time limit » absent");
    await evaluate(`window.scrollTo(0, 0)`); await sleep(300); await shot("td003-en-no-limit");
    await kickoffFromBottom("en", "td006-en-1366x768");
    await leaveManager("en");
  });
  await step("TD-006 FR mobile (390×844) : coup d'envoi recadré", async () => {
    await cmd("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await prefs({ lang: "fr" });
    await managerToSetup("fr");
    await kickoffFromBottom("fr", "td006-fr-390x844");
    await leaveManager("fr");
    await size(1366, 900);
  });
}

// ── Vestiaire (TD-007) : chaque coiffure et pilosité cliquable après défilement ──
const OLD_LOOK_CSS = ".look-stage{position:sticky!important;top:12px!important}.look-canvas{height:min(62vh,560px)!important;min-height:340px!important}";
async function lockerAllClickable(lang, w, h, tag, { oldCss = false } = {}) {
  await size(w, h, w < 500); await prefs({ lang });
  await go("#/look/roland"); await waitFor(`!!document.querySelector(".look-canvas canvas")`, 20000); await sleep(800);
  if (oldCss) await evaluate(`(() => { const st = document.createElement("style"); st.textContent = ${JSON.stringify(OLD_LOOK_CSS)}; document.head.appendChild(st); })()`);
  await realClickText(lang === "en" ? "Hair & beard" : "Cheveux et barbe"); await sleep(400);
  const n = await evaluate(`document.querySelectorAll(".opt-grid[role=radiogroup] button[role=radio]").length`);
  let ok = 0; const bad = [];
  for (let i = 0; i < n; i++) {
    const c = await centerOf(`document.querySelectorAll(".opt-grid[role=radiogroup] button[role=radio]")[${i}]`);
    await sleep(60);
    const hit = await evaluate(`(() => { const b = document.querySelectorAll(".opt-grid[role=radiogroup] button[role=radio]")[${i}]; const e = document.elementFromPoint(${c.x}, ${c.y}); return b === e || b.contains(e); })()`);
    await mouse(c.x, c.y); await sleep(120);
    const checked = await evaluate(`document.querySelectorAll(".opt-grid[role=radiogroup] button[role=radio]")[${i}].getAttribute("aria-checked") === "true"`);
    if (hit && checked) ok++; else bad.push(i + ":" + (await evaluate(`document.querySelectorAll(".opt-grid[role=radiogroup] button[role=radio]")[${i}].textContent`)));
  }
  // clavier : focus sur une option puis Espace
  const kb = await evaluate(`(() => { const bs = document.querySelectorAll(".opt-grid[role=radiogroup] button[role=radio]"); const b = bs[1]; b.focus(); return document.activeElement === b; })()`);
  await cmd("Input.dispatchKeyEvent", { type: "keyDown", code: "Space", key: " ", windowsVirtualKeyCode: 32 }); await cmd("Input.dispatchKeyEvent", { type: "keyUp", code: "Space", key: " ", windowsVirtualKeyCode: 32 }); await sleep(200);
  const kbOk = kb && await evaluate(`document.querySelectorAll(".opt-grid[role=radiogroup] button[role=radio]")[1].getAttribute("aria-checked") === "true"`);
  const stage = await evaluate(`getComputedStyle(document.querySelector(".look-stage")).position`);
  await evaluate(`document.querySelector(".opt-grid").scrollIntoView({ block: "center" })`); await sleep(300); await shot(tag);
  info(`${tag} : ${ok}/${n} options cliquées à la souris (point central au premier plan), clavier ${kbOk ? "OK" : "KO"}, aperçu en position ${stage}`);
  if (oldCss) { if (ok === n) throw new Error("le test ne détecte pas l'ancien recouvrement"); info(`${tag} : témoin — ancienne règle CSS réinjectée, ${n - ok} options masquées par l'aperçu (défaut de la recette reproduit)`); return; }
  if (ok !== n || !kbOk) throw new Error(`options inaccessibles : ${bad.join(", ")}`);
}
if (run("td007") || run("td007t")) {
  await step("TD-007 : témoin avec l'ancienne règle CSS (EN 886×620) — le recouvrement est bien détecté", () => lockerAllClickable("en", 886, 620, "td007-en-886x620-avant", { oldCss: true }));
  await step("TD-007 : Vestiaire EN 886×620 (cas de la recette)", () => lockerAllClickable("en", 886, 620, "td007-en-886x620"));
  await step("TD-007 : Vestiaire FR 886×620", () => lockerAllClickable("fr", 886, 620, "td007-fr-886x620"));
  await step("TD-007 : Vestiaire FR 390×844 (mobile)", () => lockerAllClickable("fr", 390, 844, "td007-fr-390x844"));
  await step("TD-007 : Vestiaire EN 768×1024 (tablette)", () => lockerAllClickable("en", 768, 1024, "td007-en-768x1024"));
  await step("TD-007 : Vestiaire FR 1366×768 (deux colonnes, aperçu collant)", () => lockerAllClickable("fr", 1366, 768, "td007-fr-1366x768"));
  await size(1366, 900);
}

// ── Aide (TD-008) : même touche dans le tableau et la FAQ ; synergies traduites ──
async function helpCheck(lang, layout, keys, want, tag) {
  await prefs({ lang, settings: { controls: { layout, keys } } });
  await go("#/help"); await waitFor(`!!document.querySelector(".table")`, 10000); await sleep(400);
  const r = await evaluate(`(() => {
    const label = ${JSON.stringify(lang === "en" ? "Call for the ball" : "Appel de balle")};
    const row = [...document.querySelectorAll("tr")].find(tr => tr.textContent.includes(label));
    const tableKey = row?.querySelector(".kbd")?.textContent;
    const faq = [...document.querySelectorAll(".mb16")].map(d => d.textContent).find(s => /(appel de balle|call for the ball)/i.test(s) && /(Appuyez|Press)/.test(s)) || "";
    const syn = [...document.querySelectorAll(".grid.g2 .small")].map(d => d.textContent).join(" || ");
    return { tableKey, faq, syn };
  })()`);
  const faqKey = (/(?:Appuyez sur|Press) (\S+) /.exec(r.faq) || [])[1];
  info(`${tag} : tableau = ${r.tableKey}, FAQ = ${faqKey} (« ${r.faq.slice(r.faq.indexOf(lang === "en" ? "Press" : "Appuyez"), r.faq.indexOf(lang === "en" ? "Press" : "Appuyez") + 60)}… »)`);
  if (r.tableKey !== want || faqKey !== want) throw new Error(`touches divergentes : tableau ${r.tableKey}, FAQ ${faqKey}, attendu ${want}`);
  if (lang === "en") {
    const fr = ["Informatique", "Cybersécurité", "Chimie", "Bancaire", "Physique", "Electronique", "Biologie", "Médecine", "Agroalimentaire", "Mathématiques"].filter(w => r.syn.includes(w));
    if (fr.length) throw new Error("domaines non traduits : " + fr.join(", "));
    if (!r.syn.includes("Computer Science / Cybersecurity") || !r.syn.includes("Biology / Medicine / Agri-Food")) throw new Error("synergies : " + r.syn.slice(0, 200));
  }
  await evaluate(`[...document.querySelectorAll(".mb16")].find(d => /(Appuyez|Press)/.test(d.textContent))?.scrollIntoView({ block: "center" })`); await sleep(200); await shot(tag);
}
if (run("td008")) {
  await step("TD-008 : FAQ et tableau identiques (FR AZERTY, FR QWERTY, EN QWERTY, EN AZERTY + B, FR + B) ; synergies traduites", async () => {
    await helpCheck("fr", "azerty", null, "Z", "td008-fr-azerty");
    await helpCheck("fr", "qwerty", null, "W", "td008-fr-qwerty");
    await helpCheck("en", "qwerty", null, "W", "td008-en-qwerty");
    await helpCheck("en", "azerty", { call: ["KeyB"] }, "B", "td008-en-remap-b");
    await helpCheck("fr", "azerty", { call: ["KeyB"] }, "B", "td008-fr-remap-b");
    // synergies EN visibles
    await prefs({ lang: "en", settings: { controls: {} } }); await go("#/help"); await sleep(400);
    await evaluate(`[...document.querySelectorAll(".grid.g2 .small")].find(d => d.textContent.includes("Computer Science"))?.scrollIntoView({ block: "center" })`); await sleep(200); await shot("td008-en-synergies");
    await evaluate(`localStorage.removeItem("ll.settings")`);
  });
}

// ── Arène (TD-004) : caméras proche / éloignée près des deux buts et le long d'une paroi ──
if (run("td004")) {
  const SCENES = [
    // [nom, x, z, cible du regard] : son propre but dans le dos (cas de la recette), but adverse devant, paroi latérale
    ["but-propre", -17.5, 1.5], ["but-adverse", 18.2, -1.2], ["paroi", -2, 11.4], ["coin", -18.8, -10.8],
  ];
  // rendu logiciel (1–2 i/s) : la caméra est lissée image par image ; on attend qu'elle soit stabilisée sur la scène
  const settle = async (x, z) => {
    let prev = null, stable = 0; const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      await sleep(700);
      const r = await evaluate(`(() => { const L = window.__ll3d.latest.p[window.__ll3d.mySlot]; const c = window.__ll3d.camera.position; return { d: Math.hypot(L[0] - ${x}, L[1] - ${z}), c: [c.x, c.y, c.z] }; })()`);
      if (r.d < 0.6 && prev && Math.max(...r.c.map((v, i) => Math.abs(v - prev[i]))) < 0.04) { if (++stable >= 2) return r.c; } else stable = 0;
      prev = r.c;
    }
    throw new Error(`caméra non stabilisée sur (${x}, ${z})`);
  };
  for (const q of ["low", "medium", "high"]) {
    await step(`TD-004 : qualité ${q} — caméras dans la cage, obstacles estompés (2 tailles, 2 caméras, 4 positions)`, async () => {
      await size(1366, 768); await prefs({ lang: "fr", settings: { quality: q, adaptiveQuality: false, camera: "near" } });
      await startArena("fr");
      const out = [];
      for (const [w, h] of [[886, 620], [1366, 768]]) {
        await size(w, h); await sleep(600);
        for (const cam of ["near", "far"]) {
          for (let i = 0; i < 4 && (await evaluate(`window.__ll3d.camMode`)) !== cam; i++) { await key("KeyC"); await sleep(1200); }
          if ((await evaluate(`window.__ll3d.camMode`)) !== cam) throw new Error("caméra " + cam + " non sélectionnée");
          for (const [name, x, z] of SCENES) {
            // on maintient son joueur (avec le ballon) à la position voulue le temps de la mesure
            // bots figés (ni tacle ni but : pas de ralenti qui changerait de caméra pendant la mesure)
            await evaluate(`(() => { clearInterval(window.__hold); const r = ${localRoom}; const me = window.__ll3d.mySlot; r.brain.update = () => {}; window.__hold = setInterval(() => { for (const q of r.sim.players) { q.vx = 0; q.vz = 0; } const p = r.sim.players[me]; Object.assign(p, { x: ${x}, z: ${z} }); r.sim.ball.owner = me; }, 30); })()`);
            const c = (await settle(x, z)).map(v => +v.toFixed(2));
            const inside = Math.abs(c[0]) <= 19.6 && Math.abs(c[2]) <= 11.6; // cage : parois à ±20 / ±12 (marge : secousses)
            const bloom = await evaluate(`+(window.__ll3d.pipeline.composer?.passes.find(p => p.strength !== undefined)?.strength ?? 0).toFixed(3)`);
            out.push(`${w}×${h} ${cam} ${name} : caméra (${c.join(", ")}), bloom ${bloom}${inside ? "" : " HORS CAGE"}`);
            if (!inside) throw new Error(`caméra hors de la cage : ${cam} ${name} ${c}`);
            if (w === 886 || name === "but-propre") await shot(`td004-${q}-${w}x${h}-${cam}-${name}`);
          }
        }
      }
      await evaluate(`clearInterval(window.__hold)`);
      info(`TD-004 ${q} : ` + out.join(" ; "));
      const fps = await evaluate(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(Math.round(n / 2)); }; requestAnimationFrame(f); })`);
      const calls = await evaluate(`window.__ll3d.renderer.info.render.calls`);
      info(`TD-004 ${q} : ${fps} i/s (SwiftShader, sans GPU), ${calls} appels de dessin par image`);
      await key("Escape"); await waitFor(`!!document.querySelector(".hud-menu")`, 30000); await realClickText(LBL.fr.quit); await waitFor(has(LBL.fr.lvl), 30000);
    });
  }
  await evaluate(`localStorage.removeItem("ll.settings")`);
}

console.log("\n" + results.map(r => r.join(" ")).join("\n"));
if (logs.length) console.log("\nConsole :\n" + [...new Set(logs)].slice(0, 30).join("\n"));
writeFileSync(path.join(OUT, "resultats.txt"), results.map(r => r.join(" ")).join("\n") + (logs.length ? "\n\nConsole :\n" + [...new Set(logs)].slice(0, 30).join("\n") : "") + "\n");
ws.close(); chrome.kill();
process.exit(results.some(r => r[0] === "✖") ? 1 : 0);
