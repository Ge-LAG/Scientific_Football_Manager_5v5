// Progression : grades académiques, ELO, XP et « Publications » (succès).
// Module isomorphe : aucun import Node, utilisable côté navigateur.

export const GRADES = [
  { id: 'intern', xp: 0, fr: 'Stagiaire', en: 'Intern' },
  { id: 'phd', xp: 300, fr: 'Doctorant', en: 'PhD Student' },
  { id: 'postdoc', xp: 900, fr: 'Post-doc', en: 'Postdoc' },
  { id: 'associate', xp: 2000, fr: 'Maître de conférences', en: 'Associate Professor' },
  { id: 'professor', xp: 4000, fr: 'Professeur', en: 'Professor' },
  { id: 'director', xp: 7000, fr: 'Directeur de recherche', en: 'Research Director' },
  { id: 'nobel', xp: 12000, fr: 'Prix Nobel', en: 'Nobel Laureate' },
];

export function gradeOf(xp = 0) {
  let i = 0;
  while (i + 1 < GRADES.length && xp >= GRADES[i + 1].xp) i++;
  const g = GRADES[i];
  const next = i + 1 < GRADES.length ? GRADES[i + 1].xp : null;
  const progress = next === null ? 1 : Math.max(0, Math.min(1, (xp - g.xp) / (next - g.xp)));
  return { index: i, id: g.id, fr: g.fr, en: g.en, xp: g.xp, next, progress };
}

// ELO classique ; la somme des deux cotes est conservée exactement
export function eloUpdate(ratingA, ratingB, scoreA, k = 32) {
  const expA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  const deltaA = Math.round(k * (scoreA - expA)) || 0; // évite -0
  return [Math.round(ratingA) + deltaA, Math.round(ratingB) - deltaA];
}

// Stats par défaut (réutilisées par server/db.js)
export function defaultStats() {
  return {
    manager: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, elo: 1000, bestWinStreak: 0, winStreak: 0 },
    arena: { played: 0, won: 0, drawn: 0, lost: 0, goals: 0, assists: 0, saves: 0, tackles: 0, shots: 0, mvp: 0, elo: 1000, winStreak: 0, bestWinStreak: 0 },
  };
}

const n = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const total = (u, key) => (u.stats.manager[key] || 0) + (u.stats.arena[key] || 0);
const GOAL_CAP = 5; // plafond de buts comptés pour l'XP (anti-farm)

export const ACHIEVEMENTS = [
  { id: 'first_match', icon: '🧪', fr: { name: 'Premier protocole', desc: 'Jouer son premier match.' }, en: { name: 'First Protocol', desc: 'Play your first match.' },
    check: (u) => total(u, 'played') >= 1 },
  { id: 'first_win', icon: '💡', fr: { name: 'Première découverte', desc: 'Remporter un premier match.' }, en: { name: 'First Discovery', desc: 'Win your first match.' },
    check: (u) => total(u, 'won') >= 1 },
  { id: 'first_goal', icon: '📄', fr: { name: 'Premier article publié', desc: 'Marquer un but en Arène.' }, en: { name: 'First Paper Published', desc: 'Score a goal in the Arena.' },
    check: (u) => u.stats.arena.goals >= 1 },
  { id: 'hat_trick', icon: '📈', fr: { name: "Facteur d'impact", desc: 'Marquer 3 buts dans un match d’Arène.' }, en: { name: 'Impact Factor', desc: 'Score 3 goals in one Arena match.' },
    check: (u, e) => e.mode === 'arena' && n(e.goals) >= 3 },
  { id: 'matches_10', icon: '🔬', fr: { name: "Série d'expériences", desc: 'Jouer 10 matchs.' }, en: { name: 'Experimental Series', desc: 'Play 10 matches.' },
    check: (u) => total(u, 'played') >= 10 },
  { id: 'wins_10', icon: '📝', fr: { name: 'Revue par les pairs', desc: 'Remporter 10 matchs au total.' }, en: { name: 'Peer Reviewed', desc: 'Win 10 matches in total.' },
    check: (u) => total(u, 'won') >= 10 },
  { id: 'matches_50', icon: '🎓', fr: { name: 'Carrière scientifique', desc: 'Jouer 50 matchs.' }, en: { name: 'Scientific Career', desc: 'Play 50 matches.' },
    check: (u) => total(u, 'played') >= 50 },
  { id: 'streak_5', icon: '🔁', fr: { name: 'Reproductibilité', desc: 'Gagner 5 matchs d’affilée dans un mode.' }, en: { name: 'Reproducibility', desc: 'Win 5 matches in a row in one mode.' },
    check: (u) => u.stats.manager.bestWinStreak >= 5 || u.stats.arena.bestWinStreak >= 5 },
  { id: 'clean_sheet', icon: '🧱', fr: { name: 'Hypothèse nulle', desc: 'Gagner en Manager sans encaisser de but.' }, en: { name: 'Null Hypothesis', desc: 'Win a Manager match without conceding.' },
    check: (u, e) => e.mode === 'manager' && e.result === 'W' && n(e.goalsAgainst) === 0 },
  { id: 'beat_human', icon: '🤝', fr: { name: 'Soutenance réussie', desc: 'Battre un humain en Manager.' }, en: { name: 'Successful Defense', desc: 'Beat a human in Manager.' },
    check: (u, e) => e.mode === 'manager' && e.result === 'W' && !!e.vsHuman },
  { id: 'arena_human_win', icon: '🌍', fr: { name: 'Collaboration internationale', desc: 'Gagner un match d’Arène contre des humains.' }, en: { name: 'International Collaboration', desc: 'Win an Arena match against humans.' },
    check: (u, e) => e.mode === 'arena' && e.result === 'W' && !!e.vsHuman },
  { id: 'assists_10', icon: '✍️', fr: { name: 'Co-auteur', desc: 'Délivrer 10 passes décisives en Arène.' }, en: { name: 'Co-author', desc: 'Make 10 assists in the Arena.' },
    check: (u) => u.stats.arena.assists >= 10 },
  { id: 'mvp', icon: '🏅', fr: { name: 'Médaille Fields', desc: 'Être élu MVP d’un match d’Arène.' }, en: { name: 'Fields Medal', desc: 'Be MVP of an Arena match.' },
    check: (u, e) => e.mode === 'arena' && !!e.mvp },
  { id: 'saves_5', icon: '🛡️', fr: { name: 'Pare-feu humain', desc: 'Réaliser 5 arrêts dans un match d’Arène.' }, en: { name: 'Human Firewall', desc: 'Make 5 saves in one Arena match.' },
    check: (u, e) => e.mode === 'arena' && n(e.saves) >= 5 },
  { id: 'goals_25', icon: '📚', fr: { name: 'Indice h', desc: 'Marquer 25 buts en Arène.' }, en: { name: 'h-index', desc: 'Score 25 goals in the Arena.' },
    check: (u) => u.stats.arena.goals >= 25 },
  { id: 'rout', icon: '📊', fr: { name: 'Résultat significatif', desc: 'Gagner avec 5 buts d’écart ou plus.' }, en: { name: 'Significant Result', desc: 'Win by a margin of 5 goals or more.' },
    check: (u, e) => e.result === 'W' && n(e.goalsFor) - n(e.goalsAgainst) >= 5 },
  { id: 'tackles_50', icon: '🧐', fr: { name: 'Relecteur exigeant', desc: 'Réussir 50 tacles en Arène.' }, en: { name: 'Tough Reviewer', desc: 'Make 50 tackles in the Arena.' },
    check: (u) => u.stats.arena.tackles >= 50 },
  { id: 'tenure', icon: '🏛️', fr: { name: 'Titularisation', desc: 'Atteindre le grade de Professeur.' }, en: { name: 'Tenure', desc: 'Reach the rank of Professor.' },
    check: (u) => u.xp >= 4000 },
];

