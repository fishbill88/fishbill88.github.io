// Rewards: a letter sent by hand (one player or everyone, an item, a pet's
// shards, or a pick-N-of-M choice), and the automatic welcome / level / stage
// letters the server sends by itself.

import { get, post } from '../api.js';
import { h, card, table, td, n, badge, act, btn, flash, note, field, num, input, select, intOf, clear } from '../ui.js';
import { rules, itemPicker, itemStamp, choicePicker, rarityName, setName, petName, icon } from '../catalog.js';

export async function render(root, ctx) {
  const [R, { players }, auto] = await Promise.all([rules(), get('/players'), get('/autorewards')]);
  root.append(sendCard(R, players), ...autoCards(R, auto, ctx));
}

// ── by hand ─────────────────────────────────────────────────────────────────
function sendCard(R, players) {
  const live = players.filter((p) => !p.disabled);
  const to = select([['', '— choose who —'], ['*', `Everyone with an account (${live.length}, not disabled)`],
    { group: 'One player', items: [...players].sort((a, b) => a.username.localeCompare(b.username))
      .map((p) => [String(p.id), p.username + (p.displayName ? ` (${p.displayName})` : '') + (p.disabled ? ' — disabled' : '')]) }]);
  const stamp = itemStamp(R);
  const qty = num({ min: 1, max: 99, value: 1, class: 'w5' });
  const lot = num({ min: 1, value: 100, class: 'w6' });
  const fQty = field('Qty', qty, { hint: 'How many of that item the letter delivers. Consumables only — gear is always 1.' });
  const fLot = field('Shards', lot);
  const picker = itemPicker(R, {
    back: true, pets: true,
    onChange(kind, row) {
      stamp.sync(kind, row);
      fLot.hidden = kind !== 'pet';
      fQty.hidden = kind === 'pet' || kind === '';
      qty.disabled = !(row && row.slot === 'consumable');
      if (qty.disabled) qty.value = 1;
    },
  });
  const subject = input({ maxLength: 128, placeholder: 'A gift from the team', class: 'grow' });
  const body = input({ maxLength: 512, class: 'grow' });
  const gold = num({ min: 0, value: 0, class: 'w9' });
  const exp = num({ min: 0, value: 0, class: 'w9' });
  const sp = num({ min: 0, value: 0, class: 'w6' });
  const choice = choicePicker(R);

  const send = act('Send reward', async () => {
    if (!to.value) { flash('Choose who it goes to.', 'bad'); return; }
    if (!subject.value.trim()) { flash('Give the letter a subject.', 'bad'); return; }
    const b = { to: to.value, subject: subject.value.trim(), body: body.value, gold: intOf(gold), exp: intOf(exp), skillPoints: intOf(sp) };
    const kind = picker.kind();
    const what = [];
    if (choice.count()) {
      if (picker.itemKey() || picker.petId()) { flash('One letter carries one thing: clear the Item (category “— none —”) or the choice.', 'bad'); return; }
      const c = choice.value();
      if (choice.count() < 2) { flash('A choice offers at least 2 items.', 'bad'); return; }
      Object.assign(b, c);
      what.push(`a choice of ${c.pick} from ${c.choices.length} items`);
    } else if (kind === 'pet') {
      if (!picker.petId()) { flash('Choose a pet.', 'bad'); return; }
      b.petId = picker.petId(); b.shardLot = intOf(lot) || 1;
      what.push(`${n(b.shardLot)} ${petName(R.meta, b.petId)} shards`);
    } else if (picker.itemKey()) {
      Object.assign(b, { itemKey: picker.itemKey(), qty: intOf(qty) || 1 }, stamp.value());
      const row = picker.row();
      const ex = [b.rarity !== 'normal' ? rarityName(R.meta, b.rarity) : '', b.plus ? '+' + b.plus : '', b.set ? setName(R.meta, b.set) + ' set' : ''].filter(Boolean);
      what.push(`${b.qty > 1 ? b.qty + ' × ' : ''}${row ? row.name : b.itemKey}${ex.length ? ` (${ex.join(', ')})` : ''}`);
    }
    if (b.gold) what.push(`${n(b.gold)} gold`);
    if (b.exp) what.push(`${n(b.exp)} exp`);
    if (b.skillPoints) what.push(`${n(b.skillPoints)} skill points`);
    if (!what.length) { flash('An empty reward is refused — pick an item, a pet’s shards, a choice, or set a number above zero.', 'bad'); return; }
    const who = to.value === '*' ? `EVERY player (${live.length})` : to.options[to.selectedIndex].text;
    if (!confirm(`Send “${b.subject}” to ${who}?\n\nIt carries: ${what.join(', ')}.`)) return;
    const r = await post('/reward', b);
    flash(`Sent to ${n(r.sent)} player${r.sent === 1 ? '' : 's'}.`);
    // Cleared so a second click cannot quietly send the same letter again.
    picker.reset(); stamp.reset(); choice.reset();
    for (const el of [gold, exp, sp]) el.value = 0;
    qty.value = 1; lot.value = 100; subject.value = ''; body.value = '';
  }, 'primary');

  return card('Send a reward', null,
    note('Rewards arrive in the player’s in-game mailbox and are collected there. An item needs a free backpack slot; gold, exp and skill points do not. Anything above a plain Normal is rolled on the server — for Everyone, each player gets their own roll.'),
    h('div', { class: 'row' }, field('To', to, { cls: 'grow' }), field('Subject', subject, { cls: 'wide' })),
    h('div', { class: 'row' }, picker.el),
    h('div', { class: 'row' }, fQty, fLot, stamp.el),
    h('div', { class: 'row' }, field('Gold', gold), field('Exp', exp), field('Skill points', sp), field('Message (optional)', body, { cls: 'wide' })),
    h('details', { class: 'sub' }, h('summary', null, 'Or offer a choice (pick N of up to 8)'), h('div', { style: { marginTop: '0.6rem' } }, choice.el)),
    h('div', { class: 'row' }, send, h('span', { class: 'muted small' }, 'One letter carries one thing: an item, a pet’s shards, or a choice — plus any gold, exp and skill points.')));
}

