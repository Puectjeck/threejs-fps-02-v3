// bomb.js — the charge: carried by one attacker, planted on a site with a
// channel, defused by a defender with a longer channel, and the round's
// clock once it is live. All timing lives here; round.js asks this module
// what happened and scores it.
import { RULES } from './config.js';
import { siteAt } from './map.js';
import { actorById, banner } from './state.js';
import { sfx } from './audio.js';

export const PLANT_SECONDS = 3.2;
export const DEFUSE_SECONDS = 5.0;
export const EXPLODE_RADIUS = 13;

export function resetBomb(state, carrierId) {
  state.bomb = {
    state: 'carried', carrier: carrierId, x: 0, z: 0, site: null,
    channel: 0, channelBy: null, fuse: 0,
  };
}

// The carrier dropped the charge where they fell.
export function dropBomb(state, x, z) {
  if (state.bomb.state !== 'carried') return;
  state.bomb.state = 'dropped';
  state.bomb.carrier = null;
  state.bomb.x = x;
  state.bomb.z = z;
}

// A living attacker standing on the dropped charge picks it up.
export function tryPickup(state, actor) {
  const b = state.bomb;
  if (b.state !== 'dropped' || actor.team !== 'atk' || !actor.alive) return;
  if (Math.hypot(actor.x - b.x, actor.z - b.z) < 1.1) {
    b.state = 'carried';
    b.carrier = actor.id;
  }
}

// Advance plant/defuse channels. `intent` maps actor id -> 'plant' or
// 'defuse' for actors holding their use key this step. Returns an event
// string ('planted' | 'defused' | 'exploded') or null.
export function updateBomb(state, dt, intent) {
  const b = state.bomb;
  if (b.state === 'carried' || b.state === 'dropped') {
    b.channel = 0;
    b.channelBy = null;
    for (const [id, act] of intent) {
      if (act !== 'plant') continue;
      const a = actorById(state, Number(id));
      if (!a || !a.alive || b.carrier !== a.id) continue;
      const site = siteAt(a.x, a.z);
      if (!site) continue;
      b.state = 'planting';
      b.channelBy = a.id;
      b.channel = 0;
      b.site = site.id;
      b.x = a.x;
      b.z = a.z;
      break;
    }
    return null;
  }
  if (b.state === 'planting') {
    const planter = actorById(state, b.channelBy);
    if (!planter || !planter.alive || intent.get(b.channelBy) !== 'plant') {
      b.state = 'carried'; // interrupted: the carrier still holds it
      b.channel = 0;
      b.channelBy = null;
      return null;
    }
    b.channel += dt;
    if (b.channel >= PLANT_SECONDS) {
      b.state = 'planted';
      b.fuse = RULES.bombSeconds;
      b.channel = 0;
      b.channelBy = null;
      planter.money = Math.min(RULES.maxMoney, planter.money + RULES.rewardPlanter);
      banner(state, `CHARGE PLANTED — SITE ${b.site}`, 3);
      sfx.beep(false);
      return 'planted';
    }
    return null;
  }
  if (b.state === 'planted') {
    b.fuse -= dt;
    if (b.fuse <= 3.2 && b.fuse + dt > 3.2) sfx.beep(true);
    // Defuse channel: a living defender close by and holding use.
    let defuser = null;
    for (const [id, act] of intent) {
      if (act !== 'defuse') continue;
      const a = actorById(state, Number(id));
      if (a && a.alive && a.team === 'def' && Math.hypot(a.x - b.x, a.z - b.z) < 1.6) {
        defuser = a;
        break;
      }
    }
    if (defuser) {
      if (b.channelBy !== defuser.id) { b.channelBy = defuser.id; b.channel = 0; }
      b.channel += dt;
      if (b.channel >= DEFUSE_SECONDS) {
        b.state = 'done';
        defuser.money = Math.min(RULES.maxMoney, defuser.money + RULES.rewardDefuser);
        return 'defused';
      }
    } else {
      b.channel = Math.max(0, b.channel - dt * 1.5);
      b.channelBy = null;
    }
    if (b.fuse <= 0) {
      b.state = 'done';
      state.blast = { x: b.x, y: 1, z: b.z, at: state.time };
      sfx.explode();
      // The blast kills anyone caught close with no wall between.
      for (const a of state.actors) {
        if (!a.alive) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < EXPLODE_RADIUS) { a.hp = 0; a.lastAttacker = null; }
      }
      return 'exploded';
    }
  }
  return null;
}
