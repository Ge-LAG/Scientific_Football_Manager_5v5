// Correctifs issus de la recette UAT-002 (TD-002, TD-003, TD-008) : pause de l'Arène en solo,
// préparation libre du Manager solo, aide et synergies cohérentes avec les touches et la langue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ArenaRoom, BTN } from "../shared/rooms/arenaRoom.js";
import fr from "../src/i18n/fr.js";
import en from "../src/i18n/en.js";
import { SYNERGIES } from "../shared/data/enrichment.js";
import { PLAYERS, domainName, domainWord } from "../shared/data/content.js";
import { resolveBindings, codeLabel, padLabel } from "../src/three/controls.js";

const client = (id, extra = {}) => { const msgs = []; return { id, pseudo: id, guestId: "g" + id.padEnd(8, "0"), send: m => msgs.push(m), msgs, ...extra }; };
const last = (c, t) => [...c.msgs].reverse().find(m => m.t === t);

// salle Arène lancée, sans minuterie : on pilote les ticks à la main (déterministe)
function startedArena(opts = {}, ids = ["solo"]) {
  const room = new ArenaRoom({ code: "PZ", opts: { halfSeconds: 60, ...opts } });
  const cs = ids.map(id => client(id));
  for (const c of cs) room.join(c);
  room.handle(cs[0].id, { t: "a.start" });
  room.clearTimers();
  return { room, cs };
}
const freeze = sim => JSON.stringify({ t: sim.time, k: sim.tick, c: sim.clock(), s: sim.score, ph: sim.phase, b: [sim.ball.x, sim.ball.z, sim.ball.owner], p: sim.players.map(p => [p.x, p.z, p.stamina, (p.pus || []).map(u => u.cd)]) });

test("TD-002 : en solo, la pause fige chrono, score, IA et recharges ; la reprise repart sans saut", () => {
  const { room, cs: [me] } = startedArena();
  for (let i = 0; i < 150; i++) room.step(); // 5 s de jeu (coup d'envoi passé)
  assert.equal(last(me, "room.state").canPause, true);
  const slot = room.members.get("solo").seat;
  room.sim.phase = "play"; room.onInput(slot, { mx: 0, mz: 0, aim: 0, b: BTN.pu }); room.step(); // power-up lancé : recharge en cours
  const pu = room.sim.players[slot].pus[0]; assert.ok(pu.cd > room.sim.time, "recharge en cours");
  const cdLeft = pu.cd - room.sim.time;
  room.onInput(slot, { mx: 1, mz: 0, aim: 0, b: BTN.sprint | BTN.press }); // entrée maintenue au moment de la pause
  room.handle("solo", { t: "a.pause", on: true });
  assert.equal(room.paused, true);
  assert.equal(last(me, "room.state").paused, true);
  const before = freeze(room.sim); const snaps = me.msgs.filter(m => m.t === "a.snap").length;
  for (let i = 0; i < 30 * 35; i++) room.step(); // 35 s de pause (30 ticks/s)
  assert.equal(freeze(room.sim), before, "rien ne bouge pendant la pause");
  assert.equal(pu.cd - room.sim.time, cdLeft, "la recharge du power-up n'avance pas");
  assert.equal(me.msgs.filter(m => m.t === "a.snap").length, snaps, "aucun instantané pendant la pause");
  room.handle("solo", { t: "a.pause", on: false });
  assert.equal(room.paused, false);
  assert.equal(last(me, "room.state").paused, false);
  assert.equal(room.inputs[slot], undefined, "les touches maintenues avant la pause ne sont pas rejouées");
  const t0 = room.sim.time; room.step();
  assert.ok(Math.abs(room.sim.time - t0 - 1 / 30) < 1e-9, "un seul tick après la reprise (pas de rattrapage)");
  room.close();
});

test("TD-002 : pause près de la mi-temps et juste après un but — l'état reste celui du moment", () => {
  const { room } = startedArena({ halfSeconds: 60 });
  const sim = room.sim;
  while (sim.clock() > 1.2 && sim.phase !== "ended") room.step(); // à ~1 s de la mi-temps
  room.handle("solo", { t: "a.pause", on: true });
  const h = sim.half, ph = sim.phase, c = sim.clock();
  for (let i = 0; i < 900; i++) room.step();
  assert.deepEqual([sim.half, sim.phase, sim.clock()], [h, ph, c]);
  room.handle("solo", { t: "a.pause", on: false });
  for (let i = 0; i < 900 && sim.phase !== "halftime"; i++) room.step(); // (un but de dernière seconde peut s’intercaler)
  assert.equal(sim.phase, "halftime", "la mi-temps arrive normalement après la reprise");
  // but : phase « goal » figée pendant la pause (pas de coup d'envoi en arrière-plan)
  for (let i = 0; i < 600 && !(sim.half === 2 && sim.phase === "play"); i++) room.step();
  assert.equal(sim.half, 2);
  sim.phase = "play"; sim.ball.owner = -1; sim.ball.x = 19.9; sim.ball.z = 0; sim.ball.y = 0.3; sim.ball.vx = 12; sim.ball.vz = 0; sim.ball.vy = 0;
  for (let i = 0; i < 20 && sim.phase !== "goal"; i++) room.step();
  assert.equal(sim.phase, "goal");
  room.handle("solo", { t: "a.pause", on: true });
  const s = [...sim.score], until = sim.phaseUntil; for (let i = 0; i < 900; i++) room.step();
  assert.equal(sim.phase, "goal"); assert.deepEqual(sim.score, s); assert.equal(sim.phaseUntil, until);
  room.close();
});

