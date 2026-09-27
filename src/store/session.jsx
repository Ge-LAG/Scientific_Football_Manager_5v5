// Session joueur : compte (pseudo + mot de passe, jeton), club, préférences, connexion de jeu active.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createLocalConnection, createWsConnection } from "../net/connection.js";

const SessionCtx = createContext(null);
const ls = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

export const DEFAULT_CLUB = { name: "Labo Alpha", colors: ["#00f0ff", "#0a0a12"], crest: "🧬", formation: "2-2", strategy: "equilibre" };
export const DEFAULT_SETTINGS = { volume: 0.7, quality: "auto", adaptiveQuality: true, sensitivity: 1, invertY: false, camera: "near", showHelp: true, voice: true, hints: true };

async function api(path, { method = "GET", body, token } = {}) {
  const r = await fetch(path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok) { const e = new Error(data?.error || "NETWORK"); e.code = data?.error || "NETWORK"; e.status = r.status; throw e; }
  return data;
}

export function SessionProvider({ children }) {
  const [token, setToken] = useState(() => ls.get("ll.token"));
  const [user, setUser] = useState(null);
  const [club, setClubState] = useState(() => ls.get("ll.club", DEFAULT_CLUB));
  const [settings, setSettingsState] = useState(() => ({ ...DEFAULT_SETTINGS, ...ls.get("ll.settings", {}) }));
  const [guestName, setGuestNameState] = useState(() => ls.get("ll.guestName", ""));
  // personnalisation de SES scientifiques : apparence (visible de tous) et 2 power-ups emportés
  const [looks, setLooksState] = useState(() => ls.get("ll.looks", {}));
  const [loadouts, setLoadoutsState] = useState(() => ls.get("ll.loadouts", {}));
  const profileRef = useRef({ looks, loadouts }); // toujours à jour (modifié par les setters, hors rendu)
  const [serverUp, setServerUp] = useState(null);
  const [conn, setConn] = useState(null);
  const connRef = useRef(null);

  const [online, setOnline] = useState(null);
  useEffect(() => {
    const f = () => api("/api/health").then(h => { setServerUp(true); setOnline(h.online ?? null); }, () => setServerUp(false));
    f(); const h = setInterval(f, 30000); return () => clearInterval(h);
  }, []);
  useEffect(() => {
    if (!token) { setUser(null); return; }
    api("/api/me", { token }).then(d => { setUser(d.user); if (d.user.club) setClubState(c => ({ ...c, ...d.user.club })); adoptProfile(d.user, token); }, e => { if (e.status === 401) { setToken(null); ls.set("ll.token", null); } });
  }, [token]);

  const login = useCallback(async (pseudo, password, register = false) => {
    const d = await api(register ? "/api/auth/register" : "/api/auth/login", { method: "POST", body: { pseudo, password } });
    dropConn(); ls.set("ll.token", d.token); setToken(d.token); setUser(d.user); adoptProfile(d.user, d.token);
    if (d.user.club) setClubState(c => ({ ...c, ...d.user.club }));
    else api("/api/me", { method: "PATCH", token: d.token, body: { club: toServerClub(ls.get("ll.club", DEFAULT_CLUB)) } }).catch(() => {});
    return d.user;
  }, []);
  const logout = useCallback(async () => { try { await api("/api/auth/logout", { method: "POST", token }); } catch { /* hors ligne */ } ls.set("ll.token", null); setToken(null); setUser(null); dropConn(); }, [token]);
  const deleteAccount = useCallback(async password => { await api("/api/me", { method: "DELETE", token, body: { password } }); ls.set("ll.token", null); setToken(null); setUser(null); dropConn(); }, [token]);
  const changePassword = useCallback(async (oldPassword, newPassword) => { const d = await api("/api/me/password", { method: "POST", token, body: { oldPassword, newPassword } }); if (d?.token) { ls.set("ll.token", d.token); setToken(d.token); } return d; }, [token]);
  const refreshUser = useCallback(() => token && api("/api/me", { token }).then(d => setUser(d.user)).catch(() => {}), [token]);

  const setClub = useCallback(c => { setClubState(c); ls.set("ll.club", c); if (token) api("/api/me", { method: "PATCH", token, body: { club: toServerClub(c) } }).catch(() => {}); }, [token]);
  const setSettings = useCallback(patch => setSettingsState(s => { const n = { ...s, ...patch }; ls.set("ll.settings", n); return n; }), []);
  const setGuestName = useCallback(n => { setGuestNameState(n); ls.set("ll.guestName", n); }, []);

  // profil du compte : le serveur fait foi s'il a des données, sinon on y envoie les préférences locales
  function adoptProfile(u, tk) {
    const hasLooks = u.looks && Object.keys(u.looks).length, hasLo = u.loadouts && Object.keys(u.loadouts).length;
    const body = {}; if (!hasLooks && Object.keys(profileRef.current.looks).length) body.looks = profileRef.current.looks; if (!hasLo && Object.keys(profileRef.current.loadouts).length) body.loadouts = profileRef.current.loadouts;
    if (hasLooks) { profileRef.current = { ...profileRef.current, looks: u.looks }; setLooksState(u.looks); ls.set("ll.looks", u.looks); }
    if (hasLo) { profileRef.current = { ...profileRef.current, loadouts: u.loadouts }; setLoadoutsState(u.loadouts); ls.set("ll.loadouts", u.loadouts); }
    if (Object.keys(body).length) api("/api/me", { method: "PATCH", token: tk, body }).catch(() => {});
    if (hasLooks || hasLo) connRef.current?.send({ t: "profile", ...profileRef.current }); // connexion déjà ouverte
  }
  // envoi différé (dernier état gagnant) : connexion de jeu après 300 ms de calme, compte après 800 ms
  const wsTimer = useRef(null), apiTimer = useRef(null);
  const pushProfile = useCallback(() => {
    clearTimeout(wsTimer.current); clearTimeout(apiTimer.current);
    wsTimer.current = setTimeout(() => connRef.current?.send({ t: "profile", ...profileRef.current }), 300);
    if (token) apiTimer.current = setTimeout(() => api("/api/me", { method: "PATCH", token, body: profileRef.current }).catch(() => {}), 800);
  }, [token]);
  const setLook = useCallback((charId, look) => {
    const n = { ...profileRef.current.looks }; if (look) n[charId] = look; else delete n[charId];
    profileRef.current = { ...profileRef.current, looks: n };
    setLooksState(n); ls.set("ll.looks", n); pushProfile();
  }, [pushProfile]);
  const setLoadout = useCallback((charId, ids) => {
    const n = { ...profileRef.current.loadouts, [charId]: ids };
    profileRef.current = { ...profileRef.current, loadouts: n };
    setLoadoutsState(n); ls.set("ll.loadouts", n); pushProfile();
  }, [pushProfile]);
  const saveLang = useCallback(lang => { if (token) api("/api/me", { method: "PATCH", token, body: { lang } }).catch(() => {}); }, [token]);

  function dropConn() { connRef.current?.close(); connRef.current = null; setConn(null); }
  // Connexion de jeu : locale (solo) ou en ligne ; une seule active à la fois.
  const openConnection = useCallback(kind => {
    const cur = connRef.current;
    if (cur && cur.kind === kind && cur.status !== "closed") return cur;
    cur?.close();
    const pseudo = user?.pseudo || guestName || "Manager";
    const getProfile = () => profileRef.current;
    const c = kind === "local" ? createLocalConnection({ pseudo, club, getProfile }) : createWsConnection({ token, guestId: readGuestId(), name: guestName, getProfile });
    connRef.current = c; setConn(c);
    return c;
  }, [user, guestName, club, token]);

  const value = useMemo(() => ({ token, user, club, settings, guestName, serverUp, online, conn, looks, loadouts, setLook, setLoadout, login, logout, deleteAccount, changePassword, refreshUser, setClub, setSettings, setGuestName, saveLang, openConnection, closeConnection: dropConn, api: (p, o = {}) => api(p, { ...o, token }) }),
    [token, user, club, settings, guestName, serverUp, online, conn, looks, loadouts, setLook, setLoadout, login, logout, deleteAccount, changePassword, refreshUser, setClub, setSettings, setGuestName, saveLang, openConnection]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

function readGuestId() { try { return localStorage.getItem("ll.guestId"); } catch { return null; } }
function toServerClub(c) { return { name: c.name, colors: c.colors, crest: c.crest, formation: c.formation, strategy: c.strategy, squad: [] }; }

export const useSession = () => useContext(SessionCtx);

// Abonnement aux messages de la connexion active.
export function useConnMessages(conn, handler) {
  const ref = useRef(handler); ref.current = handler;
  useEffect(() => (conn ? conn.subscribe(m => ref.current(m)) : undefined), [conn]);
}
