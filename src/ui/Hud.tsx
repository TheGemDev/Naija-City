import { ITEMS, NEEDS, SPRAY_ACTIONS, type Need } from '../game/catalog';
import { GlBoundary } from './NoWebGL';
import { originOf } from '../game/origins';
import { toastApp, toastHome, toastPlace } from '../game/toastTarget';
import { tipOfToast, useHelp } from '../game/tips';
import { Children, memo, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useNet } from '../net/multiplayer';
import { api, useSession } from '../net/session';
import { onGrid, STANDBY_KW } from '../game/power';
import { useTheme } from '../game/theme';
import { dayOf, flightOf, hourOf, homeLoad, inOwnHouse, isDaylight, isPowered, moodOf, naira, nairaShort, solarActive, taskDurationSeconds, useGame, useNeeds } from '../game/store';
import { useTravel } from './TravelPicker';
import { useLowPerf, useQuality } from '../game/quality';
import { useVisit } from '../game/visits';
import { leaveHouseVisit } from '../net/visit';
import { CLUB_SHOUTS, PLACE_SHOUTS, useMoneyRain, useShoutouts } from '../game/shoutout';
import { cityMap, placeHere } from '../game/city';
import { useSocial } from '../net/social';
import { loadLoans, useLoans } from '../net/loans';
import { ReactionToggle, ReactionTray, useReactions } from './Reactions';
import { Chevron, Emoji } from './Icons';
import { PhotoButton, openCamera } from './PhotoMode';
import { openAdsSheet } from '../net/ads';
import { ADS_ON_SALE } from '../game/ads';
import { Person, type Clip } from '../three/Person';
import { STAGES } from '../game/property';
import { LiveBanner } from './LiveApps';
import { DisasterBanner } from './DisasterBanner';
import { sectionOf } from '../game/estate';
import { PUSH_CATEGORIES, type PushCategory } from '../game/push';
import { ALLOCATION, CITY_NAME } from '../game/civic';
import { useCivic } from '../net/civic';
import { useOfficeBudget } from '../net/office';
import { GameTips } from './GameTips';
import { ElectionDayPill } from './Election';
import { RadioPill } from './RadioPill';
import { HotelDesk, HotelLauncher, RoomCard, StayChip } from './Hotel';
import { SuiteLauncher } from './Villa';
import { CabinService, FlightBanner, FlightDesk, FlightLauncher } from './Airport';
import { TrainDesk, TrainLauncher } from './TrainDesk';
import { useCabin } from '../game/cabin';
import { useShift } from '../game/shiftGame';
import { GazetteBanner } from './Gazette';
import { WorkChip } from './WorkChip';
import { KidChip } from './KidChip';
import { isPrivateRoom } from '../game/villa';
import { useShallow } from 'zustand/react/shallow';
import { readRoute } from '../game/travelProgress';
import { useTrip } from '../game/trip';
import { regionOf } from '../game/regions';