test("TD-002 : pas de pause avec un autre humain, dans une salle publique, ni pour un spectateur", () => {
  const two = startedArena({}, ["ana", "ben"]);
  two.room.handle("ana", { t: "a.pause", on: true });
  assert.equal(two.room.paused, false);
  assert.equal(last(two.cs[0], "room.state").canPause, false);
  two.room.close();

  const pub = startedArena({ public: true });
  pub.room.handle("solo", { t: "a.pause", on: true });
  assert.equal(pub.room.paused, false);
  pub.room.close();

  // pause en solo puis arrivée d'un autre humain : le match reprend aussitôt
  const { room } = startedArena();
  room.handle("solo", { t: "a.pause", on: true });
  assert.equal(room.paused, true);
  const late = client("late"); room.join(late);
  assert.equal(room.paused, false);
  assert.equal(last(late, "room.state").canPause, false);
  room.handle("late", { t: "a.pause", on: true });
  assert.equal(room.paused, false);
  room.close();
});

test("TD-003 : contre un bot, composition sans limite de temps ; entre humains, délai explicite conservé", async () => {
  const { ManagerRoom } = await import("../shared/rooms/managerRoom.js");
  const until = async (pred, ms = 15000) => { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error("délai"); await new Promise(r => setTimeout(r, 20)); } };
  const spyDelays = room => { const delays = []; const after = room.after.bind(room); room.after = (ms, fn) => { delays.push(ms); return after(ms, fn); }; return delays; };

  const solo = new ManagerRoom({ code: "S1", opts: { bot: "stagiaire", autostart: true } });
  const delays = spyDelays(solo);
  const a = client("solo"); solo.join(a);
  await until(() => solo.phase === "draft");
  solo.handle("solo", { t: "m.autodraft" });
  await until(() => solo.phase === "setup");
  assert.equal(last(a, "room.state").setupRemainingMs, null, "pas de compte à rebours transmis");
  assert.ok(!delays.includes(60000), "aucun départ automatique programmé");
  await new Promise(r => setTimeout(r, 700));
  assert.equal(solo.phase, "setup", "le match attend le joueur");
  solo.handle("solo", { t: "m.setup", lineup: solo.seats.home.lineup, formation: "2-2", strategy: "attack", ready: true });
  await until(() => solo.phase === "playing");
  solo.close();

  const duo = new ManagerRoom({ code: "S2", opts: {} });
  const d2 = spyDelays(duo);
  const x = client("xa"), y = client("yb"); duo.join(x); duo.join(y);
  duo.handle("xa", { t: "m.start" });
  duo.handle("xa", { t: "m.autodraft" }); duo.handle("yb", { t: "m.autodraft" });
  await until(() => duo.phase === "setup");
  const ms = last(x, "room.state").setupRemainingMs;
  assert.ok(ms > 55000 && ms <= 60000, `délai en ligne conservé (${ms} ms)`);
  assert.ok(d2.includes(60000));
  duo.close();
});

// raccourcis fixes, non réaffectables (Manager 3D : C change de caméra)
const FIXED_SHORTCUTS = new Set(["settings.specCamNote"]);
const fill = (str, p) => str.replace(/\{(\w+)\}/g, (_, k) => (k in p ? String(p[k]) : `{${k}}`));

