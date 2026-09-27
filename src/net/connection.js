// Connexions de jeu : en ligne (WebSocket vers le serveur) ou locale (lobby exécuté dans le navigateur, solo contre bots).
// Les deux exposent la même interface : send(msg), subscribe(fn) → désabonnement, close(), kind.
import { Lobby } from "../../shared/lobby.js";

// Diffuseur : les messages reçus avant le premier abonné sont conservés puis rejoués (évite de perdre room.joined).
function emitter() {
  const subs = new Set(); let backlog = [];
  const emit = m => { if (!subs.size) { backlog.push(m); if (backlog.length > 200) backlog.shift(); return; } for (const f of [...subs]) { try { f(m); } catch (e) { console.error(e); } } };
  const subscribe = f => { subs.add(f); if (backlog.length) { const b = backlog; backlog = []; queueMicrotask(() => b.forEach(emit)); } return () => subs.delete(f); };
  return { subs, emit, subscribe };
}

export function createLocalConnection({ pseudo = "Joueur", club = null, getProfile = null } = {}) {
  const ev = emitter();
  const lobby = new Lobby({ closeDelayMs: 1000 });
  const client = { id: "local", pseudo, guestId: "local0000", club, send: m => queueMicrotask(() => ev.emit(m)) };
  lobby.connect(client);
  if (getProfile) lobby.handle("local", JSON.parse(JSON.stringify({ t: "profile", ...getProfile() })));
  queueMicrotask(() => ev.emit({ t: "welcome", id: "local", pseudo, guest: true, local: true }));
  return {
    kind: "local", status: "open", rtt: 0,
    send: m => lobby.handle("local", JSON.parse(JSON.stringify(m))),
    subscribe: ev.subscribe,
    close: () => { lobby.disconnect("local"); lobby.shutdown(); },
    lobby,
  };
}

export function createWsConnection({ token = null, guestId = null, name = "", onStatus, getProfile = null } = {}) {
  const ev = emitter();
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  let ws = null, closed = false, retry = 0, queue = [], welcome = null, rejoin = null;
  const conn = { kind: "online", status: "connecting", rtt: 0.08, send, subscribe: ev.subscribe, close, get welcome() { return welcome; }, setRejoin: code => { rejoin = code; } };
  // mesure du ping (moyenne glissante) : sert à compenser la latence dans la prédiction de l'Arène
  const pinger = setInterval(() => { if (ws && ws.readyState === 1 && welcome) ws.send(JSON.stringify({ t: "ping", c: performance.now() })); }, 2000);

  function setStatus(s) { conn.status = s; onStatus?.(s); ev.emit({ t: "conn.status", status: s }); }
  function open() {
    setStatus(retry ? "reconnecting" : "connecting");
    ws = new WebSocket(url);
    ws.onopen = () => { ws.send(JSON.stringify({ t: "hello", token, guestId, name })); };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "welcome") {
        welcome = m; retry = 0; setStatus("open");
        if (m.guestId) { guestId = m.guestId; try { localStorage.setItem("ll.guestId", m.guestId); } catch { /* stockage indisponible */ } }
        if (getProfile) ws.send(JSON.stringify({ t: "profile", ...getProfile() })); // avant de (re)joindre une salle
        if (rejoin) ws.send(JSON.stringify({ t: "room.join", code: rejoin }));
        for (const q of queue) ws.send(JSON.stringify(q)); queue = [];
      }
      if (m.t === "pong") { const r = (performance.now() - m.c) / 1000; if (r >= 0 && r < 5) conn.rtt = conn.rtt * 0.7 + r * 0.3; return; }
      if (m.t === "room.joined") rejoin = m.code;
      if (m.t === "room.left" || m.t === "room.closed") rejoin = null;
      ev.emit(m);
    };
    ws.onclose = () => {
      if (closed) return;
      setStatus("reconnecting");
      const delay = Math.min(8000, 500 * 2 ** retry++);
      setTimeout(() => !closed && open(), delay);
    };
    ws.onerror = () => {};
  }
  function send(m) { if (ws && ws.readyState === 1 && welcome) ws.send(JSON.stringify(m)); else queue.push(m); }
  function close() { closed = true; clearInterval(pinger); setStatus("closed"); try { ws?.close(); } catch { /* déjà fermé */ } }
  open();
  return conn;
}
