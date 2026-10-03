// The Tower's per-floor times, and the world boss's boards, tiers and payouts.

import { get, post } from '../api.js';
import { h, card, table, td, n, badge, act, flash, note, clock, agoEl, when, clear, select, fillSelect } from '../ui.js';
import { tierEditor } from './ranking.js';

export async function render(root, ctx) {
  const [t, w] = await Promise.all([get('/tower'), get('/worldboss')]);
  root.append(towerCard(t, ctx), wbBoards(w, ctx), wbTiers(w, ctx), wbRewards(w, ctx));
}

let towerFloor = '', towerMode = '';

function towerCard(t, ctx) {
  const runs = t.runs || [];
  const floors = [...new Set(runs.map((r) => r.floor))].sort((a, b) => a - b);
  const floorSel = fillSelect(select([]), [['', 'Every floor'], ...floors.map((f) => [String(f), `Floor ${f}`])], towerFloor);
  const modeSel = fillSelect(select([]), [['', 'Solo and party'], ['S', 'Solo'], ['P', 'Party']], towerMode);
  const out = h('div');
  const paint = () => {
    towerFloor = floorSel.value; towerMode = modeSel.value;
    const rows = runs.filter((r) => (!towerFloor || String(r.floor) === towerFloor) && (!towerMode || r.mode === towerMode));
    clear(out).append(rows.length ? table(['>Floor', 'Mode', '>#', '>Time', 'Who', 'Cleared', ''], rows.map((r) => h('tr', { class: r.hidden ? 'dim' : '' },
      td(r.floor, 'num'),
      td([r.mode === 'P' ? `party ×${(r.names || []).length}` : 'solo', r.verified ? badge('✓', 'ok', 'verified') : null,
          r.suspect ? badge('suspect', 'bad') : null, r.hidden ? badge('hidden') : null], 'nowrap'),
      td(r.rank, 'num muted'), td(clock(r.ms), 'num mono'),
      td((r.names || []).join(' · '), 'small'),
      td(agoEl(r.clearedUtc), 'small muted nowrap'),
      h('td', { class: 'acts' }, act('Void', async () => {
        if (!confirm(`Void ${(r.names || []).join(', ')}'s ${clock(r.ms)} on floor ${r.floor}? The run is deleted.`)) return;
        await post('/tower/void', { runId: r.runId }); flash(`Floor ${r.floor} run voided.`); ctx.refresh();
      }, 'danger xs')))))
      : h('p', { class: 'muted small' }, runs.length ? 'Nothing on that floor.' : 'No times yet.'));
  };
  floorSel.addEventListener('change', paint);
  modeSel.addEventListener('change', paint);
  paint();
  return card('Tower floor times', badge(`${runs.length} row(s)`),
    note('The fastest three of every floor, solo and party ranked apart because the boss scales with the size of the party. ',
      h('strong', null, '✓ verified'), ' means every member of that party posted the same time independently — the only real check available, and one a solo climb can never have. ',
      h('strong', null, 'Void'), ' deletes a run: the floor’s record then falls to the next fastest.'),
    h('div', { class: 'row' }, floorSel, modeSel),
    out);
}

