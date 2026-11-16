// bots.js — the bot brains. Each bot perceives the world the way the
// player must: a vision cone with line-of-sight and smoke checks, hearing
// for nearby gunfire, and a memory of where it last saw an enemy. Teams
// play a plan each round — attackers pick a site and execute with the
// charge, defenders hold both sites and rotate on information — and a bot
// in a fight stops to shoot in bursts, because moving fire is wild fire.
import { WEAPONS, PHYS } from './config.js';
import { siteAt } from './map.js';
import { moveCircle, sightBlocked } from './collide.js';
import { pathTo, nodeById, HOLDS } from './nav.js';
import { tryFire, startReload, throwGrenade, smokeBlocks, wrapAngle } from './weapons.js';
import { actorById } from './state.js';

export const BOT_NAMES = {
  atk: ['RAZE', 'VOLT', 'ONYX', 'PIKE'],
  def: ['HAVOC', 'SABLE', 'IRIS', 'TALON'],
};

export function makeBrain(team, index) {
  return {
    skill: 0.85 + Math.random() * 0.4,       // aim and reaction multiplier
    plan: null, role: 'entry', site: 'A',
    path: [], pathI: 0, goal: null,
    seenId: null, seenAt: -9, seenX: 0, seenZ: 0,
    thinkAt: Math.random() * 0.1, reactAt: 0,
    burstLeft: 0, pauseUntil: 0, aimAt: 0,
    strafeDir: 1, strafeUntil: 0,
    investigateX: null, investigateZ: null,
    index,
  };
}

// Round plans, assigned once per round by round.js. Attackers commit to a
// site (the carrier goes to plant, two enter with it, one lurks mid, one
// watches the flank); defenders split 2-1-2 across A, mid and B.
export function assignPlans(state) {
  const atk = state.actors.filter((a) => a.team === 'atk' && !a.isPlayer);
  const def = state.actors.filter((a) => a.team === 'def' && !a.isPlayer);
  const site = state.round % 3 === 0 ? 'B' : (Math.random() < 0.55 ? 'A' : 'B');
  atk.forEach((bot, i) => {
    const br = bot.brain;
    br.site = site;
    br.role = state.bomb.carrier === bot.id ? 'carrier'
      : i === 0 ? 'entry' : i === 1 ? 'entry' : i === 2 ? 'lurk' : 'flank';
    br.goal = null;
    br.path = [];
  });
  const playerAtk = state.player && state.player.team === 'atk';
  if (playerAtk && state.bomb.carrier === state.player.id) {
    // The human carries: bots still execute on the round's called site.
    for (const bot of atk) if (bot.brain.role === 'carrier') bot.brain.role = 'entry';
  }
  const defRoles = ['A', 'A', 'mid', 'B', 'B'];
  def.forEach((bot, i) => {
    const br = bot.brain;
    br.site = defRoles[(i + (state.round % 2)) % defRoles.length];
    br.role = 'hold';
    br.goal = null;
    br.path = [];
  });
  state.teamPlan = { site };
}

// What a bot wants to do with its hands this step: plant or defuse.
export function botIntent(state, bot, intent) {
  const br = bot.brain;
  if (bot.team === 'atk' && state.bomb.carrier === bot.id && state.phase === 'live') {
    const site = siteAt(bot.x, bot.z);
    if (site && !visibleEnemy(state, bot)) intent.set(bot.id, 'plant');
  }
  if (bot.team === 'def' && state.bomb.state === 'planted') {
    const d = Math.hypot(bot.x - state.bomb.x, bot.z - state.bomb.z);
    if (d < 1.5 && !visibleEnemy(state, bot)) intent.set(bot.id, 'defuse');
  }
  return br;
}

function visibleEnemy(state, bot) {
  const br = bot.brain;
  return br.seenId !== null && state.time - br.seenAt < 0.25;
}

