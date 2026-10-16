import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HOT_ACTIONS, JOBS, type ActionDef } from '../game/catalog';
import { naira, taskDurationSeconds, useGame } from '../game/store';
import { cityMap, PLACE_BY_ID, type Place } from '../game/city';
import { regionPlace } from '../game/regions';
import { employment } from '../game/jobs';
import { useHeldOffice } from '../net/office';
import { Emoji, Icon } from './Icons';
import { openElectionDesk } from './Election';
import { openVenueBet } from './VenueBetting';
import { placeLink, shareLink } from '../net/deeplink';
import { STALLS } from '../game/career';
import { loadPlaceShops, usePlaceShops } from '../net/market';
import { PlaceShopsPanel } from './Market';
import { oddJobPay } from '../game/gigs';


export type ActivityTab = 'all' | 'wild' | 'spend' | 'social' | 'work' | 'shops';

/** The activity filters, in the order they sit in the tab row. Short names so the whole row fits a phone without scrolling. */
const ACTIVITY_TABS: { id: Exclude<ActivityTab, 'shops'>; icon: string; label: string; title: string }[] = [
  { id: 'all', icon: '⚡', label: 'All', title: 'All activities' },
  { id: 'wild', icon: '🪩', label: 'Wild', title: 'Vibe & Wild' },
  { id: 'spend', icon: '💸', label: 'Flex', title: 'Spend & Flex' },
  { id: 'social', icon: '🎭', label: 'Social', title: 'Social & Drama' },
  { id: 'work', icon: '💼', label: 'Hustle', title: 'Jobs & Hustle' },
];

export const DRIP_REVIEWS = [
  '🔥 10/10 DRIP! Senior man! This outfit fit win election anywhere!',
  '✨ 9/10 DRIP! Looking like a Dubai oil contractor who just landed Mando Airport!',
  '👀 5/10 DRIP: Wetin be this combination? Looking like Sunday School teacher on casual Friday!',
  '💀 2/10 DRIP: Oga who styled you? Color blocking looking like traffic light for Kawo flyover!',
  '💎 100/10 ODOGWU DRIP: Clean senator material with glistening gold cufflinks! Untouchable!',
  '🧢 7/10 STREET DRIP: Fresh out the barbershop, ready to cause problem for the whole town!',
];

export function getActionCategory(a: ActionDef): 'wild' | 'spend' | 'social' | 'work' {
  if (a.category) return a.category;
  if (a.payout) return 'work';
  if (a.cost && a.cost > 0) return 'spend';
  return 'social';
}

interface PlaceActivityTabsProps {
  place: Place;
  insideVenue?: boolean;
  onClose?: () => void;
}

