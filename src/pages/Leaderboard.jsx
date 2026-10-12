import { useEffect, useState } from "react";
import { useI18n } from "../i18n/index.jsx";
import { useSession } from "../store/session.jsx";
import { Card, Seg, Spinner } from "../ui/components.jsx";
import { gradeOf } from "../../shared/progression.js";

export default function Leaderboard({ navigate }) {
  const { t, lang } = useI18n();
  const { api, user, serverUp } = useSession();
  const [mode, setMode] = useState("manager");
  const [rows, setRows] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { setRows(null); setErr(null); api(`/api/leaderboard?mode=${mode}`).then(d => setRows(d.rows), e => setErr(e.code)); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="page mid">
      <h1 className="h1">{t("lb.title")}</h1>
      <p className="lead">{t("lb.lead")}</p>
      <div className="mb16"><Seg value={mode} onChange={setMode} options={[{ value: "manager", label: "🧪 " + t("nav.manager") }, { value: "arena", label: "🏟️ " + t("nav.arena") }]} /></div>
      <Card>
        {serverUp === false ? <p className="error">{t("home.offline")}</p> : err ? <p className="error">{t("error." + err)}</p> : !rows ? <Spinner label={t("common.loading")} /> : rows.length === 0 ? <p className="muted">{t("lb.empty")}</p> : (
          <table className="table">
            <thead><tr><th>#</th><th>{t("account.pseudo")}</th><th>{t("lb.grade")}</th>{mode === "manager" ? <th>ELO</th> : <th>{t("profile.goalsScored")}</th>}<th>{t("profile.played")}</th><th>{t("profile.wdl")}</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={r.pseudo} className={user?.pseudo === r.pseudo ? "me" : ""} style={{ cursor: "pointer" }} onClick={() => navigate(`/u/${encodeURIComponent(r.pseudo)}`)}>
                <td className="num" style={{ color: i < 3 ? ["var(--gold)", "#c0c0c0", "#cd7f32"][i] : undefined }}>{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td>
                <td style={{ fontWeight: 700 }}>{r.pseudo}</td>
                <td className="small muted">{gradeOf(r.xp || 0)[lang]}</td>
                <td className="num" style={{ color: "var(--cyan)" }}>{mode === "manager" ? r.elo : r.goals ?? 0}</td>
                <td className="num">{r.played}</td>
                <td className="num small">{r.won}-{r.drawn}-{r.lost}</td>
              </tr>))}</tbody>
          </table>
        )}
      </Card>
      <p className="tiny muted mt8">{t(mode === "manager" ? "lb.noteManager" : "lb.noteArena")}</p>
    </div>
  );
}
