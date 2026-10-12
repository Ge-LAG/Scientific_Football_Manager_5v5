import { useI18n } from "../../i18n/index.jsx";
import { useGame } from "../../game/GameProvider.jsx";
import { useToast, Card, Kicker, Avatar } from "../../ui/components.jsx";
import { getPlayer, STRATEGY_BY_ID } from "../../../shared/data/content.js";
import { ACHIEVEMENTS } from "../../../shared/progression.js";
import { TICKS_PER_MIN } from "../../../shared/manager/engine.js";
import { eventText } from "./MatchView.jsx";

// Courbe des buts attendus cumulés (xG) avec les buts marqués.
function XgChart({ r }) {
  const W = 900, H = 200, P = 34, dur = r.duration || 2400;
  const cols = [r.teams.home.colors[0], r.teams.away.colors[0]];
  const lines = [0, 1].map(side => { let acc = 0; const pts = [[0, 0]]; for (const [t, s, xg] of r.xgTimeline) if (s === side) { pts.push([t, acc]); acc += xg; pts.push([t, acc]); } pts.push([dur, acc]); return pts; });
  const maxY = Math.max(1, ...lines.map(l => l[l.length - 1][1]), r.teams.home.score, r.teams.away.score) * 1.1;
  const x = t => P + (t / dur) * (W - P * 2), y = v => H - P - (v / maxY) * (H - P * 1.6);
  const goals = r.events.filter(e => e.type === "GOAL");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="xG">
      {[0, 0.25, 0.5, 0.75, 1].map(f => <line key={f} x1={P} x2={W - P} y1={y(maxY * f / 1.1)} y2={y(maxY * f / 1.1)} stroke="rgba(255,255,255,.06)" />)}
      <line x1={x(dur / 2)} x2={x(dur / 2)} y1={P / 2} y2={H - P} stroke="rgba(255,255,255,.15)" strokeDasharray="4 4" />
      {[0, 10, 20, 30, 40].map(m => <text key={m} x={x((m / 40) * dur)} y={H - 10} fill="#8a93a6" fontSize="12" textAnchor="middle">{m}'</text>)}
      {lines.map((pts, i) => <polyline key={i} points={pts.map(([t, v]) => `${x(t)},${y(v)}`).join(" ")} fill="none" stroke={cols[i]} strokeWidth="2.5" style={{ filter: `drop-shadow(0 0 4px ${cols[i]})` }} />)}
      {lines.map((pts, i) => <text key={"l" + i} x={W - P + 4} y={y(pts[pts.length - 1][1]) + 4} fill={cols[i]} fontSize="13" fontWeight="700">{pts[pts.length - 1][1].toFixed(1)}</text>)}
      {goals.map((g, i) => { const side = g.side === "home" ? 0 : 1; const pts = lines[side]; let v = 0; for (const [t, val] of pts) if (t <= g.t) v = val; return <g key={i}><circle cx={x(g.t)} cy={y(v)} r="7" fill={cols[side]} stroke="#050508" strokeWidth="2" /><text x={x(g.t)} y={y(v) + 4} fontSize="9" textAnchor="middle">⚽</text></g>; })}
    </svg>
  );
}

export function ReportView({ report: msg, setup, me, navigate, onLeave }) {
  const { t, lang } = useI18n(); const game = useGame(); const toast = useToast();
  const r = msg.report; const H = r.teams.home, A = r.teams.away;
  const mySide = me === "spec" ? "home" : me; const oppSide = mySide === "home" ? "away" : "home";
  const my = r.teams[mySide], opp = r.teams[oppSide];
  const result = my.score > opp.score ? "W" : my.score < opp.score ? "L" : "D";
  const resColor = { W: "var(--lime)", L: "var(--coral)", D: "var(--gold)" }[result];
  const prog = msg.progression?.[mySide];
  const mvp = getPlayer(r.mvp);
  const goals = r.events.filter(e => e.type === "GOAL");
  const players = [...r.players].sort((a, b) => b.rating - a.rating);
  const stat = (k, fmt = v => v) => [fmt(H.stats[k] ?? 0), fmt(A.stats[k] ?? 0)];
  const rows = [["possession", stat("possession", v => v + "%")], ["xg", stat("xg")], ["shots", stat("shots")], ["onTarget", stat("onTarget")], ["passes", [`${H.stats.passesOk}/${H.stats.passes}`, `${A.stats.passesOk}/${A.stats.passes}`]], ["tackles", stat("tackles")], ["saves", stat("saves")], ["fouls", stat("fouls")], ["powerups", stat("powerups")], ["subs", stat("subs")]];

  // conseils du coach (repris et enrichis du prototype)
  const tips = [];
  for (const p of r.players.filter(x => x.side === mySide)) if (p.stamina < 35) tips.push(t("report.tipTired", { name: getPlayer(p.id).nom, n: p.stamina }));
  if (my.stats.shots > 6 && my.stats.onTarget / my.stats.shots < 0.4) tips.push(t("report.tipAccuracy"));
  if (my.stats.fouls > 3) tips.push(t("report.tipFouls"));
  if (my.stats.possession < 40) tips.push(t("report.tipPossession"));
  if (my.stats.powerups === 0) tips.push(t("report.tipPowerups"));
  if (my.stats.xg > my.score + 1.2) tips.push(t("report.tipUnlucky"));
  if (!tips.length) tips.push(t("report.tipGood"));

  const summary = t(result === "W" ? "report.sumWin" : result === "L" ? "report.sumLoss" : "report.sumDraw", { a: my.score, b: opp.score, team: my.name })
    + (goals.filter(g => g.side === mySide).length ? " " + t("report.sumScorers", { list: [...new Set(goals.filter(g => g.side === mySide).map(g => getPlayer(g.pid)?.nom))].join(", ") }) : "")
    + " " + t("report.sumStrategy", { strat: STRATEGY_BY_ID[my.strategy].nom[lang] });
  const share = () => { navigator.clipboard?.writeText(`Lab League 5v5 — ${H.name} ${H.score}-${A.score} ${A.name}\n${summary}`); toast(t("mr.copied"), "var(--lime)"); };

  return (
    <div>
      <Card elevated className="center mb16" style={{ padding: 28, borderColor: resColor }}>
        <div className="kicker" style={{ color: resColor, fontSize: 16 }}>{me === "spec" ? t("report.final") : t("report.result." + result)}</div>
        <div className="row" style={{ justifyContent: "center", gap: 24 }}>
          <span className="h2" style={{ color: H.colors[0], margin: 0 }}>{H.crest} {H.name}</span>
          <span className="num" style={{ fontSize: 60 }}>{H.score} – {A.score}</span>
          <span className="h2" style={{ color: A.colors[0], margin: 0 }}>{A.name} {A.crest}</span>
        </div>
        <p className="mt8" style={{ lineHeight: 1.6, maxWidth: 760, margin: "8px auto 0" }}>{summary}</p>
        {prog && (
          <div className="row mt16" style={{ justifyContent: "center" }}>
            <span className="chip" style={{ color: "var(--lime)" }}>+{prog.xpGained} XP</span>
            {prog.eloDelta !== 0 && <span className="chip" style={{ color: prog.eloDelta > 0 ? "var(--lime)" : "var(--coral)" }}>ELO {prog.eloDelta > 0 ? "+" : ""}{prog.eloDelta}</span>}
            <span className="chip" style={{ color: "var(--gold)" }}>🎓 {prog.grade[lang]}{prog.gradeUp ? " ⬆" : ""}</span>
            {prog.newAchievements.map(id => { const a = ACHIEVEMENTS.find(x => x.id === id); return a && <span key={id} className="chip" style={{ color: "var(--magenta)" }}>{a.icon} {a[lang].name}</span>; })}
          </div>
        )}
        {!prog && me !== "spec" && game.joined?.kind === "local" && <p className="tiny muted mt8">{t("report.soloNoXp")}</p>}
      </Card>
      <div className="grid g2 split">
        <Card>
          <Kicker>📊 {t("report.stats")}</Kicker>
          {rows.map(([k, [h, a]]) => <div key={k} className="row between nowrap" style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}><span className="num" style={{ color: H.colors[0] }}>{h}</span><span className="small muted">{t("report.s." + k)}</span><span className="num" style={{ color: A.colors[0] }}>{a}</span></div>)}
        </Card>
        <Card>
          <Kicker color="var(--gold)">⭐ {t("report.ratings")}</Kicker>
          {mvp && <div className="row nowrap mb16" style={{ padding: 10, borderRadius: 12, background: "rgba(255,215,0,.08)", border: "1px solid rgba(255,215,0,.3)" }}><Avatar player={mvp} size={46} /><div><div className="tiny" style={{ color: "var(--gold)", fontWeight: 800 }}>🏆 {t("report.mvp")}</div><div style={{ fontWeight: 800 }}>{mvp.nom}</div></div></div>}
          <div className="grid g2" style={{ gap: 6 }}>
            {players.map(p => { const pl = getPlayer(p.id); const team = r.teams[p.side]; return (
              <div key={p.id} className="row nowrap small"><span className="dot" style={{ background: team.colors[0] }} /><span className="grow" style={{ fontWeight: 700 }}>{pl.nom}</span><span className="tiny muted">{p.stats.goals ? `⚽${p.stats.goals} ` : ""}{p.stats.assists ? `🅰️${p.stats.assists} ` : ""}{p.stats.saves ? `🧤${p.stats.saves}` : ""}</span><span className="num" style={{ color: p.rating >= 7.5 ? "var(--lime)" : p.rating >= 6 ? "var(--cyan)" : "var(--coral)" }}>{p.rating.toFixed(1)}</span></div>); })}
          </div>
        </Card>
        {r.xgTimeline?.length > 0 && (
          <Card style={{ gridColumn: "1 / -1" }}>
            <Kicker color="var(--cyan)">📈 {t("report.xgChart")}</Kicker>
            <XgChart r={r} />
            <p className="tiny muted mt8">{t("report.xgHelp")}</p>
          </Card>
        )}
        <Card>
          <Kicker color="var(--lime)">⏱️ {t("report.highlights")}</Kicker>
          <div className="feed" style={{ maxHeight: 260 }}>
            {r.events.filter(e => ["GOAL", "POWERUP", "RED", "PENALTY", "SUB"].includes(e.type)).map((e, i) => <div key={i} className="feed-item" style={{ borderLeftColor: e.type === "GOAL" ? "var(--lime)" : "var(--gold)" }}><div className="meta"><span>{t("evtype." + e.type)}</span><span className="muted">{Math.floor(e.t / TICKS_PER_MIN * (2400 / (r.duration || 2400)))}'</span></div>{eventText(e, t, lang)}</div>)}
          </div>
        </Card>
        <Card>
          <Kicker color="var(--gold)">🧠 {t("report.coach")}</Kicker>
          {tips.map((x, i) => <p key={i} className="small mb8" style={{ lineHeight: 1.5 }}>{x}</p>)}
        </Card>
      </div>
      <div className="row mt16">
        {!game.room?.opts?.season && <button className="btn primary" onClick={() => { const kind = game.joined?.kind; onLeave(); if (kind === "local") setTimeout(() => game.create("local", "manager", { bot: setup.away.bot || setup.home.bot || "chercheur", autostart: true }), 50); }}>🔄 {t("report.again")}</button>}
        {game.room?.opts?.season && <button className="btn gold" onClick={() => { onLeave(); navigate("/manager/season"); }}>🏆 {t("season.backToSeason")}</button>}
        <button className="btn ghost" onClick={share}>📋 {t("report.copy")}</button>
        <button className="btn ghost" onClick={() => { onLeave(); navigate("/"); }}>🏠 {t("report.home")}</button>
      </div>
    </div>
  );
}
