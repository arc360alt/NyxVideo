// Procedurally-generated, royalty-free sound effects, synthesized on the fly with
// the Web Audio API (OfflineAudioContext) so NyxVideo ships with a built-in SFX
// library without bundling any third-party audio assets.
import { audioBufferToWav } from './wav';

const SAMPLE_RATE = 44100;

function ctxFor(duration: number): OfflineAudioContext {
  return new OfflineAudioContext(2, Math.ceil(SAMPLE_RATE * duration), SAMPLE_RATE);
}

function noiseBuffer(ctx: OfflineAudioContext, duration: number): AudioBuffer {
  const buf = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function envGain(ctx: OfflineAudioContext, points: [number, number][]): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, 0);
  for (const [t, v] of points) g.gain.linearRampToValueAtTime(v, t);
  return g;
}

async function render(duration: number, build: (ctx: OfflineAudioContext) => void): Promise<AudioBuffer> {
  const ctx = ctxFor(duration);
  build(ctx);
  return ctx.startRendering();
}

function tone(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = 'sine',
  peak = 0.6,
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(g).connect(dest);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export interface SfxDef {
  id: string;
  name: string;
  category: string;
  duration: number;
  generate: () => Promise<AudioBuffer>;
}

export const SOUND_EFFECTS: SfxDef[] = [
  {
    id: 'sfx-click',
    name: 'Click',
    category: 'UI',
    duration: 0.08,
    generate: () =>
      render(0.08, (ctx) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.08);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2000;
        const g = envGain(ctx, [[0.002, 0.5], [0.06, 0]]);
        src.connect(hp).connect(g).connect(ctx.destination);
        src.start(0);
      }),
  },
  {
    id: 'sfx-pop',
    name: 'Pop',
    category: 'UI',
    duration: 0.15,
    generate: () =>
      render(0.15, (ctx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(900, 0);
        osc.frequency.exponentialRampToValueAtTime(120, 0.12);
        const g = envGain(ctx, [[0.005, 0.7], [0.14, 0]]);
        osc.connect(g).connect(ctx.destination);
        osc.start(0);
        osc.stop(0.15);
      }),
  },
  {
    id: 'sfx-beep',
    name: 'Beep',
    category: 'UI',
    duration: 0.25,
    generate: () =>
      render(0.25, (ctx) => {
        tone(ctx, ctx.destination, 880, 0, 0.22, 'square', 0.35);
      }),
  },
  {
    id: 'sfx-notification',
    name: 'Notification',
    category: 'UI',
    duration: 0.4,
    generate: () =>
      render(0.4, (ctx) => {
        tone(ctx, ctx.destination, 988, 0, 0.18, 'sine', 0.5);
        tone(ctx, ctx.destination, 1319, 0.1, 0.25, 'sine', 0.5);
      }),
  },
  {
    id: 'sfx-ding',
    name: 'Ding',
    category: 'Bell',
    duration: 1.2,
    generate: () =>
      render(1.2, (ctx) => {
        tone(ctx, ctx.destination, 1568, 0, 1.1, 'sine', 0.5);
        tone(ctx, ctx.destination, 1568 * 2.4, 0, 0.8, 'sine', 0.12);
      }),
  },
  {
    id: 'sfx-chime',
    name: 'Chime',
    category: 'Bell',
    duration: 1.0,
    generate: () =>
      render(1.0, (ctx) => {
        tone(ctx, ctx.destination, 523.25, 0, 0.4, 'sine', 0.4);
        tone(ctx, ctx.destination, 659.25, 0.15, 0.45, 'sine', 0.4);
        tone(ctx, ctx.destination, 783.99, 0.3, 0.6, 'sine', 0.4);
      }),
  },
  {
    id: 'sfx-whoosh',
    name: 'Whoosh',
    category: 'Transition',
    duration: 0.6,
    generate: () =>
      render(0.6, (ctx) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.6);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(200, 0);
        bp.frequency.exponentialRampToValueAtTime(4000, 0.3);
        bp.frequency.exponentialRampToValueAtTime(300, 0.6);
        const g = envGain(ctx, [[0.05, 0.8], [0.55, 0]]);
        src.connect(bp).connect(g).connect(ctx.destination);
        src.start(0);
      }),
  },
  {
    id: 'sfx-riser',
    name: 'Riser',
    category: 'Transition',
    duration: 1.5,
    generate: () =>
      render(1.5, (ctx) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 1.5);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 0.8;
        bp.frequency.setValueAtTime(150, 0);
        bp.frequency.exponentialRampToValueAtTime(6000, 1.45);
        const g = envGain(ctx, [[1.0, 0.7], [1.48, 0]]);
        src.connect(bp).connect(g).connect(ctx.destination);
        src.start(0);
      }),
  },
  {
    id: 'sfx-swoosh-down',
    name: 'Swoosh Down',
    category: 'Transition',
    duration: 0.5,
    generate: () =>
      render(0.5, (ctx) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.5);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 1;
        bp.frequency.setValueAtTime(4000, 0);
        bp.frequency.exponentialRampToValueAtTime(200, 0.45);
        const g = envGain(ctx, [[0.03, 0.7], [0.48, 0]]);
        src.connect(bp).connect(g).connect(ctx.destination);
        src.start(0);
      }),
  },
  {
    id: 'sfx-laser',
    name: 'Laser',
    category: 'Fun',
    duration: 0.3,
    generate: () =>
      render(0.3, (ctx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(2200, 0);
        osc.frequency.exponentialRampToValueAtTime(80, 0.28);
        const g = envGain(ctx, [[0.01, 0.4], [0.28, 0]]);
        osc.connect(g).connect(ctx.destination);
        osc.start(0);
        osc.stop(0.3);
      }),
  },
  {
    id: 'sfx-alarm',
    name: 'Alarm',
    category: 'Fun',
    duration: 1.6,
    generate: () =>
      render(1.6, (ctx) => {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(700, 0);
        for (let t = 0; t < 1.6; t += 0.3) {
          osc.frequency.setValueAtTime(700, t);
          osc.frequency.linearRampToValueAtTime(1000, t + 0.15);
          osc.frequency.linearRampToValueAtTime(700, t + 0.3);
        }
        const g = envGain(ctx, [[0.05, 0.3], [1.5, 0.3], [1.6, 0]]);
        osc.connect(g).connect(ctx.destination);
        osc.start(0);
        osc.stop(1.6);
      }),
  },
  {
    id: 'sfx-boom',
    name: 'Boom',
    category: 'Impact',
    duration: 0.8,
    generate: () =>
      render(0.8, (ctx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, 0);
        osc.frequency.exponentialRampToValueAtTime(35, 0.5);
        const og = envGain(ctx, [[0.01, 0.9], [0.7, 0]]);
        osc.connect(og).connect(ctx.destination);
        osc.start(0);
        osc.stop(0.8);

        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.2);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 800;
        const ng = envGain(ctx, [[0.005, 0.6], [0.18, 0]]);
        src.connect(lp).connect(ng).connect(ctx.destination);
        src.start(0);
      }),
  },
  {
    id: 'sfx-drumroll',
    name: 'Drum Roll',
    category: 'Impact',
    duration: 1.2,
    generate: () =>
      render(1.2, (ctx) => {
        const hp = ctx.createBiquadFilter();
        hp.type = 'bandpass';
        hp.frequency.value = 350;
        hp.connect(ctx.destination);
        let t = 0;
        let interval = 0.09;
        while (t < 1.1) {
          const src = ctx.createBufferSource();
          src.buffer = noiseBuffer(ctx, 0.05);
          const g = envGain(ctx, [[0.005, 0.35], [0.045, 0]]);
          src.connect(g).connect(hp);
          src.start(t);
          t += interval;
          interval *= 0.94;
        }
      }),
  },
  {
    id: 'sfx-applause',
    name: 'Applause',
    category: 'Impact',
    duration: 2.0,
    generate: () =>
      render(2.0, (ctx) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 2.0);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2500;
        bp.Q.value = 0.6;
        const g = envGain(ctx, [[0.3, 0.5], [1.6, 0.5], [2.0, 0]]);
        src.connect(bp).connect(g).connect(ctx.destination);
        src.start(0);
      }),
  },
  {
    id: 'sfx-camera-shutter',
    name: 'Camera Shutter',
    category: 'UI',
    duration: 0.15,
    generate: () =>
      render(0.15, (ctx) => {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1500;
        hp.connect(ctx.destination);
        for (const t of [0, 0.07]) {
          const src = ctx.createBufferSource();
          src.buffer = noiseBuffer(ctx, 0.03);
          const g = envGain(ctx, [[t + 0.002, 0.6], [t + 0.03, 0]]);
          src.connect(g).connect(hp);
          src.start(t);
        }
      }),
  },
  {
    id: 'sfx-success',
    name: 'Success',
    category: 'UI',
    duration: 0.5,
    generate: () =>
      render(0.5, (ctx) => {
        tone(ctx, ctx.destination, 523.25, 0, 0.15, 'sine', 0.45);
        tone(ctx, ctx.destination, 659.25, 0.08, 0.15, 'sine', 0.45);
        tone(ctx, ctx.destination, 1046.5, 0.16, 0.3, 'sine', 0.5);
      }),
  },
  {
    id: 'sfx-error',
    name: 'Error Buzz',
    category: 'UI',
    duration: 0.35,
    generate: () =>
      render(0.35, (ctx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, 0);
        const g = envGain(ctx, [[0.01, 0.35], [0.12, 0], [0.16, 0.35], [0.32, 0]]);
        osc.connect(g).connect(ctx.destination);
        osc.start(0);
        osc.stop(0.35);
      }),
  },
  {
    id: 'sfx-typewriter',
    name: 'Typewriter Key',
    category: 'UI',
    duration: 0.08,
    generate: () =>
      render(0.08, (ctx) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.03);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 3000;
        const g1 = envGain(ctx, [[0.001, 0.4], [0.02, 0]]);
        src.connect(hp).connect(g1).connect(ctx.destination);
        src.start(0);

        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, 0.01);
        const g2 = envGain(ctx, [[0.015, 0.3], [0.07, 0]]);
        osc.connect(g2).connect(ctx.destination);
        osc.start(0.01);
        osc.stop(0.08);
      }),
  },
  {
    id: 'sfx-coin',
    name: 'Coin',
    category: 'Fun',
    duration: 0.3,
    generate: () =>
      render(0.3, (ctx) => {
        tone(ctx, ctx.destination, 988, 0, 0.1, 'square', 0.35);
        tone(ctx, ctx.destination, 1568, 0.07, 0.2, 'square', 0.4);
      }),
  },
  {
    id: 'sfx-powerup',
    name: 'Power Up',
    category: 'Fun',
    duration: 0.7,
    generate: () =>
      render(0.7, (ctx) => {
        const notes = [261.63, 329.63, 392, 523.25, 659.25];
        notes.forEach((f, i) => tone(ctx, ctx.destination, f, i * 0.09, 0.15, 'square', 0.3));
      }),
  },
  {
    id: 'sfx-zap',
    name: 'Zap',
    category: 'Fun',
    duration: 0.25,
    generate: () =>
      render(0.25, (ctx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(3000, 0);
        osc.frequency.exponentialRampToValueAtTime(300, 0.1);
        osc.frequency.exponentialRampToValueAtTime(1800, 0.14);
        osc.frequency.exponentialRampToValueAtTime(150, 0.24);
        const g = envGain(ctx, [[0.005, 0.35], [0.24, 0]]);
        osc.connect(g).connect(ctx.destination);
        osc.start(0);
        osc.stop(0.25);

        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.25);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 4000;
        const ng = envGain(ctx, [[0.01, 0.15], [0.22, 0]]);
        src.connect(hp).connect(ng).connect(ctx.destination);
        src.start(0);
      }),
  },
  {
    id: 'sfx-bubble-pop',
    name: 'Bubble Pop',
    category: 'Fun',
    duration: 0.18,
    generate: () =>
      render(0.18, (ctx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, 0);
        osc.frequency.exponentialRampToValueAtTime(1200, 0.08);
        const g = envGain(ctx, [[0.02, 0.5], [0.1, 0]]);
        osc.connect(g).connect(ctx.destination);
        osc.start(0);
        osc.stop(0.18);
      }),
  },
  {
    id: 'sfx-cash-register',
    name: 'Cash Register',
    category: 'Fun',
    duration: 0.6,
    generate: () =>
      render(0.6, (ctx) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.05);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2500;
        const ng = envGain(ctx, [[0.003, 0.4], [0.05, 0]]);
        src.connect(hp).connect(ng).connect(ctx.destination);
        src.start(0);

        tone(ctx, ctx.destination, 1318.5, 0.08, 0.25, 'sine', 0.4);
        tone(ctx, ctx.destination, 1760, 0.18, 0.35, 'sine', 0.4);
      }),
  },
  {
    id: 'sfx-cinematic-hit',
    name: 'Cinematic Hit',
    category: 'Impact',
    duration: 2.5,
    generate: () =>
      render(2.5, (ctx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(55, 0);
        const g = envGain(ctx, [[0.02, 0.9], [2.2, 0.15], [2.5, 0]]);
        osc.connect(g).connect(ctx.destination);
        osc.start(0);
        osc.stop(2.5);

        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.3);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 500;
        const ng = envGain(ctx, [[0.01, 0.7], [0.28, 0]]);
        src.connect(lp).connect(ng).connect(ctx.destination);
        src.start(0);

        const src2 = ctx.createBufferSource();
        src2.buffer = noiseBuffer(ctx, 2.3);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1500;
        bp.Q.value = 0.5;
        const ng2 = envGain(ctx, [[0.3, 0.15], [2.3, 0]]);
        src2.connect(bp).connect(ng2).connect(ctx.destination);
        src2.start(0.2);
      }),
  },
  {
    id: 'sfx-heartbeat',
    name: 'Heartbeat',
    category: 'Impact',
    duration: 1.0,
    generate: () =>
      render(1.0, (ctx) => {
        for (const t of [0, 0.35]) {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(90, t);
          osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
          const g = envGain(ctx, [[t + 0.01, 0.8], [t + 0.2, 0]]);
          osc.connect(g).connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.22);
        }
      }),
  },
  {
    id: 'sfx-wind-gust',
    name: 'Wind Gust',
    category: 'Nature',
    duration: 2.5,
    generate: () =>
      render(2.5, (ctx) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 2.5);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 0.6;
        bp.frequency.setValueAtTime(300, 0);
        bp.frequency.linearRampToValueAtTime(700, 1.2);
        bp.frequency.linearRampToValueAtTime(250, 2.5);
        const g = envGain(ctx, [[0.5, 0.5], [1.3, 0.6], [2.4, 0]]);
        src.connect(bp).connect(g).connect(ctx.destination);
        src.start(0);
      }),
  },
  {
    id: 'sfx-thunder',
    name: 'Thunder Rumble',
    category: 'Nature',
    duration: 3.0,
    generate: () =>
      render(3.0, (ctx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(45, 0);
        osc.frequency.linearRampToValueAtTime(25, 3.0);
        const g = envGain(ctx, [[0.1, 0.6], [1.5, 0.4], [2.9, 0]]);
        osc.connect(g).connect(ctx.destination);
        osc.start(0);
        osc.stop(3.0);

        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 3.0);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 300;
        const ng = envGain(ctx, [[0.05, 0.5], [1.8, 0.3], [2.9, 0]]);
        src.connect(lp).connect(ng).connect(ctx.destination);
        src.start(0);
      }),
  },
  {
    id: 'sfx-rain',
    name: 'Rain',
    category: 'Nature',
    duration: 3.0,
    generate: () =>
      render(3.0, (ctx) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 3.0);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2000;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 8000;
        const g = envGain(ctx, [[0.3, 0.25], [2.7, 0.25], [3.0, 0]]);
        src.connect(hp).connect(lp).connect(g).connect(ctx.destination);
        src.start(0);
      }),
  },
  {
    id: 'sfx-scanner',
    name: 'Scanner',
    category: 'Sci-Fi',
    duration: 1.2,
    generate: () =>
      render(1.2, (ctx) => {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        for (let t = 0; t < 1.2; t += 0.2) {
          osc.frequency.setValueAtTime(600, t);
          osc.frequency.exponentialRampToValueAtTime(1800, t + 0.15);
        }
        const g = envGain(ctx, [[0.05, 0.2], [1.1, 0.2], [1.2, 0]]);
        osc.connect(g).connect(ctx.destination);
        osc.start(0);
        osc.stop(1.2);
      }),
  },
  {
    id: 'sfx-teleport',
    name: 'Teleport',
    category: 'Sci-Fi',
    duration: 0.9,
    generate: () =>
      render(0.9, (ctx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, 0);
        osc.frequency.exponentialRampToValueAtTime(2400, 0.35);
        osc.frequency.exponentialRampToValueAtTime(80, 0.85);
        const g = envGain(ctx, [[0.02, 0.4], [0.35, 0.4], [0.85, 0]]);
        osc.connect(g).connect(ctx.destination);
        osc.start(0);
        osc.stop(0.9);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(2000, 0);
        osc2.frequency.exponentialRampToValueAtTime(4000, 0.3);
        osc2.frequency.exponentialRampToValueAtTime(1000, 0.85);
        const g2 = envGain(ctx, [[0.02, 0.15], [0.3, 0.15], [0.85, 0]]);
        osc2.connect(g2).connect(ctx.destination);
        osc2.start(0);
        osc2.stop(0.9);
      }),
  },
  {
    id: 'sfx-force-field',
    name: 'Force Field',
    category: 'Sci-Fi',
    duration: 1.0,
    generate: () =>
      render(1.0, (ctx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, 0);
        const g = envGain(ctx, [[0.05, 0.25], [0.9, 0.2], [1.0, 0]]);
        osc.connect(g).connect(ctx.destination);
        osc.start(0);
        osc.stop(1.0);

        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 1.0);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1200;
        bp.Q.value = 3;
        const ng = envGain(ctx, [[0.05, 0.2], [0.9, 0.15], [1.0, 0]]);
        src.connect(bp).connect(ng).connect(ctx.destination);
        src.start(0);
      }),
  },
];

export function getSfxDef(id: string): SfxDef | undefined {
  return SOUND_EFFECTS.find((s) => s.id === id);
}

export interface RenderedSfx {
  url: string;
  duration: number;
}

const renderedCache = new Map<string, Promise<RenderedSfx>>();

/** Renders (and memoizes) a sound effect to a playable object URL. */
export function renderAndCacheSfx(id: string): Promise<RenderedSfx> {
  let promise = renderedCache.get(id);
  if (!promise) {
    const def = getSfxDef(id);
    if (!def) return Promise.reject(new Error(`Unknown sound effect: ${id}`));
    promise = def.generate().then((buffer) => {
      const blob = audioBufferToWav(buffer);
      return { url: URL.createObjectURL(blob), duration: buffer.duration };
    });
    renderedCache.set(id, promise);
  }
  return promise;
}
