// Sound effects, synthesised with the Web Audio API (no audio files, like the radio in audio.ts).
// startSfx() listens to the game and plays the right sound for button taps, the phone opening, money
// in and out, toasts, police, potholes, driving, getting high and getting kidnapped.

import { useGame } from './store';
import { useDrive } from './drive';
import { driveState } from './driveState';
import { useVice } from '../net/vice';
import { useCaught } from './caughtScenes';
import { useVisit } from './visits';

export type SfxName =
  | 'tap' | 'tick' | 'open' | 'close' | 'success' | 'error' | 'coin' | 'spend' | 'register' | 'notify'
  | 'siren' | 'clang' | 'thud' | 'engine' | 'whoosh' | 'stamp' | 'high' | 'danger'
  | 'back' | 'confirm' | 'swipe' | 'alarm' | 'beep' | 'camera' | 'creak' | 'rustle' | 'loot' | 'gavel' | 'unlock' | 'arrest';

const KEY_ON = 'kaduna-sfx-on';
const KEY_VOL = 'kaduna-sfx-volume';

const read = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = new Map<string, number>();
  private on = read(KEY_ON, 'true') !== 'false';
  private vol = Math.min(1, Math.max(0, Number(read(KEY_VOL, '0.6')) || 0.6));

  get enabled() {
    return this.on;
  }
  get volume() {
    return this.vol;
  }
  setEnabled(on: boolean) {
    this.on = on;
    try { localStorage.setItem(KEY_ON, String(on)); } catch { /* storage blocked */ }
    if (on) this.play('tick');
  }
  setVolume(v: number) {
    this.vol = Math.min(1, Math.max(0, v));
    try { localStorage.setItem(KEY_VOL, String(this.vol)); } catch { /* storage blocked */ }
    if (this.master && this.ctx) this.master.gain.setValueAtTime(this.vol, this.ctx.currentTime);
  }

  private init() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.vol;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** A single enveloped oscillator note. */
  private tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.25, slideTo?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A burst of filtered noise (thuds, clangs, whooshes). */
  private noise(start: number, dur: number, freq: number, gain = 0.3, type: BiquadFilterType = 'lowpass', sweepTo?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + start;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t);
  }

  /** Per-sound minimum gap so a burst of events doesn't turn into a wall of noise. */
  private static GAP: Partial<Record<SfxName, number>> = { tap: 40, tick: 40, coin: 400, spend: 250, register: 600, notify: 500, siren: 2500, thud: 500, error: 300, success: 300,
    back: 60, confirm: 120, swipe: 60, alarm: 1500, beep: 700, camera: 900, creak: 1500, rustle: 400, loot: 400, gavel: 1000, unlock: 1000, arrest: 3000 };

  play(name: SfxName) {
    if (!this.on || this.vol <= 0) return;
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < (Sfx.GAP[name] ?? 80)) return;
    this.last.set(name, now);
    if (!this.init()) return;
    switch (name) {
      case 'tap':
        return this.tone(820, 0, 0.05, 'sine', 0.12, 620);
      case 'tick':
        return this.tone(1100, 0, 0.035, 'triangle', 0.1);
      case 'open':
        this.noise(0, 0.14, 500, 0.08, 'bandpass', 2400);
        return this.tone(420, 0, 0.12, 'sine', 0.12, 780);
      case 'close':
        this.noise(0, 0.12, 2200, 0.07, 'bandpass', 500);
        return this.tone(700, 0, 0.1, 'sine', 0.1, 360);
      case 'success':
        this.tone(660, 0, 0.12, 'triangle', 0.2);
        return this.tone(990, 0.1, 0.22, 'triangle', 0.2);
      case 'error':
        this.tone(170, 0, 0.14, 'square', 0.12);
        return this.tone(130, 0.16, 0.2, 'square', 0.12);
      case 'coin':
        this.tone(1568, 0, 0.1, 'sine', 0.18);
        return this.tone(2093, 0.07, 0.28, 'sine', 0.18);
      case 'spend':
        this.tone(988, 0, 0.1, 'sine', 0.14);
        return this.tone(659, 0.08, 0.18, 'sine', 0.14);
      case 'register':
        this.noise(0, 0.05, 3000, 0.2, 'highpass');
        this.tone(1319, 0.06, 0.08, 'sine', 0.2);
        this.tone(1760, 0.14, 0.12, 'sine', 0.2);
        return this.tone(2637, 0.24, 0.4, 'sine', 0.18);
      case 'notify':
        this.tone(880, 0, 0.35, 'sine', 0.16);
        return this.tone(1320, 0.04, 0.3, 'sine', 0.1);
      case 'siren':
        for (let i = 0; i < 4; i++) this.tone(i % 2 ? 960 : 720, i * 0.28, 0.27, 'sawtooth', 0.09);
        return;
      case 'clang':
        this.noise(0, 0.25, 4000, 0.3, 'highpass');
        this.tone(210, 0, 0.7, 'square', 0.14);
        return this.tone(317, 0, 0.6, 'square', 0.1);
      case 'thud':
        this.noise(0, 0.16, 400, 0.45, 'lowpass');
        return this.tone(110, 0, 0.18, 'sine', 0.35, 45);
      case 'engine':
        this.tone(55, 0, 0.5, 'sawtooth', 0.1, 130);
        return this.noise(0, 0.4, 300, 0.12, 'lowpass', 900);
      case 'whoosh':
        return this.noise(0, 0.35, 400, 0.14, 'bandpass', 3000);
      case 'stamp':
        this.noise(0, 0.07, 700, 0.4, 'lowpass');
        return this.tone(150, 0, 0.12, 'sine', 0.3, 70);
      case 'high':
        for (let i = 0; i < 5; i++) this.tone(300 + i * 80, i * 0.12, 0.3, 'sine', 0.12, 280 + i * 70);
        return;
      case 'danger':
        this.tone(110, 0, 0.5, 'sawtooth', 0.15, 80);
        return this.tone(116, 0.02, 0.5, 'sawtooth', 0.12, 84);
      case 'back':
        return this.tone(520, 0, 0.07, 'sine', 0.12, 360);
      case 'confirm':
        this.tone(523, 0, 0.07, 'triangle', 0.16);
        return this.tone(784, 0.06, 0.13, 'triangle', 0.16);
      case 'swipe':
        return this.noise(0, 0.09, 1500, 0.06, 'bandpass', 3200);
      case 'alarm':
        // A fast two-tone burglar alarm.
        for (let i = 0; i < 8; i++) this.tone(i % 2 ? 660 : 990, i * 0.13, 0.12, 'square', 0.1);
        return this.tone(90, 0, 1, 'sawtooth', 0.08, 70);
      case 'beep':
        this.tone(1400, 0, 0.07, 'square', 0.09);
        return this.tone(1400, 0.13, 0.07, 'square', 0.09);
      case 'camera':
        // Shutter click, a tiny servo whirr, a red-light blip.
        this.noise(0, 0.03, 5000, 0.25, 'highpass');
        this.noise(0.08, 0.04, 3000, 0.2, 'highpass');
        this.tone(300, 0.12, 0.18, 'sawtooth', 0.04, 520);
        return this.tone(2200, 0.3, 0.06, 'square', 0.07);
      case 'creak':
        this.noise(0, 0.55, 900, 0.07, 'bandpass', 450);
        this.tone(170, 0, 0.5, 'sawtooth', 0.05, 330);
        return this.tone(260, 0.28, 0.3, 'sawtooth', 0.04, 140);
      case 'rustle':
        for (let i = 0; i < 4; i++) this.noise(i * 0.11, 0.09, 3000, 0.08, 'bandpass', 5500);
        return;
      case 'loot':
        this.tone(392, 0, 0.09, 'triangle', 0.16);
        this.tone(523, 0.08, 0.09, 'triangle', 0.16);
        this.tone(784, 0.16, 0.28, 'triangle', 0.18);
        return this.noise(0.16, 0.12, 4000, 0.08, 'highpass');
      case 'gavel':
        for (let i = 0; i < 2; i++) {
          this.noise(i * 0.24, 0.07, 700, 0.45, 'lowpass');
          this.tone(130, i * 0.24, 0.14, 'sine', 0.4, 60);
        }
        return;
      case 'unlock':
        this.tone(900, 0, 0.05, 'square', 0.08);
        this.tone(1300, 0.08, 0.05, 'square', 0.08);
        this.noise(0.16, 0.1, 800, 0.22, 'lowpass');
        this.tone(660, 0.3, 0.12, 'triangle', 0.18);
        return this.tone(990, 0.4, 0.25, 'triangle', 0.18);
      case 'arrest':
        // Police siren wail rising and falling, ending on a cell door.
        for (let i = 0; i < 4; i++) this.tone(i % 2 ? 1000 : 640, i * 0.5, 0.5, 'sawtooth', 0.09, i % 2 ? 640 : 1000);
        this.noise(2, 0.25, 4000, 0.3, 'highpass');
        return this.tone(210, 2, 0.7, 'square', 0.12);
    }
  }
}

