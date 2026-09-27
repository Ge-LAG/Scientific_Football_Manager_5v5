import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/index.jsx";
import { useGame } from "../../game/GameProvider.jsx";
import { useSession } from "../../store/session.jsx";
import { Card, Kicker, Avatar, Crest } from "../../ui/components.jsx";
import { LoadoutPicker } from "../../ui/LoadoutPicker.jsx";
import { getPlayer, pText, FORMATIONS, STRATEGIES, attrName, keeperRating, sanitizeLoadout } from "../../../shared/data/content.js";
import { activeSynergies } from "../../../shared/data/enrichment.js";
import { autoLineup } from "../../../shared/manager/ai.js";

export function SetupView({ room }) {
  const { t, lang } = useI18n(); const game = useGame(); const { club, setLoadout } = useSession();
  const me = room.you.seat; const seat = me !== "spec" ? room.seats[me] : null; const opp = room.seats[me === "home" ? "away" : "home"];
  // on reprend l'état connu du serveur (reconnexion) ; la formation préférée du club ne s'applique qu'avant toute synchronisation
  const useClub = !!seat && !seat.ready && seat.formation === "2-2" && (club.formation || "2-2") !== "2-2";
  const [formation, setFormation] = useState(useClub ? club.formation : seat?.formation || "2-2");
  const [lineup, setLineup] = useState(() => (!seat ? [] : useClub ? autoLineup(seat.picks, club.formation).lineup : seat.lineup));
  const syncTimer = useRef(null);
  const [strategy, setStrategy] = useState(club.strategy || seat?.strategy || "equilibre");
  const [sel, setSel] = useState(null);
  const [loadouts, setLoadouts] = useState(() => ({ ...(seat?.loadouts || {}) }));
  const [puOpen, setPuOpen] = useState(null); // scientifique dont on règle les power-ups
  const chooseLoadout = (id, ids) => { const v = sanitizeLoadout(id, ids); setLoadouts(l => ({ ...l, [id]: v })); setLoadout(id, v); game.send({ t: "m.loadout", id, ids: v }); };
  const [left, setLeft] = useState(Math.ceil(room.setupRemainingMs / 1000));
  useEffect(() => { const h = setInterval(() => setLeft(x => Math.max(0, x - 1)), 1000); return () => clearInterval(h); }, []);
  const syn = useMemo(() => activeSynergies(lineup.map(getPlayer)), [lineup]);
  // chaque modification est transmise (sans valider) : si le temps expire, c'est cette composition qui joue
  useEffect(() => { if (seat && !seat.ready && lineup.length === 5) { syncTimer.current = setTimeout(() => game.send({ t: "m.setup", lineup, formation, strategy, ready: false }), 300); return () => clearTimeout(syncTimer.current); } }, [lineup, formation, strategy]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!seat) return <Card className="center"><p className="muted" style={{ animation: "pulse 2s infinite" }}>👁️ {t("setup.spectating")}</p></Card>;
  const bench = seat.picks.filter(id => !lineup.includes(id));
  const roles = FORMATIONS[formation].roles;
  // échange : clic sur un titulaire puis sur un remplaçant (ou un autre titulaire)
  const click = id => {
    if (!sel) return setSel(id);
    if (sel === id) return setSel(null);
    const L = [...lineup]; const a = L.indexOf(sel), b = L.indexOf(id);
    if (a >= 0 && b >= 0) { [L[a], L[b]] = [L[b], L[a]]; } else if (a >= 0) L[a] = id; else if (b >= 0) L[b] = sel;
    setLineup(L); setSel(null);
  };
  const submit = ready => { clearTimeout(syncTimer.current); game.send({ t: "m.setup", lineup, formation, strategy, ready }); };
  const pos = FORMATIONS[formation].positions;
  return (
    <div className="grid split" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
      <Card elevated>
        <div className="row between mb8"><Kicker>{t("setup.title")}</Kicker><span className="num" style={{ color: left < 10 ? "var(--coral)" : "var(--muted)" }}>⏱ {left}s</span></div>
        <div className="pitch-wrap" style={{ aspectRatio: "5 / 3", position: "relative", background: "linear-gradient(90deg,#04200f,#073018,#04200f)" }}>
          <div style={{ position: "absolute", inset: "4%", border: "2px solid rgba(220,255,255,.35)", borderRadius: 4 }} />
          <div style={{ position: "absolute", left: "50%", top: "4%", bottom: "4%", width: 2, background: "rgba(220,255,255,.25)" }} />
          {lineup.map((id, i) => { const p = getPlayer(id); const fp = pos[i]; return (
            <button key={id} onClick={() => click(id)} style={{ position: "absolute", left: `${6 + fp.x * 0.88}%`, top: `${4 + fp.y * 0.92}%`, transform: "translate(-50%,-50%)", background: "none", border: 0, cursor: "pointer", textAlign: "center", outline: sel === id ? "2px solid var(--gold)" : "none", borderRadius: 30, padding: 4 }}>
              <Avatar player={p} size={46} ring={i === 0 ? "#FFD700" : undefined} />
              <div className="tiny" style={{ fontWeight: 800, textShadow: "0 1px 3px #000" }}>{p.nom}</div>
              <div className="tiny" style={{ color: "var(--gold)" }}>{t("role." + roles[i])}</div>
            </button>); })}
        </div>
        <p className="tiny muted mt8">{t("setup.swapHelp")}</p>
        <Kicker>{t("setup.bench")}</Kicker>
        <div className="row">{bench.map(id => { const p = getPlayer(id); return <button key={id} onClick={() => click(id)} className="card tight row nowrap" style={{ cursor: "pointer", borderColor: sel === id ? "var(--gold)" : undefined }}><Avatar player={p} size={30} showNum={false} /><span className="small" style={{ fontWeight: 700 }}>{p.nom}</span><span className="tiny muted">{pText(p, lang).poste}</span></button>; })}</div>
      </Card>
      <div className="col" style={{ gap: 16 }}>
        <Card>
          <Kicker>{t("club.formation")}</Kicker>
          <div className="row">{Object.entries(FORMATIONS).map(([k, f]) => <button key={k} className={"btn small " + (formation === k ? "primary" : "ghost")} onClick={() => { setFormation(k); setLineup(autoLineup(lineup, k).lineup.length === 5 ? autoLineup(lineup, k).lineup : lineup); }}>{f.label[lang]}</button>)}</div>
          <button className="linkbtn mt8" onClick={() => setLineup(autoLineup(seat.picks, formation).lineup)}>✨ {t("setup.auto")}</button>
        </Card>
        <Card>
          <Kicker color="var(--magenta)">⚡ {t("setup.loadouts")}</Kicker>
          <p className="tiny muted mb8">{t("setup.loadoutsHelp")}</p>
          <div className="col" style={{ gap: 6 }}>
            {[...lineup, ...bench].map(id => { const p = getPlayer(id); const open = puOpen === id; const lo = sanitizeLoadout(id, loadouts[id]);
              return (
                <div key={id} className={"lo-row" + (open ? " open" : "")}>
                  <button type="button" className="lo-head" aria-expanded={open} onClick={() => setPuOpen(open ? null : id)}>
                    <Avatar player={p} size={26} showNum={false} /><b className="grow" style={{ textAlign: "left" }}>{p.nom}</b>
                    <span className="tiny muted" style={{ textAlign: "right" }}>{lo.map(x => p.powerUps.findIndex(u => u.id === x) + 1).map(n => "⚡" + n).join(" ")}</span><span aria-hidden="true">{open ? "▴" : "▾"}</span>
                  </button>
                  {open && <LoadoutPicker charId={id} value={lo} mode="manager" onChange={ids => chooseLoadout(id, ids)} />}
                </div>
              ); })}
          </div>
        </Card>
        <Card>
          <Kicker color="var(--gold)">{t("setup.strategy")}</Kicker>
          <div className="grid g2" style={{ gap: 8 }}>{STRATEGIES.map(s => <button key={s.id} className={"strat-btn" + (strategy === s.id ? " on" : "")} onClick={() => setStrategy(s.id)} title={s.desc[lang]}>{s.icon} {s.nom[lang]}</button>)}</div>
          <p className="tiny muted mt8" style={{ lineHeight: 1.5 }}>{STRATEGIES.find(s => s.id === strategy).desc[lang]}</p>
        </Card>
        <Card>
          <Kicker color="var(--lime)">🔗 {t("setup.synergies")}</Kicker>
          {syn.length ? syn.map(s => <div key={s.id} className="small mb8"><b>{s[lang]}</b> <span className="muted">{Object.entries(s.bonus).map(([k, v]) => `${attrName(k, lang)} +${v}`).join(", ")}</span></div>) : <p className="tiny muted">{t("setup.noSynergy")}</p>}
          <div className="small muted">🧤 {t("setup.keeper")} : <b>{getPlayer(lineup[0])?.nom}</b> ({keeperRating(getPlayer(lineup[0]))})</div>
        </Card>
        <Card>
          <div className="row nowrap mb8"><Crest club={opp.club} size={36} /><div className="small">{t("setup.opponent")} : <b>{opp.club.name}</b> {opp.ready && <span style={{ color: "var(--lime)" }}>✓ {t("setup.ready")}</span>}</div></div>
          {seat.ready ? <button className="btn ghost block" onClick={() => submit(false)}>✓ {t("setup.waiting")}</button>
            : <button className="btn lime block big" onClick={() => submit(true)}>⚽ {t("setup.go")}</button>}
        </Card>
      </div>
    </div>
  );
}