function wbBoards(w, ctx) {
  const parts = [];
  for (const kind of ['day', 'week']) {
    parts.push(h('div', { class: 'h-group' }, kind === 'day' ? `Today (${w.ids.day})` : `This week (${w.ids.week})`));
    parts.push(h('div', { class: 'grid narrow' }, w.brackets.map((b) => {
      const box = ((w.boards || {})[kind] || {})[b] || { time: [], damage: [] };
      return h('div', { class: 'sub' },
        h('strong', { class: 'small', style: { textTransform: 'capitalize' } }, b),
        h('div', { class: 'muted small' }, 'Fastest kill'),
        box.time.length ? h('table', { class: 'tight' }, h('tbody', null, box.time.map((r) => h('tr', { class: r.hidden ? 'dim' : '' },
          td(r.rank, 'num muted'), td([(r.names || []).join(' · '), r.verified ? badge('✓', 'ok', 'verified') : null], 'small'),
          td(clock(r.ms), 'num mono small'),
          h('td', { class: 'acts' }, act('✕', async () => {
            if (!confirm(`Void ${(r.names || []).join(', ')}'s ${clock(r.ms)} kill (${b})? The run is deleted.`)) return;
            await post('/worldboss/void', { runId: r.runId }); flash('World boss run voided.'); ctx.refresh();
          }, 'danger xs', { title: 'Void this run' }))))))
          : h('p', { class: 'muted small' }, 'Nobody yet.'),
        h('div', { class: 'muted small', style: { marginTop: '0.4rem' } }, 'Most damage dealt'),
        box.damage.length ? h('table', { class: 'tight' }, h('tbody', null, box.damage.map((r) => h('tr', null,
          td(r.rank, 'num muted'), td(r.name, 'small'), td(n(r.value), 'num mono small')))))
          : h('p', { class: 'muted small' }, 'Nobody yet.'));
    })));
  }
  return card('World boss — fastest kill & most damage', badge(`${w.ids.day} · ${w.ids.week}`),
    note('Two boards, four brackets each, daily and weekly — never monthly: the colossus’s element changes every day. Time is an event (one row per kill, fastest wins, ✕ voids a run nobody believes); damage is a lifetime counter per bracket, watermark-credited from the save, and only moves on a kill.'),
    ...parts);
}

function wbTiers(w, ctx) {
  const parts = [];
  for (const kind of ['week', 'day']) {
    parts.push(h('div', { class: 'h-group' }, kind === 'day' ? 'Daily' : 'Weekly'));
    for (const board of ['damage', 'time']) {
      parts.push(h('div', { class: 'small strong', style: { margin: '0.3rem 0' } }, board === 'time' ? 'Fastest kill' : 'Most damage'));
      parts.push(h('div', { class: 'grid narrow' }, w.brackets.map((b) => {
        const tiers = ((((w.boards || {})[kind] || {})[b] || {}).tiers || {})[board] || [];
        return tierEditor(b[0].toUpperCase() + b.slice(1), tiers, async (rows) => {
          await post('/worldboss/tiers', { kind, board, bracket: b, tiers: rows });
          flash(`${kind === 'day' ? 'Daily' : 'Weekly'} ${board} tiers for ${b} saved${rows.length ? '' : ' (empty — that board pays nothing)'}.`);
          ctx.refresh();
        }, 'Save', { allowEmpty: true });
      })));
    }
  }
  return card('World boss reward tiers', null,
    note('What each (period, board, bracket) pays when its period closes. Daily tiers are deliberately a fraction of weekly ones — winning every day of a week should still come to less than the weekly prize. A time reward pays EVERY member of the winning run’s roster the same tier. Saving with no rows means that board pays nothing.'),
    ...parts);
}

function wbRewards(w, ctx) {
  const due = w.due || [];
  const recent = w.recent || [];
  return card('World boss rewards', null,
    note('Closing a period freezes its boards and posts the letters. The server does this on a timer; pressing it twice is safe.'),
    h('div', { class: 'row' },
      act('Close every period that has ended', async () => {
        if (!confirm('Close every world boss period that has ended and send its rewards?')) return;
        await post('/worldboss/finalize'); flash('World boss finalizer ran.'); ctx.refresh();
      }, 'primary'),
      due.length ? h('span', { class: 'warnt small' }, `${due.length} period(s) waiting: ${due.map((d) => `${d.id} (ended ${when(d.endsUtc)})`).join(', ')}`)
        : h('span', { class: 'muted small' }, 'Nothing is waiting.')),
    h('h3', null, 'Recent payouts'),
    recent.length ? table(['Period', 'Bracket', 'Board', 'Player', '>#', 'Tier', '>Gold', '>SP'], recent.map((r) => h('tr', null,
      td(r.period_id, 'mono small'), td(r.bracket, 'small'), td(r.board === 'time' ? 'fastest kill' : r.board === 'damage' ? 'most damage' : r.board, 'small'),
      td(r.username), td(r.rank, 'num muted'), td(r.tier || '—', 'small'), td(n(r.gold), 'num'), td(n(r.skill_points), 'num'))))
      : h('p', { class: 'muted small' }, 'Nothing paid yet.'));
}
