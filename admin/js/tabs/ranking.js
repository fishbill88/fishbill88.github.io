// The general period boards (weekly / monthly), what they pay, the held
// rewards and the ranking flags.

import { get, post } from '../api.js';
import { h, card, table, td, n, badge, act, btn, flash, note, num, input, agoEl, playtime, clear, intOf, when } from '../ui.js';

const BOARDS = [
  ['S', 'Stage'], ['K', 'Kills'], ['T', 'Played'], ['P', 'Duel wins'], ['R', 'Duel rating'],
];
const BOARD_NAME = { S: 'stage', K: 'kills', T: 'time played', P: 'duel wins', R: 'duel rating' };
export function rankValue(metric, v) {
  switch (metric) {
    case 'T': return playtime(v) === '—' ? '0m' : playtime(v);
    case 'S': return `Stage ${v}`;
    case 'P': return `${n(v)} ${v === 1 ? 'win' : 'wins'}`;
    case 'R': return `Rating ${v}`;
    default: return `${n(v)} kills`;
  }
}

export async function render(root, ctx) {
  const d = await get('/rank');
  const rw = d.rewards || {};
  root.append(
    boardsCard(d, ctx),
    card('Reward tiers', null,
      note('What each bracket pays when a period closes: the first tier whose “through rank” covers the player’s rank. Add or remove a tier by adding or removing a row before saving. Editing here changes nothing about a period that has already closed.'),
      h('div', { class: 'grid' },
        tierEditor('Stage, kills & duels', rw.podium || [], async (tiers) => { await post('/rank/tiers', { podium: tiers }); flash('Stage & kills tiers saved.'); ctx.refresh(); }, 'Save stage & kills tiers'),
        tierEditor('Played (time)', rw.flat || [], async (tiers) => { await post('/rank/tiers', { flat: tiers }); flash('Playtime tiers saved.'); ctx.refresh(); }, 'Save playtime tiers')),
      settingsForm(rw.settings || {}, ctx)),
    periodCard(d, ctx),
    flagsCard(d, ctx));
}

function boardsCard(d, ctx) {
  const boxes = [];
  for (const [kind, period] of [['week', d.week], ['month', d.month]]) {
    for (const [m, label] of BOARDS) {
      const rows = (d.boards || {})[kind + m] || [];
      boxes.push(h('div', { class: 'sub' },
        h('div', { class: 'sub-h' }, h('strong', { class: 'small' }, `${label} · ${kind}`), h('span', { class: 'muted small' }, `${rows.length} ranked`)),
        rows.length ? h('table', { class: 'tight' }, h('tbody', null, rows.map((e) => h('tr', { class: e.hidden ? 'dim' : '' },
          td(e.rank, 'num muted'),
          td([e.name, e.hidden ? badge('hidden', 'warn') : null], 'small'),
          td(rankValue(m, e.value), 'num small mono'),
          h('td', { class: 'acts' }, act(e.hidden ? 'Show' : 'Hide', async () => {
            await post('/rank/hide', { accountId: e.accountId, periodId: period, hide: !e.hidden });
            flash(`${e.name}: scores ${e.hidden ? 'shown' : 'hidden'} for ${period}.`); ctx.refresh();
          }, 'xs')))))) : h('p', { class: 'muted small' }, 'Nobody yet.')));
    }
  }
  return card('Weekly & monthly boards', badge(`${d.week} · ${d.month}`),
    note('Stage, kills, time played, and the Arena’s duel wins and peak rating — this week and this month. Scores are credited from each accepted save by differencing the lifetime totals it carries against a per-account watermark, so a re-sent save is worth nothing and a lost one costs nothing. This view shows ',
      h('strong', null, 'hidden scores and opted-out players too'), '. Hide applies to that player’s scores for the whole period; a player hidden from the boards on the Players tab stays hidden here.'),
    h('div', { class: 'grid' }, boxes));
}

/// An editable list of { maxRank, label, gold, skillPoints }. onSave(tiers).
export function tierEditor(title, tiers, onSave, saveLabel = 'Save', { allowEmpty = false } = {}) {
  const tbody = h('tbody');
  const addRow = (t = {}) => {
    const tr = h('tr', null,
      td(num({ min: 1, value: t.maxRank ?? '', class: 'w5', 'aria-label': 'Through rank' })),
      td(input({ maxLength: 32, value: t.label ?? '', 'aria-label': 'Label' })),
      td(num({ min: 0, value: t.gold ?? 0, 'aria-label': 'Gold' })),
      td(num({ min: 0, value: t.skillPoints ?? 0, class: 'w5', 'aria-label': 'Skill points' })),
      h('td', { class: 'acts' }, btn('✕', () => tr.remove(), 'danger xs', { title: 'Remove this tier' })));
    tbody.append(tr);
  };
  for (const t of tiers) addRow(t);
  const save = act(saveLabel, async () => {
    const rows = [...tbody.querySelectorAll('tr')].map((tr) => {
      const [r, l, g, s] = tr.querySelectorAll('input');
      return { maxRank: intOf(r), label: l.value.trim(), gold: intOf(g), skillPoints: intOf(s) };
    });
    if (!rows.length && !allowEmpty) { flash('At least one tier.', 'bad'); return; }
    const bad = rows.find((r) => !(r.maxRank > 0) || !r.label || r.gold < 0 || r.skillPoints < 0);
    if (bad) { flash('Every tier needs a rank above 0, a label, and no negative prizes.', 'bad'); return; }
    await onSave(rows);
  }, 'primary xs');
  return h('div', { class: 'sub' },
    h('div', { class: 'sub-h' }, h('strong', { class: 'small' }, title), btn('+ tier', () => addRow({ gold: 0, skillPoints: 0 }), 'xs')),
    h('div', { class: 'tw' }, h('table', { class: 'tight' },
      h('thead', null, h('tr', null, h('th', null, 'Through rank'), h('th', null, 'Label'), h('th', null, 'Gold'), h('th', null, 'Skill pts'), h('th'))),
      tbody)),
    h('div', { style: { marginTop: '0.4rem' } }, save));
}

