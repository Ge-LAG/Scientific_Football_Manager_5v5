// Carrière du Labo : trois divisions (Paillasse → Laboratoire → Institut), saisons de 5 journées
// contre 5 clubs virtuels, montées, descentes, trophée de l'Institut et palmarès — fonctions pures.
import { simulateMatch } from "./engine.js";
import { buildBotSquad } from "./ai.js";
import { makeRng } from "../rng.js";

export const ME = "me";
const UP = 2, DOWN = 1; // les 2 premiers montent, le dernier descend

// Clubs virtuels listés du plus faible au plus fort dans chaque division (ordre des journées).
export const DIVISIONS = [
  { id: "paillasse", level: "stagiaire", name: { fr: "Paillasse", en: "Bench" }, clubs: [
    { id: "stagiaires", name: { fr: "Stagiaires United", en: "Interns United" }, crest: "🎒", colors: ["#FF8C00", "#101018"] },
    { id: "apprentis", name: { fr: "Les Apprentis Sorciers", en: "The Sorcerer's Apprentices" }, crest: "🪄", colors: ["#39FF14", "#101018"] },
    { id: "central", name: { fr: "Labo Central FC", en: "Central Lab FC" }, crest: "🔬", colors: ["#FFD700", "#101018"] },
    { id: "cnrs", name: { fr: "CNRS Athletic", en: "CNRS Athletic" }, crest: "🏛️", colors: ["#8B5CF6", "#101018"] },
    { id: "nobel", name: { fr: "Nobel Galácticos", en: "Nobel Galácticos" }, crest: "🏆", colors: ["#FF3366", "#101018"] },
  ]},
  { id: "laboratoire", level: "chercheur", name: { fr: "Laboratoire", en: "Laboratory" }, clubs: [
    { id: "pipette", name: { fr: "Pipette City", en: "Pipette City" }, crest: "🧫", colors: ["#00C2FF", "#101018"] },
    { id: "bunsen", name: { fr: "AC Bunsen", en: "AC Bunsen" }, crest: "🔥", colors: ["#FF5A00", "#101018"] },
    { id: "petri", name: { fr: "Boîte de Pétri FC", en: "Petri Dish FC" }, crest: "🧪", colors: ["#7CFC00", "#101018"] },
    { id: "algorithme", name: { fr: "Algorithme XI", en: "Algorithm XI" }, crest: "🤖", colors: ["#00E5A0", "#101018"] },
    { id: "spectre", name: { fr: "Spectre Massique", en: "Mass Spectrum" }, crest: "⚛️", colors: ["#B388FF", "#101018"] },
  ]},
  { id: "institut", level: "nobel", name: { fr: "Institut", en: "Institute" }, clubs: [
    { id: "photon", name: { fr: "Photon FC", en: "Photon FC" }, crest: "☀️", colors: ["#FFE14D", "#101018"] },
    { id: "theoreme", name: { fr: "Grand Théorème", en: "Grand Theorem" }, crest: "📐", colors: ["#4D9FFF", "#101018"] },
    { id: "confocale", name: { fr: "Élite Confocale", en: "Confocal Elite" }, crest: "🔭", colors: ["#FF4DC4", "#101018"] },
    { id: "singularite", name: { fr: "Singularité United", en: "Singularity United" }, crest: "🕳️", colors: ["#A0A0B0", "#101018"] },
    { id: "quantique", name: { fr: "Quantum Real", en: "Quantum Real" }, crest: "🌀", colors: ["#00FFD0", "#101018"] },
  ]},
];
const CLUB_INDEX = new Map(DIVISIONS.flatMap((d, di) => d.clubs.map((c, ci) => [c.id, { club: c, division: di, rank: ci }])));
export const SEASON_CLUBS = DIVISIONS[0].clubs; // compatibilité (division Paillasse)

// Palmarès de la carrière : saisons jouées, titres, montées, descentes, trophées de l'Institut.
export function newCareer() {
  return { seasons: 0, titles: 0, promotions: 0, relegations: 0, trophies: 0, history: [] };
}

const divIndex = d => Math.min(Math.max(Number(d) | 0, 0), DIVISIONS.length - 1);
export const divisionOf = season => DIVISIONS[divIndex(season?.division)];
export const levelOf = season => divisionOf(season).level; // niveau du bot de la division
export const clubOf = id => CLUB_INDEX.get(id)?.club || null;
const strength = id => CLUB_INDEX.get(id)?.rank ?? 0;

// Calendrier « tourniquet » (méthode du cercle) : 6 équipes, 5 journées, 3 matchs par journée.
export function roundRobin(ids) {
  const t = [...ids]; const days = [];
  for (let d = 0; d < t.length - 1; d++) {
    const games = [];
    for (let i = 0; i < t.length / 2; i++) games.push(d % 2 ? [t[t.length - 1 - i], t[i]] : [t[i], t[t.length - 1 - i]]);
    days.push(games);
    t.splice(1, 0, t.pop());
  }
  return days;
}

