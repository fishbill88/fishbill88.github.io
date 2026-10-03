// Crash reports the game posted (the newest 200). Read-only.

import { get } from '../api.js';
import { h, card, table, td, agoEl, when, clear, select, fillSelect } from '../ui.js';

let filterText = '', filterLabel = '';

export async function render(root) {
  const { crashes } = await get('/crashes');
  const search = h('input', { type: 'search', placeholder: 'Filter by player, machine or message', value: filterText, class: 'grow' });
  const labels = [...new Set(crashes.map((c) => c.label).filter(Boolean))].sort();
  const label = fillSelect(select([]), [['', 'Any label'], ...labels.map((l) => [l, `${l} (${crashes.filter((c) => c.label === l).length})`])], filterLabel);
  const out = h('div');
  const count = h('span', { class: 'muted small' });

  function paint() {
    filterText = search.value; filterLabel = label.value;
    const needle = filterText.trim().toLowerCase();
    const rows = crashes.filter((c) => (!filterLabel || c.label === filterLabel)
      && (!needle || [c.username, c.machine, c.message, c.line].some((v) => v && String(v).toLowerCase().includes(needle))));
    count.textContent = `${rows.length} of ${crashes.length}`;
    clear(out).append(rows.length ? table(['When', 'Player', 'Machine', 'Label', 'Message'], rows.map((c) => h('tr', null,
      td([agoEl(c.at), c.clientAt ? h('div', { class: 'muted small', title: 'The player’s own clock' }, `client ${when(c.clientAt)}`) : null], 'nowrap small'),
      td(c.username || h('span', { class: 'muted' }, 'signed out'), 'small'),
      td(c.machine || '—', 'small muted'),
      td(c.label || '—', 'small'),
      td([h('div', { class: 'wrap-any' }, c.message || ''),
          c.line ? h('details', null, h('summary', { class: 'small' }, 'stack'), h('pre', { class: 'stack' }, String(c.line).split(' | ').join('\n'))) : null]))))
      : h('p', { class: 'muted' }, crashes.length ? 'Nothing matches.' : 'No crash reports. Good.'));
  }
  search.addEventListener('input', paint);
  label.addEventListener('change', paint);
  root.append(card('Crash reports', count,
    h('p', { class: 'muted small' }, 'Errors the game caught and posted, newest first (the latest 200). Times are when the server received them; the client time underneath is the player’s own clock.'),
    h('div', { class: 'row' }, search, label), out));
  paint();
}
