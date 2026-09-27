// Salle de l'Arène : lobby (équipes, postes, personnages) → match 3D plein écran → résultats.
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/index.jsx";
import { useSession } from "../../store/session.jsx";
import { useGame } from "../../game/GameProvider.jsx";
import { Card, Kicker, Avatar, Spinner, Seg, useToast } from "../../ui/components.jsx";
import { PLAYERS, getPlayer, pText, puText, keeperRating } from "../../../shared/data/content.js";
import { BOT_LEVELS } from "../../../shared/action/bot.js";
import { ArenaGame } from "./ArenaGame.jsx";

export default function ArenaRoomPage({ navigate }) {
  const { t } = useI18n(); const game = useGame(); const room = game.room;
  const init = game.cache["a.init"] || null; const end = game.cache["a.end"] || null;
  useEffect(() => { if (!game.joined && !room && !game.pending) navigate("/arena"); }, [game.joined, room, game.pending]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!room || room.mode !== "arena") return <div className="page"><Spinner label={t("common.joining")} /></div>;
  const leave = () => { game.leave(); navigate("/arena"); };
  if ((room.phase === "playing" || room.phase === "ended") && init) return <ArenaGame key={`${room.code}:${room.you.slot ?? "spec"}`} room={room} init={init} end={end} onLeave={leave} navigate={navigate} />;
  if (room.phase !== "lobby") return <div className="page"><Spinner label={t("common.loading")} /></div>;
  return <ArenaLobby room={room} onLeave={leave} />;
}

