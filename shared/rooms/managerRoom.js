// Salle « Le Labo Tactique » : Manager 1 contre 1 (humain ou manager virtuel).
// Déroulé : lobby → draft en serpentin (8 scientifiques chacun) → composition → match → rapport.
import { BaseRoom } from "./base.js";
import { ManagerEngine, DEFAULT_HALF_TICKS } from "../manager/engine.js";
import { BotManager, pickForDraft, autoLineup, teamValue, DIFFICULTIES } from "../manager/ai.js";
import { PLAYERS, FORMATIONS, STRATEGY_BY_ID, getPlayer, sanitizeLoadout, sanitizeStats, withStats } from "../data/content.js";
import { sanitizeAppearance } from "../data/appearance.js";
import { makeRng, randomSeed } from "../rng.js";

const SIDES = ["home", "away"];
// Draft en serpentin : H A A H H A A H …
export const DRAFT_ORDER = Array.from({ length: 16 }, (_, i) => (Math.floor((i + 1) / 2) % 2 === 0 ? "home" : "away"));
const PICK_MS = 20000, SETUP_MS = 60000;

const defaultClub = side => (side === "home" ? { name: "Labo Alpha", colors: ["#00F0FF", "#0A0A12"], crest: "🧬" } : { name: "Labo Oméga", colors: ["#FF00E5", "#0A0A12"], crest: "⚛️" });

export class ManagerRoom extends BaseRoom {
  constructor(o) {
    super({ ...o, mode: "manager" });
    const b = this.opts.bot;
    const season = this.opts.season && typeof this.opts.season === "object" ? { id: Number(this.opts.season.id) || 0, day: Number(this.opts.season.day) || 0 } : null;
    const botClubOpt = this.opts.botClub && typeof this.opts.botClub === "object" ? this.opts.botClub : null;
    this.opts = { season, botClub: botClubOpt, autostart: !!this.opts.autostart, bot: DIFFICULTIES[b] ? b : null, speed: [1, 2, 4].includes(this.opts.speed) ? this.opts.speed : 1, halfTicks: Math.min(2400, Math.max(300, this.opts.halfTicks || DEFAULT_HALF_TICKS)), public: !!this.opts.public, quick: !!this.opts.quick };
    this.rng = makeRng(randomSeed());
    this.seats = Object.fromEntries(SIDES.map(s => [s, { side: s, memberId: null, identity: null, pseudo: null, userId: null, elo: null, bot: null, club: defaultClub(s), picks: [], lineup: [], bench: [], formation: "2-2", strategy: "equilibre", ready: false, connected: false, left: false, loadouts: {}, looks: {}, stats: {} }]));
    this.draft = null; this.engine = null; this.bots = {}; this.evSent = 0; this.paused = false; this.report = null;
  }

  isPublicJoinable() { return this.opts.public && this.phase === "lobby" && !this.seats.away.memberId && !this.seats.away.bot && this.members.size < 2; }

  // ── Membres ───────────────────────────────────────────────
  join(client) {
    const id = BaseRoom.identity(client);
    this.addMember(client);
    let seat = SIDES.map(s => this.seats[s]).find(s => s.identity === id); // reconnexion
    if (!seat && this.phase === "lobby") seat = SIDES.map(s => this.seats[s]).find(s => !s.memberId && !s.bot);
    if (seat) {
      Object.assign(seat, { memberId: client.id, identity: id, pseudo: client.pseudo, userId: client.userId || null, elo: client.elo ?? null, connected: true, left: false });
      if (client.club && this.phase === "lobby") seat.club = sanitizeClub(client.club, seat.club);
      this.members.get(client.id).seat = seat.side;
      if (this.bots[seat.side] && this.phase === "playing") delete this.bots[seat.side]; // reprise en main
      if (this.phase !== "playing" && this.phase !== "ended") this.applyLooks(seat, client);
    }
    this.broadcastState();
    if (this.engine) { this.send(client.id, { t: "m.init", setup: this.matchSetup(), events: this.engine.events }); this.send(client.id, { t: "m.snap", s: this.engine.snapshot(), ev: [] }); }
    if (this.report) this.send(client.id, { t: "m.report", report: this.report, progression: this.progression || {} });
    if (this.opts.autostart && this.phase === "lobby" && seat?.side === "home") this.after(250, () => this.phase === "lobby" && this.startDraft());
    // partie rapide : si personne ne vient, un manager virtuel prend la place
    if (this.opts.quick && this.phase === "lobby" && seat?.side === "home") this.after(25000, () => { if (this.phase === "lobby" && !this.seats.away.memberId) this.startDraft(); });
    if (this.opts.quick && this.phase === "lobby" && seat?.side === "away") this.after(1500, () => this.phase === "lobby" && this.startDraft());
    return seat?.side || "spec";
  }

