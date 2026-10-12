// Salle « L'Arène » : 5 contre 5 à la 3e personne, jusqu'à 10 humains, bots de complément,
// entrée et sortie en cours de match (un humain remplace un bot, un départ redevient bot).
import { BaseRoom } from "./base.js";
import { ArenaSim, TICK_HZ, ROLES, bestSwitchTarget } from "../action/sim.js";
import { ArenaBrain, BOT_LEVELS } from "../action/bot.js";
import { PLAYERS, getPlayer, sanitizeLoadout, defaultLoadout, sanitizeStats } from "../data/content.js";
import { sanitizeAppearance } from "../data/appearance.js";
import { ROLE_SCORE } from "../manager/ai.js";
import { makeRng, randomSeed } from "../rng.js";

// bits des boutons envoyés par le client
export const BTN = { sprint: 1, shoot: 2, pass: 4, lob: 8, tackle: 16, pu: 32, aimFace: 64, call: 128, skill: 256, pu2: 512, press: 1024 };
const EDGE = BTN.pass | BTN.lob | BTN.tackle | BTN.pu | BTN.call | BTN.skill | BTN.pu2; // press est maintenu
const STAT_KEYS = ["goals", "assists", "saves", "tackles", "shots"];
const SWITCH_MS = 250; // délai minimal entre deux changements de joueur
const HALVES = [60, 120, 180, 300];

export class ArenaRoom extends BaseRoom {
  constructor(o) {
    super({ ...o, mode: "arena" });
    const hs = HALVES.includes(this.opts.halfSeconds) ? this.opts.halfSeconds : 180;
    const training = !!this.opts.training && !this.opts.public;
    this.opts = { halfSeconds: training ? 300 : hs, botLevel: training ? "training" : BOT_LEVELS[this.opts.botLevel] ? this.opts.botLevel : "normal", public: !!this.opts.public, quick: !!this.opts.quick, training };
    this.rng = makeRng(randomSeed());
    this.slots = Array.from({ length: 10 }, (_, i) => ({ slot: i, team: i < 5 ? 0 : 1, memberId: null, identity: null, pseudo: null, userId: null, charId: null, left: false, loadout: null, look: null, stats: null, pick: null }));
    // statistiques par humain (identité), créditées au pilote du joueur AU MOMENT de l'action (tir, tacle, arrêt,
    // dernière touche avant un but) : changer de joueur ne permet pas de s'approprier l'action d'un bot
    this.acc = Object.create(null);
    this.touchBy = new Array(10).fill(null); this.lastSeen = -1;
    this.teams = [{ name: "Labo Alpha", color: "#00F0FF" }, { name: "Labo Oméga", color: "#FF00E5" }];
    this.sim = null; this.brain = null; this.evSent = 0; this.inputs = {}; this.startAt = null;
    this.paused = false;
  }

