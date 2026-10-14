import { useEffect, useState } from 'react';
import { useLowPerf, useQuality } from '../game/quality';
import { REGION_IDS, regionOf, regionPlace, type RegionId } from '../game/regions';
import { useGame } from '../game/store';
import { startTour, useTour } from '../game/tour';
import { useCityStats, watchCityStats } from '../net/cityStats';
import { authMessage, signInGuest } from '../net/firebase';
import { useSession } from '../net/session';
import { AuthSheet, useAuthUi } from './Auth';
import { Emoji } from './Icons';
import './landing-tour.css';
import { REPO_URL } from './OpenSource';

/** Players-online count on the front page. Switched off for now; set true to show it again. */
const SHOW_ONLINE = false;

/**
 * The cities as a row of tabs. Tapping one shows that city's real map, and it stays the one picked.
 */
const TAB_ORDER: RegionId[] = ['lagos', 'abuja', 'kaduna', 'kano'];
function CityTabs({ picked, onPick }: { picked: RegionId; onPick: (id: RegionId) => void }) {
  const ids = TAB_ORDER.filter((id) => REGION_IDS.includes(id));
  return (
    <div className="city-tabs" role="tablist" aria-label="See a city's map">
      {ids.map((id) => (
        <button key={id} type="button" role="tab" aria-selected={picked === id} className={picked === id ? 'on' : ''} title={`See the ${regionOf(id).name} map`} onClick={() => onPick(id)}>
          {regionOf(id).name}
        </button>
      ))}
    </div>
  );
}

/**
 * The city tour: the game's own map fills the screen and takes the taps. The top bar sits where a player's clock
 * and money do, and says which city this is (or which place you tapped); the footer is the way in.
 */
function Tour({ city, onPick }: { city: RegionId; onPick: (id: RegionId) => void }) {
  const show = useAuthUi((s) => s.show);
  const online = useCityStats((s) => s.stats?.online ?? 0);
  const placeId = useGame((s) => s.placeId);
  const region = regionOf(city);
  const place = placeId ? regionPlace(city, placeId) : undefined;
  // The same low power switch as the game's own top bar: a big map is heavy on a weak phone.
  const low = useLowPerf();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One tap in: a guest account with no form. Saving progress with Google or an email comes later, in Settings.
  const play = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInGuest();
    } catch (e) {
      setError(authMessage(e));
      setBusy(false);
    }
  };
  const setQuality = useQuality((s) => s.setQuality);
  return (
    <div className={`title-screen landing touring ${busy ? 'entering' : ''}`}>
      <header className="tour-top">
        <div className="tour-brand" role="img" aria-label="Naija City">
          <span className="tour-mark" aria-hidden="true" />
          <b>Naija<i>City</i></b>
        </div>
        {/* Where you are looking: the city, or the place you tapped on its map. */}
        <div className="tour-where" key={placeId ?? city}>
          <span className="tour-pin" aria-hidden="true"><Emoji char={place?.icon ?? '📍'} size={20} /></span>
          <span className="tour-text">
            <b>{place?.name ?? region.name}</b>
            <small>{place?.blurb ?? region.tagline}</small>
          </span>
        </div>
        <button
          type="button"
          className={`round-btn tour-power ${low ? 'on' : ''}`}
          title={low ? 'Low power mode on. Tap for full quality' : 'Turn on low power mode'}
          aria-label="Low power mode"
          aria-pressed={low}
          onClick={() => setQuality(low ? 'high' : 'low')}
        >
          <Emoji char={low ? '🪫' : '🔋'} size={20} />
        </button>
        {SHOW_ONLINE && online > 0 && <div className="hud-card tour-live"><i className="live-dot" />{online} online</div>}
      </header>
      <footer className="tour-foot">
        <CityTabs picked={city} onPick={onPick} />
        <div className="tour-cta">
          <strong>Your Naija story starts here</strong>
          <p>Hustle, build your house and live alongside real people.</p>
          {error && <p className="auth-msg">{error}</p>}
          <button type="button" className="tour-play" disabled={busy} onClick={() => void play()}>
            {busy ? `Entering ${region.name}…` : <>Play Now <span aria-hidden="true">→</span></>}
          </button>
          <button type="button" className="tour-login" disabled={busy} onClick={() => show('in')}>
            Already have an account? <u>Log in</u>
          </button>
          <small className="tour-fine">Free to play · 18+ · <a href={REPO_URL} target="_blank" rel="noopener noreferrer">Open source</a></small>
        </div>
      </footer>
    </div>
  );
}

/** What a visitor sees before signing in: the game's own map of a city behind two buttons, and the sign-up form over it. */
export function Landing() {
  const status = useSession((s) => s.status);
  const authOpen = useAuthUi((s) => s.open);
  const hide = useAuthUi((s) => s.hide);
  const tour = useTour((s) => s.city);
  const visible = status === 'signedOut';
  const [city, setCity] = useState<RegionId>('lagos');
  const pick = (id: RegionId) => (setCity(id), startTour(id));

  useEffect(() => {
    if (status === 'signedOut') return watchCityStats();
  }, [status]);

  // The map is the front page: it opens on the last city picked, and again after signing out (signing in closes it).
  useEffect(() => {
    if (visible && !tour) startTour(city);
  }, [visible, tour, city]);

  if (!visible) return null;
  if (tour && !authOpen) return <Tour city={tour} onPick={pick} />;

  // Signing up keeps that city's map behind the form.
  return (
    <div className="title-screen landing authing touring">
      <div className="title-top">
        <div className="logo">
          Naija<span>City</span>
          <em className="age-badge"> 18+</em>
        </div>
        <span className="landing-sub">Live your Naija story with real people</span>
      </div>
      <div className="town-strip" />
      <div className="title-sheet auth-sheet">
        <button type="button" className="auth-back" onClick={hide}>← Back</button>
        <AuthSheet />
      </div>
    </div>
  );
}
