// The game's item rules (/meta) and catalogue (/catalog), fetched once per
// sign-in, plus the two pickers every item form shares: the category-first
// item picker and the pick-N-of-M choice picker.

import { get } from './api.js';
import { h, clear, select, fillSelect, num, field, intOf } from './ui.js';

let cache = null;
export async function rules(force = false) {
  if (!cache || force) {
    cache = Promise.all([get('/meta'), get('/catalog')]).then(([meta, cat]) => {
      const rank = (s) => (SLOT_ORDER.indexOf(s) + 1) || 99;
      const items = (cat.items || []).filter((i) => i.active !== false)
        .sort((a, b) => rank(a.slot) - rank(b.slot) || String(a.line).localeCompare(String(b.line)) || a.ilvl - b.ilvl);
      const byKey = new Map((cat.items || []).map((i) => [i.key, i]));
      return { meta, items, byKey };
    });
    cache.catch(() => { cache = null; });
  }
  return cache;
}
export const forgetRules = () => { cache = null; };

const SLOT_LABEL = {
  weapon: 'Weapons', sub: 'Sub-weapons', helmet: 'Helmets', armor: 'Armour', gloves: 'Gloves',
  pants: 'Trousers', boots: 'Boots', back: 'Back items', blessing: 'Blessings', ring: 'Rings',
  amulet: 'Amulets', bracer: 'Bracers', consumable: 'Consumables',
};
const SLOT_ORDER = Object.keys(SLOT_LABEL);
export const slotLabel = (s) => SLOT_LABEL[s] || s;
export const SHARDS = '__petshards';
const KIND_ORDER = ['wings', 'cape', 'flag', 'bag'];
const KIND_TITLE = { wings: 'Wings', cape: 'Capes', flag: 'Flags', bag: 'Bags' };

export function slotsOf(items, { back = true } = {}) {
  const set = new Set(items.map((i) => i.slot));
  return [...set].filter((s) => back || s !== 'back')
    .sort((a, b) => (SLOT_ORDER.indexOf(a) + 1 || 99) - (SLOT_ORDER.indexOf(b) + 1 || 99));
}

/// How a catalogue row reads in a list. A consumable's ilvl is a pack size and a
/// blessing has no level, so neither gets "Lv".
export function itemLabel(it) {
  if (it.slot === 'consumable') return it.name;
  if (it.slot === 'blessing') return `${it.name} (${it.rarity})`;
  return `${it.name}${it.className ? ' — ' + it.className : ''} (Lv ${it.ilvl} ${it.rarity})`;
}

