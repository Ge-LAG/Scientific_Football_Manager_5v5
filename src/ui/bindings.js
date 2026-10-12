// Libellés des commandes selon les réglages (disposition du clavier, réaffectations, style de manette).
import { useMemo } from "react";
import { useI18n } from "../i18n/index.jsx";
import { useSession } from "../store/session.jsx";
import { controlsOf, resolveBindings, codeLabel, padLabel } from "../three/controls.js";

export function useBindings() {
  const { settings } = useSession(); const { lang } = useI18n();
  return useMemo(() => {
    const controls = controlsOf(settings); const b = resolveBindings(controls);
    const keyOf = a => b.keys[a]?.length ? b.keys[a].map(c => codeLabel(c, controls.layout, lang)).join(" / ") : "—";
    const padOf = a => b.pad[a]?.length ? b.pad[a].map(i => padLabel(i, controls.padStyle)).join(" / ") : "—";
    const moveKeys = ["up", "left", "down", "right"].map(a => b.keys[a]?.[0]).map(c => codeLabel(c, controls.layout, lang)).join(" ");
    return { controls, bindings: b, keyOf, padOf, moveKeys, mouse: b.mouseCamera };
  }, [settings, lang]);
}
