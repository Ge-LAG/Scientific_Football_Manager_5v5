// Authentification : pseudo + mot de passe uniquement (aucune donnée personnelle).
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { publicUser } from './db.js';

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;
const PSEUDO_RE = /^[A-Za-z0-9_\-.À-ÖØ-öø-ÿ]+$/;
const RESERVED = new Set(['admin', 'administrateur', 'root', 'bot', 'system', 'moderator', 'invite', 'guest', 'lableague']);

const fail = (code) => Object.assign(new Error(code), { code });

function hash(password, saltHex) {
  return new Promise((resolve, reject) =>
    scrypt(password, Buffer.from(saltHex, 'hex'), KEYLEN, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))));
}

async function verify(password, saltHex, hashHex) {
  const key = await hash(password, saltHex);
  const ref = Buffer.from(hashHex, 'hex');
  return ref.length === key.length && timingSafeEqual(key, ref);
}

export function normalizePseudo(pseudo) {
  if (typeof pseudo !== 'string') throw fail('PSEUDO_INVALID');
  const p = pseudo.trim().normalize('NFC');
  if (p.length < 3 || p.length > 20 || !PSEUDO_RE.test(p)) throw fail('PSEUDO_INVALID');
  const low = p.toLowerCase();
  if (RESERVED.has(low) || low.startsWith('bot')) throw fail('PSEUDO_RESERVED');
  return p;
}

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 6 || pw.length > 128) throw fail('PASSWORD_INVALID');
}

export function createAuth(db) {
  // Hash factice : temps de réponse similaire pour un pseudo inconnu
  const dummySalt = randomBytes(16).toString('hex');
  const dummyHash = randomBytes(KEYLEN).toString('hex');

  async function checkUserPassword(user, password) {
    const ok = typeof password === 'string' && password.length <= 128;
    const pw = ok ? password : '';
    if (!user) { await verify(pw, dummySalt, dummyHash); return false; }
    return (await verify(pw, user.salt, user.passHash)) && ok;
  }

  return {
    async register(pseudo, password) {
      const p = normalizePseudo(pseudo);
      checkPassword(password);
      if (db.getUserByPseudo(p)) throw fail('PSEUDO_TAKEN');
      const salt = randomBytes(16).toString('hex');
      const passHash = (await hash(password, salt)).toString('hex');
      if (db.getUserByPseudo(p)) throw fail('PSEUDO_TAKEN'); // course pendant le hash
      const user = db.createUser({ pseudo: p, passHash, salt });
      return { token: db.createSession(user.id), user: publicUser(user) };
    },

    async login(pseudo, password) {
      const user = typeof pseudo === 'string' ? db.getUserByPseudo(pseudo) : null;
      if (!(await checkUserPassword(user, password))) throw fail('BAD_CREDENTIALS');
      return { token: db.createSession(user.id), user: publicUser(user) };
    },

    logout(token) {
      return db.deleteSession(token);
    },

    // Renvoie l'enregistrement interne complet (ou null) ; utiliser publicUser() avant exposition
    userFromToken(token) {
      const id = db.getSession(token);
      return id ? db.getUserById(id) : null;
    },

    async deleteAccount(userId, password) {
      const user = db.getUserById(userId);
      if (!user) throw fail('NOT_FOUND');
      if (!(await checkUserPassword(user, password))) throw fail('BAD_CREDENTIALS');
      db.deleteUser(userId);
      return true;
    },

    async changePassword(userId, oldPw, newPw) {
      const user = db.getUserById(userId);
      if (!user) throw fail('NOT_FOUND');
      if (!(await checkUserPassword(user, oldPw))) throw fail('BAD_CREDENTIALS');
      checkPassword(newPw);
      const salt = randomBytes(16).toString('hex');
      const passHash = (await hash(newPw, salt)).toString('hex');
      db.updateUser(userId, { passHash, salt });
      return true;
    },
  };
}
