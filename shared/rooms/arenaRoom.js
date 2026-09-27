// Salle « L'Arène » : 5 contre 5 à la 3e personne, jusqu'à 10 humains, bots de complément,
// entrée et sortie en cours de match (un humain remplace un bot, un départ redevient bot).
import { BaseRoom } from "./base.js";
import { ArenaSim, TICK_HZ, ROLES } from "../action/sim.js";
import { ArenaBrain, BOT_LEVELS } from "../action/bot.js";
import { PLAYERS, getPlayer } from "../data/content.js";
import { ROLE_SCORE } from "../manager/ai.js";
import { makeRng, randomSeed } from "../rng.js";

// bits des boutons envoyés par le client
export const BTN = { sprint: 1, shoot: 2, pass: 4, lob: 8, tackle: 16, pu: 32, aimFace: 64, call: 128, skill: 256 };
const EDGE = BTN.pass | BTN.lob | BTN.tackle | BTN.pu | BTN.call | BTN.skill;
const HALVES = [60, 120, 180, 300];

export class ArenaRoom extends BaseRoom {
  constructor(o) {
    super({ ...o, mode: "arena" });
    const hs = HALVES.includes(this.opts.halfSeconds) ? this.opts.halfSeconds : 180;
    const training = !!this.opts.training && !this.opts.public;
    this.opts = { halfSeconds: training ? 300 : hs, botLevel: training ? "training" : BOT_LEVELS[this.opts.botLevel] ? this.opts.botLevel : "normal", public: !!this.opts.public, quick: !!this.opts.quick, training };
    this.rng = makeRng(randomSeed());
    this.slots = Array.from({ length: 10 }, (_, i) => ({ slot: i, team: i < 5 ? 0 : 1, memberId: null, identity: null, pseudo: null, userId: null, charId: null, left: false }));
    this.teams = [{ name: "Labo Alpha", color: "#00F0FF" }, { name: "Labo Oméga", color: "#FF00E5" }];
    this.sim = null; this.brain = null; this.evSent = 0; this.inputs = {}; this.startAt = null;
  }

  isPublicJoinable() { return this.opts.public && this.phase !== "ended" && this.humanCount() < 10; }
  humanCount() { return this.slots.filter(s => s.memberId).length; }

  // ── Membres ───────────────────────────────────────────────
  join(client) {
    const id = BaseRoom.identity(client);
    this.addMember(client);
    let s = this.slots.find(x => x.identity === id);
    if (!s) s = this.freeSlot();
    if (s) this.occupy(s, client, id);
    this.broadcastState();
    if (this.phase === "playing" || this.phase === "ended") this.send(client.id, { t: "a.init", slots: this.slotInfo(), teams: this.teams, events: this.sim.events.slice(-20) });
    if (this.results) this.send(client.id, { t: "a.end", ...this.results });
    if (this.opts.quick && this.phase === "lobby" && !this.startAt) { this.startAt = Date.now() + 12000; this.after(12000, () => this.start()); this.broadcastState(); }
    return s ? s.slot : "spec";
  }

  freeSlot() {
    // équipe la moins peuplée en humains ; en lobby on évite le poste de gardien, en match on prend un bot
    const counts = [0, 1].map(t => this.slots.filter(s => s.team === t && s.memberId).length);
    const order = counts[0] <= counts[1] ? [0, 1] : [1, 0];
    for (const t of order) {
      const cands = this.slots.filter(s => s.team === t && !s.memberId).sort((a, b) => ((a.slot % 5 === 0) - (b.slot % 5 === 0)) || ((b.slot % 5) - (a.slot % 5)));
      if (cands.length) return cands[0];
    }
    return null;
  }

  occupy(s, client, identity) {
    Object.assign(s, { memberId: client.id, identity, pseudo: client.pseudo, userId: client.userId || null, left: false });
    this.members.get(client.id).seat = s.slot;
    if (this.phase === "lobby") { if (!s.charId || this.slots.some(o => o !== s && o.charId === s.charId)) s.charId = this.suggestChar(s.slot); }
    if (this.sim) this.sim.setSlot(s.slot, { charId: s.charId, name: s.pseudo, human: true });
  }

