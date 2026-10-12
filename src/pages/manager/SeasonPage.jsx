// Championnat du Labo (solo) : classement, calendrier, prochain adversaire. Sauvegardé sur l'appareil.
import { useState } from "react";
import { useI18n } from "../../i18n/index.jsx";
import { useSession } from "../../store/session.jsx";
import { useGame } from "../../game/GameProvider.jsx";
import { Card, Kicker, Crest } from "../../ui/components.jsx";
import { newSeason, nextFixture, standings, clubOf, ME } from "../../../shared/manager/season.js";
import { DIFFICULTIES } from "../../../shared/manager/ai.js";

export const loadSeason = () => { try { return JSON.parse(localStorage.getItem("ll.season") || "null"); } catch { return null; } };
export const saveSeason = s => { try { if (s) localStorage.setItem("ll.season", JSON.stringify(s)); else localStorage.removeItem("ll.season"); } catch { /* stockage indisponible */ } };

export default function SeasonPage({ navigate }) {
  const { t, lang } = useI18n(); const { club } = useSession(); const game = useGame();
  const [season, setSeason] = useState(loadSeason);
  const start = () => { const s = newSeason(); saveSeason(s); setSeason(s); };
  const name = id => (id === ME ? club.name : clubOf(id).name);
  const crestOf = id => (id === ME ? club : clubOf(id));
  const fx = season && nextFixture(season);
  const play = () => {
    const opp = clubOf(fx.opponent);
    game.create("local", "manager", { bot: opp.level, autostart: true, speed: 1, botClub: { name: opp.name, crest: opp.crest, colors: opp.colors }, season: { id: season.id, day: season.day } });
  };
  const table = season ? standings(season) : [];
  const champion = season?.done && table[0];
  return (
    <div className="page mid">
      <button className="linkbtn mb16" onClick={() => navigate("/manager")}>← {t("season.back")}</button>
      <h1 className="h1">🏆 {t("season.title")}</h1>
      <p className="lead">{t("season.lead")}</p>
      {!season ? (
        <Card elevated className="center"><p className="mb16">{t("season.intro")}</p><button className="btn primary big" onClick={start}>▶ {t("season.start")}</button></Card>
      ) : (
        <div className="grid g2 split">
          <div className="col" style={{ gap: 16 }}>
            {champion ? (
              <Card elevated className="center" style={{ borderColor: "var(--gold)" }}>
                <div style={{ fontSize: 56 }}>{champion.id === ME ? "🏆" : "🥈"}</div>
                <div className="h2">{champion.id === ME ? t("season.champion") : t("season.championOther", { name: name(champion.id) })}</div>
                <button className="btn gold mt16" onClick={start}>🔄 {t("season.again")}</button>
              </Card>
            ) : fx && (
              <Card elevated>
                <Kicker>{t("season.matchday", { n: season.day + 1, total: season.days.length })}</Kicker>
                <div className="row nowrap" style={{ justifyContent: "space-around", margin: "12px 0" }}>
                  <div className="center"><Crest club={crestOf(fx.home ? ME : fx.opponent)} size={56} /><div className="small mt8" style={{ fontWeight: 800 }}>{name(fx.home ? ME : fx.opponent)}</div></div>
                  <div className="h2">VS</div>
                  <div className="center"><Crest club={crestOf(fx.home ? fx.opponent : ME)} size={56} /><div className="small mt8" style={{ fontWeight: 800 }}>{name(fx.home ? fx.opponent : ME)}</div></div>
                </div>
                <p className="small muted center mb16">{t("season.level", { level: DIFFICULTIES[clubOf(fx.opponent).level][lang] })}</p>
                <button className="btn primary block big" onClick={play}>⚽ {t("season.play")}</button>
              </Card>
            )}
            <Card>
              <Kicker color="var(--lime)">📅 {t("season.results")}</Kicker>
              {season.results.length === 0 ? <p className="small muted">{t("season.noResults")}</p> :
                [...season.results].reverse().slice(0, 15).map((r, i) => (
                  <div key={i} className="row between small mb8" style={{ fontWeight: r.home === ME || r.away === ME ? 800 : 400, opacity: r.home === ME || r.away === ME ? 1 : 0.7 }}>
                    <span className="tiny muted">J{r.day + 1}</span><span className="grow">{name(r.home)}</span><span className="num">{r.score[0]} – {r.score[1]}</span><span className="grow right">{name(r.away)}</span>
                  </div>))}
            </Card>
          </div>
          <Card>
            <Kicker color="var(--gold)">📊 {t("season.table")}</Kicker>
            <table className="table">
              <thead><tr><th>#</th><th>{t("season.club")}</th><th>{t("season.pts")}</th><th>{t("profile.played")}</th><th>{t("profile.wdl")}</th><th>{t("season.diff")}</th></tr></thead>
              <tbody>{table.map((r, i) => (
                <tr key={r.id} className={r.id === ME ? "me" : ""}>
                  <td className="num">{i + 1}</td>
                  <td><span style={{ marginRight: 6 }}>{crestOf(r.id).crest}</span>{name(r.id)}</td>
                  <td className="num" style={{ color: "var(--cyan)" }}>{r.pts}</td><td className="num">{r.p}</td><td className="num small">{r.w}-{r.d}-{r.l}</td><td className="num small">{r.diff > 0 ? "+" : ""}{r.diff}</td>
                </tr>))}</tbody>
            </table>
            <button className="linkbtn mt16" onClick={() => { if (confirm(t("season.resetConfirm"))) { saveSeason(null); setSeason(null); } }}>{t("season.reset")}</button>
          </Card>
        </div>
      )}
    </div>
  );
}