  leave(clientId) {
    const m = this.members.get(clientId); if (!m) return;
    const seat = m.seat ? this.seats[m.seat] : null;
    this.removeMember(clientId);
    if (seat) {
      seat.memberId = null; seat.connected = false;
      if (this.phase === "lobby") Object.assign(seat, { identity: null, pseudo: null, userId: null, elo: null, club: defaultClub(seat.side), looks: {} });
      else { seat.left = true; if (this.phase === "playing") this.bots[seat.side] = new BotManager(seat.side, "chercheur", this.rng); }
    }
    this.broadcastState();
  }

  // ── Messages ─────────────────────────────────────────────
  handle(clientId, msg) {
    const m = this.members.get(clientId); if (!m) return;
    const side = m.seat; const seat = side ? this.seats[side] : null; const isHost = clientId === this.hostId;
    switch (msg.t) {
      case "m.club": if (seat && this.phase === "lobby") { seat.club = sanitizeClub(msg.club, seat.club); this.broadcastState(); } break;
      case "m.bot": if (isHost && this.phase === "lobby" && !this.seats.away.memberId) { this.opts.bot = DIFFICULTIES[msg.level] ? msg.level : null; this.broadcastState(); } break;
      case "m.start": if (isHost && this.phase === "lobby") this.startDraft(); break;
      case "m.pick": if (seat && this.phase === "draft") this.pick(side, msg.id); break;
      case "m.autopick": if (seat && this.phase === "draft" && this.draft.order[this.draft.turn] === side) this.pick(side, this.autoPickFor(side)); break;
      case "m.autodraft": if (seat && this.phase === "draft") { seat.auto = true; if (this.draft.order[this.draft.turn] === side) this.pick(side, this.autoPickFor(side)); } break;
      case "m.setup": if (seat && this.phase === "setup") this.setup(side, msg); break;
      case "m.loadout": if (seat && this.phase === "setup" && seat.picks.includes(msg.id)) { seat.loadouts[msg.id] = sanitizeLoadout(msg.id, msg.ids); this.broadcastState(); } break;
      case "m.cmd": if (seat && this.phase === "playing" && this.engine) this.engine.command(side, sanitizeCmd(msg.cmd)); break;
      case "m.speed": if (isHost && this.soloVsBot() && [1, 2, 4].includes(msg.speed)) { this.opts.speed = msg.speed; if (this.engine) this.engine.halftimeTicks = 100 * msg.speed; this.restartLoop(); this.broadcastState(); } break;
      case "m.pause": if (isHost && this.soloVsBot() && this.phase === "playing") { this.paused = !!msg.paused; this.broadcastState(); } break;
      case "emote": this.emote(clientId, msg.e); break;
    }
  }

  soloVsBot() { return !!(this.seats.away.bot || this.seats.home.bot); }

