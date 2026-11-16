// round.js — the match director and the fixed-step simulation. Owns the
// round flow (buy, live, end, match over), the economy, bot purchases,
// death bookkeeping and win checks. simulate() is the only function the
// main loop calls; it advances everything by exactly dt.
import { RULES, TEAMS, WEAPONS, BUY_MENU } from './config.js';
import { MAP } from './map.js';
import { makeLoadout, giveWeapon, updateWeapons, updateProjectiles } from './weapons.js';
import { makeBrain, assignPlans, updateBot, botIntent, BOT_NAMES } from './bots.js';
import { resetBomb, dropBomb, tryPickup, updateBomb } from './bomb.js';
import { updatePlayer } from './player.js';
import { aliveActors, banner, pushFeed } from './state.js';
import { sfx } from './audio.js';

let nextId = 1;

function makeActor(team, isPlayer, name, spawn) {
  return {
    id: nextId++, team, isPlayer, name,
    alive: true, hp: 100, x: spawn.x, y: 0, z: spawn.z,
    // Attackers spawn facing the lanes to the north-east, defenders
    // facing the mid they must cross to reach the sites.
    vx: 0, vz: 0, yaw: team === 'atk' ? 2.35 : -0.8, pitch: 0,
    crouch: false, loadout: makeLoadout(), money: RULES.startMoney,
    kills: 0, deaths: 0, blindUntil: 0,
    lastAttacker: null, lastHitHead: false, lastHitAt: -9,
    brain: isPlayer ? null : makeBrain(team, 0),
  };
}

// Build the ten combatants and start round 1. The player attacks first.
export function setupMatch(state) {
  nextId = 1;
  state.actors = [];
  const atkSpawns = MAP.spawns.atk;
  const defSpawns = MAP.spawns.def;
  const player = makeActor('atk', true, 'YOU', atkSpawns[0]);
  state.player = player;
  state.actors.push(player);
  BOT_NAMES.atk.forEach((name, i) => {
    const bot = makeActor('atk', false, name, atkSpawns[i + 1]);
    bot.brain = makeBrain('atk', i + 1);
    state.actors.push(bot);
  });
  BOT_NAMES.def.forEach((name, i) => {
    const bot = makeActor('def', false, name, defSpawns[i]);
    bot.brain = makeBrain('def', i);
    state.actors.push(bot);
  });
  // The fifth defender fills the last spawn slot.
  const extra = makeActor('def', false, 'WARDEN', defSpawns[4]);
  extra.brain = makeBrain('def', 4);
  state.actors.push(extra);
  startRound(state, true);
}

function startRound(state, fresh = false) {
  if (!fresh && state.round > RULES.roundsPerHalf && state.half === 1) swapSides(state);
  for (const team of ['atk', 'def']) {
    const list = state.actors.filter((a) => a.team === team);
    list.forEach((a, i) => {
      const spawn = MAP.spawns[team][i % MAP.spawns[team].length];
      a.x = spawn.x;
      a.z = spawn.z;
      a.vx = 0;
      a.vz = 0;
      a.hp = 100;
      a.alive = true;
      a.crouch = false;
      a.blindUntil = 0;
      a.lastAttacker = null;
      if (!a.keptLoadout) a.loadout = makeLoadout();
      a.keptLoadout = false;
      if (a.brain) { a.brain.seenId = null; a.brain.goal = null; a.brain.path = []; }
    });
  }
  // The charge goes to a random attacker; the player can carry it too.
  const attackers = state.actors.filter((a) => a.team === 'atk');
  const carrier = attackers[Math.floor(Math.random() * attackers.length)];
  resetBomb(state, carrier.id);
  state.phase = 'buy';
  state.phaseT = RULES.buySeconds;
  state.buyOpen = true;
  state.roundStats = { shots: 0, hits: 0 };
  assignPlans(state);
  for (const a of state.actors) if (!a.isPlayer) botBuy(state, a);
  banner(state, `ROUND ${state.round} — ${TEAMS[state.player.team].name} ${state.player.team === 'atk' ? 'TO PLANT' : 'TO DEFEND'}`, 3);
}

