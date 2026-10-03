// Two read-only sweeps over every stored save. Run on demand: each reads every
// payload. Nothing is stored or acted on — a finding is a question to ask.

import { get } from '../api.js';
import { h, card, table, td, n, badge, act, note, clear, errorBox, when } from '../ui.js';

export async function render(root) {
  root.append(petCard(), spawnCard());
}

function petCard() {
  const out = h('div');
  const head = h('span');
  const run = act('Audit every save', async () => {
    clear(out).append(h('div', { class: 'muted' }, 'Reading every save…'));
    try {
      const { rows } = await get('/audit/pets');
      const bad = rows.filter((r) => r.status === 'findings');
      const skipped = rows.filter((r) => r.status === 'skipped');
      const clean = rows.length - bad.length - skipped.length;
      clear(head).append(badge(bad.length ? `${bad.length} do not balance` : 'all balance', bad.length ? 'bad' : 'ok'));
      clear(out).append(
        h('p', { class: 'small' }, h('strong', null, clean), ' balanced · ', h('strong', { class: bad.length ? 'badt' : '' }, bad.length), ' with findings · ', h('strong', null, skipped.length), ' not audited'),
        bad.length ? table(['Player', 'Rev', 'Findings'], bad.map((r) => h('tr', null,
          td(r.username, 'nowrap'),
          td([n(r.rev), r.updatedUtc ? h('div', null, when(r.updatedUtc)) : null], 'small muted nowrap'),
          td(h('ul', { style: { margin: 0, paddingLeft: '1.1rem' } }, r.findings.map((f) => h('li', null, f))), 'small')))) : null,
        skipped.length ? h('details', { class: 'small' }, h('summary', null, `${skipped.length} not audited — why`),
          h('ul', { class: 'muted' }, skipped.map((r) => h('li', null, `${r.username} — ${r.reason}`)))) : null);
    } catch (e) { clear(out).append(errorBox(e)); }
  }, 'primary');
  return card('Pet ledger audit', head,
    note('Pets are bought with SHARDS, and the client computes every shard — they drop on a kill, merge into pets, melt back, transmute four-into-one. The game records every door a shard moved through so the arithmetic can be checked afterwards, and the burns are what make it checkable. Edit one number anywhere and the totals stop adding up.'),
    note('Nothing here is stored or acted on. A finding is a question to go and ask, not a verdict. “Not audited” is deliberately not the same as clean.'),
    h('div', null, run), out);
}

function spawnCard() {
  const out = h('div');
  const head = h('span');
  const run = act('Check every account', async () => {
    clear(out).append(h('div', { class: 'muted' }, 'Reading every save…'));
    try {
      const { rows } = await get('/audit/spawns');
      const flagged = rows.filter((r) => r.flagged).length;
      const amber = rows.filter((r) => r.needsALook).length;
      clear(head).append(flagged ? badge(`${flagged} running fast`, 'bad')
        : amber ? badge(`${amber} worth a glance`, 'warn') : badge('every beacon keeping time', 'ok'));
      clear(out).append(rows.length ? table(['Player', '>Shortest gap', '>Speed', '>At stage', '>Beacons', 'Why', '>Rate /min', '>Ceiling', '>Kills', '>Stage now', 'Last save'],
        rows.map((r) => h('tr', { class: r.flagged ? 'row-bad' : r.needsALook ? 'row-warn' : '' },
          td(r.username, 'nowrap'),
          td(r.hasBeacon ? `${r.minGapSec}s` : '—', `num ${r.flagged ? 'badt strong' : ''}`),
          td(r.speedFactor > 0 ? `${r.speedFactor.toFixed(1)}x` : '—', `num ${r.flagged ? 'badt strong' : 'muted'}`),
          td(r.minGapStage ?? '—', 'num muted'),
          td(r.beacons ?? '—', 'num muted'),
          td(r.why ? h('span', { class: r.flagged || r.clockWentBackwards ? 'badt' : '' }, r.why) : '', 'small muted'),
          td(r.spawnRateMaxPerMin ?? '—', 'num muted'),
          td(r.legitCeiling || '—', 'num muted'),
          td(n(r.kills), 'num'),
          td(r.stage ?? '—', 'num muted'),
          td(r.lastSave ? when(r.lastSave) : '—', 'small muted nowrap'))))
        : note('No account has reported these numbers yet — each one needs to relaunch on a build that fires the Wisp beacon.'));
    } catch (e) { clear(out).append(errorBox(e)); }
  }, 'primary');
  return card('Spawn-rate audit', head,
    note('The game fires a ', h('strong', null, 'Wisp'), ' every N spawns, where N is that stage’s own spawns-per-minute — so an honest client fires exactly ', h('strong', null, 'one a minute'),
      ', at every stage. Each row’s ', h('strong', null, 'shortest gap'), ' is the closest two Wisps ever landed on that account, by the player’s own clock. Sixty seconds is right; longer is also right (a boss, a party, the tower and every dropped frame pause the beacon). ',
      h('strong', null, 'Shorter has one cause'), ' — the spawn timer ran faster than the clock it was timed against.'),
    note(badge('red', 'bad'), ' fired sooner than 55 seconds apart — the margin is for a device clock resyncing, not for the game. ',
      badge('amber', 'warn'), ' has no beacon to read but is clearly playing. Plain rows are keeping time. The rate and ceiling columns are the older check, kept as context. Even a red row is a question to go and ask, not a verdict.'),
    h('div', null, run), out);
}
