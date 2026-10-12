// Serveur Lab League : fichiers statiques (dist/), API REST (/api) et temps réel WebSocket (/ws) sur un seul port.
// Conçu pour Hostinger (application Node.js) ou un VPS derrière un proxy.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { WebSocketServer } from "ws";
import { openDb, publicUser } from "./db.js";
import { createAuth } from "./auth.js";
import { createApi, reportResults, clientIp } from "./api.js";
import { Lobby } from "../shared/lobby.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json" };
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
};

export async function createServer({ port = 8787, host = "0.0.0.0", dataFile = path.join(ROOT, "data", "lableague.json"), distDir = path.join(ROOT, "dist"), log = console.log } = {}) {
  const db = await openDb(dataFile);
  const auth = createAuth(db);
  const lobby = new Lobby({ onResults: entries => reportResults(db, entries) });
  const api = createApi({ db, auth, getRooms: () => lobby.publicRooms(), getOnline: () => lobby.clients.size });

  async function serveStatic(req, res) {
    const url = new URL(req.url, "http://x");
    let rel = decodeURIComponent(url.pathname);
    if (rel.includes("\0")) { res.writeHead(400).end(); return; }
    let file = path.normalize(path.join(distDir, rel));
    if (file !== distDir && !file.startsWith(distDir + path.sep)) { res.writeHead(403).end(); return; }
    try { const st = await stat(file); if (st.isDirectory()) file = path.join(file, "index.html"); }
    catch { file = path.join(distDir, "index.html"); } // application monopage
    try {
      const body = await readFile(file);
      const ext = path.extname(file).toLowerCase();
      const immutable = file.includes(`${path.sep}assets${path.sep}`);
      const hsts = req.headers["x-forwarded-proto"] === "https" ? { "strict-transport-security": "max-age=15552000" } : {};
      res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache", ...SECURITY_HEADERS, ...hsts });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Client non construit : lancez « npm run build ».");
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (await api(req, res)) return;
      if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
      await serveStatic(req, res);
    } catch (e) { console.error("[http]", e); if (!res.headersSent) res.writeHead(500).end(); }
  });

  // ── Temps réel ───────────────────────────────────────────
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 8 * 1024 });
  let seq = 0;
  // un message diffusé à toute une salle n'est sérialisé qu'une fois
  const jsonCache = new WeakMap();
  const serialize = msg => { let j = jsonCache.get(msg); if (!j) { j = JSON.stringify(msg); jsonCache.set(msg, j); } return j; };
  const perIp = new Map(); const MAX_PER_IP = 8, MAX_TOTAL = 3000;
  wss.on("connection", (ws, req) => {
    // plafonds de connexions (par IP et global)
    const ip = clientIp(req);
    if ((perIp.get(ip) || 0) >= MAX_PER_IP || wss.clients.size > MAX_TOTAL) { ws.close(1013, "busy"); return; }
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    ws.on("close", () => { const n = (perIp.get(ip) || 1) - 1; if (n <= 0) perIp.delete(ip); else perIp.set(ip, n); });
    const id = "c" + (++seq).toString(36) + randomBytes(3).toString("hex");
    let client = null; ws.isAlive = true;
    let bucket = 90, last = Date.now(); // limitation : ~60 messages/s en régime, rafale de 90
    ws.on("pong", () => { ws.isAlive = true; });
    const send = msg => { if (ws.readyState === 1) ws.send(serialize(msg)); };
    ws.on("message", async raw => {
      const now = Date.now(); bucket = Math.min(90, bucket + (now - last) * 0.06); last = now;
      if (--bucket < 0) return;
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== "object") return;
      if (!client) {
        if (msg.t !== "hello") return;
        const user = typeof msg.token === "string" ? await Promise.resolve(auth.userFromToken(msg.token)).catch(() => null) : null;
        const guestId = typeof msg.guestId === "string" && /^[a-z0-9]{8,32}$/i.test(msg.guestId) ? msg.guestId : randomBytes(8).toString("hex");
        const guestName = typeof msg.name === "string" ? msg.name.replace(/[^\p{L}\p{N}_\-. ]/gu, "").trim().slice(0, 20) : "";
        client = user
          ? { id, pseudo: user.pseudo, userId: user.id, elo: user.stats?.manager?.elo ?? 1000, club: user.club, send }
          : { id, pseudo: guestName ? `${guestName} (invité)` : `Invité-${guestId.slice(0, 4).toUpperCase()}`, guestId, send };
        lobby.connect(client);
        send({ t: "welcome", id, pseudo: client.pseudo, guest: !user, guestId: client.guestId || null, user: user ? publicUser(user) : null });
        return;
      }
      try { lobby.handle(id, msg); } catch (e) { console.error("[ws]", e); }
    });
    ws.on("close", () => { if (client) try { lobby.disconnect(id); } catch (e) { console.error("[ws] fermeture", e); } });
    ws.on("error", () => {});
  });
  const heartbeat = setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 20000);
  heartbeat.unref();

  await new Promise(r => server.listen(port, host, r));
  const address = server.address();
  log(`Lab League en ligne sur http://${host === "0.0.0.0" ? "localhost" : host}:${address.port}`);

  async function close() {
    clearInterval(heartbeat); lobby.shutdown();
    for (const ws of wss.clients) ws.terminate();
    await new Promise(r => wss.close(r));
    await new Promise(r => server.close(r));
    api.close?.();
    await db.close();
  }
  return { server, port: address.port, lobby, db, close };
}

// Lancement direct : node server/index.js
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.on("uncaughtException", e => console.error("[fatal évité]", e));
  process.on("unhandledRejection", e => console.error("[promesse rejetée]", e));
  const port = Number(process.env.PORT) || 8787;
  const dataFile = process.env.DATA_FILE || path.join(process.env.DATA_DIR || path.join(ROOT, "data"), "lableague.json");
  const app = await createServer({ port, host: process.env.HOST || "0.0.0.0", dataFile });
  const stop = async sig => { console.log(`\n${sig} : arrêt propre…`); await app.close(); process.exit(0); };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
}
