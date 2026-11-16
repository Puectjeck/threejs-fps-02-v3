// main.js — boot and the frame loop. The simulation advances in fixed
// steps of FIXED_DT behind an accumulator, so gunplay and bot decisions
// are identical at any display rate; rendering and the HUD simply read
// the state each step leaves behind.
import { createState } from './state.js';
import { setupMatch, simulate } from './round.js';
import { createInput } from './player.js';
import { createRenderer, initActors, drawWorld } from './render.js';
import { initEffects, updateEffects } from './effects.js';
import { initHud, updateHud, handleBuyKey } from './hud.js';
import { wakeAudio } from './audio.js';

const FIXED_DT = 1 / 120;

const container = document.getElementById('app');
const view = createRenderer(container);
const state = createState();
setupMatch(state);
initActors(view.scene, state);
initEffects(view.scene);
initHud();

const input = createInput();
input.attach(view.renderer.domElement, () => {
  if (!state.started) {
    state.started = true;
    document.getElementById('menu').style.display = 'none';
  }
});

window.addEventListener('keydown', (e) => {
  wakeAudio();
  if (state.phase === 'buy' && state.started) {
    if (e.code === 'KeyB') state.buyOpen = !state.buyOpen;
    else handleBuyKey(state, e.code);
  }
  if (state.phase === 'live') {
    if (e.code === 'Digit4') input.grenadeKey = 'frag';
    if (e.code === 'Digit5') input.grenadeKey = 'smoke';
    if (e.code === 'Digit6') input.grenadeKey = 'flash';
  }
  if (state.phase === 'over' && e.code === 'KeyR') window.location.reload();
});

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= FIXED_DT) {
    simulate(state, FIXED_DT, input);
    acc -= FIXED_DT;
  }
  updateEffects(state);
  drawWorld(state, view);
  updateHud(state);
}
requestAnimationFrame(frame);
