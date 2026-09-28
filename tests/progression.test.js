import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRADES, gradeOf, eloUpdate, ACHIEVEMENTS, xpForEntry, applyMatchResult, defaultStats } from '../shared/progression.js';

const newUser = () => ({ pseudo: 'T', xp: 0, achievements: [], stats: defaultStats(), history: [] });
const entry = (o = {}) => ({
  mode: 'manager', result: 'W', vsHuman: false, oppElo: null, goalsFor: 0, goalsAgainst: 0,
  goals: 0, assists: 0, saves: 0, tackles: 0, shots: 0, mvp: false, charId: null,
  clubName: 'Lab', opponentName: 'Bot', date: '2026-01-01T00:00:00.000Z', abandoned: false, ...o,
});

test('grades : seuils et progression', () => {
  assert.equal(GRADES.length, 7);
  assert.deepEqual(GRADES.map((g) => g.xp), [0, 300, 900, 2000, 4000, 7000, 12000]);
  assert.equal(gradeOf(0).fr, 'Stagiaire');
  assert.equal(gradeOf(299).index, 0);
  assert.equal(gradeOf(300).en, 'PhD Student');
  assert.equal(gradeOf(600).progress, 0.5);
  assert.equal(gradeOf(600).next, 900);
  assert.equal(gradeOf(4000).fr, 'Professeur');
  const top = gradeOf(99999);
  assert.equal(top.fr, 'Prix Nobel');
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
});

test('ELO : somme conservée, sens correct', () => {
  for (const [a, b, s] of [[1000, 1000, 1], [1000, 1000, 0.5], [1200, 1000, 0], [1450, 873, 1], [987, 1333, 0.5], [1001, 1000, 0.5]]) {
    const [na, nb] = eloUpdate(a, b, s);
    assert.equal(na + nb, a + b);
    assert.ok(Number.isInteger(na) && Number.isInteger(nb));
  }
  assert.deepEqual(eloUpdate(1000, 1000, 1), [1016, 984]);
  assert.deepEqual(eloUpdate(1000, 1000, 0.5), [1000, 1000]);
  assert.ok(eloUpdate(1400, 1000, 1)[0] - 1400 < 16);
});

test('xpForEntry', () => {
  assert.equal(xpForEntry(entry({ result: 'L' })), 50);
  assert.equal(xpForEntry(entry({ result: 'W' })), 110);
  assert.equal(xpForEntry(entry({ result: 'D' })), 75);
  assert.equal(xpForEntry(entry({ result: 'W', goalsFor: 2 })), 140);
  assert.equal(xpForEntry(entry({ result: 'W', goalsFor: 50 })), 110 + 75); // plafonné
  assert.equal(xpForEntry(entry({ mode: 'arena', result: 'L', goals: 1, assists: 2, saves: 3, goalsFor: 9 })), 50 + 15 + 20 + 24);
  assert.equal(xpForEntry(entry({ result: 'W', vsHuman: true })), 165);
  assert.equal(xpForEntry(entry({ result: 'L', abandoned: true })), 30);
  assert.ok(Number.isInteger(xpForEntry(entry({ result: 'D', vsHuman: true, abandoned: true }))));
});

test('succès : au moins 14, bien formés, ids uniques', () => {
  assert.ok(ACHIEVEMENTS.length >= 14);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.icon && a.fr.name && a.fr.desc && a.en.name && a.en.desc && typeof a.check === 'function', a.id);
  }
});

test('applyMatchResult : stats, séries, historique, succès', () => {
  const u = newUser();
  const r = applyMatchResult(u, entry({ result: 'W', goalsFor: 3, goalsAgainst: 0 }));
  assert.equal(u.stats.manager.played, 1);
  assert.equal(u.stats.manager.won, 1);
  assert.equal(u.stats.manager.goalsFor, 3);
  assert.equal(u.stats.manager.winStreak, 1);
  assert.equal(r.eloDelta, 0); // pas contre un humain
  assert.equal(u.stats.manager.elo, 1000);
  assert.equal(r.xpGained, 110 + 45);
  assert.equal(u.xp, r.xpGained);
  assert.deepEqual(r.newAchievements.sort(), ['clean_sheet', 'first_match', 'first_win'].sort());
  assert.deepEqual(u.history[0], { mode: 'manager', result: 'W', score: '3-0', opponentName: 'Bot', date: '2026-01-01T00:00:00.000Z', xp: 155, eloDelta: 0 });

  // Pas de redéblocage
  const r2 = applyMatchResult(u, entry({ result: 'W', goalsFor: 1, goalsAgainst: 0 }));
  assert.deepEqual(r2.newAchievements, []);
  assert.equal(u.stats.manager.winStreak, 2);

  for (let i = 0; i < 3; i++) applyMatchResult(u, entry({ result: 'W', goalsFor: 1, goalsAgainst: 1 }));
  assert.ok(u.achievements.includes('streak_5'));
  applyMatchResult(u, entry({ result: 'L' }));
  assert.equal(u.stats.manager.winStreak, 0);
  assert.equal(u.stats.manager.bestWinStreak, 5);
  assert.equal(u.stats.manager.lost, 1);

  for (let i = 0; i < 40; i++) applyMatchResult(u, entry({ result: 'D' }));
  assert.equal(u.history.length, 30);
  assert.equal(u.history[0].result, 'D');
  assert.ok(u.achievements.includes('matches_10'));
});

test('applyMatchResult : ELO contre humain + arène', () => {
  const u = newUser();
  const r = applyMatchResult(u, entry({ vsHuman: true, oppElo: 1000, result: 'W' }));
  assert.equal(r.eloDelta, 16);
  assert.equal(u.stats.manager.elo, 1016);
  assert.ok(r.newAchievements.includes('beat_human'));

  const a = applyMatchResult(u, entry({ mode: 'arena', result: 'W', vsHuman: true, oppElo: 1000, goals: 3, assists: 1, saves: 5, tackles: 2, shots: 6, mvp: true, goalsFor: 4, goalsAgainst: 2 }));
  assert.equal(u.stats.arena.elo, 1016);
  assert.equal(u.stats.manager.elo, 1016);
  assert.equal(u.stats.arena.goals, 3);
  assert.equal(u.stats.arena.mvp, 1);
  assert.equal(u.stats.arena.shots, 6);
  for (const id of ['first_goal', 'hat_trick', 'mvp', 'saves_5', 'arena_human_win']) assert.ok(a.newAchievements.includes(id), id);

  for (let i = 0; i < 9; i++) applyMatchResult(u, entry({ mode: 'arena', result: 'L', assists: 1 }));
  assert.ok(u.achievements.includes('assists_10'));
  assert.equal(u.stats.arena.played, 10);
});

test('applyMatchResult : montée de grade', () => {
  const u = newUser();
  u.xp = 290;
  const r = applyMatchResult(u, entry({ result: 'L' }));
  assert.equal(r.gradeUp, true);
  assert.equal(r.grade.id, 'phd');
  assert.equal(applyMatchResult(u, entry({ result: 'L' })).gradeUp, false);
  u.xp = 3990;
  assert.ok(applyMatchResult(u, entry({ result: 'L' })).newAchievements.includes('tenure'));
});

test('applyMatchResult : utilisateur partiel complété', () => {
  const u = { pseudo: 'Old' };
  const r = applyMatchResult(u, entry({ mode: 'arena', result: 'D', goals: 1 }));
  assert.equal(u.stats.arena.drawn, 1);
  assert.equal(r.xpGained, 90);
  assert.equal(u.history.length, 1);
});