function settingsForm(s, ctx) {
  const pay = h('input', { type: 'checkbox', checked: !!s.payParticipation });
  const pg = num({ min: 0, value: s.participationGold ?? 0, class: 'w9' });
  const mg = num({ min: 1, value: s.monthlyGoldMultiplier ?? 1, class: 'w5' });
  const ms = num({ min: 0, value: s.monthlySkillPointBonus ?? 0, class: 'w5' });
  return h('div', { class: 'row', style: { borderTop: '1px solid var(--line)', paddingTop: '0.7rem' } },
    h('label', { class: 'check' }, pay, 'Pay everyone who scored at all'),
    h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Participation gold'), pg),
    h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Monthly gold ×'), mg),
    h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Monthly bonus skill pts'), ms),
    act('Save', async () => {
      await post('/rank/tiers', { settings: { payParticipation: pay.checked, participationGold: intOf(pg), monthlyGoldMultiplier: Math.max(1, intOf(mg)), monthlySkillPointBonus: intOf(ms) } });
      flash('Period reward settings saved.'); ctx.refresh();
    }, 'primary xs'),
    h('span', { class: 'muted small' }, 'Monthly bonus skill points: stage & kills only, never playtime.'));
}

function periodCard(d, ctx) {
  const held = d.held || [];
  const due = d.due || [];
  return card('Period rewards', badge(`${held.length} held`),
    note('When a period ends its standing is frozen, then the letters go out. The server does this on a timer; the button is here for when you do not want to wait. ', h('strong', null, 'Pressing it twice is safe.'), ' A held reward is one the server would not pay without a person looking — Release pays it.'),
    h('div', { class: 'row' },
      act('Close everything that has ended', async () => {
        if (!confirm('Close every period that has ended and send its rewards?')) return;
        await post('/rank/finalize'); flash('Finalizer ran.'); ctx.refresh();
      }, 'primary'),
      due.length ? h('span', { class: 'warnt small' }, `${due.length} period(s) waiting: ${due.map((x) => `${x.id} (${x.state}, ended ${when(x.endsUtc)})`).join(', ')}`)
        : h('span', { class: 'muted small' }, 'Nothing is waiting.')),
    held.length ? table(['Period', 'Board', 'Player', '>#', 'Bracket', '>Gold', '>SP', ''], held.map((x) => h('tr', null,
      td(x.periodId, 'mono small'), td(BOARD_NAME[x.metric] || x.metric, 'small'), td(x.username), td(x.rank, 'num muted'),
      td(x.bracket || '—', 'small'), td(n(x.gold), 'num'), td(n(x.skillPoints), 'num'),
      h('td', { class: 'acts' }, act('Release', async () => {
        if (!confirm(`Pay ${x.username} their ${x.periodId} ${BOARD_NAME[x.metric] || x.metric} reward (#${x.rank})?`)) return;
        await post('/rank/release', { periodId: x.periodId, metric: x.metric, accountId: x.accountId });
        flash(`Released to ${x.username}.`); ctx.refresh();
      }, 'ok xs')))))
      : h('p', { class: 'muted small' }, 'Nothing held.'));
}

function flagsCard(d, ctx) {
  const flags = d.flags || [];
  return card('Ranking flags', badge(`${flags.length} open`),
    note('A flag never hid a score and never failed a save — the excess was clamped away and the player carried on. All have innocent causes, which is why they are shown to a person rather than acted on.'),
    flags.length ? table(['When', 'Player', 'Period', 'Reason', 'Detail', ''], flags.map((f) => h('tr', null,
      td(agoEl(f.at), 'nowrap small muted'), td(f.username, 'small'), td(f.periodId || '—', 'mono small'),
      td(badge(f.reason, 'warn')), td(typeof f.detail === 'object' && f.detail ? JSON.stringify(f.detail) : (f.detail || ''), 'small muted wrap-any'),
      h('td', { class: 'acts' },
        act('Hide scores', async () => {
          const pid = f.periodId || d.week;
          if (!confirm(`Hide ${f.username}'s scores for ${pid}?`)) return;
          await post('/rank/hide', { accountId: f.accountId, periodId: pid, hide: true });
          flash(`${f.username}: scores hidden for ${pid}.`); ctx.refresh();
        }, 'danger xs'),
        act('Clear', async () => { await post('/rank/flag/clear', { id: f.id }); flash('Flag cleared.'); ctx.refresh(); }, 'xs')))))
      : h('p', { class: 'muted small' }, 'Nothing flagged.'));
}

