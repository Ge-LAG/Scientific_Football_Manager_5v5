import { useMemo, useState } from "react";
import { useI18n } from "../i18n/index.jsx";
import { PlayerCard } from "../ui/components.jsx";
import { PLAYERS, ALL_ATTRS, attrName, domainName, keeperRating } from "../../shared/data/content.js";
import { roleFit } from "../../shared/data/profileText.js";
import { useMyPlayer } from "../ui/profile.jsx";

export default function Roster({ navigate }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const [dom, setDom] = useState("all");
  const [sort, setSort] = useState("name");
  const my = useMyPlayer(); // répartitions de points du joueur
  const domains = [...new Set(PLAYERS.map(p => p.domaine))];
  const list = useMemo(() => {
    const val = p => (["gk", "def", "mid", "att"].includes(sort) ? roleFit(p.attributs).find(r => r.role === sort).pct : sort === "keeper" ? keeperRating(p) : sort === "name" ? 0 : p.attributs[sort]);
    return PLAYERS.map(p => my(p.id)).filter(p => p.nom.toLowerCase().includes(q.toLowerCase()) && (dom === "all" || p.domaine === dom))
      .sort((a, b) => (sort === "name" ? a.nom.localeCompare(b.nom) : val(b) - val(a)));
  }, [q, dom, sort, my]);
  return (
    <div className="page">
      <h1 className="h1">{t("roster.title")}</h1>
      <p className="lead">{t("roster.lead")}</p>
      <div className="row mb24">
        <input className="input" style={{ maxWidth: 260 }} placeholder={"🔍 " + t("roster.search")} value={q} onChange={e => setQ(e.target.value)} aria-label={t("roster.search")} />
        <select className="select" style={{ maxWidth: 260 }} value={dom} onChange={e => setDom(e.target.value)} aria-label={t("roster.domain")}>
          <option value="all">{t("roster.allDomains")}</option>
          {domains.map(d => <option key={d} value={d}>{domainName(d, lang)}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 220 }} value={sort} onChange={e => setSort(e.target.value)} aria-label={t("roster.sort")}>
          <option value="name">{t("roster.sortName")}</option>
          {["att", "mid", "def", "gk"].map(r => <option key={r} value={r}>{t("roster.sortRole", { role: t("role." + r) })}</option>)}
          <option value="keeper">{t("roster.sortKeeper")}</option>
          {ALL_ATTRS.map(a => <option key={a} value={a}>{attrName(a, lang)}</option>)}
        </select>
      </div>
      <div className="grid auto-fill">
        {list.map(p => <PlayerCard key={p.id} player={p} onClick={() => navigate(`/player/${p.id}`)}
          extra={sort !== "name" && !["gk", "def", "mid", "att"].includes(sort) && <div className="small mt8 muted">{sort === "keeper" ? t("roster.sortKeeper") : attrName(sort, lang)} : <span className="num" style={{ color: p.color }}>{sort === "keeper" ? keeperRating(p) : p.attributs[sort]}</span></div>} />)}
      </div>
      <p className="muted tiny mt16">{t("roster.statsNote")} <button className="linkbtn" onClick={() => navigate("/look")}>🎨 {t("nav.look")}</button></p>
    </div>
  );
}
