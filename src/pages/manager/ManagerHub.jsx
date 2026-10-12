import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/index.jsx";
import { useSession } from "../../store/session.jsx";
import { useGame } from "../../game/GameProvider.jsx";
import { Card, Kicker, Seg, GuestName } from "../../ui/components.jsx";
import { DIFFICULTIES } from "../../../shared/manager/ai.js";

export default function ManagerHub({ navigate }) {
  const { t, lang } = useI18n();
  const { serverUp, api } = useSession();
  const game = useGame();
  const [level, setLevel] = useState("chercheur");
  const [speed, setSpeed] = useState(1);
  const [length, setLength] = useState(1200);
  const [code, setCode] = useState("");
  const [rooms, setRooms] = useState([]);
  useEffect(() => { if (serverUp) { const f = () => api("/api/rooms").then(d => setRooms(d.rooms.filter(r => r.mode === "manager")), () => {}); f(); const h = setInterval(f, 5000); return () => clearInterval(h); } }, [serverUp]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="page">
      <h1 className="h1">🧪 {t("home.manager.title")}</h1>
      <p className="lead">{t("mh.lead")}</p>
      <div className="grid g3 split">
        <Card elevated>
          <Kicker>🤖 {t("mh.vsBot")}</Kicker>
          <p className="small muted mb16">{t("mh.vsBotDesc")}</p>
          <div className="label">{t("mh.difficulty")}</div>
          <Seg value={level} onChange={setLevel} options={Object.entries(DIFFICULTIES).map(([k, d]) => ({ value: k, label: d[lang] }))} />
          <div className="label mt16">{t("mh.speed")}</div>
          <Seg value={speed} onChange={setSpeed} options={[1, 2, 4].map(s => ({ value: s, label: `×${s}` }))} />
          <div className="label mt16">{t("mh.length")}</div>
          <Seg value={length} onChange={setLength} options={[{ value: 600, label: t("mh.short") }, { value: 1200, label: t("mh.normal") }, { value: 2400, label: t("mh.long") }]} />
          <button className="btn primary block mt24" onClick={() => game.create("local", "manager", { bot: level, speed, halfTicks: length, autostart: true })}>▶ {t("mh.play")}</button>
          <p className="tiny muted mt8">{t("mh.offlineOk")}</p>
          <div className="divider" />
          <button className="btn gold block" onClick={() => navigate("/manager/season")}>🏆 {t("season.title")}</button>
          <p className="tiny muted mt8">{t("season.hubHint")}</p>
        </Card>
        <Card>
          <Kicker color="var(--magenta)">🌐 {t("mh.online")}</Kicker>
          <p className="small muted mb16">{t("mh.onlineDesc")}</p>
          <GuestName />
          <button className="btn magenta block" disabled={serverUp === false} onClick={() => game.quick("manager")}>⚡ {t("home.quickOnline")}</button>
          <button className="btn ghost block mt8" disabled={serverUp === false} onClick={() => game.create("online", "manager", { speed: 2, halfTicks: length, public: false })}>🔒 {t("mh.privateRoom")}</button>
          <button className="btn ghost block mt8" disabled={serverUp === false} onClick={() => game.create("online", "manager", { speed: 2, halfTicks: length, public: true })}>📣 {t("mh.publicRoom")}</button>
          <form className="row nowrap mt16" onSubmit={e => { e.preventDefault(); if (code.length >= 4) game.join(code); }}>
            <input className="input code-input" style={{ fontSize: 20, letterSpacing: 5 }} maxLength={6} value={code} placeholder="CODE" aria-label={t("home.joinTitle")} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            <button className="btn lime" disabled={code.length < 4 || serverUp === false}>{t("home.join")}</button>
          </form>
          {serverUp === false && <p className="error small mt8">{t("home.offline")}</p>}
        </Card>
        <Card>
          <Kicker color="var(--lime)">📡 {t("mh.openRooms")}</Kicker>
          {rooms.length === 0 ? <p className="small muted">{t("mh.noRooms")}</p> : rooms.map(r => (
            <div key={r.code} className="row between mb8"><div><b className="num">{r.code}</b> <span className="small muted">{r.host} · {t("phase." + r.phase)}</span></div><button className="btn small lime" onClick={() => game.join(r.code)}>{t(r.phase === "lobby" ? "home.join" : "mh.watch")}</button></div>
          ))}
          <div className="divider" />
          <button className="linkbtn" onClick={() => navigate("/club")}>🎨 {t("mh.customizeClub")} →</button>
          <br /><button className="linkbtn mt8" onClick={() => navigate("/help")}>♟️ {t("help.matrix")} →</button>
        </Card>
      </div>
    </div>
  );
}
