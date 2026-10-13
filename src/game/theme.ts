import { create } from 'zustand';

/** Light, dark, or whatever the device is set to. Changes the phone and every panel, sheet and HUD card. */
export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'kl-theme';
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function stored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* storage blocked */ }
  return 'light';
}

const resolve = (choice: ThemeChoice): 'light' | 'dark' => (choice === 'system' ? (media?.matches ? 'dark' : 'light') : choice);

let chrome = '';
/** Tints the browser's toolbar, which is the status bar once the game is added to the home screen. The 3D world keeps it the colour of its sky. */
export function setChromeColor(hex: string) {
  if (hex === chrome) return;
  chrome = hex;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex);
}

/** index.html sets data-theme before first paint; this keeps it (and the browser's toolbar colour) in step afterwards. */
function apply(mode: 'light' | 'dark') {
  document.documentElement.dataset.theme = mode;
  setChromeColor(mode === 'dark' ? '#0b1430' : '#bfe3f5');
}

interface ThemeState {
  choice: ThemeChoice;
  /** What is on screen right now: `system` resolved to light or dark. */
  mode: 'light' | 'dark';
  setChoice: (choice: ThemeChoice) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  choice: stored(),
  mode: resolve(stored()),
  setChoice: (choice) => {
    try { localStorage.setItem(KEY, choice); } catch { /* storage blocked */ }
    const mode = resolve(choice);
    apply(mode);
    set({ choice, mode });
  },
}));

/** Lights come on while the sky is still bright, a little before dusk. */
export const LIGHTS_ON = 17;

/** Set while a visitor tours a city from the landing page (game/tour.ts): the map is shown at noon whatever the clock or the appearance. */
let daylight = false;
export const holdDaylight = (on: boolean) => {
  daylight = on;
};

/** The hour the 3D world is lit at: the game clock's, except dark appearance is always night and a city tour is always day. */
export const sceneHour = (clock: number) => (daylight ? 12 : useTheme.getState().mode === 'dark' ? 21 : clock);

apply(useTheme.getState().mode);
media?.addEventListener('change', () => {
  const { choice } = useTheme.getState();
  if (choice !== 'system') return;
  const mode = resolve(choice);
  apply(mode);
  useTheme.setState({ mode });
});