test("TD-008 : aucune touche d'action figée dans les textes (FR/EN) ; la FAQ reçoit la touche effective", () => {
  for (const [lang, cat] of [["fr", fr], ["en", en]]) {
    for (const [k, v] of Object.entries(cat)) {
      if (FIXED_SHORTCUTS.has(k)) continue;
      const s = String(v).replace(/\{\w+\}/g, "");
      assert.ok(!/(R3|L3|LB|RB|LT|RT|L1|R1|L2|R2)/.test(s), `${lang} ${k} : bouton de manette figé`);
      assert.ok(!/(?:[Aa]ppuyez sur|[Pp]ress|[Tt]ouche|[Kk]ey|[Tt]ap)\s+[A-Z]/.test(s) && !/\([A-Z]\)/.test(s), `${lang} ${k} : touche figée « ${s} »`);
    }
    assert.match(cat["help.a5"], /\{key\}/); assert.match(cat["help.a5"], /\{pad\}/);
  }
  // disposition AZERTY / QWERTY, puis réaffectation personnalisée de l'appel de balle sur B
  const layouts = [["azerty", "Z"], ["qwerty", "W"]];
  for (const [layout, want] of layouts) {
    const b = resolveBindings({ preset: "arrows", layout });
    const label = codeLabel(b.keys.call[0], layout);
    assert.equal(label, want, `appel de balle en ${layout}`);
    for (const cat of [fr, en]) assert.ok(fill(cat["help.a5"], { key: label, pad: padLabel(b.pad.call[0]) }).includes(label));
  }
  const custom = resolveBindings({ preset: "arrows", layout: "azerty", keys: { call: ["KeyB"] } });
  assert.deepEqual(custom.keys.call, ["KeyB"]);
  assert.equal(codeLabel("KeyB", "azerty"), "B");
  assert.ok(fill(en["help.a5"], { key: "B", pad: "R3" }).startsWith("Press B "));
  assert.ok(fill(fr["help.a5"], { key: "B", pad: "R3" }).startsWith("Appuyez sur B "));
  // plus d'affirmation obsolète sur les caractéristiques d'origine (répartition libre depuis la vague 6)
  assert.doesNotMatch(fr["help.a3"], /^Non/); assert.doesNotMatch(en["help.a3"], /^No/);
});

test("TD-008 : domaines des synergies traduits, cohérents avec les filtres de la liste des scientifiques", () => {
  const domainsEn = [...new Set(PLAYERS.map(p => domainName(p.domaine, "en")))];
  for (const s of SYNERGIES) for (const w of s.match) {
    const e = domainWord(w, "en");
    assert.equal(domainWord(w, "fr"), w);
    if (w !== "Business") assert.notEqual(e, w, `« ${w} » traduit`);
    assert.ok(!/[éèàç]/i.test(e), `« ${e} » sans mot français`);
    // le libellé traduit apparaît dans au moins un domaine anglais de la liste (même vocabulaire que le filtre)
    assert.ok(domainsEn.some(d => d.includes(e)), `« ${e} » présent dans les domaines de la liste`);
    // et la synergie concerne bien les scientifiques de ce domaine
    assert.ok(PLAYERS.some(p => p.domaine.includes(w)), `au moins un scientifique « ${w} »`);
  }
});

test("TD-004 : caméras proche / éloignée toujours dans la cage de verre (buts et parois), inchangées au centre", async () => {
  globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
  const THREE = await import("three");
  const { createCameraRig } = await import("../src/three/cameraRig.js");
  const { FIELD } = await import("../shared/action/sim.js");
  const canvas = { addEventListener() {}, removeEventListener() {} };
  const at = (mode, x, z, yaw) => {
    const cam = new THREE.PerspectiveCamera(60, 1.6, 0.1, 400);
    const rig = createCameraRig(cam, canvas, { interactive: true, mode });
    const me = new THREE.Group(); me.position.set(x, 0, z);
    rig.update(1 / 60, { yaw, pitch: 0.3, zoom: 0, me, ball: new THREE.Vector3(x, 0.1, z), ballVel: new THREE.Vector3(), owner: -1, avatars: [], phase: "play" });
    rig.dispose(); return cam.position.clone();
  };
  const inside = p => Math.abs(p.x) <= FIELD.HX - 0.69 && Math.abs(p.z) <= FIELD.HZ - 0.69;
  for (const mode of ["near", "far"]) {
    // défenseur devant SON but, face au jeu : sans correction la caméra serait derrière la vitre / dans la tribune
    for (const side of [-1, 1]) {
      const p = at(mode, side * 17, 0, side < 0 ? 0 : Math.PI);
      assert.ok(inside(p), `${mode}, but ${side} : ${p.toArray().map(v => v.toFixed(1))}`);
      assert.ok(p.y > 3, "la caméra monte quand la perche se raccourcit");
    }
    // le long des parois latérales, face au centre
    for (const side of [-1, 1]) assert.ok(inside(at(mode, 0, side * 10, side < 0 ? Math.PI / 2 : -Math.PI / 2)), `${mode}, paroi ${side}`);
    // coin et joueur dans son propre but
    assert.ok(inside(at(mode, -20.5, 0, 0.3)));
    assert.ok(inside(at(mode, 18, 11, Math.PI * 1.25)));
    // joueur collé à la paroi latérale, course le long de la paroi : la caméra reste derrière lui (translation, pas d'effondrement)
    const dist = mode === "far" ? 10 : 5.8, w = at(mode, 0, 11.5, 0);
    assert.ok(inside(w) && Math.abs(w.x + dist) < 0.01, `${mode} le long de la paroi : ${w.toArray().map(v => v.toFixed(2))}`);
    assert.ok(w.z < 11.5 - 0.8, "caméra légèrement rentrée vers le terrain le long de la paroi");
  }
  // au centre : plan d'origine (10 m derrière en caméra éloignée, 5,8 m en proche)
  assert.ok(Math.abs(at("far", 0, 0, 0).x + 10) < 1e-6);
  assert.ok(Math.abs(at("near", 0, 0, 0).x + 5.8) < 1e-6);
});
