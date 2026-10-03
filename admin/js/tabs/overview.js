import { get, BASE, sessionExpires } from '../api.js';
import { h, card, tiles, n, playtime, badge, note, when } from '../ui.js';

export async function render(root) {
  const o = await get('/overview');
  const c = o.config || {};
  const dev = c.allowDev || {};
  root.append(
    ...(c.maintenance ? [h('div', { class: 'alert warn' },
      h('strong', null, 'Maintenance is ON. '), 'Every game route answers 503; players keep their local save and retry. ',
      h('a', { href: '#server' }, 'Server settings'))] : []),
    tiles([
      ['Players', n(o.players)],
      ['With a save', n(o.withSave), 'have played at least once'],
      ['New this week', n(o.newThisWeek), 'rolling 7 days'],
      ['Active', n(o.active24h), 'saved in the last 24h'],
      ['Highest level', n(o.highestLevel)],
      ['Total played', playtime(o.totalPlayedSec), 'across all saves (run clocks)'],
      ['Locked out', n(o.locked), 'clears itself after 15 min', o.locked ? 'warn' : ''],
      ['Disabled', n(o.disabled)],
      ['Unclaimed mail', n(o.openMail), 'letters not yet collected'],
      ['On the stall', n(o.liveOffers), 'live player listings'],
    ]),
    card('Server', null,
      h('dl', { class: 'kv' },
        h('dt', null, 'Maintenance'), h('dd', null, c.maintenance ? badge('ON', 'bad') : badge('off', 'ok')),
        h('dt', null, 'Room server'), h('dd', null, c.towerServer ? h('code', null, c.towerServer) : h('span', { class: 'muted' }, 'none — Tower, co-op, arena and world boss are off')),
        h('dt', null, 'Dev builds count on'), h('dd', null,
          ['rank', 'tower', 'worldBoss'].map((k) => badge(`${k === 'worldBoss' ? 'world boss' : k}: ${dev[k] ? 'yes' : 'no'}`, dev[k] ? 'warn' : ''))),
        h('dt', null, 'Balance defaults'), h('dd', null, `rev ${c.balanceRev ?? 0} · `, h('a', { href: '#balance' }, 'edit')),
        h('dt', null, 'Outgoing mail (SMTP)'), h('dd', null, c.smtp ? badge('configured', 'ok') : badge('not configured', 'warn')),
        h('dt', null, 'API'), h('dd', null, h('code', null, BASE)),
        h('dt', null, 'This admin session'), h('dd', null, sessionExpires() ? `ends ${when(sessionExpires())}` : '—'),
      ),
      note('Every change made from this admin is written to the ', h('a', { href: '#log' }, 'activity log'), '.')),
  );
}
