// TEMP harness (delete after): the real home scene and decorate UI, driven from window.__h. ?low=1
import { createRoot } from 'react-dom/client';
import '../src/game/theme';
import '../src/theme.css';
import '../src/styles.css';
import { useGame } from '../src/game/store';
import { useQuality } from '../src/game/quality';
import { Scene } from '../src/three/Scene';
import { BuyPanel, OwnedSheet } from '../src/ui/Sheets';
import { DEFAULT_ITEMS } from '../src/game/store';

const q = new URLSearchParams(location.search);
if (q.get('low') === '1') useQuality.setState({ quality: 'low' });
else useQuality.setState({ quality: 'high' });
useGame.setState({ started: true, view: 'home', origin: 'richkid', money: 50_000_000, minutes: 13 * 60, items: DEFAULT_ITEMS } as never);
(window as unknown as { __h: unknown }).__h = { useGame };

createRoot(document.getElementById('root')!).render(
  <>
    <Scene />
    <BuyPanel />
    <OwnedSheet />
  </>,
);
