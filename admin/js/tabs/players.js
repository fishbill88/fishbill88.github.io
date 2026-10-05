import { get, post } from '../api.js';
import {
  h, clear, card, tiles, table, td, n, playtime, badge, agoEl, when, day, act, btn, flash, modal, note,
  field, input, select, errorBox, ago,
} from '../ui.js';
import { rules, rarityColor } from '../catalog.js';

let filterText = '';
let sortBy = 'created';

const SORTS = {
  created: [(a, b) => (b.createdUtc || '').localeCompare(a.createdUtc || ''), 'Newest account'],
  saved: [(a, b) => ((b.save && b.save.savedUtc) || '').localeCompare((a.save && a.save.savedUtc) || ''), 'Last save'],
  level: [(a, b) => ((b.save && b.save.level) || 0) - ((a.save && a.save.level) || 0), 'Hero level'],
  stage: [(a, b) => ((b.save && b.save.maxStage) || 0) - ((a.save && a.save.maxStage) || 0), 'Highest stage'],
  name: [(a, b) => a.username.localeCompare(b.username), 'Username'],
};

export async function render(root, ctx) {
  const [o, { players }] = await Promise.all([get('/overview'), get('/players')]);

  const search = h('input', { type: 'search', placeholder: 'Filter by username, name, email or machine', value: filterText, class: 'grow' });
  const sort = select(Object.entries(SORTS).map(([k, v]) => [k, 'Sort: ' + v[1]]));
  sort.value = sortBy;
  const count = h('span', { class: 'muted small' });
  const body = h('div');

  function paint() {
    filterText = search.value; sortBy = sort.value;
    const needle = filterText.trim().toLowerCase();
    const rows = players.filter((p) => !needle || [p.username, p.displayName, p.email, p.save && p.save.machine]
      .some((v) => v && String(v).toLowerCase().includes(needle)));
    rows.sort(SORTS[sortBy][0]);
    count.textContent = `${rows.length} of ${players.length} row${players.length === 1 ? '' : 's'}`;
    clear(body).append(rows.length
      ? table(['Player', '>Lv', '>Stage', 'Class', '>Played', '>Gold', 'Last save', '>Mail', ''], rows.map((p) => playerRow(p, ctx)))
      : h('p', { class: 'muted' }, players.length ? 'Nobody matches.' : 'No accounts yet. The first player to register will appear here.'));
  }
  search.addEventListener('input', paint);
  sort.addEventListener('change', paint);

  root.append(
    tiles([
      ['Players', n(o.players)],
      ['With a save', n(o.withSave), 'have played at least once'],
      ['New this week', n(o.newThisWeek), 'rolling 7 days'],
      ['Active', n(o.active24h), 'saved in the last 24h'],
      ['Highest level', n(o.highestLevel)],
      ['Total played', playtime(o.totalPlayedSec), 'across all saves'],
    ]),
    card('Players', count,
      (o.locked || o.disabled) ? note(
        o.locked ? badge(`${o.locked} locked out`, 'warn') : null, ' ',
        o.disabled ? badge(`${o.disabled} disabled`) : null,
        ' A lockout clears itself after 15 minutes; Unlock is for when someone does not want to wait.') : null,
      h('div', { class: 'row' }, search, sort),
      body));
  paint();
}

