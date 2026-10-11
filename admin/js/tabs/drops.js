// Drops: every drop rate in the game and where it drops (GET /api/admin/drops).
// The server computes it from the game's own tables with the published balance
// laid over them, so nothing here restates a number.

import { get } from '../api.js';
import { h, card, table, td, note, input, select, n, btn } from '../ui.js';

const PAGE = 200;

export async function render(root) {
  const d = await get('/drops');
  const b = d.balanceApplied || {};
  root.append(note(
    `Base per-kill rates, with the published balance applied (rev ${n(d.balanceRev)}: Item drop ×${b.itemDropMul ?? 1}). `
    + 'Magpie Eye, Twin Drops and the find lines on gear raise them per player.'));

  for (const s of d.sections || []) {
    root.append(card(s.title, null,
      s.note ? note(s.note) : null,
      table(s.columns, s.rows.map((r) => h('tr', null, r.map((c, i) => td(c, i ? 'small' : '')))))));
  }

  // ── Every named item, searchable ─────────────────────────────────────────
  const items = d.items || [];
  const slots = [...new Set(items.map((it) => it.slot))];
  const q = input({ type: 'search', placeholder: 'Search a name, set or era…', class: 'w9' });
  const slotSel = select([['', 'Every slot'], ...slots.map((s) => [s, s])]);
  const count = h('span', { class: 'muted small' });
  const body = h('div');
  let shown = PAGE;

  const paint = () => {
    const term = q.value.trim().toLowerCase();
    const want = slotSel.value;
    const hits = items.filter((it) => (!want || it.slot === want)
      && (!term || `${it.name} ${it.set} ${it.era}`.toLowerCase().includes(term)));
    count.textContent = `${n(hits.length)} of ${n(items.length)} items`;
    body.replaceChildren(
      table(['Item', 'Slot', 'Set / class', '>ilvl', 'Drops at', 'Per kill there', 'Forge cap'],
        hits.slice(0, shown).map((it) => h('tr', null,
          td(it.name), td(it.slot, 'small'), td(it.set || '—', 'small muted'),
          td(n(it.ilvl), 'num'), td(it.where, 'small'), td(it.rate, 'small nowrap'), td(it.cap, 'small')))),
      hits.length > shown
        ? btn(`Show ${Math.min(PAGE, hits.length - shown)} more`, () => { shown += PAGE; paint(); })
        : null);
  };
  q.addEventListener('input', () => { shown = PAGE; paint(); });
  slotSel.addEventListener('change', () => { shown = PAGE; paint(); });

  root.append(card('Every item — where it drops', h('div', { class: 'card-x' }, q, slotSel, count),
    note('One row per name on every ladder. "Per kill there" is the chance a strip kill on those stages drops THIS item '
       + '(any rarity): the stage rate × its slot × its line or set. Bosses (5%), mimics (3%), the Tower and the world boss '
       + 'pay the same items at their own rates — see the tables above.'),
    body));
  paint();
}
