// Réglages des contrôles : schéma (flèches + main gauche / clavier + souris), disposition du clavier,
// clavier visuel, réaffectation des touches et des boutons de manette, options (souris, touches contextuelles,
// changement de joueur automatique, vibrations).
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/index.jsx";
import { useSession } from "../store/session.jsx";
import { Seg } from "./components.jsx";
import { ACTIONS, KEY_PRESETS, controlsOf, resolveBindings, codeLabel, padLabel, conflicts, detectLayout } from "../three/controls.js";

export const ACTION_ICONS = { up: "⬆️", down: "⬇️", left: "⬅️", right: "➡️", sprint: "🏃", shoot: "🎯", pass: "👟", lob: "🌈", skill: "🌀", tackle: "🦶", slide: "🛷", switch: "🔄", call: "🙋", pu1: "⚡", pu2: "⚡", cam: "🎥", board: "📋", menu: "⏸️" };
const GROUP = { up: "move", down: "move", left: "move", right: "move", sprint: "move", shoot: "ball", pass: "ball", lob: "ball", skill: "ball", tackle: "def", slide: "def", switch: "meta", call: "meta", pu1: "pu", pu2: "pu", cam: "sys", board: "sys", menu: "sys" };
const GROUP_COLOR = { move: "#B8FF00", ball: "#00F0FF", def: "#8B5CF6", meta: "#FFD700", pu: "#FF00E5", sys: "#8a93a8" };