  // apparences choisies par le manager pour SES scientifiques (visibles par l'adversaire en 3D)
  applyLooks(seat, client) {
    const looks = {}, stats = {};
    for (const id of seat.picks.length ? seat.picks : Object.keys(client?.looks || {})) if (client?.looks?.[id]) looks[id] = sanitizeAppearance(client.looks[id], id);
    // répartitions des caractéristiques choisies par le manager pour SES scientifiques
    for (const id of seat.picks) if (client?.statAlloc?.[id]) stats[id] = sanitizeStats(id, client.statAlloc[id]);
    seat.looks = looks; seat.stats = stats;
  }
  onProfile(clientId) {
    const m = this.members.get(clientId); const seat = m?.seat ? this.seats[m.seat] : null;
    if (!seat || this.phase === "playing" || this.phase === "ended") return;
    this.applyLooks(seat, m.client);
    if (this.phase === "setup") for (const id of seat.picks) if (m.client.loadouts?.[id]) seat.loadouts[id] = sanitizeLoadout(id, m.client.loadouts[id]);
    this.broadcastState();
  }

  // ── Draft ────────────────────────────────────────────────
  startDraft() {
    if (this.phase !== "lobby") return;
    if (!this.seats.home.memberId && !this.seats.home.bot) return;
    if (!this.seats.away.memberId) { const lvl = this.opts.bot || "chercheur"; Object.assign(this.seats.away, { bot: lvl, pseudo: null, club: this.opts.botClub ? sanitizeClub(this.opts.botClub, botClub(lvl, this.rng)) : botClub(lvl, this.rng) }); this.opts.bot = lvl; }
    // deux clubs identiques (clubs par défaut) : l'équipe extérieure est différenciée
    const H = this.seats.home.club, Aw = this.seats.away.club;
    if (Aw.colors[0].toLowerCase() === H.colors[0].toLowerCase()) Aw.colors = [H.colors[0].toLowerCase() === "#ff00e5" ? "#00F0FF" : "#FF00E5", Aw.colors[1]];
    if (Aw.name === H.name) Aw.name = (Aw.name + " B").slice(0, 24);
    this.phase = "draft";
    this.draft = { order: DRAFT_ORDER, turn: 0, available: PLAYERS.map(p => p.id), deadline: Date.now() + PICK_MS };
    this.broadcastState();
    this.scheduleDraftTurn();
  }

  scheduleDraftTurn() {
    if (this.phase !== "draft") return;
    const side = this.draft.order[this.draft.turn]; const turn = this.draft.turn;
    const seat = this.seats[side];
    const delay = seat.bot || !seat.connected ? 700 : seat.auto ? 350 : PICK_MS;
    this.draft.deadline = Date.now() + delay;
    this.after(delay, () => { if (this.phase === "draft" && this.draft.turn === turn) this.pick(side, this.autoPickFor(side)); });
  }

  autoPickFor(side) {
    const lvl = this.seats[side].bot || "chercheur";
    return pickForDraft(this.seats[side].picks, this.draft.available, lvl, this.rng);
  }

  pick(side, id) {
    const d = this.draft;
    if (d.order[d.turn] !== side || !d.available.includes(id)) return;
    this.seats[side].picks.push(id); d.available = d.available.filter(x => x !== id); d.turn++;
    this.broadcast({ t: "m.picked", side, id });
    if (d.turn >= d.order.length) return this.startSetup();
    this.scheduleDraftTurn();
    this.broadcastState();
  }

  // ── Composition ──────────────────────────────────────────
  startSetup() {
    this.phase = "setup"; this.setupDeadline = Date.now() + SETUP_MS;
    for (const side of SIDES) {
      const s = this.seats[side];
      const formation = s.bot ? Object.keys(FORMATIONS).map(f => ({ f, v: teamValue(s.picks, f) })).sort((a, b) => b.v - a.v)[0].f : "2-2";
      const owner = this.members.get(s.memberId)?.client; // composition automatique selon SES répartitions
      const { lineup, bench } = autoLineup(s.picks, formation, id => withStats(getPlayer(id), owner?.statAlloc?.[id]));
      Object.assign(s, { formation, lineup, bench, strategy: s.bot === "stagiaire" ? this.rng.pick(Object.keys(STRATEGY_BY_ID)) : "equilibre", ready: !!s.bot || !s.connected });
      // power-ups emportés : préférences du manager, sinon les 2 premiers ; les bots varient
      const client = this.members.get(s.memberId)?.client;
      s.loadouts = Object.fromEntries(s.picks.map(id => {
        if (client) return [id, sanitizeLoadout(id, client.loadouts?.[id])];
        const own = getPlayer(id).powerUps; return [id, [own[0].id, own[1 + Math.floor(this.rng() * (own.length - 1))].id]];
      }));
      if (client) this.applyLooks(s, client); else { s.looks = {}; s.stats = {}; }
    }
    this.broadcastState();
    this.after(SETUP_MS, () => { if (this.phase === "setup") this.startMatch(); });
    this.maybeStart();
  }

