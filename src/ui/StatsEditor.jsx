// Répartition libre des points de caractéristiques d'un scientifique (même budget pour tous).
// Enregistrement automatique dès que tous les points sont répartis ; préréglages par poste ; écart au profil d'origine.
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/index.jsx";
import { RadarChart } from "./components.jsx";
import { getPlayer, attrName } from "../../shared/data/content.js";
import { STAT_KEYS, STAT_BUDGET, STAT_MIN, STAT_MAX, fitToBudget, isValidStats, statsTotal, cleanStats } from "../../shared/data/stats.js";

// poids des préréglages par poste (appliqués puis ramenés au budget)
const ROLE_WEIGHTS = {
  att: { Finition: 1.35, Vitesse: 1.2, Dribble: 1.15, "Sang-froid": 1.05, Force: 0.95, Vision: 0.95, Endurance: 0.95, Tacle: 0.6, "Réflexes": 0.5 },
  mid: { Vision: 1.35, Dribble: 1.15, Endurance: 1.15, Tacle: 1, "Sang-froid": 1, Vitesse: 1, Finition: 0.9, Force: 0.85, "Réflexes": 0.6 },
  def: { Tacle: 1.4, Force: 1.2, "Sang-froid": 1.1, Endurance: 1.05, Vitesse: 0.95, Vision: 0.95, Dribble: 0.8, Finition: 0.6, "Réflexes": 0.7 },
  gk: { "Réflexes": 1.5, "Sang-froid": 1.2, Force: 1.1, Vision: 0.95, Tacle: 0.9, Endurance: 0.9, Vitesse: 0.85, Dribble: 0.75, Finition: 0.6 },
};
const toObj = arr => Object.fromEntries(STAT_KEYS.map((k, i) => [k, arr[i]]));
export const rolePreset = role => toObj(fitToBudget(STAT_KEYS.map(k => (ROLE_WEIGHTS[role][k] || 1) * 68)));

export function StatsEditor({ charId, value, onChange }) {
  const { t, lang } = useI18n();
  const p = getPlayer(charId);
  const def = p.attributs;
  const saved = cleanStats(value); // répartition enregistrée revalidée (sinon profil d'origine, comme le serveur)
  const savedKey = JSON.stringify(saved);
  const [draft, setDraft] = useState(() => ({ ...(saved || def) }));
  useEffect(() => { setDraft({ ...(saved || def) }); }, [charId, savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = STAT_BUDGET - statsTotal(draft);
  const custom = !!saved;
  // enregistré dès que la répartition est complète et valide
  const commit = next => { setDraft(next); if (isValidStats(next)) onChange(next); };
  const set = (k, v) => {
    const cur = draft[k]; const max = Math.min(STAT_MAX, cur + Math.max(0, STAT_BUDGET - statsTotal(draft)));
    commit({ ...draft, [k]: Math.max(STAT_MIN, Math.min(max, Math.round(v))) });
  };
  const spread = () => { // répartit les points restants sur les caractéristiques les plus basses
    const n = { ...draft }; let r = left;
    for (let i = 0; r > 0 && i < 400; i++) { const k = STAT_KEYS.filter(x => n[x] < STAT_MAX).sort((a, b) => n[a] - n[b])[0]; if (!k) break; n[k]++; r--; }
    commit(n);
  };
  const preview = useMemo(() => ({ ...p, attributs: draft }), [p, draft]);
  return (
    <div className="stats-editor">
      <div className="row between mb8">
        <div className={"stat-budget" + (left === 0 ? " ok" : left < 0 ? " over" : "")}>
          {left === 0 ? `✓ ${t("stats.complete", { n: STAT_BUDGET })}` : `${t("stats.left", { n: left })} · ${t("stats.unsaved")}`}
        </div>
        <span className="tiny muted">{custom ? "✎ " + t("stats.custom") : "★ " + t("stats.default")}</span>
      </div>
      <div className="row mb8" style={{ gap: 4, flexWrap: "wrap" }}>
        <button type="button" className="btn small ghost" onClick={() => { setDraft({ ...def }); onChange(null); }}>★ {t("stats.presetDefault")}</button>
        {["att", "mid", "def", "gk"].map(r => <button key={r} type="button" className="btn small ghost" onClick={() => commit(rolePreset(r))}>{t("role." + r)}</button>)}
        <button type="button" className="btn small ghost" onClick={() => commit(toObj(fitToBudget(STAT_KEYS.map(() => 68))))}>⚖️ {t("stats.presetBalanced")}</button>
        {left > 0 && <button type="button" className="btn small gold" onClick={spread}>➕ {t("stats.spread")}</button>}
      </div>
      <div className="stat-rows">
        {STAT_KEYS.map(k => {
          const v = draft[k], d = v - def[k];
          return (
            <div key={k} className="stat-row">
              <label htmlFor={"st-" + k} className="stat-name">{attrName(k, lang)}</label>
              <button type="button" className="stat-step" aria-label={t("stats.minus", { stat: attrName(k, lang) })} onClick={e => set(k, v - (e.shiftKey ? 5 : 1))} disabled={v <= STAT_MIN}>−</button>
              <input id={"st-" + k} className="range" type="range" min={STAT_MIN} max={STAT_MAX} step="1" value={v} onChange={e => set(k, +e.target.value)} style={{ "--pct": `${((v - STAT_MIN) / (STAT_MAX - STAT_MIN)) * 100}%` }} />
              <button type="button" className="stat-step" aria-label={t("stats.plus", { stat: attrName(k, lang) })} onClick={e => set(k, v + (e.shiftKey ? 5 : 1))} disabled={v >= STAT_MAX || left <= 0}>+</button>
              <span className="num stat-val">{v}</span>
              <span className={"tiny stat-delta" + (d > 0 ? " up" : d < 0 ? " down" : "")}>{d > 0 ? `+${d}` : d < 0 ? d : "·"}</span>
            </div>
          );
        })}
      </div>
      <p className="tiny muted mt8">{t("stats.help", { budget: STAT_BUDGET, min: STAT_MIN, max: STAT_MAX })}</p>
      <div className="center"><RadarChart player={preview} color={p.color} size={210} compare={custom || statsTotal(draft) !== statsTotal(def) || STAT_KEYS.some(k => draft[k] !== def[k]) ? p : null} /></div>
    </div>
  );
}