// ── automatic ───────────────────────────────────────────────────────────────
const SECTIONS = [
  { key: 'welcome', title: 'Welcome gift', col: null, note: 'Sent once to every account registered after the gift was created. Existing players do not receive it.' },
  { key: 'level', title: 'Level rewards', col: 'Hero level', note: 'Sent once when the player’s hero reaches the level. Players already past it receive it at their next save.' },
  { key: 'stage', title: 'Stage rewards', col: 'Stage', note: 'Sent once when the player’s highest stage reaches the number. Players already past it receive it at their next save.' },
];

function describe(R, r) {
  const bits = [];
  if (r.itemKey) {
    let name = r.itemName || r.itemKey;
    const ex = [];
    if (r.rarity && r.rarity !== 'normal') ex.push(rarityName(R.meta, r.rarity));
    if (r.plus > 0) ex.push('+' + r.plus);
    if (r.set) ex.push(setName(R.meta, r.set) + ' set');
    if (ex.length) name += ` (${ex.join(', ')})`;
    if (r.qty > 1) name += ` ×${r.qty}`;
    bits.push(name);
  }
  if (r.gold > 0) bits.push(`${n(r.gold)} gold`);
  if (r.exp > 0) bits.push(`${n(r.exp)} exp`);
  if (r.skillPoints > 0) bits.push(`${r.skillPoints} skill point${r.skillPoints === 1 ? '' : 's'}`);
  return bits.length ? bits.join(' · ') : '(nothing)';
}

function autoCards(R, auto, ctx) {
  const form = autoForm(R, ctx);
  const cards = SECTIONS.map((sec) => {
    const rows = auto.rewards.filter((r) => r.trigger === sec.key);
    return card(sec.title, btn('Add', () => form.edit(null, sec.key), 'xs'),
      note(sec.note),
      rows.length ? table([...(sec.col ? ['>' + sec.col] : []), 'Subject', 'Carries', '>Sent', 'Status', ''], rows.map((r) => {
        const it = r.itemKey ? R.byKey.get(r.itemKey) : null;
        return h('tr', { class: r.active ? '' : 'dim' },
          sec.col ? td(h('strong', null, n(r.threshold)), 'num') : null,
          td([r.subject, r.body ? h('div', { class: 'muted small' }, r.body) : null]),
          td(h('div', { class: 'item-cell', style: { minWidth: '0' } }, it ? icon(it.icon, 24) : null, h('span', { class: 'small' }, describe(R, r)))),
          td(n(r.granted), 'num'),
          td(r.active ? badge('On', 'ok') : badge('Off')),
          h('td', { class: 'acts' },
            btn('Edit', () => form.edit(r), 'xs'),
            act(r.active ? 'Switch off' : 'Switch on', async () => {
              await post('/autorewards/active', { id: r.id, active: !r.active });
              flash(`“${r.subject}” switched ${r.active ? 'off' : 'on'}.`); ctx.refresh();
            }, 'xs'),
            r.granted === 0 ? act('Delete', async () => {
              if (!confirm(`Delete “${r.subject}”?`)) return;
              await post('/autorewards/delete', { id: r.id }); flash('Deleted.'); ctx.refresh();
            }, 'danger xs') : null));
      })) : h('div', { class: 'muted small' }, 'None yet.'));
  });
  return [...cards, form.el];
}