function playerRow(p, ctx) {
  const s = p.save;
  const id = p.id;
  const tip = `Joined ${day(p.createdUtc)} · last login ${ago(p.lastLoginUtc)}${p.imported ? ' · imported from Claude Meter' : ''}`;
  return h('tr', { class: p.disabled ? 'dim' : '' },
    td([
      h('div', null,
        h('span', { class: 'strong', title: tip }, p.username),
        p.displayName ? h('span', { class: 'muted' }, ` “${p.displayName}”`) : null,
        p.excluded ? badge('off board', 'warn', 'Kept off the leaderboards') : null,
        p.disabled ? badge('disabled') : null,
        p.lockedUntilUtc ? badge('locked', 'warn', `until ${when(p.lockedUntilUtc)}`) : null,
        p.tuner ? badge('tuner', 'info', 'Sees the developer tuner') : null,
        p.sessions ? badge(`${p.sessions} signed in`, '', 'Live sign-ins on this account') : null),
      h('div', { class: 'muted small' }, p.email || '—'),
    ]),
    td(s ? n(s.level) : '—', 'num'),
    td(s ? h('span', { title: `now ${s.stage}, highest ${s.maxStage}` }, n(s.maxStage)) : '—', 'num'),
    td(s && s.cls ? s.cls : '—'),
    td(s ? h('span', { title: 'This run’s clock, not lifetime playtime — it resets when the run does, and a drop here is not lost progress' }, playtime(s.playedSec)) : '—', 'num'),
    td(s ? n(s.gold) : '—', 'num'),
    td(s ? [agoEl(s.savedUtc), h('span', { class: 'muted small', title: 'Save revision — increments on every accepted write' }, ` r${s.rev}`),
            h('span', { class: 'muted small', title: `${n(s.bytes)} bytes · ${s.machine || 'unknown machine'} · build ${s.simHash || 'dev'}` }, ` ${(s.bytes / 1024).toFixed(1)}KB`)]
          : h('span', { class: 'muted' }, 'no save'), 'nowrap'),
    td(p.openMail ? n(p.openMail) : h('span', { class: 'muted' }, '0'), 'num'),
    h('td', { class: 'acts' },
      p.lockedUntilUtc ? act('Unlock', async () => { await post('/player/unlock', { id }); flash(`${p.username} unlocked.`); ctx.refresh(); }, 'warn xs') : null,
      act(p.tuner ? 'Hide tuner' : 'Show tuner', async () => {
        await post('/player/tuner', { id, on: !p.tuner }); flash(`${p.username}: tuner ${p.tuner ? 'hidden' : 'shown'}.`); ctx.refresh();
      }, p.tuner ? 'on xs' : 'xs'),
      act(p.excluded ? 'Show on board' : 'Hide from board', async () => {
        await post('/player/board', { id, exclude: !p.excluded }); flash(`${p.username} is ${p.excluded ? 'back on' : 'off'} the boards.`); ctx.refresh();
      }, p.excluded ? 'warn xs' : 'xs'),
      act(p.disabled ? 'Enable' : 'Disable', async () => {
        if (!p.disabled && !confirm(`Disable ${p.username}? They are signed out everywhere and cannot sign in until enabled again.`)) return;
        await post('/player/disable', { id, disabled: !p.disabled }); flash(`${p.username} ${p.disabled ? 'enabled' : 'disabled'}.`); ctx.refresh();
      }, 'xs'),
      btn('Logs', () => openLogs(p), 'xs', { disabled: !s, title: s ? 'The last 200 events in this player’s game' : 'No save yet, so no log' }),
      btn('Saves', () => openHistory(p, ctx), 'xs', { title: 'Save history and restore' }),
      btn('Account', () => openAccount(p, ctx), 'xs', { title: 'Rename, reset password, sign out, delete' })));
}

// ── logs ────────────────────────────────────────────────────────────────────
const KINDS = [
  { k: 'drop', label: 'Loot', icon: '🎒' }, { k: 'death', label: 'Death', icon: '💀' },
  { k: 'cube', label: 'Cube', icon: '🎲' }, { k: 'forge', label: 'Forge', icon: '🔨' },
];