  setup(side, msg) {
    const s = this.seats[side];
    const lineup = Array.isArray(msg.lineup) ? msg.lineup.filter(id => s.picks.includes(id)) : [];
    if (new Set(lineup).size !== 5) return this.send(s.memberId, { t: "error", code: "BAD_LINEUP" });
    s.lineup = lineup; s.bench = s.picks.filter(id => !lineup.includes(id)).slice(0, 3);
    if (FORMATIONS[msg.formation]) s.formation = msg.formation;
    if (STRATEGY_BY_ID[msg.strategy]) s.strategy = msg.strategy;
    if (msg.loadouts && typeof msg.loadouts === "object") for (const id of s.picks) if (Object.hasOwn(msg.loadouts, id)) s.loadouts[id] = sanitizeLoadout(id, msg.loadouts[id]);
    s.ready = msg.ready !== false;
    this.broadcastState(); this.maybeStart();
  }

  maybeStart() { if (this.phase === "setup" && SIDES.every(s => this.seats[s].ready)) this.after(600, () => this.phase === "setup" && SIDES.every(s => this.seats[s].ready) && this.startMatch()); }

  matchSetup() {
    return Object.fromEntries(SIDES.map(side => { const s = this.seats[side]; return [side, { name: s.club.name, colors: s.club.colors, crest: s.club.crest, lineup: s.lineup, bench: s.bench, formation: s.formation, strategy: s.strategy, pseudo: s.pseudo, bot: s.bot, loadouts: s.loadouts, looks: s.looks, stats: s.stats }]; }));
  }

  // ── Match ────────────────────────────────────────────────
  startMatch() {
    if (this.phase !== "setup") return;
    this.phase = "playing";
    this.engine = new ManagerEngine({ ...this.matchSetup(), seed: randomSeed(), halfTicks: this.opts.halfTicks, halftimeTicks: 100 * this.opts.speed });
    for (const side of SIDES) { const s = this.seats[side]; if (s.bot || !s.connected) this.bots[side] = new BotManager(side, s.bot || "chercheur", this.rng); }
    this.evSent = 0;
    this.broadcast({ t: "m.init", setup: this.matchSetup(), events: [] });
    this.broadcastState();
    this.restartLoop();
  }

  restartLoop() {
    if (this.loop) clearInterval(this.loop);
    if (this.phase !== "playing") return;
    const ms = Math.max(25, Math.round(100 / this.opts.speed));
    this.loop = this.every(ms, () => this.step());
  }

  step() {
    if (this.paused || !this.engine) return;
    const e = this.engine;
    for (const side of SIDES) if (this.bots[side]) for (const c of this.bots[side].think(e)) e.command(side, c);
    // mi-temps écourtée quand chaque manager humain connecté a choisi sa causerie
    if (e.phase === "halftime" && SIDES.every(sd => this.seats[sd].bot || !this.seats[sd].connected || e.teams[sd].talk)) e.phaseTimer = Math.min(e.phaseTimer, 15 * this.opts.speed);
    const running = e.tick();
    const ev = e.events.slice(this.evSent); this.evSent = e.events.length;
    this.broadcast({ t: "m.snap", s: e.snapshot(), ev });
    if (!running) this.end();
  }

