// Effets sonores synthétisés en WebAudio (aucun fichier audio). Ne lève jamais d'exception.

const NOOP_NAMES = ["unlock", "setVolume", "kick", "pass", "whistle", "goal", "save", "tackle", "powerUp", "bounce", "click", "crowd", "dispose"];

function noopSfx() {
  const o = {};
  for (const n of NOOP_NAMES) o[n] = () => {};
  o.available = false;
  return o;
}

export function createSfx() {
  const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return noopSfx();

  let ctx = null, master = null, sfxBus = null, crowdBus = null, noiseBuf = null;
  let volume = 0.8, disposed = false, voices = 0;
  let crowdNodes = null, crowdLevel = -1, roar = 0;
  const last = {};

  // Crée le contexte à la demande (idéalement dans un geste utilisateur)
  function ensure() {
    if (disposed) return null;
    if (!ctx) {
      try {
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
        comp.attack.value = 0.004; comp.release.value = 0.2;
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(comp).connect(ctx.destination);
        sfxBus = ctx.createGain(); sfxBus.connect(master);
        crowdBus = ctx.createGain(); crowdBus.connect(master);
        const len = ctx.sampleRate * 2;
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        ctx = null;
        return null;
      }
    }
    return ctx;
  }

  // Contexte prêt à jouer ? (créé uniquement par unlock())
  function live() {
    return ctx && !disposed && ctx.state === "running" ? ctx : null;
  }

  // Déverrouillage automatique au premier geste utilisateur
  const autoUnlock = () => { try { unlock(); } catch { /* ignoré */ } };
  const GESTURES = ["pointerdown", "keydown", "touchstart"];
  try { for (const e of GESTURES) window.addEventListener(e, autoUnlock, { once: true, passive: true, capture: true }); } catch { /* ignoré */ }

  const safe = fn => (...args) => { try { return fn(...args); } catch { /* silencieux */ } };

  function throttle(key, ms) {
    const now = performance.now();
    if (last[key] && now - last[key] < ms) return true;
    last[key] = now;
    return false;
  }

  function track(node, endTime) {
    voices++;
    node.onended = () => { voices--; };
    node.stop(endTime);
  }

  // Enveloppe exponentielle attaque/déclin
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function tone(type, f0, f1, t, dur, peak, { attack = 0.004, dest = sfxBus } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
    const g = ctx.createGain();
    env(g, t, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    track(o, t + attack + dur + 0.05);
    return o;
  }

  function noise(t, dur, peak, { type = "bandpass", freq = 1000, f1 = 0, Q = 1, attack = 0.003, dest = sfxBus } = {}) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
    f.Q.value = Q;
    const g = ctx.createGain();
    env(g, t, attack, peak, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    track(s, t + attack + dur + 0.05);
    return s;
  }

  const busy = () => voices > 40;

  // ── Sons ──
  function kick(power = 0.7) {
    const c = live(); if (!c || busy() || throttle("kick", 35)) return;
    const p = Math.max(0, Math.min(1, power)), t = c.currentTime;
    tone("sine", 170 + p * 40, 45, t, 0.13 + p * 0.06, 0.55 + p * 0.45);
    noise(t, 0.035, 0.25 + p * 0.3, { freq: 1800, Q: 0.9 });
    if (p > 0.6) noise(t + 0.01, 0.22, 0.12 * p, { type: "highpass", freq: 900, f1: 3500, Q: 0.5, attack: 0.03 });
  }

  function pass() {
    const c = live(); if (!c || busy() || throttle("pass", 35)) return;
    const t = c.currentTime;
    tone("sine", 240, 110, t, 0.08, 0.35);
    noise(t, 0.025, 0.13, { freq: 2600, Q: 1.2 });
  }

  function whistleBlast(t, dur, peak = 0.22) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 2950;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 26;
    const lg = ctx.createGain();
    lg.gain.value = 110;
    lfo.connect(lg).connect(o.frequency);
    const trem = ctx.createGain();
    trem.gain.value = 0.75;
    const tl = ctx.createGain();
    tl.gain.value = 0.25;
    lfo.connect(tl).connect(trem.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.02);
    g.gain.setValueAtTime(peak, t + Math.max(0.03, dur - 0.05));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(trem).connect(g).connect(sfxBus);
    o.start(t); lfo.start(t);
    track(o, t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    noise(t, dur, peak * 0.25, { freq: 3000, Q: 6, attack: 0.02 });
  }

  function whistle(kind = "start") {
    const c = live(); if (!c || throttle("whistle", 150)) return;
    const t = c.currentTime;
    if (kind === "end") { whistleBlast(t, 0.28); whistleBlast(t + 0.38, 0.28); whistleBlast(t + 0.76, 0.95); }
    else if (kind === "foul") { whistleBlast(t, 0.16, 0.25); whistleBlast(t + 0.22, 0.42, 0.25); }
    else whistleBlast(t, 0.6);
  }

  function horn(t, dur) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1500; lp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
    g.gain.setValueAtTime(0.16, t + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(sfxBus);
    for (const f of [220, 277.18, 329.63, 110]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * 0.97, t);
      o.frequency.linearRampToValueAtTime(f, t + 0.12);
      o.connect(lp);
      o.start(t);
      track(o, t + dur + 0.05);
    }
  }

  function goal() {
    const c = live(); if (!c || throttle("goal", 800)) return;
    const t = c.currentTime;
    horn(t, 0.45);
    horn(t + 0.55, 1.5);
    // clameur de la foule
    noise(t + 0.05, 3.2, 0.5, { freq: 650, Q: 0.5, attack: 0.3 });
    noise(t + 0.1, 2.8, 0.25, { freq: 1700, Q: 0.9, attack: 0.35 });
    noise(t + 0.15, 2.4, 0.14, { freq: 3200, Q: 1.2, attack: 0.4 });
    roar = 1;
    applyCrowd();
  }

  function save() {
    const c = live(); if (!c || busy() || throttle("save", 120)) return;
    const t = c.currentTime;
    tone("sine", 150, 60, t, 0.14, 0.6);
    noise(t, 0.08, 0.35, { type: "lowpass", freq: 1300, Q: 0.7 });
    // « ooh » de la foule
    noise(t + 0.08, 1.0, 0.16, { freq: 420, f1: 700, Q: 3, attack: 0.18 });
    noise(t + 0.08, 1.0, 0.1, { freq: 900, f1: 1200, Q: 3, attack: 0.2 });
  }

  function tackle() {
    const c = live(); if (!c || busy() || throttle("tackle", 60)) return;
    const t = c.currentTime;
    noise(t, 0.22, 0.35, { freq: 380, f1: 200, Q: 0.8, attack: 0.01 });
    tone("sine", 95, 45, t, 0.15, 0.45);
    noise(t + 0.02, 0.12, 0.12, { type: "highpass", freq: 2500, Q: 0.6 });
  }

  function powerUp() {
    const c = live(); if (!c || throttle("powerUp", 150)) return;
    const t = c.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.38);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.Q.value = 9;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(5000, t + 0.38);
    const g = ctx.createGain();
    env(g, t, 0.03, 0.14, 0.4);
    o.connect(f).connect(g).connect(sfxBus);
    o.start(t);
    track(o, t + 0.5);
    [880, 1108.73, 1318.51, 1760].forEach((fr, i) => tone("triangle", fr, fr, t + 0.2 + i * 0.065, 0.16, 0.13));
  }

  function bounce(intensity = 0.5) {
    const c = live(); if (!c || busy() || throttle("bounce", 45)) return;
    const k = Math.max(0, Math.min(1, intensity));
    if (k < 0.03) return;
    const t = c.currentTime;
    tone("sine", 120, 55, t, 0.08, 0.35 * k);
    noise(t, 0.02, 0.08 * k, { type: "highpass", freq: 2200, Q: 0.7 });
  }

  function click() {
    const c = live(); if (!c || throttle("click", 25)) return;
    const t = c.currentTime;
    tone("sine", 1600, 1150, t, 0.035, 0.14, { attack: 0.002 });
  }

  // ── Ambiance de foule continue ──
  function startCrowd() {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 520; bp.Q.value = 0.6;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
    const gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(bp).connect(lp).connect(gain).connect(crowdBus);
    // murmure : 2e couche modulée lentement
    const src2 = ctx.createBufferSource();
    src2.buffer = noiseBuf; src2.loop = true;
    const bp2 = ctx.createBiquadFilter(); bp2.type = "bandpass"; bp2.frequency.value = 1150; bp2.Q.value = 1.4;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.23;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.25;
    lfo.connect(lfoG).connect(g2.gain);
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.11;
    const lfo2G = ctx.createGain(); lfo2G.gain.value = 180;
    lfo2.connect(lfo2G).connect(bp.frequency);
    src2.connect(bp2).connect(g2).connect(gain);
    src.start(t, Math.random()); src2.start(t, Math.random()); lfo.start(t); lfo2.start(t);
    crowdNodes = { src, src2, lfo, lfo2, gain };
  }

  let crowdTarget = 0;
  function applyCrowd() {
    const c = live(); if (!c) return;
    if (!crowdNodes) startCrowd();
    const lvl = 0.03 + crowdTarget * 0.32 + roar * 0.35;
    if (Math.abs(lvl - crowdLevel) < 0.01) return;
    crowdLevel = lvl;
    crowdNodes.gain.gain.setTargetAtTime(lvl, c.currentTime, roar > 0.5 ? 0.15 : 0.6);
    if (roar > 0) {
      // retombée progressive de la clameur
      const r0 = roar;
      roar = 0;
      crowdNodes.gain.gain.setTargetAtTime(0.03 + crowdTarget * 0.32, c.currentTime + 1.2 * r0, 1.4);
      crowdLevel = 0.03 + crowdTarget * 0.32;
    }
  }

  function crowd(intensity = 0.3) {
    crowdTarget = Math.max(0, Math.min(1, intensity));
    applyCrowd();
  }

  function unlock() {
    const c = ensure(); if (!c) return;
    if (c.state === "suspended") c.resume().catch(() => {});
    // tampon silencieux (iOS)
    const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
    s.buffer = b; s.connect(c.destination); s.start(0);
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (ctx && master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
  }

  function dispose() {
    disposed = true;
    try { for (const e of GESTURES) window.removeEventListener(e, autoUnlock, { capture: true }); } catch { /* ignoré */ }
    if (!ctx) return;
    if (crowdNodes) for (const k of ["src", "src2", "lfo", "lfo2"]) { try { crowdNodes[k].stop(); } catch { /* déjà arrêté */ } }
    crowdNodes = null;
    const c = ctx;
    ctx = null;
    c.close().catch(() => {});
  }

  return {
    available: true,
    unlock: safe(unlock), setVolume: safe(setVolume),
    kick: safe(kick), pass: safe(pass), whistle: safe(whistle), goal: safe(goal), save: safe(save),
    tackle: safe(tackle), powerUp: safe(powerUp), bounce: safe(bounce), click: safe(click),
    crowd: safe(crowd), dispose: safe(dispose),
  };
}
