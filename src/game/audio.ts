// Naija City Background Music & Sound System
// Uses the Web Audio API to synthesize calm Arewa lofi with zero external assets: a slow warm pad, soft FM keys, a
// kalimba line and a round bass, all through a small room reverb.
// That synth is the game's music. Live FM stations are the radio: they only play where there is one
// (house speakers, the club: see radio.ts) and the music steps aside while they do.

import { sfx } from './sfx';

export type RadioStation = 'arewa' | 'kannywood' | 'talk';

export interface LiveStation {
  id: string;
  name: string;
  freq: string;
  url: string;
  city: string;
  genre: string;
}

export const LIVE_STATIONS: LiveStation[] = [
  // Lagos
  { id: 'cool-fm', name: 'Cool FM', freq: '96.9', url: 'https://coolfmlagos969-atunwadigital.streamguys1.com/coolfmlagos969', city: 'Lagos', genre: 'Hits' },
  { id: 'wazobia-fm', name: 'Wazobia FM', freq: '95.1', url: 'https://wazobiafmlagos951-atunwadigital.streamguys1.com/wazobiafmlagos951', city: 'Lagos', genre: 'Pidgin' },
  { id: 'metro-fm', name: 'Metro FM', freq: '97.7', url: 'https://go.webgateready.com/metrofm/radio.mp3', city: 'Lagos', genre: 'Music' },
  { id: 'bond-fm', name: 'Bond FM', freq: '92.9', url: 'https://go.webgateready.com/bondfm', city: 'Lagos', genre: 'Music' },
  { id: 'goradio', name: 'GoRadio', freq: '98.3', url: 'https://online.goradio.com.ng/listen/gr/radio.mp3', city: 'Lagos', genre: 'Afrobeat / Highlife' },
  // Abuja
  { id: 'kcity', name: 'KCity Radio', freq: '89.5', url: 'https://radio.gotright.net/radio/8010/radio.mp3', city: 'Abuja', genre: 'Urban' },
  { id: 'nigeria-info', name: 'Nigeria Info', freq: '99.3', url: 'https://nigeriainfofmlagos993-atunwadigital.streamguys1.com/nigeriainfofmlagos993', city: 'Abuja', genre: 'News / Talk' },
  // Northern / Hausa
  { id: 'freedom-kaduna', name: 'Freedom Radio', freq: '99.5', url: 'https://stream.zeno.fm/5z9v4k7e9mzuv', city: 'Kaduna', genre: 'Hausa / News' },
  { id: 'nagari', name: 'Nagari Radio', freq: '92.1', url: 'https://stream.zeno.fm/287z97ksdg8uv', city: 'Kaduna', genre: 'Entertainment' },
  // Club / Vibes
  { id: 'interspace', name: 'InterSpace', freq: '105.3', url: 'https://radio.interspacemusic.com/stream.mp3', city: 'PH', genre: 'Amapiano / Club' },
  { id: 'softlife', name: 'Softlife', freq: '101.7', url: 'https://a10.asurahosting.com:7540/radio.mp3', city: 'Uyo', genre: 'Afrobeats / Amapiano' },
  { id: 'majorfm', name: 'MajorFM', freq: '103.5', url: 'https://stream.zeno.fm/pkza99xshkhvv', city: 'Lagos', genre: 'DJ Mixes / R&B' },
];

const GESTURES = ['click', 'keydown', 'pointerup', 'touchend'] as const;

class AudioManager {
  private ctx: AudioContext | null = null;
  // Background music is on until the player switches it off
  private _musicOn = localStorage.getItem('kaduna-music-enabled') !== 'false';
  private masterGain: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  private currentVolume = 0.35;
  private station: RadioStation = 'arewa';

  // Live radio streaming
  private liveAudio: HTMLAudioElement | null = null;
  private liveStation: LiveStation | null = null;
  private _liveLoading = false;
  private _liveError: string | null = null;
  private _lastLiveId: string | null = null;
  // A station the browser refused to start without a gesture: it starts on the player's next tap or key
  private pendingLive: LiveStation | null = null;
  private gestureArmed = false;
  // Sound belongs to the game world: nothing starts on the sign-in or title screens, where there's no control for it.
  private inGame = false;

