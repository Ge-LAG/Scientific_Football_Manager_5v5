import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb, publicUser } from '../server/db.js';
import { createAuth } from '../server/auth.js';
import { rateLimiter } from '../server/ratelimit.js';

const setup = async () => { const db = await openDb(':memory:'); return { db, auth: createAuth(db) }; };
const codeIs = (code) => (err) => err.code === code;

test('register / login / logout', async () => {
  const { db, auth } = await setup();
  const r = await auth.register('  Marie_Curie ', 'radium88');
  assert.equal(r.user.pseudo, 'Marie_Curie');
  assert.equal(r.user.lang, 'fr');
  assert.equal(r.user.stats.manager.elo, 1000);
  assert.ok(!('passHash' in r.user) && !('salt' in r.user) && !('pseudoLower' in r.user));
  assert.equal(auth.userFromToken(r.token).pseudo, 'Marie_Curie');

  const l = await auth.login('marie_curie', 'radium88');
  assert.ok(l.token && l.token !== r.token);
  auth.logout(l.token);
  assert.equal(auth.userFromToken(l.token), null);
  assert.ok(auth.userFromToken(r.token)); // l'autre session reste valide
  await assert.rejects(auth.login('Marie_Curie', 'wrongpass'), codeIs('BAD_CREDENTIALS'));
  await assert.rejects(auth.login('Inconnu', 'radium88'), codeIs('BAD_CREDENTIALS'));
});

test('pseudo : doublon insensible à la casse, réservés, invalides ; accents acceptés', async () => {
  const { auth } = await setup();
  await auth.register('Ada', 'lovelace');
  await assert.rejects(auth.register('ADA', 'lovelace'), codeIs('PSEUDO_TAKEN'));
  for (const p of ['admin', 'Root', 'Bot', 'bot_42', 'BOTANISTE', 'LabLeague', 'invite', 'Guest'])
    await assert.rejects(auth.register(p, 'secret12'), codeIs('PSEUDO_RESERVED'), p);
  for (const p of ['ab', 'x'.repeat(21), 'a b c', 'emoji🧪', '<script>', 42, null])
    await assert.rejects(auth.register(p, 'secret12'), codeIs('PSEUDO_INVALID'), String(p));
  const r = await auth.register('Émilie-du.Châtelet', 'secret12');
  assert.equal(r.user.pseudo, 'Émilie-du.Châtelet');
});

test('mot de passe invalide', async () => {
  const { auth } = await setup();
  for (const pw of ['12345', 'x'.repeat(129), undefined, 123456])
    await assert.rejects(auth.register('Newton', pw), codeIs('PASSWORD_INVALID'));
});

test('mot de passe jamais stocké en clair', async () => {
  const { db, auth } = await setup();
  await auth.register('Tesla', 'SuperSecretPw!');
  await auth.changePassword(db.getUserByPseudo('tesla').id, 'SuperSecretPw!', 'AnotherPw#2');
  const dump = db.dump();
  assert.ok(!dump.includes('SuperSecretPw!') && !dump.includes('AnotherPw#2'));
  const u = db.getUserByPseudo('Tesla');
  assert.equal(u.passHash.length, 128);
  assert.equal(u.salt.length, 32);
  await assert.rejects(auth.login('Tesla', 'SuperSecretPw!'), codeIs('BAD_CREDENTIALS'));
  assert.ok((await auth.login('Tesla', 'AnotherPw#2')).token);
  await assert.rejects(auth.changePassword(u.id, 'bad-old', 'whatever1'), codeIs('BAD_CREDENTIALS'));
  await assert.rejects(auth.changePassword(u.id, 'AnotherPw#2', '123'), codeIs('PASSWORD_INVALID'));
});

test('tokens de session hachés et expiration', async () => {
  const { db } = await setup();
  const u = db.createUser({ pseudo: 'Kepler', passHash: 'x', salt: 'y' });
  const token = db.createSession(u.id, 20);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!db.dump().includes(token));
  assert.equal(db.getSession(token), u.id);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(db.getSession(token), null);
  assert.equal(JSON.parse(db.dump()).sessions && Object.keys(JSON.parse(db.dump()).sessions).length, 0);
  assert.equal(db.getSession('nope'), null);
  assert.equal(db.getSession(undefined), null);
});

test('renouvellement glissant de session', async () => {
  const { db } = await setup();
  const u = db.createUser({ pseudo: 'Gauss', passHash: 'x', salt: 'y' });
  const token = db.createSession(u.id, 600);
  const exp0 = Object.values(JSON.parse(db.dump()).sessions)[0].expires;
  await new Promise((r) => setTimeout(r, 350)); // < moitié du TTL restante
  assert.equal(db.getSession(token), u.id);
  const exp1 = Object.values(JSON.parse(db.dump()).sessions)[0].expires;
  assert.ok(exp1 > exp0);
});