async function openLogs(p) {
  const m = modal(`Log — ${p.username}`, { wide: true });
  const status = h('div', { class: 'muted small' }, 'Loading…');
  const filters = h('div', { class: 'seg' });
  const list = h('div');
  m.body.append(filters, status, list);
  let entries = [], filter = 'all';
  function paint() {
    clear(filters);
    for (const t of [{ k: 'all', label: 'All', icon: '📜' }, ...KINDS]) {
      const c = t.k === 'all' ? entries.length : entries.filter((e) => e.k === t.k).length;
      filters.append(btn(`${t.icon} ${t.label} (${c})`, () => { filter = t.k; paint(); }, filter === t.k ? 'on xs' : 'xs'));
    }
    clear(list);
    const rows = filter === 'all' ? entries : entries.filter((e) => e.k === filter);
    if (!rows.length) {
      list.append(h('div', { class: 'muted' }, entries.length ? `Nothing of this kind in the last ${entries.length} events.` : 'This player’s log is empty.'));
      return;
    }
    for (const e of rows) {
      const kind = KINDS.find((x) => x.k === e.k);
      list.append(h('div', { class: `log-line log-k-${kind ? e.k : 'other'}` },
        h('span', { title: kind ? kind.label : e.k }, kind ? kind.icon : '•'),
        h('span', { class: 'log-msg' }, e.m),
        h('span', { class: 'log-when', title: [when(e.t), e.s ? `stage ${e.s}` : ''].filter(Boolean).join(' · ') }, ago(e.t))));
    }
  }
  try {
    const d = await get('/player/logs', { id: p.id });
    entries = Array.isArray(d.entries) ? d.entries : [];
    if (!d.hasSave) status.textContent = 'This player has never synced a save.';
    else if (!d.supported) { status.className = 'warnt small'; status.textContent = 'This save was written by a game build from before the log existed. It will fill in once they update and play.'; }
    else status.textContent = `${entries.length} event${entries.length === 1 ? '' : 's'} · save r${d.rev} · newest first, oldest drop off at 200.`;
    paint();
  } catch (e) { status.replaceWith(errorBox(e)); }
}

// ── save history ────────────────────────────────────────────────────────────
// What a summary key says, as the table prints it. The push summary carries the
// boards' columns; `lite` is read off the payload by the server (lifetime
// playtime above all — the summary's elapsedSec is only the RUN clock).
const sumOf = (r) => r.summary || {};
const liteOf = (r) => r.lite || {};
const HIST_COLS = [
  // [head, value(row), only-rises?]  An only-rises value that FALLS between two
  // saves is a rollback or an edit, and is painted red.
  ['>Lv', (r) => sumOf(r).heroLevel ?? liteOf(r).level, true],
  ['>Stage', (r) => sumOf(r).stage, false],
  ['>Max', (r) => sumOf(r).maxStage ?? liteOf(r).peakStage, true],
  ['>Gold', (r) => sumOf(r).gold, false],
  ['>Kills', (r) => liteOf(r).lifetimeKills ?? sumOf(r).kills, true],
  ['>Total EXP', (r) => sumOf(r).totalExp, true],
  ['>Played', (r) => liteOf(r).playedSec, true],
  ['>Deaths', (r) => liteOf(r).deaths, true],
  ['>Floor S/P', null, false],
  ['>PvP', (r) => sumOf(r).pvpRating, false],
];
const short = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  return String(Math.round(v));
};
function deltaEl(cur, prev, rises, fmt) {
  if (cur == null || prev == null || !Number.isFinite(+cur) || !Number.isFinite(+prev)) return null;
  const d = +cur - +prev;
  if (!d) return null;
  const bad = rises && d < 0;
  const txt = (d > 0 ? '+' : '−') + (fmt ? fmt(Math.abs(d)) : short(Math.abs(d)));
  return h('div', { class: `dl ${bad ? 'badt' : 'muted'}`, title: bad ? 'went DOWN — this only ever rises' : '' }, txt);
}