// Halftime: squads swap sides, money and loadouts reset, scores follow
// the squads (the recorded score swaps sides with them).
function swapSides(state) {
  state.half = 2;
  for (const a of state.actors) {
    a.team = a.team === 'atk' ? 'def' : 'atk';
    a.money = RULES.startMoney;
    a.loadout = makeLoadout();
    if (a.brain) a.brain = makeBrain(a.team, a.brain.index);
  }
  const s = state.score.atk;
  state.score.atk = state.score.def;
  state.score.def = s;
  banner(state, 'HALFTIME — SIDES SWAP', 3);
}

// What a bot buys with its money at the start of a round: a rifle when it
// can, a vest, grenades with what is left; it keeps a reserve for rifles.
export function botBuy(state, bot) {
  if (!bot.loadout.primary && bot.money >= WEAPONS.rk9.price) {
    bot.money -= WEAPONS.rk9.price;
    giveWeapon(bot, 'rk9');
  } else if (!bot.loadout.primary && bot.money >= WEAPONS.vz6.price + 900) {
    bot.money -= WEAPONS.vz6.price;
    giveWeapon(bot, 'vz6');
  }
  if (!bot.loadout.armour && bot.money >= 650) {
    bot.money -= 650;
    bot.loadout.armour = true;
    bot.loadout.armourHp = 100;
  }
  const nadeChance = { frag: 0.55, smoke: 0.4, flash: 0.4 };
  for (const [kind, chance] of Object.entries(nadeChance)) {
    const price = BUY_MENU.find((m) => m.id === kind).price;
    if (bot.loadout.grenades[kind] === 0 && bot.money >= price + 400 && Math.random() < chance) {
      bot.money -= price;
      bot.loadout.grenades[kind] = 1;
    }
  }
}

// The player's purchase from the buy menu; returns true on success.
export function buyItem(state, actor, entry) {
  if (state.phase !== 'buy') return false;
  if (entry.kind === 'weapon') {
    const w = WEAPONS[entry.id];
    if (actor.money < w.price || actor.loadout[w.slot] === entry.id) { sfx.denied(); return false; }
    actor.money -= w.price;
    giveWeapon(actor, entry.id);
  } else if (entry.kind === 'armour') {
    if (actor.money < entry.price || actor.loadout.armour) { sfx.denied(); return false; }
    actor.money -= entry.price;
    actor.loadout.armour = true;
    actor.loadout.armourHp = 100;
  } else if (entry.kind === 'grenade') {
    if (actor.money < entry.price || actor.loadout.grenades[entry.id] >= 1) { sfx.denied(); return false; }
    actor.money -= entry.price;
    actor.loadout.grenades[entry.id] += 1;
  }
  sfx.buy();
  return true;
}

function endRound(state, winnerTeam, reason) {
  state.phase = 'end';
  state.phaseT = RULES.endSeconds;
  state.endReason = reason;
  state.score[winnerTeam] += 1;
  const objective = reason.includes('CHARGE');
  for (const a of state.actors) {
    if (a.team === winnerTeam) {
      a.money += objective ? RULES.rewardWinObjective : RULES.rewardWinElim;
    } else {
      a.money += RULES.rewardLoss;
    }
    a.money = Math.min(RULES.maxMoney, a.money);
    if (a.alive) a.keptLoadout = true;
  }
  const mine = state.player.team === winnerTeam;
  banner(state, `${TEAMS[winnerTeam].name} TAKE THE ROUND — ${reason}`, RULES.endSeconds - 0.4);
  if (mine) sfx.roundWin(); else sfx.roundLose();
}

