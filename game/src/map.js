// map.js — Foundry Nine, an original two-site tactical map, described once
// as data: solid boxes for collision, the two plant sites, the spawns and
// the waypoint seeds the bots navigate by. buildWorld() turns the same data
// into three.js geometry, so what the player sees is what the bullets hit.
import * as THREE from 'three';
import { PALETTE, TEAMS } from './config.js';

// A box: centre x/z, width/depth, height, and a material kind.
function box(x, z, w, d, h, kind = 'wall') {
  return { x, z, w, d, h, kind, minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
}

export const MAP = {
  bounds: { minX: -46, maxX: 46, minZ: -36, maxZ: 36 },
  // The perimeter and the building blocks that carve the lanes: a north
  // lane past site A, a central mid, a south lane to site B, two connectors.
  boxes: [
    // perimeter
    box(0, -36.5, 94, 1, 6, 'wallDark'), box(0, 36.5, 94, 1, 6, 'wallDark'),
    box(-46.5, 0, 1, 74, 6, 'wallDark'), box(46.5, 0, 1, 74, 6, 'wallDark'),
    // north block between A and mid, with a gap at x -11..-2 (top connector)
    box(-28, -8, 34, 3, 5), box(14, -8, 32, 3, 5),
    // south block between mid and B, gap at x 8..16 (bottom connector)
    box(-14, 8, 48, 3, 5), box(30, 8, 28, 3, 5),
    // mid buildings: two long halls leaving a mid street and cross passages
    box(-24, 0, 16, 4.5, 4.2), box(18, 0, 20, 4.5, 4.2),
    // A site structures: coolant tanks and a low wall
    box(-36, -26, 5, 5, 3.2, 'metal'), box(-27, -18, 4, 4, 2.6, 'metal'),
    box(-32, -12.5, 10, 1, 1.1, 'crate'),
    // B site structures: reactor pillars
    box(28, 16, 4, 4, 5.5, 'metal'), box(36, 24, 4, 4, 5.5, 'metal'),
    box(24, 26, 8, 1, 1.1, 'crate'),
    // defender spawn block and attacker spawn block (kept clear of the
    // west corridor at x <= -40, the map's third crossing)
    box(38, -20, 8, 6, 4.2), box(-36, 19, 6, 5, 4.2),
    // scattered cover crates along the lanes
    box(-12, -24, 2.4, 2.4, 1.2, 'crate'), box(10, -25, 2.4, 2.4, 2.4, 'crateAlt'),
    box(-4, 3.8, 2.4, 2.4, 1.2, 'crate'), box(-20, 24, 2.4, 2.4, 2.4, 'crateAlt'),
    box(14, 22, 2.4, 2.4, 1.2, 'crate'), box(-34, 2, 2.4, 2.4, 1.2, 'crateAlt'),
    box(34, -4, 2.4, 2.4, 2.4, 'crate'), box(2, -18, 2.4, 2.4, 1.2, 'crate'),
    box(-16, -2.8, 2, 2, 2.4, 'crateAlt'), box(26, -14, 2.4, 2.4, 1.2, 'crate'),
  ],
  sites: {
    A: { id: 'A', name: 'COOLANT YARD', minX: -41, maxX: -23, minZ: -31, maxZ: -13, x: -32, z: -22 },
    B: { id: 'B', name: 'REACTOR HALL', minX: 21, maxX: 41, minZ: 11, maxZ: 29, x: 31, z: 20 },
  },
  spawns: {
    atk: [
      { x: -40, z: 30 }, { x: -37, z: 32 }, { x: -34, z: 30 }, { x: -40, z: 26 }, { x: -35, z: 27 },
    ],
    def: [
      { x: 40, z: -30 }, { x: 37, z: -32 }, { x: 34, z: -30 }, { x: 40, z: -26 }, { x: 35, z: -27 },
    ],
  },
  // Named navigation points; nav.js links the ones with clear sight lines.
  waypoints: [
    { id: 'atkSpawn', x: -38, z: 29 }, { id: 'atkYard', x: -30, z: 24 },
    { id: 'southLaneW', x: -18, z: 25 }, { id: 'southLaneM', x: 0, z: 25 },
    { id: 'southConn', x: 12, z: 14 }, { id: 'bEntry', x: 18, z: 20 },
    { id: 'bSite', x: 31, z: 20 }, { id: 'bHold1', x: 25, z: 13 }, { id: 'bHold2', x: 24, z: 28 },
    { id: 'midW', x: -30, z: -4.5 }, { id: 'midM', x: 0, z: -4.5 }, { id: 'midE', x: 34, z: -4.5 },
    { id: 'midCrossS', x: 12, z: 4 }, { id: 'midCrossN', x: -10, z: -4 },
    { id: 'topConn', x: -10, z: -14 }, { id: 'topGap', x: -6, z: -11 },
    { id: 'northLaneM', x: 0, z: -24 },
    { id: 'northLaneE', x: 24, z: -24 }, { id: 'aEntry', x: -18, z: -20 },
    { id: 'aSite', x: -32, z: -22 }, { id: 'aHold1', x: -39, z: -29 }, { id: 'aHold2', x: -25, z: -15 },
    { id: 'defSpawn', x: 38, z: -29 }, { id: 'defYard', x: 30, z: -18 },
    { id: 'westLink', x: -43, z: 10 }, { id: 'northLaneC', x: 12, z: -24 },
    { id: 'linkA', x: -20, z: -6 }, { id: 'linkB', x: 20, z: 6 },
    { id: 'heaven', x: 6, z: -14 }, { id: 'underpass', x: -6, z: 14 },
  ],
};

export function siteAt(x, z) {
  for (const s of Object.values(MAP.sites)) {
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return s;
  }
  return null;
}

const MATERIALS = {};
function material(kind) {
  if (!MATERIALS[kind]) {
    const c = PALETTE[kind] ?? PALETTE.wall;
    MATERIALS[kind] = new THREE.MeshStandardMaterial({
      color: c, roughness: kind.startsWith('crate') ? 0.9 : 0.65, metalness: 0.25,
    });
  }
  return MATERIALS[kind];
}

// Build the visible world: ground grid, every collision box as a mesh, neon
// edge strips on the tall blocks, glowing site pads and team spawn markers.
export function buildWorld(scene) {
  const group = new THREE.Group();
  const groundGeo = new THREE.PlaneGeometry(94, 74);
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
    color: PALETTE.ground, roughness: 0.95, metalness: 0.05,
  }));
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  const grid = new THREE.GridHelper(92, 46, PALETTE.groundLine, PALETTE.groundLine);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  group.add(grid);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const stripMat = new THREE.MeshBasicMaterial({ color: PALETTE.accentAtk });
  const stripMatDef = new THREE.MeshBasicMaterial({ color: PALETTE.accentDef });
  for (const b of MAP.boxes) {
    const m = new THREE.Mesh(boxGeo, material(b.kind));
    m.scale.set(b.w, b.h, b.d);
    m.position.set(b.x, b.h / 2, b.z);
    group.add(m);
    if (b.h >= 4) { // a neon trim line near the top of tall blocks
      const strip = new THREE.Mesh(boxGeo, b.x < 0 ? stripMat : stripMatDef);
      strip.scale.set(b.w + 0.06, 0.14, b.d + 0.06);
      strip.position.set(b.x, b.h - 0.35, b.z);
      group.add(strip);
    }
  }
  // Site pads: flat glowing rectangles the size of each plant site.
  for (const s of Object.values(MAP.sites)) {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(s.maxX - s.minX, s.maxZ - s.minZ),
      new THREE.MeshBasicMaterial({
        color: s.id === 'A' ? PALETTE.siteA : PALETTE.siteB, transparent: true, opacity: 0.16,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(s.x, 0.04, s.z);
    group.add(pad);
  }
  // Spawn floor markers in team colours.
  for (const [team, list] of Object.entries(MAP.spawns)) {
    const mat = new THREE.MeshBasicMaterial({
      color: TEAMS[team].color, transparent: true, opacity: 0.2,
    });
    for (const p of list) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), mat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(p.x, 0.05, p.z);
      group.add(disc);
    }
  }
  scene.add(group);
  return group;
}