async function openHistory(p, ctx) {
  const m = modal(`Saves — ${p.username}`, { wide: true });
  m.dlg.classList.add('xwide');
  const box = h('div', null, h('div', { class: 'muted' }, 'Loading…'));
  m.body.append(
    note('Kept: the newest 30 saves, then one per hour for 7 days, then one per day for 90 days. The small number under a value is the change since the save below it; red means a value that only ever rises went down. ',
      'View opens the hero that copy would load as, side by side with another copy. Restore writes that copy back as a NEW revision; the player’s game then sees a conflict on its next push and asks which save to keep — tell them to take the CLOUD one.'),
    box);
  async function load() {
    try {
      const d = await get('/player/history', { id: p.id });
      const rows = d.history || [];
      clear(box).append(rows.length ? table(['Saved', '>Rev', 'Machine', 'Class', ...HIST_COLS.map((c) => c[0]), '>Size', ''], rows.map((r, i) => {
        const prev = rows[i + 1];
        const sm = sumOf(r), lt = liteOf(r);
        // Playtime that ran faster than the wall clock between two saves: the
        // old dashboard save guard's test (1.5x wall, plus a minute of slack).
        let fast = null;
        if (prev && lt.playedSec != null && liteOf(prev).playedSec != null) {
          const wall = (new Date(r.savedUtc) - new Date(prev.savedUtc)) / 1000;
          const ran = lt.playedSec - liteOf(prev).playedSec;
          if (wall >= 0 && ran > wall * 1.5 + 60) {
            fast = badge('fast clock', 'bad', `played +${playtime(ran)} in ${wall < 60 ? 'under a minute' : playtime(wall)} of real time`);
          }
        }
        const cells = HIST_COLS.map(([head, val, rises]) => {
          if (!val) return td(`${n(sm.maxFloorSolo)} / ${n(sm.maxFloorParty)}`, 'num');
          const v = val(r);
          const isTime = head === '>Played';
          return td([h('div', null, isTime ? playtime(v) : n(v)),
            prev ? deltaEl(v, val(prev), rises, isTime ? playtime : null) : null], 'num');
        });
        return h('tr', null,
          td(agoEl(r.savedUtc), 'nowrap'),
          td(n(r.rev), 'num'),
          td([r.machine || '—', r.forced ? badge('forced', 'warn', 'Written by an admin restore or a forced push') : null, fast], 'small'),
          td(sm.mainClass || '—'),
          ...cells,
          td(`${((r.bytes || 0) / 1024).toFixed(1)}KB`, 'num muted'),
          h('td', { class: 'acts' },
            btn('View', () => openSaveView(p, rows, r.id, prev ? prev.id : null), 'xs'),
            act('Restore', async () => {
              if (!confirm(`Restore ${p.username}'s save to r${r.rev} from ${when(r.savedUtc)}?\n\nTheir current cloud save is replaced by this copy (it stays in the history).`)) return;
              const res = await post('/player/restore', { id: p.id, historyId: r.id });
              flash(`Restored as r${res.rev}. ${res.note || ''}`);
              ctx.refresh(); load();
            }, 'warn xs')));
      })) : h('p', { class: 'muted' }, 'No history kept for this player yet.'));
    } catch (e) { clear(box).append(errorBox(e)); }
  }
  load();
}

// ── one saved copy, decoded ─────────────────────────────────────────────────
// The server builds the hero the game would load from that copy and sends the
// stat sheet, gear, skills and records (api/admin/saveview.js). A second copy
// can be picked to compare against; rows that differ are marked.
const CUR = 'current';
const viewCache = new Map();
function fetchView(p, hid) {
  const key = `${p.id}:${hid}`;
  if (!viewCache.has(key)) {
    const pr = get('/player/save-view', hid === CUR ? { id: p.id } : { id: p.id, historyId: hid });
    pr.catch(() => viewCache.delete(key));
    viewCache.set(key, pr);
  }
  return viewCache.get(key);
}

function openSaveView(p, rows, hid, otherId) {
  const m = modal(`Save — ${p.username}`, { wide: true });
  m.dlg.classList.add('xwide');
  const label = (r) => `r${r.rev} · ${when(r.savedUtc)}${r.machine ? ' · ' + r.machine : ''}`;
  const opts = [[CUR, 'the live cloud save'], ...rows.map((r) => [String(r.id), label(r)])];
  const pickA = select(opts); pickA.value = String(hid);
  const pickB = select([['', '— nothing —'], ...opts]); pickB.value = otherId != null ? String(otherId) : '';
  const box = h('div', null, h('div', { class: 'muted' }, 'Loading…'));
  m.body.append(h('div', { class: 'row' }, field('Showing', pickA, { cls: 'grow' }), field('Compared with', pickB, { cls: 'grow' })), box);

  let seq = 0;
  async function load() {
    const my = ++seq;
    clear(box).append(h('div', { class: 'muted' }, 'Loading…'));
    try {
      const [A, B, R] = await Promise.all([
        fetchView(p, pickA.value),
        pickB.value ? fetchView(p, pickB.value) : null,
        rules().catch(() => null),
      ]);
      if (my !== seq) return;
      clear(box).append(renderView(A, B, R && R.meta));
    } catch (e) { if (my === seq) clear(box).append(errorBox(e)); }
  }
  pickA.addEventListener('change', load);
  pickB.addEventListener('change', load);
  load();
}