// Perception: vision cone + line of sight + smoke, hearing for shots.
// Runs on a stagger so ten bots never all think on the same step.
function perceive(state, bot, dt) {
  const br = bot.brain;
  br.thinkAt -= dt;
  if (br.thinkAt > 0) return;
  br.thinkAt = 0.09 + Math.random() * 0.05;
  if ((bot.blindUntil || 0) > state.time) { br.seenId = null; return; }
  let best = null;
  let bestD = Infinity;
  for (const e of state.actors) {
    if (!e.alive || e.team === bot.team) continue;
    const dx = e.x - bot.x;
    const dz = e.z - bot.z;
    const d = Math.hypot(dx, dz);
    if (d > 68) continue;
    const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - bot.yaw));
    if (ang > 1.0 && d > 3.2) continue; // outside the vision cone
    const minH = e.crouch ? 1.0 : 1.7;
    if (sightBlocked(bot.x, bot.z, e.x, e.z, minH)) continue;
    if (smokeBlocks(bot.x, bot.z, e.x, e.z, state)) continue;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) {
    if (br.seenId !== best.id) br.reactAt = state.time + 0.3 / br.skill;
    br.seenId = best.id;
    br.seenAt = state.time;
    br.seenX = best.x;
    br.seenZ = best.z;
  } else if (state.time - br.seenAt > 2.5) {
    br.seenId = null;
  }
  // Hearing: a recent shot nearby becomes a place to look at.
  for (const s of state.shots) {
    if (s.team === bot.team || state.time - s.at > 0.5) continue;
    if (Math.hypot(s.x - bot.x, s.z - bot.z) < 27) {
      br.investigateX = s.x;
      br.investigateZ = s.z;
    }
  }
}

// Steer the bot toward a point; returns true on arrival. Speed is the
// walk, or a sprint while no enemy has been seen for a while.
function moveToward(state, bot, tx, tz, dt, sprint = false) {
  const dx = tx - bot.x;
  const dz = tz - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.55) { bot.vx = 0; bot.vz = 0; return true; }
  const sp = sprint ? PHYS.sprintSpeed : PHYS.walkSpeed;
  const vx = (dx / d) * sp;
  const vz = (dz / d) * sp;
  bot.yaw = Math.atan2(vx, vz);
  const moved = moveCircle(bot.x, bot.z, vx * dt, vz * dt, PHYS.radius);
  // Simple separation so bots do not stack into one body.
  for (const o of state.actors) {
    if (o === bot || !o.alive) continue;
    const ox = moved.x - o.x;
    const oz = moved.z - o.z;
    const od = Math.hypot(ox, oz);
    if (od > 0.01 && od < 0.85) {
      moved.x += (ox / od) * (0.85 - od) * 0.5;
      moved.z += (oz / od) * (0.85 - od) * 0.5;
    }
  }
  bot.vx = (moved.x - bot.x) / dt;
  bot.vz = (moved.z - bot.z) / dt;
  bot.x = moved.x;
  bot.z = moved.z;
  return false;
}

function followPath(state, bot, dt, sprint) {
  const br = bot.brain;
  if (br.pathI >= br.path.length) return true;
  const p = br.path[br.pathI];
  if (moveToward(state, bot, p.x, p.z, dt, sprint)) br.pathI += 1;
  return br.pathI >= br.path.length;
}

function goTo(state, bot, nodeId, dt, sprint = false) {
  const br = bot.brain;
  if (br.goal !== nodeId) {
    br.goal = nodeId;
    br.path = pathTo(bot.x, bot.z, nodeId);
    br.pathI = 0;
  }
  return followPath(state, bot, dt, sprint);
}

