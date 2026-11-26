import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual, scryptSync, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  newClub, RuleError, requireRule, applyHost, addSignup, suggestOptions, clubView,
} from './domain.mjs';

const publicFolder = fileURLToPath(new URL('./public/', import.meta.url));
const digest = value => createHash('sha256').update(value).digest();
const equal = (left, right) => timingSafeEqual(digest(left), digest(right));
const cookieName = 'oldpren_host';
const sessionAge = 12 * 60 * 60 * 1000;
const validUsername = value => typeof value === 'string' && value.trim() === value && /^[A-Za-z0-9_.-]{2,40}$/.test(value);
const validPassword = value => typeof value === 'string' && value.length >= 14 && value.length <= 256 && value.trim().length > 0;
const hashPassword = (password, salt) => scryptSync(password, salt, 64);

export function createApp({ database, groupKey, publicUrl, accounts, allowLocalBootstrap = false, clock = () => new Date() }) {
  const origin = new URL(publicUrl);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.href !== origin.origin + '/') throw new Error('APP_URL harus berupa alamat utama web.');
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(groupKey ?? '')) throw new Error('GROUP_KEY harus dibuat lewat npm run setup.');
  const localAccountsAllowed = allowLocalBootstrap && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  const dummySalt = randomBytes(32);
  const dummyHash = Buffer.alloc(64);
  const sessions = new Map();
  const loginAttempts = [];
  const db = new DatabaseSync(database);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS club (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS host_accounts (
      id INTEGER PRIMARY KEY CHECK (id IN (1, 2)),
      username TEXT NOT NULL UNIQUE,
      salt BLOB NOT NULL,
      password_hash BLOB NOT NULL,
      local_only INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0
    );
  `);
  const read = db.prepare('SELECT data FROM club WHERE id = 1');
  const write = db.prepare('UPDATE club SET data = ? WHERE id = 1');
  db.prepare('INSERT OR IGNORE INTO club (id, data) VALUES (1, ?)').run(JSON.stringify(newClub()));
  const load = () => JSON.parse(read.get().data);
  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function change(mutator) {
    return transaction(() => {
      const club = load();
      const result = mutator(club);
      write.run(JSON.stringify(club));
      return result;
    });
  }
  const accountById = db.prepare('SELECT * FROM host_accounts WHERE id = ?');
  const accountByName = db.prepare('SELECT * FROM host_accounts WHERE username = ?');
  const updateAccount = db.prepare('UPDATE host_accounts SET username = ?, salt = ?, password_hash = ?, local_only = ?, revision = revision + 1 WHERE id = ?');
  try {
    transaction(() => {
      if (db.prepare('SELECT 1 FROM host_accounts LIMIT 1').get()) {
        if (!localAccountsAllowed && db.prepare('SELECT 1 FROM host_accounts WHERE local_only = 1 LIMIT 1').get()) {
          throw new Error('Ganti password awal kedua akun host di PC sebelum memakai database ini di server publik.');
        }
        return;
      }
      const usablePassword = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
      if (accounts.length !== 2 || accounts.some(account => !validUsername(account.name) || !usablePassword(account.password))
          || accounts[0].name === accounts[1].name) {
        throw new Error('Isi dua akun host berbeda dengan password minimal 14 karakter.');
      }
      const samePassword = accounts[0].password === accounts[1].password;
      if (!localAccountsAllowed && (samePassword || accounts.some(account => !validPassword(account.password)))) {
        throw new Error('Isi dua akun host berbeda dengan password minimal 14 karakter.');
      }
      const insert = db.prepare('INSERT INTO host_accounts (id, username, salt, password_hash, local_only) VALUES (?, ?, ?, ?, ?)');
      for (const [index, account] of accounts.entries()) {
        const salt = randomBytes(32);
        insert.run(index + 1, account.name, salt, hashPassword(account.password, salt), Number(samePassword || !validPassword(account.password)));
      }
    });
  } catch (error) {
    db.close();
    throw error;
  }

  function passwordMatches(account, password) {
    const candidate = hashPassword(password, account?.salt ?? dummySalt);
    return timingSafeEqual(candidate, account?.password_hash ?? dummyHash) && Boolean(account);
  }
  function confirmPassword(account, password, message, status) {
    const now = Date.now();
    while (loginAttempts.length && loginAttempts[0] < now - 300000) loginAttempts.shift();
    requireRule(loginAttempts.length < 30, 'Terlalu banyak percobaan. Coba beberapa menit lagi.', 429);
    if (!passwordMatches(account, password)) {
      loginAttempts.push(now);
      throw new RuleError(message, status);
    }
  }

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    if (origin.protocol === 'https:') res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  app.use('/assets', express.static(publicFolder, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/host', express.json({ limit: '48kb' }));
  app.use('/api', express.json({ limit: '8kb' }));
  app.use('/api', (req, res, next) => {
    if (req.method === 'POST') {
      requireRule(!req.headers.origin || req.headers.origin === origin.origin, 'Asal permintaan tidak valid.', 403);
      requireRule(req.is('application/json') && req.body && typeof req.body === 'object' && !Array.isArray(req.body), 'Format data tidak valid.', 415);
    }
    next();
  });

  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: origin.protocol === 'https:', path: '/api/host' };
  function hostSession(req, res, next) {
    const key = (req.headers.cookie ?? '').match(/(?:^|;\s*)oldpren_host=([\w-]{43})(?:;|$)/)?.[1];
    const login = sessions.get(key);
    const account = login && login.expires > Date.now() ? accountById.get(login.accountId) : null;
    if (!account || account.revision !== login.revision) {
      sessions.delete(key);
      throw new RuleError('Masuk sebagai host dulu.', 401);
    }
    req.oldprenAccount = account;
    req.oldprenHost = account.username;
    req.oldprenHostKey = key;
    next();
  }

  app.post('/api/host/login', (req, res) => {
    const now = Date.now();
    const { username, password } = req.body;
    requireRule(typeof username === 'string' && username.length <= 40 && typeof password === 'string' && password.length <= 256, 'Login tidak valid.', 400);
    const account = accountByName.get(username.trim());
    confirmPassword(account, password, 'Username atau password salah.', 401);
    for (const [key, login] of sessions) {
      if (login.expires <= now) sessions.delete(key);
    }
    const key = randomBytes(32).toString('base64url');
    sessions.set(key, { accountId: account.id, revision: account.revision, expires: now + sessionAge });
    res.cookie(cookieName, key, { ...cookieOptions, maxAge: sessionAge }).json({ ok: true });
  });

  const groupPath = '/c/' + groupKey;
  const hostView = (club, now, host) => ({ ...clubView(club, now, true), host, groupUrl: origin.origin + groupPath });
  app.get('/api/host', hostSession, (req, res) => res.json(hostView(load(), clock(), req.oldprenHost)));
  app.post('/api/host', hostSession, (req, res) => {
    const now = clock();
    const view = change(club => {
      applyHost(club, req.body, now, req.oldprenHost);
      return hostView(club, now, req.oldprenHost);
    });
    res.json(view);
  });
  app.post('/api/host/logout', hostSession, (req, res) => {
    sessions.delete(req.oldprenHostKey);
    res.clearCookie(cookieName, cookieOptions).json({ ok: true });
  });
  app.post('/api/host/credentials', hostSession, (req, res) => {
    const { username, password, currentPassword } = req.body;
    requireRule(typeof currentPassword === 'string' && currentPassword.length > 0 && currentPassword.length <= 256, 'Isi password saat ini.');
    requireRule(username === undefined || validUsername(username), 'Username harus 2–40 karakter. Gunakan huruf, angka, titik, garis bawah, atau tanda hubung.');
    requireRule(password === undefined || validPassword(password), 'Password baru harus 14–256 karakter.');
    const { id, revision } = req.oldprenAccount;
    transaction(() => {
      const account = accountById.get(id);
      requireRule(account.revision === revision, 'Akun sudah berubah. Masuk lagi sebagai host.', 401);
      confirmPassword(account, currentPassword, 'Password saat ini salah.', 403);
      const name = username ?? account.username;
      requireRule(name !== account.username || password !== undefined, 'Ubah username atau isi password baru.');
      if (name !== account.username) {
        requireRule(!accountByName.get(name), 'Username ini sudah dipakai.', 409);
      }
      let salt = account.salt;
      let hash = account.password_hash;
      if (password !== undefined) {
        const other = accountById.get(id === 1 ? 2 : 1);
        requireRule(password !== currentPassword && !passwordMatches(other, password), 'Gunakan password baru yang berbeda dari kedua password host saat ini.');
        salt = randomBytes(32);
        hash = hashPassword(password, salt);
      }
      updateAccount.run(name, salt, hash, password === undefined ? account.local_only : 0, id);
    });
    for (const [key, session] of sessions) {
      if (session.accountId === id) sessions.delete(key);
    }
    res.clearCookie(cookieName, cookieOptions).json({ ok: true });
  });
  app.post('/api/host/suggest', hostSession, (req, res) => {
    const club = load();
    const session = club.sessions.find(item => item.id === req.body.sessionId && !item.closed);
    requireRule(session, 'Sesi belum dibuka.', 404);
    const alternatives = suggestOptions(club, session, req.body.locked);
    res.json({ teams: alternatives[0], alternatives });
  });
  function checkGroup(req, res, next) {
    requireRule(equal(req.params.key, groupKey), 'Tautan grup tidak ditemukan.', 404);
    next();
  }
  app.get('/api/club/:key', checkGroup, (req, res) => res.json(clubView(load(), clock())));
  app.post('/api/club/:key/signup', checkGroup, (req, res) => {
    const now = clock();
    res.json(change(club => {
      addSignup(club, req.body, now);
      return clubView(club, now);
    }));
  });
  const shell = (req, res) => res.sendFile(publicFolder + 'index.html');
  app.get('/', (req, res) => {
    const tab = ['tierlist', 'riwayat', 'mvp'].includes(req.query.tab) ? req.query.tab : 'sesi';
    res.redirect(302, groupPath + '#' + tab);
  });
  app.get('/host', shell);
  app.get('/c/:key', checkGroup, shell);
  app.get('/healthz', (req, res) => res.type('text').send('ok'));
  app.use((req, res) => res.status(404).json({ error: 'Halaman tidak ditemukan.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof RuleError) return res.status(error.status).json({ error: error.message });
    if (error.status === 400 || error.status === 413) return res.status(error.status).json({ error: 'Data permintaan tidak valid.' });
    console.error('Kesalahan server:', error.code ?? error.name);
    res.status(500).json({ error: 'Ada gangguan. Coba lagi.' });
  });
  return { app, db };
}