export function formatClock(minutes: number) {
  const h = Math.floor(hourOf(minutes));
  const m = Math.floor(minutes % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Low power mode switch: lights up amber when on (no shadows, lower resolution). */
function PowerSaveButton() {
  const low = useLowPerf();
  const setQuality = useQuality((s) => s.setQuality);
  return (
    <button
      className={`stack-collapse power-save ${low ? 'on' : ''}`}
      type="button"
      title={low ? 'Low power mode on. Tap for full quality' : 'Turn on low power mode'}
      aria-label="Low power mode"
      aria-pressed={low}
      onClick={() => {
        setQuality(low ? 'high' : 'low');
        useGame.getState().toast(low ? '🔋 Low power mode off. Full quality is back.' : '🪫 Low power mode on. Shadows off and lower resolution to save battery.');
      }}
    >
      <Emoji char={low ? '🪫' : '🔋'} size={16} />
    </button>
  );
}

/** Quick light / dark switch; the full choice (with Auto) lives in Settings. */
function ThemeButton() {
  const dark = useTheme((s) => s.mode) === 'dark';
  const setChoice = useTheme((s) => s.setChoice);
  return (
    <button
      className="stack-collapse"
      type="button"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Dark mode"
      aria-pressed={dark}
      onClick={() => setChoice(dark ? 'light' : 'dark')}
    >
      <Emoji char={dark ? '🌙' : '☀️'} size={16} />
    </button>
  );
}

function TopBar() {
  const minutes = useGame((s) => Math.floor(s.minutes));
  // Cash you can spend. What is owed is not taken off here: the debt pill and the Bank say that.
  const money = useGame((s) => s.money);
  const h = hourOf(minutes);
  const day = h >= 6 && h < 18.5;

  return (
    <div className="topbar">
      {/* You, first in the row, so you always stand beside your money (the money tucks behind your picture). */}
      {CORNER_HUD && <Needs />}
      <div className={`hud-card time-card ${day ? 'day' : 'night'}`}>
        <span className="sky"><Emoji char={day ? '☀️' : '🌙'} size={26} /></span>
        <div className="time-text">
          <b>{formatClock(minutes)}</b>
          <small>
            Day {dayOf(minutes)}
          </small>
        </div>
      </div>
      {/* Buying money is switched off for now: the balance is display only. */}
      <div className="hud-card money-card-top">
        <Emoji char="💰" size={22} />
        <b className={money < 0 ? 'owing' : undefined}>{naira(money)}</b>
      </div>
      {ADS_ON_SALE && (
        <div className="hud-actions">
          <button className="round-btn" title="Ads" aria-label="Ads" onClick={() => openAdsSheet(null, true)}>
            <Emoji char="📣" size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Prompt banner shown in the HUD after Day 1 until notifications are enabled or denied. */
function NotificationBanner() {
  const signedIn = useSession((s) => !!s.user);
  const pastDay1 = useGame((s) => dayOf(s.minutes) > 1);
  const [working, setWorking] = useState(false);
  const [enabled, setEnabled] = useState(false);

  if (!signedIn || !pastDay1 || enabled) return null;
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return null;

  async function enable() {
    setWorking(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setWorking(false); return; }
      const keyRes = await fetch('/api/push/key');
      if (!keyRes.ok) { setWorking(false); return; }
      const { publicKey } = await keyRes.json() as { publicKey: string | null };
      if (!publicKey) { setWorking(false); return; }
      const registration = await navigator.serviceWorker.register('/sw.js');
      const encoded = publicKey.replace(/-/g, '+').replace(/_/g, '/');
      const applicationServerKey = Uint8Array.from(
        atob(encoded + '='.repeat((4 - encoded.length % 4) % 4)),
        (c) => c.charCodeAt(0),
      );
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey as BufferSource });
      const res = await api('/api/push/subscribe', { method: 'PUT', body: JSON.stringify(subscription) });
      if (!res.ok) { await subscription.unsubscribe(); setWorking(false); return; }
      setEnabled(true);
    } catch {
      setWorking(false);
    }
  }

  return (
    <div className="hud-card notification-banner" role="button" tabIndex={0} onClick={() => !working && void enable()}>
      <Emoji char="🔔" size={18} />
      <span>Turn on notifications</span>
      <button className="btn sm" disabled={working}>
        {working ? 'Wait…' : 'Enable'}
      </button>
    </div>
  );
}

/** Browser push opt-in. Also shown as a banner in the HUD (NotificationBanner above). */
export function PushNotifications({
  onPermissionChange,
  enableRef,
}: {
  onPermissionChange(missing: boolean): void;
  enableRef: { current: (() => void) | null };
}) {
  const signedIn = useSession((s) => !!s.user);
  const [state, setState] = useState<'loading' | 'disabled' | 'enabled' | 'blocked' | 'working' | 'unsupported' | 'unavailable'>('loading');
  const [message, setMessage] = useState('');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  useEffect(() => {
    onPermissionChange(typeof Notification === 'undefined' || Notification.permission !== 'granted');
    if (!signedIn) {
      setState('unavailable');
      setMessage('Sign in to enable notifications.');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }
    Promise.all([
      fetch('/api/push/key').then(async (response) => {
        if (!response.ok) throw new Error('Could not check notification setup');
        return response.json() as Promise<{ publicKey: string | null }>;
      }),
      navigator.serviceWorker.register('/sw.js'),
    ])
      .then(async ([configuration, registration]) => {
        if (!configuration.publicKey) {
          setMessage('Notifications are not set up yet.');
          setState('unavailable');
          return;
        }
        setPublicKey(configuration.publicKey);
        const subscription = await registration.pushManager.getSubscription();
        setState(subscription ? 'enabled' : 'disabled');
      })
      .catch((error: unknown) => {
        console.error('Could not check push notification status', error);
        setMessage('Notifications are unavailable in this browser.');
        setState('unsupported');
      });
  }, [signedIn]);

  async function enable() {
    setState('working');
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      onPermissionChange(permission !== 'granted');
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'disabled');
        return;
      }
      if (!publicKey) throw new Error('Notifications are not set up yet');
      const registration = await navigator.serviceWorker.register('/sw.js');
      const encodedKey = publicKey.replace(/-/g, '+').replace(/_/g, '/');
      const applicationServerKey = Uint8Array.from(
        atob(encodedKey + '='.repeat((4 - encodedKey.length % 4) % 4)),
        (character) => character.charCodeAt(0),
      );
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });
      const response = await api('/api/push/subscribe', { method: 'PUT', body: JSON.stringify(subscription) });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        await subscription.unsubscribe();
        throw new Error(result.error ?? 'Could not save this device');
      }
      setState('enabled');
    } catch (error) {
      console.error('Could not enable push notifications', error);
      setMessage(error instanceof Error ? error.message : 'Could not enable notifications');
      setState('disabled');
    }
  }

  async function disable() {
    setState('working');
    setMessage('');
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await api('/api/push/subscribe', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error('Could not remove this device');
        await subscription.unsubscribe();
      }
      setState('disabled');
    } catch (error) {
      console.error('Could not disable push notifications', error);
      setMessage(error instanceof Error ? error.message : 'Could not disable notifications');
      setState('enabled');
    }
  }

  enableRef.current = () => void enable();

  return (
    <>
    <div className="notification-setting">
      <div>
        <b>Push notifications</b>
        <small>
          {state === 'enabled' ? 'Enabled on this device' :
            state === 'blocked' ? 'Allow notifications in your browser settings' :
              state === 'unsupported' ? (isIOS ? 'Add Naija City to your Home Screen' : 'Not supported by this browser') :
                state === 'unavailable' ? (message || 'Not available yet') :
                  'Get alerts for payments, messages and invitations'}
        </small>
      </div>
      {state === 'enabled' ? (
        <button className="btn sm" onClick={() => void disable()}>Turn off</button>
      ) : state === 'disabled' ? (
        <button className="btn sm" onClick={() => void enable()}>Enable</button>
      ) : state === 'working' || state === 'loading' ? (
        <button className="btn sm" disabled>{state === 'loading' ? 'Checking…' : 'Please wait…'}</button>
      ) : null}
      {isIOS && state !== 'enabled' && state !== 'unsupported' && (
        <small>On iPhone or iPad, add Naija City to your Home Screen first.</small>
      )}
      {message && state !== 'unavailable' && <small>{message}</small>}
    </div>
    {state === 'enabled' && <PushCategories />}
    </>
  );
}

