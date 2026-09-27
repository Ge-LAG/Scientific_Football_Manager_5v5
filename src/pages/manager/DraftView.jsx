import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/index.jsx";
import { useGame } from "../../game/GameProvider.jsx";
import { Card, Kicker, Avatar, Crest, RadarChart } from "../../ui/components.jsx";
import { getPlayer, pText, keeperRating, attrName } from "../../../shared/data/content.js";
import { activeSynergies } from "../../../shared/data/enrichment.js";

export function DraftView({ room }) {
  const { t, lang } = useI18n(); const game = useGame();
  const d = room.draft; const me = room.you.seat; const turnSide = d.order[d.turn];
  const mine = me !== "spec" && turnSide === me;
  const [hover, setHover] = useState(null);
  const [left, setLeft] = useState(Math.ceil(d.remainingMs / 1000));
  useEffect(() => { setLeft(Math.ceil(d.remainingMs / 1000)); const h = setInterval(() => setLeft(x => Math.max(0, x - 1)), 1000); return () => clearInterval(h); }, [d.turn, d.remainingMs]);
  const seats = room.seats; const turnSeat = seats[turnSide];
  const avail = d.available.map(getPlayer).sort((a, b) => b.overall - a.overall);
  const show = hover ? getPlayer(hover) : null;
  return (
    <div>
      <div className={"turn-banner mb16" + (mine ? " mine" : "")} style={{ color: mine ? undefined : "var(--gold)", background: mine ? undefined : "rgba(255,215,0,.06)" }}>
        {mine ? `🎯 ${t("draft.yourTurn")}` : `⏳ ${t("draft.theirTurn", { name: turnSeat.bot ? turnSeat.club.name : turnSeat.pseudo || turnSeat.club.name })}`}
        <span className="num" style={{ marginLeft: 12, fontSize: 16 }}>{t("draft.pick", { n: d.turn + 1 })} · {left}s</span>
      </div>
      <div className="grid split" style={{ gridTemplateColumns: "260px 1fr 260px" }}>
        <Picks seat={seats.home} active={turnSide === "home"} you={me === "home"} />
        <div>
          <div className="row between mb8"><Kicker>{t("draft.available", { n: avail.length })}</Kicker>{me !== "spec" && <div className="row">{mine && <button className="btn small ghost" onClick={() => game.send({ t: "m.autopick" })}>🤖 {t("draft.auto")}</button>}<button className="btn small ghost" onClick={() => game.send({ t: "m.autodraft" })} title={t("draft.autoAllHint")}>⚡ {t("draft.autoAll")}</button></div>}</div>
          <div className="draft-pool">
            {avail.map(p => (
              <button key={p.id} className="draft-card" disabled={!mine} style={{ borderColor: p.color + "66" }} onMouseEnter={() => setHover(p.id)} onFocus={() => setHover(p.id)} onClick={() => mine && game.send({ t: "m.pick", id: p.id })}>
                <div className="row between nowrap"><Avatar player={p} size={34} showNum={false} /><span className="num" style={{ color: p.color, fontSize: 20 }}>{p.overall}</span></div>
                <div style={{ fontWeight: 800, marginTop: 4 }}>{p.nom}</div>
                <div className="tiny" style={{ color: p.color }}>{pText(p, lang).poste}</div>
                <div className="tiny muted">🧤 {keeperRating(p)} · {p.forces.map(f => attrName(f, lang).slice(0, 3)).join("/")}</div>
              </button>
            ))}
          </div>
          {show && (
            <Card className="mt16" tight>
              <div className="row nowrap" style={{ alignItems: "flex-start" }}>
                <div style={{ width: 160, flexShrink: 0 }}><RadarChart player={show} color={show.color} size={160} /></div>
                <div><div style={{ fontWeight: 800 }}>{show.nom} — <span style={{ color: show.color }}>« {pText(show, lang).slogan} »</span></div><div className="small muted mt8" style={{ lineHeight: 1.5 }}>{pText(show, lang).bio}</div></div>
              </div>
            </Card>
          )}
        </div>
        <Picks seat={seats.away} active={turnSide === "away"} you={me === "away"} />
      </div>
    </div>
  );
}

function Picks({ seat, active, you }) {
  const { t, lang } = useI18n();
  const players = seat.picks.map(getPlayer);
  const syn = activeSynergies(players);
  return (
    <Card style={{ borderColor: active ? seat.club.colors[0] : undefined, boxShadow: active ? `0 0 24px ${seat.club.colors[0]}33` : undefined }}>
      <div className="row nowrap mb8"><Crest club={seat.club} size={38} /><div><div style={{ fontWeight: 800 }}>{seat.club.name}</div><div className="tiny muted">{seat.bot ? "🤖" : "👤"} {seat.pseudo || ""}{you ? ` (${t("mr.you")})` : ""}</div></div></div>
      {players.map(p => <div key={p.id} className="row nowrap mb8"><Avatar player={p} size={28} showNum={false} /><span className="small" style={{ fontWeight: 700 }}>{p.nom}</span><span className="tiny muted grow">{pText(p, lang).poste}</span><span className="num small" style={{ color: p.color }}>{p.overall}</span></div>)}
      {Array.from({ length: 8 - players.length }).map((_, i) => <div key={i} className="tiny muted mb8" style={{ border: "1px dashed rgba(255,255,255,.1)", borderRadius: 8, padding: 6, textAlign: "center" }}>—</div>)}
      {syn.length > 0 && <div className="mt8">{syn.map(s => <span key={s.id} className="chip mb8" style={{ color: "var(--lime)", marginRight: 4 }}>🔗 {s[lang]}</span>)}</div>}
    </Card>
  );
}