  isPublicJoinable() { return this.opts.public && this.phase !== "ended" && this.humanCount() < 10; }
  humanCount() { return this.slots.filter(s => s.memberId).length; }
  // pause réelle seulement en solo contre les bots (un seul humain connecté, salle non publique) :
  // dès qu'un autre humain est présent, le match continue pendant le menu
  canPause() { return this.phase === "playing" && !this.opts.public && this.members.size === 1 && this.humanCount() === 1; }
  setPaused(on) {
    on = !!on && this.canPause();
    if (on === this.paused) return;
    this.paused = on;
    // pas d'entrée maintenue (course, pressing…) conservée à travers la pause
    for (const k of Object.keys(this.inputs)) delete this.inputs[k];
    this.broadcastState();
  }

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
    if (this.paused && !this.canPause()) this.setPaused(false); // un autre humain arrive : le match reprend
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
    this.applyProfile(s, client);
    if (this.sim) { this.sim.setControl(s.slot, true, s.pseudo); this.brain?.forget(s.slot); }
  }

  // apparence et power-ups choisis par le joueur pour SON scientifique (visibles par tous)
  applyProfile(s, client) {
    if (!s.charId) return;
    const look = client.looks?.[s.charId]; s.look = look ? sanitizeAppearance(look, s.charId) : null;
    if (this.phase === "lobby" || !this.sim) s.stats = client.statAlloc?.[s.charId] ? sanitizeStats(s.charId, client.statAlloc[s.charId]) : null;
    if (this.phase === "lobby" || !this.sim) s.loadout = sanitizeLoadout(s.charId, client.loadouts?.[s.charId]);
  }
  onProfile(clientId) {
    const m = this.members.get(clientId); const s = typeof m?.seat === "number" ? this.slots[m.seat] : null;
    if (!s || this.phase !== "lobby") return;
    this.applyProfile(s, m.client); this.broadcastState();
  }

  // pilote humain actuel d'une place (identité) ou null (bot, joueur parti)
  pilotOf(slot) { const s = this.slots[slot]; return s && s.memberId ? s.identity : null; }
  credit(identity, key) {
    if (!identity) return;
    const a = this.acc[identity] || (this.acc[identity] = Object.fromEntries(STAT_KEYS.map(k => [k, 0])));
    a[key]++;
  }
  // à chaque tick : qui pilotait le joueur qui a (eu) le ballon
  trackTouches() {
    const b = this.sim.ball;
    if (b.owner >= 0) this.touchBy[b.owner] = this.pilotOf(b.owner);
    else if (b.last >= 0 && b.last !== this.lastSeen) this.touchBy[b.last] = this.pilotOf(b.last);
    this.lastSeen = b.last;
  }
  accountEvents(evs) {
    for (const e of evs) {
      if (e.type === "SHOT") { this.touchBy[e.slot] = this.pilotOf(e.slot); this.credit(this.pilotOf(e.slot), "shots"); }
      else if (e.type === "TACKLE") this.credit(this.pilotOf(e.slot), "tackles");
      else if (e.type === "SAVE") this.credit(this.pilotOf(e.slot), "saves");
      else if (e.type === "GOAL" && e.slot >= 0) { this.credit(this.touchBy[e.slot], "goals"); if (e.assist >= 0) this.credit(this.touchBy[e.assist], "assists"); }
    }
  }

  leave(clientId) {
    const m = this.members.get(clientId); if (!m) return;
    const s = typeof m.seat === "number" ? this.slots[m.seat] : null;
    this.removeMember(clientId);
    if (s) {
      s.memberId = null;
      if (this.phase === "lobby") Object.assign(s, { identity: null, pseudo: null, userId: null, charId: null, loadout: null, look: null, stats: null });
      else { s.left = true; if (this.sim) { this.sim.setControl(s.slot, false); this.brain?.forget(s.slot); } }
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
        this.applyProfile(s, m.client);
        if (Array.isArray(msg.loadout)) s.loadout = sanitizeLoadout(s.charId, msg.loadout);
        this.broadcastState();
      } break;
      case "a.loadout": if (s && this.phase === "lobby" && s.charId) { s.loadout = sanitizeLoadout(s.charId, msg.ids); this.broadcastState(); } break;
      case "a.switch": if (s && this.phase === "playing") this.switchTo(clientId, msg.to); break;
      case "a.pause": if (s && this.phase === "playing") this.setPaused(msg.on); break;
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

  // changement de joueur en cours de match : vers un coéquipier piloté par un bot (jamais un humain)
  switchTo(clientId, to) {
    const m = this.members.get(clientId); const cur = typeof m?.seat === "number" ? this.slots[m.seat] : null;
    if (!cur || !this.sim) return false;
    const now = Date.now(); if (m.lastSwitch && now - m.lastSwitch < SWITCH_MS) return false;
    // places réservées : celle d'un coéquipier déconnecté l'attend (reconnexion)
    const reserved = new Set(this.slots.filter(s => s.identity && s.left).map(s => s.slot));
    const target = to === "auto" ? bestSwitchTarget(this.sim, cur.slot, reserved) : to;
    if (!Number.isInteger(target) || target < 0 || target >= this.slots.length) return false;
    const t = this.slots[target];
    if (t === cur || t.team !== cur.team || t.memberId || reserved.has(t.slot)) return false;
    m.lastSwitch = now;
    Object.assign(t, { memberId: cur.memberId, identity: cur.identity, pseudo: cur.pseudo, userId: cur.userId, left: false, pick: cur.pick || cur.charId });
    Object.assign(cur, { memberId: null, identity: null, pseudo: null, userId: null, left: false, pick: null });
    m.seat = t.slot;
    this.sim.setControl(cur.slot, false); this.brain.forget(cur.slot);
    this.sim.setControl(t.slot, true, t.pseudo); this.brain.forget(t.slot);
    // les entrées en cours (direction, boutons maintenus) passent au nouveau joueur
    const carried = this.inputs[cur.slot]; delete this.inputs[cur.slot];
    if (carried) this.inputs[t.slot] = { ...carried, edge: 0 }; else delete this.inputs[t.slot];
    this.broadcastState();
    return true;
  }

  moveTo(clientId, slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.slots.length) return; // pas de clé arbitraire (__proto__…)
    const m = this.members.get(clientId); const target = this.slots[slot];
    if (!target || target.memberId) return;
    const cur = typeof m.seat === "number" ? this.slots[m.seat] : null;
    const keepChar = cur?.charId, keepLoadout = cur?.loadout;
    if (cur) Object.assign(cur, { memberId: null, identity: null, pseudo: null, userId: null, charId: null, loadout: null, look: null, stats: null });
    this.occupy(target, m.client, BaseRoom.identity(m.client));
    if (keepChar && !this.slots.some(o => o !== target && o.charId === keepChar)) { target.charId = keepChar; this.applyProfile(target, m.client); if (keepLoadout) target.loadout = keepLoadout; }
    this.broadcastState();
  }

  onInput(slot, msg) {
    const prev = this.inputs[slot];
    const b = (msg.b | 0) & 2047;
    const num = v => (Number.isFinite(v) ? v : 0);
    // les boutons « front » (passe, tacle…) sont conservés jusqu'au tick suivant
    this.inputs[slot] = { mx: Math.max(-1, Math.min(1, num(msg.mx))), mz: Math.max(-1, Math.min(1, num(msg.mz))), aim: num(msg.aim), b, edge: ((prev?.edge || 0) | (b & EDGE)) };
  }

  // ── Match ────────────────────────────────────────────────
  start() {
    if (this.phase !== "lobby" || this.humanCount() === 0) return;
    for (const s of this.slots) {
      if (!s.charId) s.charId = this.suggestChar(s.slot);
      // les bots emportent leur power-up d'origine + un autre au hasard
      if (!s.memberId || !s.loadout) { const own = getPlayer(s.charId).powerUps; s.loadout = s.memberId ? defaultLoadout(s.charId) : [own[0].id, own[1 + Math.floor(this.rng() * (own.length - 1))]?.id || own[0].id]; }
      s.pick = s.memberId ? s.charId : null;
      if (!s.memberId) s.stats = null; // les bots jouent le profil par défaut
    }
    this.phase = "playing";
    this.sim = new ArenaSim({ seed: randomSeed(), halfSeconds: this.opts.halfSeconds, slots: this.slots.map(s => ({ charId: s.charId, name: s.pseudo || undefined, human: !!s.memberId, loadout: s.loadout, stats: s.stats || undefined })) });
    this.acc = Object.create(null); this.touchBy = new Array(10).fill(null); this.lastSeen = -1;
    this.brain = new ArenaBrain(this.sim, this.opts.botLevel);
    this.evSent = 0; this.snapCount = 0;
    this.broadcast({ t: "a.init", slots: this.slotInfo(), teams: this.teams, events: [] });
    this.broadcastState();
    this.every(1000 / TICK_HZ, () => this.step());
  }

  step() {
    if (this.phase !== "playing" || this.paused) return; // en pause : ni chrono, ni IA, ni recharges
    const sim = this.sim;
    for (const s of this.slots) {
      if (!s.memberId) continue;
      const i = this.inputs[s.slot];
      if (!i) { sim.setInput(s.slot, {}); continue; }
      const bits = (i.b & ~EDGE) | i.edge;
      sim.setInput(s.slot, { mx: i.mx, mz: i.mz, aim: i.aim, sprint: !!(bits & BTN.sprint), shoot: !!(i.b & BTN.shoot), pass: !!(bits & BTN.pass), lob: !!(bits & BTN.lob), tackle: !!(bits & BTN.tackle), pu: !!(bits & BTN.pu), pu2: !!(bits & BTN.pu2), press: !!(i.b & BTN.press), aimFace: !!(bits & BTN.aimFace), call: !!(bits & BTN.call), skill: !!(bits & BTN.skill) });
      i.edge = 0;
    }
    this.brain.update();
    const running = sim.step();
    this.trackTouches();
    // diffusion ~20 Hz (2 ticks sur 3) + systématique lors d'un événement
    const ev = sim.events.slice(this.evSent);
    this.accountEvents(ev);
    if (ev.length || this.snapCount++ % 3 !== 2) { this.evSent = sim.events.length; this.broadcast({ t: "a.snap", s: sim.snapshot(), ev }); }
    if (!running) this.end();
  }

  async end() {
    if (this.phase === "ended") return;
    this.phase = "ended"; this.paused = false; this.clearTimers();
    const sim = this.sim; const { ratings, mvp } = sim.ratings();
    // homme du match humain : meilleure note personnelle (actions créditées), au moins égale à la meilleure note du match
    const zero = Object.fromEntries(STAT_KEYS.map(k => [k, 0]));
    const personal = id => { const a = this.acc[id] || zero; return 6 + a.goals * 1.1 + a.assists * 0.7 + a.saves * 0.35 + a.tackles * 0.2; };
    const humans = [...new Set(this.slots.filter(s => s.userId && s.identity).map(s => s.identity))].map(id => ({ id, r: personal(id) })).sort((x, y) => y.r - x.r);
    const mvpId = humans[0] && humans[0].r >= Math.max(...ratings) - 0.4 ? humans[0].id : null;
    const entries = [];
    for (const s of this.slots) {
      if (!s.userId) continue;
      const st = this.acc[s.identity] || zero; const gf = sim.score[s.team], ga = sim.score[1 - s.team];
      const vsHuman = this.slots.some(o => o.team !== s.team && o.userId);
      const pick = s.pick || s.charId; const mvpMine = mvpId === s.identity;
      entries.push({ userId: s.userId, slot: s.slot, entry: { mode: "arena", result: gf > ga ? "W" : gf < ga ? "L" : "D", vsHuman, oppElo: null, goalsFor: gf, goalsAgainst: ga, goals: st.goals, assists: st.assists, saves: st.saves, tackles: st.tackles, shots: st.shots, mvp: mvpMine, charId: pick, clubName: this.teams[s.team].name, opponentName: this.teams[1 - s.team].name, date: new Date().toISOString(), abandoned: s.left } });
    }
    const progression = {};
    try { const res = entries.length && this.lobby?.onResults ? await this.lobby.onResults(entries.map(({ userId, entry }) => ({ userId, entry }))) : []; for (const r of res || []) { const e = entries.find(x => x.userId === r.userId); if (e) progression[e.slot] = r; } } catch (err) { console.error("[arena] résultats", err); }
    this.results = { score: [...sim.score], ratings, mvp, stats: sim.stats, slots: this.slotInfo(), teams: this.teams, progression };
    this.broadcast({ t: "a.end", ...this.results });
    this.broadcastState();
    this.after(10 * 60 * 1000, () => this.lobby?.closeRoom(this));
  }

  slotInfo() { return this.slots.map(s => ({ slot: s.slot, team: s.team, charId: s.charId, pseudo: s.pseudo, human: !!s.memberId, left: s.left, loadout: s.loadout, look: s.look, stats: s.stats })); }

  stateFor(clientId) {
    const m = this.members.get(clientId);
    return {
      t: "room.state", code: this.code, mode: "arena", phase: this.phase, opts: this.publicOpts(), teams: this.teams, paused: this.paused, canPause: this.canPause(),
      you: { slot: typeof m?.seat === "number" ? m.seat : null, host: clientId === this.hostId },
      slots: this.slotInfo(), startInMs: this.startAt && this.phase === "lobby" ? Math.max(0, this.startAt - Date.now()) : null,
    };
  }
  broadcastState() {
    if (this.phase === "lobby") for (const s of this.slots) if (!s.charId) s.charId = this.suggestChar(s.slot);
    for (const id of this.members.keys()) this.send(id, this.stateFor(id));
  }
}