/** A switch for each kind of notification. The choice goes with the account, so it holds on every device. */
function PushCategories() {
  const [muted, setMuted] = useState<PushCategory[] | null>(null);
  useEffect(() => {
    api('/api/push/prefs')
      .then(async (response) => (response.ok ? ((await response.json()) as { muted: PushCategory[] }).muted : []))
      .then(setMuted)
      .catch(() => setMuted([]));
  }, []);
  if (!muted) return null;

  const toggle = (category: PushCategory, on: boolean) => {
    const before = muted;
    setMuted(on ? muted.filter((c) => c !== category) : [...muted, category]);
    api('/api/push/prefs', { method: 'PUT', body: JSON.stringify({ category, on }) })
      .then(async (response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        setMuted(((await response.json()) as { muted: PushCategory[] }).muted);
      })
      .catch(() => {
        setMuted(before);
        useGame.getState().toast('Could not save that setting. Try again.');
      });
  };

  return (
    <div className="list-card">
      {PUSH_CATEGORIES.map((c) => (
        <label key={c.id} className="settings-option">
          <span>
            <b>{c.name}</b>
            <small>{c.blurb}</small>
          </span>
          <input type="checkbox" role="switch" aria-label={`${c.name} notifications`} checked={!muted.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />
        </label>
      ))}
    </div>
  );
}

/**
 * Owing the bank more than you hold, or late on a loan: says how much, and opens the Bank where it is repaid.
 * It stays until it is closed, and is back the next time the game opens while the money is still owed.
 */
function DebtPill() {
  const signedIn = useSession((s) => !!s.user);
  const hasLoan = useGame((s) => s.bankLoanOwed > 0);
  const owed = useGame((s) => s.debtOwed + s.bankLoanOwed);
  const short = useGame((s) => s.money < s.debtOwed + s.bankLoanOwed);
  const overdue = useLoans((s) => !!s.data?.overdue);
  // Interest is added every game week, so what is owed keeps moving while you play.
  useEffect(() => {
    if (!signedIn || !hasLoan) return;
    const timer = window.setInterval(() => void loadLoans(), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [signedIn, hasLoan]);
  const show = owed > 0 && (short || overdue);
  const [closed, setClosed] = useState(false);
  // Cleared and then owing again is a new notice.
  useEffect(() => {
    if (!show) setClosed(false);
  }, [show]);
  if (!show || closed) return null;
  return (
    <div className="hud-card debt-pill">
      <button
        type="button"
        className="debt-pill-open"
        title="Open the Bank to repay"
        onClick={() => {
          useGame.setState({ openBankApp: true, bankTab: hasLoan ? 'loans' : 'account' });
          useGame.getState().setPanel('phone');
        }}
      >
        <Emoji char="🏦" size={18} />
        <span>
          <b>You owe the bank {naira(owed)}</b>
          <small>{overdue ? 'Your loan is overdue. Tap to pay up' : 'Tap to pay up'}</small>
        </span>
      </button>
      <button type="button" className="debt-pill-close" onClick={() => setClosed(true)} aria-label="Dismiss">✕</button>
    </div>
  );
}

/** In office: what your department can spend right now. Red when it can't pay for anything. Tap for the Treasury. */
function BudgetChip() {
  const mine = useOfficeBudget();
  const office = mine?.office;
  // Taxes and other people's spending move the treasury all day.
  useEffect(() => {
    if (!office) return;
    const timer = window.setInterval(() => void useCivic.getState().refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [office]);
  if (!mine) return null;
  const { label, icon } = mine.city ? { label: CITY_NAME[mine.city], icon: '🏛️' } : ALLOCATION.info[mine.department!];
  return (
    <button
      className={`chip budget-chip ${mine.low ? 'chip-warn' : ''}`}
      title={`${label} budget: ${naira(mine.budget)}`}
      onClick={() => {
        useCivic.setState({ wantOpen: true, wantTreasury: true });
        useGame.getState().setPanel('phone');
      }}
    >
      <Emoji char={icon} size={16} />
      <b>{nairaShort(mine.budget)}</b>
      <small>{label} budget{mine.low ? ' · empty' : ''}</small>
    </button>
  );
}

/** At home: the power source, what the house is drawing and the water tank. Tap for the Light app. */
function PowerChip() {
  const powered = useGame(isPowered);
  const grid = useGame((s) => onGrid(s.power));
  const solar = useGame(solarActive);
  const fuel = useGame((s) => Math.round(s.power.genFuel));
  const battery = useGame((s) => Math.round(s.power.battery ?? 100));
  const water = useGame((s) => Math.round(s.waterTank));
  const items = useGame((s) => s.items);
  const daylight = useGame((s) => isDaylight(s.minutes));
  const atHome = useGame(inOwnHouse);
  const load = useGame((s) => homeLoad(s));
  if (!atHome) return null; // light only matters in your own house
  const source = grid ? '💡 NEPA'
    : solar ? (daylight ? '☀️ Solar' : `🔋 Inverter ${battery}%`)
      : powered ? `⛽ Gen ${fuel}%`
        : '🕯️ No NEPA';
  const parts = [source, `🔌 ${load.toFixed(2)} kW`, `💧 ${water}%`];
  // Standby items currently drawing power (fridge, CCTV, aquarium, etc.)
  const standbyItems = items.filter((i) => STANDBY_KW[i.type]).map((i) => {
    const def = ITEMS[i.type];
    return { type: i.type, icon: def?.icon ?? '🔌', name: def?.name ?? i.type, kw: STANDBY_KW[i.type] };
  });
  return (
    <button
      type="button"
      className={`chip power-chip ${powered ? '' : 'chip-warn'}`}
      aria-label="Power and water. Open the Light app"
      onClick={() => {
        useGame.setState({ openApp: 'light' });
        useGame.getState().setPanel('phone');
      }}
    >
      {parts.map((part) => {
        const [ico, ...rest] = Array.from(part);
        return (
          <span key={part} className="power-chip-part">
            <Emoji char={ico === '🕯' ? '🕯️' : ico} size={14} />
            {rest.join('').trim()}
          </span>
        );
      })}
      {powered && standbyItems.length > 0 && (
        <span className="power-chip-items">
          {standbyItems.slice(0, 4).map((s) => (
            <span key={s.type} className="power-chip-item" title={`${s.name} · ${s.kw} kW`}>
              <Emoji char={s.icon} size={12} />
            </span>
          ))}
          {standbyItems.length > 4 && (
            <span className="power-chip-more">+{standbyItems.length - 4}</span>
          )}
        </span>
      )}
    </button>
  );
}

/** Bottom-right chat button: opens a one-line chat box (shown only while online). */
function ChatButton() {
  const signedIn = useSession((s) => !!s.user);
  const connected = useNet((s) => s.connected);
  const say = useNet((s) => s.say);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const reactions = useReactions(say);
  if (!signedIn || !connected) return null; // <ConnectionGate> covers the game while disconnected
  return (
    <div className="chat-fab">
      {open && reactions.open && <ReactionTray onPick={reactions.pick} />}
      {open && (
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) say(text.trim());
            setText('');
          }}
        >
          <ReactionToggle open={reactions.open} onToggle={reactions.toggle} />
          <input autoFocus value={text} maxLength={140} placeholder="Say something…" onChange={(e) => setText(e.target.value)} />
          <button className="btn sm">Send</button>
        </form>
      )}
      <button type="button" className={`chat-fab-btn ${open ? 'on' : ''}`} aria-label={open ? 'Close chat' : 'Open chat'} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Emoji char={open ? '✖️' : '💬'} size={24} />
      </button>
    </div>
  );
}

function ChowChip() {
  const deliveries = useGame((s) => s.deliveries);
  const minutes = useGame((s) => Math.floor(s.minutes));
  const task = useGame((s) => s.task);
  const setPanel = useGame((s) => s.setPanel);
  if (deliveries.length === 0) return null;
  const next = Math.max(0, Math.ceil(Math.min(...deliveries.map((d) => d.at)) - minutes));
  return (
    <button className="chow-chip" onClick={() => setPanel('phone')} title="Food order">
      <span className="chow-ico"><Emoji char="🛵" size={22} /></span>
      <span>
        <b>Food order · {next > 0 ? `${taskDurationSeconds(next, task?.total)} sec` : 'Arriving'}</b>
        <small>{deliveries.map((d) => `${d.icon} ${d.name}`).join(', ')}</small>
      </span>
    </button>
  );
}

/** How often the task card reads its progress: a few times a second is smooth enough, and costs nothing. */
const TASK_READ_MS = 300;

/**
 * The task card's bar and time left, read on a timer. A trip's progress lives outside the store (the route in
 * game/avatar.ts, game/travelProgress.ts reads it), so nothing would re-render the card as you move; and a task in
 * hand ticks the store ten times a second, which the card does not need to follow.
 */
function useTaskReading() {
  const [reading, setReading] = useState<{ pct: number; secs: number | null }>({ pct: 0, secs: null });
  useEffect(() => {
    let last = '';
    const read = () => {
      const s = useGame.getState();
      const t = s.task;
      let pct = 0;
      let secs: number | null = null;
      if (t?.phase === 'doing') {
        pct = t.total > 0 ? 100 - (t.remaining / t.total) * 100 : 0;
        secs = taskDurationSeconds(t.remaining, t.total, t.fast);
      } else if (t) {
        const route = readRoute(s.view, t, !!useVisit.getState().current);
        if (route) {
          pct = route.done * 100;
          secs = Math.ceil(route.secs);
        }
      }
      pct = Math.round(Math.max(0, Math.min(100, pct)) * 2) / 2;
      const key = `${pct}|${secs}`;
      if (key === last) return;
      last = key;
      setReading({ pct, secs });
    };
    read();
    const id = setInterval(read, TASK_READ_MS);
    // A new route (a new place, the next leg of a trip): measured straight away, before the first step is taken.
    const unsub = useGame.subscribe((s, prev) => {
      if (s.task?.label !== prev.task?.label || s.task?.phase !== prev.task?.phase) read();
    });
    return () => {
      clearInterval(id);
      unsub();
    };
  }, []);
  return reading;
}

const timeLeft = (secs: number) => (secs <= 1 ? 'Arriving' : secs >= 120 ? `${Math.round(secs / 60)} min left` : `${secs} sec left`);

/** The time left on what you are doing or where you are going, as the task card says it: for the phone's Ride app. */
export function TaskTimeLeft() {
  const { secs } = useTaskReading();
  return secs === null ? null : <> · {timeLeft(secs)}</>;
}

/** On a trip to another city (game/trip.ts): where it ends, and which leg of it this is. */
function useTripLine() {
  const going = useTrip((s) => s.going);
  const here = useGame((s) => cityMap(s.destinationId).id);
  const inAir = useGame((s) => !!flightOf(s) || (!!s.task && s.view === 'place' && (s.insideId === 'airport' || s.insideId === 'station')));
  if (!going) return null;
  const legs = going.stop ? 2 : 3;
  const landed = here === going.city;
  const leg = landed ? legs : inAir ? 2 : 1;
  const where = going.place && !going.stop ? `${going.place.name}, ${regionOf(going.city).name}` : going.home ? `home, ${regionOf(going.city).name}` : regionOf(going.city).name;
  return { going, landed, title: `Trip to ${where}`, text: `Leg ${leg} of ${legs} · ${where}` };
}

function TaskChip() {
  // Only what the card shows: not the whole task, which the clock replaces ten times a second.
  const task = useGame(useShallow((s) => (s.task ? { label: s.task.label, icon: s.task.icon, phase: s.task.phase, actionId: s.task.actionId } : null)));
  const boarding = useGame((s) => s.boarding);
  // A street story (game/stories.ts) holds you up where you stand until you have dealt with it.
  const stopped = useGame((s) => !!s.streetStory);
  const cancel = useGame((s) => s.cancelTask);
  const { pct, secs } = useTaskReading();
  const trip = useTripLine();
  // Between the legs of a trip (the search at the gate, the moment after landing) there is no task: the trip still shows.
  // (Not a trip that stalled at the airport: that one is called off, or forgotten, and the card would only linger.)
  if (!task && trip && (trip.landed || boarding)) {
    const rail = trip.going.via === 'rail';
    return (
      <div className="task-chip" role="status">
        <span className="task-icon"><Emoji char={rail ? '🚆' : '✈️'} size={26} /></span>
        <div className="task-body">
          <b>{trip.title}</b>
          <div className="bar"><i style={{ width: trip.landed ? '100%' : '0%' }} /></div>
          <small>{trip.landed ? 'Landed · your ride is coming' : 'Security check at the gate…'}</small>
        </div>
      </div>
    );
  }
  // On shift, your post has its own card (ui/ShiftGame.tsx). A stroll you tapped out on the map needs no card.
  if (!task || (task.actionId === 'walk' && task.label === 'Walking') || (task.actionId === 'work' && task.phase === 'doing')) return null;
  return (
    <div className="task-chip">
      <span className="task-icon"><Emoji char={task.icon} size={26} /></span>
      <div className="task-body">
        <b>{task.label}</b>
        <div className="bar" role="progressbar" aria-label={task.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <small>{stopped && task.phase === 'walking' ? 'Stopped on the way' : secs !== null ? timeLeft(secs) : task.phase === 'walking' ? 'On the way…' : 'Almost done'}</small>
        {trip && <small className="task-trip">{trip.text}</small>}
      </div>
      <button className="x" onClick={cancel} aria-label="Cancel">
        ✕
      </button>
    </div>
  );
}


export function needColor(v: number) {
  if (v > 55) return '#22c55e';
  if (v > 30) return '#eab308';
  if (v > 15) return '#f97316';
  return '#ef4444';
}

const NEED_HINT: Record<Need, string> = {
  hunger: 'Go and chop something',
  energy: 'Find a bed and rest',
  fun: 'Do something fun',
  social: 'Go and meet people',
  hygiene: 'Time for a bath',
  bladder: 'Find a toilet, fast',
};

function Needs() {
  const needs = useNeeds();
  const name = useGame((s) => s.name);
  const look = useGame((s) => s.look);
  const origin = useGame((s) => originOf(s.origin));
  const mood = moodOf(needs);
  // Only the worst need is ever shown on its own; the rest wait behind a tap.
  const worst = NEEDS.reduce((w, n) => (needs[n.key] < needs[w.key] ? n : w), NEEDS[0]);
  const worstValue = needs[worst.key];
  const alert = worstValue < 30;
  // Every need that is running out, worst first (three at most, so the corner stays clear).
  const low = NEEDS.filter((n) => needs[n.key] < 30).sort((a, b) => needs[a.key] - needs[b.key]).slice(0, 3);
  const r = 29;
  const c = 2 * Math.PI * r;
  // When the mood changes, the emoji badge on the portrait pops (no text chip).
  const [moodFlash, setMoodFlash] = useState(false);
  const lastMood = useRef(mood.label);
  useEffect(() => {
    if (lastMood.current === mood.label) return;
    lastMood.current = mood.label;
    setMoodFlash(true);
    const id = setTimeout(() => setMoodFlash(false), 3200);
    return () => clearTimeout(id);
  }, [mood.label]);

  return (
    <div className="needs">
      <button
        type="button"
        className={`avatar-badge ${alert ? 'alert' : ''}`}
        aria-label={`${name || 'Your avatar'} — ${mood.label}. ${alert ? `${worst.label} is low. ` : ''}Tap for details`}
        onClick={() => useGame.getState().openProfile('profile')}
        style={{ borderColor: origin.color }}
      >
        <GlBoundary where="portrait" fallback={null}><ProfilePortrait look={look} /></GlBoundary>
        <svg className="avatar-ring" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r={r} fill="none" stroke={needColor(worstValue)} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.04, worstValue / 100))} />
        </svg>
        <span
          key={mood.label}
          className={`mood-pip ${moodFlash ? 'pop' : ''}`}
          role="button"
          aria-label={`Mood: ${mood.label}. Open stats`}
          onClick={(e) => { e.stopPropagation(); useGame.getState().openProfile('stats'); }}
        ><Emoji char={mood.emoji} size={26} /></span>
      </button>
      {low.length > 0 && (
        <div className="need-alerts" role="status">
          <i className="thought-dot a" aria-hidden="true" />
          <i className="thought-dot b" aria-hidden="true" />
          {low.map((n) => {
            const v = needs[n.key];
            const critical = v < 15;
            return (
              <button
                key={n.key}
                type="button"
                className={`need-alert ${critical ? 'critical' : ''}`}
                onClick={() => useGame.getState().openProfile('stats')}
                style={{ borderColor: needColor(v) }}
                aria-label={`${n.label} is ${critical ? 'critical' : 'low'}: ${Math.round(v)}. ${NEED_HINT[n.key]}`}
              >
                <Emoji char={n.icon} size={18} />
                <b className="need-alert-num" style={{ background: needColor(v) }}>{Math.round(v)}</b>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The portrait only idles, so it redraws a few times a second instead of every frame. */
function SlowFrames({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = setInterval(() => invalidate(), 1000 / fps);
    return () => clearInterval(id);
  }, [invalidate, fps]);
  return null;
}

export const ProfilePortrait = memo(function ProfilePortrait({ look }: { look: string }) {
  const clip = useRef<Clip>('idle');
  return (
    <Canvas frameloop="demand" camera={{ position: [0, 0.04, 1.6], fov: 22 }} dpr={1} gl={{ alpha: true, antialias: true }}>
      <SlowFrames fps={8} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[2, 4, 3]} intensity={1.4} />
      {/* Head and shoulders: the camera looks at the origin, so the face (about 1.6 up) sits there. */}
      <group position={[0, -1.6, 0]}>
        <Person look={look} clipRef={clip} />
      </group>
    </Canvas>
  );
});

/**
 * Where the game's buttons sit. Corner layout: you and your money at the top, the time on the right; at the bottom a Home/Decor pill
 * on the left and Phone, Map and Chat fanned in the right corner.
 * Switch it off to get the old bottom bar back.
 */
const CORNER_HUD = true;

function NavShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!CORNER_HUD) return;
    document.body.classList.add('corner-hud');
    return () => document.body.classList.remove('corner-hud');
  }, []);
  if (!CORNER_HUD) return <nav className="nav">{children}</nav>;
  const all = Children.toArray(children) as ReactElement<{ 'data-k'?: string }>[];
  const key = (c: ReactElement<{ 'data-k'?: string }>) => c.props?.['data-k'];
  return (
    <>
      {/* Bottom left: what is here (Home, Decor, Activities, Leave...) in one small pill, with plain names. */}
      <div className="corner-pill">{all.filter((c) => !key(c))}</div>
      {/* Bottom right: Phone in the corner, Map beside it and Chat above them, fanned round the Phone. */}
      <div className="corner-fan">
        <ChatButton />
        {all.filter((c) => key(c) === 'map')}
        {all.filter((c) => key(c) === 'phone')}
      </div>
    </>
  );
}

function Nav() {
  const mode = useGame((s) => s.mode);
  const panel = useGame((s) => s.panel);
  const setMode = useGame((s) => s.setMode);
  const setPanel = useGame((s) => s.setPanel);
  const view = useGame((s) => s.view);
  const properties = useGame((s) => s.properties);
  const placeHubOpen = useGame((s) => s.placeHubOpen);
  const setPlaceHubOpen = useGame((s) => s.setPlaceHubOpen);
  const openMap = useGame((s) => s.openMap);
  const goHome = useGame((s) => s.goHome);
  const streetStart = useGame((s) => s.started && s.origin === 'almajiri' && !s.properties.some((p) => p.stage >= STAGES.length));
  const visiting = useVisit((v) => !!v.current);
  const jailed = useGame((s) => !!s.jailedUntil);
  // Taken by kidnappers: no home, activities or map to go to.
  const kidnapped = useGame((s) => !!s.heldUntil || (s.view === 'place' && s.insideId === 'camp'));
  const inRoom = useGame((s) => s.view === 'place' && isPrivateRoom(s.insideId));
  const flight = useGame(flightOf);
  const cabinOpen = useCabin((c) => c.open);
  const working = useGame((s) => s.task?.actionId === 'work' && s.task.phase === 'doing');
  const shiftOver = useGame((s) => s.task?.actionId === 'work' && !!s.task.over);
  const onJob = useShift((s) => !!s.task && s.stage === 'play');
  // In a house you built, the way out is the door to its estate (the government house has none: its way out is the map).
  const inEstateHouse = useGame((s) => s.view === 'home' && s.properties.some((p) => p.id === (s.activeHouseId ?? s.homePropertyId)));
  const tab = panel ?? (view === 'city' ? 'map' : view === 'estate' ? 'estate' : view === 'place' ? 'out' : mode === 'buy' ? 'buy' : 'home');
  if (kidnapped) {
    // In the kidnappers' camp the only thing you can do is call for help on the phone.
    return (
      <NavShell>
        <button data-k="phone" className={tab === 'phone' ? 'on' : ''} onClick={() => { setPlaceHubOpen(false); setPanel(panel === 'phone' ? null : 'phone'); }}>
          <span><Emoji char="📱" size={24} /></span>Phone
        </button>
      </NavShell>
    );
  }
  if (jailed) {
    // Locked up there is no home or map to go to: just the cell's activities, and the phone.
    return (
      <NavShell>
        <button className={placeHubOpen ? 'on' : ''} onClick={() => { setPanel(null); setPlaceHubOpen(!placeHubOpen); }}>
          <span><Emoji char="🎯" size={24} /></span>Activities
        </button>
        <button data-k="phone" className={tab === 'phone' ? 'on' : ''} onClick={() => { setPlaceHubOpen(false); setPanel(panel === 'phone' ? null : 'phone'); }}>
          <span><Emoji char="📱" size={24} /></span>Phone
        </button>
      </NavShell>
    );
  }
  if (working) {
    // On shift you can't use the place or go anywhere: leave your post (ui/ShiftGame.tsx asks if you are sure), or use the phone.
    return (
      <NavShell>
        {shiftOver ? (
          <button onClick={() => { setPanel(null); useGame.getState().clockOut(); }}>
            <span><Emoji char="✅" size={24} /></span>Clock out
          </button>
        ) : (
          <button className="leave" disabled={onJob} onClick={() => { setPanel(null); useShift.setState({ leaving: true }); }}>
            <span><Emoji char="🚪" size={24} /></span>Leave early
          </button>
        )}
        <button data-k="phone" className={tab === 'phone' ? 'on' : ''} onClick={() => setPanel(panel === 'phone' ? null : 'phone')}>
          <span><Emoji char="📱" size={24} /></span>Phone
        </button>
      </NavShell>
    );
  }
  if (flight) {
    // In the air there is nowhere to go: home, the map and the airport's activities wait until you land. Call the crew, take a picture, or use the phone.
    const setCabin = useCabin.getState().setOpen;
    return (
      <NavShell>
        <button className={cabinOpen && !panel ? 'on' : ''} onClick={() => { setPanel(null); setCabin(!cabinOpen); }}>
          <span><Emoji char={flight === 'jet' ? '🥂' : '🛒'} size={24} /></span>{flight === 'jet' ? 'Service' : 'Trolley'}
        </button>
        <button onClick={() => { setCabin(false); openCamera(); }}>
          <span><Emoji char="📸" size={24} /></span>Camera
        </button>
        <button data-k="phone" className={tab === 'phone' ? 'on' : ''} onClick={() => { setCabin(false); setPanel(panel === 'phone' ? null : 'phone'); }}>
          <span><Emoji char="📱" size={24} /></span>Phone
        </button>
      </NavShell>
    );
  }
  if (visiting) {
    // In someone else's house there's no home/buy/map: just leave, or use the phone.
    return (
      <NavShell>
        <button className="leave" onClick={() => { setPanel(null); leaveHouseVisit(); }}>
          <span><Emoji char="🚪" size={24} /></span>Leave
        </button>
        <button data-k="phone" className={tab === 'phone' ? 'on' : ''} onClick={() => setPanel(panel === 'phone' ? null : 'phone')}>
          <span><Emoji char="📱" size={24} /></span>Phone
        </button>
      </NavShell>
    );
  }
  if (inRoom) {
    // In a hotel room or the President's suite there is no map and no activities list: go back out to the lobby or the office, or use the phone.
    return (
      <NavShell>
        <button className="leave" onClick={() => { setPanel(null); useGame.getState().leaveRoom(); }}>
          <span><Emoji char="🚪" size={24} /></span>Leave
        </button>
        <button data-k="phone" className={tab === 'phone' ? 'on' : ''} onClick={() => setPanel(panel === 'phone' ? null : 'phone')}>
          <span><Emoji char="📱" size={24} /></span>Phone
        </button>
      </NavShell>
    );
  }
  if (mode === 'buy' && view === 'home' && (!panel || panel === 'phone')) {
    // Furnishing the house: just finish (back to live mode), or use the phone.
    return (
      <NavShell>
        <button className="leave" onClick={() => { setPanel(null); setMode('live'); }}>
          <span><Emoji char="✅" size={24} /></span>Exit
        </button>
        <button data-k="phone" className={tab === 'phone' ? 'on' : ''} onClick={() => setPanel(panel === 'phone' ? null : 'phone')}>
          <span><Emoji char="📱" size={24} /></span>Phone
        </button>
      </NavShell>
    );
  }
  return (
    <NavShell>
      {inEstateHouse ? (
        <button className="leave" onClick={() => { setPanel(null); setPlaceHubOpen(false); useGame.getState().leaveHome(); }}>
          <span><Emoji char="🚪" size={24} /></span>Go outside
        </button>
      ) : (
        <button
          className={tab === 'home' ? 'on' : ''}
          onClick={() => {
            setPanel(null);
            setPlaceHubOpen(false);
            if (view === 'home') setMode('live');
            else if (streetStart) goHome(); // no house yet: it just explains why
            else useTravel.getState().ask({ kind: 'home' });
          }}
        >
          <span><Emoji char={streetStart ? '🚶🏾' : '🏠'} size={24} /></span>{streetStart ? 'Street' : 'Home'}
        </button>
      )}
      {view === 'place' ? (
        <button className={placeHubOpen ? 'on' : ''} onClick={() => setPlaceHubOpen(!placeHubOpen)}>
          <span><Emoji char="🎯" size={24} /></span>Activities
        </button>
      ) : view === 'city' || view === 'estate' ? (
        <button className={tab === 'estate' ? 'on' : ''} onClick={() => {
          const property = properties[0];
          setPanel(null);
          setPlaceHubOpen(false);
          useTravel.getState().ask({ kind: 'estate', region: property?.region ?? 'kachia', no: property ? sectionOf(property.slot ?? 0) : 0 });
        }}>
          <span><Emoji char="🏘️" size={24} /></span>Estates
        </button>
      ) : (
        <button className={tab === 'buy' ? 'on' : ''} disabled={view !== 'home'} onClick={() => setMode('buy')}>
          <span><Emoji char="🛋️" size={24} /></span>Decor
        </button>
      )}
      <button
        data-k="map"
        className={tab === 'map' ? 'on' : ''}
        onClick={() => {
          setPanel(null);
          setPlaceHubOpen(false);
          openMap();
        }}
      >
        <span><Emoji char="🗺️" size={24} /></span>Map
      </button>
      <button data-k="phone" className={tab === 'phone' ? 'on' : ''} onClick={() => { setPlaceHubOpen(false); setPanel(panel === 'phone' ? null : 'phone'); }}>
        <span><Emoji char="📱" size={24} /></span>Phone
      </button>
    </NavShell>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.map((t) => {
        const home = t.chatUid ? null : toastHome(t.text);
        const target = t.chatUid || home ? null : toastApp(t.text);
        const place = t.chatUid || target || home ? null : toastPlace(t.text);
        const clickable = !!(t.chatUid || home || target || place);
        return (
        <div
          key={t.id}
          className="toast"
          role={clickable ? 'button' : 'status'}
          tabIndex={clickable ? 0 : undefined}
          onClick={() => {
            if (t.chatUid) {
              useSocial.setState({ openWith: t.chatUid });
              useGame.getState().setPanel('phone');
            } else if (home) {
              const game = useGame.getState();
              game.setPanel(null);
              game.setPlaceHubOpen(false);
              if (home.kind === 'home') {
                if (game.view === 'home') game.setMode('live');
                else useTravel.getState().ask({ kind: 'home' });
              } else {
                const property = game.properties[0];
                useTravel.getState().ask({ kind: 'estate', region: property?.region ?? 'kachia', no: property ? sectionOf(property.slot ?? 0) : 0 });
              }
            } else if (target) {
              if (target.id === 'help') useHelp.getState().setFocus(tipOfToast(t.text));
              useGame.setState({ openApp: target.id, ...(target.lightTab ? { lightTab: target.lightTab } : {}) });
              useGame.getState().setPanel('phone');
            } else if (place) {
              // Same as the live banner: out to the map with the place picked, so you choose how to travel.
              const game = useGame.getState();
              game.setPanel(null);
              if (game.view !== 'city') game.openMap();
              const now = useGame.getState();
              if (now.view === 'city') now.selectPlace(place.id);
            }
            dismiss(t.id);
          }}
          onKeyDown={clickable ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.currentTarget.click();
            }
          } : undefined}
        >
          <span>{t.text}</span>
          {t.chatUid && <small>Tap to open chat</small>}
          {home && <small>Tap to go to {home.label}</small>}
          {target && <small>Tap to open {target.label}</small>}
          {place && <small>Tap to go to {place.label}</small>}
          <div className="toast-progress" role="progressbar" aria-label="Time until notification disappears" aria-valuemin={0} aria-valuemax={100} aria-valuenow={100}>
            <i />
          </div>
        </div>
        );
      })}
    </div>
  );
}

