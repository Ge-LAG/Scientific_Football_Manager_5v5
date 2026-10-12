// Vote « Revanche » en fin de match en ligne : bouton + compteur de voix, puis le code de la nouvelle salle.
import { useI18n } from "../i18n/index.jsx";

export function Rematch({ rematch, onVote, onJoin }) {
  const { t } = useI18n();
  if (!rematch) return null;
  if (rematch.code) return (
    <span className="chip" style={{ color: "var(--gold)", fontSize: 15, padding: "8px 12px" }}>
      ⚔ {t("rematch.ready", { code: rematch.code })}
      <button className="btn small cyan" style={{ marginLeft: 10 }} onClick={() => onJoin(rematch.code)}>{t("rematch.join")}</button>
    </span>
  );
  return (
    <button className="btn magenta" disabled={rematch.you} onClick={onVote} title={t("rematch.hint")}>
      ⚔ {rematch.you ? t("rematch.voted") : t("rematch.vote")} · {t("rematch.count", { v: rematch.votes, n: rematch.humans })}
    </button>
  );
}
