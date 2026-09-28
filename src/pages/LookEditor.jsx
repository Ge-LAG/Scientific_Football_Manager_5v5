// Vestiaire : personnalisation détaillée de l'apparence de ses scientifiques (visible de tous en ligne),
// aperçu 3D en direct, choix des 2 power-ups préférés.
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/index.jsx";
import { useSession } from "../store/session.jsx";
import { Card, Kicker, Avatar, Seg } from "../ui/components.jsx";
import { LoadoutPicker } from "../ui/LoadoutPicker.jsx";
import { StatsEditor } from "../ui/StatsEditor.jsx";
import { ArchetypeBadge, RoleFit, useMyPlayer } from "../ui/profile.jsx";
import { composeBio } from "../../shared/data/profileText.js";
import { PLAYERS, getPlayer, pText, sanitizeLoadout } from "../../shared/data/content.js";
import { APPEARANCE_OPTIONS, APPEARANCE_LABELS, defaultAppearance, sanitizeAppearance } from "../../shared/data/appearance.js";
import { reloadOnChunkError } from "../net/reload.js";

const TABS = {
  body: ["build", "skin"],
  face: ["faceShape", "eyeShape", "eyes", "eyeColor", "brows", "nose"],
  hair: ["hairStyle", "hairColor", "facialHair", "facialHairColor"],
  style: ["outfit", "outfitColor", "shoeColor"],
  gear: ["glasses", "headwear", "accessory"],
};
const PALETTE = { hairColor: "hair", facialHairColor: "hair", eyeColor: "eye", outfitColor: "outfit", shoeColor: "shoe" };
const ACTIONS = ["idle", "run", "sprint", "charge", "celebrate", "stunned"];
const TEAM_COLORS = ["#00F0FF", "#FF00E5", "#B8FF00", "#FFD700"];
const pick = a => a[Math.floor(Math.random() * a.length)];