export function xpForEntry(e) {
  let xp = 50;
  if (e.result === 'W') xp += 60;
  else if (e.result === 'D') xp += 25;
  const goals = e.mode === 'arena' ? n(e.goals) : n(e.goalsFor);
  xp += 15 * Math.min(goals, GOAL_CAP);
  xp += 10 * Math.min(n(e.assists), 10) + 8 * Math.min(n(e.saves), 15);
  if (e.vsHuman) xp *= 1.5;
  if (e.abandoned) xp *= 0.6;
  return Math.round(xp);
}

// Complète un utilisateur ancien/partiel avec les champs attendus
function ensureShape(user) {
  const d = defaultStats();
  user.stats ??= d;
  for (const m of ['manager', 'arena']) user.stats[m] = { ...d[m], ...(user.stats[m] || {}) };
  user.xp = n(user.xp);
  if (!Array.isArray(user.achievements)) user.achievements = [];
  if (!Array.isArray(user.history)) user.history = [];
}

// Applique un résultat de match (mute user). Les succès sont évalués après la MAJ des stats.
export function applyMatchResult(user, entry) {
  ensureShape(user);
  const mode = entry.mode === 'arena' ? 'arena' : 'manager';
  const e = { ...entry, mode };
  const s = user.stats[mode];
  const before = gradeOf(user.xp).index;

  s.played++;
  if (e.result === 'W') { s.won++; s.winStreak++; s.bestWinStreak = Math.max(s.bestWinStreak, s.winStreak); }
  else { s.winStreak = 0; if (e.result === 'D') s.drawn++; else s.lost++; }

  if (mode === 'manager') { s.goalsFor += n(e.goalsFor); s.goalsAgainst += n(e.goalsAgainst); }
  else {
    for (const k of ['goals', 'assists', 'saves', 'tackles', 'shots']) s[k] += n(e[k]);
    if (e.mvp) s.mvp++;
  }

  let eloDelta = 0;
  if (e.vsHuman && typeof e.oppElo === 'number' && Number.isFinite(e.oppElo)) {
    const score = e.result === 'W' ? 1 : e.result === 'D' ? 0.5 : 0;
    const [na] = eloUpdate(s.elo, e.oppElo, score);
    eloDelta = na - s.elo;
    s.elo = na;
  }

  const xpGained = xpForEntry(e);
  user.xp += xpGained;

  user.history.unshift({
    mode, result: e.result, score: `${n(e.goalsFor)}-${n(e.goalsAgainst)}`,
    opponentName: e.opponentName ?? null, date: e.date || new Date().toISOString(), xp: xpGained, eloDelta,
  });
  if (user.history.length > 30) user.history.length = 30;

  const newAchievements = [];
  for (const a of ACHIEVEMENTS) {
    if (!user.achievements.includes(a.id) && a.check(user, e)) { user.achievements.push(a.id); newAchievements.push(a.id); }
  }

  const grade = gradeOf(user.xp);
  return { xpGained, eloDelta, newAchievements, grade, gradeUp: grade.index > before };
}