export const sfx = new Sfx();

/** Pick a sound for a toast from what it says. */
export function toastSound(text: string): SfxName {
  if (/cctv|📹|burgled your|picked your pocket|caught you/i.test(text)) return 'alarm';
  if (/arrest|police|🚔|🚨|busted|raid|sting|cell\b/i.test(text)) return 'siren';
  if (/stole |🥷/i.test(text)) return 'loot';
  if (/kidnap|hostage|ransom/i.test(text)) return 'danger';
  if (/💥|gbam|pothole|burst tyre|flat tyre|axle/i.test(text)) return 'thud';
  if (/^(you need|you can|can.t|not enough|⚠️|❌|😩|couldn)|isn.t |didn.t go through|too exhausted/i.test(text)) return 'error';
  if (/won|prize|paid you|earned|\+₦|sold|collected|💰|🏆|🤑|🎉|rescued|free/i.test(text)) return 'coin';
  if (/high|🌿/i.test(text)) return 'high';
  return 'notify';
}

/** Wire the sounds to the game. Returns a cleanup. */
export function startSfx() {
  // Every button press, caught once at the document so every screen gets it.
  const onClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement | null)?.closest?.('button, [role="button"], [role="switch"], input[type="checkbox"], .tile, summary');
    if (!el || (el as HTMLButtonElement).disabled || el.classList.contains('drive-pad')) return;
    if (el.closest('[data-nosound]')) return;
    const label = `${el.getAttribute('aria-label') ?? ''} ${(el.textContent ?? '').trim().slice(0, 24)}`;
    if (el.matches('[role="switch"], input[type="checkbox"]')) sfx.play('tick');
    else if (el.matches('.tabs button')) sfx.play('swipe');
    else if (/^\W*(close|back|cancel|dismiss|no thanks|not now|×|✕|x)\W*$/i.test(label.trim()) || el.matches('.close, .back, .sheet-close')) sfx.play('back');
    else if (el.matches('.btn:not(.ghost):not(.sm), button.primary')) sfx.play('confirm');
    else sfx.play('tap');
  };
  document.addEventListener('click', onClick, true);

  let prev = useGame.getState();
  const unsubGame = useGame.subscribe((s) => {
    const p = prev;
    prev = s;
    if (!s.started) return;
    if (s.panel !== p.panel) {
      if (s.panel) sfx.play('open');
      else if (p.panel) sfx.play('close');
    }
    if (p.jailedUntil && !s.jailedUntil) sfx.play('unlock');
    const dm = s.money - p.money;
    if (dm >= 50_000) sfx.play('register');
    else if (dm >= 500) sfx.play('coin');
    else if (dm <= -500 && dm > -5_000_000) sfx.play('spend');
    if (s.jailedUntil && !p.jailedUntil) {
      sfx.play('gavel');
      setTimeout(() => sfx.play('clang'), 600);
    }
    if (s.streetStory && !p.streetStory) sfx.play('notify');
    if (s.toasts.length > p.toasts.length) {
      const t = s.toasts[s.toasts.length - 1];
      if (t) sfx.play(toastSound(t.text));
    }
    if ((s.stats.potholes ?? 0) > (p.stats.potholes ?? 0)) sfx.play('thud');
    if (s.view !== p.view && (s.view === 'place' || p.view === 'place')) sfx.play('whoosh');
    if (s.task?.phase === 'walking' && p.task?.phase !== 'walking' && s.task.travelMode && s.task.travelMode !== 'walk') sfx.play('engine');
  });

  const unsubDrive = useDrive.subscribe((s, p) => {
    if (s.vehicle && !p.vehicle && s.vehicle !== 'horse') sfx.play('engine');
    if (s.checkpoint && !p.checkpoint) sfx.play('siren');
    if (s.passenger?.boarded && !p.passenger?.boarded) sfx.play('tick');
    if (p.passenger && !s.passenger && s.trips > p.trips) sfx.play('coin');
  });

  const unsubVice = useVice.subscribe((s, p) => {
    if (s.dui && !p.dui) sfx.play('siren');
    if (s.me.heldUntil && !p.me.heldUntil) sfx.play('danger');
    if (s.me.highUntil && !p.me.highUntil) sfx.play('high');
  });

  // Burglary: the door creaks as you sneak in, then the alarm and the sirens if they catch you.
  const unsubVisit = useVisit.subscribe((s, p) => {
    if (s.current?.burglary && !p.current?.burglary) sfx.play('creak');
  });
  const unsubCaught = useCaught.subscribe((s, p) => {
    if (s.active && !p.active) sfx.play(s.cause === 'camera' ? 'camera' : 'alarm');
    if (s.active && s.cause === 'camera' && !p.active) setTimeout(() => sfx.play('alarm'), 450);
    if (s.arrest && !p.arrest) sfx.play('arrest');
    if (s.active && s.step !== p.step && s.step === 'result') sfx.play('stamp');
  });

  // A bump you can hear: driveState.bump jumps to 1 on a pothole (stats cover it on foot-free drives too).
  let lastBump = 0;
  const bumpTimer = setInterval(() => {
    if (driveState.bump > 0.9 && lastBump <= 0.9) sfx.play('thud');
    lastBump = driveState.bump;
  }, 60);

  return () => {
    document.removeEventListener('click', onClick, true);
    unsubGame();
    unsubDrive();
    unsubVice();
    unsubVisit();
    unsubCaught();
    clearInterval(bumpTimer);
  };
}