// A row's value: a number, a string, or { text, n?, fmt?, sub?, color?, key? }.
// `n` makes the difference a signed number rather than just a marked row; `key`
// is what two copies are compared on when the text alone would hide a change.
function cell(v) {
  if (v == null) return { text: '—' };
  if (typeof v === 'number') return { text: n(v), n: v };
  if (typeof v === 'string') return { text: v };
  return v;
}

function viewRows(v, meta) {
  if (!v || !v.ok) return null;
  const H = v.hero, P = v.progress, L = v.lifetime, W = v.wallet, B = v.bags;
  const rc = (id) => (meta ? rarityColor(meta, id) : null);
  const secs = (s) => ({ text: playtime(s), n: s, fmt: playtime });
  const sec = [];
  sec.push(['Hero', [
    ['Level', H.level], ['EXP', H.exp], ['Class', H.className],
    ['Weapon / sub', `${H.main || '—'} / ${H.sub || '—'}`], ['Title', H.title || '—'],
    ['Power', { text: n(H.power), n: H.power, hint: 'The game’s own upgrade score (compare.js powerOf): offence × survival' }],
    ['Unspent skill pts', H.skillPts], ['Tree points', H.treePts], ['Summit points', H.summitPts],
  ]]);
  for (const b of v.stats) sec.push([b.title, b.rows.map((r) => [r.label, r.value])]);
  sec.push(['Gear worn', v.gear.map((g) => [g.slot, g.empty ? '—' : {
    text: `${g.name}${g.plus ? ` +${g.plus}` : ''}`, color: rc(g.rarity),
    sub: [`${g.rarityName}${g.ilvl ? ` · ilvl ${g.ilvl}` : ''}${g.set ? ` · set ${g.set}` : ''}${g.locked ? ' · locked' : ''}`, ...g.lines].join(' · '),
    key: JSON.stringify([g.name, g.plus, g.rarity, g.ilvl, g.lines]),
  }])]);
  sec.push([`Skills — ${H.className}`, v.skills.map((s) => [`${['', 'I', 'II', 'III', 'IV'][s.tier] || ''} ${s.name}`,
    s.unlocked ? { text: `${s.lv}/${s.max}${s.equipped ? ' · on bar' : ''}`, n: s.lv } : `locked until Lv ${s.unlock}`])]);
  sec.push(['Pets', [
    ...v.pets.slots.map((x, i) => [`Slot ${i + 1}`, x ? `${x.name} · rung ${x.rung}` : '—']),
    ['Owned', v.pets.owned],
  ]]);
  sec.push(['Wallet & bags', [
    ['Gold', W.gold], ['Stones', W.stones.length ? W.stones.map(n).join(' / ') : '—'], ['Anvil Wards', W.wards], ['Tickets', W.tickets],
    ['Backpack', B.backpack], ['Stash', B.stash], ['Post box', B.postbox], ['Altar offer waiting', B.altarOffer ? 'yes' : 'no'],
  ]]);
  sec.push(['Progress', [
    ['Stage (now)', P.stage], ['Max stage', P.maxStage], ['Peak stage', P.peakStage],
    ['Stage 400 cleared', P.cleared400 ? 'yes' : 'no'], ['Gate of 301', P.gate301 ? 'cleared' : 'no'],
    ['Tower floor', P.maxFloor], ['Tower solo / party', `${n(P.towerSolo)} / ${n(P.towerParty)}`],
    ['World boss dmg solo', P.wbDmg.solo], ['World boss dmg duo', P.wbDmg.duo],
    ['World boss dmg trio', P.wbDmg.trio], ['World boss dmg squad', P.wbDmg.squad],
    ['PvP rating', P.pvp.rating], ['PvP W / L / D', `${n(P.pvp.wins)} / ${n(P.pvp.losses)} / ${n(P.pvp.draws)}`],
    ['Achievements', P.achievements],
  ]]);
  sec.push(['Lifetime', [
    ['Played', secs(L.playedSec)], ['Idle', secs(L.idleSecs)], ['Days seen', L.daysSeen],
    ['Kills', L.kills], ['Boss kills', L.bossKills], ['Deaths', L.deaths],
    ['EXP earned', L.expEarned], ['Gold earned', L.goldEarned], ['Gold spent', L.goldSpent],
    ['Drops', L.drops], ['Melts', L.melts], ['Cubes', L.cubes],
    ['Forge tries / hits', `${n(L.forgeTries)} / ${n(L.forgeHits)}`], ['Best +', L.bestPlus], ['Ultimates', L.ultimates],
    ['This run: kills', L.runKills], ['This run: time', secs(L.runSec)],
    ...L.byClass.map((c) => [`Played as ${c.name}`, secs(c.sec)]),
  ]]);
  return sec;
}

