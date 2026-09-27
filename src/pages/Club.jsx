import { useState } from "react";
import { useI18n } from "../i18n/index.jsx";
import { useSession } from "../store/session.jsx";
import { Card, Kicker, Crest, useToast } from "../ui/components.jsx";
import { CLUB_COLORS, CREST_ICONS, CREST_UNLOCKS, COLOR_UNLOCKS, FORMATIONS, STRATEGIES } from "../../shared/data/content.js";
import { gradeOf, GRADES } from "../../shared/progression.js";

export default function Club() {
  const { t, lang } = useI18n();
  const { club, setClub, user } = useSession();
  const toast = useToast();
  const [c, setC] = useState(club);
  const g = gradeOf(user?.xp || 0).index;
  const lockTitle = grade => t("club.unlockAt", { grade: GRADES[grade][lang] });
  const up = patch => setC(x => ({ ...x, ...patch }));
  const save = () => { setClub({ ...c, name: c.name.trim().slice(0, 24) || "Labo Alpha" }); toast(t("club.saved"), "var(--lime)"); };
  return (
    <div className="page mid">
      <h1 className="h1">{t("club.title")}</h1>
      <p className="lead">{t("club.lead")}</p>
      <div className="grid g2 split">
        <Card>
          <label className="label" htmlFor="club-name">{t("club.name")}</label>
          <input id="club-name" className="input mb16" maxLength={24} value={c.name} onChange={e => up({ name: e.target.value })} />
          <div className="label">{t("club.primary")}</div>
          <div className="row mb16">{CLUB_COLORS.map(col => <button key={col} className={"swatch" + (c.colors[0].toLowerCase() === col.toLowerCase() ? " on" : "")} style={{ background: col, color: col }} aria-label={col} onClick={() => up({ colors: [col, c.colors[1]] })} />)}
            {COLOR_UNLOCKS.map(u => { const locked = u.grade > g; return <button key={u.color} disabled={locked} title={locked ? lockTitle(u.grade) : u.color} className={"swatch" + (c.colors[0].toLowerCase() === u.color.toLowerCase() ? " on" : "")} style={{ background: u.color, color: u.color, opacity: locked ? 0.25 : 1, cursor: locked ? "not-allowed" : "pointer" }} aria-label={u.color} onClick={() => up({ colors: [u.color, c.colors[1]] })}>{locked ? "🔒" : ""}</button>; })}</div>
          <div className="label">{t("club.secondary")}</div>
          <div className="row mb16">{["#0a0a12", "#1a1a2e", "#f0f0f0", "#101820", "#2a0a2a", "#0a2a1a"].map(col => <button key={col} className={"swatch" + (c.colors[1].toLowerCase() === col ? " on" : "")} style={{ background: col, color: "#fff" }} aria-label={col} onClick={() => up({ colors: [c.colors[0], col] })} />)}</div>
          <div className="label">{t("club.crest")}</div>
          <div className="row mb16">{CREST_ICONS.map(i => <button key={i} className={"btn small " + (c.crest === i ? "primary" : "ghost")} onClick={() => up({ crest: i })} aria-label={i}>{i}</button>)}
            {CREST_UNLOCKS.map(u => { const locked = u.grade > g; return <button key={u.icon} disabled={locked} title={locked ? lockTitle(u.grade) : u.icon} className={"btn small " + (c.crest === u.icon ? "primary" : "ghost")} onClick={() => up({ crest: u.icon })} aria-label={u.icon} style={{ filter: locked ? "grayscale(1)" : "none" }}>{u.icon}{locked ? "🔒" : ""}</button>; })}</div>
          <p className="tiny muted mb16">{t("club.unlockHint")}</p>
          <div className="grid g2">
            <div><label className="label" htmlFor="club-form">{t("club.formation")}</label><select id="club-form" className="select" value={c.formation} onChange={e => up({ formation: e.target.value })}>{Object.entries(FORMATIONS).map(([k, f]) => <option key={k} value={k}>{f.label[lang]}</option>)}</select></div>
            <div><label className="label" htmlFor="club-strat">{t("club.strategy")}</label><select id="club-strat" className="select" value={c.strategy} onChange={e => up({ strategy: e.target.value })}>{STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.nom[lang]}</option>)}</select></div>
          </div>
          <button className="btn lime block mt24" onClick={save}>💾 {t("club.save")}</button>
          {!user && <p className="tiny muted mt8">{t("club.localNote")}</p>}
        </Card>
        <Card elevated className="center" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, borderColor: c.colors[0] + "88" }}>
          <Kicker>{t("club.preview")}</Kicker>
          <Crest club={c} size={120} />
          <div className="h1" style={{ color: c.colors[0], fontSize: 30 }}>{c.name || "—"}</div>
          <div className="muted">{FORMATIONS[c.formation].label[lang]} · {STRATEGIES.find(s => s.id === c.strategy)?.nom[lang]}</div>
          <div style={{ width: "80%", height: 90, borderRadius: 14, background: `linear-gradient(135deg, ${c.colors[0]}, ${c.colors[1]})`, boxShadow: `0 0 40px ${c.colors[0]}55`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--f-title)", fontSize: 28, fontWeight: 800, color: "#fff", textShadow: "0 2px 8px #000" }}>10</div>
          <div className="tiny muted">{t("club.kit")}</div>
        </Card>
      </div>
    </div>
  );
}
