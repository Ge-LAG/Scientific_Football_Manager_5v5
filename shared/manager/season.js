// Championnat du Labo : saison solo de 5 journées contre 5 clubs virtuels (classement, calendrier).
import { simulateMatch } from "./engine.js";
import { buildBotSquad } from "./ai.js";
import { makeRng } from "../rng.js";

export const SEASON_CLUBS = [
  { id: "stagiaires", name: "Stagiaires United", crest: "🎒", colors: ["#FF8C00", "#101018"], level: "stagiaire" },
  { id: "apprentis", name: "Les Apprentis Sorciers", crest: "🪄", colors: ["#39FF14", "#101018"], level: "stagiaire" },
  { id: "central", name: "Labo Central FC", crest: "🔬", colors: ["#FFD700", "#101018"], level: "chercheur" },
  { id: "cnrs", name: "CNRS Athletic", crest: "🏛️", colors: ["#8B5CF6", "#101018"], level: "chercheur" },
  { id: "nobel", name: "Nobel Galácticos", crest: "🏆", colors: ["#FF3366", "#101018"], level: "nobel" },
];
export const ME = "me";

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

export function newSeason(seed = Date.now()) {
  const ids = [ME, ...SEASON_CLUBS.map(c => c.id)];
  // le joueur affronte les clubs du plus faible au plus fort : on ordonne les journées en conséquence
  const days = roundRobin(ids).sort((a, b) => strength(opponentOf(a)) - strength(opponentOf(b)));
  return { id: seed >>> 0, day: 0, days, results: [], table: Object.fromEntries(ids.map(id => [id, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }])), done: false };
}
const opponentOf = games => { const g = games.find(x => x.includes(ME)); return g[0] === ME ? g[1] : g[0]; };
const strength = id => ({ stagiaire: 0, chercheur: 1, nobel: 2 }[SEASON_CLUBS.find(c => c.id === id)?.level] ?? 0);

export const clubOf = id => SEASON_CLUBS.find(c => c.id === id) || null;
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
  for (const [h, a] of s.days[s.day]) {
    let gh, ga;
    if (h === ME) { gh = myGoals; ga = oppGoals; } else if (a === ME) { gh = oppGoals; ga = myGoals; }
    else {
      const used = [];
      const sq = id => { const q = buildBotSquad(rng, used, clubOf(id).level); used.push(...q.lineup, ...q.bench); return { name: clubOf(id).name, ...q }; };
      const home = sq(h), away = sq(a);
      const r = simulateMatch({ home, away, halfTicks: 600 }, { seed: rng.int(1e9) }).report();
      gh = r.teams.home.score; ga = r.teams.away.score;
    }
    apply(s.table, h, a, gh, ga);
    s.results.push({ day: s.day, home: h, away: a, score: [gh, ga] });
  }
  s.day++; if (s.day >= s.days.length) s.done = true;
  return s;
}

export function standings(season) {
  return Object.entries(season.table).map(([id, r]) => ({ id, ...r, diff: r.gf - r.ga }))
    .sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.gf - a.gf || (a.id === ME ? -1 : b.id === ME ? 1 : a.id.localeCompare(b.id)));
}
