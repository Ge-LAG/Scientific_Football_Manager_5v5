// Salle Manager : lobby → draft → composition → match en direct → rapport.
import { useEffect, useRef } from "react";
import { useI18n } from "../../i18n/index.jsx";
import { useSession } from "../../store/session.jsx";
import { useGame } from "../../game/GameProvider.jsx";
import { Card, Kicker, Crest, Spinner, Seg, useToast } from "../../ui/components.jsx";
import { DraftView } from "./DraftView.jsx";
import { SetupView } from "./SetupView.jsx";
import { MatchView } from "./MatchView.jsx";
import { DIFFICULTIES } from "../../../shared/manager/ai.js";
import { recordDay } from "../../../shared/manager/season.js";
import { loadSeason, saveSeason } from "./SeasonPage.jsx";

export default function ManagerRoomPage({ navigate }) {
  const { t } = useI18n();
  const { club } = useSession();
  const game = useGame(); const room = game.room;
  const sentClub = useRef(null);
  const init = game.cache["m.init"] || null; const report = game.cache["m.report"] || null;
  useEffect(() => {
    if (room?.mode === "manager" && room.phase === "lobby" && room.you.seat !== "spec" && sentClub.current !== room.code) { sentClub.current = room.code; game.send({ t: "m.club", club }); }
  }, [room, club]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!game.joined && !room && !game.pending) navigate("/manager"); }, [game.joined, room, game.pending]); // eslint-disable-line react-hooks/exhaustive-deps
  // championnat solo : on enregistre le résultat une seule fois pour la journée jouée
  const recorded = useRef(null);
  useEffect(() => {
    const se = room?.opts?.season; if (!se || !report || room.you.seat === "spec") return;
    const key = `${se.id}:${se.day}`; if (recorded.current === key) return; recorded.current = key;
    const s = loadSeason(); if (!s || s.id !== se.id || s.day !== se.day) return;
    const me = room.you.seat, r = report.report;
    saveSeason(recordDay(s, r.teams[me].score, r.teams[me === "home" ? "away" : "home"].score));
  }, [report, room]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!room || room.mode !== "manager") return <div className="page"><Spinner label={t("common.joining")} /></div>;
  const leave = () => { game.leave(); navigate("/manager"); };
  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div className="row between mb16">
        <div className="row"><span className="kicker" style={{ margin: 0 }}>🧪 {t("home.manager.title")}</span>{game.joined?.kind === "online" && <span className="chip" style={{ color: "var(--magenta)" }}>{t("mr.room")} {room.code}</span>}{game.status === "reconnecting" && <span className="chip" style={{ color: "var(--coral)" }}>{t("common.reconnecting")}</span>}<span className="chip" style={{ color: "var(--muted)" }}>{t("phase." + room.phase)}</span></div>
        <button className="btn small ghost" onClick={leave}>✕ {t("mr.leave")}</button>
      </div>
      {room.phase === "lobby" && <LobbyView room={room} />}
      {room.phase === "draft" && <DraftView room={room} />}
      {room.phase === "setup" && <SetupView room={room} />}
      {(room.phase === "playing" || room.phase === "ended") && init && <MatchView room={room} init={init} report={report} navigate={navigate} onLeave={leave} />}
      {(room.phase === "playing" || room.phase === "ended") && !init && <Spinner label={t("common.loading")} />}
    </div>
  );
}

function LobbyView({ room }) {
  const { t, lang } = useI18n(); const game = useGame(); const toast = useToast();
  const { home, away } = room.seats;
  const shareUrl = `${location.origin}${location.pathname}#/join/${room.code}`;
  const copy = () => { navigator.clipboard?.writeText(shareUrl).then(() => toast(t("mr.copied"), "var(--lime)")); };
  const online = game.joined?.kind === "online";
  return (
    <div className="grid g2 split">
      <Card elevated>
        <Kicker>{t("mr.lobbyTitle")}</Kicker>
        {online && (
          <div className="center mb16">
            <div className="tiny muted">{t("mr.shareCode")}</div>
            <div className="num" style={{ fontSize: 52, letterSpacing: 12, color: "var(--cyan)", textShadow: "0 0 30px rgba(0,240,255,.4)", cursor: "pointer" }} onClick={copy} title={t("mr.copyLink")}>{room.code}</div>
            <button className="btn small ghost" onClick={copy}>🔗 {t("mr.copyLink")}</button>
          </div>
        )}
        <SeatLine seat={home} label={t("mr.home")} you={room.you.seat === "home"} />
        <SeatLine seat={away} label={t("mr.away")} you={room.you.seat === "away"} waiting={!away.pseudo && !away.bot} />
        {room.opts.quick && !away.pseudo && <p className="small muted mt8" style={{ animation: "pulse 2s infinite" }}>⏳ {t("mr.quickWait")}</p>}
        {room.spectators?.length > 0 && <p className="tiny muted mt8">👁️ {room.spectators.join(", ")}</p>}
      </Card>
      <Card>
        <Kicker color="var(--gold)">⚙️ {t("mr.options")}</Kicker>
        {!away.pseudo && room.you.host && (
          <>
            <div className="label">{t("mr.botIfAlone")}</div>
            <Seg value={room.opts.bot || "chercheur"} onChange={v => game.send({ t: "m.bot", level: v })} options={Object.entries(DIFFICULTIES).map(([k, d]) => ({ value: k, label: d[lang] }))} />
          </>
        )}
        <p className="small muted mt16" style={{ lineHeight: 1.6 }}>{t("mr.draftExplain")}</p>
        {room.you.host ? <button className="btn lime block mt16 big" onClick={() => game.send({ t: "m.start" })}>⚡ {away.pseudo ? t("mr.startDraft") : t("mr.startVsBot")}</button>
          : <p className="muted mt16" style={{ animation: "pulse 2s infinite" }}>⏳ {t("mr.waitHost")}</p>}
        <div className="row mt16">{["👏", "🔥", "🧪", "😂", "GG"].map(e => <button key={e} className="btn small ghost" onClick={() => game.send({ t: "emote", e })}>{e}</button>)}</div>
      </Card>
    </div>
  );
}

function SeatLine({ seat, label, you, waiting }) {
  const { t, lang } = useI18n();
  return (
    <div className="card tight row nowrap mb8" style={{ borderColor: you ? "var(--cyan)" : undefined }}>
      <Crest club={seat.club} size={42} />
      <div className="grow"><div style={{ fontWeight: 800 }}>{seat.club?.name}</div><div className="small muted">{waiting ? <span style={{ animation: "pulse 2s infinite" }}>⏳ {t("mr.waitingOpponent")}</span> : seat.bot ? `🤖 ${t("mr.bot")} — ${DIFFICULTIES[seat.bot][lang]}` : `👤 ${seat.pseudo}${you ? ` (${t("mr.you")})` : ""}`}</div></div>
      <span className="chip" style={{ color: "var(--muted)" }}>{label}</span>
    </div>
  );
}
