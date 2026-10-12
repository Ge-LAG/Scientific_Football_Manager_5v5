// Profil d'un scientifique tel que le joueur l'a configuré : archétype, poste idéal, forces / faiblesses, bio adaptée.
import { useCallback } from "react";
import { useI18n } from "../i18n/index.jsx";
import { useSession } from "../store/session.jsx";
import { getPlayer, withStats } from "../../shared/data/content.js";
import { archetypeOf, roleFit } from "../../shared/data/profileText.js";

// Renvoie une fonction id → scientifique avec MA répartition de points (profil par défaut sinon).
export function useMyPlayer() {
  const { statAlloc } = useSession();
  return useCallback(id => withStats(getPlayer(id), statAlloc?.[id]), [statAlloc]);
}

export function ArchetypeBadge({ player, small }) {
  const { lang } = useI18n();
  const a = archetypeOf(player.attributs);
  return <span className="archetype-badge" style={{ "--pc": player.color, fontSize: small ? 11 : undefined }} title={a.desc?.[lang] || a[lang]}>{a.icon} {a[lang]}</span>;
}

// poste le plus adapté (et son affinité en %)
export function RoleFit({ player, all }) {
  const { t } = useI18n();
  const fits = roleFit(player.attributs);
  if (all) return <div className="role-fits">{fits.map(r => <div key={r.role} className="role-fit-row"><span>{t("role." + r.role)}</span><div className="track"><div className="fill" style={{ width: `${r.pct}%`, background: player.color }} /></div><b className="num">{r.pct}%</b></div>)}</div>;
  const r = fits[0];
  return <span className="role-fit" title={t("profile.roleFit")}>{t("role." + r.role)} <b className="num">{r.pct}%</b></span>;
}