function renderView(A, B, meta) {
  if (!A.ok) return h('div', { class: 'alert bad' }, `This copy could not be read: ${A.reason}`);
  const a = viewRows(A, meta);
  const b = B && B.ok ? viewRows(B, meta) : null;
  const out = [];
  const head = (v) => `r${v.rev}${v.historyId == null ? ' (live)' : ''} · ${when(v.savedUtc)}`;
  const hpRow = A.stats.flatMap((s) => s.rows).find((r) => r.key === 'hp');
  const atkRow = A.stats.flatMap((s) => s.rows).find((r) => r.key === 'atk');
  out.push(tiles([
    ['Level', n(A.hero.level), A.hero.className],
    ['Power', n(A.hero.power), b ? `compared: ${n(B.hero.power)}` : null],
    ['Attack', atkRow ? atkRow.value : '—'],
    ['Max HP', hpRow ? hpRow.value : '—'],
    ['Gold', n(A.wallet.gold)],
    ['Played', playtime(A.lifetime.playedSec), 'lifetime, all classes'],
  ]));
  if (B && !B.ok) out.push(h('div', { class: 'alert bad' }, `The compared copy could not be read: ${B.reason}`));
  const bMap = new Map();
  if (b) b.forEach(([, rows], si) => { for (const [lbl, val] of rows) bMap.set(`${si}|${lbl}`, cell(val)); });
  let changed = 0;
  const grid = h('div', { class: 'grid sv' });
  a.forEach(([title, rows], si) => {
    // Sections line up by POSITION (the skills title carries the class name,
    // which a class swap changes); rows inside a section line up by label.
    const body = rows.map(([lbl, val]) => {
      const x = cell(val);
      const y = b ? bMap.get(`${si}|${lbl}`) || { text: '—' } : null;
      const diff = !!b && (x.key ?? x.text) !== (y.key ?? y.text);
      if (diff) changed++;
      let d = null;
      if (diff && x.n != null && y.n != null) {
        const dv = x.n - y.n;
        d = h('span', { class: `dl ${dv < 0 ? 'badt' : 'good'}` }, `${dv > 0 ? '+' : '−'}${x.fmt ? x.fmt(Math.abs(dv)) : n(Math.abs(dv))}`);
      }
      const show = (c) => [h('div', { style: c.color ? { color: c.color } : null, title: c.hint || null }, c.text),
        c.sub ? h('div', { class: 'muted small' }, c.sub) : null];
      return h('tr', { class: diff ? 'sv-chg' : '' },
        td(lbl, 'muted small'),
        td([show(x), d]),
        b ? td(show(y), 'muted') : null);
    });
    grid.append(h('div', { class: 'sub' }, h('h3', null, title),
      h('table', { class: 'tight' },
        b ? h('thead', null, h('tr', null, h('th', null, ''), h('th', null, head(A)), h('th', null, head(B)))) : null,
        h('tbody', null, body))));
  });
  if (b) {
    out.push(note(changed
      ? `${changed} row${changed === 1 ? '' : 's'} differ (marked). The middle column is the copy shown, the right one is what it is compared with; +/− is shown minus compared.`
      : 'These two copies are the same on every row shown.'));
  }
  out.push(grid);
  return h('div', null, out);
}

