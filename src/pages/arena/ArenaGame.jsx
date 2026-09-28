// Match de l'Arène en 3D plein écran + interface (score, chrono, endurance, power-up, fil d'actions, menu, fin de match).
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/index.jsx";
import { useSession, useConnMessages } from "../../store/session.jsx";
import { useGame } from "../../game/GameProvider.jsx";
import { Card, Kicker, Avatar, fmtSec, Seg } from "../../ui/components.jsx";
import { createArenaView } from "../../three/arenaView.js";
import { getPlayer, getPowerUp, narrText, puText } from "../../../shared/data/content.js";
import { CamBar } from "../../ui/CamBar.jsx";
import { useBindings } from "../../ui/bindings.js";
import { ACHIEVEMENTS } from "../../../shared/progression.js";
import { speak, stopSpeaking } from "../../audio/voice.js";
import { reducedFxOn } from "../../ui/reducedFx.js";

const FEED_TYPES = new Set(["GOAL", "SAVE", "TACKLE", "POWERUP", "FOUL", "FREEKICK", "PENALTY", "POST", "FIREWALL", "SKILL", "HALFTIME", "SECOND_HALF", "END"]);

export function ArenaGame({ room, init, end, onLeave }) {
  const { t, lang } = useI18n(); const { conn, settings, setSettings } = useSession(); const game = useGame();
  const hostRef = useRef(null); const viewRef = useRef(null);
  const [hud, setHud] = useState(null); const [feed, setFeed] = useState([]); const [banner, setBanner] = useState(null); const [emote, setEmote] = useState(null);
  const [goals, setGoals] = useState({}); // entraînement guidé : objectifs atteints
  const done = k => setGoals(g => (g[k] ? g : { ...g, [k]: true }));
  const slots = room.slots; const mySlot = room.you.slot;
  const mySlotRef = useRef(mySlot); mySlotRef.current = mySlot;
  const isTouch = typeof window !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const keys = useBindings();
  const spectator = mySlot == null;
  const [specCam, setSpecCam] = useState(settings.specCam || "auto"); const [follow, setFollow] = useState(-1);
  // aide des commandes : affichée 15 s au début (schéma clavier) ou tant que la souris n'est pas verrouillée ; F1 l'affiche / la masque
  const [helpOn, setHelpOn] = useState(true);
  useEffect(() => {
    const h = setTimeout(() => setHelpOn(false), 15000);
    const k = e => { if (e.code === "F1") { e.preventDefault(); setHelpOn(v => !v); } };
    window.addEventListener("keydown", k); return () => { clearTimeout(h); window.removeEventListener("keydown", k); };
  }, []);

  useEffect(() => {
    const v = createArenaView(hostRef.current, {
      slots: init.slots, teams: init.teams, mySlot, settings: { ...settings, specCam }, interactive: !spectator,
      onInput: m => conn?.send({ t: "a.in", ...m }),
      onSwitch: to => conn?.send({ t: "a.switch", to }),
      onMenu: open => conn?.send({ t: "a.pause", on: open }), // le serveur ne suspend qu'en solo contre les bots
      getRtt: () => conn?.rtt || 0,
      onHud: h => { setHud(h); const ms = mySlotRef.current; if (h.me) { if (h.players[ms] && (h.players[ms].flags & 1)) done("sprint"); if (h.me.hasBall && h.phase === "play") done("control"); } },
      onEvent: ev => {
        const ms = mySlotRef.current;
        if (ev.slot === ms) ({ MY_PASS: "pass", SHOT: "shoot", TACKLE: "tackle", POWERUP: "power", GOAL: "score", SKILL: "skill" })[ev.type] && done(({ MY_PASS: "pass", SHOT: "shoot", TACKLE: "tackle", POWERUP: "power", GOAL: "score", SKILL: "skill" })[ev.type]);
        if (ev.type === "EMOTE_KEY") { game.send({ t: "emote", e: ["👏", "🔥", "😱", "😂", "GG"][ev.n - 1] }); return; }
        if (ev.local) return;
        if (ev.type === "GOAL") { setBanner({ ev, at: Date.now() }); setTimeout(() => setBanner(null), 3000); if (ev.n) speak(narrText(ev.n, { joueur: getPlayer(init.slots[ev.slot]?.charId)?.nom || "" }, lang), lang, settingsRef.current.voice); }
        if (FEED_TYPES.has(ev.type)) setFeed(f => [...f.slice(-5), { ...ev, key: Math.random() }]);
      },
    });
    viewRef.current = v;
    const unlock = () => v.unlockAudio(); window.addEventListener("pointerdown", unlock); window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); v.dispose(); viewRef.current = null; stopSpeaking(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { viewRef.current?.setSlots(slots); }, [slots]);
  // pause confirmée par la salle : la vue se fige ; reconnexion à un match en pause : menu rouvert
  useEffect(() => { viewRef.current?.setPaused(!!room.paused); if (room.paused) viewRef.current?.setMenu(true); }, [room.paused]);
  // changement de joueur (validé par le serveur) : la vue suit le nouveau joueur contrôlé
  const firstSlot = useRef(mySlot);
  useEffect(() => { viewRef.current?.setMySlot(mySlot); if (mySlot !== firstSlot.current) done("switch"); }, [mySlot]); // eslint-disable-line react-hooks/exhaustive-deps
  const settingsRef = useRef(settings); settingsRef.current = settings;
  useEffect(() => { viewRef.current?.setSettings(settings); }, [settings]);
  useConnMessages(conn, m => {
    if (m.t === "a.snap") viewRef.current?.pushSnapshot(m.s, m.ev);
    if (m.t === "emote") { setEmote(m); setTimeout(() => setEmote(null), 1800); }
  });
  // retirer les entrées du fil au bout de 6 s
  useEffect(() => { const h = setInterval(() => setFeed(f => f.filter(x => Date.now() - (x.shownAt ||= Date.now()) < 6000)), 1000); return () => clearInterval(h); }, []);

  const nameOf = s => (slots[s]?.human ? slots[s].pseudo : getPlayer(slots[s]?.charId)?.nom) || "?";
  const evText = ev => {
    const p = ev.slot >= 0 ? getPlayer(slots[ev.slot]?.charId) : null;
    const skill = ev.type === "SKILL" && ev.move ? t("skill." + ev.move) + (ev.ok === false ? " ✗" : "") + " — " : "";
    if (ev.n) return skill + narrText(ev.n, { joueur: p?.nom || "", pu: ev.pu ? puText(getPowerUp(ev.pu) || p.powerUp, lang).nom : "" }, lang);
    if (ev.type === "SKILL") return t("skill." + (ev.move || "cut")) + (ev.ok === false ? " ✗" : "");
    if (ev.type === "FREEKICK") return t("arena.freekickFor", { name: p?.nom || "" });
    if (ev.type === "PENALTY") return t("arena.penaltyFor", { name: p?.nom || "" });
    if (ev.type === "FOUL") return t("arena.foulBy", { name: p?.nom || "" });
    if (ev.type === "GOAL" && ev.own) return t("arena.ownGoal");
    if (ev.type === "FIREWALL") return t("arena.firewall", { name: p?.nom });
    if (ev.type === "POST") return t("ev.post", { name: p?.nom || "" });
    return t("ev." + ({ HALFTIME: "halftime", SECOND_HALF: "secondHalf", END: "end" }[ev.type] || "end"));
  };
  const myChar = mySlot != null ? getPlayer(slots[mySlot].charId) : null;
  const me = hud?.me; const menu = hud?.menu; const ended = room.phase === "ended";
  const T = init.teams;
  // coéquipiers pilotés par un bot : on peut en prendre le contrôle
  const mates = mySlot != null ? slots.filter(s => s.team === slots[mySlot].team) : [];
  const canSwitch = mates.some(s => !s.human && !s.left);
  const puKeys = [keys.keyOf("pu1"), keys.keyOf("pu2")];

  return (
    <div className="arena-root">
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
      <div className="hud">
        <div className="hud-top" role="status">
          <div className="t" style={{ color: T[0].color }}>{T[0].name}</div>
          <div className="s">{hud?.score?.[0] ?? 0}</div>
          <div className="c">{hud ? (hud.phase === "halftime" ? t("mr.halftime") : fmtSec(hud.clock)) : "--"}</div>
          <div className="s">{hud?.score?.[1] ?? 0}</div>
          <div className="t" style={{ color: T[1].color }}>{T[1].name}</div>
        </div>
        {me && myChar && (
          <div className="hud-me">
            <div className="row nowrap"><Avatar player={myChar} size={40} /><div className="grow"><div style={{ fontWeight: 800 }}>{myChar.nom} {me.hasBall && "⚽"}</div><div className="tiny muted">{t("arena.stamina")}</div><div className="hud-bar"><div style={{ width: `${me.stamina}%`, background: me.stamina > 50 ? "var(--lime)" : me.stamina > 25 ? "var(--gold)" : "var(--coral)" }} /></div></div></div>
          </div>
        )}
        {me && myChar && (
          <div className="hud-pus">
            {(me.pus || []).map((u, k) => { const pu = getPowerUp(u.id); if (!pu) return null; const ready = u.cd <= 0 && !u.active; const cdMax = pu.arena?.cooldown || 45;
              return (
                <button key={u.id} type="button" className={"hud-pu" + (ready ? " ready" : "") + (u.active ? " active" : "")} style={{ "--pc": myChar.color, "--pct": u.active ? 1 : ready ? 1 : 1 - u.cd / cdMax }} title={puText(pu, lang).arena} onClick={() => viewRef.current?.touch.btn.add(k === 0 ? "pu1" : "pu2")}>
                  <span className="hud-pu-name">{puText(pu, lang).nom}</span>
                  <span className="num hud-pu-state">{u.active ? t("mr.active") : u.cd > 0 ? `${Math.ceil(u.cd)}s` : "⚡"}</span>
                  {!isTouch && <span className="kbd hud-pu-key">{hud?.usingPad ? keys.padOf(k === 0 ? "pu1" : "pu2") : puKeys[k]}</span>}
                </button>
              ); })}
          </div>
        )}
        {me && canSwitch && !ended && (
          <div className="hud-team" role="group" aria-label={t("arena.switchTitle")}>
            {mates.map(s => { const p = getPlayer(s.charId); const cur = s.slot === mySlot; const st = hud?.players?.[s.slot];
              return (
                <button key={s.slot} type="button" className={"hud-mate" + (cur ? " cur" : "") + (s.human && !cur ? " human" : "")} disabled={s.human || s.left} title={s.human && !cur ? `👤 ${s.pseudo}` : s.left ? t("arena.reserved") : cur ? t("arena.youControl") : t("arena.switchTo", { name: p.nom })} onClick={() => viewRef.current?.switchTo(s.slot)} style={{ "--pc": p.color }}>
                  <Avatar player={p} size={30} showNum={false} ring={cur ? "#fff" : undefined} />
                  <span className="hud-mate-bar"><span style={{ width: `${st?.stamina ?? 100}%` }} /></span>
                  {hud?.owner === s.slot && <span className="hud-mate-ball">⚽</span>}
                </button>
              ); })}
            {!isTouch && <span className="tiny muted hud-team-hint"><span className="kbd">{hud?.usingPad ? keys.padOf("switch") : keys.keyOf("switch")}</span> {t("arena.switchHint")}</span>}
          </div>
        )}
        {spectator && !ended && <CamBar mode={specCam} follow={follow} slots={slots} onMode={m => { setSpecCam(m); viewRef.current?.setCam(m); setSettings({ specCam: m }); }} onFollow={s => { setFollow(s); viewRef.current?.setFollow(s); if (s >= 0) setSpecCam("player"); }} onZoom={d => viewRef.current?.zoomCam(d)} />}
        {hud && <MiniMap hud={hud} slots={slots} teams={T} mySlot={mySlot} />}
        {room.opts.training && !ended && <Training goals={goals} t={t} keys={keys} pad={hud?.usingPad} />}
        {me?.charging && <div className="hud-charge" aria-label={t("arena.power")}><div style={{ width: `${me.charge * 100}%` }} /></div>}
        <div className="hud-feed" aria-live="polite">
          {feed.map(ev => <div key={ev.key} className="feed-item" style={{ borderLeftColor: ev.type === "GOAL" ? "var(--lime)" : ev.type === "POWERUP" ? "var(--gold)" : "var(--cyan)" }}><div className="meta"><span>{t("evtype." + ev.type)}</span><span className="muted">{ev.slot >= 0 ? nameOf(ev.slot) : ""}</span></div>{evText(ev)}</div>)}
        </div>
        {settings.showHelp && hud && (keys.mouse ? !hud.locked || helpOn : helpOn) && !menu && !ended && !isTouch && !spectator && (
          <div className="hud-help">
            <div style={{ fontWeight: 800, color: "var(--cyan)" }}>{hud.usingPad ? "🎮 " + t("controls.padTitle") : keys.mouse ? "🖱️ " + t("arena.clickToPlay") : "⌨️ " + t("controls.kbTitle")}</div>
            <div><span className="kbd">{hud.usingPad ? t("controls.leftStick") : keys.moveKeys}</span> {t("controls.move")}</div>
            {["sprint", "shoot", "pass", "lob", "skill", "tackle", "press", "switch", "call", "pu1", "pu2", "cam"].map(k => <div key={k}><span className="kbd">{hud.usingPad ? keys.padOf(k) : keys.keyOf(k)}</span> {t("controls." + k)}</div>)}
            {keys.controls.contextKeys && <div className="tiny muted" style={{ lineHeight: 1.4, maxWidth: 260 }}>🛡️ {t("controls.contextHint", { pass: hud.usingPad ? keys.padOf("pass") : keys.keyOf("pass"), shoot: hud.usingPad ? keys.padOf("shoot") : keys.keyOf("shoot") })}</div>}
            <div className="tiny muted">{t("controls.helpToggle")}</div>
          </div>
        )}
        {hud?.locked && <div className="crosshair" />}
        {hud?.replay && <div className="replay-badge">▶ {t("arena.replay")} <span className="tiny muted">{t("arena.replaySkip", { pass: hud.usingPad ? keys.padOf("pass") : keys.keyOf("pass"), menu: hud.usingPad ? keys.padOf("menu") : keys.keyOf("menu") })}</span></div>}
        {hud?.phase === "setpiece" && hud.sp && !hud.replay && (
          <div className="setpiece-banner" style={{ borderColor: T[hud.sp.tm].color }}>
            <div className="h2" style={{ margin: 0, color: hud.sp.k === "penalty" ? "var(--coral)" : "var(--gold)" }}>{hud.sp.k === "penalty" ? "🎯 " + t("arena.penalty") : "🚩 " + t("arena.freekick")}</div>
            <div className="small">{nameOf(hud.sp.p)} · <span className="num">{Math.ceil(hud.sp.r)}s</span></div>
            {hud.sp.p === mySlot && <div className="tiny">{t("arena.spHint", { move: hud.usingPad ? t("controls.leftStick") : keys.moveKeys, shoot: hud.usingPad ? keys.padOf("shoot") : keys.keyOf("shoot"), pass: hud.usingPad ? keys.padOf("pass") : keys.keyOf("pass") })}</div>}
            {hud.sp.k === "penalty" && mySlot != null && slots[mySlot].slot % 5 === 0 && slots[mySlot].team !== hud.sp.tm && <div className="tiny">{t("arena.penaltyKeeper", { dive: hud.usingPad ? keys.padOf("tackle") : keys.keyOf("tackle") })}</div>}
          </div>
        )}
        {banner && !hud?.replay && <div className="hud-center"><div className="goal-flash">{t("mr.goal")}</div><div className="h2" style={{ color: T[banner.ev.team].color }}>{banner.ev.own ? t("arena.ownGoal") : nameOf(banner.ev.slot)}{banner.ev.assist >= 0 ? ` · 🅰️ ${nameOf(banner.ev.assist)}` : ""}</div></div>}
        {hud?.phase === "halftime" && !banner && <div className="hud-center"><div className="h1">{t("mr.halftime")}</div></div>}
        {hud?.phase === "kickoff" && hud.clock >= room.opts.halfSeconds - 1 && <div className="hud-center"><div className="h1" style={{ animation: "pop .5s" }}>{t("arena.kickoff")}</div></div>}
        {emote && <div className="emote-float">{emote.e} <span className="small">{emote.from}</span></div>}
        {hud?.board && <Scoreboard slots={slots} hud={hud} teams={T} keyBoard={hud.usingPad ? keys.padOf("board") : keys.keyOf("board")} />}
        {isTouch && viewRef.current && !ended && !spectator && <TouchControls touch={viewRef.current.touch} t={t} canSwitch={canSwitch} />}
        {(menu || ended) && (
          <div className="hud-menu">
            {ended && end ? <EndScreen end={end} slots={slots} mySlot={mySlot} onLeave={onLeave} again={() => { const kind = game.joined?.kind; const o = room.opts; onLeave(); if (kind === "local") setTimeout(() => game.create("local", "arena", { botLevel: o.botLevel, halfSeconds: o.halfSeconds, training: o.training }), 50); }} />
              : ended ? <Card elevated><p>{t("common.loading")}</p></Card> : (
              <Card elevated style={{ width: "min(440px, 92vw)" }}>
                <div className="h2">{room.canPause ? "⏸ " + t("arena.menu") : "☰ " + t("arena.menuLive")}</div>
                <p className={"small mb8" + (room.paused ? "" : " muted")} role="status">{room.paused ? t("arena.pausedNote") : room.canPause ? t("arena.pausing") : t("arena.liveNote")}</p>
                <button className="btn primary block mb8" onClick={() => viewRef.current?.setMenu(false)}>▶ {t("arena.resume")}</button>
                <div className="label mt16">{t("settings.sensitivity")} — {settings.sensitivity.toFixed(1)}</div>
                <input className="range" type="range" min="0.3" max="2.5" step="0.1" value={settings.sensitivity} onChange={e => setSettings({ sensitivity: +e.target.value })} />
                <div className="label mt16">{t("settings.volume")}</div>
                <input className="range" type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={e => setSettings({ volume: +e.target.value })} />
                <div className="row mt8"><label className="row small"><input type="checkbox" checked={reducedFxOn(settings)} onChange={e => setSettings({ reducedFx: e.target.checked })} /> {t("settings.reducedFx")}</label></div>
                <div className="label mt16">{t("settings.camera")}</div>
                <Seg value={hud?.cam || "near"} onChange={v => viewRef.current?.setCam(v)} options={[{ value: "near", label: t("settings.cam.near") }, { value: "far", label: t("settings.cam.far") }, { value: "broadcast", label: t("settings.cam.broadcast") }]} />
                <p className="tiny muted mt8">{t("arena.camHint", { key: keys.keyOf("cam") })}</p>
                <div className="label mt16">{t("settings.autoSwitch")}</div>
                <Seg value={keys.controls.autoSwitch} onChange={v => setSettings({ controls: { ...keys.controls, autoSwitch: v } })} options={["off", "pass", "assist"].map(v => ({ value: v, label: t("settings.autoSwitch." + v) }))} />
                <div className="row mt16">{["👏", "🔥", "😱", "😂", "GG"].map(e => <button key={e} className="btn small ghost" onClick={() => game.send({ t: "emote", e })}>{e}</button>)}</div>
                <button className="btn danger block mt16" onClick={onLeave}>✕ {t("mr.leave")}</button>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// entraînement guidé : liste d'objectifs
const TRAINING = ["control", "sprint", "skill", "pass", "shoot", "tackle", "power", "switch", "score"];
const TRAINING_ACTION = { sprint: "sprint", skill: "skill", pass: "pass", shoot: "shoot", tackle: "tackle", power: "pu1", switch: "switch" };
function Training({ goals, t, keys, pad }) {
  const n = TRAINING.filter(k => goals[k]).length;
  const one = a => (pad ? keys.padOf(a) : keys.keyOf(a));
  // tacle : touche dédiée, et touche de tir quand un adversaire a le ballon (touches contextuelles)
  const keyOf = k => (k === "control" ? (pad ? t("controls.leftStick") : keys.moveKeys) : k === "tackle" && keys.controls.contextKeys ? `${one("tackle")} / ${one("shoot")}` : TRAINING_ACTION[k] ? one(TRAINING_ACTION[k]) : "");
  return (
    <div className="training">
      <div style={{ fontWeight: 800, color: "var(--lime)" }}>🎓 {t("training.title")} — {n}/{TRAINING.length}</div>
      {TRAINING.map(k => <div key={k} style={{ opacity: goals[k] ? 0.55 : 1 }}>{goals[k] ? "✅" : "⬜"} {t("training." + k, { key: keyOf(k) })}</div>)}
      {n === TRAINING.length && <div className="mt8" style={{ color: "var(--gold)", fontWeight: 800 }}>🏆 {t("training.done")}</div>}
    </div>
  );
}

// mini-carte radar de l'arène (vue du dessus)
function MiniMap({ hud, slots, teams, mySlot }) {
  const W = 168, H = 101, sx = x => ((x + 20) / 40) * W, sz = z => ((z + 12) / 24) * H;
  return (
    <svg className="minimap" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="6" fill="rgba(5,8,20,.72)" stroke="rgba(0,240,255,.4)" />
      <line x1={W / 2} y1="0" x2={W / 2} y2={H} stroke="rgba(255,255,255,.2)" /><circle cx={W / 2} cy={H / 2} r="12" fill="none" stroke="rgba(255,255,255,.2)" />
      <rect x="0" y={sz(-2.5)} width="3" height={sz(2.5) - sz(-2.5)} fill={teams[0].color} /><rect x={W - 3} y={sz(-2.5)} width="3" height={sz(2.5) - sz(-2.5)} fill={teams[1].color} />
      {hud.players.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sz(p.z)} r={i === mySlot ? 4.5 : 3.2} fill={teams[slots[i]?.team ?? 0].color} stroke={i === mySlot ? "#fff" : "rgba(0,0,0,.6)"} strokeWidth={i === mySlot ? 2 : 1} />)}
      <circle cx={sx(hud.ball[0])} cy={sz(hud.ball[1])} r="2.6" fill="#fff" />
    </svg>
  );
}

function Scoreboard({ slots, hud, teams, keyBoard }) {
  const { t } = useI18n();
  return (
    <div className="hud-center" style={{ pointerEvents: "none" }}>
      <Card elevated style={{ width: "min(700px, 94vw)" }}>
        <div className="grid g2">{[0, 1].map(team => <div key={team}><Kicker color={teams[team].color}>{teams[team].name}</Kicker>{slots.filter(s => s.team === team).map(s => { const p = getPlayer(s.charId); return <div key={s.slot} className="row nowrap small mb8"><Avatar player={p} size={24} showNum={false} /><span className="grow">{p.nom}</span><span className="tiny muted">{s.human ? "👤 " + s.pseudo : "🤖"}</span><span className="num tiny">{hud.players[s.slot]?.stamina}%</span></div>; })}</div>)}</div>
        <p className="tiny muted center">{t("arena.boardHint", { key: keyBoard })}</p>
      </Card>
    </div>
  );
}

function EndScreen({ end, slots, mySlot, onLeave, again }) {
  const { t, lang } = useI18n();
  const myTeam = mySlot != null ? slots[mySlot].team : 0;
  const res = end.score[myTeam] > end.score[1 - myTeam] ? "W" : end.score[myTeam] < end.score[1 - myTeam] ? "L" : "D";
  const prog = end.progression?.[mySlot];
  const order = slots.map((s, i) => ({ ...s, rating: end.ratings[i], st: end.stats[i] })).sort((a, b) => b.rating - a.rating);
  const mvp = end.slots[end.mvp];
  return (
    <Card elevated style={{ width: "min(820px, 95vw)", maxHeight: "92vh", overflow: "auto" }}>
      <div className="center">
        <div className="kicker" style={{ color: { W: "var(--lime)", L: "var(--coral)", D: "var(--gold)" }[res], fontSize: 16 }}>{mySlot != null ? t("report.result." + res) : t("report.final")}</div>
        <div className="row" style={{ justifyContent: "center", gap: 18 }}><span className="h2" style={{ color: end.teams[0].color, margin: 0 }}>{end.teams[0].name}</span><span className="num" style={{ fontSize: 52 }}>{end.score[0]} – {end.score[1]}</span><span className="h2" style={{ color: end.teams[1].color, margin: 0 }}>{end.teams[1].name}</span></div>
        {mvp && <div className="mt8">🏆 {t("report.mvp")} : <b>{getPlayer(mvp.charId).nom}</b>{mvp.pseudo ? ` (${mvp.pseudo})` : ""}</div>}
        {!prog && mySlot != null && <p className="tiny muted mt8">{t("report.soloNoXp")}</p>}
        {prog && <div className="row mt8" style={{ justifyContent: "center" }}><span className="chip" style={{ color: "var(--lime)" }}>+{prog.xpGained} XP</span><span className="chip" style={{ color: "var(--gold)" }}>🎓 {prog.grade[lang]}{prog.gradeUp ? " ⬆" : ""}</span>{prog.newAchievements.map(id => { const a = ACHIEVEMENTS.find(x => x.id === id); return a && <span key={id} className="chip" style={{ color: "var(--magenta)" }}>{a.icon} {a[lang].name}</span>; })}</div>}
      </div>
      <table className="table mt16">
        <thead><tr><th>{t("arena.player")}</th><th>⚽</th><th>🅰️</th><th>🎯</th><th>🧤</th><th>🛡️</th><th>{t("arena.rating")}</th></tr></thead>
        <tbody>{order.map(s => { const p = getPlayer(s.charId); return <tr key={s.slot} className={s.slot === mySlot ? "me" : ""}><td><span className="dot" style={{ background: end.teams[s.team].color, marginRight: 6 }} />{p.nom} <span className="tiny muted">{s.human ? s.pseudo : "🤖"}</span></td><td className="num">{s.st.goals}</td><td className="num">{s.st.assists}</td><td className="num">{s.st.onTarget}/{s.st.shots}</td><td className="num">{s.st.saves}</td><td className="num">{s.st.tackles}</td><td className="num" style={{ color: s.rating >= 7.5 ? "var(--lime)" : "var(--cyan)" }}>{s.rating.toFixed(1)}</td></tr>; })}</tbody>
      </table>
      <div className="row mt16" style={{ justifyContent: "center" }}><button className="btn magenta" onClick={again}>🔄 {t("report.again")}</button><button className="btn ghost" onClick={onLeave}>🏠 {t("arena.backToMenu")}</button></div>
    </Card>
  );
}

function TouchControls({ touch, t, canSwitch }) {
  const stick = useRef(null); const knob = useRef(null);
  const move = e => {
    const r = stick.current.getBoundingClientRect(); const tt = e.targetTouches[0]; if (!tt) return;
    let x = (tt.clientX - r.left - r.width / 2) / (r.width / 2), y = (tt.clientY - r.top - r.height / 2) / (r.height / 2);
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    touch.mx = x; touch.mz = -y; knob.current.style.transform = `translate(${x * 36}px, ${y * 36}px)`;
  };
  const endStick = () => { touch.mx = 0; touch.mz = 0; knob.current.style.transform = ""; };
  const hold = name => ({ onTouchStart: e => { e.preventDefault(); touch.btn.add(name); }, onTouchEnd: e => { e.preventDefault(); touch.btn.delete(name); }, onTouchCancel: () => touch.btn.delete(name) });
  const tap = name => ({ onTouchStart: e => { e.preventDefault(); touch.btn.add(name); } });
  return (
    <>
      <div className="touch-stick" ref={stick} onTouchStart={move} onTouchMove={move} onTouchEnd={endStick}><div className="knob" ref={knob} /></div>
      <div className="touch-btns">
        <button {...hold("shoot")} style={{ color: "var(--coral)" }}>{t("touch.shoot")}</button>
        <button {...tap("pass")} style={{ color: "var(--cyan)" }}>{t("touch.pass")}</button>
        <button {...hold("sprint")} style={{ color: "var(--lime)" }}>{t("touch.sprint")}</button>
        <button {...tap("tackle")} style={{ color: "var(--violet)" }}>{t("touch.tackle")}</button>
        <button {...tap("skill")} style={{ color: "var(--magenta)" }}>{t("touch.skill")}</button>
        <button {...tap("call")} style={{ color: "var(--gold)" }}>{t("touch.call")}</button>
        <button {...hold("press")} style={{ color: "var(--cyan)" }}>{t("touch.press")}</button>
        {canSwitch && <button {...tap("switch")} style={{ color: "var(--white)" }}>{t("touch.switch")}</button>}
      </div>
    </>
  );
}
