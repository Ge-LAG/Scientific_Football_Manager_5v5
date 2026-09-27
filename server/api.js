// API REST JSON (/api/*) : comptes, profil, classements, salons.
import { publicUser } from './db.js';
import { rateLimiter } from './ratelimit.js';
import { applyMatchResult } from '../shared/progression.js';

const BODY_LIMIT = 16 * 1024;
const STATUS = {
  PSEUDO_INVALID: 400, PSEUDO_RESERVED: 400, PASSWORD_INVALID: 400, BAD_INPUT: 400, BAD_JSON: 400,
  PSEUDO_TAKEN: 409, BAD_CREDENTIALS: 401, UNAUTHORIZED: 401, NOT_FOUND: 404,
};

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const bad = () => new HttpError(400, 'BAD_INPUT');

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > BODY_LIMIT) {
      req.resume(); // vide le flux sans le stocker
      return reject(new HttpError(413, 'PAYLOAD_TOO_LARGE'));
    }
    const chunks = []; let size = 0, over = false;
    req.on('data', (c) => { size += c.length; if (size > BODY_LIMIT) over = true; else chunks.push(c); });
    req.on('end', () => {
      if (over) return reject(new HttpError(413, 'PAYLOAD_TOO_LARGE'));
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        const v = JSON.parse(raw);
        if (!v || typeof v !== 'object' || Array.isArray(v)) return reject(bad());
        resolve(v);
      } catch { reject(new HttpError(400, 'BAD_JSON')); }
    });
    req.on('error', reject);
  });
}

// Adresse du client : l'entrée la plus à droite de X-Forwarded-For est celle ajoutée par notre proxy
// (les entrées de gauche sont fournies par le client et falsifiables). TRUST_PROXY=0 : on l'ignore.
export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (process.env.TRUST_PROXY !== '0' && typeof xff === 'string' && xff.trim()) { const parts = xff.split(',').map(s => s.trim()).filter(Boolean); if (parts.length) return parts[parts.length - 1]; }
  return req.socket?.remoteAddress || 'unknown';
}