test('suppression de compte : utilisateur et sessions', async () => {
  const { db, auth } = await setup();
  const { token, user } = await auth.register('Darwin', 'beagle01');
  await auth.login('Darwin', 'beagle01');
  await assert.rejects(auth.deleteAccount(user.id, 'wrong-pw'), codeIs('BAD_CREDENTIALS'));
  await auth.deleteAccount(user.id, 'beagle01');
  assert.equal(db.getUserById(user.id), null);
  assert.equal(db.getUserByPseudo('darwin'), null);
  assert.equal(auth.userFromToken(token), null);
  assert.equal(Object.keys(JSON.parse(db.dump()).sessions).length, 0);
  await assert.rejects(auth.deleteAccount(user.id, 'beagle01'), codeIs('NOT_FOUND'));
  assert.ok((await auth.register('darwin', 'beagle02')).token); // pseudo libéré
});

test('db : updateUser (objet ou fonction) et publicUser', async () => {
  const { db } = await setup();
  const u = db.createUser({ pseudo: 'Noether', passHash: 'h', salt: 's' });
  db.updateUser(u.id, { lang: 'en', id: 'hack' });
  assert.equal(db.getUserById(u.id).lang, 'en');
  db.updateUser(u.id, (x) => { x.xp = 42; });
  assert.equal(db.getUserById(u.id).xp, 42);
  assert.equal(db.updateUser('missing', { xp: 1 }), null);
  const p = publicUser(db.getUserById(u.id));
  p.stats.manager.elo = 0; // copie indépendante
  assert.equal(db.getUserById(u.id).stats.manager.elo, 1000);
  assert.equal(u.id.length, 12);
});

test('db : persistance fichier aller-retour, écriture atomique', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lableague-'));
  try {
    const file = path.join(dir, 'sub', 'data.json');
    const db = await openDb(file); // crée dossier + fichier
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).users, {});
    const auth = createAuth(db);
    const { token } = await auth.register('Lavoisier', 'oxygene1');
    db.recordMatch({ mode: 'manager', date: 'x', participants: [] });
    await db.flush();
    assert.deepEqual((await readdir(path.dirname(file))).filter((f) => f.endsWith('.tmp')), []);
    await db.close();

    const db2 = await openDb(file);
    assert.equal(db2.userCount(), 1);
    assert.equal(db2.matchCount(), 1);
    assert.equal(db2.getUserByPseudo('LAVOISIER').pseudo, 'Lavoisier');
    const auth2 = createAuth(db2);
    assert.equal(auth2.userFromToken(token).pseudo, 'Lavoisier');
    assert.ok((await auth2.login('lavoisier', 'oxygene1')).token);
    await db2.close();
    const raw = await readFile(file, 'utf8');
    assert.equal(JSON.parse(raw).version, 1);
    assert.ok(!raw.includes('oxygene1'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('db : sauvegarde différée automatique', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lableague-'));
  try {
    const file = path.join(dir, 'data.json');
    const db = await openDb(file);
    db.createUser({ pseudo: 'Fermat', passHash: 'h', salt: 's' });
    assert.equal(Object.keys(JSON.parse(await readFile(file, 'utf8')).users).length, 0);
    // la sauvegarde différée (~1,5 s) peut être retardée par la charge de la machine : on sonde jusqu'à 8 s
    let n = 0;
    for (let i = 0; i < 40 && n === 0; i++) { await new Promise((r) => setTimeout(r, 200)); n = Object.keys(JSON.parse(await readFile(file, 'utf8')).users).length; }
    assert.equal(n, 1);
    await db.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('db : fichier corrompu non écrasé', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lableague-'));
  try {
    const file = path.join(dir, 'data.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, '{oops');
    await assert.rejects(openDb(file));
    assert.equal(await readFile(file, 'utf8'), '{oops');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('db : matches limités à 2000', async () => {
  const { db } = await setup();
  for (let i = 0; i < 2010; i++) db.recordMatch({ i });
  assert.equal(db.matchCount(), 2000);
  assert.equal(JSON.parse(db.dump()).matches[0].i, 10);
});

test('rateLimiter : fenêtre fixe', async () => {
  const rl = rateLimiter({ windowMs: 50, max: 2 });
  assert.ok(rl('a') && rl.hit('a'));
  assert.equal(rl('a'), false);
  assert.ok(rl('b'));
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(rl('a'));
  rl.stop();
});
