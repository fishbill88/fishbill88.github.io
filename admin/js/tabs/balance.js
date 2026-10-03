// Balance defaults: the game's developer sliders, published to every player.
// An EMPTY box means "no opinion, use the game's own default" — nothing is
// pre-filled with the shipped value, because a box set to exactly the default
// pins it against future game updates while an empty one does not.

import { get, post } from '../api.js';
import { h, card, act, btn, flash, note, badge, agoEl } from '../ui.js';

const fmt = (v) => String(Math.round(Number(v) * 1e6) / 1e6);

export async function render(root, ctx) {
  const bal = await get('/balance');
  const schema = bal.schema || [];
  const values = bal.values || {};
  const boxes = new Map();          // key -> { get(), clear() }

  const groups = [...new Set(schema.map((s) => s.group))];
  const count = Object.keys(values).length;
  const body = [];
  for (const g of groups) {
    body.push(h('div', { class: 'h-group' }, g));
    body.push(h('div', { class: 'bal' }, schema.filter((s) => s.group === g).map((s) => rowFor(s, values[s.key], boxes))));
  }

  const publish = act('Publish to all players', async () => {
    const out = {};
    for (const [k, b] of boxes) { const v = b.get(); if (v !== '') out[k] = Number(v); }
    const r = await post('/balance', { values: out });
    flash(`Published as rev ${r.rev} — ${Object.keys(out).length} setting${Object.keys(out).length === 1 ? '' : 's'} set, the rest on game defaults.`);
    ctx.refresh();
  }, 'primary');
  const clearAll = btn('Clear every box', () => { for (const b of boxes.values()) b.clear(); });
  const reset = act('Reset all to game defaults', async () => {
    if (!confirm('Reset every setting to the game’s own defaults for all players?')) return;
    const r = await post('/balance', { values: {} });
    flash(`Every setting is back on the game default (rev ${r.rev}).`);
    ctx.refresh();
  }, 'danger');

  root.append(card(
    h('span', null, 'Balance defaults ', count ? badge(`${count} set`, 'acc') : badge('all on game defaults')),
    h('span', { class: 'muted small' }, `rev ${bal.rev}`, bal.updatedUtc ? [' · changed ', agoEl(bal.updatedUtc)] : null),
    note('Applied when a player launches, and again on their next 60-second sync — so a change here reaches everyone already playing within the minute. Leave a box empty to hand that setting back to the game’s own default. Values outside a slider’s range are clamped by the game.'),
    ...body,
    h('div', { class: 'row', style: { marginTop: '1rem' } }, publish, clearAll, h('span', { class: 'grow' }), reset)));
}

function rowFor(s, val, boxes) {
  const isSet = val != null;
  const dot = h('span', { class: 'dot', title: `Overridden — the game default is ${fmt(s.def)}` }, isSet ? ' •' : '');
  const label = h('label', { title: `${s.label} — game default ${fmt(s.def)} (${fmt(s.min)}–${fmt(s.max)})` }, s.label, dot);
  const mark = (on) => { dot.textContent = on ? ' •' : ''; };

  if (s.kind === 'bool') {
    let state = isSet ? (Number(val) >= 0.5 ? '1' : '0') : '';
    const defOn = Number(s.def) >= 0.5;
    const cb = h('input', { type: 'checkbox', 'aria-label': s.label });
    const txt = h('span', { class: 'small muted' });
    const sync = () => {
      cb.checked = state === '' ? defOn : state === '1';
      txt.textContent = state === '' ? `game default (${defOn ? 'on' : 'off'})` : (state === '1' ? 'on' : 'off');
      mark(state !== '');
    };
    cb.addEventListener('change', () => { state = cb.checked ? '1' : '0'; sync(); });
    const x = h('button', { type: 'button', class: 'b xs', title: `Back to the game’s default (${defOn ? 'on' : 'off'})`, onclick: () => { state = ''; sync(); } }, '×');
    sync();
    boxes.set(s.key, { get: () => state, clear: () => { state = ''; sync(); } });
    return h('div', { class: 'bal-row' }, label, h('span', { class: 'check' }, cb, txt), h('span'), x);
  }

  const range = h('input', { type: 'range', min: s.min, max: s.max, step: s.step, 'aria-label': `${s.label} slider` });
  range.value = isSet ? val : s.def;
  const box = h('input', { type: 'number', min: s.min, max: s.max, step: s.step, placeholder: fmt(s.def), title: `Game default: ${fmt(s.def)}` });
  box.value = isSet ? fmt(val) : '';
  const paint = () => { box.classList.toggle('set', box.value !== ''); mark(box.value !== ''); };
  range.addEventListener('input', () => { box.value = range.value; paint(); });
  box.addEventListener('input', () => { if (box.value !== '') range.value = box.value; paint(); });
  const x = h('button', { type: 'button', class: 'b xs', title: `Back to the game’s default (${fmt(s.def)})`,
    onclick: () => { box.value = ''; range.value = s.def; paint(); box.focus(); } }, '×');
  paint();
  boxes.set(s.key, { get: () => box.value.trim(), clear: () => { box.value = ''; range.value = s.def; paint(); } });
  return h('div', { class: 'bal-row' }, label, range, box, x);
}
