import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../server/db.js';
import { createAuth } from '../server/auth.js';
import { createApi, reportResults } from '../server/api.js';

let server, base, db, api;
let ipSeq = 0;
const newIp = () => `10.0.0.${++ipSeq}`; // IP distincte par test (limiteurs indépendants)

before(async () => {
  db = await openDb(':memory:');
  const auth = createAuth(db);
  api = createApi({ db, auth, getRooms: () => [{ id: 'r1', mode: 'arena', players: 2 }] });
  server = http.createServer(async (req, res) => {
    if (!(await api(req, res))) { res.writeHead(200); res.end('static'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  api.close();
  await new Promise((r) => server.close(r));
  await db.close();
});

async function call(method, path, { body, token, ip = '10.9.9.9', raw } = {}) {
  const headers = { 'x-forwarded-for': `1.2.3.4, ${ip}` }; // le proxy ajoute l'IP réelle à droite
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined || raw !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

const register = (pseudo, password = 'secret123', ip = newIp()) => call('POST', '/api/auth/register', { body: { pseudo, password }, ip });

test('health, routes hors /api, 404, en-têtes', async () => {
  const h = await call('GET', '/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.json.ok, true);
  assert.equal(typeof h.json.uptime, 'number');
  assert.equal(h.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(h.headers.get('cache-control'), 'no-store');
  const s = await fetch(base + '/index.html');
  assert.equal(await s.text(), 'static');
  assert.deepEqual((await call('GET', '/api/nope')).json, { error: 'NOT_FOUND' });
  assert.equal((await call('GET', '/api/nope')).status, 404);
  assert.equal((await call('GET', '/api/auth/login')).status, 405);
  assert.deepEqual((await call('GET', '/api/rooms')).json, { rooms: [{ id: 'r1', mode: 'arena', players: 2 }] });
});

test('inscription, connexion, /me, déconnexion', async () => {
  const ip = newIp();
  const r = await register('Curie', 'polonium1', ip);
  assert.equal(r.status, 201);
  assert.ok(r.json.token);
  assert.equal(r.json.user.pseudo, 'Curie');
  assert.ok(!('passHash' in r.json.user));

  assert.equal((await register('CURIE', 'polonium1', ip)).status, 409);
  assert.deepEqual((await register('CURIE', 'polonium1', ip)).json, { error: 'PSEUDO_TAKEN' });
  assert.deepEqual((await register('admin', 'polonium1', ip)).json, { error: 'PSEUDO_RESERVED' });
  assert.equal((await register('x', 'polonium1', ip)).status, 400);

  const l = await call('POST', '/api/auth/login', { body: { pseudo: 'curie', password: 'polonium1' }, ip });
  assert.equal(l.status, 200);
  const bad = await call('POST', '/api/auth/login', { body: { pseudo: 'curie', password: 'nope-nope' }, ip });
  assert.deepEqual([bad.status, bad.json], [401, { error: 'BAD_CREDENTIALS' }]);

  const me = await call('GET', '/api/me', { token: l.json.token });
  assert.equal(me.json.user.pseudo, 'Curie');
  assert.equal(me.json.user.settings !== undefined, true);
  assert.deepEqual((await call('GET', '/api/me')).json, { error: 'UNAUTHORIZED' });
  assert.equal((await call('GET', '/api/me', { token: 'garbage' })).status, 401);

  assert.deepEqual((await call('POST', '/api/auth/logout', { token: l.json.token })).json, { ok: true });
  assert.equal((await call('GET', '/api/me', { token: l.json.token })).status, 401);
  assert.equal((await call('GET', '/api/me', { token: r.json.token })).status, 200);
});

test('JSON invalide et corps trop gros', async () => {
  const ip = newIp();
  const bad = await call('POST', '/api/auth/login', { raw: '{nope', ip });
  assert.deepEqual([bad.status, bad.json], [400, { error: 'BAD_JSON' }]);
  const big = await call('POST', '/api/auth/login', { body: { pseudo: 'a', password: 'x'.repeat(20000) }, ip });
  assert.equal(big.status, 413);
});

test('limitation de débit auth (10/min par IP)', async () => {
  const ip = newIp();
  const statuses = [];
  for (let i = 0; i < 11; i++) statuses.push((await call('POST', '/api/auth/login', { body: { pseudo: 'nobody', password: 'whatever1' }, ip })).status);
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
  assert.equal(statuses[10], 429);
  const again = await call('POST', '/api/auth/register', { body: { pseudo: 'Other', password: 'whatever1' }, ip });
  assert.deepEqual(again.json, { error: 'RATE_LIMITED' });
  // Une autre IP n'est pas affectée ; les routes non-auth restent accessibles
  assert.equal((await register('FreshOne')).status, 201);
  assert.equal((await call('GET', '/api/health', { ip })).status, 200);
});

test('PATCH /api/me : validation et assainissement', async () => {
  const { json: { token } } = await register('Hopper');
  const patch = (body) => call('PATCH', '/api/me', { token, body });

  const ok = await patch({
    lang: 'en', settings: { volume: 0.5 },
    club: { name: '  Les Quarks  ', colors: ['#FF0000', '#00f'], crest: '⚛️', squad: ['Curie', 'Bohr'], formation: '1-2-1', strategy: 'pressing', extra: 'x' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.lang, 'en');
  assert.deepEqual(ok.json.user.settings, { volume: 0.5 });
  assert.deepEqual(ok.json.user.club, { name: 'Les Quarks', colors: ['#ff0000', '#00f'], crest: '⚛️', squad: ['Curie', 'Bohr'], formation: '1-2-1', strategy: 'pressing' });

  const invalid = [
    { lang: 'de' }, {}, { settings: [] }, { settings: { big: 'x'.repeat(3000) } },
    { club: { name: '' } }, { club: { name: 'x'.repeat(25) } }, { club: { name: 'A', colors: ['red', '#000'] } },
    { club: { name: 'A', colors: ['#000'] } }, { club: { name: 'A', squad: Array(9).fill('p') } },
    { club: { name: 'A', squad: ['x'.repeat(17)] } }, { club: { name: 'A', crest: 'x'.repeat(9) } },
    { club: { name: 'A', formation: 'x'.repeat(9) } }, { club: { name: 'A', strategy: 'x'.repeat(17) } },
    { club: 'string' }, { club: { name: 'A', pad: 'x'.repeat(5000) } },
  ];
  for (const body of invalid) {
    const r = await patch(body);
    assert.deepEqual([r.status, r.json], [400, { error: 'BAD_INPUT' }], JSON.stringify(body).slice(0, 80));
  }
  assert.equal((await call('PATCH', '/api/me', { body: { lang: 'fr' } })).status, 401);
  assert.equal((await patch({ club: null })).json.user.club, null);
});

test('changement de mot de passe et suppression de compte', async () => {
  const ip = newIp();
  let { json: { token } } = await register('Turing', 'enigma01', ip);
  assert.equal((await call('POST', '/api/me/password', { token, body: { oldPassword: 'bad-pass', newPassword: 'bombe002' } })).status, 401);
  assert.equal((await call('POST', '/api/me/password', { token, body: { oldPassword: 'enigma01', newPassword: '123' } })).status, 400);
  const changed = (await call('POST', '/api/me/password', { token, body: { oldPassword: 'enigma01', newPassword: 'bombe002' } })).json;
  assert.equal(changed.ok, true); assert.ok(changed.token && changed.token !== token, 'nouveau jeton remis');
  assert.equal((await call('GET', '/api/me', { token })).status, 401, 'ancienne session révoquée');
  token = changed.token;
  assert.equal((await call('POST', '/api/auth/login', { body: { pseudo: 'Turing', password: 'bombe002' }, ip })).status, 200);

  assert.equal((await call('DELETE', '/api/me', { token, body: { password: 'enigma01' } })).status, 401);
  assert.deepEqual((await call('DELETE', '/api/me', { token, body: { password: 'bombe002' } })).json, { ok: true });
  assert.equal((await call('GET', '/api/me', { token })).status, 401);
  assert.equal((await call('GET', '/api/users/Turing')).status, 404);
  assert.equal(db.getUserByPseudo('turing'), null);
});

test('profil public, reportResults et classement', async () => {
  const a = (await register('Alpha1')).json.user;
  const b = (await register('Beta2')).json.user;
  const c = (await register('Gamma3')).json.user;
  await register('Idle4'); // jamais joué : absent du classement
  const e = (result, o = {}) => ({ mode: 'manager', result, vsHuman: true, oppElo: 1000, goalsFor: 2, goalsAgainst: 1, date: '2026-09-01T10:00:00.000Z', opponentName: 'X', ...o });

  const res = await reportResults(db, [{ userId: a.id, entry: e('W') }, { userId: b.id, entry: e('L') }, { userId: 'ghost', entry: e('W') }]);
  assert.equal(res.length, 2);
  assert.equal(res[0].eloDelta, 16);
  assert.equal(res[1].eloDelta, -16);
  assert.ok(res[0].newAchievements.includes('first_win'));
  assert.equal(typeof res[0].gradeUp, 'boolean');
  await reportResults(db, [{ userId: c.id, entry: e('W', { vsHuman: false, oppElo: null }) }]);
  await reportResults(db, []);

  const lb = await call('GET', '/api/leaderboard?mode=manager');
  assert.equal(lb.json.mode, 'manager');
  const names = lb.json.rows.map((r) => r.pseudo);
  assert.deepEqual(names.slice(0, 3), ['Alpha1', 'Gamma3', 'Beta2']); // 1016, 1000 (1 victoire), 984
  assert.ok(!names.includes('Idle4'));
  assert.deepEqual(Object.keys(lb.json.rows[0]).sort(), ['drawn', 'elo', 'lost', 'played', 'pseudo', 'won', 'xp'].sort());
  assert.equal((await call('GET', '/api/leaderboard?mode=arena')).json.rows.length, 0);
  assert.equal((await call('GET', '/api/leaderboard?mode=foo')).status, 400);

  await reportResults(db, [{ userId: b.id, entry: e('W', { mode: 'arena', goals: 2, vsHuman: false }) }]);
  const arena = (await call('GET', '/api/leaderboard?mode=arena')).json.rows;
  assert.deepEqual(arena.map((r) => [r.pseudo, r.goals]), [['Beta2', 2]]);

  const p = await call('GET', '/api/users/alpha1');
  assert.equal(p.json.user.pseudo, 'Alpha1');
  assert.ok(!('settings' in p.json.user) && !('passHash' in p.json.user) && !('salt' in p.json.user));
  assert.equal(p.json.user.history.length, 1);
  assert.equal(p.json.user.history[0].score, '2-1');
  assert.equal((await call('GET', '/api/users/%E0%A4%A')).status, 400);
  assert.ok(db.matchCount() >= 2);
});

test('limite générale API (120/min)', async () => {
  const ip = newIp();
  let last;
  for (let i = 0; i < 121; i++) last = await call('GET', '/api/health', { ip });
  assert.equal(last.status, 429);
  assert.deepEqual(last.json, { error: 'RATE_LIMITED' });
});

test('PATCH /api/me : apparences et power-ups préférés (nettoyés, profil public sans sélections)', async () => {
  const { json: { token } } = await register('Lovelace');
  const patch = (body) => call('PATCH', '/api/me', { token, body });
  const own = ['pu_informatique_hotfix', 'pu_informatique_ctrlz'];
  const r = await patch({ looks: { roland: { hairStyle: 'mullet_perm', outfit: 'rockstar', hairColor: '<script>' }, constructor: { outfit: 'x' }, hacker: {} },
    loadouts: { roland: [own[1], 'nope', own[0]], constructor: ['x'] } });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json.user.looks), ['roland']);
  assert.equal(r.json.user.looks.roland.hairStyle, 'mullet_perm');
  assert.equal(r.json.user.looks.roland.outfit, 'rockstar');
  assert.match(r.json.user.looks.roland.hairColor, /^#[0-9a-f]{6}$/);
  assert.deepEqual(r.json.user.loadouts, { roland: [own[1], own[0]] });
  for (const body of [{ looks: [1, 2] }, { loadouts: 'x' }, { looks: { roland: { pad: 'y'.repeat(25000) } } }]) {
    const b = await patch(body); assert.ok([400, 413].includes(b.status), JSON.stringify(body).slice(0, 60)); // refusé (invalide ou trop gros)
  }
  const pub = await call('GET', '/api/users/Lovelace');
  assert.equal(pub.status, 200);
  assert.equal(pub.json.user.loadouts, undefined, 'sélections privées');
  assert.equal(pub.json.user.looks.roland.hairStyle, 'mullet_perm', 'apparence publique');
});
