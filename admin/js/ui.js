// Small DOM and formatting helpers. Everything that came from a player (names,
// log lines, crash text, item names) goes in through textContent — h() never
// parses a string as markup.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);

// ── numbers and times ───────────────────────────────────────────────────────
const NF = new Intl.NumberFormat();
export const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? '—' : NF.format(Number(v)));

export function playtime(sec) {
  sec = Number(sec) || 0;
  if (sec <= 0) return '—';
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60);
  return hh > 0 ? `${NF.format(hh)}h ${mm}m` : `${mm}m`;
}

export function clock(ms) {
  ms = Number(ms) || 0;
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}

export function when(t) {
  if (!t) return '';
  const d = new Date(t);
  return isNaN(d) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
export function day(t) {
  if (!t) return '';
  const d = new Date(t);
  return isNaN(d) ? '' : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function ago(t) {
  if (!t) return 'never';
  const d = new Date(t);
  if (isNaN(d)) return '—';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 0) return 'in ' + until(d);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return day(d);
}
function until(d) {
  const s = Math.floor((d.getTime() - Date.now()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/// "3 min ago", with the full local time on hover.
export const agoEl = (t, cls = '') => h('span', { class: cls, title: t ? when(t) : '' }, ago(t));

// ── chrome ──────────────────────────────────────────────────────────────────
export const badge = (text, kind = '', title) => h('span', { class: `badge ${kind}`, title }, text);

export function btn(label, onclick, kind = '', attrs = {}) {
  return h('button', { type: 'button', class: `b ${kind}`, ...attrs, onclick }, label);
}

/// A button whose click runs an async action: it disables itself while the
/// request is in flight so a double click cannot send twice.
export function act(label, fn, kind = '', attrs = {}) {
  const b = btn(label, async () => {
    if (b.disabled) return;
    b.disabled = true;
    try { await fn(b); } catch (e) { flash(e.message, 'bad'); } finally { if (b.isConnected) b.disabled = false; }
  }, kind, attrs);
  return b;
}

export function card(title, extra, ...body) {
  return h('section', { class: 'card' },
    h('header', { class: 'card-h' }, h('h2', null, title), extra ? h('div', { class: 'card-x' }, extra) : null),
    h('div', { class: 'card-b' }, body));
}

export const note = (...kids) => h('p', { class: 'muted small' }, kids);

export function tiles(list) {
  return h('div', { class: 'tiles' }, list.map(([label, value, sub, kind]) =>
    h('div', { class: `tile ${kind || ''}` },
      h('div', { class: 'tile-l' }, label),
      h('div', { class: 'tile-v' }, value),
      sub ? h('div', { class: 'tile-s' }, sub) : null)));
}

/// A table inside its own horizontal scroller.
export function table(head, rows, cls = '') {
  return h('div', { class: 'tw' },
    h('table', { class: cls },
      h('thead', null, h('tr', null, head.map((c) => typeof c === 'string'
        ? h('th', { class: c.startsWith('>') ? 'r' : '' }, c.replace(/^>/, ''))
        : c))),
      h('tbody', null, rows)));
}

export const td = (content, cls) => h('td', { class: cls }, content);

// ── messages ────────────────────────────────────────────────────────────────
let flashTimer = 0;
export function flash(msg, kind = 'ok') {
  const el = document.getElementById('flash');
  if (!el) return;
  // A modal sits in the top layer, above anything fixed on the page — so the
  // message moves into the open dialog while one is up.
  const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
  if (el.parentNode !== host) host.appendChild(el);
  clear(el);
  el.className = `flash ${kind}`;
  el.append(h('span', null, msg), h('button', { type: 'button', class: 'x', 'aria-label': 'Dismiss', onclick: () => { el.hidden = true; } }, '×'));
  el.hidden = false;
  clearTimeout(flashTimer);
  if (kind === 'ok') flashTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

export function errorBox(e) {
  return h('div', { class: 'alert bad' }, e && e.message ? e.message : String(e));
}

// ── modal ───────────────────────────────────────────────────────────────────
/// Opens a dialog; returns { body, close }. The dialog is removed on close.
export function modal(title, { wide = false, onClose } = {}) {
  const dlg = h('dialog', { class: `modal ${wide ? 'wide' : ''}` });
  const body = h('div', { class: 'modal-b' });
  const close = () => { if (dlg.open) dlg.close(); };
  dlg.append(
    h('header', { class: 'modal-h' }, h('h3', null, title),
      h('button', { type: 'button', class: 'x', 'aria-label': 'Close', onclick: close }, '×')),
    body);
  dlg.addEventListener('close', () => {
    const f = dlg.querySelector('#flash');
    if (f) document.body.appendChild(f);
    dlg.remove();
    if (onClose) onClose();
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.appendChild(dlg);
  dlg.showModal();
  return { dlg, body, close, title: dlg.querySelector('h3') };
}

// ── form bits ───────────────────────────────────────────────────────────────
export function field(label, control, { hint, cls = '' } = {}) {
  return h('label', { class: `fld ${cls}` }, h('span', { class: 'fl' }, label, hint ? h('span', { class: 'hint', title: hint }, ' ⓘ') : null), control);
}
export const input = (attrs) => h('input', { type: 'text', ...attrs });
export const num = (attrs) => h('input', { type: 'number', inputMode: 'numeric', ...attrs });

export function select(options, attrs = {}) {
  const s = h('select', attrs);
  fillSelect(s, options);
  return s;
}
/// options: [[value, label]] or [{ group, items: [[value,label]] }]
export function fillSelect(s, options, keep) {
  const prev = keep !== undefined ? keep : s.value;
  clear(s);
  for (const o of options) {
    if (o && o.group) {
      const g = h('optgroup', { label: o.group });
      for (const [v, l] of o.items) g.append(new Option(l, v));
      s.append(g);
    } else s.append(new Option(o[1], o[0]));
  }
  if ([...s.options].some((o) => o.value === prev)) s.value = prev;
  return s;
}

export const intOf = (el) => { const v = parseInt(el.value, 10); return Number.isFinite(v) ? v : 0; };
