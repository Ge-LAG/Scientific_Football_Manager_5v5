import { useState } from "react";
import { useI18n } from "../i18n/index.jsx";
import { Card, Avatar, Seg } from "../ui/components.jsx";
import { ALL_POWER_UPS, PLAYERS, getPlayer, puText, typeName, domainName, attrName } from "../../shared/data/content.js";

const TYPE_COLORS = { attaque: "#FF3366", "défense": "#00F0FF", "contrôle": "#8B5CF6", mental: "#B8FF00" };

export default function PowerUps({ navigate }) {
  const { t, lang } = useI18n();
  const [type, setType] = useState("all"); const [who, setWho] = useState("");
  const list = ALL_POWER_UPS.filter(p => (type === "all" || p.type === type) && (!who || p.joueur === who));
  return (
    <div className="page">
      <h1 className="h1">{t("pu.title")}</h1>
      <p className="lead">{t("pu.lead")}</p>
      <div className="row mb24" style={{ gap: 12 }}>
        <Seg value={type} onChange={setType} label={t("pu.filter")} options={[{ value: "all", label: t("pu.all") }, ...Object.keys(TYPE_COLORS).map(k => ({ value: k, label: typeName(k, lang) }))]} />
        <select className="select" style={{ width: "auto" }} value={who} onChange={e => setWho(e.target.value)} aria-label={t("pu.byPlayer")}><option value="">{t("pu.allPlayers")}</option>{PLAYERS.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</select>
        <span className="tiny muted">{t("pu.count", { n: list.length })} · {t("pu.loadoutNote")}</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {list.map(pu => {
          const p = getPlayer(pu.joueur); const tx = puText(pu, lang); const c = TYPE_COLORS[pu.type];
          return (
            <Card key={pu.id} onClick={() => navigate(`/player/${p.id}`)} style={{ borderColor: c + "55" }}>
              <div className="row between nowrap" style={{ alignItems: "flex-start" }}>
                <div className="row nowrap"><Avatar player={p} size={42} showNum={false} /><div><div style={{ fontWeight: 800, fontSize: 17 }}>{tx.nom}{pu.original && <span title={t("loadout.original")} style={{ color: "var(--gold)" }}> ★</span>}</div><div className="tiny" style={{ color: p.color }}>{p.nom} · {domainName(pu.domaine, lang)}</div></div></div>
                <span className="chip" style={{ color: c }}>{typeName(pu.type, lang).toUpperCase()}</span>
              </div>
              <div className="row mt8 small muted" style={{ gap: 14 }}><span>⏱ <b style={{ color: "var(--cyan)" }}>{pu.duree}s</b></span><span>🔄 <b style={{ color: "var(--gold)" }}>{pu.cooldown}s</b></span>{pu.arena && <span>🏟️ {pu.arena.duration}s / {pu.arena.cooldown}s</span>}</div>
              <div className="small mt8" style={{ color: "var(--lime)", lineHeight: 1.5 }}>✦ {tx.effets}</div>
              <div className="row mt8" style={{ gap: 4 }}>{Object.entries(pu.buffs).map(([k, v]) => <span key={k} className="chip" style={{ color: v > 0 ? "var(--lime)" : "var(--coral)" }}>{attrName(k, lang)} {v > 0 ? "+" : ""}{v}</span>)}</div>
              <div className="small mt8" style={{ color: "var(--cyan)", lineHeight: 1.5 }}>🏟️ {tx.arena}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
