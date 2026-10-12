// Persistance JSON (sans module natif) : écriture atomique + sauvegarde différée.
import { randomBytes, createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { defaultStats } from '../shared/progression.js';

const SAVE_DELAY = 1500;
const MAX_MATCHES = 2000;
const DEFAULT_TTL = 30 * 24 * 3600 * 1000;
const BACKUP_KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 7);
const DAY_MS = 24 * 3600 * 1000;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const emptyData = () => ({ version: 1, users: {}, sessions: {}, matches: [] });
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Copies quotidiennes : <dossier>/backups/<base>-AAAA-MM-JJ.json
const backupBase = file => path.basename(file).replace(/\.[^.]+$/, "");
const backupDirOf = file => path.join(path.dirname(path.resolve(file)), "backups");
const backupRe = file => new RegExp(`^${escapeRe(backupBase(file))}-\\d{4}-\\d{2}-\\d{2}\\.json$`);

// Copie datée du fichier de données ; une seule par jour, rotation sur `keep` copies.
export async function runBackup(file, { now = new Date(), keep = BACKUP_KEEP } = {}) {
  const dir = backupDirOf(file);
  const date = now.toISOString().slice(0, 10);
  const name = `${backupBase(file)}-${date}.json`;
  await fsp.mkdir(dir, { recursive: true });
  let created = false;
  try { await fsp.access(path.join(dir, name)); }
  catch { await writeAtomic(path.join(dir, name), await fsp.readFile(file)); created = true; }
  const re = backupRe(file);
  const copies = (await fsp.readdir(dir)).filter(f => re.test(f)).sort();
  for (const f of copies.slice(0, Math.max(0, copies.length - keep))) await fsp.rm(path.join(dir, f), { force: true });
  return { name, date, created };
}

// Nom de la dernière copie disponible pour ce fichier de données, ou null.
export async function latestBackup(file) {
  const re = backupRe(file);
  const copies = await fsp.readdir(backupDirOf(file)).then(fs => fs.filter(f => re.test(f)).sort(), () => []);
  return copies.at(-1) || null;
}

// Utilisateur public : sans secrets ni champs internes
export function publicUser(user) {
  if (!user) return null;
  const { passHash, salt, pseudoLower, ...rest } = user;
  return structuredClone(rest);
}

