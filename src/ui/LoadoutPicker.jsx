// Choix des 2 power-ups emportés parmi les 4 d'un scientifique (Manager et Arène).
import { useI18n } from "../i18n/index.jsx";
import { getPlayer, sanitizeLoadout, puText, typeName, LOADOUT_SIZE } from "../../shared/data/content.js";

const TYPE_ICON = { attaque: "⚔️", "défense": "🛡️", "contrôle": "🎯", mental: "🧠" };

// mode : "manager" (effets sur les caractéristiques) ou "arena" (effet en jeu d'action)
export function LoadoutPicker({ charId, value, onChange, mode = "arena", compact = false, disabled = false }) {
  const { t, lang } = useI18n();
  const p = getPlayer(charId); if (!p) return null;
  const cur = sanitizeLoadout(charId, value);
  const toggle = id => {
    if (disabled) return;
    if (cur.includes(id)) return; // toujours 2 power-ups : on remplace plutôt qu'on retire
    onChange(sanitizeLoadout(charId, [...cur.slice(1), id].slice(-LOADOUT_SIZE)));
  };
  return (
    <div className={"loadout" + (compact ? " compact" : "")} role="group" aria-label={t("loadout.title", { name: p.nom })}>
      {p.powerUps.map((pu, i) => {
        const on = cur.includes(pu.id); const tx = puText(pu, lang); const slot = cur.indexOf(pu.id);
        return (
          <button key={pu.id} type="button" className={"lo-item" + (on ? " on" : "")} aria-pressed={on} disabled={disabled} onClick={() => toggle(pu.id)}
            style={{ "--pc": p.color }} title={`${tx.nom} — ${mode === "arena" ? tx.arena : tx.effets}`}>
            <span className="lo-key">{on ? (slot === 0 ? t("loadout.k1") : t("loadout.k2")) : TYPE_ICON[pu.type] || "⚡"}</span>
            <span className="lo-body">
              <b>{tx.nom}{i === 0 && <span className="lo-orig" title={t("loadout.original")}> ★</span>}</b>
              {!compact && <span className="lo-desc">{mode === "arena" ? tx.arena : tx.effets}</span>}
              {!compact && <span className="lo-type">{TYPE_ICON[pu.type]} {typeName(pu.type, lang)}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