// clavier visuel (bloc gauche + flèches), positions physiques
const KB_ROWS = [
  ["Escape", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"],
  ["Tab", "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY"],
  ["CapsLock", "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH"],
  ["ShiftLeft", "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN"],
  ["ControlLeft", "AltLeft", "Space"],
];
const WIDE = { Tab: 1.4, CapsLock: 1.7, ShiftLeft: 2.1, ControlLeft: 1.4, AltLeft: 1.2, Space: 5.2, Escape: 1 };

export function ControlsPanel() {
  const { t, lang } = useI18n();
  const { settings, setSettings } = useSession();
  const c = controlsOf(settings); const b = resolveBindings(c);
  const [detected, setDetected] = useState(null);
  const [capture, setCapture] = useState(null); // { action, kind: "key" | "pad", index }
  const [padName, setPadName] = useState(null);
  const set = patch => setSettings({ controls: { ...c, ...patch } });
  const L = code => codeLabel(code, c.layout, lang);
  const dup = conflicts(b.keys);

  useEffect(() => { detectLayout().then(setDetected); }, []);
  // manette détectée
  useEffect(() => {
    const scan = () => { const p = [...(navigator.getGamepads?.() || [])].find(x => x && x.connected); setPadName(p ? p.id.replace(/\(.*?\)/g, "").trim().slice(0, 48) : null); };
    scan(); window.addEventListener("gamepadconnected", scan); window.addEventListener("gamepaddisconnected", scan);
    const h = setInterval(scan, 2000);
    return () => { window.removeEventListener("gamepadconnected", scan); window.removeEventListener("gamepaddisconnected", scan); clearInterval(h); };
  }, []);

  // capture d'une touche ou d'un bouton pour la réaffectation
  const capRef = useRef(capture); capRef.current = capture;
  useEffect(() => {
    if (!capture) return;
    if (capture.kind === "key") {
      const onKey = e => {
        e.preventDefault(); e.stopPropagation();
        const cap = capRef.current; if (!cap) return;
        if (e.code === "Escape" && cap.action !== "menu") { setCapture(null); return; }
        const keys = { ...b.keys };
        const list = [...(keys[cap.action] || [])];
        if (e.code === "Backspace" || e.code === "Delete") list.splice(cap.index, 1);
        else list[cap.index] = e.code;
        keys[cap.action] = [...new Set(list.filter(Boolean))].slice(0, 3);
        set({ keys }); setCapture(null);
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }
    // manette : on attend l'appui d'un nouveau bouton
    let raf = 0; let base = null;
    const poll = () => {
      const p = [...(navigator.getGamepads?.() || [])].find(x => x && x.connected);
      if (p) {
        const pressed = p.buttons.map(x => x.pressed || x.value > 0.5);
        if (!base) base = pressed;
        const i = pressed.findIndex((v, k) => v && !base[k]);
        if (i >= 0) { const pad = { ...b.pad }; const list = [...(pad[capture.action] || [])]; list[capture.index] = i; pad[capture.action] = [...new Set(list)].slice(0, 3); set({ pad }); setCapture(null); return; }
        base = base.map((v, k) => v && pressed[k]);
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    const esc = e => { if (e.code === "Escape") setCapture(null); };
    window.addEventListener("keydown", esc);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", esc); };
  }, [capture]); // eslint-disable-line react-hooks/exhaustive-deps

  const actionsOfKey = code => b.keyToActions.get(code) || [];
  const keyChip = (a, i) => {
    const code = b.keys[a][i]; const cap = capture?.kind === "key" && capture.action === a && capture.index === i;
    return <button key={i} type="button" className={"kbd bind" + (cap ? " cap" : "") + (code && dup.has(code) ? " dup" : "")} onClick={() => setCapture({ action: a, kind: "key", index: i })} aria-label={t("ctl.rebind", { action: t("controls." + a) })}>{cap ? t("ctl.pressKey") : code ? L(code) : "+"}</button>;
  };
  const padChip = (a, i) => {
    const btn = b.pad[a]?.[i]; const cap = capture?.kind === "pad" && capture.action === a && capture.index === i;
    return <button key={i} type="button" className={"kbd bind pad" + (cap ? " cap" : "")} onClick={() => setCapture({ action: a, kind: "pad", index: i })} aria-label={t("ctl.rebindPad", { action: t("controls." + a) })}>{cap ? t("ctl.pressButton") : btn != null ? padLabel(btn, c.padStyle) : "+"}</button>;
  };

  return (
    <div className="controls-panel">
      <div className="label">{t("ctl.scheme")}</div>
      <Seg value={c.preset} onChange={v => set({ preset: v, keys: null })} options={Object.keys(KEY_PRESETS).map(k => ({ value: k, label: t("ctl.scheme." + k) }))} />
      <p className="tiny muted mt8">{t("ctl.scheme." + c.preset + ".desc")}</p>

      <div className="label mt16">{t("ctl.layout")}</div>
      <Seg value={c.layout} onChange={v => set({ layout: v })} options={["auto", "azerty", "qwerty", "qwertz"].map(k => ({ value: k, label: k === "auto" ? t("ctl.layout.auto", { l: (detected || "…").toUpperCase() }) : k.toUpperCase() }))} />
      <p className="tiny muted mt8">{t("ctl.layoutNote")}</p>

      {/* clavier visuel : main gauche + flèches */}
      <div className="kb-visual mt16" aria-hidden="true">
        <div className="kb-left">
          {KB_ROWS.map((row, r) => <div key={r} className="kb-row">{row.map(code => { const acts = actionsOfKey(code); const g = acts[0] && GROUP[acts[0]];
            return <div key={code} className={"kb-key" + (acts.length ? " on" : "")} style={{ flex: WIDE[code] || 1, "--kc": g ? GROUP_COLOR[g] : undefined }}>
              <span className="kb-cap">{L(code)}</span>{acts.length > 0 && <span className="kb-act">{acts.map(a => ACTION_ICONS[a] + (a === "pu1" ? "1" : a === "pu2" ? "2" : "")).join(" ")}</span>}
            </div>; })}</div>)}
        </div>
        <div className="kb-arrows">
          {[["", "ArrowUp", ""], ["ArrowLeft", "ArrowDown", "ArrowRight"]].map((row, r) => <div key={r} className="kb-row">{row.map((code, i) => code ? <div key={code} className={"kb-key" + (actionsOfKey(code).length ? " on" : "")} style={{ "--kc": actionsOfKey(code).length ? GROUP_COLOR.move : undefined }}><span className="kb-cap">{L(code)}</span></div> : <div key={i} className="kb-key ghost" />)}</div>)}
          <div className="tiny muted center mt8">{c.preset === "arrows" ? t("ctl.rightHand") : ""}</div>
        </div>
      </div>
      <div className="kb-legend">{Object.entries(GROUP_COLOR).map(([g, col]) => <span key={g} className="tiny"><span className="dot" style={{ background: col }} /> {t("ctl.group." + g)}</span>)}</div>

      <div className="row between mt16"><div className="label" style={{ margin: 0 }}>{t("ctl.bindings")}</div>
        <div className="row"><button className="btn small ghost" onClick={() => set({ keys: null })}>↺ {t("ctl.resetKeys")}</button><button className="btn small ghost" onClick={() => set({ pad: null })}>↺ {t("ctl.resetPad")}</button></div></div>
      {dup.size > 0 && <p className="tiny" style={{ color: "var(--coral)" }}>⚠ {t("ctl.conflicts", { keys: [...dup].map(L).join(", ") })}</p>}
      <div style={{ overflowX: "auto" }}>
        <table className="table bind-table">
          <thead><tr><th>{t("help.action")}</th><th>{t("help.keyboard")}</th><th>{t("help.gamepad")}</th></tr></thead>
          <tbody>{ACTIONS.map(a => (
            <tr key={a}>
              <td className="small"><span className="dot" style={{ background: GROUP_COLOR[GROUP[a]] }} /> {ACTION_ICONS[a]} {t("controls." + a)}</td>
              <td><div className="row" style={{ gap: 4 }}>{[0, 1].map(i => (i < b.keys[a].length + 1 ? keyChip(a, i) : null))}</div></td>
              <td>{["up", "down", "left", "right"].includes(a) ? <span className="tiny muted">{t("controls.leftStick")}</span> : <div className="row" style={{ gap: 4 }}>{[0, 1].map(i => (i < (b.pad[a]?.length || 0) + 1 ? padChip(a, i) : null))}</div>}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <p className="tiny muted">{t("ctl.bindHelp")}</p>

      <div className="label mt16">{t("ctl.mouse")}</div>
      <Seg value={c.mouseCamera == null ? "auto" : c.mouseCamera ? "on" : "off"} onChange={v => set({ mouseCamera: v === "auto" ? null : v === "on" })} options={["auto", "on", "off"].map(v => ({ value: v, label: t("ctl.mouse." + v) }))} />
      <p className="tiny muted mt8">{t("ctl.mouseNote")}</p>
      <label className="label mt16" htmlFor="sens">{t("settings.sensitivity")} — {settings.sensitivity.toFixed(1)}</label>
      <input id="sens" className="range" type="range" min="0.3" max="2.5" step="0.1" value={settings.sensitivity} onChange={e => setSettings({ sensitivity: +e.target.value })} />
      <div className="row mt8"><label className="row small"><input type="checkbox" checked={settings.invertY} onChange={e => setSettings({ invertY: e.target.checked })} /> {t("settings.invertY")}</label></div>

      <div className="row mt16"><label className="row small"><input type="checkbox" checked={c.contextKeys} onChange={e => set({ contextKeys: e.target.checked })} /> {t("ctl.context", { pass: b.keys.pass.map(L).join("/"), shoot: b.keys.shoot.map(L).join("/") })}</label></div>
      <div className="label mt16">{t("settings.autoSwitch")}</div>
      <Seg value={c.autoSwitch} onChange={v => set({ autoSwitch: v })} options={["off", "pass", "assist"].map(v => ({ value: v, label: t("settings.autoSwitch." + v) }))} />
      <p className="tiny muted mt8">{t("settings.autoSwitch.note")}</p>

      <div className="label mt16">🎮 {t("ctl.gamepad")}</div>
      <p className="small" style={{ color: padName ? "var(--lime)" : "var(--muted)" }}>{padName ? t("ctl.padFound", { name: padName }) : t("ctl.padNone")}</p>
      <Seg value={c.padStyle} onChange={v => set({ padStyle: v })} options={[{ value: "xbox", label: "Xbox" }, { value: "ps", label: "PlayStation" }]} />
      <div className="row mt8">
        <label className="row small"><input type="checkbox" checked={c.vibration} onChange={e => set({ vibration: e.target.checked })} /> {t("ctl.vibration")}</label>
        <button className="btn small ghost" disabled={!padName} onClick={() => { const p = [...(navigator.getGamepads?.() || [])].find(x => x && x.connected); p?.vibrationActuator?.playEffect?.("dual-rumble", { duration: 300, strongMagnitude: 0.8, weakMagnitude: 0.5 })?.catch?.(() => {}); }}>📳 {t("ctl.testVibration")}</button>
      </div>
      <p className="tiny muted mt8">{t("ctl.padNote")}</p>
    </div>
  );
}
