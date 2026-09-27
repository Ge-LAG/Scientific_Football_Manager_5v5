import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { I18nProvider, useI18n, LANGS } from "./i18n/index.jsx";
import { SessionProvider, useSession } from "./store/session.jsx";
import { ToastProvider, Spinner } from "./ui/components.jsx";
import { GameProvider, useGame } from "./game/GameProvider.jsx";
import Home from "./pages/Home.jsx";
import Roster from "./pages/Roster.jsx";
import PlayerDetail from "./pages/PlayerDetail.jsx";
import PowerUps from "./pages/PowerUps.jsx";
import Club from "./pages/Club.jsx";
import Account from "./pages/Account.jsx";
import Profile from "./pages/Profile.jsx";
import Leaderboard from "./pages/Leaderboard.jsx";
import Help from "./pages/Help.jsx";
import Settings from "./pages/Settings.jsx";
import ManagerHub from "./pages/manager/ManagerHub.jsx";
import ManagerRoomPage from "./pages/manager/ManagerRoomPage.jsx";
import SeasonPage from "./pages/manager/SeasonPage.jsx";
import ArenaHub from "./pages/arena/ArenaHub.jsx";
import { reloadOnChunkError } from "./net/reload.js";
// Three.js chargé à la demande ; si les fichiers ont changé (nouvelle version déployée), on recharge la page une fois.
const ArenaRoomPage = lazy(() => import("./pages/arena/ArenaRoomPage.jsx").catch(reloadOnChunkError));

// Routeur minimal par ancre (#/chemin) : liens partageables, rechargement sûr.
function useHashRoute() {
  const read = () => (location.hash.replace(/^#/, "") || "/");
  const [path, setPath] = useState(read);
  useEffect(() => { const f = () => { setPath(read()); window.scrollTo(0, 0); }; window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  const navigate = useCallback(p => { if (read() !== p) location.hash = p; }, []);
  return [path, navigate];
}

function Shell({ path, navigate }) {
  const { t, lang, setLang } = useI18n();
  const { user } = useSession();
  const game = useGame();
  const seg = path.split("/").filter(Boolean);
  const nav = [
    { to: "/", label: t("nav.home"), match: p => p === "/" },
    { to: "/manager", label: t("nav.manager"), match: p => p.startsWith("/manager") },
    { to: "/arena", label: t("nav.arena"), match: p => p.startsWith("/arena") },
    { to: "/roster", label: t("nav.roster"), match: p => p.startsWith("/roster") || p.startsWith("/player") },
    { to: "/powerups", label: t("nav.powerups"), match: p => p === "/powerups" },
    { to: "/club", label: t("nav.club"), match: p => p === "/club" },
    { to: "/leaderboard", label: t("nav.leaderboard"), match: p => p === "/leaderboard" || p.startsWith("/u/") },
    { to: "/help", label: t("nav.help"), match: p => p === "/help" },
  ];
  useEffect(() => { if (seg[0] === "join" && seg[1]) game.join(seg[1].toUpperCase()); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  let page;
  switch (seg[0]) {
    case undefined: page = <Home navigate={navigate} />; break;
    case "roster": page = <Roster navigate={navigate} />; break;
    case "player": page = <PlayerDetail id={seg[1]} navigate={navigate} />; break;
    case "powerups": page = <PowerUps navigate={navigate} />; break;
    case "club": page = <Club navigate={navigate} />; break;
    case "account": page = <Account navigate={navigate} />; break;
    case "profile": page = <Profile navigate={navigate} />; break;
    case "u": page = <Profile pseudo={decodeURIComponent(seg[1] || "")} navigate={navigate} />; break;
    case "leaderboard": page = <Leaderboard navigate={navigate} />; break;
    case "help": page = <Help navigate={navigate} />; break;
    case "settings": page = <Settings navigate={navigate} />; break;
    case "manager": page = seg[1] === "play" ? <ManagerRoomPage navigate={navigate} /> : seg[1] === "season" ? <SeasonPage navigate={navigate} /> : <ManagerHub navigate={navigate} />; break;
    case "arena": page = seg[1] === "play" ? <Suspense fallback={<Spinner label={t("common.loading")} />}><ArenaRoomPage navigate={navigate} /></Suspense> : <ArenaHub navigate={navigate} />; break;
    case "join": page = <Spinner label={t("common.joining")} />; break;
    default: page = <Home navigate={navigate} />;
  }
  const fullscreenGame = seg[0] === "arena" && seg[1] === "play" && game.room?.phase === "playing";

  return (
    <div className="app">
      {!fullscreenGame && (
        <header className="header">
          <div className="brand" onClick={() => navigate("/")} role="link" tabIndex={0} onKeyDown={e => e.key === "Enter" && navigate("/")}>🧬 LAB LEAGUE <small>5v5</small></div>
          <nav className="nav" aria-label={t("nav.label")}>{nav.map(n => <button key={n.to} className={n.match(path) ? "active" : ""} onClick={() => navigate(n.to)}>{n.label}</button>)}</nav>
          <div className="header-right">
            {game.joined && !path.includes("/play") && <button className="btn small magenta" onClick={() => navigate(game.joined.mode === "manager" ? "/manager/play" : "/arena/play")}>● {t("nav.backToMatch")}</button>}
            <select className="select" style={{ width: "auto", padding: "6px 8px", fontSize: 13 }} value={lang} onChange={e => setLang(e.target.value)} aria-label={t("settings.language")}>{LANGS.map(l => <option key={l.id} value={l.id}>{l.id.toUpperCase()}</option>)}</select>
            <button className="btn small ghost" onClick={() => navigate(user ? "/profile" : "/account")}>{user ? `👤 ${user.pseudo}` : t("nav.login")}</button>
            <button className="btn small ghost icon" onClick={() => navigate("/settings")} aria-label={t("nav.settings")} title={t("nav.settings")}>⚙️</button>
          </div>
        </header>
      )}
      <main className="main">{page}</main>
      {!fullscreenGame && <footer className="footer">{t("footer.text")}</footer>}
    </div>
  );
}

function WithGame() {
  const [path, navigate] = useHashRoute();
  return <GameProvider navigate={navigate}><Shell path={path} navigate={navigate} /></GameProvider>;
}

function LangSync({ children }) {
  return children;
}

export default function App() {
  return (
    <SessionProvider>
      <LangBridge />
    </SessionProvider>
  );
}

// La langue choisie est aussi enregistrée sur le compte (si connecté).
function LangBridge() {
  const { saveLang } = useSession();
  return (
    <I18nProvider onChange={saveLang}>
      <ToastProvider><LangSync><WithGame /></LangSync></ToastProvider>
    </I18nProvider>
  );
}
