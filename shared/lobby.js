// Lobby : clients, salles, codes, partie rapide. Isomorphe (serveur Node et navigateur pour le solo).
import { ManagerRoom } from "./rooms/managerRoom.js";
import { ArenaRoom } from "./rooms/arenaRoom.js";
import { makeCode } from "./rooms/base.js";

const ROOM_TYPES = new Map([["manager", ManagerRoom], ["arena", ArenaRoom]]);
const MAX_FAILED_JOINS = 20; // codes erronés par connexion
const MAX_ROOMS = 500;

export class Lobby {
  /** @param {{ onResults?: (entries)=>Promise<any[]>, closeDelayMs?: number }} o */
  constructor(o = {}) {
    this.rooms = new Map(); this.clients = new Map();
    this.onResults = o.onResults || null;
    this.closeDelayMs = o.closeDelayMs ?? 30000;
  }

  // client = { id, pseudo, userId?, guestId?, elo?, club?, send(msg) }
  connect(client) { this.clients.set(client.id, { client, room: null }); }

  disconnect(clientId) {
    const c = this.clients.get(clientId); if (!c) return;
    if (c.room) c.room.leave(clientId);
    this.clients.delete(clientId);
  }

  handle(clientId, msg) {
    const c = this.clients.get(clientId); if (!c || !msg || typeof msg.t !== "string") return;
    const reply = m => c.client.send(m);
    switch (msg.t) {
      case "room.create": case "room.quick": {
        // anti-abus : une création/recherche de salle toutes les 2 s par connexion
        const now = Date.now(); if (c.lastCreate && now - c.lastCreate < 2000) return reply({ t: "error", code: "RATE_LIMITED" }); c.lastCreate = now;
        if (msg.t === "room.quick") return this.quick(c, msg);
        if (!ROOM_TYPES.has(msg.mode)) return reply({ t: "error", code: "BAD_MODE" });
        if (this.rooms.size >= MAX_ROOMS) return reply({ t: "error", code: "SERVER_FULL" });
        this.enter(c, this.createRoom(msg.mode, msg.opts || {}));
        break;
      }
      case "room.join": {
        if ((c.failedJoins || 0) >= MAX_FAILED_JOINS) return reply({ t: "error", code: "RATE_LIMITED" });
        const room = this.rooms.get(String(msg.code || "").toUpperCase().trim().slice(0, 12));
        if (!room || room.closed) { c.failedJoins = (c.failedJoins || 0) + 1; return reply({ t: "error", code: "ROOM_NOT_FOUND" }); }
        this.enter(c, room);
        break;
      }
      case "room.leave": if (c.room) { c.room.leave(clientId); c.room = null; reply({ t: "room.left" }); } break;
      case "room.list": reply({ t: "room.list", rooms: this.publicRooms() }); break;
      case "ping": reply({ t: "pong", c: Number(msg.c) || 0 }); break;
      default: if (c.room) c.room.handle(clientId, msg);
    }
  }

  quick(c, msg) {
    if (!ROOM_TYPES.has(msg.mode)) return c.client.send({ t: "error", code: "BAD_MODE" });
    const room = [...this.rooms.values()].find(r => r.mode === msg.mode && !r.closed && r.opts.quick && r.isPublicJoinable());
    if (!room && this.rooms.size >= MAX_ROOMS) return c.client.send({ t: "error", code: "SERVER_FULL" });
    this.enter(c, room || this.createRoom(msg.mode, { ...(msg.opts || {}), public: true, quick: true }));
  }

  createRoom(mode, opts) {
    let code; do code = makeCode(); while (this.rooms.has(code));
    const Room = ROOM_TYPES.get(mode); const room = new Room({ code, opts: opts && typeof opts === "object" ? opts : {}, lobby: this });
    this.rooms.set(code, room);
    return room;
  }

  enter(c, room) {
    if (c.room && c.room !== room) { c.room.leave(c.client.id); c.room = null; }
    if (room.closeTimer) { clearTimeout(room.closeTimer); room.closeTimer = null; }
    const seat = room.join(c.client);
    c.room = room; // seulement après un join réussi
    c.client.send({ t: "room.joined", code: room.code, mode: room.mode, seat });
  }

  scheduleClose(room) {
    if (room.closeTimer) clearTimeout(room.closeTimer);
    room.closeTimer = setTimeout(() => { if (room.members.size === 0) this.closeRoom(room); }, this.closeDelayMs);
    room.closeTimer.unref?.();
  }

  closeRoom(room) {
    room.close(); this.rooms.delete(room.code);
    for (const c of this.clients.values()) if (c.room === room) { c.room = null; c.client.send({ t: "room.closed" }); }
  }

  publicRooms() { return [...this.rooms.values()].filter(r => r.opts.public && !r.closed && r.phase !== "ended").map(r => r.info()); }

  shutdown() { for (const r of this.rooms.values()) r.close(); this.rooms.clear(); }
}
