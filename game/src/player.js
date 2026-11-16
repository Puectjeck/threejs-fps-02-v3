// player.js — the human's body: pointer-lock mouse look, acceleration
// movement with crouch and sprint, and the trigger. The player obeys the
// same physics and spread model as the bots; the only privilege is aim.
import { PHYS, WEAPONS } from './config.js';
import { moveCircle } from './collide.js';
import { tryFire, startReload, throwGrenade, wrapAngle } from './weapons.js';
import { sfx, wakeAudio } from './audio.js';

export function createInput() {
  return {
    keys: new Set(), lookDX: 0, lookDY: 0,
    mouseDown: false, clicked: false, locked: false,
    attach(canvas, onFirstClick) {
      // The click is heard on the document, not the canvas: the title
      // menu overlays the canvas, and the click that dismisses it must
      // still start the game and take the pointer lock.
      document.addEventListener('click', () => {
        wakeAudio();
        if (!this.locked) canvas.requestPointerLock();
        if (onFirstClick) onFirstClick();
      });
      document.addEventListener('pointerlockchange', () => {
        this.locked = document.pointerLockElement === canvas;
      });
      document.addEventListener('mousemove', (e) => {
        if (!this.locked) return;
        this.lookDX += e.movementX || 0;
        this.lookDY += e.movementY || 0;
      });
      document.addEventListener('mousedown', (e) => {
        if (this.locked && e.button === 0) { this.mouseDown = true; this.clicked = true; }
        if (this.locked && e.button === 2) this.ads = true;
      });
      document.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouseDown = false;
        if (e.button === 2) this.ads = false;
      });
      document.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('keydown', (e) => {
        this.keys.add(e.code);
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    },
  };
}

// Advance the player one fixed step. Fills `intent` with 'plant' or
// 'defuse' while the use key is held in the right place.
export function updatePlayer(state, dt, input, intent) {
  const p = state.player;
  if (!p || !p.alive) return;
  // Look: mouse X turns, mouse Y pitches (clamped), sensitivity modest.
  p.yaw = wrapAngle(p.yaw - input.lookDX * 0.0021);
  p.pitch = Math.max(-1.35, Math.min(1.35, (p.pitch || 0) - input.lookDY * 0.0021));
  input.lookDX = 0;
  input.lookDY = 0;

  const k = input.keys;
  p.crouch = k.has('KeyC') || k.has('ControlLeft');
  const sprint = k.has('ShiftLeft') && !p.crouch;
  const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
  const strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  let wishX = (sin * fwd + cos * strafe);
  let wishZ = (cos * fwd - sin * strafe);
  const wl = Math.hypot(wishX, wishZ) || 1;
  if (fwd || strafe) { wishX /= wl; wishZ /= wl; } else { wishX = 0; wishZ = 0; }
  const speed = p.crouch ? PHYS.crouchSpeed : sprint ? PHYS.sprintSpeed : PHYS.walkSpeed;
  // Accelerate toward the wish velocity; friction bleeds speed on release.
  const blend = Math.min(1, PHYS.accel * dt / Math.max(speed, 0.001));
  p.vx += (wishX * speed - p.vx) * blend;
  p.vz += (wishZ * speed - p.vz) * blend;
  if (!fwd && !strafe) {
    const f = Math.max(0, 1 - PHYS.friction * dt);
    p.vx *= f;
    p.vz *= f;
  }
  const moved = moveCircle(p.x, p.z, p.vx * dt, p.vz * dt, PHYS.radius);
  p.x = moved.x;
  p.z = moved.z;

  // Aim direction from yaw/pitch, shared by guns and grenades.
  const cp = Math.cos(p.pitch);
  const dir = { x: sin * cp, y: Math.sin(p.pitch), z: cos * cp };
  p.loadout.scoped = !!input.ads && p.loadout.current === 'longshot';

  const frozen = state.phase === 'buy';
  if (!frozen && state.started) {
    const w = WEAPONS[p.loadout.current];
    const wantFire = w.auto ? input.mouseDown : input.clicked;
    if (wantFire) {
      const report = tryFire(state, p, dir.x, dir.y, dir.z);
      if (report) (state.shotFx ??= []).push(report);
    }
    if (k.has('KeyR')) startReload(state, p);
    if (k.has('Digit1') && p.loadout.primary) p.loadout.current = p.loadout.primary;
    if (k.has('Digit2')) p.loadout.current = p.loadout.sidearm;
    if (input.grenadeKey) {
      throwGrenade(state, p, input.grenadeKey, dir.x, dir.y * 0.4 + 0.25, dir.z);
      input.grenadeKey = null;
    }
    if (k.has('KeyE')) {
      if (p.team === 'atk' && state.bomb.carrier === p.id) intent.set(p.id, 'plant');
      if (p.team === 'def' && state.bomb.state === 'planted') intent.set(p.id, 'defuse');
    }
  }
  input.clicked = false;
}
