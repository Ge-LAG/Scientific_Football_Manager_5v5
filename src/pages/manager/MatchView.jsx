import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/index.jsx";
import { useSession, useConnMessages } from "../../store/session.jsx";
import { useGame } from "../../game/GameProvider.jsx";
import { Card, Kicker, Crest, Avatar } from "../../ui/components.jsx";
import { createPitchRenderer } from "../../render2d/pitch.js";
import { createSfx } from "../../audio/sfx.js";
import { getPlayer, getPowerUp, defaultLoadout, narrText, puText, STRATEGIES, STRATEGY_BY_ID, pText, attrName, TEAM_TALKS, TEAM_TALK_BY_ID } from "../../../shared/data/content.js";
import { CamBar } from "../../ui/CamBar.jsx";
import { matchupFactor, TICKS_PER_MIN } from "../../../shared/manager/engine.js";
import { bestResponse } from "../../../shared/manager/ai.js";
import { useToast } from "../../ui/components.jsx";
import { ReportView } from "./ReportView.jsx";
import { reloadOnChunkError } from "../../net/reload.js";
import { speak, stopSpeaking } from "../../audio/voice.js";

const EV_COLORS = { GOAL: "var(--lime)", MISS: "var(--coral)", SAVE: "var(--cyan)", TACKLE: "var(--violet)", INTERCEPT: "var(--violet)", FOUL: "var(--coral)", YELLOW: "var(--gold)", RED: "var(--coral)", DRIBBLE: "var(--magenta)", PASS: "var(--muted)", POWERUP: "var(--gold)", SUB: "var(--cyan)", STRATEGY: "var(--gold)", POST: "var(--coral)", PENALTY: "var(--gold)", BLOCK: "var(--violet)" };
const SHOWN = new Set(["TALK", "GOAL", "MISS", "SAVE", "TACKLE", "INTERCEPT", "FOUL", "YELLOW", "RED", "DRIBBLE", "PASS", "POWERUP", "SUB", "STRATEGY", "POST", "PENALTY", "BLOCK", "HALFTIME", "SECOND_HALF", "END", "RETURN"]);

export function eventText(ev, t, lang) {
  const p = ev.pid ? getPlayer(ev.pid) : null; const p2 = ev.pid2 ? getPlayer(ev.pid2) : null;
  if (ev.n) return narrText(ev.n, { joueur: p?.nom || "", pu: ev.pu ? puText(getPowerUp(ev.pu) || getPlayer(ev.pid).powerUp, lang).nom : "" }, lang) + (ev.type === "GOAL" && p2 ? ` (${t("ev.assist", { name: p2.nom })})` : "");
  switch (ev.type) {
    case "SUB": return t("ev.sub", { in: p?.nom, out: p2?.nom });
    case "STRATEGY": return t("ev.strategy", { strat: STRATEGY_BY_ID[ev.strat]?.nom[lang] });
    case "YELLOW": return t("ev.yellow", { name: p?.nom });
    case "RED": return t("ev.red", { name: p?.nom });
    case "PENALTY": return t("ev.penalty", { name: p?.nom });
    case "POST": return t("ev.post", { name: p?.nom });
    case "BLOCK": return t("ev.block", { name: p2?.nom });
    case "RETURN": return t("ev.return", { name: p?.nom });
    case "TALK": return t("ev.talk", { talk: TEAM_TALK_BY_ID[ev.talk]?.nom[lang] || ev.talk });
    case "HALFTIME": return t("ev.halftime");
    case "SECOND_HALF": return t("ev.secondHalf");
    case "END": return t("ev.end");
    default: return `${p?.nom || ""} — ${ev.type}`;
  }
}