// ── account ─────────────────────────────────────────────────────────────────
function openAccount(p, ctx) {
  const m = modal(`Account — ${p.username}`);
  const s = p.save;
  const name = input({ value: p.displayName || '', maxLength: 32, placeholder: p.username, class: 'grow' });
  const pwBox = h('div');
  m.body.append(
    h('dl', { class: 'kv' },
      h('dt', null, 'Username'), h('dd', null, p.username),
      h('dt', null, 'Email'), h('dd', null, p.email || '—'),
      h('dt', null, 'Joined'), h('dd', null, when(p.createdUtc), p.imported ? badge('imported') : null),
      h('dt', null, 'Last login'), h('dd', null, p.lastLoginUtc ? when(p.lastLoginUtc) : 'never (here)'),
      h('dt', null, 'Signed in'), h('dd', null, `${p.sessions} session${p.sessions === 1 ? '' : 's'}`),
      s ? [h('dt', null, 'Machine'), h('dd', null, s.machine || '—'), h('dt', null, 'Build'), h('dd', null, s.simHash || 'dev'),
           h('dt', null, 'Kills'), h('dd', null, n(s.kills))] : null),
    h('h4', null, 'Display name'),
    h('div', { class: 'row' }, name, act('Rename', async () => {
      await post('/player/rename', { id: p.id, displayName: name.value.trim() });
      flash(name.value.trim() ? `${p.username} now shows as “${name.value.trim()}”.` : `${p.username}'s display name cleared.`);
      ctx.refresh();
    }, 'primary')),
    note('Shown on boards and in chat instead of the username. Leave empty to clear it.'),
    h('h4', null, 'Password'),
    h('div', { class: 'row' }, act('Reset password', async () => {
      if (!confirm(`Give ${p.username} a temporary password? It works for one hour and also clears any lockout.`)) return;
      const r = await post('/player/reset-password', { id: p.id });
      const code = h('div', { class: 'secret' }, r.tempPassword);
      clear(pwBox).append(
        h('div', { class: 'row' }, h('div', { class: 'grow' }, code),
          btn('Copy', async (e) => {
            try { await navigator.clipboard.writeText(r.tempPassword); e.target.textContent = 'Copied'; }
            catch { const rg = document.createRange(); rg.selectNodeContents(code); getSelection().removeAllRanges(); getSelection().addRange(rg); }
          })),
        note(r.note || 'Works for one hour.'), note('Send it to them privately. It is not shown again.'));
    }, 'warn'),
    act('Sign out everywhere', async () => {
      if (!confirm(`Sign ${p.username} out of every machine?`)) return;
      const r = await post('/player/signout', { id: p.id });
      flash(`${p.username}: ${r.sessions} session${r.sessions === 1 ? '' : 's'} ended.`); ctx.refresh();
    })),
    pwBox,
    h('h4', { class: 'badt' }, 'Delete'),
    h('div', null, btn('Delete account…', () => { m.close(); openDelete(p, ctx); }, 'danger')));
}

function openDelete(p, ctx) {
  const m = modal(`Delete ${p.username}?`);
  const s = p.save;
  const box = input({ autocomplete: 'off', placeholder: p.username });
  const go = act('Delete permanently', async () => {
    if (box.value !== p.username) { flash('Type the username exactly to delete.', 'bad'); return; }
    await post('/player/delete', { id: p.id, confirm: box.value });
    m.close(); flash(`${p.username} deleted.`); ctx.refresh();
  }, 'danger solid', { disabled: true });
  box.addEventListener('input', () => { go.disabled = box.value !== p.username; });
  m.body.append(
    h('p', null, 'This removes the account, its sessions, its mail, its scores and its save',
      s ? [' — currently ', h('strong', null, `level ${s.level}, stage ${s.stage}`), `, ${playtime(s.playedSec)} played`] : null,
      '. It cannot be undone.'),
    field(h('span', null, 'Type ', h('code', null, p.username), ' to confirm'), box),
    h('div', { class: 'row' }, btn('Cancel', () => m.close()), go));
  box.focus();
}
