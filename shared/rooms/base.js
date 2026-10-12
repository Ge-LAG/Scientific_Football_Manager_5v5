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

  close() { this.closed = true; this.clearTimers(); }

  emote(clientId, e) {
    const ALLOWED = ["👏", "😱", "🔥", "🧪", "🤯", "😂", "🎯", "🛡️", "GG"];
    if (!ALLOWED.includes(e)) return;
    const m = this.members.get(clientId); if (!m) return;
    const now = Date.now(); if (m.lastEmote && now - m.lastEmote < 1500) return; m.lastEmote = now;
    this.broadcast({ t: "emote", from: m.client.pseudo, e });
  }
}
