// Sign-in, the tab bar and the hash router. Each tab is a module exporting
// render(root, ctx); it fetches what it needs and draws into root.

import { BASE, IS_PROD, signedIn, login, logout, whenSignedOut } from './api.js';
import { h, clear, errorBox, flash } from './ui.js';
import { forgetRules } from './catalog.js';

const TABS = [
  ['overview', 'Overview'], ['players', 'Players'], ['shop', 'Shop'], ['rewards', 'Rewards'],
  ['balance', 'Balance'], ['ranking', 'Ranking'], ['towerwb', 'Tower & World boss'], ['stall', 'Stall'],
  ['audits', 'Audits'], ['crashes', 'Crashes'], ['server', 'Server'], ['log', 'Log'],
];
const loaders = {
  overview: () => import('./tabs/overview.js'), players: () => import('./tabs/players.js'),
  shop: () => import('./tabs/shop.js'), rewards: () => import('./tabs/rewards.js'),
  balance: () => import('./tabs/balance.js'), ranking: () => import('./tabs/ranking.js'),
  towerwb: () => import('./tabs/towerwb.js'), stall: () => import('./tabs/stall.js'),
  audits: () => import('./tabs/audits.js'), crashes: () => import('./tabs/crashes.js'),
  server: () => import('./tabs/server.js'), log: () => import('./tabs/log.js'),
};

const $ = (id) => document.getElementById(id);
let renderSeq = 0;

function current() {
  const t = location.hash.replace(/^#/, '').split('/')[0];
  return loaders[t] ? t : 'overview';
}

async function show(soft = false) {
  if (!signedIn()) return showSignin();
  $('signin').hidden = true;
  $('app').hidden = false;
  const tab = current();
  for (const a of $('tabs').querySelectorAll('a')) a.toggleAttribute('aria-current', a.dataset.tab === tab);
  const name = (TABS.find((t) => t[0] === tab) || [])[1];
  document.title = `${name} · TTF Admin`;
  const view = $('view');
  const seq = ++renderSeq;
  if (!soft) clear(view).append(h('div', { class: 'loading' }, 'Loading…'));
  const y = window.scrollY;
  try {
    const mod = await loaders[tab]();
    const root = h('div', { class: 'tab' });
    const ctx = { refresh: () => { if (seq === renderSeq) return show(true); } };
    await mod.render(root, ctx);
    if (seq !== renderSeq) return;
    clear(view).append(root);
    window.scrollTo(0, soft ? y : 0);
  } catch (e) {
    if (seq !== renderSeq) return;
    if (!signedIn()) return showSignin();
    if (soft) { flash(e.message, 'bad'); return; }
    clear(view).append(errorBox(e));
    console.warn('[admin]', tab, e);
  }
}

function showSignin(msg) {
  $('app').hidden = true;
  $('signin').hidden = false;
  const m = $('signinMsg');
  m.hidden = !msg;
  if (msg) m.textContent = msg;
  $('pw').value = '';
  $('pw').focus();
}

function boot() {
  $('apiNote').textContent = IS_PROD ? '' : `Server: ${BASE}`;
  if (!IS_PROD) { $('apiBadge').hidden = false; $('apiBadge').textContent = `API: ${BASE}`; }
  const nav = $('tabs');
  for (const [id, label] of TABS) nav.append(h('a', { href: `#${id}`, dataset: { tab: id } }, label));

  $('signinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = $('signinBtn');
    b.disabled = true;
    $('signinMsg').hidden = true;
    try {
      await login($('pw').value);
      $('pw').value = '';
      forgetRules();
      show();
    } catch (err) {
      $('pw').value = '';
      showSignin(err.message);
    } finally { b.disabled = false; }
  });
  $('signoutBtn').addEventListener('click', async () => { await logout(); forgetRules(); showSignin(); });
  $('reloadBtn').addEventListener('click', () => { forgetRules(); show(); });
  whenSignedOut(() => { forgetRules(); showSignin('Your admin session has ended. Sign in again.'); });
  window.addEventListener('hashchange', () => { $('flash').hidden = true; show(); });
  show();
}

window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && e.reason.message) flash(e.reason.message, 'bad');
});
boot();
