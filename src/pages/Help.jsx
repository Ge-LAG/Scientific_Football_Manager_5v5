import { useI18n } from "../i18n/index.jsx";
import { Card, Kicker } from "../ui/components.jsx";
import { STRATEGIES } from "../../shared/data/content.js";
import { SYNERGIES, PLURI } from "../../shared/data/enrichment.js";
import { matchupFactor } from "../../shared/manager/engine.js";
import { attrName } from "../../shared/data/content.js";

// action → manette (le libellé clavier est traduit : controls.<action>.kb)
export const CONTROLS = [["move", "🕹️ L"], ["camera", "🕹️ R"], ["sprint", "RT / R2"], ["shoot", "X / ▢"], ["pass", "A / ✕"], ["lob", "LB / L1"], ["tackle", "B / ◯"], ["power", "Y / △"], ["call", "R3"], ["skill", "L3"], ["cam", "Select"], ["menu", "Start"]];

export default function Help() {
  const { t, lang } = useI18n();
  return (
    <div className="page mid">
      <h1 className="h1">{t("help.title")}</h1>
      <p className="lead">{t("help.lead")}</p>
      <div className="grid g2 split">
        <Card>
          <Kicker>🧪 {t("home.manager.title")}</Kicker>
          <ol className="small" style={{ lineHeight: 1.9, paddingLeft: 18 }}>{[1, 2, 3, 4, 5].map(i => <li key={i}>{t(`help.manager.s${i}`)}</li>)}</ol>
        </Card>
        <Card>
          <Kicker color="var(--magenta)">🏟️ {t("home.arena.title")}</Kicker>
          <ol className="small" style={{ lineHeight: 1.9, paddingLeft: 18 }}>{[1, 2, 3, 4, 5].map(i => <li key={i}>{t(`help.arena.s${i}`)}</li>)}</ol>
        </Card>
      </div>
      <Card className="mt16">
        <Kicker>🎮 {t("help.controls")}</Kicker>
        <table className="table"><thead><tr><th>{t("help.action")}</th><th>{t("help.keyboard")}</th><th>{t("help.gamepad")}</th></tr></thead>
          <tbody>{CONTROLS.map(([k, gp]) => <tr key={k}><td>{t("controls." + k)}</td><td><span className="kbd">{t("controls." + k + ".kb")}</span></td><td className="small muted">{gp}</td></tr>)}</tbody></table>
        <p className="tiny muted mt8">{t("help.controlsNote")}</p>
      </Card>
      <Card className="mt16">
        <Kicker color="var(--gold)">♟️ {t("help.matrix")}</Kicker>
        <p className="small muted mb8">{t("help.matrixLead")}</p>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 640 }}>
            <thead><tr><th>{t("help.attacker")} ↓ / {t("help.defender")} →</th>{STRATEGIES.map(s => <th key={s.id} title={s.nom[lang]}>{s.icon}</th>)}</tr></thead>
            <tbody>{STRATEGIES.map(a => <tr key={a.id}><td className="small"><b>{a.icon} {a.nom[lang]}</b></td>{STRATEGIES.map(d => { const f = matchupFactor(a.id, d.id); return <td key={d.id} className="num small" style={{ color: f > 1 ? "var(--lime)" : f < 1 ? "var(--coral)" : "var(--muted)" }}>{f === 1 ? "·" : `×${f.toFixed(2)}`}</td>; })}</tr>)}</tbody>
          </table>
        </div>
      </Card>
      <Card className="mt16">
        <Kicker color="var(--lime)">🔗 {t("help.synergies")}</Kicker>
        <div className="grid g2">{[...SYNERGIES, { ...PLURI, match: [], min: 5 }].map(s => <div key={s.id} className="small"><b>{s[lang]}</b> — <span className="muted">{s.id === "pluri" ? t("help.pluri") : t("help.synergyRule", { n: s.min, list: s.match.join(" / ") })}</span><div className="tiny" style={{ color: "var(--lime)" }}>{Object.entries(s.bonus).map(([k, v]) => `${attrName(k, lang)} +${v}`).join(" · ")}</div></div>)}</div>
      </Card>
      <Card className="mt16">
        <Kicker>❓ {t("help.faq")}</Kicker>
        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="mb16"><div style={{ fontWeight: 800 }}>{t(`help.q${i}`)}</div><div className="small muted" style={{ lineHeight: 1.6 }}>{t(`help.a${i}`)}</div></div>)}
      </Card>
    </div>
  );
}