export default function LookEditor({ id, tab: routeTab, navigate }) {
  const { t, lang } = useI18n();
  const { looks, setLook, loadouts, setLoadout, settings, statAlloc, setCharStats } = useSession();
  const mode = routeTab === "stats" ? "stats" : "look"; // Apparence / Caractéristiques
  const my = useMyPlayer();
  const go = (cid, m = mode) => navigate("/look/" + cid + (m === "stats" ? "/stats" : ""));
  const charId = getPlayer(id) ? id : PLAYERS[0].id;
  const p = getPlayer(charId);
  const saved = looks[charId] ? sanitizeAppearance(looks[charId], charId) : null;
  const look = saved || defaultAppearance(charId);
  const [tab, setTab] = useState("hair");
  const [action, setAction] = useState("idle");
  const [frame, setFrame] = useState("body");
  const [team, setTeam] = useState(TEAM_COLORS[0]);
  const [undo, setUndo] = useState([]);
  const stageRef = useRef(null); const prevRef = useRef(null);
  const L = (group, v) => APPEARANCE_LABELS[group]?.[v]?.[lang] || v;

  // aperçu 3D (Three.js chargé à la demande)
  useEffect(() => {
    let dead = false;
    import("../three/avatarPreview.js").catch(reloadOnChunkError).then(m => {
      if (dead || !stageRef.current || !m) return;
      prevRef.current = m.createAvatarPreview(stageRef.current, { charId, appearance: look, teamColor: team, quality: settings.quality === "low" ? "medium" : "high", action });
    });
    return () => { dead = true; prevRef.current?.dispose(); prevRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { prevRef.current?.setChar(charId, look); setUndo([]); }, [charId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { prevRef.current?.setAppearance(look); }, [JSON.stringify(look)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { prevRef.current?.setAction(action); }, [action]);
  useEffect(() => { prevRef.current?.setZoom(frame === "face" ? 1 : 0); }, [frame]);
  useEffect(() => { prevRef.current?.setTeamColor(team); }, [team]);

  // chaque modification est enregistrée aussitôt (appareil + compte) ; on garde un historique pour annuler
  const lastEdit = useRef({ f: null, t: 0 });
  const commit = (next, f = null) => {
    const now = Date.now(); const same = f && lastEdit.current.f === f && now - lastEdit.current.t < 800;
    lastEdit.current = { f, t: now };
    if (!same) setUndo(u => [...u.slice(-29), look]);
    setLook(charId, sanitizeAppearance(next, charId));
  };
  const change = (f, v) => commit({ ...look, [f]: v }, f);
  const randomize = () => {
    const O = APPEARANCE_OPTIONS, P = O.palettes;
    commit({ build: pick(O.build), skin: Math.round(Math.random() * 20) / 20, faceShape: pick(O.faceShape || [look.faceShape]), eyeShape: pick(O.eyeShape || [look.eyeShape]), brows: pick(O.brows || [look.brows]), nose: pick(O.nose || [look.nose]), hairStyle: pick(O.hairStyle), hairColor: pick(P.hair), facialHair: pick(O.facialHair), facialHairColor: pick(P.hair),
      eyes: pick(O.eyes), eyeColor: pick(P.eye), glasses: Math.random() < 0.5 ? "none" : pick(O.glasses), headwear: Math.random() < 0.45 ? "none" : pick(O.headwear), outfit: pick(O.outfit),
      outfitColor: pick(P.outfit), accessory: Math.random() < 0.4 ? "none" : pick(O.accessory), shoeColor: pick(P.shoe) });
  };
  const customized = useMemo(() => new Set(Object.keys(looks)), [looks]);

  const field = f => {
    if (f === "skin") return (
      <div key={f} className="look-field">
        <label className="label" htmlFor="skin">{L("fields", f)}</label>
        <input id="skin" className="range skin-range" type="range" min="0" max="1" step="0.05" value={look.skin} onChange={e => change("skin", +e.target.value)} />
      </div>);
    if (PALETTE[f]) {
      const pal = APPEARANCE_OPTIONS.palettes[PALETTE[f]];
      return (
        <div key={f} className="look-field">
          <div className="label">{L("fields", f)}</div>
          <div className="swatches" role="radiogroup" aria-label={L("fields", f)}>
            {pal.map(c => <button key={c} type="button" role="radio" aria-checked={look[f] === c} className={"swatch" + (look[f] === c ? " on" : "")} style={{ background: c }} title={c} onClick={() => change(f, c)} />)}
            <label className="swatch custom" title={t("look.customColor")} style={{ background: pal.includes(look[f]) ? undefined : look[f] }}>
              <input type="color" value={look[f]} onChange={e => change(f, e.target.value)} aria-label={t("look.customColor")} />🎨
            </label>
          </div>
        </div>);
    }
    const opts = APPEARANCE_OPTIONS[f];
    if (!Array.isArray(opts)) return null; // champ absent de cette version du modèle d'apparence
    const groups = [["", opts]]; // toutes les coiffures ensemble (les mulets ne sont pas une catégorie à part)
    return (
      <div key={f} className="look-field">
        <div className="label">{L("fields", f)}</div>
        {groups.map(([title, list]) => (
          <div key={title || "all"}>
            {title && <div className="tiny look-sub">🦁 {title}</div>}
            <div className="opt-grid" role="radiogroup" aria-label={L("fields", f)}>
              {list.map(o => <button key={o} type="button" role="radio" aria-checked={look[f] === o} className={"opt" + (look[f] === o ? " on" : "")} onClick={() => change(f, o)}>{L(f, o)}</button>)}
            </div>
          </div>
        ))}
      </div>);
  };

  return (
    <div className="page" style={{ maxWidth: 1320 }}>
      <div className="row between mb8" style={{ alignItems: "flex-end" }}>
        <div><h1 className="h1" style={{ marginBottom: 4 }}>🎨 {t("look.title")}</h1><p className="muted small" style={{ margin: 0 }}>{t("look.lead")}</p></div>
        <span className="chip" style={{ color: "var(--lime)" }}>👁️ {t("look.visible")}</span>
      </div>
      <div className="look-chars" role="tablist" aria-label={t("look.chooseChar")}>
        {PLAYERS.map(x => (
          <button key={x.id} role="tab" aria-selected={x.id === charId} className={"look-char" + (x.id === charId ? " on" : "")} style={{ "--pc": x.color }} onClick={() => go(x.id)}>
            <Avatar player={x} size={36} showNum={false} /><span className="tiny">{x.nom}</span>{(customized.has(x.id) || statAlloc?.[x.id]) && <span className="look-dot" title={t("look.customized")} />}
          </button>
        ))}
      </div>
      <div className="look-grid">
        <Card elevated className="look-stage">
          <div className="row between"><Kicker color={p.color}>{p.nom} · {pText(p, lang).poste}</Kicker><span className="tiny muted">#{p.numero} · {p.taille.toFixed(2)} m</span></div>
          <div ref={stageRef} className="look-canvas" aria-label={t("look.preview", { name: p.nom })} role="img" />
          <div className="row mt8" style={{ gap: 4, flexWrap: "wrap" }}>{ACTIONS.map(a => <button key={a} type="button" className={"btn small " + (action === a ? "primary" : "ghost")} onClick={() => setAction(a)}>{t("look.action." + a)}</button>)}</div>
          <div className="row between mt8">
            <Seg value={frame} onChange={setFrame} options={[{ value: "body", label: t("look.frame.body") }, { value: "face", label: t("look.frame.face") }]} />
            <div className="row" style={{ gap: 4 }} role="radiogroup" aria-label={t("look.team")}><span className="tiny muted">{t("look.team")}</span>{TEAM_COLORS.map(c => <button key={c} type="button" role="radio" aria-checked={team === c} className={"swatch small" + (team === c ? " on" : "")} style={{ background: c }} onClick={() => setTeam(c)} />)}</div>
          </div>
          <p className="tiny muted mt8">{t("look.teamNote")}</p>
        </Card>
        <div className="col" style={{ gap: 16 }}>
          <Seg value={mode} onChange={m => go(charId, m)} options={[{ value: "look", label: "🎨 " + t("look.mode.look") }, { value: "stats", label: "📊 " + t("look.mode.stats") }]} />
          {mode === "stats" ? (
            <>
              <Card>
                <Kicker color="var(--lime)">📊 {t("stats.title", { name: p.nom })}</Kicker>
                <StatsEditor charId={charId} value={statAlloc?.[charId] || null} onChange={v => setCharStats(charId, v)} />
              </Card>
              <Card>
                <div className="row between mb8"><ArchetypeBadge player={my(charId)} /><span className="tiny muted">{t("profile.roleFit")}</span></div>
                <RoleFit player={my(charId)} all />
                <div className="small mt16" style={{ fontStyle: "italic", lineHeight: 1.7 }}>{composeBio(my(charId), my(charId).attributs, lang)}</div>
                <p className="tiny muted mt8">{t("stats.bioNote")}</p>
              </Card>
            </>
          ) : (
          <Card>
            <Seg value={tab} onChange={setTab} options={Object.keys(TABS).map(k => ({ value: k, label: t("look.tab." + k) }))} />
            <div className="mt16">{TABS[tab].map(field)}</div>
            <div className="row mt16" style={{ gap: 6, flexWrap: "wrap" }}>
              <button className="btn small gold" onClick={randomize}>🎲 {t("look.random")}</button>
              <button className="btn small ghost" disabled={!undo.length} onClick={() => { const prev = undo[undo.length - 1]; setUndo(u => u.slice(0, -1)); setLook(charId, prev); }}>↶ {t("look.undo")}</button>
              <button className="btn small ghost" disabled={!saved} onClick={() => { setUndo(u => [...u, look]); setLook(charId, null); }}>↺ {t("look.reset")}</button>
              <span className="tiny muted grow" style={{ textAlign: "right" }}>✓ {t("look.autosave")}</span>
            </div>
          </Card>
          )}
          <Card>
            <Kicker color="var(--magenta)">⚡ {t("look.loadout")}</Kicker>
            <p className="tiny muted mb8">{t("look.loadoutHelp")}</p>
            <LoadoutPicker charId={charId} value={loadouts[charId]} mode="arena" onChange={ids => setLoadout(charId, sanitizeLoadout(charId, ids))} />
          </Card>
        </div>
      </div>
    </div>
  );
}
