import { useI18n } from "../i18n/index.jsx";
import { Card, Kicker } from "../ui/components.jsx";
import { STRATEGIES } from "../../shared/data/content.js";
import { SYNERGIES, PLURI } from "../../shared/data/enrichment.js";
import { matchupFactor } from "../../shared/manager/engine.js";
import { attrName, domainWord } from "../../shared/data/content.js";

import { useBindings } from "../ui/bindings.js";
import { STAT_BUDGET, STAT_MIN, STAT_MAX } from "../../shared/data/stats.js";

const SKILLS = ["cut", "feint", "roulette", "stepover", "nutmeg", "wallpass", "wallkick"];
const STAT_ROWS = [["Finition", "finition"], ["Tacle", "tacle"], ["Dribble", "dribble"], ["Endurance", "endurance"], ["Force", "force"], ["Vitesse", "vitesse"], ["Vision", "vision"], ["Sang-froid", "sangfroid"], ["Réflexes", "reflexes"]];

// actions présentées dans l'aide (libellés selon les réglages : disposition du clavier, réaffectations, manette)
export const CONTROLS = ["sprint", "shoot", "pass", "lob", "skill", "tackle", "press", "switch", "call", "pu1", "pu2", "cam", "board", "menu"];

export default function Help({ navigate }) {
  const { t, lang } = useI18n(); const keys = useBindings();
  // réponses de la FAQ : touches effectives (schéma, disposition et réaffectations du joueur)
  const faq = { 5: { key: keys.keyOf("call"), pad: keys.padOf("call") } };
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
          <tbody>
            <tr><td>{t("controls.move")}</td><td><span className="kbd">{keys.moveKeys}</span></td><td className="small muted">{t("controls.leftStick")}</td></tr>
            <tr><td>{t("controls.camera")}</td><td><span className="kbd">{keys.mouse ? t("controls.mouse") : "—"}</span></td><td className="small muted">{t("controls.rightStick")}</td></tr>
            {CONTROLS.map(k => <tr key={k}><td>{t("controls." + k)}</td><td><span className="kbd">{keys.keyOf(k)}</span></td><td className="small muted">{keys.padOf(k)}</td></tr>)}
          </tbody></table>
        <p className="tiny muted mt8">{t("help.controlsNote")} {keys.controls.contextKeys && t("controls.contextHint", { pass: keys.keyOf("pass"), shoot: keys.keyOf("shoot") })}</p>
        {navigate && <button className="btn small ghost mt8" onClick={() => navigate("/settings")}>⚙️ {t("help.customize")}</button>}
      </Card>
      <Card className="mt16">
        <Kicker color="var(--magenta)">🌀 {t("help.skills")}</Kicker>
        <p className="small muted mb8">{t("help.skillsLead", { key: keys.keyOf("skill") })}</p>
        <div style={{ overflowX: "auto" }}>
          <table className="table"><thead><tr><th>{t("help.action")}</th><th>{t("help.skillHowTitle")}</th><th>{t("help.skillEffectTitle")}</th></tr></thead>
            <tbody>{SKILLS.map(k => <tr key={k}><td><b>{t("skill." + k)}</b></td><td className="small">{t("help.skillHow." + k)}</td><td className="small muted">{t("help.skillEffect." + k)}</td></tr>)}</tbody></table>
        </div>
      </Card>
      <Card className="mt16">
        <Kicker color="var(--violet)">🛡️ {t("help.defense")}</Kicker>
        <p className="small" style={{ lineHeight: 1.7 }}>{t("help.defenseText", { tackle: keys.keyOf("tackle"), press: keys.keyOf("press") })}</p>
      </Card>
      <Card className="mt16">
        <Kicker color="var(--lime)">📊 {t("help.stats")}</Kicker>
        <p className="small muted mb8">{t("help.statsLead", { budget: STAT_BUDGET, min: STAT_MIN, max: STAT_MAX })}</p>
        <div style={{ overflowX: "auto" }}>
          <table className="table"><thead><tr><th>{t("help.action")}</th><th>🏟️ {t("help.statArena")}</th><th>🧪 {t("help.statManager")}</th></tr></thead>
            <tbody>{STAT_ROWS.map(([k, id]) => <tr key={k}><td><b>{attrName(k, lang)}</b></td><td className="small">{t("help.statA." + id)}</td><td className="small muted">{t("help.statM." + id)}</td></tr>)}</tbody></table>
        </div>
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
        <div className="grid g2">{[...SYNERGIES, { ...PLURI, match: [], min: 5 }].map(s => <div key={s.id} className="small"><b>{s[lang]}</b> — <span className="muted">{s.id === "pluri" ? t("help.pluri") : t("help.synergyRule", { n: s.min, list: s.match.map(w => domainWord(w, lang)).join(" / ") })}</span><div className="tiny" style={{ color: "var(--lime)" }}>{Object.entries(s.bonus).map(([k, v]) => `${attrName(k, lang)} +${v}`).join(" · ")}</div></div>)}</div>
      </Card>
      <Card className="mt16">
        <Kicker>❓ {t("help.faq")}</Kicker>
        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="mb16"><div style={{ fontWeight: 800 }}>{t(`help.q${i}`)}</div><div className="small muted" style={{ lineHeight: 1.6 }}>{t(`help.a${i}`, faq[i])}</div></div>)}
      </Card>
    </div>
  );
}
