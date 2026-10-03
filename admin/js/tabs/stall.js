// The player-to-player stall: what is on the shelf, and what has changed hands.
// Everything trades in gold now; old rows may still say 'coins'.

import { get, post } from '../api.js';
import { h, card, tiles, table, td, n, act, flash, note, agoEl, when } from '../ui.js';
import { rules, setName } from '../catalog.js';

const desc = (o, R) => [o.rarity, o.slot, o.ilvl ? `ilvl ${o.ilvl}` : null, o.set ? setName(R.meta, o.set) : null, o.plus ? `+${o.plus}` : null]
  .filter(Boolean).join(' · ');
const money = (v, cur) => [n(v), h('span', { class: 'muted small' }, ` ${cur || 'gold'}`)];

export async function render(root, ctx) {
  const [R, d] = await Promise.all([rules(), get('/stall')]);
  const t = d.tiles || {};
  root.append(
    tiles([
      ['On the shelf now', n(t.live)],
      ['Gold traded', n(t.goldTraded), 'all sales in gold'],
      ['Gold burned', n(t.goldBurned), 'commission, paid to nobody'],
      ['Coins traded before', n(t.coinsTradedBefore), 'legacy, before everything was gold'],
    ]),
    card('On the shelf', h('div', { class: 'card-x' },
      act('Run the expiry sweep', async () => { await post('/stall/sweep'); flash('Expiry sweep ran — anything past its date went back to its seller.'); ctx.refresh(); }),
      act('Return everything', async () => {
        if (!confirm('Return EVERY live listing to its seller? Items go back by in-game mail. This cannot be undone.')) return;
        const r = await post('/stall/return-all'); flash(`${n(r.returned)} listing(s) returned.`); ctx.refresh();
      }, 'danger', { disabled: !d.live.length })),
      d.live.length ? table(['Item', 'Seller', '>Price', 'Listed', 'Expires', ''], d.live.map((o) => h('tr', null,
        td([o.name, h('div', { class: 'muted small' }, desc(o, R))]),
        td(o.seller), td(money(o.price, o.currency), 'num'),
        td(h('span', { title: when(o.listedUtc) }, agoEl(o.listedUtc)), 'small muted nowrap'),
        td(when(o.expiresUtc), 'small muted nowrap'),
        h('td', { class: 'acts' }, act('Return', async () => {
          if (!confirm(`Take ${o.name} off the shelf and post it back to ${o.seller}?`)) return;
          const r = await post('/stall/return', { offerId: o.offerId });
          flash(r.returned ? `${o.name} returned to ${o.seller}.` : 'It was no longer live — sold or expired meanwhile.'); ctx.refresh();
        }, 'danger xs')))))
        : h('p', { class: 'muted' }, 'Nothing is listed.')),
    card('What has changed hands', h('span', { class: 'muted small' }, `latest ${d.sales.length}`),
      note('Written in the same transaction as the payment and the delivery, so a trade that is not here did not happen — that is the answer to “they say they paid and got nothing”.'),
      d.sales.length ? table(['When', 'Item', 'Buyer', 'Seller', '>Paid', '>Seller got', '>Burned'], d.sales.map((s) => h('tr', null,
        td(agoEl(s.atUtc), 'small muted nowrap'),
        td([s.name, h('div', { class: 'muted small' }, desc(s, R))]),
        td(s.buyer || '—'), td(s.seller),
        td(money(s.paid, s.currency), 'num'), td(n(s.sellerGot), 'num'), td(n(s.burned), 'num muted'))))
        : h('p', { class: 'muted' }, 'No trades yet.')));
}
