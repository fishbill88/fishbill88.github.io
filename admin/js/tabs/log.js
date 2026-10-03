// Every admin write and sign-in, newest first (the latest 200). Read-only.

import { get } from '../api.js';
import { h, card, table, td, agoEl, clear, select, fillSelect } from '../ui.js';

let filterAction = '';
const MAX_DETAIL = 400;

function detailText(d) {
  if (d == null) return '';
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return d; } }
  // A catalogue sync carries the whole catalogue; say how much, not what.
  if (d && Array.isArray(d.items) && d.items.length > 20) d = { ...d, items: `[${d.items.length} rows]` };
  const s = JSON.stringify(d);
  return s.length > MAX_DETAIL ? s.slice(0, MAX_DETAIL) + '…' : s;
}

export async function render(root) {
  const { entries } = await get('/log');
  const actions = [...new Set(entries.map((e) => e.action))].sort();
  const pick = fillSelect(select([]), [['', 'Every action'], ...actions.map((a) => [a, `${a} (${entries.filter((e) => e.action === a).length})`])], filterAction);
  const out = h('div');
  function paint() {
    filterAction = pick.value;
    const rows = entries.filter((e) => !filterAction || e.action === filterAction);
    clear(out).append(rows.length ? table(['When', 'Action', 'From', 'Detail'], rows.map((e) => h('tr', { class: e.action === 'login-failed' ? 'row-warn' : '' },
      td(agoEl(e.at), 'nowrap small'), td(h('code', null, e.action)), td(e.ip || '—', 'small muted mono'),
      td(detailText(e.detail), 'small muted mono wrap-any'))))
      : h('p', { class: 'muted' }, 'Nothing logged.'));
  }
  pick.addEventListener('change', paint);
  root.append(card('Admin activity', h('span', { class: 'muted small' }, `latest ${entries.length}`),
    h('p', { class: 'muted small' }, 'Every change made through this admin, every sign-in and every wrong password, newest first. Passwords are never logged.'),
    h('div', { class: 'row' }, pick), out));
  paint();
}