function ArenaLobby({ room, onLeave }) {
  const { t, lang } = useI18n(); const game = useGame(); const toast = useToast(); const { club } = useSession();
  const mySlot = room.you.slot; const me = mySlot != null ? room.slots[mySlot] : null;
  const sentTeams = useRef(null);
  useEffect(() => {
    // l'hôte donne à son équipe le nom et la couleur de son club
    if (!room.you.host || mySlot == null || sentTeams.current === room.code) return;
    sentTeams.current = room.code;
    const mine = room.slots[mySlot].team; const teams = room.teams.map(x => ({ ...x }));
    teams[mine] = { name: club.name, color: club.colors[0] };
    if (teams[1 - mine].color.toLowerCase() === club.colors[0].toLowerCase()) teams[1 - mine].color = mine === 0 ? "#FF00E5" : "#00F0FF";
    game.send({ t: "a.opts", teams });
  }, [room.code, room.you.host, mySlot]); // eslint-disable-line react-hooks/exhaustive-deps
  const [left, setLeft] = useState(room.startInMs != null ? Math.ceil(room.startInMs / 1000) : null);
  useEffect(() => { if (room.startInMs == null) return; setLeft(Math.ceil(room.startInMs / 1000)); const h = setInterval(() => setLeft(x => Math.max(0, x - 1)), 1000); return () => clearInterval(h); }, [room.startInMs]);
  const online = game.joined?.kind === "online";
  const shareUrl = `${location.origin}${location.pathname}#/join/${room.code}`;
  const takenByHuman = new Set(room.slots.filter(s => s.human && s.slot !== mySlot).map(s => s.charId));
  const posName = i => t("role." + ["gk", "def", "mid", "mid", "att"][i % 5]);
  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div className="row between mb16">
        <div className="row"><span className="kicker" style={{ margin: 0, color: "var(--magenta)" }}>🏟️ {t("home.arena.title")}</span>{online && <span className="chip" style={{ color: "var(--magenta)" }}>{t("mr.room")} {room.code}</span>}</div>
        <button className="btn small ghost" onClick={onLeave}>✕ {t("mr.leave")}</button>
      </div>
      <div className="grid split" style={{ gridTemplateColumns: "1fr 1fr 340px" }}>
        {[0, 1].map(team => (
          <Card key={team} style={{ borderColor: room.teams[team].color + "66" }}>
            <Kicker color={room.teams[team].color}>{room.teams[team].name}</Kicker>
            {room.slots.filter(s => s.team === team).map(s => { const p = getPlayer(s.charId); const mine = s.slot === mySlot; return (
              <button key={s.slot} className="card tight row nowrap mb8" style={{ width: "100%", cursor: s.human && !mine ? "default" : "pointer", borderColor: mine ? "var(--cyan)" : undefined, textAlign: "left" }} onClick={() => !s.human && game.send({ t: "a.slot", slot: s.slot })}>
                {p && <Avatar player={p} size={38} ring={s.slot % 5 === 0 ? "#FFD700" : undefined} />}
                <div className="grow"><div style={{ fontWeight: 800 }}>{p?.nom || "?"} <span className="tiny muted">{posName(s.slot)}</span></div><div className="tiny" style={{ color: s.human ? "var(--lime)" : "var(--muted)" }}>{s.human ? `👤 ${s.pseudo}${mine ? ` (${t("mr.you")})` : ""}` : `🤖 ${t("ah.botSlot")}`}</div></div>
                {!s.human && <span className="tiny muted">{t("ah.takeSlot")}</span>}
              </button>); })}
          </Card>
        ))}
        <div className="col" style={{ gap: 16 }}>
          <Card elevated>
            {online && <div className="center mb16"><div className="tiny muted">{t("mr.shareCode")}</div><div className="num" style={{ fontSize: 44, letterSpacing: 10, color: "var(--magenta)" }}>{room.code}</div><button className="btn small ghost" onClick={() => navigator.clipboard?.writeText(shareUrl).then(() => toast(t("mr.copied"), "var(--lime)"))}>🔗 {t("mr.copyLink")}</button></div>}
            {left != null && <div className="turn-banner mine mb16">⏱ {t("ah.autoStart", { n: left })}</div>}
            {room.you.host ? (
              <>
                <div className="label">{t("ah.botLevel")}</div>
                <Seg value={room.opts.botLevel} onChange={v => game.send({ t: "a.opts", botLevel: v })} options={Object.entries(BOT_LEVELS).map(([k, v]) => ({ value: k, label: v[lang] }))} />
                <div className="label mt16">{t("ah.halfLength")}</div>
                <Seg value={room.opts.halfSeconds} onChange={v => game.send({ t: "a.opts", halfSeconds: v })} options={[60, 120, 180, 300].map(s => ({ value: s, label: `${s / 60}'` }))} />
                <button className="btn magenta block big mt16" onClick={() => game.send({ t: "a.start" })}>⚽ {t("ah.start")}</button>
              </>
            ) : <p className="muted" style={{ animation: "pulse 2s infinite" }}>⏳ {t("mr.waitHost")}</p>}
            <p className="tiny muted mt8">{t("ah.dropIn")}</p>
          </Card>
          {me && (
            <Card>
              <Kicker>{t("ah.chooseChar")}</Kicker>
              <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {PLAYERS.map(p => { const taken = takenByHuman.has(p.id); const sel = me.charId === p.id; return (
                  <button key={p.id} disabled={taken} title={`${p.nom} — ${pText(p, lang).poste}`} onClick={() => game.send({ t: "a.char", charId: p.id })} style={{ background: sel ? p.color + "33" : "rgba(255,255,255,.03)", border: `1px solid ${sel ? p.color : "rgba(255,255,255,.08)"}`, borderRadius: 10, padding: 6, cursor: taken ? "not-allowed" : "pointer", opacity: taken ? 0.3 : 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <Avatar player={p} size={34} showNum={false} /><span className="tiny" style={{ fontWeight: 700 }}>{p.nom}</span>
                  </button>); })}
              </div>
              {me.charId && (() => { const p = getPlayer(me.charId); return (
                <div className="mt16 small" style={{ lineHeight: 1.5 }}>
                  <b style={{ color: p.color }}>{p.nom}</b> · {pText(p, lang).poste} · ⚡ <b>{puText(p.powerUp, lang).nom}</b>
                  <div className="tiny muted">{puText(p.powerUp, lang).arena}</div>
                  <div className="tiny muted mt8">🏃 {p.attributs.Vitesse} · 🎯 {p.attributs.Finition} · 🪄 {p.attributs.Dribble} · 🛡️ {p.attributs.Tacle} · 🧤 {keeperRating(p)}</div>
                </div>); })()}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
