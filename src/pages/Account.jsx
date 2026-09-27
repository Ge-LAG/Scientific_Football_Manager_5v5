import { useState } from "react";
import { useI18n } from "../i18n/index.jsx";
import { useSession } from "../store/session.jsx";
import { Card, Seg, useToast } from "../ui/components.jsx";

export default function Account({ navigate }) {
  const { t } = useI18n();
  const { login, user, serverUp, guestName, setGuestName } = useSession();
  const toast = useToast();
  const [mode, setMode] = useState("login");
  const [pseudo, setPseudo] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  if (user) return <div className="page narrow"><Card><p>{t("account.already", { pseudo: user.pseudo })}</p><button className="btn primary mt16" onClick={() => navigate("/profile")}>{t("home.seeProfile")}</button></Card></div>;

  const submit = async e => {
    e.preventDefault(); setErr("");
    if (mode === "register" && pw !== pw2) return setErr(t("error.PASSWORD_MISMATCH"));
    setBusy(true);
    try { const u = await login(pseudo.trim(), pw, mode === "register"); toast(t(mode === "register" ? "account.created" : "account.welcome", { pseudo: u.pseudo }), "var(--lime)"); navigate("/"); }
    catch (x) { setErr(t("error." + (x.code || "NETWORK"))); }
    finally { setBusy(false); }
  };
  return (
    <div className="page narrow">
      <h1 className="h1">{t(mode === "login" ? "account.loginTitle" : "account.registerTitle")}</h1>
      <p className="lead">{t("account.lead")}</p>
      <Card elevated>
        <div className="mb16"><Seg value={mode} onChange={m => { setMode(m); setErr(""); }} options={[{ value: "login", label: t("account.login") }, { value: "register", label: t("account.register") }]} /></div>
        <form className="col" onSubmit={submit}>
          <div><label className="label" htmlFor="pseudo">{t("account.pseudo")}</label><input id="pseudo" className="input" autoComplete="username" value={pseudo} onChange={e => setPseudo(e.target.value)} maxLength={20} required minLength={3} placeholder="DjilaniLeMur" /></div>
          <div><label className="label" htmlFor="pw">{t("account.password")}</label><input id="pw" className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={pw} onChange={e => setPw(e.target.value)} required minLength={6} maxLength={128} /></div>
          {mode === "register" && <div><label className="label" htmlFor="pw2">{t("account.confirm")}</label><input id="pw2" className="input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} required minLength={6} /></div>}
          {err && <div className="error" role="alert">{err}</div>}
          <button className="btn primary block" disabled={busy || serverUp === false}>{busy ? "…" : t(mode === "login" ? "account.login" : "account.register")}</button>
          {serverUp === false && <div className="error small">{t("home.offline")}</div>}
        </form>
        <div className="divider" />
        <div className="small muted" style={{ lineHeight: 1.6 }}>🔒 {t("account.privacy")}</div>
        {mode === "register" && <div className="small muted mt8">{t("account.rules")}</div>}
      </Card>
      <Card className="mt16">
        <label className="label" htmlFor="guest">{t("account.guestName")}</label>
        <div className="row nowrap"><input id="guest" className="input" maxLength={16} value={guestName} onChange={e => setGuestName(e.target.value.replace(/[^\p{L}\p{N}_\-. ]/gu, ""))} placeholder={t("account.guestPlaceholder")} /><button className="btn ghost" onClick={() => navigate("/")}>{t("account.playGuest")}</button></div>
        <p className="tiny muted mt8">{t("account.guestNote")}</p>
      </Card>
    </div>
  );
}
