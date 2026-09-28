import { useState } from "react";
import { useI18n } from "../i18n/index.jsx";
import { Card, Kicker, StatBar, RadarChart, Avatar } from "../ui/components.jsx";
import { getPlayer, PLAYERS, ATTRS, attrName, pText, puText, domainName, typeName, keeperRating, roleOf } from "../../shared/data/content.js";
import { SYNERGIES } from "../../shared/data/enrichment.js";
import { strengthsOf, weaknessesOf, composeBio } from "../../shared/data/profileText.js";
import { ArchetypeBadge, RoleFit, useMyPlayer } from "../ui/profile.jsx";
import { useSession } from "../store/session.jsx";

const TYPE_COLORS = { attaque: "var(--coral)", "défense": "var(--cyan)", "contrôle": "var(--violet)", mental: "var(--lime)" };

export default function PlayerDetail({ id, navigate }) {
  const { t, lang } = useI18n(); const my = useMyPlayer(); const { statAlloc } = useSession();
  const p = getPlayer(id) ? my(id) : null; // avec MA répartition de points
  const [cmp, setCmp] = useState("");
  if (!p) return <div className="page"><p className="muted">{t("player.notFound")}</p></div>;
  const tx = pText(p, lang);
  const other = cmp ? my(cmp) : null;
  const custom = !!statAlloc?.[p.id];
  const syn = SYNERGIES.filter(s => s.match.some(m => p.domaine.includes(m)));
  const idx = PLAYERS.findIndex(x => x.id === p.id);
  const prev = PLAYERS[(idx + PLAYERS.length - 1) % PLAYERS.length], next = PLAYERS[(idx + 1) % PLAYERS.length];

  return (
    <div className="page mid">
      <div className="row between mb16">
        <button className="linkbtn" onClick={() => navigate("/roster")}>← {t("player.back")}</button>
        <div className="row"><button className="btn small ghost" onClick={() => navigate(`/player/${prev.id}`)}>← {prev.nom}</button><button className="btn small ghost" onClick={() => navigate(`/player/${next.id}`)}>{next.nom} →</button></div>
      </div>
      <Card elevated className="mb16" style={{ borderColor: p.color + "66" }}>
        <div className="row" style={{ alignItems: "flex-start", gap: 28 }}>
          <div className="center">
            <Avatar player={p} size={110} />
            <div className="mt8"><ArchetypeBadge player={p} /></div>
            <div className="tiny muted mt4">{custom ? "✎ " + t("stats.custom") : "★ " + t("stats.default")}</div>
          </div>
          <div className="grow" style={{ minWidth: 260 }}>
            <div className="row"><h1 className="h1" style={{ color: "var(--white)", margin: 0 }}>{p.nom}</h1><span className="chip" style={{ color: p.color }}>#{p.numero}</span><button className="btn small ghost" onClick={() => navigate("/look/" + p.id)}>🎨 {t("look.customize")}</button></div>
            <div style={{ color: p.color, fontWeight: 700 }}>{domainName(p.domaine, lang)}</div>
            <div className="muted mb8">{tx.poste} — « {tx.slogan} » · {p.taille.toFixed(2)} m</div>
            <div className="row mb16" style={{ gap: 6 }}>{tx.traits.map(x => <span key={x} className="chip" style={{ color: p.color }}>{x}</span>)}<span className="chip" style={{ color: "var(--violet)" }}>{tx.profil}</span></div>
            <div className="row" style={{ gap: 28 }}>
              <div><div className="tiny" style={{ color: "var(--lime)", fontWeight: 800 }}>⬆ {t("player.strengths")}</div>{strengthsOf(p.attributs, 3).map(f => <div key={f} className="small">{attrName(f, lang)} : <b>{p.attributs[f]}</b></div>)}</div>
              <div><div className="tiny" style={{ color: "var(--coral)", fontWeight: 800 }}>⬇ {t("player.weaknesses")}</div>{weaknessesOf(p.attributs, 2).map(f => <div key={f} className="small">{attrName(f, lang)} : <b>{p.attributs[f]}</b></div>)}</div>
              <div style={{ minWidth: 220 }}><div className="tiny" style={{ color: "var(--cyan)", fontWeight: 800 }}>🎯 {t("player.bestRoles")}</div><RoleFit player={p} all /></div>
            </div>
            <div className="mt16" style={{ padding: "12px 16px", borderRadius: 12, background: p.color + "0d", border: `1px solid ${p.color}33`, lineHeight: 1.7 }}>
              <div className="tiny" style={{ color: p.color, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>📋 {t("player.file")}</div>
              <div className="small" style={{ fontStyle: "italic", opacity: .9 }}>{composeBio(p, p.attributs, lang)}</div>
              <button className="btn small ghost mt8" onClick={() => navigate("/look/" + p.id + "/stats")}>📊 {t("stats.distribute")}</button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid g2 split">
        <Card>
          <Kicker>{t("player.stats")}</Kicker>
          {ATTRS.map(k => <StatBar key={k} label={attrName(k, lang)} value={p.attributs[k]} />)}
          <div className="divider" />
          <StatBar label={`${attrName("Réflexes", lang)} (${t("player.enriched")})`} value={p.attributs["Réflexes"]} color="var(--gold)" />
          <StatBar label={t("player.keeperRating")} value={keeperRating(p)} color="var(--gold)" />
        </Card>
        <div className="col" style={{ gap: 16 }}>
          <Card className="center">
            <div className="row between"><Kicker>{t("player.radar")}</Kicker>
              <select className="select" style={{ width: "auto", fontSize: 12, padding: "4px 8px" }} value={cmp} onChange={e => setCmp(e.target.value)} aria-label={t("player.compare")}><option value="">{t("player.compare")}</option>{PLAYERS.filter(x => x.id !== p.id).map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></div>
            <RadarChart player={p} color={p.color} size={240} compare={other} />
            {other && <div className="tiny" style={{ color: "var(--magenta)" }}>- - {other.nom}</div>}
          </Card>
          <Card>
            <Kicker color="var(--magenta)">⚡ {t("player.powerups")}</Kicker>
            <p className="tiny muted mb8">{t("player.powerupsNote")}</p>
            {p.powerUps.map((pu, i) => { const put = puText(pu, lang); return (
              <div key={pu.id} className="pu-detail" style={{ borderColor: TYPE_COLORS[pu.type] }}>
                <div className="row between"><b>{put.nom}{i === 0 && <span style={{ color: "var(--gold)" }} title={t("loadout.original")}> ★</span>}</b><span className="chip" style={{ color: TYPE_COLORS[pu.type] }}>{typeName(pu.type, lang)}</span></div>
                <div className="small" style={{ color: "var(--lime)" }}>✦ {t("player.managerEffect")} : {put.effets}</div>
                <div className="small" style={{ color: "var(--cyan)" }}>🏟️ {t("player.arenaEffect")} : {put.arena}</div>
                <div className="tiny muted">⏱ {pu.duree}s · 🔄 {pu.cooldown}s · {Object.entries(pu.buffs).map(([k, v]) => `${attrName(k, lang)} ${v > 0 ? "+" : ""}${v}`).join(" · ")}</div>
              </div>); })}
          </Card>
          {syn.length > 0 && <Card><Kicker color="var(--lime)">🔗 {t("player.synergies")}</Kicker>{syn.map(s => <div key={s.id} className="small mb8"><b>{s[lang]}</b> — {t("player.synergyNeed", { n: s.min })} <span className="muted">({Object.entries(s.bonus).map(([k, v]) => `${attrName(k, lang)} +${v}`).join(", ")})</span></div>)}</Card>}
          <div className="small muted">{t("player.roleHint", { role: t("role." + roleOf(p)) })}</div>
        </div>
      </div>
    </div>
  );
}
