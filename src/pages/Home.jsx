import { useState } from "react";
import { useI18n } from "../i18n/index.jsx";
import { useSession } from "../store/session.jsx";
import { useGame } from "../game/GameProvider.jsx";
import { Card, Avatar, Kicker } from "../ui/components.jsx";
import { PLAYERS, pText, domainWord, STRATEGY_BY_ID } from "../../shared/data/content.js";
import { DIFFICULTIES } from "../../shared/manager/ai.js";
import { gradeOf } from "../../shared/progression.js";
import { currentChallenges, streakOf, localDate } from "../store/challenges.js";

export default function Home({ navigate }) {
  const { t, lang } = useI18n();
  const { user, serverUp, online } = useSession();
  const game = useGame();
  const [code, setCode] = useState("");
  const star = PLAYERS[Math.floor(Date.now() / 86400000) % PLAYERS.length]; // scientifique du jour
  const grade = user ? gradeOf(user.xp) : null;

  return (
    <div className="page">
      <section className="hero">
        <div className="row"><div className="kicker" style={{ margin: 0 }}>{t("home.kicker")}</div>{serverUp && online != null && <span className="chip" style={{ color: "var(--lime)" }}>● {t("home.online", { count: online })}</span>}</div>
        <h1 className="hero-title">Lab League</h1>
        <p className="hero-sub">{t("home.tagline")}</p>
        {user && <div className="row mb16"><span className="chip" style={{ color: "var(--gold)" }}>🎓 {grade[lang]}</span><span className="muted small">{t("home.welcomeBack", { pseudo: user.pseudo })}</span></div>}
      </section>

      <div className="grid g2 split">
        <Card className="mode-card" style={{ color: "var(--cyan)" }} elevated>
          <div>
            <div className="mode-icon">🧪</div>
            <div className="mode-title">{t("home.manager.title")}</div>
            <p className="muted" style={{ color: "var(--white)", opacity: .8, lineHeight: 1.6 }}>{t("home.manager.desc")}</p>
          </div>
          <div className="row mt16">
            <button className="btn primary" onClick={() => game.create("local", "manager", { bot: "chercheur", speed: 1, autostart: true })}>▶ {t("home.playBots")}</button>
            <button className="btn ghost" disabled={serverUp === false} onClick={() => game.quick("manager")}>🌐 {t("home.quickOnline")}</button>
            <button className="linkbtn" onClick={() => navigate("/manager")}>{t("home.moreOptions")} →</button>
          </div>
        </Card>
        <Card className="mode-card" style={{ color: "var(--magenta)" }} elevated>
          <div>
            <div className="mode-icon">🏟️</div>
            <div className="mode-title">{t("home.arena.title")}</div>
            <p className="muted" style={{ color: "var(--white)", opacity: .8, lineHeight: 1.6 }}>{t("home.arena.desc")}</p>
          </div>
          <div className="row mt16">
            <button className="btn magenta" onClick={() => game.create("local", "arena", { botLevel: "normal", halfSeconds: 180 })}>▶ {t("home.playBots")}</button>
            <button className="btn ghost" disabled={serverUp === false} onClick={() => game.quick("arena")}>🌐 {t("home.quickOnline")}</button>
            <button className="linkbtn" onClick={() => navigate("/arena")}>{t("home.moreOptions")} →</button>
          </div>
        </Card>
      </div>

      <div className="mt24"><ChallengesCard t={t} lang={lang} /></div>

      <div className="grid g3 mt24 split">
        <Card>
          <Kicker>{t("home.joinTitle")}</Kicker>
          <p className="muted small mb8">{t("home.joinDesc")}</p>
          <form className="row nowrap" onSubmit={e => { e.preventDefault(); if (code.length >= 4) game.join(code); }}>
            <input className="input code-input" style={{ fontSize: 22, letterSpacing: 6 }} value={code} maxLength={6} placeholder="ABC123" aria-label={t("home.joinTitle")} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            <button className="btn lime" disabled={code.length < 4 || serverUp === false}>{t("home.join")}</button>
          </form>
          {serverUp === false && <p className="error mt8 small">{t("home.offline")}</p>}
        </Card>
        <Card onClick={() => navigate(`/player/${star.id}`)}>
          <Kicker color={star.color}>{t("home.starOfDay")}</Kicker>
          <div className="row nowrap"><Avatar player={star} size={58} /><div><div className="h2" style={{ marginBottom: 2 }}>{star.nom}</div><div className="small" style={{ color: star.color }}>« {pText(star, lang).slogan} »</div></div></div>
          <p className="muted small mt8" style={{ lineHeight: 1.5 }}>{pText(star, lang).bio.slice(0, 150)}…</p>
        </Card>
        <Card>
          <Kicker color="var(--lime)">{user ? t("home.yourCareer") : t("home.account")}</Kicker>
          {user ? (
            <>
              <div className="row between"><span className="h2" style={{ margin: 0 }}>🎓 {grade[lang]}</span><span className="num muted">{user.xp} XP</span></div>
              <div className="progress mt8"><div style={{ width: `${Math.round(grade.progress * 100)}%` }} /></div>
              <div className="row mt16"><button className="btn small ghost" onClick={() => navigate("/profile")}>{t("home.seeProfile")}</button><button className="btn small ghost" onClick={() => navigate("/leaderboard")}>{t("nav.leaderboard")}</button></div>
            </>
          ) : (
            <>
              <p className="muted small mb16" style={{ lineHeight: 1.6 }}>{t("home.accountPitch")}</p>
              <button className="btn lime" onClick={() => navigate("/account")}>{t("home.createAccount")}</button>
            </>
          )}
        </Card>
      </div>

      <div className="mt24">
        <div className="row between mb8"><Kicker>{t("home.rosterTitle")}</Kicker><button className="linkbtn" onClick={() => navigate("/roster")}>{t("home.seeAll")} →</button></div>
        <div className="ticker">{PLAYERS.map(p => <div key={p.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/player/${p.id}`)} title={p.nom}><Avatar player={p} size={54} /></div>)}</div>
      </div>

      <div className="grid g4 mt24">
        {["f1", "f2", "f3", "f4"].map((k, i) => (
          <Card key={k} tight><div style={{ fontSize: 26 }}>{["⚡", "🤖", "🔐", "🌍"][i]}</div><div className="mt8" style={{ fontWeight: 800, fontFamily: "var(--f-ui)", fontSize: 16 }}>{t(`home.${k}.title`)}</div><div className="muted small mt8" style={{ lineHeight: 1.5 }}>{t(`home.${k}.desc`)}</div></Card>
        ))}
      </div>
    </div>
  );
}

// Défis du jour (W-038) : trois défis tirés de la date, progression et série de jours.
function ChallengesCard({ t, lang }) {
  const st = currentChallenges();
  const streak = streakOf(st, localDate());
  const icon = { arena: "🏟️", manager: "🧪", science: "🔬" };
  const label = def => t(`chal.${def.kind}`, {
    n: def.n,
    domaine: def.domaine ? domainWord(def.domaine, lang) : undefined,
    strategy: def.strategy ? STRATEGY_BY_ID[def.strategy]?.nom[lang] : undefined,
    level: def.level ? DIFFICULTIES[def.level]?.[lang] : undefined,
  });
  return (
    <Card>
      <div className="row between nowrap mb8">
        <Kicker color="var(--gold)">🎯 {t("chal.title")}</Kicker>
        {streak > 0 && <span className="chip" style={{ color: "var(--coral)" }}>🔥 {t("chal.streak", { n: streak })}</span>}
      </div>
      <div className="grid g3 split" style={{ gap: 10 }}>
        {st.defs.map(def => { const p = st.progress[def.id] || { n: 0, done: false }; return (
          <div key={def.id} className="row nowrap small" style={{ opacity: p.done ? 0.7 : 1 }}>
            <span style={{ width: 24, fontSize: 18 }}>{p.done ? "✅" : icon[def.mode]}</span>
            <span className="grow" style={{ textDecoration: p.done ? "line-through" : "none" }}>{label(def)}</span>
            <span className="num tiny muted">{p.n}/{def.n || 1}</span>
          </div>); })}
      </div>
    </Card>
  );
}
