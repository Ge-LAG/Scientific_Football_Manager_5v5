// Partie en cours : salle rejointe, état diffusé par la salle, actions (créer, rejoindre, partie rapide, quitter).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession, useConnMessages } from "../store/session.jsx";
import { useI18n } from "../i18n/index.jsx";
import { useToast } from "../ui/components.jsx";

const GameCtx = createContext(null);
// dernière salle en ligne (onglet courant uniquement)
const store = {
  get: () => { try { return JSON.parse(sessionStorage.getItem("ll.lastRoom") || "null"); } catch { return null; } },
  set: v => { try { if (v) sessionStorage.setItem("ll.lastRoom", JSON.stringify(v)); else sessionStorage.removeItem("ll.lastRoom"); } catch { /* stockage indisponible */ } },
};

export function GameProvider({ children, navigate }) {
  const { conn, openConnection, closeConnection } = useSession();
  const { t } = useI18n(); const toast = useToast();
  const [room, setRoom] = useState(null);       // dernier room.state
  const [joined, setJoined] = useState(null);   // { code, mode, seat, kind }
  const [status, setStatus] = useState(null);
  const [cache, setCache] = useState({});
  const [pending, setPending] = useState(false); // demande de salle en cours (création, jonction, reprise)         // derniers m.init / m.report / a.init / a.end de la salle courante

  useConnMessages(conn, m => {
    switch (m.t) {
      case "room.joined":
        // (le cache n'est vidé qu'au lancement d'une nouvelle demande : m.init peut arriver avant room.joined)
        setJoined({ code: m.code, mode: m.mode, seat: m.seat, kind: conn.kind }); setPending(false);
        if (conn.kind === "online") store.set({ code: m.code, at: Date.now() });
        navigate(m.mode === "manager" ? "/manager/play" : "/arena/play"); break;
      case "room.state": setRoom(m); break;
      case "m.init": case "m.report": case "a.init": case "a.end": setCache(c => ({ ...c, [m.t]: m })); break;
      case "room.left": case "room.closed": setRoom(null); setJoined(null); setCache({}); setPending(false); store.set(null); break;
      case "conn.status": setStatus(m.status); break;
      case "emote": toast(`${m.from} : ${m.e}`, "var(--gold)", 2500); break;
      case "error": setPending(false); toast(t("error." + m.code), "var(--coral)"); if (m.code === "ROOM_NOT_FOUND") { store.set(null); navigate("/"); } break;
    }
  });
  useEffect(() => { if (!conn) { setRoom(null); setJoined(null); } }, [conn]);
  // reprise après rechargement de la page : on rejoint la dernière salle en ligne (le serveur retrouve notre place)
  useEffect(() => { const last = store.get(); if (last && Date.now() - last.at < 30 * 60 * 1000) start("online", { t: "room.join", code: last.code }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback((kind, msg) => { const c = openConnection(kind); setRoom(null); setCache({}); setPending(true); c.send(msg); }, [openConnection]);
  const api = useMemo(() => ({
    room, joined, status, cache, pending,
    create: (kind, mode, opts) => start(kind, { t: "room.create", mode, opts }),
    quick: (mode, opts) => start("online", { t: "room.quick", mode, opts }),
    join: code => start("online", { t: "room.join", code }),
    send: m => conn?.send(m),
    leave: () => { conn?.send({ t: "room.leave" }); if (conn?.kind === "local") closeConnection(); setRoom(null); setJoined(null); setCache({}); store.set(null); },
  }), [room, joined, status, cache, pending, start, conn, closeConnection]);
  if (typeof window !== "undefined") window.__llGame = { room, joined, status, cacheKeys: Object.keys(cache) }; // inspection (diagnostic)
  return <GameCtx.Provider value={api}>{children}</GameCtx.Provider>;
}

export const useGame = () => useContext(GameCtx);
