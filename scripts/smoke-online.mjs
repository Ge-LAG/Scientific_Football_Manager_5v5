// E2E en ligne : deux onglets Chrome sans interface, deux comptes de test, salle privée par code.
// Manager : draft → composition → match → rapport (XP/ELO) ; Arène : deux humains dans la même partie.
// Usage : node scripts/smoke-online.mjs [url=SMOKE_URL|http://localhost:8787] [dossier=smoke-out]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import WebSocket from "ws";

const BASE = process.argv[2] || process.env.SMOKE_URL || "http://localhost:8787";
const OUT = process.argv[3] || "smoke-out";
mkdirSync(OUT, { recursive: true });
const exe = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(p => existsSync(p));
if (!exe) { console.error("Aucun navigateur Chrome/Edge trouvé."); process.exit(2); }
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(tmpdir(), "ll-online-" + Date.now())}`, "--window-size=1280,860", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-first-run", "about:blank"], { stdio: "ignore" });
// SMOKE_SLOW (défaut 1) : un seul facteur qui multiplie toutes les attentes (waitFor et sleep),
// pour les machines lentes sous rendu logiciel. Chargement de page : jusqu'à 60 s × facteur.
const SLOW = Math.max(0.1, Number(process.env.SMOKE_SLOW) || 1);
const waitMs = ms => ms * SLOW;
const sleep = ms => new Promise(r => setTimeout(r, waitMs(ms)));
const tick = ms => new Promise(r => setTimeout(r, ms)); // cadence de sondage : non multipliée volontairement
const PAGELOAD = 60000;
if (SLOW !== 1) console.log(`SMOKE_SLOW ×${SLOW} : toutes les attentes sont multipliées.`);
for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(200); } }

// comptes de test éphémères (pseudo aléatoire, mot de passe aléatoire)
const mk = async () => { const pseudo = "Test" + randomBytes(3).toString("hex"); const password = randomBytes(9).toString("hex"); const r = await fetch(BASE + "/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pseudo, password }) }).then(r => r.json()); return { pseudo, password, token: r.token }; };
const accA = await mk(), accB = await mk();

// chaque joueur dans son propre contexte de navigation (stockage local séparé, comme deux ordinateurs)
const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise(r => bws.once("open", r));
let bid = 0; const bpend = new Map();
bws.on("message", raw => { const m = JSON.parse(raw.toString()); if (m.id && bpend.has(m.id)) { bpend.get(m.id)(m); bpend.delete(m.id); } });
const bcmd = (method, params = {}) => new Promise(r => { const i = ++bid; bpend.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });

async function page(name) {
  const { result: { browserContextId } } = await bcmd("Target.createBrowserContext", { disposeOnDetach: false });
  const { result: { targetId } } = await bcmd("Target.createTarget", { url: "about:blank", browserContextId });
  const ws = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${targetId}`); await new Promise(r => ws.once("open", r));
  let id = 0; const pending = new Map(); const logs = [];
  ws.on("message", raw => { const m = JSON.parse(raw.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === "Runtime.exceptionThrown") logs.push(name + " EXCEPTION " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); });
  const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expr => { const r = await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval"); return r.result?.result?.value; };
  await cmd("Runtime.enable"); await cmd("Page.enable");
  await cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
  const has = (...n) => `(${JSON.stringify(n.map(x => x.toLowerCase()))}).some(n => (document.body?.innerText || "").toLowerCase().includes(n))`;
  const P = {
    name, logs, cmd, evaluate, has,
    go: url => cmd("Page.navigate", { url }),
    click: text => evaluate(`(() => { const n = ${JSON.stringify(text)}.toLowerCase(); const b = [...document.querySelectorAll("button")].find(b => b.textContent.toLowerCase().includes(n) && !b.disabled); if (!b) return false; b.click(); return true; })()`).then(ok => { if (!ok) throw new Error(`${name} : bouton introuvable « ${text} »`); return ok; }),
    waitFor: async (expr, ms = PAGELOAD) => { const t0 = Date.now(); while (Date.now() - t0 < waitMs(ms)) { if (await evaluate(expr)) return true; await tick(300); } const g = await evaluate(`JSON.stringify({ mode: window.__llGame?.room?.mode, phase: window.__llGame?.room?.phase, joined: window.__llGame?.joined, cache: window.__llGame?.cacheKeys, hash: location.hash })`).catch(() => ""); const txt = g + " " + await evaluate(`(document.querySelector("main")?.innerText || "").split(String.fromCharCode(10)).join(" ").slice(0, 400)`).catch(() => ""); throw new Error(`${name} : attente dépassée : ${expr.slice(0, 80)} | page : ${txt}`); },
    shot: async file => { const r = await cmd("Page.captureScreenshot", { format: "png" }); writeFileSync(path.join(OUT, file + ".png"), Buffer.from(r.result.data, "base64")); console.log("📸", file); },
  };
  return P;
}

