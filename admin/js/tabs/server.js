// Server settings: maintenance, the room server, which builds count on the
// boards, the signup limit, and re-syncing the item catalogue.

import { get, post } from '../api.js';
import { h, card, act, flash, note, badge, num, input, intOf, n } from '../ui.js';
import { forgetRules } from '../catalog.js';

export async function render(root, ctx) {
  const { config: c } = await get('/config');
  const dev = c.allowDev || {};
  const on = !!c.maintenance;

  const url = input({ value: c.towerServer || '', placeholder: 'wss://… (empty for none)', class: 'grow', spellcheck: false });
  const devBoxes = Object.fromEntries(['rank', 'tower', 'worldBoss'].map((k) => [k, h('input', { type: 'checkbox', checked: !!dev[k] })]));
  const perIp = num({ min: 0, value: (c.signup && c.signup.perIpPerDay) ?? 10, class: 'w6' });

  root.append(
    card('Maintenance', on ? badge('ON', 'bad') : badge('off', 'ok'),
      note('While on, every game route answers 503 {error: "maintenance"}. Players keep their local save and retry later; nothing is lost. The admin keeps working.'),
      h('div', null, act(on ? 'Turn maintenance OFF' : 'Turn maintenance ON', async () => {
        if (!on && !confirm('Turn maintenance ON? Every player’s saves, mail, market and boards stop until you turn it off.')) return;
        await post('/config/maintenance', { on: !on });
        flash(`Maintenance is ${on ? 'off — players are back' : 'ON'}.`); ctx.refresh();
      }, on ? 'primary' : 'danger'))),
    card('Room server', null,
      note('Where every client’s Tower, co-op, arena and world boss panel connects. A ws:// or wss:// address; empty switches those modes off. Clients pick it up on their next sync.'),
      h('div', { class: 'row' }, url, act('Save', async () => {
        const v = url.value.trim();
        if (v && !/^wss?:\/\/\S+$/.test(v)) { flash('A ws:// or wss:// address, or empty for none.', 'bad'); return; }
        if (!v && !confirm('Clear the room server? Tower, co-op, arena and world boss stop working for everyone.')) return;
        await post('/config/tower-server', { url: v }); flash(v ? `Room server set to ${v}.` : 'Room server cleared.'); ctx.refresh();
      }, 'primary'))),
    card('Dev builds on the boards', null,
      note('Whether runs and scores from unstamped (“dev”) builds count. A packaged release carries a build stamp; a client run from source does not.'),
      h('div', { class: 'row' },
        h('label', { class: 'check' }, devBoxes.rank, 'Period boards (rank)'),
        h('label', { class: 'check' }, devBoxes.tower, 'Tower floor times'),
        h('label', { class: 'check' }, devBoxes.worldBoss, 'World boss'),
        act('Save', async () => {
          await post('/config/allow-dev', { rank: devBoxes.rank.checked, tower: devBoxes.tower.checked, worldBoss: devBoxes.worldBoss.checked });
          flash('Dev-build rules saved.'); ctx.refresh();
        }, 'primary'))),
    card('Sign-ups', null,
      note('Accounts one address may register per Philippine day. An office shares one public address, so keep it loose; 0 stops new sign-ups entirely.'),
      h('div', { class: 'row' },
        h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Per address per day'), perIp),
        act('Save', async () => {
          const v = intOf(perIp);
          if (v === 0 && !confirm('0 stops every new registration. Continue?')) return;
          await post('/config/signup', { perIpPerDay: v }); flash(`Sign-ups: ${v} per address per day.`); ctx.refresh();
        }, 'primary'))),
    card('Item catalogue', null,
      note('The shop, reward and choice pickers read the server’s item catalogue. After a game update, run ', h('code', null, 'export-icons.bat'),
        ' and deploy this site; then re-sync here. It reads ', h('code', null, 'gameicons/catalog.json'),
        ' from this site, upserts every row and retires any item no longer in the export.'),
      h('div', null, act('Re-sync catalogue from the icon export', async () => {
        let items;
        try {
          const res = await fetch('gameicons/catalog.json', { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          items = await res.json();
        } catch (e) { flash(`Could not read gameicons/catalog.json: ${e.message}`, 'bad'); return; }
        if (!Array.isArray(items)) { flash('gameicons/catalog.json is not a list of items.', 'bad'); return; }
        if (!confirm(`Re-sync the item catalogue from the icon export (${n(items.length)} rows)? Items missing from the export are retired.`)) return;
        const r = await post('/catalog/sync', { items });
        forgetRules();
        flash(`Catalogue re-synced: ${n(r.items)} items active.`);
      }, 'primary'))),
    card('Stored configuration', null,
      h('details', null, h('summary', null, 'Raw values (read-only)'), h('pre', { class: 'stack' }, JSON.stringify(c, null, 2)))));
}