export async function openDb(filePath) {
  const memory = filePath === ':memory:';
  let data = emptyData();

  if (!memory) {
    await fsp.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      data = { ...emptyData(), ...JSON.parse(raw) };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // fichier corrompu : on refuse d'écraser et on indique la dernière copie
        const last = await latestBackup(filePath);
        throw Object.assign(new Error(`fichier de données illisible : ${path.basename(filePath)} — dernière copie : ${last ? `backups/${last}` : "aucune copie"}`), { cause: err });
      }
      await writeAtomic(filePath, JSON.stringify(data));
    }
  }

  // Index pseudo (minuscules) -> id
  const byPseudo = new Map();
  for (const u of Object.values(data.users)) byPseudo.set(u.pseudoLower, u.id);

  let timer = null, dirty = false, closed = false, saving = Promise.resolve();

  function markDirty() {
    if (memory) return;
    dirty = true;
    if (!timer && !closed) {
      timer = setTimeout(() => { timer = null; flush().catch((e) => console.error('[db] save', e)); }, SAVE_DELAY);
      timer.unref?.();
    }
  }

  // Sérialise les sauvegardes pour éviter deux écritures concurrentes
  function flush() {
    if (memory) return Promise.resolve();
    if (timer) { clearTimeout(timer); timer = null; }
    saving = saving.catch(() => {}).then(async () => {
      if (!dirty) return;
      dirty = false;
      try { await writeAtomic(filePath, JSON.stringify(data)); }
      catch (e) { dirty = true; throw e; }
    });
    return saving;
  }

  function newId() {
    let id;
    do id = randomBytes(9).toString('base64url'); while (data.users[id]);
    return id;
  }

  function purgeExpired(now = Date.now()) {
    for (const [h, s] of Object.entries(data.sessions)) if (s.expires <= now) { delete data.sessions[h]; dirty = true; }
  }

  const db = {
    createUser({ pseudo, passHash, salt }) {
      const lower = pseudo.toLowerCase();
      if (byPseudo.has(lower)) throw Object.assign(new Error('pseudo taken'), { code: 'PSEUDO_TAKEN' });
      const user = {
        id: newId(), pseudo, pseudoLower: lower, passHash, salt, createdAt: new Date().toISOString(),
        lang: 'fr', settings: {}, club: null, xp: 0, achievements: [], stats: defaultStats(), history: [],
      };
      data.users[user.id] = user;
      byPseudo.set(lower, user.id);
      markDirty();
      return user;
    },
    getUserById: (id) => (typeof id === 'string' && Object.hasOwn(data.users, id) ? data.users[id] : null),
    getUserByPseudo(pseudo) {
      if (typeof pseudo !== 'string') return null;
      const id = byPseudo.get(pseudo.trim().normalize('NFC').toLowerCase());
      return id ? data.users[id] : null;
    },
    // patch : fonction (mute l'utilisateur) ou objet fusionné ; renvoie l'utilisateur ou null
    updateUser(id, patch) {
      const user = db.getUserById(id);
      if (!user) return null;
      const oldLower = user.pseudoLower;
      if (typeof patch === 'function') patch(user);
      else Object.assign(user, patch);
      user.id = id;
      user.pseudoLower = user.pseudo.toLowerCase();
      if (user.pseudoLower !== oldLower) { byPseudo.delete(oldLower); byPseudo.set(user.pseudoLower, id); }
      markDirty();
      return user;
    },
    deleteUser(id) {
      const user = db.getUserById(id);
      if (!user) return false;
      delete data.users[id];
      byPseudo.delete(user.pseudoLower);
      for (const [h, s] of Object.entries(data.sessions)) if (s.userId === id) delete data.sessions[h];
      markDirty();
      return true;
    },
    deleteUserSessions(id) {
      for (const [h, s] of Object.entries(data.sessions)) if (s.userId === id) delete data.sessions[h];
      markDirty();
    },
    createSession(userId, ttlMs = DEFAULT_TTL) {
      purgeExpired();
      const token = randomBytes(32).toString('base64url');
      data.sessions[sha256(token)] = { userId, expires: Date.now() + ttlMs, ttl: ttlMs };
      markDirty();
      return token;
    },
    getSession(rawToken) {
      if (typeof rawToken !== 'string' || !rawToken || rawToken.length > 200) return null;
      const h = sha256(rawToken);
      const s = Object.hasOwn(data.sessions, h) ? data.sessions[h] : null;
      if (!s) return null;
      const now = Date.now();
      if (s.expires <= now || !data.users[s.userId]) { delete data.sessions[h]; markDirty(); return null; }
      const ttl = s.ttl || DEFAULT_TTL;
      if (s.expires - now < ttl / 2) { s.expires = now + ttl; markDirty(); } // renouvellement glissant
      return s.userId;
    },
    deleteSession(rawToken) {
      if (typeof rawToken !== 'string') return false;
      const h = sha256(rawToken);
      if (!Object.hasOwn(data.sessions, h)) return false;
      delete data.sessions[h];
      markDirty();
      return true;
    },
    recordMatch(record) {
      data.matches.push(record);
      if (data.matches.length > MAX_MATCHES) data.matches.splice(0, data.matches.length - MAX_MATCHES);
      markDirty();
    },
    leaderboard(mode = 'manager', limit = 50) {
      const m = mode === 'arena' ? 'arena' : 'manager';
      const rows = [];
      for (const u of Object.values(data.users)) {
        const s = u.stats?.[m];
        if (!s || s.played < 1) continue;
        const row = { pseudo: u.pseudo, elo: s.elo, played: s.played, won: s.won, drawn: s.drawn, lost: s.lost, xp: u.xp };
        if (m === 'arena') row.goals = s.goals;
        rows.push(row);
      }
      rows.sort((a, b) => b.elo - a.elo || b.won - a.won);
      return rows.slice(0, Math.max(0, limit));
    },
    userCount: () => Object.keys(data.users).length,
    matchCount: () => data.matches.length,
    dump: () => JSON.stringify(data), // debug / tests
    flush,
    lastBackup: null, // date AAAA-MM-JJ de la dernière copie (jamais de chemin)
    async backupNow(now = new Date()) {
      if (memory) return null;
      await flush(); // écrire l'état courant avant de copier
      const r = await runBackup(filePath, { now });
      db.lastBackup = r.date;
      return r;
    },
    async close() {
      closed = true;
      if (timer) { clearTimeout(timer); timer = null; }
      if (backupTimer) { clearInterval(backupTimer); backupTimer = null; }
      await flush();
    },
  };
  // copie quotidienne : au démarrage, puis toutes les 24 h (une par date)
  let backupTimer = null;
  if (!memory) {
    try { await db.backupNow(); } catch (e) { console.error("[db] sauvegarde", e); }
    backupTimer = setInterval(() => db.backupNow().catch(e => console.error("[db] sauvegarde", e)), DAY_MS);
    backupTimer.unref?.();
  }
  return db;
}

// Écrit dans un fichier temporaire du même dossier puis renomme (atomique)
async function writeAtomic(file, content) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  await fsp.writeFile(tmp, content, 'utf8');
  for (let i = 0; ; i++) {
    try { await fsp.rename(tmp, file); return; }
    catch (e) {
      // Windows : le fichier cible peut être brièvement verrouillé
      if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { await fsp.rm(tmp, { force: true }); throw e; }
      await new Promise((r) => setTimeout(r, 20 * (i + 1)));
    }
  }
}
