// hud.js — the DOM overlay: health, armour, ammunition, money, the round
// timer and team score, the kill feed, the buy menu, the centre banner
// and a live minimap. It only reads state; purchases go through round.js.
import { TEAMS, WEAPONS, BUY_MENU } from './config.js';
import { MAP } from './map.js';
import { buyItem } from './round.js';

const el = {};
let lastHits = 0;
let lastHp = 100;

export function initHud() {
  for (const id of ['health', 'armour', 'ammo', 'money', 'timer', 'score', 'roundLabel',
    'feed', 'banner', 'hitmarker', 'hurt', 'buyMenu', 'buyItems', 'minimap',
    'menu', 'over', 'crosshair', 'plantHint', 'phaseLabel']) {
    el[id] = document.getElementById(id);
  }
  el.buyItems.innerHTML = BUY_MENU.map((m) => {
    const price = m.kind === 'weapon' ? WEAPONS[m.id].price : m.price;
    return `<div class="buyrow" id="buy-${m.id}"><span class="buykey">${m.key}</span> ${m.label} <span class="buyprice">$${price}</span></div>`;
  }).join('');
}

// Number keys while the buy menu is open; returns true when consumed.
export function handleBuyKey(state, code) {
  if (!state.buyOpen || state.phase !== 'buy') return false;
  const entry = BUY_MENU.find((m) => `Digit${m.key}` === code);
  if (!entry) return false;
  buyItem(state, state.player, entry);
  return true;
}

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
}

export function updateHud(state) {
  const p = state.player;
  if (!p) return;
  const gun = p.loadout.guns[p.loadout.current];
  el.health.textContent = Math.max(0, Math.ceil(p.hp));
  el.armour.textContent = p.loadout.armour ? `🛡 ${Math.ceil(p.loadout.armourHp ?? 100)}` : '';
  el.ammo.textContent = `${gun.mag} / ${gun.reserve}`;
  el.money.textContent = `$${p.money}`;
  const planted = state.bomb.state === 'planted';
  el.timer.textContent = planted ? fmtTime(state.bomb.fuse) : fmtTime(state.phaseT);
  el.timer.style.color = planted ? '#ff4444' : '';
  el.score.innerHTML =
    `<span style="color:${TEAMS.atk.ui}">${TEAMS.atk.name} ${state.score.atk}</span>` +
    ` — ` +
    `<span style="color:${TEAMS.def.ui}">${state.score.def} ${TEAMS.def.name}</span>`;
  el.roundLabel.textContent = `ROUND ${state.round} · ${state.half === 1 ? 'FIRST' : 'SECOND'} HALF`;
  el.phaseLabel.textContent = state.phase === 'buy' ? 'BUY PHASE — press B' : state.phase === 'live' ? '' : '';
  el.feed.innerHTML = state.feed
    .filter((f) => state.time - f.at < 5)
    .map((f) => `<div>${f.text}</div>`).join('');
  el.banner.textContent = state.time < state.messageUntil ? state.message : '';
  el.banner.style.opacity = state.time < state.messageUntil ? '1' : '0';
  // Hitmarker when the player's hit count rises; hurt flash when hp falls.
  if (state.roundStats.hits > lastHits) {
    lastHits = state.roundStats.hits;
    el.hitmarker.style.opacity = '1';
    setTimeout(() => { el.hitmarker.style.opacity = '0'; }, 90);
  }
  if (p.hp < lastHp) {
    el.hurt.style.opacity = '0.55';
    setTimeout(() => { el.hurt.style.opacity = '0'; }, 130);
  }
  lastHp = p.hp;
  // Context hint for the charge.
  let hint = '';
  if (state.phase === 'live' && p.alive) {
    if (p.team === 'atk' && state.bomb.carrier === p.id) hint = 'You carry the CHARGE — hold E on a site to plant';
    else if (p.team === 'def' && state.bomb.state === 'planted') hint = 'CHARGE PLANTED — hold E at the charge to defuse';
    else if (p.team === 'atk' && state.bomb.state === 'dropped') hint = 'The CHARGE is down — pick it up';
  }
  el.plantHint.textContent = hint;
  el.buyMenu.style.display = state.buyOpen && state.phase === 'buy' ? 'block' : 'none';
  if (el.buyMenu.style.display === 'block') {
    for (const m of BUY_MENU) {
      const row = document.getElementById(`buy-${m.id}`);
      if (!row) continue;
      const owned = (m.kind === 'weapon' && p.loadout[WEAPONS[m.id].slot] === m.id)
        || (m.kind === 'armour' && p.loadout.armour)
        || (m.kind === 'grenade' && p.loadout.grenades[m.id] > 0);
      row.style.opacity = owned ? '0.45' : '1';
    }
  }
  el.crosshair.style.display = p.alive && !p.loadout.scoped ? 'block' : 'none';
  el.over.style.display = state.phase === 'over' ? 'flex' : 'none';
  if (state.phase === 'over') {
    el.over.innerHTML = `<div class="overtitle">${TEAMS[state.winner].name} WIN THE MATCH</div>` +
      `<div>Final score ${state.score.atk} — ${state.score.def} · your K/D ${p.kills}/${p.deaths}</div>` +
      `<div class="overhint">Press R to play again</div>`;
  }
  drawMinimap(state);
}

// A top-down read of the map: walls, sites, team-mates and the charge.
function drawMinimap(state) {
  const cv = el.minimap;
  if (!cv) return;
  const g = cv.getContext('2d');
  const sx = cv.width / 94;
  const sz = cv.height / 74;
  const px = (x) => (x + 47) * sx;
  const pz = (z) => (z + 37) * sz;
  g.fillStyle = '#11161d';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#2c3644';
  for (const b of MAP.boxes) g.fillRect(px(b.minX), pz(b.minZ), b.w * sx, b.d * sz);
  for (const s of Object.values(MAP.sites)) {
    g.fillStyle = s.id === 'A' ? 'rgba(255,176,46,.5)' : 'rgba(46,255,168,.5)';
    g.fillRect(px(s.minX), pz(s.minZ), (s.maxX - s.minX) * sx, (s.maxZ - s.minZ) * sz);
    g.fillStyle = '#0b0e13';
    g.font = 'bold 10px monospace';
    g.fillText(s.id, px(s.x) - 3, pz(s.z) + 3);
  }
  for (const a of state.actors) {
    if (!a.alive) continue;
    if (a.team !== state.player.team && !a.isPlayer) continue;
    g.fillStyle = a.isPlayer ? '#ffffff' : TEAMS[a.team].ui;
    g.beginPath();
    g.arc(px(a.x), pz(a.z), a.isPlayer ? 3.4 : 2.6, 0, 7);
    g.fill();
  }
  const b = state.bomb;
  if (b.state === 'planted' || (b.state === 'dropped' && state.player.team === 'atk')) {
    g.fillStyle = Math.sin(state.time * 6) > 0 ? '#ff3333' : '#771111';
    g.fillRect(px(b.x) - 3, pz(b.z) - 3, 6, 6);
  }
}