function bearer(req) {
  const h = req.headers.authorization;
  const m = typeof h === 'string' && /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

// --- Validation du PATCH /api/me ---
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const jsonSize = (v) => Buffer.byteLength(JSON.stringify(v));
const clean = (s) => s.replace(/[\u0000-\u001f\u007f]/g, '').trim(); // retire les caractères de contrôle
const cp = (s) => [...s].length; // longueur en points de code (emojis)

function str(v, max, { required = false } = {}) {
  if (v === undefined || v === null) { if (required) throw bad(); return undefined; }
  if (typeof v !== 'string') throw bad();
  const s = clean(v);
  if (cp(s) > max || (required && !s)) throw bad();
  return s;
}

function sanitizeClub(c) {
  if (c === null) return null;
  if (!isObj(c) || jsonSize(c) > 4096) throw bad();
  const club = { name: str(c.name, 24, { required: true }) };
  if (c.colors !== undefined) {
    if (!Array.isArray(c.colors) || c.colors.length !== 2) throw bad();
    club.colors = c.colors.map((x) => {
      if (typeof x !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(x)) throw bad();
      return x.toLowerCase();
    });
  }
  const crest = str(c.crest, 8); if (crest !== undefined) club.crest = crest;
  if (c.squad !== undefined) {
    if (!Array.isArray(c.squad) || c.squad.length > 8) throw bad();
    club.squad = c.squad.map((x) => str(x, 16, { required: true }));
  }
  const formation = str(c.formation, 8); if (formation !== undefined) club.formation = formation;
  const strategy = str(c.strategy, 16); if (strategy !== undefined) club.strategy = strategy;
  return club;
}

function sanitizePatch(body) {
  const patch = {};
  if (body.lang !== undefined) {
    if (body.lang !== 'fr' && body.lang !== 'en') throw bad();
    patch.lang = body.lang;
  }
  if (body.settings !== undefined) {
    if (!isObj(body.settings) || jsonSize(body.settings) > 2048) throw bad();
    patch.settings = JSON.parse(JSON.stringify(body.settings));
  }
  if (body.club !== undefined) patch.club = sanitizeClub(body.club);
  if (!Object.keys(patch).length) throw bad();
  return patch;
}

function publicProfile(user) {
  const u = publicUser(user);
  delete u.settings;
  return u;
}

export function createApi({ db, auth, getRooms, getOnline }) {
  const authLimit = rateLimiter({ windowMs: 60_000, max: 10 });
  const pseudoFailLimit = rateLimiter({ windowMs: 15 * 60_000, max: 10 }); // échecs de connexion par pseudo
  const apiLimit = rateLimiter({ windowMs: 60_000, max: 120 });
  const started = Date.now();

  function requireUser(req) {
    const user = auth.userFromToken(bearer(req));
    if (!user) throw new HttpError(401, 'UNAUTHORIZED');
    return user;
  }

  // Table des routes : [méthode, motif, handler(ctx) -> [status, body] | body]
  const routes = [
    ['GET', /^\/api\/health$/, () => ({ ok: true, uptime: Math.round((Date.now() - started) / 1000), users: db.userCount(), online: getOnline ? getOnline() : 0, rooms: getRooms ? getRooms().length : 0 })],
    ['POST', /^\/api\/auth\/register$/, async ({ req }) => {
      const b = await readBody(req);
      return [201, await auth.register(b.pseudo, b.password)];
    }, 'auth'],
    ['POST', /^\/api\/auth\/login$/, async ({ req }) => {
      const b = await readBody(req);
      const key = 'p:' + String(b.pseudo || '').toLowerCase().slice(0, 40);
      try { return await auth.login(b.pseudo, b.password); }
      catch (e) { if (e.code === 'BAD_CREDENTIALS' && !pseudoFailLimit(key)) throw new HttpError(429, 'RATE_LIMITED'); throw e; }
    }, 'auth'],
    ['POST', /^\/api\/auth\/logout$/, ({ req }) => {
      const t = bearer(req);
      if (t) auth.logout(t);
      return { ok: true };
    }],
    ['GET', /^\/api\/me$/, ({ req }) => ({ user: publicUser(requireUser(req)) })],
    ['PATCH', /^\/api\/me$/, async ({ req }) => {
      const user = requireUser(req);
      const patch = sanitizePatch(await readBody(req));
      return { user: publicUser(db.updateUser(user.id, patch)) };
    }],
    ['DELETE', /^\/api\/me$/, async ({ req }) => {
      const user = requireUser(req);
      const b = await readBody(req);
      await auth.deleteAccount(user.id, b.password);
      return { ok: true };
    }],
    ['POST', /^\/api\/me\/password$/, async ({ req }) => {
      const user = requireUser(req);
      const b = await readBody(req);
      await auth.changePassword(user.id, b.oldPassword, b.newPassword);
      // toutes les sessions existantes sont révoquées ; une nouvelle est remise à l'appelant
      db.deleteUserSessions(user.id);
      return { ok: true, token: db.createSession(user.id) };
    }],
    ['GET', /^\/api\/leaderboard$/, ({ url }) => {
      const mode = url.searchParams.get('mode') || 'manager';
      if (mode !== 'manager' && mode !== 'arena') throw bad();
      return { mode, rows: db.leaderboard(mode) };
    }],
    ['GET', /^\/api\/users\/([^/]+)$/, ({ match }) => {
      let pseudo;
      try { pseudo = decodeURIComponent(match[1]); } catch { throw bad(); }
      const user = db.getUserByPseudo(pseudo);
      if (!user) throw new HttpError(404, 'NOT_FOUND');
      return { user: publicProfile(user) };
    }],
    ['GET', /^\/api\/rooms$/, () => ({ rooms: getRooms ? getRooms() : [] })],
  ];

  async function handle(req, res) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return false; }
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return false;

    try {
      const ip = clientIp(req);
      if (!apiLimit(ip)) throw new HttpError(429, 'RATE_LIMITED');

      const path = url.pathname.replace(/\/+$/, '') || '/';
      let pathMatched = false;
      for (const [method, re, fn, group] of routes) {
        const match = re.exec(path);
        if (!match) continue;
        pathMatched = true;
        if (method !== req.method) continue;
        if (group === 'auth' && !authLimit(ip)) throw new HttpError(429, 'RATE_LIMITED');
        const out = await fn({ req, url, match });
        const [status, body] = Array.isArray(out) ? out : [200, out];
        send(res, status, body);
        return true;
      }
      throw pathMatched ? new HttpError(405, 'METHOD_NOT_ALLOWED') : new HttpError(404, 'NOT_FOUND');
    } catch (err) {
      const status = err instanceof HttpError ? err.status : STATUS[err?.code];
      if (status) send(res, status, { error: err.code });
      else { console.error('[api]', err); send(res, 500, { error: 'SERVER_ERROR' }); }
    }
    return true;
  }

  handle.close = () => { authLimit.stop(); apiLimit.stop(); pseudoFailLimit.stop(); };
  return handle;
}

// Applique les résultats d'un match aux comptes existants (appelé par les salons)
export async function reportResults(db, entries) {
  const out = [];
  const participants = [];
  for (const { userId, entry } of entries || []) {
    let r = null;
    const user = db.updateUser(userId, (u) => { r = applyMatchResult(u, entry); });
    if (!user || !r) continue;
    out.push({ userId, ...r });
    participants.push({ pseudo: user.pseudo, result: entry.result });
  }
  if (entries?.length) {
    const first = entries[0].entry || {};
    db.recordMatch({ mode: first.mode, date: first.date || new Date().toISOString(), participants });
  }
  return out;
}
