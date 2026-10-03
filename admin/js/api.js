// The one door to /api/admin. Holds the base URL and the session token, and
// turns every failure into an Error with .status, .slug and a readable message.
//
// The token lives in sessionStorage (gone when the tab closes) and only ever
// travels in the Authorization header — never in a URL.

const PROD = 'https://ttf.138-2-82-127.sslip.io/api/admin';
const API_KEY = 'ttfAdmin.api';
const TOKEN_KEY = 'ttfAdmin.session';

const store = {
  get(s, k) { try { return s.getItem(k); } catch { return null; } },
  set(s, k, v) { try { v == null ? s.removeItem(k) : s.setItem(k, v); } catch { /* private mode */ } },
};

/// ?api=<url> overrides the server and is remembered; ?api=default forgets it.
function pickBase() {
  const q = new URLSearchParams(location.search).get('api');
  if (q != null) {
    const v = q.trim().replace(/\/+$/, '');
    if (!v || v === 'default' || v === PROD) store.set(localStorage, API_KEY, null);
    else if (/^https?:\/\//i.test(v)) store.set(localStorage, API_KEY, v);
  }
  return (store.get(localStorage, API_KEY) || PROD).replace(/\/+$/, '');
}

export const BASE = pickBase();
export const IS_PROD = BASE === PROD;

let onSignedOut = () => {};
export const whenSignedOut = (fn) => { onSignedOut = fn; };

function readSession() {
  try {
    const s = JSON.parse(store.get(sessionStorage, TOKEN_KEY) || 'null');
    if (!s || s.base !== BASE || !s.token) return null;
    if (s.expiresUtc && Date.parse(s.expiresUtc) < Date.now()) return null;
    return s;
  } catch { return null; }
}
export const signedIn = () => !!readSession();
export const sessionExpires = () => (readSession() || {}).expiresUtc || null;
const forget = () => store.set(sessionStorage, TOKEN_KEY, null);

const SLUG_TEXT = {
  'admin-closed': 'The server has no admin password configured (TTF_ADMIN_PASSWORD is not set), so the admin is closed.',
  'bad-password': 'Wrong password.',
  'signed-out': 'Your admin session has ended. Sign in again.',
  'no-such-player': 'No such player.',
  'not-found': 'The server does not know that route — is it running an older build?',
  'bad-json': 'The server could not read the request.',
  'too-large': 'The request was too large.',
};

function errorFrom(status, j) {
  const slug = (j && j.error) || `http-${status}`;
  let msg = (j && j.message) || SLUG_TEXT[slug] || `${slug} (HTTP ${status})`;
  if (slug === 'locked' && j && j.retryAfterUtc) {
    const t = new Date(j.retryAfterUtc);
    msg = `Too many wrong passwords from this address. Try again after ${t.toLocaleTimeString()}.`;
  }
  const e = new Error(msg);
  e.status = status; e.slug = slug; e.body = j;
  return e;
}

async function call(method, path, body, { auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const s = readSession();
    if (!s) { onSignedOut(); throw errorFrom(401, { error: 'signed-out' }); }
    headers.Authorization = `Bearer ${s.token}`;
  }
  let res;
  try {
    res = await fetch(BASE + path, {
      method, headers, cache: 'no-store', credentials: 'omit', mode: 'cors',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    const err = new Error(`Could not reach ${BASE} — the server is down, or it does not allow this page's origin (${location.origin}).`);
    err.status = 0; err.slug = 'network';
    throw err;
  }
  let j = null;
  const text = await res.text();
  if (text) { try { j = JSON.parse(text); } catch { j = null; } }
  if (!res.ok) {
    const err = errorFrom(res.status, j);
    if (res.status === 401 && auth) { forget(); onSignedOut(); }
    throw err;
  }
  return j || {};
}

export const get = (path, params) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return call('GET', path + qs);
};
export const post = (path, body = {}) => call('POST', path, body);

export async function login(password) {
  const j = await call('POST', '/login', { password }, { auth: false });
  store.set(sessionStorage, TOKEN_KEY, JSON.stringify({ base: BASE, token: j.token, expiresUtc: j.expiresUtc }));
  return j;
}

export async function logout() {
  try { await call('POST', '/logout', {}); } catch { /* signing out anyway */ }
  forget();
}