  // Tiny store so the UI can follow what the radio is really doing (see RadioPill.tsx)
  private listeners = new Set<() => void>();
  private version = 0;
  public subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  public getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  // Two bars per chord, F major: Fmaj9 → Dm9 → Bb6/9 → C9sus. Each is [bass, ...voicing] in Hz.
  private chords = [
    [87.31, 220.0, 261.63, 329.63, 392.0],
    [73.42, 174.61, 220.0, 261.63, 329.63],
    [58.27, 220.0, 261.63, 293.66, 349.23],
    [65.41, 233.08, 293.66, 329.63, 392.0],
  ];
  // F major pentatonic, F4 to F5, for the kalimba line.
  private melody = [349.23, 392.0, 440.0, 523.25, 587.33, 698.46];
  private melodyAt = 2;
  // The music's own bus: voices → (dry + reverb) → a warm lowpass → master. Faded, not cut, when the music stops.
  private bus: GainNode | null = null;
  private reverb: GainNode | null = null;
  // Look-ahead scheduling: notes go on the audio clock, so the timer's jitter never reaches the beat.
  private nextAt = 0;

  constructor() {
    // Restore last station from localStorage
    this._lastLiveId = localStorage.getItem('kaduna-last-station');
  }

  // Browsers only let audio start from a real gesture. touchstart and some keys (Esc, modifiers) don't
  // count, so the listeners stay on until a stream is actually playing instead of firing once.
  private onGesture = (e: Event) => {
    const station = this.pendingLive;
    if (!station || !this.inGame) return;
    // A tap on a control is followed by its own click: let that handler run first, then the click lands here.
    if (e.type !== 'click' && e.type !== 'keydown' && (e.target as Element | null)?.closest?.('button, a, input, label, [role="button"]')) return;
    this.tune(station, true, new Set());
  };

  private armGesture() {
    if (this.gestureArmed) return;
    this.gestureArmed = true;
    for (const ev of GESTURES) window.addEventListener(ev, this.onGesture);
  }

