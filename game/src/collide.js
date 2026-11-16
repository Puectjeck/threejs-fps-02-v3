// collide.js — movement collision and bullet rays against the map's boxes.
// Actors are circles on the ground plane sliding along box faces; bullets
// are 3D rays tested against boxes (which stand from the ground to their
// height) and against actor body/head boxes.
import { MAP } from './map.js';
import { PHYS } from './config.js';

// Move a circle (x, z, radius r) by (dx, dz), sliding on box faces and the
// map bounds. Returns the resolved position; axes are resolved separately
// so actors slip along walls instead of sticking to them.
export function moveCircle(x, z, dx, dz, r) {
  let nx = clampToBounds(x + dx, r, 'x');
  for (const b of MAP.boxes) {
    if (circleHitsBox(nx, z, r, b)) nx = dx > 0 ? b.minX - r : b.maxX + r;
  }
  let nz = clampToBounds(z + dz, r, 'z');
  for (const b of MAP.boxes) {
    if (circleHitsBox(nx, nz, r, b)) nz = dz > 0 ? b.minZ - r : b.maxZ + r;
  }
  return { x: nx, z: nz };
}

function clampToBounds(v, r, axis) {
  const b = MAP.bounds;
  return axis === 'x'
    ? Math.max(b.minX + r, Math.min(b.maxX - r, v))
    : Math.max(b.minZ + r, Math.min(b.maxZ - r, v));
}

function circleHitsBox(x, z, r, b) {
  const cx = Math.max(b.minX, Math.min(b.maxX, x));
  const cz = Math.max(b.minZ, Math.min(b.maxZ, z));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

// 2D sight test at standing height: true when a wall at least 1.7 high
// blocks the straight line between two ground points. Low crates (1.1-1.2)
// block a crouched view only, which callers approximate with minH.
export function sightBlocked(x1, z1, x2, z2, minH = 1.7) {
  for (const b of MAP.boxes) {
    if (b.h < minH) continue;
    if (segmentHitsRect(x1, z1, x2, z2, b)) return true;
  }
  return false;
}

function segmentHitsRect(x1, z1, x2, z2, b) {
  // Liang-Barsky clip of the segment against the rectangle.
  const dx = x2 - x1;
  const dz = z2 - z1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dz, dz];
  const q = [x1 - b.minX, b.maxX - x1, z1 - b.minZ, b.maxZ - z1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

// Cast a 3D ray (origin o, unit direction d) against every map box; returns
// the nearest distance or Infinity. Boxes span y in [0, h].
export function rayWorld(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = Infinity;
  for (const b of MAP.boxes) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, b.minX, 0, b.minZ, b.maxX, b.h, b.maxZ);
    if (t !== null && t < best && t <= maxDist) best = t;
  }
  return best;
}

// Ray against one actor: a body box (radius wide, up to bodyTop) and a head
// box above it. Returns {t, head} for the nearer hit, or null.
export function rayActor(ox, oy, oz, dx, dy, dz, a) {
  const r = PHYS.radius + 0.06;
  const top = a.crouch ? PHYS.bodyTop * 0.72 : PHYS.bodyTop;
  const body = rayBox(ox, oy, oz, dx, dy, dz, a.x - r, 0, a.z - r, a.x + r, top, a.z + r);
  const headY = a.crouch ? PHYS.headHeight * 0.7 : PHYS.headHeight;
  const hr = 0.21;
  const head = rayBox(ox, oy, oz, dx, dy, dz,
    a.x - hr, headY - hr, a.z - hr, a.x + hr, headY + hr, a.z + hr);
  if (head !== null && (body === null || head < body)) return { t: head, head: true };
  if (body !== null) return { t: body, head: false };
  return null;
}

// Slab test of a ray against an axis-aligned box; entry distance or null.
export function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = 0;
  let tmax = Infinity;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const mn = [minX, minY, minZ];
  const mx = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
    } else {
      let t1 = (mn[i] - o[i]) / d[i];
      let t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
