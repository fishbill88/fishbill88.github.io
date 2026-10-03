import { get, post } from '../api.js';
import {
  h, clear, card, tiles, table, td, n, playtime, badge, agoEl, when, day, act, btn, flash, modal, note,
  field, input, select, errorBox, ago,
} from '../ui.js';

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
async function openHistory(p, ctx) {
  const m = modal(`Saves — ${p.username}`, { wide: true });
  const box = h('div', null, h('div', { class: 'muted' }, 'Loading…'));
  m.body.append(
    note('Every accepted save is kept here (the newest 100 shown). Restore writes that copy back as a NEW revision; the player’s game then sees a conflict on its next push and asks which save to keep — tell them to take the CLOUD one.'),
    box);
  async function load() {
    try {
      const d = await get('/player/history', { id: p.id });
      const rows = d.history || [];
      clear(box).append(rows.length ? table(['Saved', '>Rev', 'Machine', '>Lv', '>Stage', 'Class', '>Gold', '>Size', ''], rows.map((r) => {
        const sm = r.summary || {};
        return h('tr', null,
          td(agoEl(r.savedUtc), 'nowrap'),
          td(n(r.rev), 'num'),
          td([r.machine || '—', r.forced ? badge('forced', 'warn', 'Written by an admin restore or a forced push') : null], 'small'),
          td(n(sm.heroLevel), 'num'), td(n(sm.stage), 'num'), td(sm.mainClass || '—'),
          td(n(sm.gold), 'num'), td(`${((r.bytes || 0) / 1024).toFixed(1)}KB`, 'num muted'),
          h('td', { class: 'acts' }, act('Restore', async () => {
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
