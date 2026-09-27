import { useI18n, LANGS } from "../i18n/index.jsx";
import { useSession } from "../store/session.jsx";
import { Card, Kicker, Seg } from "../ui/components.jsx";

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { settings, setSettings } = useSession();
  return (
    <div className="page narrow">
      <h1 className="h1">{t("settings.title")}</h1>
      <Card className="mb16">
        <Kicker>🌐 {t("settings.language")}</Kicker>
        <Seg value={lang} onChange={setLang} label={t("settings.language")} options={LANGS.map(l => ({ value: l.id, label: l.label }))} />
        <p className="tiny muted mt8">{t("settings.languageNote")}</p>
      </Card>
      <Card className="mb16">
        <Kicker>🔊 {t("settings.audio")}</Kicker>
        <label className="label" htmlFor="vol">{t("settings.volume")} — {Math.round(settings.volume * 100)} %</label>
        <input id="vol" className="range" type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={e => setSettings({ volume: +e.target.value })} />
        <div className="row mt16"><label className="row small"><input type="checkbox" checked={settings.voice !== false} onChange={e => setSettings({ voice: e.target.checked })} /> {t("settings.voice")}</label></div>
      </Card>
      <Card className="mb16">
        <Kicker>🖥️ {t("settings.graphics")}</Kicker>
        <Seg value={settings.quality} onChange={v => setSettings({ quality: v })} label={t("settings.quality")} options={["low", "medium", "high"].map(q => ({ value: q, label: t("settings.q." + q) }))} />
        <p className="tiny muted mt8">{t("settings.qualityNote")}</p>
      </Card>
      <Card>
        <Kicker>🎮 {t("settings.controls")}</Kicker>
        <label className="label" htmlFor="sens">{t("settings.sensitivity")} — {settings.sensitivity.toFixed(1)}</label>
        <input id="sens" className="range mb16" type="range" min="0.3" max="2.5" step="0.1" value={settings.sensitivity} onChange={e => setSettings({ sensitivity: +e.target.value })} />
        <div className="row mb16"><label className="row small"><input type="checkbox" checked={settings.invertY} onChange={e => setSettings({ invertY: e.target.checked })} /> {t("settings.invertY")}</label></div>
        <div className="label">{t("settings.camera")}</div>
        <Seg value={settings.camera} onChange={v => setSettings({ camera: v })} options={[{ value: "near", label: t("settings.cam.near") }, { value: "far", label: t("settings.cam.far") }, { value: "broadcast", label: t("settings.cam.broadcast") }]} />
        <div className="row mt16"><label className="row small"><input type="checkbox" checked={settings.showHelp} onChange={e => setSettings({ showHelp: e.target.checked })} /> {t("settings.showHelp")}</label></div>
        <div className="row mt8"><label className="row small"><input type="checkbox" checked={settings.hints !== false} onChange={e => setSettings({ hints: e.target.checked })} /> {t("settings.hints")}</label></div>
      </Card>
    </div>
  );
}