function autoForm(R, ctx) {
  let editing = null;
  const trigger = select([['welcome', 'Welcome gift (new players)'], ['level', 'Reaching a hero level'], ['stage', 'Reaching a stage']]);
  const threshold = num({ min: 1, class: 'w6' });
  const fTh = field('Hero level', threshold);
  const subject = input({ maxLength: 128, class: 'grow', placeholder: 'Leave blank for a default, e.g. “Level 50 reward”' });
  const body = input({ maxLength: 512, class: 'grow' });
  const stamp = itemStamp(R);
  const qty = num({ min: 1, max: 99, value: 1, class: 'w5' });
  const fQty = field('Qty', qty, { hint: 'Consumables only — gear is always 1' });
  const picker = itemPicker(R, {
    back: true, pets: false,
    onChange(kind, row) {
      stamp.sync(kind, row);
      fQty.hidden = !kind;
      qty.disabled = !(row && row.slot === 'consumable');
      if (qty.disabled) qty.value = 1;
    },
  });
  const gold = num({ min: 0, value: 0, class: 'w9' });
  const exp = num({ min: 0, value: 0, class: 'w9' });
  const sp = num({ min: 0, value: 0, class: 'w6' });
  const title = h('h2', null, 'Add a reward');
  const sentNote = note();
  const cancel = btn('Cancel', () => edit(null, trigger.value));
  const save = act('Add reward', async () => {
    const t = trigger.value;
    const th = intOf(threshold);
    if (t !== 'welcome' && !(th > 0)) { flash(`Give a ${t === 'stage' ? 'stage' : 'hero level'} above 0.`, 'bad'); return; }
    const subj = subject.value.trim() || (t === 'welcome' ? 'Welcome gift' : t === 'level' ? `Level ${th} reward` : `Stage ${th} reward`);
    const b = { id: editing ? editing.id : 0, trigger: t, threshold: t === 'welcome' ? null : th, subject: subj, body: body.value,
                itemKey: picker.itemKey() || null, qty: intOf(qty) || 1, gold: intOf(gold), exp: intOf(exp), skillPoints: intOf(sp), ...stamp.value() };
    if (!b.itemKey && !b.gold && !b.exp && !b.skillPoints) { flash('The letter carries nothing.', 'bad'); return; }
    await post('/autorewards/save', b);
    flash(editing ? `“${subj}” saved.` : `“${subj}” added.`);
    editing = null;
    ctx.refresh();
  }, 'primary');

  function syncTrigger() {
    const t = trigger.value;
    fTh.hidden = t === 'welcome';
    fTh.querySelector('.fl').textContent = t === 'stage' ? 'Stage' : 'Hero level';
  }
  trigger.addEventListener('change', syncTrigger);

  function edit(r, newTrigger) {
    editing = r;
    title.textContent = r ? `Edit “${r.subject}”` : 'Add a reward';
    save.textContent = r ? 'Save changes' : 'Add reward';
    cancel.hidden = !r;
    clear(sentNote);
    if (r) sentNote.append(`Changes apply to letters sent from now on. The ${n(r.granted)} letter${r.granted === 1 ? '' : 's'} already sent keep what they carried.`);
    sentNote.hidden = !r;
    trigger.value = r ? r.trigger : (newTrigger || 'welcome');
    threshold.value = r && r.threshold != null ? r.threshold : '';
    subject.value = r ? r.subject : '';
    body.value = r && r.body ? r.body : '';
    if (r && r.itemKey) picker.set(r.itemKey); else picker.reset();
    stamp.set(r || {});
    if (r && r.itemKey) stamp.sync(picker.kind(), picker.row());
    qty.value = r ? r.qty || 1 : 1;
    gold.value = r ? r.gold || 0 : 0;
    exp.value = r ? r.exp || 0 : 0;
    sp.value = r ? r.skillPoints || 0 : 0;
    syncTrigger();
    if (r || newTrigger) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const el = h('section', { class: 'card', id: 'rewardForm' },
    h('header', { class: 'card-h' }, title),
    h('div', { class: 'card-b' },
      sentNote,
      h('div', { class: 'row' }, field('Reward for', trigger), fTh, field('Subject', subject, { cls: 'wide' })),
      h('div', { class: 'row' }, field('Message (optional)', body, { cls: 'wide' })),
      h('div', { class: 'row' }, picker.el),
      h('div', { class: 'row' }, fQty, stamp.el),
      note('Anything above a plain Normal is rolled separately for each player when it comes due.'),
      h('div', { class: 'row' }, field('Gold', gold), field('Exp', exp), field('Skill points', sp)),
      h('div', { class: 'row' }, save, cancel),
      note('One letter carries one item. To give several items for the same milestone, add one reward per item at the same level or stage.')));
  edit(null);
  return { el, edit };
}
