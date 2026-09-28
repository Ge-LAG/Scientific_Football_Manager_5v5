// Composants d'interface partagés (style néon hérité du prototype).
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ATTRS, attrName, pText, domainName } from "../../shared/data/content.js";
import { useI18n } from "../i18n/index.jsx";
import { useSession as useSessionLazy } from "../store/session.jsx";
import { ArchetypeBadge, RoleFit } from "./profile.jsx";

export function Card({ children, className = "", onClick, style, elevated, selected, tight, ...rest }) {
  const cls = ["card", onClick && "clickable", elevated && "elevated", selected && "selected", tight && "tight", className].filter(Boolean).join(" ");
  return <div className={cls} onClick={onClick} style={style} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? e => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick(e)) : undefined} {...rest}>{children}</div>;
}

export function Kicker({ children, color }) { return <div className="kicker" style={color ? { color } : undefined}>{children}</div>; }

// les dégradés avec transparence exigent des couleurs hexadécimales (pas de var(--x) concaténé)
const HEX = { "var(--lime)": "#B8FF00", "var(--cyan)": "#00F0FF", "var(--coral)": "#FF3366", "var(--gold)": "#FFD700", "var(--magenta)": "#FF00E5", "var(--violet)": "#8B5CF6" };
export function StatBar({ label, value, max = 99, color }) {
  const c0 = color || (value >= 80 ? "var(--lime)" : value >= 65 ? "var(--cyan)" : "var(--coral)");
  const c = HEX[c0] || c0;
  return (
    <div className="statbar">
      <div className="top"><span>{label}</span><span className="num" style={{ color: c }}>{Math.round(value)}</span></div>
      <div className="track"><div className="fill" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: `linear-gradient(90deg, ${c}88, ${c})`, boxShadow: `0 0 8px ${c}` }} /></div>
    </div>
  );
}

