// audio.js — all sound is synthesised with WebAudio: no audio files, so
// the game stays fully offline. One tiny voice per event, created on the
// fly and stopped when done; the context wakes on the first click.
let ctx = null;

export function wakeAudio() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function env(gain, t0, peak, decay) {
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
}

function noiseBurst(dur, freq, peak, type = 'lowpass') {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const len = Math.max(1, (dur * ctx.sampleRate) | 0);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  env(gain, t0, peak, dur);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

function tone(freq, dur, peak, type = 'square', slideTo = null) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  const gain = ctx.createGain();
  env(gain, t0, peak, dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  shot(heavy) { noiseBurst(heavy ? 0.22 : 0.13, heavy ? 900 : 1400, heavy ? 0.5 : 0.32); },
  enemyShot() { noiseBurst(0.1, 1100, 0.1); },
  reload() { tone(220, 0.07, 0.12, 'square'); setTimeout(() => tone(330, 0.06, 0.12, 'square'), 120); },
  hit(head) { tone(head ? 1250 : 880, 0.06, 0.16, 'sine'); },
  hurt() { tone(140, 0.12, 0.2, 'sawtooth', 90); },
  kill() { tone(660, 0.09, 0.16, 'sine'); setTimeout(() => tone(990, 0.12, 0.16, 'sine'), 70); },
  throwIt() { noiseBurst(0.12, 2600, 0.08, 'bandpass'); },
  flashPop() { noiseBurst(0.3, 4000, 0.3, 'highpass'); },
  explode() { noiseBurst(0.9, 220, 0.8); tone(60, 0.8, 0.5, 'sine', 34); },
  beep(final) { tone(final ? 1560 : 1040, final ? 0.3 : 0.09, 0.14, 'sine'); },
  buy() { tone(520, 0.06, 0.12, 'sine'); setTimeout(() => tone(780, 0.08, 0.12, 'sine'), 60); },
  denied() { tone(160, 0.12, 0.14, 'square'); },
  roundWin() { tone(523, 0.14, 0.16, 'triangle'); setTimeout(() => tone(784, 0.2, 0.16, 'triangle'), 120); },
  roundLose() { tone(392, 0.14, 0.16, 'triangle'); setTimeout(() => tone(262, 0.22, 0.16, 'triangle'), 120); },
};
