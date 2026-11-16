// effects.js — transient visuals, all pooled: tracer lines, impact
// sparks, muzzle flashes, smoke clouds and the charge's blast. Nothing is
// allocated in the frame loop; pools are sized once at boot and recycled.
import * as THREE from 'three';

const TRACERS = 28;
const SPARKS = 90;
const SMOKES = 10;

let tracers = [];
let sparks = [];
let smokes = [];
let flashLight = null;
let flashUntil = 0;
let blastMesh = null;
let blastAt = -9;

export function initEffects(scene) {
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85 });
  for (let i = 0; i < TRACERS; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, tracerMat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, until: 0 });
  }
  const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  for (let i = 0; i < SPARKS; i++) {
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    m.visible = false;
    scene.add(m);
    sparks.push({ m, vx: 0, vy: 0, vz: 0, until: 0 });
  }
  const smokeMat = new THREE.MeshStandardMaterial({
    color: 0x9aa4ae, transparent: true, opacity: 0.55, roughness: 1,
  });
  for (let i = 0; i < SMOKES; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), smokeMat);
    m.visible = false;
    scene.add(m);
    smokes.push({ m, x: 0, z: 0, until: 0 });
  }
  flashLight = new THREE.PointLight(0xffa040, 0, 26);
  scene.add(flashLight);
  blastMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffc080, transparent: true, opacity: 0 }),
  );
  blastMesh.visible = false;
  scene.add(blastMesh);
}

let tracerI = 0;
let sparkI = 0;

function spawnTracer(r) {
  const t = tracers[tracerI++ % TRACERS];
  const pos = t.line.geometry.attributes.position;
  pos.setXYZ(0, r.x + r.dx * 0.6, r.y - 0.08, r.z + r.dz * 0.6);
  pos.setXYZ(1, r.x + r.dx * r.t, r.y + r.dy * r.t, r.z + r.dz * r.t);
  pos.needsUpdate = true;
  t.line.visible = true;
  t.until = performance.now() / 1000 + 0.055;
  if (r.wall) spawnImpact(r.x + r.dx * r.t, r.y + r.dy * r.t, r.z + r.dz * r.t);
}

function spawnImpact(x, y, z) {
  for (let n = 0; n < 3; n++) {
    const s = sparks[sparkI++ % SPARKS];
    s.m.position.set(x, y, z);
    s.vx = (Math.random() - 0.5) * 2.4;
    s.vy = Math.random() * 2.2;
    s.vz = (Math.random() - 0.5) * 2.4;
    s.m.visible = true;
    s.until = performance.now() / 1000 + 0.3;
  }
}

// Consume the step's shot reports and world events; called once a frame.
export function updateEffects(state) {
  const now = performance.now() / 1000;
  if (state.shotFx) {
    for (const r of state.shotFx) spawnTracer(r);
    state.shotFx = [];
  }
  for (const t of tracers) if (t.line.visible && now > t.until) t.line.visible = false;
  for (const s of sparks) {
    if (!s.m.visible) continue;
    if (now > s.until) { s.m.visible = false; continue; }
    s.vy -= 9 * 0.016;
    s.m.position.x += s.vx * 0.016;
    s.m.position.y += s.vy * 0.016;
    s.m.position.z += s.vz * 0.016;
  }
  // Smoke clouds mirror the simulation's active smokes.
  smokes.forEach((s, i) => {
    const src = state.smokes[i];
    if (!src) { s.m.visible = false; return; }
    s.m.visible = true;
    s.m.position.set(src.x, 1.6, src.z);
    const grow = Math.min(1, (src.until - state.time) / 2);
    s.m.scale.setScalar(src.r * (0.7 + 0.3 * grow));
  });
  if (state.blast && state.blast.at !== blastAt) {
    blastAt = state.blast.at;
    blastMesh.position.set(state.blast.x, state.blast.y, state.blast.z);
    blastMesh.visible = true;
    flashLight.position.copy(blastMesh.position);
    flashUntil = now + 0.5;
  }
  if (blastMesh.visible) {
    const k = Math.min(1, (now - flashUntil + 0.5) / 0.5);
    blastMesh.scale.setScalar(1 + k * 11);
    blastMesh.material.opacity = 0.75 * (1 - k);
    if (k >= 1) blastMesh.visible = false;
  }
  flashLight.intensity = now < flashUntil ? 60 : 0;
}
