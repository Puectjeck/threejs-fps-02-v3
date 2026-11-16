// render.js — everything three.js shows: the lit scene, articulated
// actor models with team colours and a separate head (the hitbox the
// bullets use), the first-person viewmodel, the charge and the grenades.
// Simulation state is only read here, never written.
import * as THREE from 'three';
import { PALETTE, TEAMS, PHYS } from './config.js';
import { buildWorld } from './map.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 55, 130);
  const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.08, 300);
  const hemi = new THREE.HemisphereLight(0xcfe4fa, 0x2a3138, 1.35);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xbfd0e0, 0.4));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
  sun.position.set(30, 55, -20);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
  fill.position.set(-25, 30, 30);
  scene.add(fill);
  buildWorld(scene);
  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
  return { renderer, scene, camera };
}

const actorMeshes = new Map();

function buildActorMesh(actor) {
  const g = new THREE.Group();
  const teamMat = new THREE.MeshStandardMaterial({ color: TEAMS[actor.team].color, roughness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1d232b, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.7 });
  const legGeo = new THREE.BoxGeometry(0.21, 0.78, 0.24);
  const legL = new THREE.Mesh(legGeo, darkMat);
  legL.position.set(-0.14, 0.39, 0);
  const legR = new THREE.Mesh(legGeo, darkMat);
  legR.position.set(0.14, 0.39, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.3), teamMat);
  torso.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
  head.position.y = PHYS.headHeight;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.32),
    new THREE.MeshBasicMaterial({ color: TEAMS[actor.team].color }));
  visor.position.y = PHYS.headHeight + 0.03;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.78), darkMat);
  gun.position.set(0.24, 1.22, 0.42);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.44, 0.16), darkMat);
  pack.position.set(0, 1.12, -0.24);
  g.add(legL, legR, torso, head, visor, gun, pack);
  g.userData = { legL, legR, torso, head };
  return g;
}

let bombMesh = null;
let grenadeMeshes = [];
let viewmodel = null;
let muzzle = null;

export function initActors(scene, state) {
  for (const a of state.actors) {
    if (a.isPlayer) continue;
    const m = buildActorMesh(a);
    actorMeshes.set(a.id, m);
    scene.add(m);
  }
  bombMesh = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.4, metalness: 0.6 }));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  lamp.position.y = 0.18;
  bombMesh.add(core, lamp);
  bombMesh.userData.lamp = lamp;
  scene.add(bombMesh);
  const nadeGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const nadeMat = new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.5 });
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(nadeGeo, nadeMat);
    m.visible = false;
    scene.add(m);
    grenadeMeshes.push(m);
  }
  // The viewmodel: a low, angular rifle that kicks with recoil.
  viewmodel = new THREE.Group();
  const vmMat = new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.35, metalness: 0.7 });
  const vmAccent = new THREE.MeshBasicMaterial({ color: PALETTE.accentAtk });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.62), vmMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), vmMat);
  barrel.position.set(0, 0.03, 0.44);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.1), vmMat);
  mag.position.set(0, -0.15, 0.05);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.03, 0.4), vmAccent);
  stripe.position.y = 0.06;
  muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  muzzle.position.set(0, 0.03, 0.62);
  viewmodel.add(body, barrel, mag, stripe, muzzle);
  viewmodel.position.set(0.26, -0.24, -0.5);
}

// Place every mesh from simulation state; called once per frame.
export function drawWorld(state, view) {
  const { scene, camera } = view;
  for (const a of state.actors) {
    if (a.isPlayer) continue;
    const m = actorMeshes.get(a.id);
    if (!m) continue;
    m.visible = a.alive || state.time - (a.diedAt || 0) < 3;
    m.position.set(a.x, 0, a.z);
    m.rotation.y = a.yaw;
    if (!a.alive) {
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.25;
    } else {
      m.rotation.x = 0;
      m.position.y = a.crouch ? -0.28 : 0;
      const speed = Math.hypot(a.vx, a.vz);
      const bob = Math.sin(state.time * 10 + a.id) * Math.min(0.05, speed * 0.01);
      m.userData.legL.rotation.x = bob * 6;
      m.userData.legR.rotation.x = -bob * 6;
    }
  }
  // The charge: on the carrier's back, on the ground, or planted.
  const b = state.bomb;
  if (b.state === 'carried') {
    const carrier = state.actors.find((a) => a.id === b.carrier);
    if (carrier) {
      bombMesh.visible = true;
      bombMesh.position.set(carrier.x - Math.sin(carrier.yaw) * 0.3, 1.15, carrier.z - Math.cos(carrier.yaw) * 0.3);
    }
  } else if (b.state === 'dropped' || b.state === 'planted' || b.state === 'planting') {
    bombMesh.visible = true;
    bombMesh.position.set(b.x, 0.16, b.z);
  } else {
    bombMesh.visible = false;
  }
  if (bombMesh.visible) {
    const planted = b.state === 'planted';
    const rate = planted ? Math.max(1.2, b.fuse / 4) : 2.2;
    bombMesh.userData.lamp.material.color.setHex(
      Math.sin(state.time * rate * 4) > 0 ? 0xff2222 : 0x550000,
    );
  }
  grenadeMeshes.forEach((m, i) => {
    const p = state.projectiles[i];
    m.visible = !!p;
    if (p) m.position.set(p.x, p.y, p.z);
  });
  // Camera: the player's eyes, or a slow orbit over the map when dead.
  const p = state.player;
  if (p && p.alive) {
    const eye = p.crouch ? PHYS.crouchEye : PHYS.standEye;
    camera.position.set(p.x, eye, p.z);
    const cp = Math.cos(p.pitch || 0);
    camera.lookAt(
      p.x + Math.sin(p.yaw) * cp,
      eye + Math.sin(p.pitch || 0),
      p.z + Math.cos(p.yaw) * cp,
    );
    const scoped = p.loadout.scoped;
    const targetFov = scoped ? 24 : 75;
    if (Math.abs(camera.fov - targetFov) > 0.5) {
      camera.fov += (targetFov - camera.fov) * 0.4;
      camera.updateProjectionMatrix();
    }
    if (!viewmodel.parent) camera.add(viewmodel);
    viewmodel.visible = !scoped;
    const kick = p.loadout.recoil * 0.012;
    viewmodel.position.z = -0.5 + kick;
    viewmodel.position.y = -0.24 + kick * 0.5;
    // Recoil spikes on every shot and decays within a few frames, so it
    // doubles as the muzzle-flash clock.
    muzzle.material.opacity = p.loadout.recoil > 0.4 ? 0.9 : 0;
    muzzle.rotation.z = Math.random() * 3;
    if (!scene.children.includes(camera)) scene.add(camera);
  } else {
    if (viewmodel) viewmodel.visible = false;
    const t = state.time * 0.07;
    camera.position.set(Math.sin(t) * 34, 26, Math.cos(t) * 34);
    camera.lookAt(0, 0, 0);
    if (Math.abs(camera.fov - 60) > 0.5) { camera.fov = 60; camera.updateProjectionMatrix(); }
  }
  view.renderer.render(scene, camera);
}
