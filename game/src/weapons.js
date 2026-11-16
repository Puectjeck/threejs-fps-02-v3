// weapons.js — the gunplay model. Hits are rays against body and head
// boxes with distance falloff and armour penetration; spread grows while
// moving and shrinks when crouched, so stopping to aim pays. Grenades are
// physical projectiles: frag wounds through a radius, smoke blocks sight
// lines, flash blinds whoever faces the burst.
import { WEAPONS, GRENADES, PHYS } from './config.js';
import { rayWorld, rayActor, sightBlocked } from './collide.js';
import { sfx } from './audio.js';

// A fresh inventory: the free sidearm, no armour, no grenades.
export function makeLoadout() {
  const guns = {};
  for (const id of Object.keys(WEAPONS)) {
    guns[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  }
  return {
    guns, primary: null, sidearm: 'p9', current: 'p9',
    armour: false, grenades: { frag: 0, smoke: 0, flash: 0 },
    reloadingUntil: 0, nextShotAt: 0, recoil: 0, scoped: false,
  };
}

export function giveWeapon(actor, id) {
  const w = WEAPONS[id];
  actor.loadout[w.slot] = id;
  actor.loadout.guns[id] = { mag: w.mag, reserve: w.reserve };
  actor.loadout.current = id;
}

// Damage after armour: the penetrating share always lands, the rest is
// halved by a vest. Head hits multiply before armour.
export function armourDamage(raw, head, weapon, target) {
  let dmg = raw * (head ? weapon.headMult : 1);
  if (target.loadout.armour) {
    dmg = dmg * (weapon.armourPen + (1 - weapon.armourPen) * 0.5);
    target.loadout.armourHp = Math.max(0, (target.loadout.armourHp ?? 100) - raw * 0.4);
    if (target.loadout.armourHp <= 0) target.loadout.armour = false;
  }
  return dmg;
}

function falloff(weapon, dist) {
  if (dist <= weapon.falloffStart) return 1;
  if (dist >= weapon.falloffEnd) return 0.45;
  const t = (dist - weapon.falloffStart) / (weapon.falloffEnd - weapon.falloffStart);
  return 1 - t * 0.55;
}

// How wide this actor's shots scatter right now, in radians: base spread,
// plus a movement term, eased by crouching, plus accumulated recoil.
export function currentSpread(actor) {
  const w = WEAPONS[actor.loadout.current];
  const speed = Math.hypot(actor.vx, actor.vz);
  let s = w.spread + w.moveSpread * Math.min(1, speed / PHYS.walkSpeed);
  if (actor.crouch) s *= 0.65;
  if (actor.loadout.scoped) s *= 0.25;
  return s + actor.loadout.recoil * 0.004;
}

// Try to fire the actor's current weapon along (dx, dy, dz). Returns a
// shot report the renderer and the bots' hearing both consume, or null
// when the gun cannot fire (rate, reload, empty, wrong phase handled by
// the caller through canFire).
export function tryFire(state, actor, dx, dy, dz) {
  const lo = actor.loadout;
  const w = WEAPONS[lo.current];
  const gun = lo.guns[lo.current];
  if (state.time < lo.nextShotAt || state.time < lo.reloadingUntil) return null;
  if (gun.mag <= 0) {
    startReload(state, actor);
    return null;
  }
  gun.mag -= 1;
  lo.nextShotAt = state.time + 60 / w.rpm;
  lo.recoil = Math.min(6, lo.recoil + 1);
  state.roundStats.shots += actor.isPlayer ? 1 : 0;
  state.shots.push({ x: actor.x, z: actor.z, team: actor.team, at: state.time });

  const spread = currentSpread(actor);
  const eyeY = actor.y + (actor.crouch ? PHYS.crouchEye : PHYS.standEye);
  let best = null;
  for (let p = 0; p < w.pellets; p++) {
    const dir = jitter(dx, dy, dz, spread);
    const wallT = rayWorld(actor.x, eyeY, actor.z, dir.x, dir.y, dir.z, w.range);
    let hit = null;
    for (const other of state.actors) {
      if (other === actor || !other.alive || other.team === actor.team) continue;
      const r = rayActor(actor.x, eyeY, actor.z, dir.x, dir.y, dir.z, other);
      if (r && r.t < wallT && (!hit || r.t < hit.t)) hit = { ...r, target: other };
    }
    const t = hit ? hit.t : wallT;
    if (!best || t < best.t) best = { t, hit, dir, wall: !hit };
    if (hit) {
      const dmg = w.damage * falloff(w, hit.t);
      applyHit(state, actor, hit.target, dmg, hit.head, w);
    }
  }
  if (actor.isPlayer) sfx.shot(lo.current === 'longshot' || lo.current === 'rk9');
  return {
    x: actor.x, y: eyeY, z: actor.z,
    dx, dy, dz, t: best ? best.t : w.range, wall: best ? best.wall : true,
    heavy: lo.current === 'longshot',
  };
}

function jitter(dx, dy, dz, spread) {
  const a = (Math.random() * 2 - 1) * spread;
  const b = (Math.random() * 2 - 1) * spread;
  // Build two vectors perpendicular to the aim and offset along them.
  const up = Math.abs(dy) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const rx = dy * up.z - dz * up.y;
  const ry = dz * up.x - dx * up.z;
  const rz = dx * up.y - dy * up.x;
  const sx = dy * rz - dz * ry;
  const sy = dz * rx - dx * rz;
  const sz = dx * ry - dy * rx;
  const x = dx + rx * a + sx * b;
  const y = dy + ry * a + sy * b;
  const z = dz + rz * a + sz * b;
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

// Apply one bullet's damage; deaths are finalised by round.js, which reads
// lastAttacker for the feed and the rewards.
export function applyHit(state, attacker, target, raw, head, weapon) {
  const dmg = armourDamage(raw, head, weapon, target);
  target.hp -= dmg;
  target.lastAttacker = attacker.id;
  target.lastHitHead = head;
  target.lastHitAt = state.time;
  if (attacker.isPlayer) {
    state.roundStats.hits += 1;
    sfx.hit(head);
  }
  if (target.isPlayer) sfx.hurt();
}

export function startReload(state, actor) {
  const lo = actor.loadout;
  const gun = lo.guns[lo.current];
  const w = WEAPONS[lo.current];
  if (gun.reserve <= 0 || gun.mag >= w.mag || state.time < lo.reloadingUntil) return;
  lo.reloadingUntil = state.time + w.reload;
  if (actor.isPlayer) sfx.reload();
}

// Reloads complete inside the fixed step so bot and player guns agree.
export function updateWeapons(state, dt) {
  for (const a of state.actors) {
    const lo = a.loadout;
    lo.recoil = Math.max(0, lo.recoil - dt * 9);
    if (lo.reloadingUntil && state.time >= lo.reloadingUntil) {
      const gun = lo.guns[lo.current];
      const w = WEAPONS[lo.current];
      const take = Math.min(w.mag - gun.mag, gun.reserve);
      gun.mag += take;
      gun.reserve -= take;
      lo.reloadingUntil = 0;
    }
  }
}

// --- Grenades ------------------------------------------------------------

export function throwGrenade(state, actor, kind, dx, dy, dz) {
  const lo = actor.loadout;
  if (lo.grenades[kind] <= 0) return false;
  lo.grenades[kind] -= 1;
  const speed = 15;
  state.projectiles.push({
    kind, team: actor.team, owner: actor.id,
    x: actor.x, y: actor.y + 1.5, z: actor.z,
    vx: dx * speed, vy: dy * speed + 3.5, vz: dz * speed,
    fuse: GRENADES[kind].fuse,
  });
  if (actor.isPlayer) sfx.throwIt();
  return true;
}

export function updateProjectiles(state, dt) {
  const keep = [];
  for (const p of state.projectiles) {
    p.fuse -= dt;
    p.vy -= 18 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < 0.15) { p.y = 0.15; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
    if (p.fuse <= 0) detonate(state, p);
    else keep.push(p);
  }
  state.projectiles = keep;
  state.smokes = state.smokes.filter((s) => state.time < s.until);
}

function detonate(state, p) {
  const g = GRENADES[p.kind];
  if (p.kind === 'frag') {
    if (state.player && Math.hypot(state.player.x - p.x, state.player.z - p.z) < 14) sfx.explode();
    for (const a of state.actors) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d > g.radius) continue;
      if (sightBlocked(p.x, p.z, a.x, a.z, 1.0)) continue;
      const raw = g.damage * (1 - d / (g.radius * 1.35));
      a.hp -= a.loadout.armour ? raw * 0.7 : raw;
      a.lastAttacker = p.owner;
      a.lastHitHead = false;
      a.lastHitAt = state.time;
    }
    state.blast = { x: p.x, y: 0.6, z: p.z, at: state.time };
  } else if (p.kind === 'smoke') {
    state.smokes.push({ x: p.x, z: p.z, r: g.radius, until: state.time + g.duration });
    state.smokePuff = { x: p.x, z: p.z, at: state.time };
  } else if (p.kind === 'flash') {
    state.flashes.push({ x: p.x, y: p.y, z: p.z, at: state.time });
    sfx.flashPop();
    for (const a of state.actors) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d > g.radius) continue;
      // Facing factor: looking at the burst blinds fully, back turned
      // barely registers. yaw is the actor's facing on the ground plane.
      const toFlash = Math.atan2(p.x - a.x, p.z - a.z);
      let diff = Math.abs(wrapAngle(toFlash - a.yaw));
      const facing = Math.max(0, 1 - diff / Math.PI);
      const blind = g.blindMax * facing * (1 - d / (g.radius * 1.4));
      if (blind > 0.25) a.blindUntil = Math.max(a.blindUntil || 0, state.time + blind);
    }
  }
}

// Smoke blocks a sight line when the segment passes through a cloud.
export function smokeBlocks(x1, z1, x2, z2, state) {
  for (const s of state.smokes) {
    const d = pointSegmentDistance(s.x, s.z, x1, z1, x2, z2);
    if (d < s.r) return true;
  }
  return false;
}

function pointSegmentDistance(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((px - x1) * dx + (pz - z1) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