const A = await page("A"), B = await page("B");
const results = [];
let fails = 0;
const step = async (label, fn) => { try { await fn(); results.push(["✔", label]); } catch (e) { results.push(["✖", label + " — " + e.message]); fails++; await A.shot(`on-fail${fails}-A`).catch(() => {}); await B.shot(`on-fail${fails}-B`).catch(() => {}); } };

await step("Connexion des deux comptes (jeton de session)", async () => {
  for (const [P, acc] of [[A, accA], [B, accB]]) {
    await P.go(BASE + "/#/"); await P.waitFor(P.has("Lab League"));
    await P.evaluate(`localStorage.setItem("ll.token", ${JSON.stringify(JSON.stringify(acc.token))}); location.reload(); true`);
    await P.waitFor(P.has(acc.pseudo), 180000);
  }
});

let code = null;
const ONLY = process.env.ONLY || "";
if (!ONLY || ONLY === "manager") await step("Manager en ligne : salle privée, invitation par code, draft, composition", async () => {
  await A.evaluate(`location.hash = "#/manager"`); await A.waitFor(A.has("Salle privée"));
  await A.click("Courte"); await A.click("Salle privée");
  await A.waitFor(A.has("Code à partager"), 60000);
  code = await A.evaluate(`[...document.querySelectorAll(".num")].map(e => e.textContent.trim()).find(t => /^[A-Z0-9]{5,6}$/.test(t))`);
  if (!code) throw new Error("code de salle introuvable");
  await B.go(BASE + "/#/join/" + code); await B.waitFor(B.has("Salle d'attente"), PAGELOAD);
  await A.waitFor(A.has(accB.pseudo), 60000); await A.shot("on-01-lobby-A");
  await A.click("Lancer la draft");
  await A.waitFor(A.has("Draft automatique"), 60000); await B.waitFor(B.has("Draft automatique"), 60000);
  await A.click("Draft automatique"); await B.click("Draft automatique");
  await A.waitFor(A.has("Prêt, coup d'envoi"), 60000); await B.waitFor(B.has("Prêt, coup d'envoi"), 60000);
  await B.shot("on-02-composition-B");
  await A.click("Prêt, coup d'envoi"); await B.click("Prêt, coup d'envoi");
});
if (!ONLY || ONLY === "manager") await step("Manager en ligne : match synchronisé puis rapport avec XP et ELO", async () => {
  await A.waitFor(A.has("Fil du match"), 60000); await B.waitFor(B.has("Fil du match"), 60000);
  // les boutons de stratégie apparaissent avec le premier instantané du match
  await B.waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("Fission Nucléaire"))`, 120000);
  await B.click("Fission Nucléaire"); await sleep(3000); await B.shot("on-03-match-B");
  await A.waitFor(A.has("Homme du match"), 240000); await B.waitFor(B.has("Homme du match"), 60000);
  await A.shot("on-04-rapport-A");
  const txt = await A.evaluate(`document.body.innerText`);
  if (!/XP/.test(txt)) throw new Error("XP absente du rapport"); // (l'ELO ne s'affiche pas en cas de variation nulle)
  // les deux joueurs restent sur le rapport : l'étape suivante vote « Revanche » depuis cet écran
});
if (!ONLY || ONLY === "manager") await step("Revanche en ligne (Manager) : les deux votent, même nouvelle salle, mêmes côtés et clubs, draft relancée", async () => {
  const code0 = await A.evaluate(`window.__llGame.joined.code`);
  const seatOf = P => P.evaluate(`window.__llGame.joined.seat`);
  const clubOf = (P, side) => P.evaluate(`window.__llGame.room.seats.${side}.club.name`);
  const seatA0 = await seatOf(A), seatB0 = await seatOf(B), clubA0 = await clubOf(A, seatA0), clubB0 = await clubOf(B, seatB0);
  // bouton et compteur visibles chez les deux joueurs, puis votes successifs
  const hasVote = `[...document.querySelectorAll("button")].some(b => b.textContent.includes("Revanche"))`;
  await A.waitFor(hasVote, 60000); await B.waitFor(hasVote, 30000);
  await A.click("Revanche");
  await B.waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("⚔") && b.textContent.includes("1/2"))`, 30000); // la voix de A est comptée chez B
  await B.click("Revanche");
  // les deux votants entrent automatiquement dans la même nouvelle salle, même côté, même club
  await A.waitFor(`window.__llGame?.joined?.code && window.__llGame.joined.code !== ${JSON.stringify(code0)}`, 120000);
  await B.waitFor(`window.__llGame?.joined?.code && window.__llGame.joined.code !== ${JSON.stringify(code0)}`, 60000);
  const codeA = await A.evaluate(`window.__llGame.joined.code`), codeB = await B.evaluate(`window.__llGame.joined.code`);
  if (codeA !== codeB) throw new Error(`codes différents : ${codeA} / ${codeB}`);
  await A.waitFor(`window.__llGame?.room?.phase === "lobby"`, 60000); await B.waitFor(`window.__llGame?.room?.phase === "lobby"`, 60000);
  const seatA1 = await seatOf(A), seatB1 = await seatOf(B);
  if (seatA1 !== seatA0 || seatB1 !== seatB0) throw new Error(`côtés changés : A ${seatA0}→${seatA1}, B ${seatB0}→${seatB1}`);
  await A.shot("on-09-rematch-lobby-A"); await B.shot("on-10-rematch-lobby-B");
  // l'hôte relance : nouvelle draft, puis match
  await A.click("Lancer la draft");
  await A.waitFor(`window.__llGame?.room?.phase === "draft"`, 60000); await B.waitFor(`window.__llGame?.room?.phase === "draft"`, 60000);
  // mêmes clubs qu'au match précédent (vérifié après dédup éventuelle au démarrage de la draft)
  const clubA1 = await clubOf(A, seatA1), clubB1 = await clubOf(B, seatB1);
  if (clubA1 !== clubA0 || clubB1 !== clubB0) throw new Error(`clubs changés : ${clubA0}→${clubA1}, ${clubB0}→${clubB1}`);
  await A.click("Draft automatique"); await B.click("Draft automatique");
  await A.waitFor(A.has("Prêt, coup d'envoi"), 120000); await B.waitFor(B.has("Prêt, coup d'envoi"), 60000);
  await A.click("Prêt, coup d'envoi"); await B.click("Prêt, coup d'envoi");
  await A.waitFor(`window.__llGame?.room?.phase === "playing"`, 120000); await B.waitFor(`window.__llGame?.room?.phase === "playing"`, 60000);
  console.log(`ℹ revanche ${code0} → ${codeA} : mêmes côtés (A ${seatA1}, B ${seatB1}), mêmes clubs, match relancé`);
});
await step("Arène en ligne : deux humains dans la même partie, apparence visible de l'adversaire", async () => {
  // B personnalise tous ses scientifiques (tenue médiévale, mulet rasé) : A doit la voir dans la salle
  const ids = ["roland", "loic", "david", "thibault", "henry", "romain", "theo", "franck", "aurelien", "lucien", "joffrey", "yacine", "djilani", "mederic", "guillaume", "patrice"];
  const looks = Object.fromEntries(ids.map(id => [id, { outfit: "medieval", hairStyle: "mullet_shaved", headwear: "none" }]));
  await B.evaluate(`localStorage.setItem("ll.looks", ${JSON.stringify(JSON.stringify(looks))}); location.reload(); true`);
  await B.waitFor(B.has(accB.pseudo), PAGELOAD);
  await A.evaluate(`location.hash = "#/arena"`); await A.waitFor(A.has("Salle privée"));
  await A.click("1 min"); await A.click("Salle privée"); await A.waitFor(A.has("Code à partager"), 60000);
  code = await A.evaluate(`[...document.querySelectorAll(".num")].map(e => e.textContent.trim()).find(t => /^[A-Z0-9]{5,6}$/.test(t))`);
  await B.go(BASE + "/#/join/" + code); await B.waitFor(B.has("Votre scientifique"), PAGELOAD);
  await A.waitFor(`[...document.querySelectorAll("button")].filter(b => b.textContent.includes("👤")).length >= 2`, 60000);
  await A.waitFor(`(window.__llGame?.room?.slots || []).some(s => s.human && s.pseudo === ${JSON.stringify(accB.pseudo)} && s.look?.outfit === "medieval" && s.look?.hairStyle === "mullet_shaved")`, 30000);
  await A.shot("on-05-arene-lobby-A");
  await A.click("Coup d'envoi");
  await A.waitFor(`!!document.querySelector(".arena-root canvas")`, 60000); await B.waitFor(`!!document.querySelector(".arena-root canvas")`, 60000);
  await sleep(6000);
  await A.shot("on-06-arene-A"); await B.shot("on-07-arene-B");
  // l'avatar 3D du scientifique de B porte, chez A, l'apparence choisie par B
  const bSlot = await A.evaluate(`window.__llGame.room.slots.find(s => s.pseudo === ${JSON.stringify(accB.pseudo)})?.slot`);
  const seen = await A.evaluate(`window.__ll3d.looks.find(l => l.slot === ${bSlot})`);
  if (seen?.outfit !== "medieval" || seen?.hair !== "mullet_shaved") throw new Error("apparence de B non visible chez A : " + JSON.stringify(seen));
  const clockA = await A.evaluate(`document.querySelector(".hud-top")?.textContent || ""`), clockB = await B.evaluate(`document.querySelector(".hud-top")?.textContent || ""`);
  if (!clockA || !clockB) throw new Error("HUD absent");
});
await step("Arène en ligne : avec un autre humain, le menu prévient que le match continue (pas de pause)", async () => {
  await A.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true })); setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Escape", bubbles: true })), 150); true`);
  await A.waitFor(A.has("le match continue"), 20000);
  // le match avance chez les deux joueurs (une pause donnerait 0 tick ; rendu logiciel : instantanés reçus au ralenti)
  const a0 = await A.evaluate(`window.__ll3d.latest.k`), k0 = await B.evaluate(`window.__ll3d.latest.k`);
  let a1 = a0, k1 = k0; const t0 = Date.now(); // sondage borné : la progression compte, pas le débit
  while ((a1 < a0 + 5 || k1 < k0 + 5) && Date.now() - t0 < waitMs(30000)) { await tick(1000); a1 = await A.evaluate(`window.__ll3d.latest.k`); k1 = await B.evaluate(`window.__ll3d.latest.k`); }
  const paused = await A.evaluate(`!!window.__llGame.room.paused || !!window.__llGame.room.canPause`);
  await A.shot("on-08-arene-menu-A");
  if (paused) throw new Error("la salle à deux humains accepte la pause");
  if (!(k1 >= k0 + 5 && a1 >= a0 + 5)) throw new Error(`le match ne continue pas pendant le menu de A (A ${a0} → ${a1}, B ${k0} → ${k1})`);
  console.log(`ℹ menu ouvert chez A : ticks A ${a0} → ${a1}, B ${k0} → ${k1} en ${Math.round((Date.now() - t0) / 1000)} s`);
  await A.click("Reprendre");
});

console.log("\n" + results.map(r => r.join(" ")).join("\n"));
const logs = [...A.logs, ...B.logs]; if (logs.length) console.log("\nConsole :\n" + [...new Set(logs)].slice(0, 20).join("\n"));
// nettoyage : suppression des comptes de test
for (const acc of [accA, accB]) await fetch(BASE + "/api/me", { method: "DELETE", headers: { "content-type": "application/json", authorization: "Bearer " + acc.token }, body: JSON.stringify({ password: acc.password }) }).catch(() => {});
chrome.kill();
process.exit(results.some(r => r[0] === "✖") ? 1 : 0);