// Combat: face the remembered enemy, settle the aim, fire in bursts.
function fight(state, bot, dt) {
  const br = bot.brain;
  const enemy = actorById(state, br.seenId);
  if (!enemy || !enemy.alive) { br.seenId = null; return false; }
  // A memory older than a glimpse is a direction, not a target: give it
  // up and go back to the plan instead of aiming at a wall forever.
  if (state.time - br.seenAt > 1.2) { br.seenId = null; return false; }
  const fresh = state.time - br.seenAt < 0.3;
  const tx = fresh ? enemy.x : br.seenX;
  const tz = fresh ? enemy.z : br.seenZ;
  bot.yaw = Math.atan2(tx - bot.x, tz - bot.z);
  const dist = Math.hypot(tx - bot.x, tz - bot.z);
  // Too far to hit reliably: close the distance first.
  if (fresh && dist > 26) {
    moveToward(state, bot, tx, tz, dt, false);
    return true;
  }
  // Strafe between bursts, stand still during them: accuracy is modelled
  // from speed, so the bots obey the same rule as the player.
  bot.vx = 0;
  bot.vz = 0;
  if (state.time > br.pauseUntil && br.burstLeft <= 0) {
    br.burstLeft = 3 + (Math.random() * 3 | 0);
    br.aimAt = state.time;
  }
  if (br.burstLeft > 0 && state.time >= br.reactAt && fresh) {
    const aimTime = state.time - br.aimAt;
    const err = Math.max(0.004, (0.04 / br.skill) * Math.exp(-aimTime * 2.6));
    const ex = (Math.random() * 2 - 1) * err * dist;
    const ez = (Math.random() * 2 - 1) * err * dist;
    const aimY = (enemy.crouch ? 1.0 : 1.3) + (Math.random() < 0.22 ? 0.25 : 0);
    const dx = tx + ex - bot.x;
    const dz = tz + ez - bot.z;
    const dy = aimY - (bot.y + (bot.crouch ? PHYS.crouchEye : PHYS.standEye));
    const l = Math.hypot(dx, dy, dz) || 1;
    const report = tryFire(state, bot, dx / l, dy / l, dz / l);
    if (report) {
      (state.shotFx ??= []).push(report);
      br.burstLeft -= 1;
      if (br.burstLeft <= 0) br.pauseUntil = state.time + 0.35 + Math.random() * 0.4;
    } else if (bot.loadout.guns[bot.loadout.current].mag === 0) {
      startReload(state, bot);
      br.pauseUntil = state.time + 0.5;
    }
  } else if (state.time > br.strafeUntil && dist > 6) {
    br.strafeDir = Math.random() < 0.5 ? -1 : 1;
    br.strafeUntil = state.time + 0.5 + Math.random() * 0.5;
    const px = Math.cos(bot.yaw) * br.strafeDir;
    const pz = -Math.sin(bot.yaw) * br.strafeDir;
    const moved = moveCircle(bot.x, bot.z, px * 1.6 * dt, pz * 1.6 * dt, PHYS.radius);
    bot.x = moved.x;
    bot.z = moved.z;
  }
  // A frag for an enemy remembered behind cover, when the bot carries one.
  if (!fresh && state.time - br.seenAt > 0.8 && bot.loadout.grenades.frag > 0 && Math.random() < dt * 0.25) {
    const dx = br.seenX - bot.x;
    const dz = br.seenZ - bot.z;
    const l = Math.hypot(dx, dz) || 1;
    throwGrenade(state, bot, 'frag', dx / l, 0.25, dz / l);
  }
  return true;
}

// The per-step driver for one bot during the live phase.
export function updateBot(state, bot, dt) {
  const br = bot.brain;
  if (!bot.alive) return;
  perceive(state, bot, dt);
  const blind = (bot.blindUntil || 0) > state.time;
  if (!blind && fight(state, bot, dt)) return;
  const sprint = state.time - br.seenAt > 4;
  const plan = state.teamPlan || { site: 'A' };

  if (bot.team === 'atk') {
    const siteId = br.role === 'lurk' ? 'mid' : plan.site;
    if (state.bomb.state === 'planted') {
      // Post-plant: hold a spot inside the site.
      const holds = HOLDS[state.bomb.site] || HOLDS.A;
      const h = nodeById(holds[br.index % holds.length]);
      if (h) moveToward(state, bot, h.x, h.z, dt, false);
      return;
    }
    if (br.role === 'carrier') {
      goTo(state, bot, siteId === 'A' ? 'aSite' : 'bSite', dt, sprint);
    } else if (br.role === 'lurk') {
      goTo(state, bot, 'midM', dt, sprint);
    } else if (br.role === 'flank') {
      goTo(state, bot, plan.site === 'A' ? 'northLaneM' : 'southLaneM', dt, sprint);
    } else {
      goTo(state, bot, plan.site === 'A' ? 'aSite' : 'bSite', dt, sprint);
    }
    return;
  }
  // Defenders.
  if (state.bomb.state === 'planted') {
    // Retake: converge on the site; the defuse intent fires when close.
    goTo(state, bot, state.bomb.site === 'A' ? 'aSite' : 'bSite', dt, true);
    const d = Math.hypot(bot.x - state.bomb.x, bot.z - state.bomb.z);
    if (d < 1.4) { bot.vx = 0; bot.vz = 0; bot.yaw = Math.atan2(state.bomb.x - bot.x, state.bomb.z - bot.z); }
    return;
  }
  if (br.investigateX !== null && Math.random() < 0.6) {
    if (moveToward(state, bot, br.investigateX, br.investigateZ, dt, true)) {
      br.investigateX = null;
      br.investigateZ = null;
    }
    return;
  }
  const holds = HOLDS[br.site] || HOLDS.mid;
  const h = nodeById(holds[br.index % holds.length]);
  if (h) {
    if (moveToward(state, bot, h.x, h.z, dt, sprint)) {
      // At the hold: watch the lane, crouch for the accuracy bonus.
      bot.crouch = br.index % 2 === 0;
      bot.yaw += Math.sin(state.time * 0.4 + br.index * 2.1) * dt * 0.35;
    }
  }
}