export function Hud() {
  const mode = useGame((s) => s.mode);
  const visiting = useVisit((v) => !!v.current);
  const [leftStackCollapsed, setLeftStackCollapsed] = useState(false);
  const [leftStackCount, setLeftStackCount] = useState(0);
  const leftStack = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = leftStack.current;
    if (!element) return;
    const updateCount = () => {
      const count = element.querySelectorAll(':scope > :not(.stack-tools):not(.toasts):not(.work-chip)').length;
      setLeftStackCount(count);
      // Nothing left to hide: open up again so the next notice is not swallowed.
      if (!count) setLeftStackCollapsed(false);
    };
    const observer = new MutationObserver(updateCount);
    observer.observe(element, { childList: true });
    updateCount();
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <TopBar />
      <div ref={leftStack} className={`left-stack ${leftStackCollapsed ? 'collapsed' : ''} ${mode === 'buy' ? 'decorating' : ''}`}>
        {/* Radio sits right under the clock; a .stack-tools row so collapsing the notices never hides it */}
        <div className="stack-tools">
          <RadioPill />
        </div>
        <NotificationBanner />
        <LiveBanner />
        <DisasterBanner />
        <ElectionDayPill />
        <DebtPill />
        <BudgetChip />
        <PowerChip />
        <ChowChip />
        <StayChip />
        <WorkChip />
        <KidChip />
        {mode === 'live' && <TaskChip />}
        <Toasts />
        <div className="stack-tools">
          {leftStackCount > 0 && (
            <button
              className="stack-collapse"
              type="button"
              aria-label={leftStackCollapsed ? 'Expand left-side notices' : 'Collapse left-side notices'}
              aria-expanded={!leftStackCollapsed}
              onClick={() => setLeftStackCollapsed(!leftStackCollapsed)}
            >
              <Chevron dir={leftStackCollapsed ? 'down' : 'up'} />
              {leftStackCollapsed && <i className="stack-count">{leftStackCount}</i>}
            </button>
          )}
          <PowerSaveButton />
          <ThemeButton />
          <PhotoButton />
        </div>
      </div>
      <LobbyShoutout />
      <GazetteBanner />
      {!CORNER_HUD && <ChatButton />}
      {!CORNER_HUD && <Needs />}
      <MoneyRain />
      <GameTips />
      {/* In someone's house you are still "inside" the venue you came from: its card, pills and desks wait until you are back. */}
      {!visiting && <RoomCard />}
      {!visiting && <HotelLauncher />}
      {!visiting && <SuiteLauncher />}
      {!visiting && <HotelDesk />}
      <FlightBanner />
      {!visiting && <FlightLauncher />}
      {!visiting && <TrainLauncher />}
      {!visiting && <FlightDesk />}
      {!visiting && <TrainDesk />}
      <CabinService />
      <Nav />
    </>
  );
}