// Deaths are finalised here so the feed, the rewards and the dropped
// charge all happen exactly once.
function finalizeDeaths(state) {
  for (const a of state.actors) {
    if (!a.alive || a.hp > 0) continue;
    a.alive = false;
    a.diedAt = state.time;
    a.deaths += 1;
    const killer = state.actors.find((k) => k.id === a.lastAttacker);
    if (killer && killer !== a) {
      killer.kills += 1;
      killer.money = Math.min(RULES.maxMoney, killer.money + RULES.rewardKill);
      pushFeed(state, `${killer.name} ▸ ${a.name}${a.lastHitHead ? ' (HEADSHOT)' : ''}`);
      if (killer.isPlayer) sfx.kill();
    } else {
      pushFeed(state, `${a.name} WAS CAUGHT IN THE BLAST`);
    }
    if (state.bomb.carrier === a.id && state.bomb.state === 'carried') {
      dropBomb(state, a.x, a.z);
      pushFeed(state, 'THE CHARGE IS DOWN');
    }
  }
}

function checkRoundEnd(state) {
  if (state.phase !== 'live') return;
  const atkAlive = aliveActors(state, 'atk').length;
  const defAlive = aliveActors(state, 'def').length;
  const planted = state.bomb.state === 'planted' || state.bomb.state === 'done';
  if (defAlive === 0) return endRound(state, 'atk', 'SENTINEL ELIMINATED');
  if (atkAlive === 0 && !planted) return endRound(state, 'def', 'VANGUARD ELIMINATED');
  if (atkAlive === 0 && planted) {
    // The charge decides it now: defenders must still defuse in time.
    if (state.bomb.state === 'done') return; // bomb module reports the event
  }
}

// The fixed-step simulation: one call advances the whole match by dt.
export function simulate(state, dt, input) {
  state.time += dt;
  state.shotFx = [];
  const intent = new Map();
  if (state.phase === 'buy') {
    state.phaseT -= dt;
    if (input) updatePlayer(state, dt, input, intent); // look and walk only
    if (state.phaseT <= 0) {
      state.phase = 'live';
      state.phaseT = RULES.roundSeconds;
      state.buyOpen = false;
      banner(state, 'ROUND LIVE', 1.4);
    }
    return;
  }
  if (state.phase === 'end') {
    state.phaseT -= dt;
    updateWeapons(state, dt);
    if (state.phaseT <= 0) {
      const top = Math.max(state.score.atk, state.score.def);
      const played = state.score.atk + state.score.def;
      if (top >= RULES.roundsToWin || played >= RULES.roundsPerHalf * 2) {
        state.phase = 'over';
        state.winner = state.score.atk > state.score.def ? 'atk' : 'def';
        banner(state, `${TEAMS[state.winner].name} WIN THE MATCH`, 9999);
      } else {
        state.round += 1;
        startRound(state);
      }
    }
    return;
  }
  if (state.phase !== 'live') return;

  // Live play.
  if (state.bomb.state !== 'planted') state.phaseT -= dt;
  if (input) updatePlayer(state, dt, input, intent);
  for (const a of state.actors) {
    if (!a.isPlayer && a.alive) botIntent(state, a, intent);
  }
  const event = updateBomb(state, dt, intent);
  if (event === 'exploded') return endRound(state, 'atk', 'CHARGE DETONATED');
  if (event === 'defused') return endRound(state, 'def', 'CHARGE DEFUSED');
  for (const a of state.actors) {
    if (!a.isPlayer) updateBot(state, a, dt);
  }
  for (const a of state.actors) {
    if (a.team === 'atk') tryPickup(state, a);
  }
  updateWeapons(state, dt);
  updateProjectiles(state, dt);
  finalizeDeaths(state);
  if (state.bomb.state === 'planted' && aliveActors(state, 'atk').length === 0
      && aliveActors(state, 'def').length === 0) {
    return endRound(state, 'atk', 'CHARGE DETONATED');
  }
  checkRoundEnd(state);
  if (state.phase === 'live' && state.phaseT <= 0 && state.bomb.state !== 'planted') {
    endRound(state, 'def', 'TIME EXPIRED');
  }
  // Shots age out of hearing range quickly.
  state.shots = state.shots.filter((s) => state.time - s.at < 0.6);
}