export function icon(file, size = 32) {
  if (!file) return h('span', { class: 'ico none', style: { width: size + 'px', height: size + 'px' } });
  const img = h('img', { class: 'ico', src: `gameicons/${file}`, alt: '', width: size, height: size, loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => img.classList.add('broken'), { once: true });
  return img;
}

export const rarityName = (meta, id) => (meta.rarities.find((r) => r.id === id) || {}).name || id;
export const setName = (meta, id) => (meta.sets.find((s) => s.id === id) || {}).name || id;
export const petName = (meta, id) => (meta.pets.find((p) => p.id === id) || {}).name || id;
export const rarityColor = (meta, id) => (meta.rarities.find((r) => r.id === id) || {}).color || null;

const nounOf = (it) => it.name.split(' ').slice(1).join(' ') || it.name;

/// Category first, then the item — the catalogue runs to 1,700 rows. A BACK
/// category swaps the one long list for a design + an item level; "Pet shards"
/// swaps it for a pet. Shows the chosen item's icon and text beside it.
///
/// opts: { back: bool, pets: bool, onChange(kind) } — kind is '', 'item', 'back' or 'pet'.
export function itemPicker(R, opts = {}) {
  const { meta, items } = R;
  const backKind = Object.fromEntries(meta.backDesigns.map((d) => [d.id, d.kind]));
  const kindRarity = {};
  for (const d of meta.backDesigns) kindRarity[d.kind] = d.rarity;

  const cats = [['', '— none —'], ...slotsOf(items, { back: opts.back !== false }).map((s) => [s, slotLabel(s)])];
  if (opts.pets) cats.push([SHARDS, 'Pet shards']);
  const cat = select(cats);
  const itemSel = select([['', '— choose a category first —']]);
  const designSel = select([]);
  const lvlSel = select([]);
  const petSel = select([['', '— choose a pet —'], ...[...meta.pets].sort((a, b) => a.name.localeCompare(b.name)).map((p) => [p.id, p.name])]);

  const fItem = field('Item', itemSel, { cls: 'grow' });
  const fDesign = field('Design', designSel);
  const fLvl = field('Item level', lvlSel);
  const fPet = field('Pet', petSel);
  const preview = h('div', { class: 'preview', hidden: true });

  const el = h('div', { class: 'row picker' }, field('Category', cat), fItem, fDesign, fLvl, fPet, preview);

  const byKey = new Map(items.map((i) => [i.key, i]));
  const kind = () => (cat.value === SHARDS ? 'pet' : cat.value === 'back' ? 'back' : cat.value ? 'item' : '');
  const currentKey = () => (kind() === 'back' ? lvlSel.value : kind() === 'item' ? itemSel.value : '');

  function fillItems() {
    const slot = cat.value;
    const rows = items.filter((i) => i.slot === slot);
    fillSelect(itemSel, [['', slot ? '— none —' : '— choose a category first —'], ...rows.map((i) => [i.key, itemLabel(i)])]);
  }
  function fillDesigns() {
    const groups = [];
    for (const k of KIND_ORDER) {
      const seen = new Set(); const list = [];
      for (const it of items) {
        if (it.slot !== 'back' || backKind[it.line] !== k || seen.has(it.line)) continue;
        seen.add(it.line); list.push([it.line, nounOf(it)]);
      }
      if (list.length) groups.push({ group: `${KIND_TITLE[k]} — always ${kindRarity[k] || ''}`, items: list });
    }
    fillSelect(designSel, [['', '— choose a design —'], ...groups]);
    fillLevels();
  }
  function fillLevels() {
    const rows = items.filter((i) => i.slot === 'back' && i.line === designSel.value).sort((a, b) => b.ilvl - a.ilvl);
    fillSelect(lvlSel, rows.length ? rows.map((i) => [i.key, `Lv ${i.ilvl} — ${i.name}`]) : [['', '— choose a design first —']]);
  }
  function paint() {
    const k = kind();
    fItem.hidden = k === 'back' || k === 'pet';
    fDesign.hidden = fLvl.hidden = k !== 'back';
    fPet.hidden = k !== 'pet';
    const row = byKey.get(currentKey());
    clear(preview);
    preview.hidden = !row;
    if (row) {
      preview.append(icon(row.icon, 40), h('div', null,
        h('div', { class: 'strong' }, row.name, ' ', h('span', { class: 'muted small' }, row.slot === 'back' ? `always ${kindRarity[backKind[row.line]] || row.rarity}` : row.rarity)),
        row.description ? h('div', { class: 'muted small clamp2' }, row.description) : null));
    }
    if (opts.onChange) opts.onChange(k, row);
  }

  cat.addEventListener('change', () => {
    if (kind() === 'back') fillDesigns(); else if (kind() === 'item') fillItems();
    if (kind() !== 'pet') petSel.value = '';
    paint();
  });
  itemSel.addEventListener('change', paint);
  designSel.addEventListener('change', () => { fillLevels(); paint(); });
  lvlSel.addEventListener('change', paint);
  petSel.addEventListener('change', paint);
  paint();

  return {
    el,
    kind,
    row: () => byKey.get(currentKey()) || null,
    itemKey: currentKey,
    petId: () => (kind() === 'pet' ? petSel.value : ''),
    /// Select a catalogue key (for editing).
    set(key) {
      const row = byKey.get(key) || (key && R.byKey.get(key));
      if (!row) { cat.value = ''; fillItems(); paint(); return; }
      cat.value = row.slot;
      if (row.slot === 'back') { fillDesigns(); designSel.value = row.line; fillLevels(); lvlSel.value = row.key; }
      else { fillItems(); if (![...itemSel.options].some((o) => o.value === row.key)) itemSel.append(new Option(itemLabel(row) + ' (retired)', row.key)); itemSel.value = row.key; }
      paint();
    },
    reset() { cat.value = ''; fillItems(); petSel.value = ''; paint(); },
  };
}

/// Rarity / Forge / Set controls for one item, with the rules for which apply.
export function itemStamp(R) {
  const { meta } = R;
  const rarity = select(meta.rarities.map((r) => [r.id, r.name]));
  const plus = num({ min: 0, max: meta.maxPlus, value: 0, class: 'w5' });
  const set = select([['', 'No set'], ...meta.sets.map((s) => [s.id, s.name + (s.classSet ? ' (class)' : '')])]);
  const backNote = h('div', { class: 'plain' }, '—');
  const fR = field('Rarity', rarity);
  const fB = field('Rarity', backNote);
  const fP = field('Forge', plus, { hint: `0 to +${meta.maxPlus}` });
  const fS = field('Set (armour)', set);
  const el = h('div', { class: 'row' }, fR, fB, fP, fS);
  const kindRarity = {};
  for (const d of meta.backDesigns) kindRarity[d.kind] = d.rarity;
  const backKind = Object.fromEntries(meta.backDesigns.map((d) => [d.id, d.kind]));

  function sync(kind, row) {
    const isBack = kind === 'back';
    const plain = row && (row.slot === 'consumable' || row.slot === 'blessing');
    el.hidden = kind === 'pet';
    fR.hidden = isBack;
    fB.hidden = !isBack;
    backNote.textContent = isBack && row ? `always ${rarityName(meta, kindRarity[backKind[row.line]] || row.rarity)}` : '—';
    if (isBack) rarity.value = 'normal';
    const setOk = row && meta.setSlots.includes(row.slot);
    fS.hidden = isBack || (row && !setOk);
    if (!setOk) set.value = '';
    for (const c of [rarity, plus, set]) c.disabled = !!plain;
    if (plain) { rarity.value = 'normal'; plus.value = 0; set.value = ''; }
  }
  return {
    el, sync,
    value: () => ({ rarity: rarity.value || 'normal', plus: intOf(plus), set: set.value || null }),
    set(v) { rarity.value = v.rarity || 'normal'; plus.value = v.plus || 0; set.value = v.set || ''; },
    reset() { rarity.value = 'normal'; plus.value = 0; set.value = ''; },
  };
}

/// Pick N of M: the catalogue on the left, the offer on the right. The stamp
/// (rarity, forge, set) applies to the highlighted offered rows, or to all of
/// them when none is highlighted — and to anything added after.
export function choicePicker(R) {
  const { meta, items } = R;
  const byKey = new Map(items.map((i) => [i.key, i]));
  const MAX = 8, SHOW = 250;

  const search = h('input', { type: 'search', placeholder: 'Search the catalogue — name, line, class or level (e.g. longsword lv300)', autocomplete: 'off' });
  const slotSel = select([['', 'Any slot'], ...slotsOf(items).map((s) => [s, slotLabel(s)])]);
  const backLvls = [...new Set(items.filter((i) => i.slot === 'back').map((i) => i.ilvl))].sort((a, b) => b - a);
  const backLvl = select(backLvls.map((l) => [String(l), `Back items at Lv ${l}`]), { title: 'Back items (wings, capes, flags, bags) are listed at this level' });
  const rarFilter = select([['', 'Any rarity'], ...[...new Set(items.map((i) => i.rarity))].sort().map((r) => [r, `catalogue: ${r}`])]);

  const stR = select(meta.rarities.map((r) => [r.id, r.name]));
  const stP = num({ min: 0, max: meta.maxPlus, value: 0, class: 'w5' });
  const stS = select([['', 'No set'], ...meta.sets.map((s) => [s.id, s.name])]);

  const pool = h('div', { class: 'lb', role: 'listbox', 'aria-multiselectable': 'true', tabindex: 0 });
  const picked = h('div', { class: 'lb', role: 'listbox', 'aria-multiselectable': 'true', tabindex: 0 });
  const poolLabel = h('span', { class: 'muted small' }, 'Catalogue');
  const pickedLabel = h('span', { class: 'muted small' }, 'This letter offers');
  const limit = num({ min: 0, max: 7, value: 0, class: 'w5' });
  const summary = h('div', { class: 'muted small' });

  let chosen = [];             // [{ key, rarity, plus, set }]
  const poolSel = new Set(), pickSel = new Set();

  function stamp(it) {
    const back = it.slot === 'back';
    // Consumables and blessings exist only as catalogued: no rarity, forge or set.
    if (it.slot === 'consumable' || it.slot === 'blessing') return { key: it.key, rarity: 'normal', plus: 0, set: '' };
    return { key: it.key, rarity: back ? 'normal' : stR.value || 'normal', plus: intOf(stP),
             set: !back && stS.value && meta.setSlots.includes(it.slot) ? stS.value : '' };
  }
  const stampText = (p) => {
    const bits = [];
    if (p.rarity && p.rarity !== 'normal') bits.push(p.rarity);
    if (p.plus) bits.push('+' + p.plus);
    if (p.set) bits.push(p.set);
    return bits.length ? ' — ' + bits.join(' ') : '';
  };
  function matches(it, needle) {
    if (!needle) return true;
    const hay = `${it.name} ${it.line || ''} ${slotLabel(it.slot)} ${it.slot} ${it.rarity} lv${it.ilvl} ${it.className || ''}`.toLowerCase();
    return needle.toLowerCase().split(/\s+/).every((t) => !t || hay.includes(t));
  }
  function rowEl(it, selSet, text, onDbl) {
    const r = h('div', { class: 'lb-row' + (selSet.has(it.key) ? ' on' : ''), role: 'option', 'aria-selected': String(selSet.has(it.key)), title: it.description || '' },
      icon(it.icon, 24), h('span', null, text));
    r.addEventListener('click', () => { selSet.has(it.key) ? selSet.delete(it.key) : selSet.add(it.key); r.classList.toggle('on'); r.setAttribute('aria-selected', String(selSet.has(it.key))); });
    r.addEventListener('dblclick', () => onDbl(it.key));
    return r;
  }
  function renderPool() {
    const needle = search.value.trim(), slot = slotSel.value, rar = rarFilter.value;
    clear(pool);
    let shown = 0, total = 0, group = null;
    for (const it of items) {
      if (chosen.some((c) => c.key === it.key)) continue;
      if (slot && it.slot !== slot) continue;
      if (rar && it.rarity !== rar) continue;
      if (it.slot === 'back' && it.ilvl !== Number(backLvl.value)) continue;
      if (!matches(it, needle)) continue;
      total++;
      if (shown >= SHOW) continue;
      if (it.slot !== group) { group = it.slot; pool.append(h('div', { class: 'lb-group' }, slotLabel(it.slot))); }
      pool.append(rowEl(it, poolSel, itemLabel(it), (k) => add([k])));
      shown++;
    }
    if (total > shown) pool.append(h('div', { class: 'lb-more' }, `+ ${total - shown} more — narrow the search`));
    if (!total) pool.append(h('div', { class: 'lb-more' }, 'Nothing matches.'));
    poolLabel.textContent = `Catalogue (${total}${total === items.length ? '' : ' of ' + items.length})`;
  }
  function renderPicked() {
    clear(picked);
    for (const p of chosen) {
      const it = byKey.get(p.key);
      if (it) picked.append(rowEl(it, pickSel, itemLabel(it) + stampText(p), (k) => remove([k])));
    }
    if (!chosen.length) picked.append(h('div', { class: 'lb-more' }, 'Double-click an item on the left to offer it.'));
    pickedLabel.textContent = chosen.length ? `This letter offers (${chosen.length})` : 'This letter offers';
    paintLimit();
  }
  function paintLimit() {
    const most = Math.max(0, chosen.length - 1);
    limit.max = Math.min(MAX, most);
    if (chosen.length && limit.value === '0') limit.value = '1';
    if (!chosen.length) limit.value = '0';
    if (Number(limit.value) > most) limit.value = String(most);
    summary.textContent = chosen.length
      ? `Pick ${Number(limit.value) || 1} of ${chosen.length} — the rest are gone once they collect, and they need a free backpack slot for each one they take.`
      : 'Must be fewer than you offer. The rest are gone once they collect, and they need a free backpack slot for each one they take.';
  }
  function add(keys) {
    for (const k of keys) {
      const it = byKey.get(k);
      if (it && !chosen.some((c) => c.key === k) && chosen.length < MAX) chosen.push(stamp(it));
      poolSel.delete(k);
    }
    renderPool(); renderPicked();
  }
  function remove(keys) {
    chosen = chosen.filter((c) => !keys.includes(c.key));
    for (const k of keys) pickSel.delete(k);
    renderPool(); renderPicked();
  }
  function restamp() {
    if (!chosen.length) return;
    chosen = chosen.map((c) => (pickSel.size && !pickSel.has(c.key) ? c : stamp(byKey.get(c.key))));
    renderPicked();
  }

  search.addEventListener('input', renderPool);
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  for (const s of [slotSel, backLvl, rarFilter]) s.addEventListener('change', renderPool);
  for (const s of [stR, stP, stS]) { s.addEventListener('change', restamp); s.addEventListener('input', restamp); }
  limit.addEventListener('input', paintLimit);

  const el = h('div', { class: 'choice' },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, search), slotSel, backLvl, rarFilter),
    h('div', { class: 'row' }, field('Rarity', stR), field('Forge', stP), field('Set (armour only)', stS),
      h('div', { class: 'muted small grow self-end' }, 'Applies to everything you are offering — or to just the highlighted rows, if you highlight some. Leave it on Normal and the item is sent exactly as the catalogue has it.')),
    h('div', { class: 'duo' },
      h('div', null, poolLabel, pool, h('div', { class: 'muted small' }, 'Click to highlight, double-click to offer it.')),
      h('div', { class: 'duo-mid' },
        h('button', { type: 'button', class: 'b', onclick: () => add([...poolSel]) }, 'Add →'),
        h('button', { type: 'button', class: 'b', onclick: () => remove([...pickSel]) }, '← Remove')),
      h('div', null, pickedLabel, picked, h('div', { class: 'muted small' }, 'Double-click to take it back off.'))),
    h('div', { class: 'row' }, field('Player may take', limit), h('div', { class: 'grow self-end' }, summary)));

  renderPool(); renderPicked();
  return {
    el,
    count: () => chosen.length,
    value: () => ({
      choices: chosen.map((c) => ({ itemKey: c.key, rarity: c.rarity, plus: c.plus, set: c.set || null })),
      pick: Number(limit.value) || 1,
    }),
    reset() { chosen = []; poolSel.clear(); pickSel.clear(); renderPool(); renderPicked(); },
  };
}
