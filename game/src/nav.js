// nav.js — the waypoint graph the bots think with. Nodes come from the
// map; an edge joins two nodes when they are close and the straight walk
// between them is not cut by a building-height wall (4 m or more). Crates
// and low walls do not break an edge: a walking bot slides around them.
// Paths are breadth-first, so bots take the shortest route and spread
// over the map's lanes.
import { MAP } from './map.js';
import { sightBlocked } from './collide.js';

const nodes = MAP.waypoints.map((w, i) => ({ ...w, i, edges: [] }));
const byId = new Map(nodes.map((n) => [n.id, n]));

for (const a of nodes) {
  for (const b of nodes) {
    if (a === b) continue;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < 20 && !sightBlocked(a.x, a.z, b.x, b.z, 4.0)) a.edges.push(b.i);
  }
}

export function nodeById(id) {
  return byId.get(id);
}

export function nearestNode(x, z) {
  let best = null;
  let bd = Infinity;
  for (const n of nodes) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

// Shortest path of waypoint coordinates from (x, z) to the named node,
// including the target itself as the last point. Empty when unreachable.
export function pathTo(x, z, targetId) {
  const start = nearestNode(x, z);
  const goal = byId.get(targetId);
  if (!start || !goal) return [];
  if (start === goal) return [{ x: goal.x, z: goal.z }];
  const prev = new Map([[start.i, -1]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const e of cur.edges) {
      if (!prev.has(e)) {
        prev.set(e, cur.i);
        queue.push(nodes[e]);
      }
    }
  }
  if (!prev.has(goal.i)) return [];
  const path = [];
  let cur = goal.i;
  while (cur !== -1) {
    path.push({ x: nodes[cur].x, z: nodes[cur].z });
    cur = prev.get(cur);
  }
  return path.reverse();
}

// Waypoint ids that count as holding spots for a site, used by defenders.
export const HOLDS = {
  A: ['aHold1', 'aHold2', 'topConn'],
  B: ['bHold1', 'bHold2', 'southConn'],
  mid: ['midM', 'midCrossN', 'midCrossS'],
};
