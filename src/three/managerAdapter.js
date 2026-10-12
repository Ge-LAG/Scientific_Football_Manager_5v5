// Adaptateur : convertit les instantanés du moteur Manager (terrain 100 × 60) en instantanés « Arène » (40 × 24 m)
// pour afficher le match Manager dans le stade 3D (vue Stade, caméra télé).
const SX = 0.4; // 1 unité Manager = 0,4 m
const toX = x => (x - 50) * SX, toZ = y => (y - 30) * SX;

// setup : composition initiale du match (apparences et power-ups emportés de chaque club)
export function createManagerAdapter(setup = null) {
  let prev = null, t = 0, facing = {}, evId = 0, slots = null, slotKey = "";
  const gestures = new Map(); // slot → { action, until, dive } : gestes déduits du moteur (frappe, passe, tacle, plongeon)
  const gesture = (slot, action, dur, dive = 0) => { if (slot >= 0) gestures.set(slot, { action, until: t + dur, dive }); };
  const side = i => (i < 5 ? "home" : "away");

  function slotsFrom(teams) {
    const ids = [...teams.home.lineup.slice(0, 5), ...teams.away.lineup.slice(0, 5)];
    return ids.map((charId, i) => ({ slot: i, team: i < 5 ? 0 : 1, charId, human: false, look: setup?.[side(i)]?.looks?.[charId] || null, loadout: setup?.[side(i)]?.loadouts?.[charId] || null }));
  }
  // bits des power-ups actifs (ordre de la sélection du joueur)
  function activeMask(sl, act) {
    const lo = sl.loadout || []; let m = 0;
    for (const a of act) if (a.pid === sl.charId) { const k = lo.indexOf(a.id); m |= 1 << (k >= 0 ? k : 0); }
    return m;
  }

  // s : instantané du moteur ; ev : nouveaux événements ; dt : intervalle réel entre instantanés (s)
  function convert(s, ev, dt) {
    const key = s.teams.home.lineup.join() + "|" + s.teams.away.lineup.join();
    let changed = false;
    if (key !== slotKey) { slotKey = key; slots = slotsFrom(s.teams); changed = true; }
    t += dt;
    const slotOf = id => slots.findIndex(x => x.charId === id);
    const act = s.pu || []; const pu = new Set(act.map(a => a.pid));
    // départ d'une passe ou d'un tir : le passeur / tireur frappe
    const kicker = prev?.ball?.o;
    if (kicker && (s.ball.k === "pass" || s.ball.k === "shot") && prev.ball.k !== s.ball.k) gesture(slotOf(kicker), s.ball.k === "shot" ? "kick" : "pass", 0.4);
    for (const e of ev || []) {
      if (e.type === "TACKLE" || e.type === "INTERCEPT") gesture(slotOf(e.pid), "tackle", 0.55);
      if (e.type === "SAVE") { const k = slotOf(e.pid); const kp = s.p[e.pid]; gesture(k, "dive", 0.7, kp ? Math.sign(s.ball.y - kp[1]) || 1 : 1); }
    }
    const p = slots.map(sl => {
      const cur = s.p[sl.charId]; if (!cur) return [0, -30, 0, 0, 0, 0, 0, 0, "", 0, 1, 0, 0];
      const x = toX(cur[0]), z = toZ(cur[1]);
      const pr = prev?.p?.[sl.charId];
      const vx = pr ? (x - toX(pr[0])) / dt : 0, vz = pr ? (z - toZ(pr[1])) / dt : 0;
      const sp = Math.hypot(vx, vz);
      if (sp > 0.4) facing[sl.charId] = Math.atan2(vz, vx);
      else if (facing[sl.charId] == null) facing[sl.charId] = sl.team === 0 ? 0 : Math.PI;
      const g = gestures.get(sl.slot); const live = g && g.until > t;
      const flags = (sp > 5.5 ? 1 : 0) | (pu.has(sl.charId) ? 8 : 0) | (live && g.action === "dive" ? 4 : 0);
      return [x, z, vx, vz, facing[sl.charId], cur[2], flags, 0, live && g.action !== "dive" ? g.action : "", 0, live && g.dive ? g.dive : 1, 0, activeMask(sl, act)];
    });
    const bx = toX(s.ball.x), bz = toZ(s.ball.y);
    const pb = prev ? [toX(prev.ball.x), toZ(prev.ball.y)] : [bx, bz];
    const shot = s.ball.k === "shot";
    const ball = [bx, shot ? 0.6 : 0.11, bz, (bx - pb[0]) / dt, 0, (bz - pb[1]) / dt, s.ball.o ? slotOf(s.ball.o) : -1];
    const phase = s.phase === "goal" ? "goal" : s.phase === "halftime" ? "halftime" : s.phase === "ended" ? "ended" : "play";
    // événements → effets et sons de la vue 3D
    const events = [];
    for (const e of ev || []) {
      const slot = e.pid ? slotOf(e.pid) : -1; const team = e.side === "home" ? 0 : e.side === "away" ? 1 : -1;
      const map = { GOAL: "GOAL", SAVE: "SAVE", TACKLE: "TACKLE", INTERCEPT: "TACKLE", POWERUP: "POWERUP", FOUL: "FOUL", POST: "POST", HALFTIME: "HALFTIME", END: "END", SECOND_HALF: "SECOND_HALF", MISS: "SHOT" }[e.type];
      if (map) events.push({ id: ++evId, t: Math.round(t * 10) / 10, type: map, slot, team, power: 22, pu: e.pu });
    }
    // un tir qui part : étincelle et son de frappe
    if (shot && prev?.ball?.k !== "shot" && s.ball.tx != null) events.push({ id: ++evId, t, type: "SHOT", slot: s.ball.o ? slotOf(s.ball.o) : -1, team: -1, power: 24 });
    prev = s;
    return { snap: { k: s.t, t, ph: phase, h: s.half, c: 0, s: s.score, b: ball, p }, events, slots, changed };
  }
  return { convert };
}
