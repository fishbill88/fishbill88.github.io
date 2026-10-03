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

/// ?api=<url> points the page at a LOCAL dev server and is remembered;
/// ?api=default forgets it.
///
/// Loopback only (security review, 3 Oct 2026). This page is the one origin the
/// game API's CORS allowlist trusts, and the sign-in form posts the real admin
/// password to BASE — so a link such as ?api=https://attacker/x would make the
/// genuine page, on its genuine certificate, hand that password to a stranger,
/// and remember to keep doing so. A dev override has exactly one honest use,
/// an API running on this machine, and that is the only thing it may name now.
/// Anything else, including a value an older build already stored, is dropped.
function isLocalApi(v) {
  try {
    const u = new URL(v);
    return /^https?:$/.test(u.protocol)
        && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname);
  } catch { return false; }
}
function pickBase() {
  const q = new URLSearchParams(location.search).get('api');
  if (q != null) {
    const v = q.trim().replace(/\/+$/, '');
    if (!v || v === 'default' || v === PROD) store.set(localStorage, API_KEY, null);
    else if (isLocalApi(v)) store.set(localStorage, API_KEY, v);
    else console.warn('[admin] ignoring ?api= — only a localhost API may be named here');
  }
  const stored = store.get(localStorage, API_KEY);
  if (stored && !isLocalApi(stored)) store.set(localStorage, API_KEY, null);
  return ((stored && isLocalApi(stored)) ? stored : PROD).replace(/\/+$/, '');
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