  private disarmGesture() {
    if (!this.gestureArmed) return;
    this.gestureArmed = false;
    for (const ev of GESTURES) window.removeEventListener(ev, this.onGesture);
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.currentVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /** The background music switch (the synth). It goes quiet while a radio plays and comes back after. */
  public get musicOn(): boolean {
    return this._musicOn;
  }

  public get selectedStation(): RadioStation {
    return this.station;
  }

  public setStation(station: RadioStation) {
    this.station = station;
    this.step = 0;
    this.emit();
  }

  public toggleMusic(): boolean {
    this._musicOn = !this._musicOn;
    localStorage.setItem('kaduna-music-enabled', String(this._musicOn));
    this.syncMusic();
    this.emit();
    return this._musicOn;
  }

  /** The player has dropped into the world (called from the tap that closes the title screen, so sound may start). */
  public enterGame() {
    this.inGame = true;
    this.syncMusic();
  }

  /** Back at the sign-in / title screens: go quiet. */
  public leaveGame() {
    this.inGame = false;
    this.stopRadio();
  }

  /** Jump to the next (or previous) live station from the one playing. Returns the station it tunes to. */
  public skipLive(dir: 1 | -1 = 1) {
    const id = this.liveStation?.id ?? this._lastLiveId;
    const idx = LIVE_STATIONS.findIndex((s) => s.id === id);
    const next = LIVE_STATIONS[(idx + dir + LIVE_STATIONS.length) % LIVE_STATIONS.length];
    if (next) this.tune(next, true, new Set(), dir);
    return next;
  }

  /** Starts or stops the synth so it plays exactly when it should: in the game, switched on, no radio. */
  private syncMusic() {
    const want = this.inGame && this._musicOn && !this.liveStation && !this.pendingLive;
    if (want === (this.timer !== null)) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      // Let what is ringing fade out instead of cutting it off.
      if (this.ctx && this.bus) this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      return;
    }
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      this.musicBus();
      this.bus!.gain.cancelScheduledValues(this.ctx.currentTime);
      this.bus!.gain.setTargetAtTime(1, this.ctx.currentTime, 0.3);
      this.step = 0;
      this.nextAt = this.ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.tick(), 50);
    } catch {
      // Audio context might be restricted before gesture
    }
  }

  public setVolume(vol: number) {
    this.currentVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.currentVolume, this.ctx.currentTime, 0.05);
    }
    if (this.liveAudio) {
      this.liveAudio.volume = this.currentVolume;
    }
  }

  /** Builds the music bus once: a short generated room reverb on a send, and a gentle lowpass to take the edge off. */
  private musicBus() {
    if (this.bus || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 4200;
    tone.Q.value = 0.4;
    tone.connect(this.masterGain);
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(tone);
    // 2.4 s of decaying stereo noise is the room. Made once; the convolver does the rest.
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    conv.connect(wet);
    wet.connect(this.bus);
    this.reverb = ctx.createGain();
    this.reverb.connect(conv);
  }

  /** A voice's way out: straight to the bus, and `send` of it into the reverb. */
  private out(node: AudioNode, send: number) {
    node.connect(this.bus!);
    if (send > 0 && this.ctx) {
      const g = this.ctx.createGain();
      g.gain.value = send;
      node.connect(g);
      g.connect(this.reverb!);
    }
  }

  // Slow, warm pad: two softly detuned saws per note, filtered dark, swelling in and out.
  private playPad(notes: number[], time: number, duration: number, vel = 0.01) {
    if (!this.ctx || !this.bus) return;
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.3;
    filter.frequency.setValueAtTime(380, time);
    filter.frequency.linearRampToValueAtTime(900, time + duration * 0.5);
    filter.frequency.linearRampToValueAtTime(420, time + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vel, time + 1.4);
    gain.gain.setValueAtTime(vel, time + duration - 1.2);
    gain.gain.linearRampToValueAtTime(0, time + duration + 0.6);
    filter.connect(gain);
    this.out(gain, 0.6);
    for (const f of notes) {
      for (const cents of [-7, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = cents;
        osc.connect(filter);
        osc.start(time);
        osc.stop(time + duration + 0.7);
      }
    }
  }

  // Soft electric-piano note: a sine with a sine modulating it, the bell fading out fast so it settles to a round tone.
  private playKeys(freq: number, time: number, vel = 0.03) {
    if (!this.ctx || !this.bus) return;
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const depth = ctx.createGain();
    const gain = ctx.createGain();
    car.type = mod.type = 'sine';
    car.frequency.value = freq;
    mod.frequency.value = freq;
    depth.gain.setValueAtTime(freq * 1.1, time);
    depth.gain.exponentialRampToValueAtTime(freq * 0.05, time + 0.5);
    mod.connect(depth);
    depth.connect(car.frequency);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vel, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 2.2);
    car.connect(gain);
    this.out(gain, 0.45);
    car.start(time);
    mod.start(time);
    car.stop(time + 2.3);
    mod.stop(time + 2.3);
  }

  // Kalimba: a sine that rings out, with the metal tine's high partial as a quick tick on top.
  private playKalimba(freq: number, time: number, vel = 0.05) {
    if (!this.ctx || !this.bus) return;
    const ctx = this.ctx;
    const body = ctx.createOscillator();
    const tine = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    const tineGain = ctx.createGain();
    body.type = tine.type = 'sine';
    body.frequency.value = freq;
    tine.frequency.value = freq * 5.4;
    bodyGain.gain.setValueAtTime(0.0001, time);
    bodyGain.gain.linearRampToValueAtTime(vel, time + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 1.4);
    tineGain.gain.setValueAtTime(vel * 0.35, time);
    tineGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
    body.connect(bodyGain);
    tine.connect(tineGain);
    this.out(bodyGain, 0.5);
    this.out(tineGain, 0.5);
    body.start(time);
    tine.start(time);
    body.stop(time + 1.5);
    tine.stop(time + 0.1);
  }

  // Round, soft bass: a sine with a gentle attack, so it hums instead of thumping.
  private playBass(freq: number, time: number, duration: number, vel = 0.13) {
    if (!this.ctx || !this.bus) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vel, time + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain);
    this.out(gain, 0);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  // A muffled kick and a brushed shaker, quiet enough to sit under everything.
  private playKick(time: number, vel = 0.09) {
    if (!this.ctx || !this.bus) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.12);
    gain.gain.setValueAtTime(vel, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    osc.connect(gain);
    this.out(gain, 0);
    osc.start(time);
    osc.stop(time + 0.32);
  }

  private shakerNoise: AudioBuffer | null = null;
  private playShaker(time: number, vel = 0.008) {
    if (!this.ctx || !this.bus) return;
    const ctx = this.ctx;
    if (!this.shakerNoise) {
      this.shakerNoise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
      const d = this.shakerNoise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.shakerNoise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 6500;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vel, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
    src.connect(filter);
    filter.connect(gain);
    this.out(gain, 0.2);
    src.start(time);
    src.stop(time + 0.08);
  }

  // --- Live radio streaming ---
  public get liveLoading() { return this._liveLoading; }
  public get liveError() { return this._liveError; }
  public get currentLiveStation() { return this.liveStation; }

  /** Tune a live station. With `fallback`, a dead stream rolls on to the next station instead of going silent. */
  public playLive(station: LiveStation, opts: { fallback?: boolean } = {}) {
    this.tune(station, !!opts.fallback, new Set());
  }

  private tune(station: LiveStation, fallback: boolean, tried: Set<string>, dir: 1 | -1 = 1) {
    // Stop previous live stream
    this.stopLive();

    this.pendingLive = null;
    this.liveStation = station;
    this._liveLoading = true;
    this._liveError = null;
    // The radio takes over from the background music
    this.syncMusic();

    const el = new Audio();
    el.volume = this.currentVolume;
    el.src = station.url;
    this.liveAudio = el;

    // Everything below belongs to this element only: a stream we've since tuned away from must not
    // touch the state of the one that replaced it.
    const current = () => this.liveAudio === el;
    let started = false;

    const fail = (error: string) => {
      if (!current()) return;
      clearTimeout(timeout);
      tried.add(station.id);
      if (fallback && tried.size < LIVE_STATIONS.length) {
        let i = LIVE_STATIONS.indexOf(station);
        let next = station;
        do { i = (i + dir + LIVE_STATIONS.length) % LIVE_STATIONS.length; next = LIVE_STATIONS[i]; } while (tried.has(next.id));
        this.tune(next, true, tried, dir);
        return;
      }
      this.stopLive();
      this._liveError = error;
      this.syncMusic();
      this.emit();
    };

    // Timeout after 12s if nothing happens
    const timeout = window.setTimeout(() => { if (!started) fail('Stream timed out'); }, 12000);

    el.addEventListener('playing', () => {
      if (!current() || started) return;
      started = true;
      clearTimeout(timeout);
      this._liveLoading = false;
      this._liveError = null;
      // Only a station that really plays is remembered for next time
      this._lastLiveId = station.id;
      localStorage.setItem('kaduna-last-station', station.id);
      this.disarmGesture();
      this.emit();
    });

    const dropped = () => {
      if (!current()) return;
      if (started) {
        // Stream died mid-play: reconnect, rolling on to another station if this one is gone
        window.setTimeout(() => { if (current()) this.tune(station, true, new Set()); }, 1500);
        return;
      }
      // Delay error slightly — some streams fire a transient error before connecting
      window.setTimeout(() => { if (!started) fail('Stream unavailable'); }, 3000);
    };
    el.addEventListener('error', dropped, { once: true });
    el.addEventListener('ended', dropped, { once: true });

    el.play().catch((err: unknown) => {
      if (!current()) return;
      const name = (err as { name?: string } | null)?.name;
      if (name === 'AbortError') return;
      if (name === 'NotAllowedError') {
        // No gesture yet: stay off and start on the player's next tap or key
        clearTimeout(timeout);
        this.stopLive();
        this.pendingLive = station;
        this.armGesture();
        this.emit();
        return;
      }
      fail('Stream unavailable');
    });

    this.emit();
  }

  /** Radio off. The background music comes back if it's switched on. */
  public stopRadio() {
    // Remember which live station was playing before stopping
    if (this.liveStation) this._lastLiveId = this.liveStation.id;
    this.pendingLive = null;
    this.disarmGesture();
    this.stopLive();
    this.syncMusic();
    this.emit();
  }

  private stopLive() {
    if (this.liveAudio) {
      this.liveAudio.pause();
      this.liveAudio.src = '';
      this.liveAudio = null;
    }
    this.liveStation = null;
    this._liveLoading = false;
    this._liveError = null;
  }

  /** A live station is on (playing or still tuning). */
  public get radioOn() { return this.liveStation !== null; }
  public get lastLiveId() { return this._lastLiveId; }

  // Sound effect: Car horn (respects SFX mute)
  public honk() {
    try {
      if (!sfx.enabled || sfx.volume <= 0) return;
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      [420, 520].forEach((freq) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now);
        osc.stop(now + 0.3);
      });
    } catch {
      // ignore
    }
  }

  /** Schedules every 16th note that falls in the next 150 ms on the audio clock. */
  private tick() {
    // A suspended context's clock stands still: notes scheduled now would all sound at once when it wakes
    if (!this.ctx || this.timer === null || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Back from a pause (a hidden tab throttles the timer): pick up from now, don't rush to catch up.
    if (this.nextAt < now) this.nextAt = now + 0.05;
    // 16th notes: 72 BPM, slower still for the Kannywood mood.
    const stepDur = 60 / (this.station === 'kannywood' ? 64 : 72) / 4;
    while (this.nextAt < now + 0.15) {
      this.playStep(this.step, this.nextAt, stepDur);
      this.nextAt += stepDur;
      this.step = (this.step + 1) % 128;
    }
  }

  private playStep(step: number, t: number, stepDur: number) {
    const bar = Math.floor(step / 16);
    const sub = step % 16;
    const [bass, ...voicing] = this.chords[Math.floor(bar / 2) % this.chords.length];
    const chordLen = stepDur * 32;

    if (this.station === 'talk') {
      // Talk radio bed: just the pad, very low, and a stray kalimba note now and then.
      if (step % 32 === 0) this.playPad(voicing, t, chordLen, 0.005);
      if (sub === 8 && Math.random() < 0.3) this.playKalimba(this.melody[Math.floor(Math.random() * 4)], t, 0.025);
      return;
    }
    const cinematic = this.station === 'kannywood';

    // Each chord: the pad swells across both bars, the keys lay it down once per bar.
    if (step % 32 === 0) this.playPad(voicing, t, chordLen, cinematic ? 0.011 : 0.008);
    if (sub === 0) voicing.forEach((f, k) => this.playKeys(f, t + k * 0.018, cinematic ? 0.018 : 0.024));
    if (!cinematic && sub === 10 && bar % 2 === 1) voicing.slice(1).forEach((f, k) => this.playKeys(f, t + k * 0.018, 0.014));

    // Bass on the one, and a soft fifth on the and-of-three.
    if (sub === 0) this.playBass(bass, t, stepDur * 7, 0.12);
    if (!cinematic && sub === 10) this.playBass(bass * 1.5, t, stepDur * 4, 0.07);

    // A laid-back pulse under it all (none for the cinematic mood).
    if (!cinematic) {
      if (sub === 0 || sub === 10) this.playKick(t, sub === 0 ? 0.08 : 0.05);
      if (sub % 4 === 2) this.playShaker(t, 0.007);
    }

    // The kalimba wanders the pentatonic in small steps on the 8th notes, leaving plenty of space.
    if (sub % 2 === 0 && Math.random() < (cinematic ? 0.18 : 0.3)) {
      const move = [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
      this.melodyAt = Math.max(0, Math.min(this.melody.length - 1, this.melodyAt + move));
      this.playKalimba(this.melody[this.melodyAt], t, 0.035 + Math.random() * 0.02);
    }
  }
}

export const audio = new AudioManager();