export function newSeason(seed = Date.now(), division = 0, career = newCareer()) {
  const di = divIndex(division);
  const ids = [ME, ...DIVISIONS[di].clubs.map(c => c.id)];
  // le joueur affronte les clubs du plus faible au plus fort : on ordonne les journées en conséquence
  const days = roundRobin(ids).sort((a, b) => strength(opponentOf(a)) - strength(opponentOf(b)));
  return { id: seed >>> 0, division: di, day: 0, days, results: [], table: Object.fromEntries(ids.map(id => [id, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }])), done: false, career };
}
const opponentOf = games => { const g = games.find(x => x.includes(ME)); return g[0] === ME ? g[1] : g[0]; };

export function nextFixture(season) {
  if (season.done) return null;
  const g = season.days[season.day].find(x => x.includes(ME));
  return { home: g[0] === ME, opponent: g[0] === ME ? g[1] : g[0] };
}

function apply(table, a, b, ga, gb) {
  const A = table[a], B = table[b];
  A.p++; B.p++; A.gf += ga; A.ga += gb; B.gf += gb; B.ga += ga;
  if (ga > gb) { A.w++; B.l++; A.pts += 3; } else if (ga < gb) { B.w++; A.l++; B.pts += 3; } else { A.d++; B.d++; A.pts++; B.pts++; }
}

// Enregistre le match du joueur et simule les autres rencontres de la journée.
export function recordDay(season, myGoals, oppGoals) {
  const s = JSON.parse(JSON.stringify(season));
  const rng = makeRng(s.id + s.day * 7919);
  const level = levelOf(s);
  for (const [h, a] of s.days[s.day]) {
    let gh, ga;
    if (h === ME) { gh = myGoals; ga = oppGoals; } else if (a === ME) { gh = oppGoals; ga = myGoals; }
    else {
      const used = [];
      const sq = id => { const q = buildBotSquad(rng, used, level); used.push(...q.lineup, ...q.bench); return { name: clubOf(id).name.fr, ...q }; };
      const home = sq(h), away = sq(a);
      const r = simulateMatch({ home, away, halfTicks: 600 }, { seed: rng.int(1e9) }).report();
      gh = r.teams.home.score; ga = r.teams.away.score;
    }
    apply(s.table, h, a, gh, ga);
    s.results.push({ day: s.day, home: h, away: a, score: [gh, ga] });
  }
  s.day++;
  if (s.day >= s.days.length) { s.done = true; s.career = foldCareer(s.career || newCareer(), s); }
  return s;
}

export function standings(season) {
  return Object.entries(season.table).map(([id, r]) => ({ id, ...r, diff: r.gf - r.ga }))
    .sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.gf - a.gf || (a.id === ME ? -1 : b.id === ME ? 1 : a.id.localeCompare(b.id)));
}

// Issue d'une saison terminée : rang, titre, montée/descente du joueur, trophée de l'Institut.
export function seasonOutcome(season) {
  if (!season?.done) return null;
  const table = standings(season);
  const rank = table.findIndex(r => r.id === ME) + 1;
  const champion = rank === 1;
  const trophy = champion && divIndex(season.division) === DIVISIONS.length - 1;
  const promoted = rank <= UP && divIndex(season.division) < DIVISIONS.length - 1;
  const relegated = rank > table.length - DOWN && divIndex(season.division) > 0;
  const nextDivision = Math.min(Math.max(divIndex(season.division) + (promoted ? 1 : 0) - (relegated ? 1 : 0), 0), DIVISIONS.length - 1);
  return { rank, champion, trophy, promoted, relegated, nextDivision, winner: table[0].id };
}

function foldCareer(career, s) {
  const o = seasonOutcome(s);
  const entry = { division: divIndex(s.division), rank: o.rank, pts: standings(s).find(r => r.id === ME)?.pts ?? 0, champion: o.winner, promoted: o.promoted, relegated: o.relegated, trophy: o.trophy };
  return {
    seasons: career.seasons + 1,
    titles: career.titles + (o.champion ? 1 : 0),
    promotions: career.promotions + (o.promoted ? 1 : 0),
    relegations: career.relegations + (o.relegated ? 1 : 0),
    trophies: career.trophies + (o.trophy ? 1 : 0),
    history: [...(career.history || []), entry],
  };
}

// Saison suivante : enchaîne automatiquement dans la division obtenue, palmarès conservé.
export function endSeason(season, seed = Date.now()) {
  const o = seasonOutcome(season);
  if (!o) return season;
  return newSeason(seed, o.nextDivision, season.career || newCareer());
}

// Reprend une saison sauvegardée (localStorage « ll.season ») sans perte :
// les anciennes saisons (sans division ni palmarès) continuent en Paillasse ; une saison déjà
// terminée voit son palmarès complété une seule fois.
export function migrateSeason(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.days) || !raw.table || typeof raw.day !== "number") return null;
  const s = { ...raw };
  s.id = Number(s.id) >>> 0;
  s.division = divIndex(s.division);
  const known = s.career && typeof s.career === "object";
  const base = known ? s.career : newCareer();
  s.career = {
    seasons: base.seasons | 0, titles: base.titles | 0, promotions: base.promotions | 0,
    relegations: base.relegations | 0, trophies: base.trophies | 0,
    history: Array.isArray(base.history) ? base.history : [],
  };
  if (s.done && !known) s.career = foldCareer(s.career, s);
  return s;
}
