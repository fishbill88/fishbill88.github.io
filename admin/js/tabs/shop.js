// The gold shop: what players can buy from the in-game market. Gold only —
// coins are gone. One listing per item; listing an item again re-prices it.

import { get, post } from '../api.js';
import { h, card, table, td, n, badge, act, flash, note, field, num, input, intOf } from '../ui.js';
import { rules, itemPicker, icon, petName } from '../catalog.js';

/// A DATE column arrives as an ISO instant at the server's local midnight, so
/// round to the nearest UTC day instead of trusting the time part.
export function dateOnly(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t + 12 * 3600_000).toISOString().slice(0, 10) : '';
}
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function render(root, ctx) {
  const [R, { listings }] = await Promise.all([rules(), get('/market')]);

  // ── list / re-price ──
  const qty = num({ min: 1, max: 99999, value: 1, class: 'w6' });
  const gold = num({ min: 1, placeholder: 'gold', class: 'w9', required: true });
  const qtyField = field('Qty', qty, { hint: 'How many the buyer gets for this price — a bundle for a consumable, a shard lot for a pet. Gear is always 1.' });
  const picker = itemPicker(R, {
    back: false, pets: true,
    onChange(kind, row) {
      const stack = kind === 'pet' || (row && row.slot === 'consumable');
      qty.disabled = !stack;
      if (!stack) qty.value = 1;
      else if (kind === 'pet' && intOf(qty) === 1) qty.value = 100;
    },
  });
  const listBtn = act('List', async () => {
    const g = intOf(gold);
    if (!(g > 0)) { flash('Give it a gold price above 0.', 'bad'); return; }
    const body = { goldPrice: g, qty: intOf(qty) || 1 };
    if (picker.kind() === 'pet') {
      if (!picker.petId()) { flash('Choose a pet.', 'bad'); return; }
      body.petId = picker.petId();
    } else {
      if (!picker.itemKey()) { flash('Pick an item from the catalogue.', 'bad'); return; }
      body.itemKey = picker.itemKey();
    }
    await post('/market/list', body);
    flash('Listed. An item already on the shelf is re-priced (and its sale cleared) rather than listed twice.');
    ctx.refresh();
  }, 'primary');

  const live = listings.filter((l) => l.active).length;
  root.append(
    card('Shop — what players can buy', h('span', { class: 'muted small' }, `${live} live of ${listings.length}`),
      note('The shelf players see in the game’s market. Prices are in ', h('strong', null, 'gold'), '; the buyer’s game takes the gold when they collect the letter. Back items are not sold here — they are rolled, so they go out by mail from Rewards.'),
      h('div', { class: 'row' }, picker.el),
      h('div', { class: 'row' }, qtyField, field('Price in gold', gold), listBtn)),
    card('Listings', null,
      listings.length ? table(['', 'Item', '>Qty', '>Price', 'Sale', '>Sold', ''], listings.map((l) => row(l, R, ctx)))
        : note('Nothing is listed yet. Pick an item above — the catalogue holds everything the game can drop.')));
}

function row(l, R, ctx) {
  const t = today();
  const ends = dateOnly(l.saleEndsOn);
  const onSale = l.salePrice != null && (!ends || ends >= t);
  const sale = num({ min: 1, placeholder: 'none', value: l.salePrice ?? '', class: 'w6', title: 'Sale price in gold — must be below the price. Empty = no sale.' });
  const endsOn = input({ type: 'date', value: ends, title: 'Last day of the sale (inclusive). Empty = runs until cleared.' });
  const dead = l.retired;
  const name = l.kind === 'shards' ? `${petName(R.meta, l.petId)} shards` : l.name;
  return h('tr', { class: l.active ? '' : 'dim' },
    td(icon(l.icon, 36)),
    td([
      h('div', { class: 'strong' }, name, l.rarity && l.kind !== 'shards' ? h('span', { class: 'muted small' }, ` · ${l.rarity}`) : null,
        l.ilvl && !['consumable', 'blessing'].includes(l.slot) && l.kind !== 'shards' ? h('span', { class: 'muted small' }, ` · Lv ${l.ilvl}`) : null),
      l.description ? h('div', { class: 'muted small clamp2', title: l.description }, l.description) : null,
      !l.active ? badge('delisted') : null,
      dead ? h('div', { class: 'badt small' }, badge('catalogue row retired', 'bad'), ' This item was retired from the catalogue, so it cannot be bought. Delete the listing.') : null,
    ], 'wrap-any'),
    td(l.qty > 1 ? h('strong', null, `×${n(l.qty)}`) : h('span', { class: 'muted' }, '1'), 'num'),
    td(onSale
      ? [h('span', { class: 'strike' }, n(l.goldPrice)), ' ', h('strong', { class: 'good' }, n(l.salePrice)), h('div', { class: 'muted small' }, ends ? `gold · sale ends ${ends}` : 'gold · on sale')]
      : [n(l.goldPrice), h('div', { class: 'muted small' }, l.salePrice != null ? `gold · sale ended ${ends}` : 'gold')], 'num'),
    td(h('div', { class: 'row nowrap', style: { flexWrap: 'nowrap', gap: '0.3rem', alignItems: 'center' } }, sale, endsOn,
      act('Set', async () => {
        const v = sale.value.trim();
        if (v && !(Number(v) > 0 && Number(v) < l.goldPrice)) { flash('A sale price must be above 0 and below the gold price.', 'bad'); return; }
        await post('/market/sale', { id: l.id, salePrice: v === '' ? null : Number(v), saleEndsOn: v === '' ? null : (endsOn.value || null) });
        flash(v ? `${name}: on sale for ${n(v)} gold${endsOn.value ? ' until ' + endsOn.value : ''}.` : `${name}: sale cleared.`);
        ctx.refresh();
      }, 'xs'))),
    td(n(l.sold), 'num'),
    h('td', { class: 'acts' },
      dead ? null : act(l.active ? 'Delist' : 'Relist', async () => {
        await post('/market/active', { id: l.id, active: !l.active });
        flash(`${name} ${l.active ? 'delisted' : 'relisted'}.`); ctx.refresh();
      }, l.active ? 'warn xs' : 'ok xs'),
      act('Delete', async () => {
        if (!confirm(`Delete the listing for ${name}? Purchase history is kept — it records the item, not the shelf row.`)) return;
        await post('/market/delete', { id: l.id });
        flash(`${name}: listing deleted.`); ctx.refresh();
      }, dead ? 'danger solid xs' : 'danger xs')));
}
