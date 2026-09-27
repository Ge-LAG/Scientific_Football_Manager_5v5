import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/index.jsx";
import { useSession } from "../../store/session.jsx";
import { useGame } from "../../game/GameProvider.jsx";
import { Card, Kicker, Seg, GuestName } from "../../ui/components.jsx";
import { BOT_LEVELS } from "../../../shared/action/bot.js";
import { CONTROLS } from "../Help.jsx";

export default function ArenaHub({ navigate }) {
  const { t, lang } = useI18n();
  const { serverUp, api } = useSession();
  const game = useGame();
  const [level, setLevel] = useState("normal");
  const [half, setHalf] = useState(180);
  const [code, setCode] = useState("");
  const [rooms, setRooms] = useState([]);
  useEffect(() => { if (serverUp) { const f = () => api("/api/rooms").then(d => setRooms(d.rooms.filter(r => r.mode === "arena")), () => {}); f(); const h = setInterval(f, 5000); return () => clearInterval(h); } }, [serverUp]); // eslint-disable-line react-hooks/exhaustive-deps
  const opts = { botLevel: level, halfSeconds: half };
  return (
    <div className="page">
      <h1 className="h1" style={{ color: "var(--magenta)" }}>🏟️ {t("home.arena.title")}</h1>
      <p className="lead">{t("ah.lead")}</p>
      <div className="grid g3 split">
        <Card elevated>
          <Kicker color="var(--magenta)">⚙️ {t("ah.settings")}</Kicker>
          <div className="label">{t("ah.botLevel")}</div>
          <Seg value={level} onChange={setLevel} options={Object.entries(BOT_LEVELS).map(([k, v]) => ({ value: k, label: v[lang] }))} />
          <div className="label mt16">{t("ah.halfLength")}</div>
          <Seg value={half} onChange={setHalf} options={[60, 120, 180, 300].map(s => ({ value: s, label: `${s / 60} min` }))} />
          <button className="btn magenta block mt24 big" onClick={() => game.create("local", "arena", opts)}>▶ {t("ah.practice")}</button>
          <button className="btn lime block mt8" onClick={() => game.create("local", "arena", { training: true })}>🎓 {t("ah.training")}</button>
          <p className="tiny muted mt8">{t("ah.practiceNote")}</p>
        </Card>
        <Card>
          <Kicker>🌐 {t("mh.online")}</Kicker>
          <p className="small muted mb16">{t("ah.onlineDesc")}</p>
          <GuestName />
          <button className="btn primary block" disabled={serverUp === false} onClick={() => game.quick("arena", opts)}>⚡ {t("home.quickOnline")}</button>
          <button className="btn ghost block mt8" disabled={serverUp === false} onClick={() => game.create("online", "arena", { ...opts, public: false })}>🔒 {t("mh.privateRoom")}</button>
          <button className="btn ghost block mt8" disabled={serverUp === false} onClick={() => game.create("online", "arena", { ...opts, public: true })}>📣 {t("mh.publicRoom")}</button>
          <form className="row nowrap mt16" onSubmit={e => { e.preventDefault(); if (code.length >= 4) game.join(code); }}>
            <input className="input code-input" style={{ fontSize: 20, letterSpacing: 5 }} maxLength={6} value={code} placeholder="CODE" aria-label={t("home.joinTitle")} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            <button className="btn lime" disabled={code.length < 4 || serverUp === false}>{t("home.join")}</button>
          </form>
          {serverUp === false && <p className="error small mt8">{t("home.offline")}</p>}
          <div className="divider" />
          <Kicker color="var(--lime)">📡 {t("mh.openRooms")}</Kicker>
          {rooms.length === 0 ? <p className="small muted">{t("mh.noRooms")}</p> : rooms.map(r => (
            <div key={r.code} className="row between mb8"><div><b className="num">{r.code}</b> <span className="small muted">{t("ah.humans", { n: r.humans })} · {t("phase." + r.phase)}</span></div><button className="btn small lime" onClick={() => game.join(r.code)}>{t("home.join")}</button></div>
          ))}
        </Card>
        <Card>
          <Kicker color="var(--gold)">🎮 {t("help.controls")}</Kicker>
          {CONTROLS.slice(0, 9).map(([k]) => <div key={k} className="row between small mb8"><span>{t("controls." + k)}</span><span className="kbd">{t("controls." + k + ".kb")}</span></div>)}
          <p className="tiny muted mt8">{t("help.controlsNote")}</p>
          <button className="linkbtn mt8" onClick={() => navigate("/help")}>{t("ah.fullHelp")} →</button>
        </Card>
      </div>
    </div>
  );
}
