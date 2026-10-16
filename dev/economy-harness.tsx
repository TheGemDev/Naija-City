// TEMP harness (delete after): the real phone on the Hustle or Jobs app, with the server's hustle state mocked.
// ?app=hustle|jobs  &kind=writing|design|code (an active freelance gig)  &hud=dispatch
import { createRoot } from 'react-dom/client';
import '../src/theme.css';
import '../src/styles.css';
import '../src/ui/phone-ui.css';
import '../src/ui/safe-area.css';
import { useGame } from '../src/game/store';
import { Phone } from '../src/ui/Phone';
import { DriveHud } from '../src/ui/DriveHud';
import { useDrive } from '../src/game/drive';
import { useHustle, type HustleState } from '../src/net/hustle';
import { useSession } from '../src/net/session';
import { useCareer } from '../src/net/career';
import { freelanceBrief, freelancePay, publicBrief, dayNo, cropPrice, CROPS, type FreelanceKind } from '../src/game/hustles';

const q = new URLSearchParams(location.search);
const now = Date.now();
useGame.setState({ started: true, view: 'city', destinationId: 'kaduna', money: 462_500, knowledge: 5, jobId: q.get('job') ?? null, jobCity: 'kaduna', minutes: 10 * 60, panel: 'phone', openApp: q.get('app') ?? 'hustle' } as never);
useSession.setState({ user: { uid: 'u1', username: 'alice' } } as never);
useCareer.setState({ loaded: true, jobs: [{ id: 'keke', shifts: 3, rank: 0, title: 'Trainee', mult: 1.5, nextAt: 5 }] } as never);
const day = dayNo(now);
const kind = q.get('kind') as FreelanceKind | null;
const state: HustleState = {
  now, day, dayEnds: now + 5 * 3600_000 + 12 * 60_000,
  daily: { claimed: q.get('claimed') === '1', streak: 4, best: 6, reward: 30_000, week: [15_000, 20_000, 25_000, 30_000, 40_000, 50_000, 100_000] },
  freelance: {
    done: 3, earned: 41_600, perDay: 10, knowledge: 5,
    active: kind ? { id: 't1', kind, pay: freelancePay(kind, 5), startedAt: now - 4000, minMs: 9000, expiresAt: now + 4 * 60_000, brief: publicBrief(freelanceBrief(kind, 1234567)) } : null,
  },
  farm: {
    plots: [
      { slot: 0, crop: 'maize', plantedAt: now - CROPS.maize.growMs - 60_000 },
      { slot: 1, crop: 'yam', plantedAt: now - 35 * 60_000 },
      { slot: 2, crop: null, plantedAt: null },
    ],
    prices: { maize: cropPrice('maize', day), tomato: cropPrice('tomato', day), yam: cropPrice('yam', day), ginger: cropPrice('ginger', day) },
  },
  referral: { ready: ['x'], waiting: 2, paidThisWeek: 1, welcome: 'none', shifts: 0 },
};
if (q.get('lease') === '1') state.farm.plots = state.farm.plots.slice(0, 2);
useHustle.setState({ state, skew: 0 });
if (q.get('hud') === 'dispatch') {
  useDrive.setState({
    vehicle: 'okada', gig: 'dispatch', trips: 4, earned: 21_850, speed: 34,
    passenger: { name: 'Hajiya Laraba', line: 'Tell them extra yaji!', pickup: { x: 1, z: 1 }, to: 'hospital', toName: 'Barau Dikko Hospital', fare: 4_350, boarded: q.get('boarded') === '1', deadline: q.get('boarded') === '1' ? now + 38_000 : null, order: { item: '🥩 Two wraps of suya', from: 'suya', fromName: 'Suya Spot, Kawo' } },
  });
}
Object.assign(window, { __game: useGame, __hustle: useHustle });

createRoot(document.getElementById('root')!).render(
  <div className="app-root">
    <div className="ui">{q.get('hud') ? <DriveHud /> : <Phone />}</div>
  </div>,
);
