// Internationalisation FR/EN : français par défaut (même sur un navigateur anglais), choix explicite persistant.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import fr from "./fr.js";
import en from "./en.js";

export const CATALOGS = { fr, en };
export const LANGS = [{ id: "fr", label: "Français" }, { id: "en", label: "English" }];
const I18nCtx = createContext(null);

function readLang() { try { const v = localStorage.getItem("ll.lang"); return v === "en" || v === "fr" ? v : "fr"; } catch { return "fr"; } }

// Traduction avec paramètres nommés {nom} et pluriel (clé.one / clé.other selon {count}).
export function translate(lang, key, params) {
  const cat = CATALOGS[lang] || fr;
  let s = cat[key];
  if (params && typeof params.count === "number") {
    const pk = key + (params.count === 1 || (lang === "fr" && params.count === 0) ? ".one" : ".other");
    s = cat[pk] ?? s;
  }
  if (s == null) s = fr[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function I18nProvider({ children, onChange }) {
  const [lang, setLangState] = useState(readLang);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback(l => { if (!CATALOGS[l]) return; setLangState(l); try { localStorage.setItem("ll.lang", l); } catch { /* stockage indisponible */ } onChange?.(l); }, [onChange]);
  const value = useMemo(() => ({ lang, setLang, t: (k, p) => translate(lang, k, p), fmtDate: d => new Date(d).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", year: "numeric" }), fmtNum: n => Number(n).toLocaleString(lang === "en" ? "en-GB" : "fr-FR") }), [lang, setLang]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
