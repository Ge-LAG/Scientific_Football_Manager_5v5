// Adaptateur : convertit les instantanés du moteur Manager (terrain 100 × 60) en instantanés « Arène » (40 × 24 m)
// pour afficher le match Manager dans le stade 3D (vue Stade, caméra télé).
const SX = 0.4; // 1 unité Manager = 0,4 m
const toX = x => (x - 50) * SX, toZ = y => (y - 30) * SX;

export function createManagerAdapter() {
  let prev = null, t = 0, facing = {}, evId = 0, slots = null, slotKey = "";

  function slotsFrom(teams) {
    const ids = [...teams.home.lineup.slice(0, 5), ...teams.away.lineup.slice(0, 5)];
    return ids.map((charId, i) => ({ slot: i, team: i < 5 ? 0 : 1, charId, human: false }));
  }

  // s : instantané du moteur ; ev : nouveaux événements ; dt : intervalle réel entre instantanés (s)
  function convert(s, ev, dt) {
    const key = s.teams.home.lineup.join() + "|" + s.teams.away.lineup.join();
    let changed = false;
    if (key !== slotKey) { slotKey = key; slots = slotsFrom(s.teams); changed = true; }
    t += dt;
    const slotOf = id => slots.findIndex(x => x.charId === id);
    const pu = new Set((s.pu || []).map(a => a.pid));
    const p = slots.map(sl => {
      const cur = s.p[sl.charId]; if (!cur) return [0, -30, 0, 0, 0, 0, 0, 0, "", 0, 1];
      const x = toX(cur[0]), z = toZ(cur[1]);
      const pr = prev?.p?.[sl.charId];
      const vx = pr ? (x - toX(pr[0])) / dt : 0, vz = pr ? (z - toZ(pr[1])) / dt : 0;
      const sp = Math.hypot(vx, vz);
      if (sp > 0.4) facing[sl.charId] = Math.atan2(vz, vx);
      else if (facing[sl.charId] == null) facing[sl.charId] = sl.team === 0 ? 0 : Math.PI;
      const flags = (sp > 5.5 ? 1 : 0) | (pu.has(sl.charId) ? 8 : 0);
      return [x, z, vx, vz, facing[sl.charId], cur[2], flags, 0, "", 0, 1];
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
      if (map) events.push({ id: ++evId, t: Math.round(t * 10) / 10, type: map, slot, team, power: 22 });
    }
    // un tir qui part : étincelle et son de frappe
    if (shot && prev?.ball?.k !== "shot" && s.ball.tx != null) events.push({ id: ++evId, t, type: "SHOT", slot: s.ball.o ? slotOf(s.ball.o) : -1, team: -1, power: 24 });
    prev = s;
    return { snap: { k: s.t, t, ph: phase, h: s.half, c: 0, s: s.score, b: ball, p }, events, slots, changed };
  }
  return { convert };
}