const SHOUT_MS = 5200;

/** Big-screen hail for the club or everyone in a building lobby. */
export function LobbyShoutout() {
  const cur = useShoutouts((s) => s.queue[0]);
  const shift = useShoutouts((s) => s.shift);
  useEffect(() => {
    if (!cur) return;
    const id = setTimeout(shift, SHOUT_MS);
    return () => clearTimeout(id);
  }, [cur, shift]);
  useEffect(() => {
    if (cur && !cur.mine && (cur.action === 'spray_money' || cur.action === 'spray_heavy' || cur.action === 'dorime' || cur.action === 'club_takeover')) useMoneyRain.getState().fall(cur.action !== 'spray_money');
  }, [cur?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cur) return null;
  const placeDef = PLACE_SHOUTS[cur.action as keyof typeof PLACE_SHOUTS];
  const def = placeDef ?? CLUB_SHOUTS[cur.action];
  if (!def) return null;
  if (cur.action === 'dorime') {
    return (
      <div key={cur.key} className="dorime-marquee" role="status" aria-live="polite">
        <div className="dorime-bulbs" />
        <div className="dorime-name">{(cur.mine ? 'YOU' : cur.name).toUpperCase()}</div>
        <div className="dorime-tag">DORIME</div>
      </div>
    );
  }
  // A shout only reaches the lobby it was made in, so the place is this city's.
  const placeName = cur.place ? placeHere(cur.place)?.name ?? 'VENUE' : null;
  return (
    <div key={cur.key} className={`club-shout ${placeDef ? 'place-shout' : ''} tier${def.tier}`} role="status" aria-live="polite">
      <div className="club-shout-icon">{def.icon}</div>
      <div className="club-shout-body">
        <small>{placeName ? `🏙️ ${placeName.toUpperCase()} · ON EVERY LOBBY SCREEN` : `🪩 ${(placeHere('club')?.name ?? 'The club').toUpperCase()} · ON THE BIG SCREEN`}</small>
        <b>{cur.mine ? 'YOU' : cur.name}</b>
        <span>@{cur.username} {def.headline}{cur.target ? ` @${cur.target}` : ''}</span>
        {cur.amount > 0 && <em>{naira(cur.amount)}</em>}
        <i>{placeName ? '👏🏾 The whole lobby saw that! 👏🏾' : '👏🏾 Clear the way for Odogwu! 👏🏾'}</i>
      </div>
    </div>
  );
}

const NOTES = 28;
const NOTES_LOW = 14;
const RAIN_MS = 4200;

/** Naira notes drifting down the whole screen while somebody sprays money in the club. */
export function MoneyRain() {
  const { key, heavy } = useMoneyRain();
  const [live, setLive] = useState(0);
  const lowPerf = useLowPerf();
  // While you're in the middle of a spray activity the notes never stop: a looping, heavier shower.
  const sprayId = useGame((s) => (s.task?.phase === 'doing' && SPRAY_ACTIONS.has(s.task.actionId) ? s.task.actionId : ''));
  useEffect(() => {
    if (!key || sprayId) return;
    setLive(key);
    const id = setTimeout(() => setLive(0), RAIN_MS + 1500);
    return () => clearTimeout(id);
  }, [key]);
  if (!live && !sprayId) return null;
  const base = lowPerf ? NOTES_LOW : NOTES;
  const count = heavy || (sprayId && sprayId !== 'spray_money') ? base * 2 : base;
  return (
    <div className={`money-rain ${sprayId ? 'loop' : ''}`} key={sprayId || live} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37 + (i % 5) * 11) % 100}%`,
            animationDelay: `${((i * 53) % 100) / 100 * 1.4}s`,
            animationDuration: `${2.4 + ((i * 29) % 100) / 100 * 1.8}s`,
            fontSize: `${22 + (i % 4) * 6}px`,
          }}
        >
          {i % 6 === 0 ? '💸' : i % 3 === 0 ? '💵' : '💶'}
        </i>
      ))}
    </div>
  );
}
