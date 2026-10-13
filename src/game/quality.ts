import { create } from 'zustand';

/** Graphics quality is a per-device choice, so it lives in localStorage, not in the save. */
export type Quality = 'auto' | 'high' | 'low';

const KEY = 'kl-quality';

/** Few cores or little memory: the kind of phone that should start in low mode. */
function weakDevice() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.deviceMemory ?? 8) <= 3 || (navigator.hardwareConcurrency ?? 8) <= 4;
}

function load(): Quality {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'auto' || v === 'high' || v === 'low') return v;
  } catch { /* private mode */ }
  return 'auto';
}

const BATTERY_KEY = 'kl-battery-saver';
/** Battery level at or below which the saver kicks in. */
const LOW_BATTERY = 0.2;

function loadSaver() {
  try { return localStorage.getItem(BATTERY_KEY) !== '0'; } catch { return true; }
}

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
}

interface QualityState {
  quality: Quality;
  /** Switch to low mode on its own while the battery is low and not charging. */
  batterySaver: boolean;
  /** True while the battery is low and unplugged. Always false where the Battery API is missing (iOS). */
  batteryLow: boolean;
  setQuality(q: Quality): void;
  setBatterySaver(v: boolean): void;
}

export const useQuality = create<QualityState>((set) => ({
  quality: load(),
  setQuality: (quality) => {
    try { localStorage.setItem(KEY, quality); } catch { /* private mode */ }
    set({ quality });
  },
  batterySaver: loadSaver(),
  batteryLow: false,
  setBatterySaver: (batterySaver) => {
    try { localStorage.setItem(BATTERY_KEY, batterySaver ? '1' : '0'); } catch { /* private mode */ }
    set({ batterySaver });
  },
}));

const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }).getBattery;
if (getBattery) {
  void getBattery.call(navigator).then((b) => {
    const update = () => useQuality.setState({ batteryLow: !b.charging && b.level <= LOW_BATTERY });
    update();
    b.addEventListener('levelchange', update);
    b.addEventListener('chargingchange', update);
  }).catch(() => { /* blocked */ });
}

/** True when the game should render with the cheap settings. */
export function useLowPerf() {
  return useQuality((s) => (s.batterySaver && s.batteryLow) || (s.quality === 'auto' ? weakDevice() : s.quality === 'low'));
}