  leave(clientId) {
    const m = this.members.get(clientId); if (!m) return;
    const s = typeof m.seat === "number" ? this.slots[m.seat] : null;
    this.removeMember(clientId);
    if (s) {
      s.memberId = null;
      if (this.phase === "lobby") Object.assign(s, { identity: null, pseudo: null, userId: null, charId: null });
      else { s.left = true; if (this.sim) this.sim.setSlot(s.slot, { charId: s.charId, human: false }); }
      delete this.inputs[s.slot];
    }
    this.broadcastState();
  }

  suggestChar(slot) {
    const taken = new Set(this.slots.filter(s => s.slot !== slot && s.charId).map(s => s.charId));
    const role = ROLES[slot % 5] === "gk" ? "gk" : ROLES[slot % 5];
    const free = PLAYERS.filter(p => !taken.has(p.id));
    return free.sort((a, b) => ROLE_SCORE[role](b) - ROLE_SCORE[role](a))[0]?.id || PLAYERS[slot].id;
  }

  // ── Messages ─────────────────────────────────────────────
  handle(clientId, msg) {
    const m = this.members.get(clientId); if (!m) return;
    const s = typeof m.seat === "number" ? this.slots[m.seat] : null; const isHost = clientId === this.hostId;
    switch (msg.t) {
      case "a.in": if (s && this.phase === "playing") this.onInput(s.slot, msg); break;
      case "a.slot": if (this.phase === "lobby") this.moveTo(clientId, msg.slot); break;
      case "a.char": if (s && this.phase === "lobby" && getPlayer(msg.charId) && !this.slots.some(o => o !== s && o.memberId && o.charId === msg.charId)) {
        s.charId = msg.charId;
        for (const o of this.slots) if (o !== s && o.charId === msg.charId) o.charId = this.suggestChar(o.slot); // un bot cède son personnage
        this.broadcastState();
      } break;
      case "a.opts": if (isHost && this.phase === "lobby") {
        if (HALVES.includes(msg.halfSeconds)) this.opts.halfSeconds = msg.halfSeconds;
        if (BOT_LEVELS[msg.botLevel]) this.opts.botLevel = msg.botLevel;
        if (msg.teams && Array.isArray(msg.teams)) msg.teams.slice(0, 2).forEach((t, i) => { if (t && typeof t.name === "string") this.teams[i].name = t.name.replace(/[\u0000-\u001f<>]/g, "").slice(0, 24) || this.teams[i].name; if (t && /^#[0-9a-fA-F]{6}$/.test(t.color || "")) this.teams[i].color = t.color; });
        this.broadcastState();
      } break;
      case "a.start": if (isHost && this.phase === "lobby") this.start(); break;
      case "emote": this.emote(clientId, msg.e); break;
    }
  }

  moveTo(clientId, slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.slots.length) return; // pas de clé arbitraire (__proto__…)
    const m = this.members.get(clientId); const target = this.slots[slot];
    if (!target || target.memberId) return;
    const cur = typeof m.seat === "number" ? this.slots[m.seat] : null;
    const keepChar = cur?.charId;
    if (cur) Object.assign(cur, { memberId: null, identity: null, pseudo: null, userId: null, charId: null });
    this.occupy(target, m.client, BaseRoom.identity(m.client));
    if (keepChar && !this.slots.some(o => o !== target && o.charId === keepChar)) target.charId = keepChar;
    this.broadcastState();
  }

  onInput(slot, msg) {
    const prev = this.inputs[slot];
    const b = (msg.b | 0) & 511;
    const num = v => (Number.isFinite(v) ? v : 0);
    // les boutons « front » (passe, tacle…) sont conservés jusqu'au tick suivant
    this.inputs[slot] = { mx: Math.max(-1, Math.min(1, num(msg.mx))), mz: Math.max(-1, Math.min(1, num(msg.mz))), aim: num(msg.aim), b, edge: ((prev?.edge || 0) | (b & EDGE)) };
  }

  // ── Match ────────────────────────────────────────────────
  start() {
    if (this.phase !== "lobby" || this.humanCount() === 0) return;
    for (const s of this.slots) if (!s.charId) s.charId = this.suggestChar(s.slot);
    this.phase = "playing";
    this.sim = new ArenaSim({ seed: randomSeed(), halfSeconds: this.opts.halfSeconds, slots: this.slots.map(s => ({ charId: s.charId, name: s.pseudo || undefined, human: !!s.memberId })) });
    this.brain = new ArenaBrain(this.sim, this.opts.botLevel);
    this.evSent = 0; this.snapCount = 0;
    this.broadcast({ t: "a.init", slots: this.slotInfo(), teams: this.teams, events: [] });
    this.broadcastState();
    this.every(1000 / TICK_HZ, () => this.step());
  }

  step() {
    if (this.phase !== "playing") return;
    const sim = this.sim;
    for (const s of this.slots) {
      if (!s.memberId) continue;
      const i = this.inputs[s.slot];
      if (!i) { sim.setInput(s.slot, {}); continue; }
      const bits = (i.b & ~EDGE) | i.edge;
      sim.setInput(s.slot, { mx: i.mx, mz: i.mz, aim: i.aim, sprint: !!(bits & BTN.sprint), shoot: !!(i.b & BTN.shoot), pass: !!(bits & BTN.pass), lob: !!(bits & BTN.lob), tackle: !!(bits & BTN.tackle), pu: !!(bits & BTN.pu), aimFace: !!(bits & BTN.aimFace), call: !!(bits & BTN.call), skill: !!(bits & BTN.skill) });
      i.edge = 0;
    }
    this.brain.update();
    const running = sim.step();
    // diffusion ~20 Hz (2 ticks sur 3) + systématique lors d'un événement
    const ev = sim.events.slice(this.evSent);
    if (ev.length || this.snapCount++ % 3 !== 2) { this.evSent = sim.events.length; this.broadcast({ t: "a.snap", s: sim.snapshot(), ev }); }
    if (!running) this.end();
  }

  async end() {
    if (this.phase === "ended") return;
    this.phase = "ended"; this.clearTimers();
    const sim = this.sim; const { ratings, mvp } = sim.ratings();
    const entries = [];
    for (const s of this.slots) {
      if (!s.userId) continue;
      const st = sim.stats[s.slot]; const gf = sim.score[s.team], ga = sim.score[1 - s.team];
      const vsHuman = this.slots.some(o => o.team !== s.team && o.userId);
      entries.push({ userId: s.userId, slot: s.slot, entry: { mode: "arena", result: gf > ga ? "W" : gf < ga ? "L" : "D", vsHuman, oppElo: null, goalsFor: gf, goalsAgainst: ga, goals: st.goals, assists: st.assists, saves: st.saves, tackles: st.tackles, shots: st.shots, mvp: mvp === s.slot, charId: s.charId, clubName: this.teams[s.team].name, opponentName: this.teams[1 - s.team].name, date: new Date().toISOString(), abandoned: s.left } });
    }
    const progression = {};
    try { const res = entries.length && this.lobby?.onResults ? await this.lobby.onResults(entries.map(({ userId, entry }) => ({ userId, entry }))) : []; for (const r of res || []) { const e = entries.find(x => x.userId === r.userId); if (e) progression[e.slot] = r; } } catch (err) { console.error("[arena] résultats", err); }
    this.results = { score: [...sim.score], ratings, mvp, stats: sim.stats, slots: this.slotInfo(), teams: this.teams, progression };
    this.broadcast({ t: "a.end", ...this.results });
    this.broadcastState();
    this.after(10 * 60 * 1000, () => this.lobby?.closeRoom(this));
  }

  slotInfo() { return this.slots.map(s => ({ slot: s.slot, team: s.team, charId: s.charId, pseudo: s.pseudo, human: !!s.memberId, left: s.left })); }

  stateFor(clientId) {
    const m = this.members.get(clientId);
    return {
      t: "room.state", code: this.code, mode: "arena", phase: this.phase, opts: this.publicOpts(), teams: this.teams,
      you: { slot: typeof m?.seat === "number" ? m.seat : null, host: clientId === this.hostId },
      slots: this.slotInfo(), startInMs: this.startAt && this.phase === "lobby" ? Math.max(0, this.startAt - Date.now()) : null,
    };
  }
  broadcastState() {
    if (this.phase === "lobby") for (const s of this.slots) if (!s.charId) s.charId = this.suggestChar(s.slot);
    for (const id of this.members.keys()) this.send(id, this.stateFor(id));
  }
}