export function MatchView({ room, init, report, navigate, onLeave }) {
  const { t, lang } = useI18n(); const { conn, settings, setSettings } = useSession(); const game = useGame();
  const view3d = settings.managerView === "3d" && room.phase !== "ended";
  const toast = useToast();
  const box3dRef = useRef(null); const v3Ref = useRef(null); const adapterRef = useRef(null);
  const me = room.you.seat; const setup = init.setup;
  const canvasRef = useRef(null); const rendRef = useRef(null); const sfxRef = useRef(null);
  const [snap, setSnap] = useState(null);
  const [feed, setFeed] = useState(() => init.events.filter(e => SHOWN.has(e.type)));
  const [banner, setBanner] = useState(null);
  const [subOut, setSubOut] = useState(null);
  const [cam, setCam] = useState(settings.specCam || "auto"); const [follow, setFollow] = useState(-1); const [slots3d, setSlots3d] = useState([]);
  const [fs, setFs] = useState(false); const wrapRef = useRef(null);
  const chooseCam = m => { setCam(m); v3Ref.current?.setCam(m); setSettings({ specCam: m }); if (m !== "player") setFollow(-1); };
  const chooseFollow = s => { setFollow(s); v3Ref.current?.setFollow(s); if (s >= 0) setCam("player"); };
  useEffect(() => { const f = () => setFs(document.fullscreenElement === wrapRef.current); document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else wrapRef.current?.requestFullscreen?.().catch(() => {}); };
  const lastUi = useRef(0); const lastScore = useRef("0-0");

  const meta = useMemo(() => {
    const m = {};
    for (const side of ["home", "away"]) m[side] = { ...setup[side], ids: new Set([...setup[side].lineup, ...setup[side].bench]), keeper: setup[side].lineup[0] };
    return m;
  }, [setup]);

  useEffect(() => {
    // salle déjà terminée (rechargement pendant le rapport) : pas de vue tactique à créer
    if (canvasRef.current) { rendRef.current = createPitchRenderer(canvasRef.current); rendRef.current.setMeta(meta); }
    sfxRef.current = createSfx(); sfxRef.current.setVolume(settings.volume); if (room.phase !== "ended") sfxRef.current.whistle("start");
    const unlock = () => sfxRef.current?.unlock(); window.addEventListener("pointerdown", unlock, { once: true });
    return () => { rendRef.current?.destroy(); sfxRef.current?.dispose(); window.removeEventListener("pointerdown", unlock); stopSpeaking(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { rendRef.current?.setMeta(meta); }, [meta]);
  // vue Stade 3D (chargée à la demande) : le match Manager rejoué dans l'arène vitrée
  useEffect(() => {
    if (!view3d || room.phase === "ended") return;
    let cancelled = false;
    Promise.all([import("../../three/arenaView.js"), import("../../three/managerAdapter.js")]).catch(reloadOnChunkError).then(([{ createArenaView }, { createManagerAdapter }]) => {
      if (cancelled || !box3dRef.current) return;
      adapterRef.current = createManagerAdapter(setup);
      const teams = [{ name: setup.home.name, color: setup.home.colors[0] }, { name: setup.away.name, color: setup.away.colors[0] }];
      const side = i => (i < 5 ? "home" : "away");
      const slots = [...setup.home.lineup, ...setup.away.lineup].map((charId, i) => ({ slot: i, team: i < 5 ? 0 : 1, charId, look: setup[side(i)].looks?.[charId] || null, loadout: setup[side(i)].loadouts?.[charId] || null }));
      setSlots3d(slots);
      v3Ref.current = createArenaView(box3dRef.current, { slots, teams, mySlot: null, settings: { ...settings, sensitivity: 1, specCam: cam }, interactive: false, replays: false, onInput: () => {} });
      if (follow >= 0) v3Ref.current.setFollow(follow);
    });
    return () => { cancelled = true; v3Ref.current?.dispose(); v3Ref.current = null; adapterRef.current = null; };
  }, [view3d, room.phase === "ended"]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sfxRef.current?.setVolume(settings.volume); }, [settings.volume]);

  useConnMessages(conn, m => {
    if (m.t !== "m.snap") return;
    const s = m.s;
    // les compositions évoluent (remplacements, exclusions)
    for (const side of ["home", "away"]) { meta[side].keeper = s.teams[side].lineup[0]; for (const id of s.teams[side].lineup) meta[side].ids.add(id); }
    rendRef.current?.push(s, 100 / (room.opts.speed || 1));
    if (v3Ref.current && adapterRef.current) { const r = adapterRef.current.convert(s, m.ev, 0.1 / (room.opts.speed || 1)); if (r.changed) { v3Ref.current.setSlots(r.slots); setSlots3d(r.slots); } v3Ref.current.pushSnapshot(r.snap, r.events); }
    if (m.ev?.length) {
      for (const ev of m.ev) {
        rendRef.current?.fx(ev);
        const sfx = sfxRef.current;
        if (settings.voice !== false && (ev.type === "GOAL" || ((ev.type === "SAVE" || ev.type === "POWERUP" || ev.type === "RED") && ev.n && Math.random() < 0.5))) speak(eventText(ev, t, lang), lang, true);
        if (ev.type === "GOAL") { sfx?.goal(); setBanner({ side: ev.side, pid: ev.pid, at: Date.now() }); setTimeout(() => setBanner(null), 2600); }
        else if (ev.type === "SAVE") sfx?.save(); else if (ev.type === "TACKLE") sfx?.tackle(); else if (ev.type === "POWERUP") sfx?.powerUp();
        else if (ev.type === "FOUL" || ev.type === "YELLOW" || ev.type === "RED") sfx?.whistle("foul"); else if (ev.type === "HALFTIME" || ev.type === "END") sfx?.whistle("end");
        else if (ev.type === "MISS" || ev.type === "POST") sfx?.kick(0.8);
        // conseil tactique : l'adversaire change de stratégie → meilleure réponse selon la matrice
        if (ev.type === "STRATEGY" && me !== "spec" && ev.side !== me && settings.hints !== false) {
          const br = STRATEGY_BY_ID[bestResponse(ev.strat)];
          toast(t("mr.hint", { opp: STRATEGY_BY_ID[ev.strat].nom[lang], best: `${br.icon} ${br.nom[lang]}` }), "var(--gold)", 5000);
        }
      }
      const shown = m.ev.filter(e => SHOWN.has(e.type));
      if (shown.length) setFeed(f => [...f, ...shown].slice(-80));
    }
    const now = performance.now();
    if (now - lastUi.current > 180 || s.phase !== snap?.phase) { lastUi.current = now; setSnap(s); sfxRef.current?.crowd(0.25 + Math.min(0.5, Math.abs(s.ball.x - 50) / 100)); }
    lastScore.current = s.score.join("-");
  });

  // raccourcis : 1–6 = stratégies, Espace = pause (solo)
  useEffect(() => {
    const onKey = e => {
      if (e.repeat || e.target?.tagName === "INPUT" || e.target?.tagName === "SELECT" || room.phase !== "playing") return;
      if (e.code === "KeyC" && v3Ref.current) { const L = ["auto", "tv", "tactical", "goal", "ball", "player", "free"]; setCam(c => { const n = L[(L.indexOf(c) + 1) % L.length]; v3Ref.current?.setCam(n); return n; }); return; }
      if (me === "spec") return;
      const n = +(/^(Digit|Numpad)(\d)$/.exec(e.code)?.[2] || 0); if (n >= 1 && n <= STRATEGIES.length) game.send({ t: "m.cmd", cmd: { type: "strategy", id: STRATEGIES[n - 1].id } });
      if (e.code === "Space" && (room.seats.home.bot || room.seats.away.bot)) { e.preventDefault(); game.send({ t: "m.pause", paused: !room.paused }); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [room.phase, room.paused, me]); // eslint-disable-line react-hooks/exhaustive-deps

  // coup d'envoi : recadrer sur le score et le terrain (le bouton « Prêt » était souvent en bas de page)
  // et placer le focus sur la zone du match pour que Tab reparte de là
  const topRef = useRef(null);
  useEffect(() => {
    const el = topRef.current; if (!el || room.phase !== "playing") return;
    const hdr = document.querySelector(".header")?.getBoundingClientRect().height || 0;
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - hdr - 8), behavior: "auto" });
    el.focus({ preventScroll: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const feedRef = useRef(null);
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [feed]);

  const s = snap; const ended = room.phase === "ended";
  const myTeam = me !== "spec" ? s?.teams?.[me] : null;
  const oppSide = me === "home" ? "away" : "home";
  const cmd = c => game.send({ t: "m.cmd", cmd: c });
  const minOf = tk => Math.min(40, Math.floor((tk / TICKS_PER_MIN) * (1200 / (room.opts.halfTicks || 1200))));
  const clock = s ? minOf(s.t) : 0;
  const solo = !!(room.seats.home.bot || room.seats.away.bot);

  return (
    <div>
      <Card elevated className="mb16 mv-top" style={{ padding: "12px 18px" }} ref={topRef} tabIndex={-1} role="region" aria-label={t("mr.liveRegion")}>
        <div className="scoreboard">
          <TeamHead team={setup.home} you={me === "home"} />
          <div className="center">
            <div className="row nowrap" style={{ justifyContent: "center", gap: 14 }}><span className="score">{report ? report.report.teams.home.score : s?.score[0] ?? 0}</span><span className="muted">:</span><span className="score">{report ? report.report.teams.away.score : s?.score[1] ?? 0}</span></div>
            <div className="clock">{ended ? t("mr.fullTime") : s?.phase === "halftime" ? t("mr.halftime") : `${clock}'`}</div>
            {s && <div className="tiny muted">{t("mr.possession")} {s.poss[0]}% – {s.poss[1]}%</div>}
            {s?.live && <div className="tiny muted">{t("mr.liveStats", { hs: s.live[0][0], ho: s.live[0][1], hx: s.live[0][2], as: s.live[1][0], ao: s.live[1][1], ax: s.live[1][2] })}</div>}
          </div>
          <TeamHead team={setup.away} you={me === "away"} away />
        </div>
      </Card>

      {ended && report ? <ReportView report={report} setup={setup} me={me} navigate={navigate} onLeave={onLeave} /> : (
        <div className="grid split" style={{ gridTemplateColumns: "1fr 340px" }}>
          <div>
            <div className="row mb8"><div className="seg" role="radiogroup" aria-label={t("mr.view")}>{["2d", "3d"].map(v => <button key={v} role="radio" aria-checked={(view3d ? "3d" : "2d") === v} className={(view3d ? "3d" : "2d") === v ? "on" : ""} onClick={() => setSettings({ managerView: v })}>{t("mr.view." + v)}</button>)}</div></div>
            <div className="pitch-wrap mv-pitch" style={{ position: "relative" }} ref={wrapRef}>
              <canvas ref={canvasRef} aria-label={t("mr.pitchLabel")} style={view3d ? { visibility: "hidden" } : undefined} />
              {view3d && <div ref={box3dRef} style={{ position: "absolute", inset: 0 }} />}
              {view3d && <CamBar mode={cam} follow={follow} slots={slots3d} onMode={chooseCam} onFollow={chooseFollow} fullscreen={fs} onFullscreen={toggleFs} onZoom={d => v3Ref.current?.zoomCam(d)} />}
              {banner && <div className="overlay-center"><div className="goal-flash">{t("mr.goal")}</div><div className="h2" style={{ color: setup[banner.side].colors[0] }}>{getPlayer(banner.pid)?.nom} · {setup[banner.side].name}</div></div>}
              {s?.phase === "halftime" && (
                <div className="overlay-center" style={{ background: "rgba(0,0,0,.6)", pointerEvents: "auto" }}>
                  <div className="h1">{t("mr.halftime")}</div>
                  {myTeam && !myTeam.talk ? (
                    <>
                      <div className="muted mb8">{t("mr.talkPrompt")}</div>
                      <div className="grid g2" style={{ gap: 8, maxWidth: 560 }}>
                        {TEAM_TALKS.map(tk => <button key={tk.id} className="strat-btn" style={{ color: "var(--white)" }} onClick={() => cmd({ type: "talk", id: tk.id })}><b>{tk.icon} {tk.nom[lang]}</b><div className="tiny muted">{tk.desc[lang]}</div></button>)}
                      </div>
                    </>
                  ) : myTeam?.talk ? <div className="muted">{t("mr.talkChosen", { talk: TEAM_TALK_BY_ID[myTeam.talk].nom[lang] })}</div> : <div className="muted">{t("mr.halftimeHint")}</div>}
                </div>
              )}
              {room.paused && <div className="overlay-center" style={{ background: "rgba(0,0,0,.45)" }}><div className="h1">⏸ {t("mr.paused")}</div></div>}
            </div>
            {solo && me !== "spec" && !ended && (
              <div className="row mt8">
                <button className="btn small gold" onClick={() => game.send({ t: "m.pause", paused: !room.paused })}>{room.paused ? "▶ " + t("mr.resume") : "⏸ " + t("mr.pause")}</button>
                {[1, 2, 4].map(v => <button key={v} className={"btn small " + (room.opts.speed === v ? "primary" : "ghost")} onClick={() => game.send({ t: "m.speed", speed: v })}>×{v}</button>)}
                <span className="tiny muted">{t("mr.speedHint")}</span>
              </div>
            )}
            {myTeam && s && !ended && (
              <div className="grid g2 mt16 split">
                <Card>
                  <Kicker color="var(--gold)">🧪 {t("mr.strategy")}</Kicker>
                  <div className="grid g2" style={{ gap: 6 }}>
                    {STRATEGIES.map(st => { const f = matchupFactor(st.id, s.teams[oppSide].strategy), g = matchupFactor(s.teams[oppSide].strategy, st.id); const fav = f / g;
                      return <button key={st.id} className={"strat-btn" + (myTeam.strategy === st.id ? " on" : "")} title={st.desc[lang]} onClick={() => cmd({ type: "strategy", id: st.id })}>{st.icon} {st.nom[lang]} {fav > 1.05 ? <span className="fav">▲</span> : fav < 0.95 ? <span className="unfav">▼</span> : null}</button>; })}
                  </div>
                  <p className="tiny muted mt8">⌨️ {t("mr.keysHint")} · {t("mr.oppStrategy")} : <b style={{ color: "var(--magenta)" }}>{STRATEGY_BY_ID[s.teams[oppSide].strategy].icon} {STRATEGY_BY_ID[s.teams[oppSide].strategy].nom[lang]}</b> · {t("mr.matrixHint")}</p>
                </Card>
                <Card>
                  <Kicker color="var(--magenta)">⚡ {t("mr.powerups")}</Kicker>
                  <div className="col" style={{ gap: 6 }}>
                    {myTeam.lineup.map(id => { const p = getPlayer(id); const lo = (setup[me].loadouts?.[id] || defaultLoadout(id)).map(getPowerUp).filter(Boolean);
                      return (
                        <div key={id} className="row nowrap" style={{ gap: 6 }}>
                          <Avatar player={p} size={26} showNum={false} />
                          {lo.map(pu => { const act = s.pu.find(a => a.id === pu.id); const cd = s.cd[pu.id] || 0; const ready = cd <= s.t && !act; const pct = ready ? 0 : act ? (act.until - s.t) / (pu.duree * 2) : (cd - s.t) / pu.cooldown;
                            return <button key={pu.id} className="pu-btn grow" disabled={!ready} style={{ color: act ? "var(--lime)" : p.color, borderColor: (act ? "#B8FF00" : p.color) + "66" }} onClick={() => cmd({ type: "powerup", pid: id, pu: pu.id })} title={`${puText(pu, lang).nom} — ${puText(pu, lang).effets}`}>
                              <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{puText(pu, lang).nom}</span><span className="tiny">{act ? t("mr.active") : ready ? "⚡" : `${Math.ceil((cd - s.t) / 10)}s`}</span>
                              {!ready && <span className="cd" style={{ width: `${Math.min(100, pct * 100)}%` }} />}
                            </button>; })}
                        </div>
                      ); })}
                  </div>
                </Card>
                <Card style={{ gridColumn: "1 / -1" }}>
                  <div className="row between"><Kicker color="var(--cyan)">🔄 {t("mr.subs", { n: myTeam.subsLeft })}</Kicker>{subOut && <button className="linkbtn" onClick={() => setSubOut(null)}>{t("common.cancel")}</button>}</div>
                  <p className="tiny muted mb8">{subOut ? t("mr.subPickIn", { name: getPlayer(subOut).nom }) : t("mr.subPickOut")}</p>
                  <div className="row">
                    {(subOut ? myTeam.bench : myTeam.lineup).map(id => { const p = getPlayer(id); const st = s.p[id]?.[2]; return (
                      <button key={id} className="card tight row nowrap" disabled={myTeam.subsLeft === 0} style={{ cursor: "pointer", borderColor: subOut === id ? "var(--gold)" : undefined }} onClick={() => { if (!subOut) setSubOut(id); else { cmd({ type: "sub", out: subOut, in: id }); setSubOut(null); } }}>
                        <Avatar player={p} size={28} showNum={false} /><div className="left"><div className="small" style={{ fontWeight: 700 }}>{p.nom}</div><div className="tiny" style={{ color: st == null ? "var(--muted)" : st > 55 ? "var(--lime)" : st > 30 ? "var(--gold)" : "var(--coral)" }}>{st == null ? pText(p, lang).poste : `⚡ ${st}%`}</div></div>
                      </button>); })}
                  </div>
                </Card>
              </div>
            )}
          </div>
          <Card style={{ display: "flex", flexDirection: "column", maxHeight: 720 }}>
            <Kicker>🎙️ {t("mr.feed")}</Kicker>
            {s && <Synergies teams={s.teams} setup={setup} />}
            <div className="feed grow" ref={feedRef}>
              {feed.length === 0 && <p className="muted small center" style={{ padding: 20 }}>{t("mr.waitingKickoff")}</p>}
              {feed.map((ev, i) => (
                <div key={i} className="feed-item" style={{ borderLeftColor: EV_COLORS[ev.type] || "var(--muted)", background: ev.type === "GOAL" ? "rgba(184,255,0,.08)" : undefined }}>
                  <div className="meta"><span style={{ color: EV_COLORS[ev.type] || "var(--muted)" }}>{t("evtype." + ev.type)}{ev.side ? ` · ${setup[ev.side].name}` : ""}</span><span className="muted">{minOf(ev.t)}'</span></div>
                  <div>{eventText(ev, t, lang)}</div>
                </div>
              ))}
            </div>
            <div className="row mt8">{["👏", "😱", "🔥", "🤯", "GG"].map(e => <button key={e} className="btn small ghost" onClick={() => game.send({ t: "emote", e })}>{e}</button>)}</div>
          </Card>
        </div>
      )}
    </div>
  );
}

function TeamHead({ team, you, away }) {
  const { t } = useI18n();
  return (
    <div className={"team" + (away ? " away" : "")}>
      {!away && <Crest club={team} />}
      <div style={{ minWidth: 0 }}><div style={{ fontWeight: 800, fontFamily: "var(--f-ui)", fontSize: 18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: team.colors[0] }}>{team.name}</div><div className="tiny muted">{team.bot ? "🤖 " + t("mr.bot") : "👤 " + (team.pseudo || "")}{you ? ` · ${t("mr.you")}` : ""}</div></div>
      {away && <Crest club={team} />}
    </div>
  );
}

function Synergies({ teams, setup }) {
  const { lang } = useI18n();
  const all = ["home", "away"].flatMap(side => (teams[side].synergies || []).map(id => ({ side, id })));
  if (!all.length) return null;
  const names = { reseau: ["Réseau Distribué", "Distributed Network"], carbone: ["Chaîne Carbonée", "Carbon Chain"], marche: ["Marché Haussier", "Bull Market"], physique: ["Laboratoire de Physique", "Physics Lab"], circuit: ["Circuit Imprimé", "Printed Circuit"], vivant: ["Sciences du Vivant", "Life Sciences"], maths: ["Rigueur Mathématique", "Mathematical Rigour"], pluri: ["Équipe Pluridisciplinaire", "Interdisciplinary Team"] };
  return <div className="row mb8" style={{ gap: 4 }}>{all.map(x => <span key={x.side + x.id} className="chip tiny" style={{ color: setup[x.side].colors[0] }}>🔗 {names[x.id]?.[lang === "en" ? 1 : 0] || x.id}</span>)}</div>;
}

export { attrName };
