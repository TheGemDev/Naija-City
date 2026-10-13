import { useEffect, useState } from 'react';
import { useLowPerf, useQuality } from '../game/quality';
import { REGION_IDS, regionOf, regionPlace, type RegionId } from '../game/regions';
import { useGame } from '../game/store';
import { endTour, startTour, useTour } from '../game/tour';
import { useCityStats, watchCityStats } from '../net/cityStats';
import { useSession } from '../net/session';
import { AuthSheet, useAuthUi } from './Auth';
import { Emoji } from './Icons';
import { TownStrip } from './TownStrip';
import './landing-tour.css';

/** Players-online count on the front page. Switched off for now; set true to show it again. */
const SHOW_ONLINE = false;

const SPOTS = ['✈️ Airport', '🚌 Motor park', '🏛️ Secretariat', '🎖️ NDA', '⛪ Church', '⚽ Stadium', '🪩 Club', '🍲 Mama put', '🏨 Hotel', '🏠 Your own house'];

/** What the game is, said a few ways. The first is the line the boot screen shows, so the page opens on it; the rest follow in a new order each visit. */
const TAGLINES = [
  'Naija life. Real people. Zero chill.',
  'Lagos life, with full Naija craziness.',
  'Kano to Lagos. One Naija, zero chill.',
  'Hustle. Gbese. Owambe. With real people.',
  'Sapa today, Dangote tomorrow. Real people.',
  'Naija no dey carry last. Come live am.',
  'Real people. Real wahala. Zero chill.',
];
const TAGLINE_MS = 3500;

function Tagline() {
  const [order] = useState(() => [TAGLINES[0], ...TAGLINES.slice(1).sort(() => Math.random() - 0.5)]);
  const [at, setAt] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setAt((n) => (n + 1) % order.length), TAGLINE_MS);
    return () => clearInterval(timer);
  }, [order]);
  // Keyed by line, so each one fades in afresh.
  return <span key={at} className="landing-sub tagline">{order[at]}</span>;
}

/**
 * The cities on the front page as a row of tabs, the capital first. Tapping one shows that city's real map, and it stays
 * the one picked. Only these are shown: Lagos is in the game, but the front page leads with the north.
 */
const TAB_ORDER: RegionId[] = ['abuja', 'kaduna', 'kano'];
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
  const setQuality = useQuality((s) => s.setQuality);
  return (
    <div className="title-screen landing touring">
      <div className="tour-top">
        {/* The game's own mark, cut round to the height of the bar. It is also the way back to the front page. */}
        <button type="button" className="round-btn tour-logo" aria-label="Back to Naija City" title="Back to Naija City" onClick={endTour} />
        <div className="hud-card tour-info">
          <span className="tour-icon"><Emoji char={place?.icon ?? '🗺️'} size={24} /></span>
          <div className="tour-text">
            <b>{place?.name ?? region.name}</b>
            <small>{place?.blurb ?? region.tagline}</small>
          </div>
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
      </div>
      <div className="tour-foot">
        <CityTabs picked={city} onPick={onPick} />
        <div className="tour-pill pill">
          <button className="btn big go" onClick={() => show('up')}>Play Now</button>
          <button className="btn big alt" onClick={() => show('in')}>Log in</button>
        </div>
      </div>
    </div>
  );
}

/** What a visitor sees before signing in: the live town behind a few real numbers and two buttons. */
export function Landing() {
  const status = useSession((s) => s.status);
  const authOpen = useAuthUi((s) => s.open);
  const show = useAuthUi((s) => s.show);
  const hide = useAuthUi((s) => s.hide);
  const stats = useCityStats((s) => s.stats);
  const tour = useTour((s) => s.city);
  const visible = status === 'signedOut';
  const [city, setCity] = useState<RegionId>('abuja');
  const pick = (id: RegionId) => (setCity(id), startTour(id));

  useEffect(() => {
    if (status === 'signedOut') return watchCityStats();
  }, [status]);

  if (!visible) return null;
  // The same tabs in the same order as the front page's, on the city being shown; whichever is picked there is the one picked back here.
  if (tour && !authOpen) return <Tour city={tour} onPick={pick} />;

  return (
    <div className={`title-screen landing ${authOpen ? 'authing' : ''} ${tour ? 'touring' : ''}`}>
      <div className="title-top">
        <div className="logo">
          Naija<span>City</span>
          {authOpen && <em className="age-badge"> 18+</em>}
        </div>
        {authOpen ? <span className="landing-sub">Live your Naija story with real people</span> : <Tagline />}
        {!authOpen && (
          <div className="landing-chips">
            {SHOW_ONLINE && stats && stats.online > 0 && <span className="lchip"><i className="live-dot" />{stats.online} online now</span>}
            {stats && <span className="lchip" title="Visits"><Emoji char="👁️" size={15} />{stats.visitsTotal.toLocaleString('en-NG')}</span>}
          </div>
        )}
      </div>

      {/* Signing up from the tour keeps that city's map behind the form, so the island only fills its space. */}
      {tour ? <div className="town-strip" /> : <TownStrip />}

      <div className={`title-sheet ${authOpen ? 'auth-sheet' : ''}`}>
        {authOpen ? (
          <>
            <button type="button" className="auth-back" onClick={hide}>← Back</button>
            <AuthSheet />
          </>
        ) : (
          <>
            <CityTabs picked={city} onPick={pick} />
            <div className="landing-ticker" aria-hidden="true">
              <div>
                {[...SPOTS, ...SPOTS].map((s, i) => (
                  <span key={i}>{s}</span>
                ))}
              </div>
            </div>
            <div className="title-btns">
              <button className="btn big go" onClick={() => show('up')}>Sign up</button>
              <button className="btn big alt" onClick={() => show('in')}>Log in</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
