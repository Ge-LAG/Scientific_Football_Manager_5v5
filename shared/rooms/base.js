// Salle de jeu générique : membres, hôte, diffusion, cycle de vie.
// Le même code tourne sur le serveur (en ligne) et dans le navigateur (solo contre des bots).

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeCode(len = 6) {
  const buf = new Uint32Array(len); globalThis.crypto.getRandomValues(buf); // aléatoire cryptographique
  let s = ""; for (let i = 0; i < len; i++) s += CODE_CHARS[buf[i] % CODE_CHARS.length]; return s;
}

export class BaseRoom {
  constructor({ code, mode, opts = {}, lobby }) {
    this.code = code; this.mode = mode; this.opts = opts; this.lobby = lobby;
    this.members = new Map(); // clientId → { client, seat }
    this.hostId = null; this.phase = "lobby"; this.createdAt = Date.now(); this.closed = false;
    this.timers = [];
    // revanche en ligne : une voix par humain présent ; la salle part quand tous ont voté ou 15 s après le premier vote (décision du PO, 12/10)
    this.rematch = { votes: new Set(), code: null, voting: false };
    this.rematchDelayMs = 15000;
  }

  // identité stable d'un membre (compte ou invité) pour la reconnexion
  static identity(client) { return client.userId ? "u:" + client.userId : "g:" + client.guestId; }

  every(ms, fn) { const h = setInterval(() => { try { fn(); } catch (e) { console.error("[room]", this.code, e); } }, ms); this.timers.push(h); return h; }
  after(ms, fn) { const h = setTimeout(() => { try { fn(); } catch (e) { console.error("[room]", this.code, e); } }, ms); this.timers.push(h); return h; }
  clearTimers() { for (const h of this.timers) { clearInterval(h); clearTimeout(h); } this.timers = []; }

  send(clientId, msg) { this.members.get(clientId)?.client.send(msg); }
  broadcast(msg, except = null) { for (const [id, m] of this.members) if (id !== except) m.client.send(msg); }

  humans() { return [...this.members.values()]; }
  isPublicJoinable() { return false; }

  addMember(client) {
    this.members.set(client.id, { client, seat: null });
    if (!this.hostId) this.hostId = client.id;
  }

  removeMember(clientId) {
    this.members.delete(clientId);
    if (this.hostId === clientId) this.hostId = this.members.keys().next().value || null;
    if (this.members.size === 0) this.lobby?.scheduleClose(this);
  }

  info() {
    return { code: this.code, mode: this.mode, phase: this.phase, humans: this.members.size, opts: this.publicOpts(), host: this.members.get(this.hostId)?.client.pseudo || null };
  }
  publicOpts() { return { ...this.opts }; }

  // ── Revanche (fin de match en ligne) ────────────────────
  // une voix par identité (le joueur reconnecté garde son vote) ; ignoré hors phase « ended »
  voteRematch(clientId) {
    const m = this.members.get(clientId);
    if (!m || this.phase !== "ended" || !this.lobby || this.rematch.code) return;
    const id = BaseRoom.identity(m.client);
    if (this.rematch.votes.has(id)) return; // vote répété : rien ne change, pas de nouvelle diffusion
    this.rematch.votes.add(id);
    if (!this.rematch.voting) { this.rematch.voting = true; this.after(this.rematchDelayMs, () => this.createRematch()); } // le délai court depuis le premier vote
    if (!this.rematch.code) this.maybeRematch();
    this.broadcastState();
  }

  // la revanche part dès que tous les humains présents ont voté
  maybeRematch() {
    if (this.rematch.code || !this.rematch.votes.size || !this.members.size) return;
    const all = [...this.members.values()].every(x => this.rematch.votes.has(BaseRoom.identity(x.client)));
    if (all) this.createRematch();
  }

  // une seule salle de revanche par salle terminée ; seuls les votants encore présents y entrent
  createRematch() {
    if (this.rematch.code || !this.lobby) return;
    const voters = [...this.members.values()].filter(x => this.rematch.votes.has(BaseRoom.identity(x.client)));
    if (!voters.length) return;
    const room = this.lobby.createRoom(this.mode, this.rematchOpts());
    this.rematchPrepare(room);
    room.rematchSeats = new Map(voters.map(x => [BaseRoom.identity(x.client), this.rematchSeat(x.client.id)]));
    this.rematch.code = room.code;
    this.broadcastState(); // les autres voient le code pour rejoindre la revanche
    for (const x of voters) { const c = this.lobby.clients.get(x.client.id); if (c) this.lobby.enter(c, room); }
  }

  rematchState(clientId) {
    const m = this.members.get(clientId);
    return { votes: this.rematch.votes.size, humans: this.members.size, you: !!(m && this.rematch.votes.has(BaseRoom.identity(m.client))), code: this.rematch.code };
  }
  rematchOpts() { return { ...this.opts, public: false, quick: false }; } // salle privée, mêmes options
  rematchPrepare() {} // réglages de salle hors options (Arène : noms et couleurs des équipes)
  rematchSeat(clientId) { return this.members.get(clientId)?.seat ?? null; }

  close() { this.closed = true; this.clearTimers(); }

  emote(clientId, e) {
    const ALLOWED = ["👏", "😱", "🔥", "🧪", "🤯", "😂", "🎯", "🛡️", "GG"];
    if (!ALLOWED.includes(e)) return;
    const m = this.members.get(clientId); if (!m) return;
    const now = Date.now(); if (m.lastEmote && now - m.lastEmote < 1500) return; m.lastEmote = now;
    this.broadcast({ t: "emote", from: m.client.pseudo, e });
  }
}
