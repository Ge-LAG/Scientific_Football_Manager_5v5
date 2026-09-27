import { useI18n, LANGS } from "../i18n/index.jsx";
import { useSession } from "../store/session.jsx";
import { Card, Kicker, Seg } from "../ui/components.jsx";
import { ControlsPanel } from "../ui/ControlsPanel.jsx";

export default function Settings({ navigate }) {
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
        <Seg value={settings.quality || "auto"} onChange={v => setSettings({ quality: v })} label={t("settings.quality")} options={["auto", "low", "medium", "high", "ultra"].map(q => ({ value: q, label: t("settings.q." + q) }))} />
        <p className="tiny muted mt8">{t("settings.qualityNote")}</p>
        <div className="row mt8"><label className="row small"><input type="checkbox" checked={settings.adaptiveQuality !== false} onChange={e => setSettings({ adaptiveQuality: e.target.checked })} /> {t("settings.adaptive")}</label></div>
        <div className="row mt8" style={{ gap: 8 }}>{navigate && <button className="btn small ghost" onClick={() => navigate("/bench")}>📊 {t("settings.bench")}</button>}<span className="tiny muted">{t("settings.statsHint")}</span></div>
      </Card>
      <Card>
        <Kicker>🎮 {t("settings.controls")}</Kicker>
        <ControlsPanel />
      </Card>
      <Card className="mt16">
        <Kicker>🎥 {t("settings.cameras")}</Kicker>
        <div className="label">{t("settings.camera")}</div>
        <Seg value={settings.camera} onChange={v => setSettings({ camera: v })} options={[{ value: "near", label: t("settings.cam.near") }, { value: "far", label: t("settings.cam.far") }, { value: "broadcast", label: t("settings.cam.broadcast") }]} />
        <div className="label mt16">{t("settings.specCam")}</div>
        <Seg value={settings.specCam || "auto"} onChange={v => setSettings({ specCam: v })} options={["auto", "tv", "tactical", "goal", "ball", "player", "free"].map(v => ({ value: v, label: t("cam." + v) }))} />
        <p className="tiny muted mt8">{t("settings.specCamNote")}</p>
        <div className="row mt16"><label className="row small"><input type="checkbox" checked={settings.showHelp} onChange={e => setSettings({ showHelp: e.target.checked })} /> {t("settings.showHelp")}</label></div>
        <div className="row mt8"><label className="row small"><input type="checkbox" checked={settings.hints !== false} onChange={e => setSettings({ hints: e.target.checked })} /> {t("settings.hints")}</label></div>
      </Card>
    </div>
  );
}
