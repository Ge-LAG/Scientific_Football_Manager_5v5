import { useEffect, useState } from "react";
import { useI18n } from "../i18n/index.jsx";
import { useSession } from "../store/session.jsx";
import { Card, Kicker, Crest, Modal, Spinner, useToast } from "../ui/components.jsx";
import { gradeOf, ACHIEVEMENTS, GRADES } from "../../shared/progression.js";

export default function Profile({ pseudo, navigate }) {
  const { t, lang, fmtDate } = useI18n();
  const { user, logout, deleteAccount, changePassword, api, refreshUser } = useSession();
  const toast = useToast();
  const [other, setOther] = useState(null); const [err, setErr] = useState("");
  const [modal, setModal] = useState(null); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [merr, setMerr] = useState("");
  const own = !pseudo || (user && pseudo.toLowerCase() === user.pseudo.toLowerCase());
  useEffect(() => { if (own) { refreshUser(); return; } setOther(null); api(`/api/users/${encodeURIComponent(pseudo)}`).then(d => setOther(d.user), e => setErr(e.code)); }, [pseudo]); // eslint-disable-line react-hooks/exhaustive-deps
  const u = own ? user : other;
  if (own && !user) return <div className="page narrow"><Card><p className="mb16">{t("profile.needAccount")}</p><button className="btn primary" onClick={() => navigate("/account")}>{t("nav.login")}</button></Card></div>;
  if (!u) return <div className="page">{err ? <p className="error">{t("error." + err)}</p> : <Spinner label={t("common.loading")} />}</div>;
  const g = gradeOf(u.xp); const sm = u.stats.manager, sa = u.stats.arena;
  const pct = s => (s.played ? Math.round((s.won / s.played) * 100) : 0);

  return (
    <div className="page mid">
      <Card elevated className="mb16">
        <div className="row" style={{ gap: 20 }}>
          <Crest club={u.club || { crest: "🧬", colors: ["#00F0FF", "#0a0a12"] }} size={78} />
          <div className="grow">
            <h1 className="h1" style={{ color: "var(--white)", margin: 0 }}>{u.pseudo}</h1>
            <div className="row"><span className="chip" style={{ color: "var(--gold)" }}>🎓 {g[lang]}</span>{u.club?.name && <span className="muted small">{u.club.name}</span>}<span className="muted tiny">{t("profile.since", { date: fmtDate(u.createdAt) })}</span></div>
            <div className="row mt8 nowrap"><div className="progress grow"><div style={{ width: `${Math.round(g.progress * 100)}%` }} /></div><span className="num small">{u.xp}{g.next ? ` / ${g.next}` : ""} XP</span></div>
            <div className="tiny muted mt8">{GRADES.map((x, i) => <span key={x.id} style={{ color: i <= g.index ? "var(--gold)" : undefined }}>{x[lang]}{i < GRADES.length - 1 ? " → " : ""}</span>)}</div>
          </div>
        </div>
      </Card>
      <div className="grid g2 split">
        <Card>
          <Kicker>🧪 {t("profile.managerStats")}</Kicker>
          <div className="grid g3 center">
            <Stat v={sm.elo} l={t("profile.elo")} c="var(--cyan)" /><Stat v={sm.played} l={t("profile.played")} /><Stat v={`${pct(sm)}%`} l={t("profile.winRate")} c="var(--lime)" />
            <Stat v={`${sm.won}-${sm.drawn}-${sm.lost}`} l={t("profile.wdl")} /><Stat v={`${sm.goalsFor}:${sm.goalsAgainst}`} l={t("profile.goals")} /><Stat v={sm.bestWinStreak ?? 0} l={t("profile.bestStreak")} c="var(--gold)" />
          </div>
        </Card>
        <Card>
          <Kicker color="var(--magenta)">🏟️ {t("profile.arenaStats")}</Kicker>
          <div className="grid g3 center">
            <Stat v={sa.played} l={t("profile.played")} /><Stat v={`${pct(sa)}%`} l={t("profile.winRate")} c="var(--lime)" /><Stat v={sa.goals} l={t("profile.goalsScored")} c="var(--magenta)" />
            <Stat v={sa.assists} l={t("profile.assists")} /><Stat v={sa.saves} l={t("profile.saves")} /><Stat v={sa.mvp} l={t("profile.mvp")} c="var(--gold)" />
          </div>
        </Card>
        {(() => {
          const h = (u.history || []).filter(x => x.mode === "manager" && x.eloDelta).slice().reverse();
          if (h.length < 2) return null;
          let elo = sm.elo - h.reduce((s, x) => s + x.eloDelta, 0); const pts = [elo]; for (const x of h) { elo += x.eloDelta; pts.push(elo); }
          const lo = Math.min(...pts) - 10, hi = Math.max(...pts) + 10, W = 300, H = 60;
          const d = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - lo) / (hi - lo)) * H}`).join(" ");
          return <Card style={{ gridColumn: "1 / -1" }}><Kicker>📈 {t("profile.eloCurve")}</Kicker><svg viewBox={`0 0 ${W} ${H}`} width="100%" height="70" preserveAspectRatio="none" aria-hidden="true"><polyline points={d} fill="none" stroke="#00F0FF" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></Card>;
        })()}
      </div>
      <Card className="mt16">
        <Kicker color="var(--lime)">📜 {t("profile.publications", { n: u.achievements.length, total: ACHIEVEMENTS.length })}</Kicker>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {ACHIEVEMENTS.map(a => { const on = u.achievements.includes(a.id); return (
            <div key={a.id} className="card tight" style={{ opacity: on ? 1 : .38, borderColor: on ? "var(--lime)" : undefined }} title={a[lang].desc}>
              <div className="row nowrap"><span style={{ fontSize: 24, filter: on ? "none" : "grayscale(1)" }}>{a.icon}</span><div><div style={{ fontWeight: 800, fontSize: 14 }}>{a[lang].name}</div><div className="tiny muted">{a[lang].desc}</div></div></div>
            </div>); })}
        </div>
      </Card>
      <Card className="mt16">
        <Kicker>🗂️ {t("profile.history")}</Kicker>
        {u.history?.length ? (
          <table className="table"><thead><tr><th>{t("profile.date")}</th><th>{t("profile.mode")}</th><th>{t("profile.opponent")}</th><th>{t("profile.score")}</th><th>XP</th><th>ELO</th></tr></thead>
            <tbody>{u.history.map((h, i) => <tr key={i}><td className="small">{fmtDate(h.date)}</td><td>{h.mode === "manager" ? "🧪" : "🏟️"}</td><td className="small">{h.opponentName}</td><td><span className="num" style={{ color: h.result === "W" ? "var(--lime)" : h.result === "L" ? "var(--coral)" : "var(--gold)" }}>{h.result} {h.score}</span></td><td className="num small">+{h.xp}</td><td className="num small">{h.eloDelta ? (h.eloDelta > 0 ? "+" : "") + h.eloDelta : "—"}</td></tr>)}</tbody></table>
        ) : <p className="muted small">{t("profile.noHistory")}</p>}
      </Card>
      {own && (
        <Card className="mt16">
          <Kicker color="var(--coral)">⚙️ {t("profile.account")}</Kicker>
          <div className="row"><button className="btn ghost" onClick={() => { logout(); navigate("/"); }}>{t("profile.logout")}</button><button className="btn ghost" onClick={() => setModal("pw")}>{t("profile.changePassword")}</button><button className="btn danger" onClick={() => setModal("delete")}>{t("profile.delete")}</button></div>
          <p className="tiny muted mt8">{t("account.privacy")}</p>
        </Card>
      )}
      {modal && (
        <Modal title={t(modal === "delete" ? "profile.deleteTitle" : "profile.changePassword")} onClose={() => { setModal(null); setPw(""); setPw2(""); setMerr(""); }}>
          <form className="col" onSubmit={async e => {
            e.preventDefault(); setMerr("");
            try {
              if (modal === "delete") { await deleteAccount(pw); toast(t("profile.deleted"), "var(--coral)"); navigate("/"); }
              else { await changePassword(pw, pw2); toast(t("profile.passwordChanged"), "var(--lime)"); setModal(null); }
            } catch (x) { setMerr(t("error." + (x.code || "NETWORK"))); }
          }}>
            {modal === "delete" && <p className="small" style={{ lineHeight: 1.6 }}>{t("profile.deleteWarn")}</p>}
            <input className="input" type="password" placeholder={t(modal === "delete" ? "account.password" : "profile.oldPassword")} value={pw} onChange={e => setPw(e.target.value)} required autoComplete="current-password" />
            {modal === "pw" && <input className="input" type="password" placeholder={t("profile.newPassword")} value={pw2} onChange={e => setPw2(e.target.value)} required minLength={6} autoComplete="new-password" />}
            {merr && <div className="error">{merr}</div>}
            <button className={"btn " + (modal === "delete" ? "danger" : "primary")}>{t(modal === "delete" ? "profile.deleteConfirm" : "common.save")}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Stat({ v, l, c }) { return <div><div className="num" style={{ fontSize: 24, color: c || "var(--white)" }}>{v}</div><div className="tiny muted">{l}</div></div>; }
