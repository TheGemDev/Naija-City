// Naija City Background Music & Sound System
// Uses the Web Audio API to synthesize smooth Afrobeat & Arewa lofi chill beats with zero external assets.
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

  // F major pentatonic scale frequencies (Hz): F3, G3, A3, C4, D4, F4, G4, A4, C5
  private pentatonic = [174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 523.25];
  // Chords progression: Fmaj9 -> Dm7 -> Bbmaj7 -> C7
  private chords = [
    [174.61, 261.63, 329.63, 349.23], // Fmaj7
    [146.83, 220.0, 261.63, 349.23],  // Dm7
    [116.54, 174.61, 220.0, 293.66],  // Bbmaj7
    [130.81, 196.0, 261.63, 329.63],  // C9
  ];
  private bassNotes = [87.31, 73.42, 58.27, 65.41]; // F1, D1, Bb0, C1

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
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = window.setInterval(() => this.tick(), station === 'kannywood' ? 185 : 139);
    }
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
      return;
    }
    try {
      this.initContext();
      if (!this.ctx || !this.masterGain) return;
      this.step = 0;
      // 108 BPM, 16th-note step interval = (60 / 108) / 4 * 1000 ≈ 138.8ms
      this.timer = window.setInterval(() => this.tick(), this.station === 'kannywood' ? 185 : 139);
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

  // Plays a synthesized marimba/kalimba note
  private playPluck(freq: number, time: number, vel = 0.15) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, time);
    filter.frequency.exponentialRampToValueAtTime(300, time + 0.35);

    gain.gain.setValueAtTime(vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.36);
  }

  // Warm Rhodes/Electric Piano chord pad
  private playChord(chord: number[], time: number, duration: number, vel = 0.04) {
    if (!this.ctx || !this.masterGain) return;
    chord.forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const filter = this.ctx!.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, time);

      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(vel, time + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(time);
      osc.stop(time + duration);
    });
  }

  // Deep smooth sub bass
  private playBass(freq: number, time: number, duration: number, vel = 0.22) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + duration);
  }

  // Subtle shaker rhythm (gentle white noise pulse)
  private playShaker(time: number, vel = 0.02) {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(5000, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vel, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    whiteNoise.start(time);
    whiteNoise.stop(time + 0.05);
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

  private tick() {
    // A suspended context's clock stands still: notes scheduled now would all sound at once when it wakes
    if (!this.ctx || this.timer === null || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.station === 'talk') {
      if (this.step % 16 === 0) this.playShaker(now, 0.035);
      if (this.step % 32 === 8) this.playPluck(this.step % 64 === 8 ? 220 : 261.63, now, 0.045);
      this.step = (this.step + 1) % 64;
      return;
    }
    const chordIndex = Math.floor((this.step % 64) / 16);
    const chord = this.chords[chordIndex];
    const bass = this.bassNotes[chordIndex];
    const cinematic = this.station === 'kannywood';

    // Every 16 steps (bar downbeat): play new chord pad & bass
    if (this.step % 16 === 0) {
      this.playChord(chord, now, cinematic ? 2.8 : 2.2, cinematic ? 0.025 : 0.04);
      this.playBass(bass, now, cinematic ? 1.6 : 1.2, cinematic ? 0.12 : 0.2);
    } else if (this.step % 16 === 8) {
      // Mid-bar bass bounce
      this.playBass(bass * 1.5, now, 0.6, 0.14);
    }

    // Shaker on every even 16th note
    if (this.step % 2 === 0) {
      this.playShaker(now, this.step % 4 === 2 ? 0.03 : 0.015);
    }

    // Melodic kalimba / marimba plucks in pentatonic scale
    // Afrobeat syncopated pattern on select 16ths
    const pattern = cinematic ? [0, 7, 12] : [0, 3, 6, 8, 11, 14];
    const subStep = this.step % 16;
    if (pattern.includes(subStep)) {
      const noteIdx = (subStep * 2 + chordIndex * 3) % this.pentatonic.length;
      const note = this.pentatonic[noteIdx];
      this.playPluck(note, now, 0.12);
    }

    this.step = (this.step + 1) % 64;
  }
}

export const audio = new AudioManager();
