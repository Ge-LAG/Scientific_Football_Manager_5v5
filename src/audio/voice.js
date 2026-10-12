// Commentaire vocal (synthèse vocale du navigateur) : lit les lignes de narration importantes dans la langue choisie.
let last = 0;
export function speak(text, lang, enabled = true) {
  try {
    if (!enabled || !text || typeof window === "undefined" || !window.speechSynthesis) return;
    const now = Date.now(); if (now - last < 2500) return; last = now; // pas de rafale
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ""));
    u.lang = lang === "en" ? "en-GB" : "fr-FR"; u.rate = 1.12; u.pitch = 1.05; u.volume = 0.9;
    const v = window.speechSynthesis.getVoices().find(x => x.lang?.toLowerCase().startsWith(lang === "en" ? "en" : "fr"));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  } catch { /* synthèse vocale indisponible */ }
}
export function stopSpeaking() { try { window.speechSynthesis?.cancel(); } catch { /* rien */ } }