export function PlaceActivityTabs({ place, insideVenue, onClose }: PlaceActivityTabsProps) {
  const [picked, setTab] = useState<ActivityTab>('all');
  const money = useGame((s) => s.money);
  // The job at this place is yours only when you were hired in this city (game/jobs.ts).
  const myJobId = useGame((s) => (s.jobId && cityMap(s.destinationId).id === employment(s)?.city ? s.jobId : null));
  const startPlaceAction = useGame((s) => s.startPlaceAction);
  const toast = useGame((s) => s.toast);

  // Player-run stalls: only some places rent them (src/game/career.ts STALLS).
  const hasStalls = place.id in STALLS;
  const shopsOpen = usePlaceShops((s) => s.places[place.id]?.open ?? 0);
  useEffect(() => { if (hasStalls) void loadPlaceShops(); }, [hasStalls, place.id]);

  const jobsHere = useMemo(() => JOBS.filter((j) => place.jobs?.includes(j.id)), [place.jobs]);

  // What only an office holder can do (the President's desk at Aso Villa) is listed for that office holder alone.
  const office = useHeldOffice();
  const categorizedActions = useMemo(() => {
    // Flights are booked at the flight desk and trains at the ticket desk (ui/TrainDesk.tsx), not listed among the activities.
    return place.actions.filter((a) => (!a.office || a.office === office) && !(a.effect === 'travel' && (place.id === 'airport' || a.rail))).map((a) => ({
      ...a,
      effectiveCat: getActionCategory(a),
    }));
  }, [place.actions, office]);

  const counts = useMemo(() => {
    return {
      all: categorizedActions.length + jobsHere.length,
      wild: categorizedActions.filter((a) => a.effectiveCat === 'wild').length,
      spend: categorizedActions.filter((a) => a.effectiveCat === 'spend').length,
      social: categorizedActions.filter((a) => a.effectiveCat === 'social').length,
      work: categorizedActions.filter((a) => a.effectiveCat === 'work').length + jobsHere.length,
    };
  }, [categorizedActions, jobsHere.length]);

  // A filter with nothing under it is not offered, so a tab picked before the list changed falls back to All.
  const tab: ActivityTab = picked === 'shops' ? (hasStalls ? picked : 'all') : counts[picked] ? picked : 'all';

  const filteredActions = useMemo(() => {
    if (tab === 'all') return categorizedActions;
    if (tab === 'wild') return categorizedActions.filter((a) => a.effectiveCat === 'wild');
    if (tab === 'spend') return categorizedActions.filter((a) => a.effectiveCat === 'spend');
    if (tab === 'social') return categorizedActions.filter((a) => a.effectiveCat === 'social');
    if (tab === 'work') return categorizedActions.filter((a) => a.effectiveCat === 'work');
    return [];
  }, [tab, categorizedActions]);

  const handleExecute = (a: ActionDef) => {
    if (a.cost && money < a.cost) {
      toast(`You need ${naira(a.cost)} for that!`);
      return;
    }
    startPlaceAction(place.id, a.id);
    if (onClose) onClose();
  };

  const filters = ACTIVITY_TABS.filter((t) => t.id === 'all' || counts[t.id] > 0);
  // One kind of activity and no stalls (a prison cell): the row would only repeat the list under it.
  const showTabs = hasStalls || filters.length > 2;

  return (
    <div className="place-activity-hub">
      {/* Tab bar: every tab in view at once, empty filters left out. Player shops keep to their own tab. */}
      {showTabs && <div className="hub-tabs" role="tablist" aria-label="Place activity categories">
        {filters.map((t) => (
          <button
            key={t.id}
            className={`hub-tab tab-${t.id} ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
            aria-label={`${t.title}, ${counts[t.id]}`}
            title={t.title}
          >
            <span><Emoji char={t.icon} size={18} /></span>
            <b>{t.label}</b>
            <small>{counts[t.id]}</small>
          </button>
        ))}
        {hasStalls && (
          <button
            className={`hub-tab tab-shops ${tab === 'shops' ? 'active' : ''}`}
            onClick={() => setTab('shops')}
            role="tab"
            aria-selected={tab === 'shops'}
            aria-label={`Player shops, ${shopsOpen} open`}
            title="Player shops"
          >
            <span><Emoji char="🏪" size={18} /></span>
            <b>Shops</b>
            <small>{shopsOpen}</small>
          </button>
        )}
      </div>}

      {/* Content panel */}
      <div className="hub-content">
        {insideVenue && place.id === 'secretariat' && (
          <button
            className="venue-bet-entry"
            onClick={() => {
              openElectionDesk();
              onClose?.();
            }}
          >
            🗳️ Elections · run for a post
          </button>
        )}
        {insideVenue && place.id === 'hamdala' && (
          <button className="venue-bet-entry" onClick={() => useGame.getState().setHotelDesk(true)}>
            🛎️ Reception · book a room
          </button>
        )}
        {insideVenue && (place.id === 'viewing' || place.id === 'pitch') && (
          <button
            className="venue-bet-entry"
            onClick={() => {
              openVenueBet(place.id === 'viewing' ? 'viewing' : 'pitch');
              onClose?.();
            }}
          >
            🎟 Bet on a {place.id === 'viewing' ? 'football match' : 'pitch game'} · In-game naira
          </button>
        )}
        {tab === 'shops' ? (
          <PlaceShopsPanel placeId={place.id} />
        ) : (
          <div className="hub-activities-grid">
            {/* Action cards */}
            {filteredActions.map((a) => {
              const cantAfford = a.cost && money < a.cost;
              if (insideVenue) {
                return (
                  <button
                    key={a.id}
                    className={`hub-card hub-activity-tile cat-${a.effectiveCat} ${HOT_ACTIONS.has(a.id) ? 'hot' : ''} ${cantAfford ? 'unaffordable' : ''}`}
                    disabled={!!cantAfford}
                    onClick={() => handleExecute(a)}
                    aria-label={`${a.label}${a.payout ? ', earn money' : a.cost ? `, costs ${naira(a.cost)}` : ''}`}
                  >
                    <span className="hub-card-icon"><Emoji char={a.icon} size={22} /></span>
                    <span className="hub-tile-text">
                      <b className="hub-tile-title">{a.label}</b>
                      <span className="hub-tile-sub">
                        {a.payout ? (
                          <span className="hub-tile-meta earn">+{naira(oddJobPay(a.payout))}</span>
                        ) : a.cost ? (
                          <span className="hub-tile-meta cost">{cantAfford ? `Need ${naira(a.cost)}` : naira(a.cost)}</span>
                        ) : (
                          <span className="hub-tile-meta free">Free</span>
                        )}
                        {a.minutes ? <span className="hub-tile-time">{taskDurationSeconds(a.minutes, a.minutes, !!(a.cookingPerHour || a.fast))}s</span> : null}
                      </span>
                    </span>
                    <span className="hub-tile-chev" aria-hidden="true">›</span>
                  </button>
                );
              }
              return (
                <div key={a.id} className={`hub-card ${cantAfford ? 'unaffordable' : ''}`}>
                  <div className="hub-card-top">
                    <span className="hub-card-icon"><Emoji char={a.icon} size={24} /></span>
                    <div className="hub-card-title-group">
                      <b>{a.label}</b>
                      <span className={`hub-cat-badge ${a.effectiveCat}`}>
                        {a.effectiveCat === 'wild' && '🪩 Wild'}
                        {a.effectiveCat === 'spend' && '💸 Flex'}
                        {a.effectiveCat === 'social' && '🎭 Social'}
                        {a.effectiveCat === 'work' && '💼 Hustle'}
                      </span>
                    </div>
                  </div>

                  {a.tagline && <p className="hub-card-tagline">“{a.tagline}”</p>}

                  <div className="hub-card-bottom">
                    <div className="hub-card-meta">
                      {a.minutes ? <span className="meta-pill time">⏱️ {taskDurationSeconds(a.minutes, a.minutes, !!(a.cookingPerHour || a.fast))} sec</span> : null}
                      {a.payout ? (
                        <span className="meta-pill payout">💰 +{naira(oddJobPay(a.payout))} earn</span>
                      ) : a.cost ? (
                        <span className="meta-pill cost">🏷️ {naira(a.cost)}</span>
                      ) : (
                        <span className="meta-pill free">✨ Free</span>
                      )}
                    </div>
                    <span className="hub-card-preview-tag">📍 Available inside</span>
                  </div>
                </div>
              );
            })}

            {/* Jobs if in 'work' or 'all' */}
            {(tab === 'work' || tab === 'all') &&
              jobsHere.map((j) => {
                const isMyJob = myJobId === j.id;
                if (insideVenue) {
                  return (
                    <button
                      key={j.id}
                      type="button"
                      className={`hub-card hub-activity-tile hub-job-tile cat-work ${isMyJob ? 'my-job' : ''}`}
                      aria-label={`${j.title}${isMyJob ? ', your current job' : ''}. Start shift`}
                      onClick={() => startPlaceAction(place.id, 'work')}
                    >
                      <span className="hub-card-icon"><Emoji char={j.icon} size={22} /></span>
                      <span className="hub-tile-text">
                        <b className="hub-tile-title">{j.title}</b>
                        <span className="hub-tile-sub">
                          <span className="hub-tile-meta earn">{naira(j.pay)}/shift</span>
                          <span className="hub-tile-time">{j.start}:00–{j.end}:00 · Start shift</span>
                        </span>
                      </span>
                    </button>
                  );
                }
                return (
                  <div key={j.id} className={`hub-card job-card ${isMyJob ? 'my-job' : ''}`} role="button" tabIndex={0} onClick={() => startPlaceAction(place.id, 'work')} onKeyDown={(e) => { if (e.key === 'Enter') startPlaceAction(place.id, 'work'); }}>
                    <div className="hub-card-top">
                      <span className="hub-card-icon"><Emoji char={j.icon} size={24} /></span>
                      <div className="hub-card-title-group">
                        <b>{j.title}</b>
                        <span className="hub-cat-badge work">💼 Official Career</span>
                      </div>
                    </div>
                    <p className="hub-card-tagline">Shift: {j.start}:00 – {j.end}:00 · Daily wage: {naira(j.pay)}</p>
                    <div className="hub-card-bottom">
                      <span className="meta-pill payout">💵 {naira(j.pay)}/shift</span>
                      <span className={`job-status-pill ${isMyJob ? 'active' : ''}`}>
                        {isMyJob ? '⭐ Your job · Start shift' : '💼 Take job & start shift'}
                      </span>
                    </div>
                  </div>
                );
              })}

            {filteredActions.length === 0 && (tab !== 'work' || jobsHere.length === 0) && (
              <div className="hub-empty">
                <span>🤷🏾</span>
                <b>No activities under this tab</b>
                <p>Check the other tabs to see what’s popping at {place.name}!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Tells the HUD how high the open catalogue reaches, so the venue's floating pill (book a flight, book a room) rides above it. */
function useHubLift(shown: boolean) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const ui = el?.closest<HTMLElement>('.ui');
    if (!el || !ui) return;
    const measure = () => ui.style.setProperty('--hub-top', `${Math.round(ui.getBoundingClientRect().bottom - el.getBoundingClientRect().top)}px`);
    measure();
    // Switching tabs changes the catalogue's height; rotating the phone moves it.
    const sized = new ResizeObserver(measure);
    sized.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      sized.disconnect();
      window.removeEventListener('resize', measure);
      ui.style.removeProperty('--hub-top');
    };
  }, [shown]);
  return ref;
}

/** Compact activity catalogue shown while the player is inside a venue. */
export function PlaceHubDrawer() {
  const open = useGame((s) => s.placeHubOpen);
  const setOpen = useGame((s) => s.setPlaceHubOpen);
  const view = useGame((s) => s.view);
  const insideId = useGame((s) => s.insideId);
  const destinationId = useGame((s) => s.destinationId);
  // On shift the place's activities are closed to you.
  const working = useGame((s) => s.task?.actionId === 'work' && s.task.phase === 'doing');
  const drawer = useHubLift(open && view === 'place' && !!insideId && !working);

  if (!open || view !== 'place' || !insideId || working) return null;

  const place = regionPlace(destinationId, insideId) ?? PLACE_BY_ID[insideId];
  if (!place) return null;

  return (
    <div className="placehub-backdrop">
      <aside
        ref={drawer}
        className="placehub-drawer placehub-catalogue"
        aria-label={`${place.name} Activities`}
      >
        <header className="placehub-head">
          <h3>{place.name}</h3>
          <button
            className="share-place-btn"
            aria-label="Share this location"
            title="Share location"
            onClick={() => void shareLink(placeLink(place.id, cityMap(destinationId).id), `${place.icon} ${place.name} — Naija City`)}
          >
            <Icon name="share" size={16} />
          </button>
          <button className="x placehub-close" onClick={() => setOpen(false)} aria-label="Close activities">
            ✕
          </button>
        </header>

        <PlaceActivityTabs place={place} insideVenue={true} onClose={() => setOpen(false)} />
      </aside>
    </div>
  );
}