  async end() {
    if (this.phase === "ended") return;
    this.phase = "ended"; clearInterval(this.loop);
    const report = this.engine.report(); this.report = report;
    const [h, a] = [report.teams.home.score, report.teams.away.score];
    const entries = [];
    for (const side of SIDES) {
      const s = this.seats[side]; const o = this.seats[side === "home" ? "away" : "home"];
      if (!s.userId) continue;
      const gf = side === "home" ? h : a, ga = side === "home" ? a : h;
      entries.push({ userId: s.userId, side, entry: { mode: "manager", result: gf > ga ? "W" : gf < ga ? "L" : "D", vsHuman: !o.bot && !!o.pseudo, oppElo: !o.bot ? o.elo : null, goalsFor: gf, goalsAgainst: ga, goals: 0, assists: 0, saves: 0, tackles: 0, shots: report.teams[side].stats.shots, mvp: false, charId: null, clubName: s.club.name, opponentName: o.bot ? `${o.club.name} (bot)` : o.club.name, date: new Date().toISOString(), abandoned: s.left } });
    }
    let progression = {};
    try { const res = entries.length && this.lobby?.onResults ? await this.lobby.onResults(entries.map(({ userId, entry }) => ({ userId, entry }))) : []; for (const r of res || []) { const e = entries.find(x => x.userId === r.userId); if (e) progression[e.side] = r; } } catch (err) { console.error("[manager] résultats", err); }
    this.progression = progression;
    this.broadcast({ t: "m.report", report, progression });
    this.broadcastState();
    this.after(10 * 60 * 1000, () => this.lobby?.closeRoom(this));
  }

  // ── État diffusé (personnalisé) ──────────────────────────
  stateFor(clientId) {
    const m = this.members.get(clientId);
    const seats = Object.fromEntries(SIDES.map(side => { const s = this.seats[side]; return [side, { pseudo: s.pseudo, bot: s.bot, club: s.club, connected: s.connected || !!s.bot, ready: s.ready, picks: s.picks, lineup: s.lineup, bench: s.bench, formation: s.formation, strategy: s.strategy, loadouts: s.loadouts, looks: s.looks, stats: s.stats }]; }));
    return {
      t: "room.state", code: this.code, mode: "manager", phase: this.phase, opts: this.publicOpts(), paused: this.paused,
      you: { seat: m?.seat || "spec", host: clientId === this.hostId }, seats,
      draft: this.draft && { turn: this.draft.turn, order: this.draft.order, available: this.draft.available, remainingMs: Math.max(0, this.draft.deadline - Date.now()) },
      setupRemainingMs: this.phase === "setup" ? Math.max(0, this.setupDeadline - Date.now()) : 0,
      spectators: [...this.members.values()].filter(x => !x.seat).map(x => x.client.pseudo),
    };
  }
  broadcastState() { for (const id of this.members.keys()) this.send(id, this.stateFor(id)); }
  close() { super.close(); if (this.loop) clearInterval(this.loop); }
}

export function sanitizeClub(c, fallback) {
  if (!c || typeof c !== "object") return fallback;
  const hex = v => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);
  const name = typeof c.name === "string" ? c.name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24) : "";
  const colors = Array.isArray(c.colors) ? c.colors.map(hex) : [];
  return { name: name || fallback.name, colors: [colors[0] || fallback.colors[0], colors[1] || fallback.colors[1]], crest: typeof c.crest === "string" ? [...c.crest].slice(0, 2).join("") : fallback.crest };
}

function sanitizeCmd(c) {
  if (!c || typeof c !== "object") return { type: "none" };
  const str = v => (typeof v === "string" ? v.slice(0, 32) : "");
  return { type: str(c.type), id: str(c.id), pid: str(c.pid), pu: str(c.pu), out: str(c.out), in: str(c.in) };
}

function botClub(level, rng) {
  const names = { stagiaire: ["Stagiaires United", "Les Apprentis Sorciers"], chercheur: ["CNRS Athletic", "Labo Central FC"], nobel: ["Nobel Galácticos", "Académie Royale"] }[level];
  return { name: rng.pick(names), colors: [rng.pick(["#FF3366", "#FFD700", "#8B5CF6", "#FF8C00"]), "#101018"], crest: rng.pick(["🤖", "🏛️", "🧠", "🔭"]) };
}
