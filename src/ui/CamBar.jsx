// Barre de caméras de la vue 3D (match Manager, spectateurs de l'Arène).
import { useI18n } from "../i18n/index.jsx";
import { getPlayer } from "../../shared/data/content.js";

export const CAM_ICONS = { auto: "🎬", tv: "📺", tactical: "🛰️", goal: "🥅", ball: "⚽", player: "🏃", free: "🕹️" };

export function CamBar({ mode, follow = -1, slots = [], onMode, onFollow, fullscreen, onFullscreen, onZoom }) {
  const { t } = useI18n();
  return (
    <div className="cam-bar" role="toolbar" aria-label={t("cam.title")}>
      {Object.keys(CAM_ICONS).map(m => (
        <button key={m} className={mode === m ? "on" : ""} aria-pressed={mode === m} title={t("cam." + m + ".hint")} onClick={() => onMode(m)}>
          <span aria-hidden="true">{CAM_ICONS[m]}</span><span className="lbl">{t("cam." + m)}</span>
        </button>
      ))}
      {mode === "player" && (
        <select value={follow} onChange={e => onFollow(+e.target.value)} aria-label={t("cam.follow")}>
          <option value={-1}>{t("cam.followBall")}</option>
          {slots.map(s => <option key={s.slot} value={s.slot}>{s.team === 0 ? "◧" : "◨"} {getPlayer(s.charId)?.nom}</option>)}
        </select>
      )}
      {onZoom && mode !== "free" && <>
        <button onClick={() => onZoom(+1)} title={t("cam.closer")} aria-label={t("cam.closer")}>🔍+ <span className="lbl">{t("cam.closer")}</span></button>
        <button onClick={() => onZoom(-1)} title={t("cam.farther")} aria-label={t("cam.farther")}>🔍− <span className="lbl">{t("cam.farther")}</span></button>
      </>}
      {onFullscreen && <button onClick={onFullscreen} title={t("cam.fullscreen")} aria-label={t("cam.fullscreen")}>{fullscreen ? "🗗" : "⛶"}</button>}
      {mode === "free" && <span className="cam-hint">{t("cam.freeHint")}</span>}
    </div>
  );
}