export function RadarChart({ player, size = 200, color = "#00F0FF", compare }) {
  const { lang } = useI18n();
  const cx = size / 2, cy = size / 2, r = size * 0.34, step = (2 * Math.PI) / ATTRS.length, pad = size * 0.2;
  const pt = (i, v) => { const a = i * step - Math.PI / 2; return [cx + r * v * Math.cos(a), cy + r * v * Math.sin(a)]; };
  const poly = p => ATTRS.map((k, i) => pt(i, (p.attributs[k] || 50) / 99).join(",")).join(" ");
  return (
    <svg width="100%" viewBox={`${-pad} ${-pad / 3} ${size + pad * 2} ${size + pad * 2 / 3}`} style={{ maxWidth: size + pad * 2 }} role="img" aria-label={ATTRS.map(k => `${attrName(k, lang)} ${player.attributs[k]}`).join(", ")}>
      {[0.25, 0.5, 0.75, 1].map(l => <polygon key={l} points={ATTRS.map((_, i) => pt(i, l).join(",")).join(" ")} fill="none" stroke="rgba(0,240,255,0.12)" />)}
      {ATTRS.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(0,240,255,0.14)" />; })}
      {compare && <polygon points={poly(compare)} fill="rgba(255,0,229,0.12)" stroke="#FF00E5" strokeWidth="1.5" strokeDasharray="4 3" />}
      <polygon points={poly(player)} fill={`${color}26`} stroke={color} strokeWidth="2" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      {ATTRS.map((k, i) => { const [x, y] = pt(i, (player.attributs[k] || 50) / 99); return <circle key={k} cx={x} cy={y} r="3" fill={color} />; })}
      {ATTRS.map((k, i) => { const [x, y] = pt(i, 1.22); const a = Math.cos(i * step - Math.PI / 2); return <text key={k} x={x} y={y} fill="#aab3c5" fontSize={size * 0.058} textAnchor={a > 0.3 ? "start" : a < -0.3 ? "end" : "middle"} dominantBaseline="middle">{attrName(k, lang)} {player.attributs[k]}</text>; })}
    </svg>
  );
}

// Avatar 2D stylisé : initiales, couleur de domaine, numéro.
export function Avatar({ player, size = 44, ring, showNum = true }) {
  const c = player.color;
  return (
    <div className="avatar" style={{ width: size, height: size, color: c, background: `radial-gradient(circle at 35% 30%, ${c}55, ${c}10 70%)`, border: `${Math.max(2, size / 20)}px solid ${ring || c}`, fontSize: size * 0.36, boxShadow: `0 0 ${size / 3}px ${c}44` }} aria-hidden="true">
      <span style={{ color: "#fff", textShadow: `0 0 8px ${c}` }}>{player.nom.slice(0, 2)}</span>
      {showNum && size >= 40 && <span className="num-tag">{player.numero}</span>}
    </div>
  );
}

export function PlayerCard({ player, onClick, selected, extra, dim }) {
  const { lang } = useI18n(); const tx = pText(player, lang);
  return (
    <Card className="pcard" onClick={onClick} selected={selected} style={{ "--pc": player.color, opacity: dim ? 0.45 : 1 }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <span className="chip" style={{ color: player.color }}>{tx.poste}</span>
        <ArchetypeBadge player={player} small />
      </div>
      <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 10px" }}><Avatar player={player} size={70} /></div>
      <div className="name">{player.nom}</div>
      <div className="small" style={{ color: player.color, marginBottom: 4 }}>{domainName(player.domaine, lang)}</div>
      <div className="mb8"><RoleFit player={player} /></div>
      <div className="tiny muted" style={{ fontStyle: "italic", minHeight: 30 }}>« {tx.slogan} »</div>
      <div className="row mt8" style={{ justifyContent: "center", gap: 4 }}>{tx.traits.map(x => <span key={x} className="chip" style={{ color: "#8a93a6" }}>{x}</span>)}</div>
      {extra}
    </Card>
  );
}

export function PlayerRow({ player, right, onClick, selected, sub }) {
  const { lang } = useI18n();
  return (
    <Card tight className="prow" onClick={onClick} selected={selected}>
      <Avatar player={player} size={36} showNum={false} />
      <div className="grow"><div className="name">{player.nom} <span className="tiny muted">#{player.numero}</span></div><div className="tiny" style={{ color: player.color }}>{sub ?? pText(player, lang).poste}</div></div>
      {right ?? <RoleFit player={player} />}
    </Card>
  );
}

export function Crest({ club, size = 46 }) {
  const c = club?.colors?.[0] || "#00F0FF";
  return <div className="crest" style={{ color: c, width: size, height: size, fontSize: size * 0.52, background: `linear-gradient(135deg, ${c}33, ${club?.colors?.[1] || "#0a0a12"})` }} aria-hidden="true">{club?.crest || "🧬"}</div>;
}

export function Seg({ value, options, onChange, label }) {
  return <div className="seg" role="radiogroup" aria-label={label}>{options.map(o => <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}

export function Modal({ children, onClose, title }) {
  useEffect(() => { const k = e => e.key === "Escape" && onClose?.(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="modal-back" onClick={e => e.target === e.currentTarget && onClose?.()} role="dialog" aria-modal="true" aria-label={title}>
      <Card elevated className="modal">{title && <div className="h2">{title}</div>}{children}</Card>
    </div>
  );
}

export function Spinner({ label }) { return <div className="row" style={{ justifyContent: "center", padding: 24 }}><div className="spinner" /><span className="muted">{label}</span></div>; }

// ── Notifications ─────────────────────────────────────────
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((text, color = "var(--cyan)", ms = 3800) => { const id = Math.random(); setList(l => [...l.slice(-4), { id, text, color }]); setTimeout(() => setList(l => l.filter(x => x.id !== id)), ms); }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="toasts" aria-live="polite">{list.map(x => <div key={x.id} className="toast" style={{ borderColor: x.color }}>{x.text}</div>)}</div></ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

export const fmtClock = (ticks, perMin = 60) => { const m = Math.floor(ticks / perMin); return `${m}'`; };
export const fmtSec = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Nom d'invité pour le jeu en ligne sans compte
export function GuestName() {
  const { t } = useI18n(); const { user, guestName, setGuestName } = useSessionLazy();
  if (user) return null;
  return (
    <div className="mb16">
      <label className="label" htmlFor="guest-hub">{t("account.guestName")}</label>
      <input id="guest-hub" className="input" maxLength={16} value={guestName} placeholder={t("account.guestPlaceholder")} onChange={e => setGuestName(e.target.value.replace(/[^\p{L}\p{N}_\-. ]/gu, ""))} />
    </div>
  );
}
