import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ITEMS } from '../game/catalog';
import { CAMPAIGN_EVENTS, dayOf, homeLoad, hourOf, inOwnHouse, INVERTER, inverterCount, isDaylight, isPowered, naira, nairaShort, OFFICE_RULES, solarActive, useGame } from '../game/store';
import { INVESTMENTS, LIQUIDATION_FACTOR, MAX_TRADE_UNITS, paidFor, priceOf, USD_NGN } from '../game/investments';
import { useStocks, watchMarket } from '../net/stocks';
import { useCityStats, watchCityStats } from '../net/cityStats';
import { CARS, CAR_BY_ID, JETS, JET_BY_ID, JET_FUEL, JET_SERVICE, jetFlightsLeft, jetFuelLeft, jetRefuelCost, jetResale, jetServiceCost } from '../game/cars';
import { CAR_FUEL, fuelLeft } from '../game/carFuel';
import { cameraCount, drainScale, genBurn, generatorOf, GENERATORS, houseLoad, modeOf, onGrid, POWER, STANDBY_KW } from '../game/power';
import { blockerOf, CAR_CARE, conditionOf, healthOf, PART_IDS, PARTS, repairAllCost, repairCost, resaleOf, valueOf } from '../game/carCare';
import { cutoutOf, navOf, PHONE_BY_ID, type Cutout, type PhoneDef } from '../game/phones';
import { useSession } from '../net/session';
import { useNet } from '../net/multiplayer';
import { useRoads } from '../net/roads';
import { fixCostOf, lampCity, lampOf, LAMPS, lampSites, roadOf } from '../game/roads';
import { useCivic } from '../net/civic';
import { CivicNewsTab } from './Gazette';
import { LawsTab } from './Laws';
import { TreasuryHero, TreasuryTab } from './Treasury';
import { CITY_HEAD, CITY_NAME, CIVIC_CITIES, LOCAL_OFFICES, OFFICE_ICON, type CivicCity, type PoliticalOffice } from '../game/civic';
import { unreadCount, useSocial } from '../net/social';
import { groupUnread, useGroups } from '../net/groups';
import { attemptBankHeist, crewAction, moveSavings, refreshBank, repayDebt, useBank } from '../net/bank';
import { CREW } from '../game/heist';
import { Messages } from './Messages';
import { House, useHouseNav } from './Gida';
import { formatClock } from './Hud';
import { Hand } from './Hand';
import { Emoji, type IconName } from './Icons';
import { audio, LIVE_STATIONS, type LiveStation } from '../game/audio';
import { radioOff, tuneRadio } from '../game/radio';
import { sfx } from '../game/sfx';
import { PoliceApp } from './Police';
import { EfccApp } from './Efcc';
import { cityMap, isOpen, jetFare, potholeCity, potholeOf, type Place } from '../game/city';
import { placeNameIn, regionPlaces, regionOf } from '../game/regions';
import { employment, JOB_CITIES, jobsIn, shiftClock, shiftHours, workplaceOf } from '../game/jobs';
import { goToWork, workKey } from '../game/work';
import { avatarCell } from '../game/avatar';
import { STAGES } from '../game/property';
import { AreaApp, GistApp, HustleApp, LegacyApp, YahooApp } from './LiveApps';
import { GoalsApp, TopUpApp } from './Community';
import { FamilyApp } from './Family';
import { CareerApp } from './Career';
import { BusinessApp } from './Business';
import { STORE_APP_IDS, useApps } from '../game/apps';
import { AppStore, BabaApp, PidginApp } from './StoreApps';
import { SnapApp } from './SnapApp';
import { Mall } from './Mall';
import { HelpApp } from './Help';
import { HireApp } from './HireApp';
import { ForbesApp } from './ForbesApp';
import { BlackMarketApp } from './BlackMarket';
import { FixerApp, GrindApp, PlugApp } from './Vice';
import { ElectionBoard } from './Election';
import { LoansPanel } from './Loans';
import { openAdsSheet } from '../net/ads';
import { PerfSettings } from './PerfSettings';
import { GuideSettings } from './Guide';
import { startGuide } from '../game/guide';
import { ThemeSettings } from './ThemeSettings';
import './duo.css';
import './phones.css';
import { Face } from './Face';
import { openCamera } from './PhotoMode';
import { OpenSourceSettings } from './OpenSource';
import { LinkAccount } from './Auth';

type AppId = 'closet' | 'camera' | 'messages' | 'ride' | 'jobs' | 'bank' | 'invest' | 'forbes' | 'cars' | 'gida' | 'mall' | 'gist' | 'light' | 'radio' | 'settings' | 'civic' | 'police' | 'efcc'
  | 'hustle' | 'yahoo' | 'area' | 'legacy' | 'store' | 'babalawo' | 'flex' | 'pidgin' | 'family' | 'goals' | 'career' | 'business' | 'topup' | 'ads' | 'help' | 'hire' | 'blackmarket' | 'plug' | 'fixer' | 'grind' | 'games';

interface AppDef {
  id: AppId;
  label: string;
  icon: string;
  vectorIcon?: IconName;
  /** Icon gradient, top → bottom. */
  bg: [string, string];
  /** App header tint. */
  tint: string;
}

const APPS: Record<AppId, AppDef> = {
  messages: { id: 'messages', label: 'Messages', icon: '💬', vectorIcon: 'messages', bg: ['#38bdf8', '#1d4ed8'], tint: '#1d4ed8' },
  ride: { id: 'ride', label: 'Bolt', icon: '🚕', vectorIcon: 'cars', bg: ['#fef08a', '#eab308'], tint: '#ca8a04' },
  bank: { id: 'bank', label: 'Bank', icon: '🏦', vectorIcon: 'bank', bg: ['#a78bfa', '#5b21b6'], tint: '#5b21b6' },
  invest: { id: 'invest', label: 'Invest', icon: '📈', vectorIcon: 'invest', bg: ['#34d399', '#059669'], tint: '#047857' },
  forbes: { id: 'forbes', label: 'Forbes', icon: '👑', vectorIcon: 'forbes', bg: ['#fbbf24', '#b45309'], tint: '#b45309' },
  cars: { id: 'cars', label: 'Autos', icon: '🚗', vectorIcon: 'cars', bg: ['#38bdf8', '#0284c7'], tint: '#0284c7' },
  gida: { id: 'gida', label: 'House', icon: '🏠', vectorIcon: 'home', bg: ['#fcd34d', '#b45309'], tint: '#92400e' },
  jobs: { id: 'jobs', label: 'Jobs', icon: '💼', vectorIcon: 'jobs', bg: ['#34d399', '#047857'], tint: '#047857' },
  mall: { id: 'mall', label: 'Jumia', icon: '🛍️', bg: ['#6ee7b7', '#047857'], tint: '#047857' },
  gist: { id: 'gist', label: 'Twitter', icon: '🐦', vectorIcon: 'gist', bg: ['#f0abfc', '#9333ea'], tint: '#9333ea' },
  hustle: { id: 'hustle', label: 'Hustle', icon: '🛺', bg: ['#fde68a', '#d97706'], tint: '#b45309' },
  yahoo: { id: 'yahoo', label: 'Yahoo', icon: '💻', bg: ['#a3e635', '#3f6212'], tint: '#3f6212' },
  blackmarket: { id: 'blackmarket', label: 'Black Market', icon: '🕶️', bg: ['#44403c', '#0c0a09'], tint: '#1c1917' },
  plug: { id: 'plug', label: 'Plug', icon: '🌿', bg: ['#4ade80', '#14532d'], tint: '#14532d' },
  fixer: { id: 'fixer', label: 'Fixer', icon: '🕴🏾', bg: ['#a8a29e', '#1c1917'], tint: '#1c1917' },
  grind: { id: 'grind', label: 'Dirty Work', icon: '🛠️', bg: ['#fb923c', '#7c2d12'], tint: '#7c2d12' },
  area: { id: 'area', label: 'Area', icon: '🕴🏾', bg: ['#64748b', '#0f172a'], tint: '#0f172a' },
  legacy: { id: 'legacy', label: 'Legacy', icon: '🏆', bg: ['#fde047', '#a16207'], tint: '#a16207' },
  light: { id: 'light', label: 'NEPA', icon: '💡', vectorIcon: 'light', bg: ['#fde047', '#ca8a04'], tint: '#a16207' },
  radio: { id: 'radio', label: 'Radio', icon: '📻', vectorIcon: 'radio', bg: ['#fcd34d', '#b45309'], tint: '#92400e' },
  settings: { id: 'settings', label: 'Settings', icon: '⚙️', vectorIcon: 'settings', bg: ['#cbd5e1', '#475569'], tint: '#334155' },
  closet: { id: 'closet', label: 'Closet', icon: '👗', bg: ['#f9a8d4', '#be185d'], tint: '#be185d' },
  camera: { id: 'camera', label: 'Camera', icon: '📷', bg: ['#e2e8f0', '#64748b'], tint: '#334155' },
  civic: { id: 'civic', label: 'Civic', icon: '🏛️', vectorIcon: 'civic', bg: ['#93c5fd', '#1d4ed8'], tint: '#1d4ed8' },
  police: { id: 'police', label: 'Police', icon: '🚔', bg: ['#60a5fa', '#1e3a8a'], tint: '#1e3a8a' },
  efcc: { id: 'efcc', label: 'EFCC', icon: '🕵🏾', bg: ['#f87171', '#7f1d1d'], tint: '#991b1b' },
  family: { id: 'family', label: 'Family', icon: '💞', bg: ['#fb7185', '#be123c'], tint: '#be123c' },
  career: { id: 'career', label: 'Career', icon: '🎓', bg: ['#38bdf8', '#1d4ed8'], tint: '#1d4ed8' },
  business: { id: 'business', label: 'Business', icon: '🏪', bg: ['#fdba74', '#c2410c'], tint: '#c2410c' },
  help: { id: 'help', label: 'Help', icon: '💡', bg: ['#fde68a', '#f59e0b'], tint: '#b45309' },
  ads: { id: 'ads', label: 'Ads', icon: '📣', bg: ['#fb923c', '#c2410c'], tint: '#c2410c' },
  topup: { id: 'topup', label: 'Top-up', icon: '💳', bg: ['#34d399', '#047857'], tint: '#047857' },
  goals: { id: 'goals', label: 'Goals', icon: '🎯', bg: ['#a3e635', '#15803d'], tint: '#15803d' },
  store: { id: 'store', label: 'App Store', icon: '🛍️', bg: ['#60a5fa', '#4338ca'], tint: '#4338ca' },
  babalawo: { id: 'babalawo', label: 'Baba Online', icon: '🔮', bg: ['#c084fc', '#4c1d95'], tint: '#4c1d95' },
  flex: { id: 'flex', label: 'Snap', icon: '👻', bg: ['#fffc00', '#facc15'], tint: '#a16207' },
  pidgin: { id: 'pidgin', label: 'Pidgin AI', icon: '🗣️', bg: ['#4ade80', '#14532d'], tint: '#166534' },
  hire: { id: 'hire', label: 'Hire', icon: '🤝', bg: ['#0f766e', '#134e4a'], tint: '#0f766e' },
  games: { id: 'games', label: 'Games', icon: '🎲', bg: ['#fb7185', '#7c3aed'], tint: '#7c3aed' },
};
/** Downloaded apps (src/game/apps.ts) only show once installed from the store. */
const HOME_APPS: AppId[] = ['flex', 'messages', 'bank', 'ride', 'camera', 'gida', 'jobs', 'cars', 'mall', 'business', 'hustle', 'invest', 'light', 'gist', 'games', 'goals', 'career', 'family', 'hire', 'forbes', 'closet', 'radio', 'civic', 'police', 'efcc', 'ads'];
// 'topup' (buying money) is left off the home screen while card payments are switched off.
/** Always last: the store, help and settings. */
const TAIL_APPS: AppId[] = ['store', 'help', 'settings'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const iconStyle = (a: AppDef) => ({ background: `linear-gradient(160deg, ${a.bg[0]}, ${a.bg[1]})` });

/* ---------- Apps ---------- */

function Jobs() {
  const here = useGame((s) => cityMap(s.destinationId).id);
  const jobId = useGame((s) => s.jobId);
  const jobCity = useGame((s) => s.jobCity);
  const knowledge = useGame((s) => s.knowledge);
  const workDays = useGame((s) => s.workDays);
  const take = useGame((s) => s.takeJob);
  const quit = useGame((s) => s.quitJob);
  // What the job wants of you right now (game/work.ts), whether you are on shift, and whether today's is done.
  const call = useGame(workKey).split(':')[0];
  const working = useGame((s) => s.task?.actionId === 'work' && s.task.phase === 'doing');
  const done = useGame((s) => {
    const work = employment(s);
    return !!work && s.workedDay === shiftClock(work.job, s.minutes).day;
  });
  // Every city hires: the list opens on the one you are in.
  const [city, setCity] = useState(here);
  const mine = employment({ jobId, jobCity });
  return (
    <>
      <div className="hero hero-green">
        <small>{mine ? 'Your job' : 'No job'}</small>
        <b>{mine ? `${mine.job.icon} ${mine.job.title}` : 'Pick one 👇'}</b>
        {mine && (
          <>
            <small>📍 {mine.place.name}, {regionOf(mine.city).name}</small>
            <small>
              {shiftHours(mine.job)} · +{Math.min(workDays, 20) * 2}% for days worked
            </small>
            {working ? <small>🟢 You are on shift</small>
              : call ? (
                <button className="btn sm job-go" onClick={goToWork}>
                  {call === 'here' ? '💼 Clock in' : call === 'early' ? `⏰ Clock-in opens at ${mine.job.start}:00` : `${mine.city === here ? '💼' : '✈️'} Go to work`}
                </button>
              )
              : <small>{done ? '✅ Worked today. Rest!' : `⏰ Next shift starts at ${mine.job.start}:00`}</small>}
          </>
        )}
        <div className="hero-meter">
          <span>📚 Knowledge</span>
          <div className="bar light">
            <i style={{ width: `${knowledge * 10}%` }} />
          </div>
          <b>{knowledge.toFixed(1)}</b>
        </div>
      </div>
      <h4>Jobs</h4>
      <div className="tabs" role="group" aria-label="City">
        {JOB_CITIES.map((c) => (
          <button key={c} className={c === city ? 'on' : ''} aria-pressed={c === city} onClick={() => setCity(c)}>
            {c === here ? '📍 ' : ''}{regionOf(c).name}
          </button>
        ))}
      </div>
      {city !== here && (
        <p className="muted small">✈️ {regionOf(city).name} is a flight from where you are. When your shift is on, “Go to work” books the whole trip.</p>
      )}
      {jobsIn(city).map((j) => {
        const isMine = mine?.job.id === j.id && mine.city === city;
        const locked = knowledge < j.minKnowledge;
        return (
          <div key={j.id} className={`tile ${isMine ? 'mine' : ''} ${locked ? 'locked' : ''}`}>
            <span className="tile-icon">{j.icon}</span>
            <span className="tile-info">
              <b>{j.title}</b>
              <small>{workplaceOf(j.id, city)?.name}</small>
              <small>
                {j.start}:00–{j.end}:00 · <b className="good">{naira(j.pay)}</b>/day
                {j.minKnowledge > 0 && ` · 📚${j.minKnowledge}`}
              </small>
            </span>
            {isMine ? (
              <button className="btn sm danger" onClick={quit}>
                Quit
              </button>
            ) : (
              <button className="btn sm" disabled={locked} onClick={() => take(j.id, city)}>
                {locked ? '🔒' : 'Apply'}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

function BankTransfer() {
  const signedIn = useSession((s) => !!s.user?.username);
  if (!signedIn) return null;
  return (
    <div className="row-btns">
      <button className="btn go" onClick={() => useSocial.setState({ openWith: 'new' })}>
        ↑ Send money
      </button>
      <button className="btn" onClick={() => useSocial.setState({ openWith: 'new' })}>
        ↓ Request
      </button>
    </div>
  );
}

/** Crew heists: plan one, join one planned in this branch, and (leader) call it. */
function CrewHeist({ knowledge, coolingDown, now }: { knowledge: number; coolingDown: boolean; now: number }) {
  const crews = useBank((s) => s.crews);
  const busy = useBank((s) => s.busy);
  const police = useGame((s) => s.jobId === 'police');
  const me = useSession((s) => s.user?.uid);
  // Keep the crew list fresh while standing in the branch.
  useEffect(() => {
    const id = setInterval(() => void refreshBank(), 8_000);
    return () => clearInterval(id);
  }, []);
  const mine = crews.find((c) => c.mine);
  const clock = (ms: number) => `${Math.floor(Math.max(0, ms) / 60_000)}:${String(Math.floor((Math.max(0, ms) % 60_000) / 1000)).padStart(2, '0')}`;
  const blocked = police ? 'Police officers can’t join' : coolingDown ? 'Weekly cooldown' : null;
  return (
    <>
      <h4>Crew job</h4>
      <p className="muted">
        Rob it together: {naira(CREW.lootPerHead)} each, better odds with every extra robber (up to {CREW.maxSize}). Crew members must be in this branch when the
        leader calls it. Careful: anyone in the crew can tip off the police for {naira(CREW.snitchReward)}.
      </p>
      {mine ? (
        <div className="tile">
          <span className="tile-icon">🥷🏾</span>
          <span className="tile-info">
            <b>{mine.members.length === 1 ? 'Your crew (just you so far)' : `@${mine.leader.username}’s crew of ${mine.members.length}`}</b>
            <small>{mine.members.map((m) => `@${m.username}`).join(', ')}</small>
            <small>Odds {Math.round(mine.chance * 100)}% · breaks up in {clock(mine.expiresAt - now)}{mine.snitched ? ' · 🐀 you tipped off the police' : ''}</small>
          </span>
          <div className="row-btns">
            {mine.leader.uid === me ? (
              <button className="btn sm danger" disabled={busy || mine.members.length < 2} title={mine.members.length < 2 ? 'Wait for someone to join' : 'Go in'} onClick={() => crewAction('crew_go', mine.id)}>Go in</button>
            ) : (
              !mine.snitched && <button className="btn sm" disabled={busy} onClick={() => crewAction('crew_snitch', mine.id)}>🐀 Snitch</button>
            )}
            <button className="btn sm ghost" disabled={busy} onClick={() => crewAction('crew_leave', mine.id)}>{mine.leader.uid === me ? 'Call off' : 'Leave'}</button>
          </div>
        </div>
      ) : (
        <>
          {crews.map((c) => (
            <div className="tile" key={c.id}>
              <Face uid={c.leader.uid} username={c.leader.username} size="lg" />
              <span className="tile-info">
                <b>@{c.leader.username}’s crew · {c.members.length}/{CREW.maxSize}</b>
                <small>Odds {Math.round(c.chance * 100)}% · leaving in {clock(c.expiresAt - now)}</small>
              </span>
              <button className="btn sm danger" disabled={busy || !!blocked || c.members.length >= CREW.maxSize} title={blocked ?? 'Join'} onClick={() => crewAction('crew_join', c.id)}>Join</button>
            </div>
          ))}
          <button className="btn" disabled={busy || !!blocked || knowledge < CREW.leaderKnowledge} onClick={() => crewAction('crew_plan')}>
            {blocked ?? (knowledge < CREW.leaderKnowledge ? `🔒 Leading needs ${CREW.leaderKnowledge} knowledge` : '🥷🏾 Plan a crew job')}
          </button>
        </>
      )}
    </>
  );
}

function Bank() {
  const money = useGame((s) => s.money);
  const debtOwed = useGame((s) => s.debtOwed);
  const bankLoanOwed = useGame((s) => s.bankLoanOwed);
  const txns = useGame((s) => s.txns);
  const name = useGame((s) => s.name);
  const knowledge = useGame((s) => s.knowledge);
  const atBranch = useGame((s) => s.view === 'place' && s.insideId === 'bank');
  const savings = useBank((s) => s.savings);
  const heistReadyAt = useBank((s) => s.heistReadyAt);
  const loading = useBank((s) => s.loading);
  const busy = useBank((s) => s.busy);
  const error = useBank((s) => s.error);
  const [amount, setAmount] = useState('10000');
  const [tab, setTab] = useState<'account' | 'savings' | 'loans'>(() => {
    // History now lives under Account, so an old request for the History tab opens Account.
    const want = useGame.getState().bankTab;
    return want === 'savings' || want === 'loans' ? want : 'account';
  });
  useEffect(() => { useGame.setState({ bankTab: null }); }, []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { void refreshBank(); }, []);
  const inflow = txns.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const outflow = txns.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0);
  const transferAmount = Number(amount);
  const heistCoolingDown = heistReadyAt > now;
  return (
    <>
      <div className="bank-card">
        <div className="bank-card-top">
          <b>Bank</b>
          <span className="chip-gold" />
        </div>
        <small>Net balance</small>
        <strong className={money < debtOwed + bankLoanOwed ? 'owing' : undefined}>{naira(money - debtOwed - bankLoanOwed)}</strong>
        <small>Available cash: {naira(money)}</small>
        <div className="bank-card-bot">
          <span>{name.toUpperCase() || 'CUSTOMER'}</span>
          <span>•••• 2026</span>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'account' ? 'on' : ''} onClick={() => setTab('account')}>💳 Account</button>
        <button className={tab === 'savings' ? 'on' : ''} onClick={() => setTab('savings')}>🏦 Savings</button>
        <button className={tab === 'loans' ? 'on' : ''} onClick={() => setTab('loans')}>💸 Loans</button>
      </div>
      {tab === 'loans' && <LoansPanel />}
      {tab === 'account' && (
      <>
      <BankTransfer />
      <section className="bank-services">
        <h4>Debt</h4>
        <p className="muted">Outstanding: <b>{naira(debtOwed)}</b></p>
        {bankLoanOwed > 0 && <p className="muted">Bank loans: <b>{naira(bankLoanOwed)}</b> (repay in the Loans tab)</p>}
        {debtOwed > 0 && (
          <>
            <label>
              Repayment amount (₦)
              <input type="number" min="1" max={Math.min(money, debtOwed)} step="100" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <button className="btn go" disabled={busy || !Number.isInteger(transferAmount) || transferAmount < 1 || transferAmount > money || transferAmount > debtOwed} onClick={() => repayDebt(transferAmount)}>
              Repay debt
            </button>
          </>
        )}
        {error && <p className="error-text">{error}</p>}
      </section>
      <div className="flow">
        <div>
          <small>Money in</small>
          <b className="good">+{naira(inflow)}</b>
        </div>
        <div>
          <small>Money out</small>
          <b className="bad">−{naira(outflow)}</b>
        </div>
      </div>
      <h4>Recent</h4>
      {txns.length === 0 && <p className="muted">No transactions yet.</p>}
      <div className="list-card">
        {txns.map((t, i) => (
          <div key={i} className="txn">
            <span className={`txn-dot ${t.amount >= 0 ? 'in' : 'out'}`}>{t.amount >= 0 ? '↓' : '↑'}</span>
            <span className="txn-label">
              {t.label}
              <small>
                Day {dayOf(t.at)} · {formatClock(t.at)}
              </small>
            </span>
            <b className={t.amount >= 0 ? 'good' : 'bad'}>
              {t.amount >= 0 ? '+' : '−'}
              {naira(Math.abs(t.amount))}
            </b>
          </div>
        ))}
      </div>
      </>
      )}
      {tab === 'savings' && (
      <>
      <div className="flow">
        <div>
          <small>Protected savings</small>
          <b>{loading ? 'Loading…' : naira(savings)}</b>
        </div>
        <div>
          <small>Savings interest</small>
          <b>None</b>
        </div>
      </div>
      {atBranch ? (
        <section className="bank-services">
          <h4>Branch services</h4>
          <label>
            Amount (₦)
            <input type="number" min="100" max="100000000" step="100" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <div className="row-btns">
            <button className="btn go" disabled={busy || !Number.isInteger(transferAmount) || transferAmount < 100} onClick={() => moveSavings('deposit', transferAmount)}>Save</button>
            <button className="btn" disabled={busy || !Number.isInteger(transferAmount) || transferAmount < 100} onClick={() => moveSavings('withdraw', transferAmount)}>Withdraw</button>
          </div>
          <p className="muted">Savings stay on your account, even if you start a new life. They cannot be taken in a robbery.</p>
          <h4>High-risk: rob the bank</h4>
          <p className="muted">Requires 5 knowledge. One attempt every 7 days; success pays ₦30,000. If the alarm catches you, expect 15 minutes in prison.</p>
          {heistCoolingDown && <p className="muted">Next attempt: {new Date(heistReadyAt).toLocaleString()}</p>}
          <button className="btn danger" disabled={busy || knowledge < 5 || heistCoolingDown} onClick={() => attemptBankHeist()}>
            {knowledge < 5 ? `🔒 Need 5 knowledge (${knowledge.toFixed(1)})` : heistCoolingDown ? 'Weekly cooldown' : 'Attempt bank heist'}
          </button>
          <CrewHeist knowledge={knowledge} coolingDown={heistCoolingDown} now={now} />
          {error && <p className="error-text">{error}</p>}
        </section>
      ) : (
        <p className="muted bank-branch-hint">Visit {placeNameIn(useGame.getState().destinationId, 'bank')} and use the teller counter to move money in or out of savings.</p>
      )}
      </>
      )}
    </>
  );
}

/** Price chart from the server's history. Green when the range ended higher than it began, red when lower. */
function PriceChart({ points }: { points: [number, number][] }) {
  if (points.length < 2) return <div className="muted" style={{ fontSize: 11, height: 56, display: 'grid', placeItems: 'center' }}>Chart loading…</div>;
  const W = 300, H = 56;
  const prices = points.map((p) => p[1]);
  const lo = Math.min(...prices), hi = Math.max(...prices), span = hi - lo || 1;
  const t0 = points[0][0], tSpan = points[points.length - 1][0] - t0 || 1;
  const xy = points.map(([t, v]) => `${(((t - t0) / tSpan) * W).toFixed(1)},${(H - 4 - ((v - lo) / span) * (H - 8)).toFixed(1)}`);
  const up = prices[prices.length - 1] >= prices[0];
  const color = up ? '#059669' : '#dc2626';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={up ? 'Price is up' : 'Price is down'}>
      <polygon points={`0,${H} ${xy.join(' ')} ${W},${H}`} fill={color} opacity="0.12" />
      <polyline points={xy.join(' ')} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Invest() {
  const ventures = useStocks((m) => m.ventures);
  useEffect(() => watchMarket(60_000), []);
  const money = useGame((s) => s.money);
  const investments = useGame((s) => s.investments);
  const buy = useGame((s) => s.buyInvestment);
  const sell = useGame((s) => s.sellInvestment);
  const owned = INVESTMENTS.filter((inv) => (investments[inv.id]?.units ?? 0) > 0);
  const [tab, setTab] = useState<'mine' | 'all'>(() => (owned.length ? 'mine' : 'all'));
  const [city, setCity] = useState<'all' | 'kaduna' | 'abuja' | 'lagos' | 'kano' | 'world'>('all');
  // How many units the Buy and Sell buttons trade, per venture, as typed (so the box can be cleared while typing).
  const [qty, setQty] = useState<Record<string, string>>({});
  const shown = tab === 'mine' ? owned : INVESTMENTS.filter((inv) => city === 'all' || inv.city === city);

  let value = 0;
  let paid = 0;
  let banked = 0;

  for (const inv of INVESTMENTS) {
    const h = investments[inv.id];
    if (!h) continue;
    banked += h.realized ?? 0;
    if (h.units > 0) {
      value += h.units * priceOf(inv);
      paid += paidFor(inv, h);
    }
  }
  const gain = value - paid;

  return (
    <>
      {/* Losing money turns the whole card red, with the loss shown as a minus. */}
      <div className={`hero ${gain < 0 ? 'hero-rose' : 'hero-green'}`}>
        <small>Portfolio value</small>
        <b>{naira(value)}</b>
        {paid > 0 && <small>{gain < 0 ? '−' : '+'}{naira(Math.abs(gain))} ({gain < 0 ? '−' : '+'}{Math.abs((gain / paid) * 100).toFixed(1)}%)</small>}
      </div>

      <div className="flow">
        <div>
          <small>Banked from sales</small>
          <b className={banked >= 0 ? 'good' : 'bad'}>{banked >= 0 ? '+' : '-'}{naira(Math.abs(banked))}</b>
        </div>
        <div>
          <small>Cash</small>
          <b>{naira(money)}</b>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>💼 My portfolio ({owned.length})</button>
        <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>📈 Ventures</button>
      </div>
      {tab === 'all' && (
        <div className="tabs">
          <button className={city === 'all' ? 'on' : ''} onClick={() => setCity('all')}>All</button>
          <button className={city === 'kaduna' ? 'on' : ''} onClick={() => setCity('kaduna')}>Kaduna</button>
          <button className={city === 'abuja' ? 'on' : ''} onClick={() => setCity('abuja')}>Abuja</button>
          <button className={city === 'lagos' ? 'on' : ''} onClick={() => setCity('lagos')}>Lagos</button>
          <button className={city === 'kano' ? 'on' : ''} onClick={() => setCity('kano')}>Kano</button>
          <button className={city === 'world' ? 'on' : ''} onClick={() => setCity('world')}>Crypto</button>
        </div>
      )}
      <small className="muted">Prices rise and fall with the market and are the same for every player. Nothing pays out on a schedule: you only profit by selling for more than you paid, and you can lose money. Coins follow their real prices, checked every 5 minutes.</small>
      {tab === 'mine' && owned.length === 0 && <p className="muted">No investments yet. Pick a venture.</p>}
      {shown.map((inv) => {
        const h = investments[inv.id];
        const units = h?.units ?? 0;
        const price = priceOf(inv);
        const holdingCost = h && units > 0 ? paidFor(inv, h) : 0;
        const holdingGain = units * price - holdingCost;
        const n = Math.min(MAX_TRADE_UNITS, Math.max(1, parseInt(qty[inv.id] ?? '1', 10) || 1));
        const setN = (to: number) => setQty((q) => ({ ...q, [inv.id]: String(Math.min(MAX_TRADE_UNITS, Math.max(1, to))) }));
        const canAfford = money >= price * n;
        const refundPerUnit = Math.round(price * LIQUIDATION_FACTOR);
        const points = ventures[inv.id]?.points ?? [];
        const change = points.length > 1 && points[0][1] ? ((price - points[0][1]) / points[0][1]) * 100 : 0;
        // A real coin: its dollar price, and no trading until the first or a fresh price is in.
        const usd = ventures[inv.id]?.usd;
        const closed = !!inv.symbol && ventures[inv.id]?.closed !== false;
        // A coin is priced whole (its dollar price at USD_NGN) and bought a lot at a time: "0.02 BTC", not "2 units".
        const lot = inv.lot ?? 1;
        const amount = (count: number) => (inv.symbol ? `${(+(count * lot).toFixed(8)).toLocaleString('en-US', { maximumFractionDigits: 8 })} ${inv.symbol}` : `${count}`);

        return (
          <div key={inv.id} className="inv-card">
            <div className="inv-card-head">
              <span className="tile-icon">{inv.icon}</span>
              <div className="inv-meta">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <b>{inv.title}</b>
                  <span className="pill-tag">{inv.tag}</span>
                  {inv.city === 'abuja' && <span className="pill-tag">Abuja</span>}
                  {inv.city === 'lagos' && <span className="pill-tag">Lagos</span>}
                  {inv.city === 'kano' && <span className="pill-tag">Kano</span>}
                </div>
                              </div>
            </div>

            <div className="inv-stats">
              <span><b>{naira(inv.symbol && usd ? usd * USD_NGN : price)}</b> <small className={change >= 0 ? 'good' : 'bad'}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%</small></span>
              <span>{inv.symbol && usd ? `$${usd.toLocaleString('en-US', { maximumFractionDigits: usd < 10 ? 4 : 0 })} × ${naira(USD_NGN)}` : `${inv.risk} risk`}</span>
            </div>

            <PriceChart points={points} />

            {units > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '2px 4px' }}>
                <span>Own <b>{amount(units)}</b> · paid {naira(holdingCost)}</span>
                <span className={holdingGain >= 0 ? 'good' : 'bad'} style={{ fontWeight: 700 }}>{holdingGain >= 0 ? '▲' : '▼'} {naira(Math.abs(holdingGain))}</span>
              </div>
            )}

            {closed && <small className="muted" style={{ padding: '0 4px' }}>Trading is paused until a fresh price comes in.</small>}

            <div className="inv-qty" role="group" aria-label={`Units of ${inv.title}`}>
              <button type="button" aria-label="One less" disabled={n <= 1} onClick={() => setN(n - 1)}>−</button>
              <input
                inputMode="numeric"
                aria-label="Units"
                value={qty[inv.id] ?? '1'}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setQty((q) => ({ ...q, [inv.id]: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                onBlur={() => setN(n)}
              />
              <button type="button" aria-label="One more" disabled={n >= MAX_TRADE_UNITS} onClick={() => setN(n + 1)}>+</button>
            </div>

            <div className="inv-trade">
              {units > 0 && (
                <button
                  className="btn sm"
                  disabled={closed || n > units}
                  style={{ background: 'var(--surface-3)', color: 'var(--fg-475569)', opacity: closed || n > units ? 0.45 : 1 }}
                  onClick={() => window.confirm(`Sell ${inv.symbol ? amount(n) : `${n} unit${n > 1 ? 's' : ''} of ${inv.title}`} for ${naira(refundPerUnit * n)}?`) && sell(inv.id, n)}
                >
                  Sell {amount(n)} · {naira(refundPerUnit * n)}
                </button>
              )}
              <button
                className="btn sm go"
                disabled={!canAfford || closed}
                onClick={() => buy(inv.id, n)}
              >
                Buy {amount(n)} · {naira(price * n)}
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

function Cars() {
  const money = useGame((s) => s.money);
  const ownedCars = useGame((s) => s.ownedCars ?? []);
  const selectedCar = useGame((s) => s.selectedCar);
  const buyCar = useGame((s) => s.buyCar);
  const cruiseCar = useGame((s) => s.cruiseCar);
  const carCondition = useGame((s) => s.carCondition);
  const ownedJets = useGame((s) => s.ownedJets ?? []);
  const buyJet = useGame((s) => s.buyJet);
  const sellJet = useGame((s) => s.sellJet);
  const refuelJet = useGame((s) => s.refuelJet);
  const serviceJet = useGame((s) => s.serviceJet);
  const jetFuel = useGame((s) => s.carFuel);
  const jetWear = useGame((s) => s.jetWear);
  const [tab, setTab] = useState<'garage' | 'showroom'>(() => (ownedCars.length || ownedJets.length ? 'garage' : 'showroom'));
  // The showroom has two floors: cars and planes.
  const [floor, setFloor] = useState<'cars' | 'planes'>('cars');

  const active = selectedCar ? CAR_BY_ID[selectedCar] : null;
  const totalGarageValue = ownedCars.reduce((sum, id) => sum + valueOf(id, conditionOf(carCondition, id)), 0) + ownedJets.reduce((sum, id) => sum + jetResale(id), 0);
  const owned = ownedCars.length + ownedJets.length;
  const forSale = CARS.filter((car) => !ownedCars.includes(car.id));
  const jetsForSale = JETS.filter((jet) => !ownedJets.includes(jet.id));

  return (
    <>
      <div className="hero" style={{ background: 'linear-gradient(135deg, #0284c7, #075985)' }}>
        <small>Garage</small>
        <b>{active ? `🚗 ${active.name}` : 'No car yet'}</b>
        {active && (
          <button
            className="btn sm go"
            style={{ marginTop: 8, background: 'var(--surface)', color: '#0369a1', alignSelf: 'flex-start' }}
            onClick={cruiseCar}
          >
            Cruise 💨
          </button>
        )}
      </div>

      <div className="flow">
        <div>
          <small>Fleet</small>
          <b>{ownedCars.length} car{ownedCars.length === 1 ? '' : 's'}{ownedJets.length ? ` · ${ownedJets.length} jet${ownedJets.length === 1 ? '' : 's'}` : ''}</b>
        </div>
        <div>
          <small>Worth</small>
          <b className="good">{naira(totalGarageValue)}</b>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'garage' ? 'on' : ''} onClick={() => setTab('garage')}>🔧 My garage ({owned})</button>
        <button className={tab === 'showroom' ? 'on' : ''} onClick={() => setTab('showroom')}>🚘 Showroom</button>
      </div>

      {tab === 'garage' && ownedJets.map((id) => (
        <div key={id} className="inv-card">
          <div className="inv-card-head">
            <span className="tile-icon" style={{ background: '#e0f2fe', fontSize: 24 }}>🛩️</span>
            <div className="inv-meta">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <b>{JET_BY_ID[id]?.name}</b>
                <span className="pill-tag">{JET_BY_ID[id]?.tag}</span>
              </div>
              <small>Parked at the airport. Fly it from the flight desk: a trip costs {naira(jetFare('kaduna', 'abuja'))} to {naira(jetFare('kano', 'lagos'))} by route, plus fuel.</small>
            </div>
          </div>
          <div className="garage-meters">
            <div className="garage-meter">
              <span>⛽ Fuel</span>
              <div className="bar"><i style={{ width: `${(jetFuelLeft(jetFuel, id) / JET_FUEL.tank) * 100}%`, background: needColor((jetFuelLeft(jetFuel, id) / JET_FUEL.tank) * 100) }} /></div>
              <b>{jetFuelLeft(jetFuel, id)}/{JET_FUEL.tank}</b>
            </div>
            <div className="garage-meter">
              <span>🔧 Service</span>
              <div className="bar"><i style={{ width: `${(jetFlightsLeft(jetWear, id) / JET_SERVICE.every) * 100}%`, background: needColor((jetFlightsLeft(jetWear, id) / JET_SERVICE.every) * 100) }} /></div>
              <b>{jetFlightsLeft(jetWear, id) ? `in ${jetFlightsLeft(jetWear, id)}` : 'Due'}</b>
            </div>
          </div>
          {jetFlightsLeft(jetWear, id) < 1 && <p className="garage-alert">⚠️ Grounded: service is due. It will not fly until the engineers sign it off.</p>}
          <div className="inv-actions">
            <button className="btn sm" onClick={() => window.confirm(`Sell your ${JET_BY_ID[id]?.name ?? 'jet'} for ${naira(jetResale(id))}?`) && sellJet(id)}>Sell {naira(jetResale(id))}</button>
            {jetServiceCost(jetWear, id) > 0 && (
              <button className="btn sm" disabled={money < jetServiceCost(jetWear, id)} onClick={() => serviceJet(id)}>🔧 Service {naira(jetServiceCost(jetWear, id))}</button>
            )}
            {jetRefuelCost(jetFuel, id) > 0 && (
              <button className="btn sm go" disabled={money < jetRefuelCost(jetFuel, id)} onClick={() => refuelJet(id)}>⛽ Refuel {naira(jetRefuelCost(jetFuel, id))}</button>
            )}
          </div>
        </div>
      ))}
      {tab === 'garage' && owned === 0 && (
        <div className="garage-empty">
          <b>Your garage is empty</b>
          <small>Buy a car in the showroom to get around town and cruise the city.</small>
          <button className="btn sm go" onClick={() => setTab('showroom')}>Open showroom</button>
        </div>
      )}
      {tab === 'garage' && ownedCars.map((id) => <CarHealth key={id} carId={id} />)}

      {tab === 'showroom' && (
        <div className="law-tabs" role="tablist" aria-label="Showroom">
          <button role="tab" aria-selected={floor === 'cars'} className={floor === 'cars' ? 'on' : ''} onClick={() => setFloor('cars')}>🚗 Cars ({forSale.length})</button>
          <button role="tab" aria-selected={floor === 'planes'} className={floor === 'planes' ? 'on' : ''} onClick={() => setFloor('planes')}>🛩️ Planes ({jetsForSale.length})</button>
        </div>
      )}
      {tab === 'showroom' && floor === 'cars' && forSale.length === 0 && (
        <div className="garage-empty">
          <b>You own every car</b>
          <small>Nothing left in the showroom. Sell one from your garage to see it here again.</small>
        </div>
      )}
      {tab === 'showroom' && floor === 'planes' && jetsForSale.length === 0 && (
        <div className="garage-empty">
          <b>You own every plane</b>
          <small>The hangar is empty. Sell one from your garage to see it here again.</small>
        </div>
      )}
      {tab === 'showroom' && floor === 'planes' && jetsForSale.map((jet) => (
        <div key={jet.id} className="inv-card">
          <div className="inv-card-head">
            <span className="tile-icon" style={{ background: '#e0f2fe', fontSize: 24 }}>🛩️</span>
            <div className="inv-meta">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <b>{jet.name}</b>
                <span className="pill-tag">{jet.tag}</span>
              </div>
              <small>{jet.perk}</small>
            </div>
          </div>

          <div className="inv-stats">
            <span><b>{naira(jet.price)}</b></span>
          </div>

          <div className="inv-actions">
            <button className="btn sm go" disabled={money < jet.price} onClick={() => buyJet(jet.id)}>
              Buy {naira(jet.price)}
            </button>
          </div>
        </div>
      ))}
      {tab === 'showroom' && floor === 'cars' && forSale.map((car) => (
        <div key={car.id} className="inv-card">
          <div className="inv-card-head">
            <span className="tile-icon" style={{ background: '#e0f2fe', fontSize: 24 }}>🚗</span>
            <div className="inv-meta">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <b>{car.name}</b>
                <span className="pill-tag">{car.tag}</span>
              </div>
            </div>
          </div>

          <div className="inv-stats">
            <span><b>{naira(car.price)}</b></span>
            <span>⚡ {car.speed}x</span>
            <span className="good">🎉 +{car.funBonus}</span>
          </div>

          <div className="inv-actions">
            <button
              className="btn sm go"
              disabled={money < car.price}
              onClick={() => buyCar(car.id)}
            >
              Buy {naira(car.price)}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

function CarHealth({ carId }: { carId: string }) {
  const money = useGame((s) => s.money);
  const conditions = useGame((s) => s.carCondition);
  const carFuel = useGame((s) => s.carFuel);
  const fuelCans = useGame((s) => s.fuelCans);
  const active = useGame((s) => s.selectedCar === carId);
  const repairCar = useGame((s) => s.repairCar);
  const selectCar = useGame((s) => s.selectCar);
  const cruiseCar = useGame((s) => s.cruiseCar);
  const refuelCar = useGame((s) => s.refuelCar);
  const sellCar = useGame((s) => s.sellCar);
  const c = conditionOf(conditions, carId);
  const car = CAR_BY_ID[carId];
  const [open, setOpen] = useState(false);
  if (!car) return null;
  const health = Math.round(healthOf(c) * 100);
  const stuck = blockerOf(c);
  const all = repairAllCost(carId, c);
  const fuel = fuelLeft(carFuel, carId);
  const fuelPct = Math.round((fuel / CAR_FUEL.tank) * 100);
  const needsWork = PART_IDS.filter((p) => c.parts[p] < CAR_CARE.warnAt).length;
  return (
    <div className={`garage-card ${active ? 'active' : ''} ${stuck ? 'broken' : ''}`}>
      <div className="garage-head">
        <span className="garage-icon">{stuck ? '🛠️' : '🚗'}</span>
        <div className="garage-title">
          <b>{car.name}</b>
          <small>{c.trips} trips · worth {naira(valueOf(carId, c))}</small>
        </div>
        {active && <span className="pill-tag on">Active</span>}
      </div>
      {stuck && <p className="garage-alert">⚠️ Won't move: the {PARTS[stuck].label.toLowerCase()} is spoilt. Fix it below.</p>}
      <div className="garage-meters">
        <div className="garage-meter">
          <span>⛽ Fuel</span>
          <div className="bar"><i style={{ width: `${fuelPct}%`, background: needColor(fuelPct) }} /></div>
          <b>{Math.floor(fuel)}/{CAR_FUEL.tank}L</b>
        </div>
        <div className="garage-meter">
          <span>🔧 Condition</span>
          <div className="bar"><i style={{ width: `${health}%`, background: needColor(health) }} /></div>
          <b>{health}%</b>
        </div>
      </div>
      <div className="garage-actions">
        {active ? (
          <button className="btn sm go" disabled={!!stuck} onClick={cruiseCar}>💨 Cruise</button>
        ) : (
          <button className="btn sm go" onClick={() => selectCar(carId)}>Make active</button>
        )}
        <button className="btn sm" disabled={fuel > CAR_FUEL.tank - 1} onClick={() => refuelCar(carId)}>
          ⛽ Refuel{fuelCans ? ` (${fuelCans} can${fuelCans === 1 ? '' : 's'})` : ' at pump'}
        </button>
        {all > 0 && (
          <button className="btn sm" disabled={money < all} onClick={() => repairCar(carId, 'all')}>🛠️ Service {naira(all)}</button>
        )}
        <button className="btn sm" onClick={() => window.confirm(`Sell your ${car.name} for ${naira(resaleOf(carId, c))}?`) && sellCar(carId)}>Sell {naira(resaleOf(carId, c))}</button>
      </div>
      <button type="button" className="garage-more" aria-expanded={open || !!stuck} onClick={() => setOpen(!open)}>
        {open || stuck ? 'Hide parts ▴' : `Parts & repairs${needsWork ? ` · ${needsWork} need attention` : ''} ▾`}
      </button>
      {(open || stuck) && (
        <div className="garage-parts">
          {PART_IDS.map((p) => {
            const hp = c.parts[p];
            const cost = repairCost(carId, c, p);
            return (
              <div key={p} className="garage-part">
                <span className="garage-part-name">{PARTS[p].icon} {PARTS[p].label}</span>
                <div className="bar"><i style={{ width: `${Math.max(0, hp)}%`, background: needColor(hp) }} /></div>
                <b className={hp <= 0 ? 'bad' : ''}>{hp <= 0 ? 'Spoilt' : `${hp}%`}</b>
                <button className="btn sm" disabled={!cost || money < cost} onClick={() => repairCar(carId, p)}>
                  {cost ? `Fix ${naira(cost)}` : 'Good'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function needColor(v: number) {
  if (v > 55) return '#22c55e';
  if (v > 30) return '#eab308';
  if (v > 15) return '#f97316';
  return '#ef4444';
}

function Light() {
  const [tab, setTab] = useState<'power' | 'bills' | 'water'>('power');
  // A tapped NEPA toast asks for the tab it is about, whether the app is just opening or already open.
  const wantTab = useGame((s) => s.lightTab);
  useEffect(() => {
    if (!wantTab) return;
    setTab(wantTab);
    useGame.setState({ lightTab: null });
  }, [wantTab]);
  const powered = useGame(isPowered);
  const gridUp = useGame((s) => s.power.grid);
  const grid = useGame((s) => onGrid(s.power));
  const mode = useGame((s) => modeOf(s.power));
  const setPowerMode = useGame((s) => s.setPowerMode);
  const solar = useGame(solarActive);
  const fuel = useGame((s) => s.power.genFuel);
  const genOn = useGame((s) => s.power.genOn);
  const [usageOpen, setUsageOpen] = useState(false);
  const waterTank = useGame((s) => s.waterTank);
  const money = useGame((s) => s.money);
  // Light follows you: it runs while you are in your own house and is off the moment you are out (or in someone else's).
  const atHome = useGame(inOwnHouse);
  const pumpWater = useGame((s) => s.pumpWater);
  const orderWater = useGame((s) => s.orderWater);
  const gen = useGame((s) => generatorOf(s.items));
  const ownsGen = !!gen;
  const ownsSolar = useGame((s) => s.items.some((i) => i.type === 'solar'));
  const inverters = useGame((s) => inverterCount(s.items));
  const battery = useGame((s) => s.power.battery ?? 100);
  const daylight = useGame((s) => isDaylight(s.minutes));
  const items = useGame((s) => s.items);
  const nepaOwed = useGame((s) => s.nepaOwed);
  const payNepaBill = useGame((s) => s.payNepaBill);
  const load = useGame((s) => homeLoad(s));
  // What the backups have to carry once you are home: the estimates below are for that, not for an empty house.
  const fullLoad = houseLoad(items);
  const cams = cameraCount(items);
  const appliances = Object.entries(STANDBY_KW)
    .map(([type, per]) => {
      const count = items.filter((i) => i.type === type).length;
      return { type, count, kw: count * per, name: ITEMS[type]?.name ?? type, icon: ITEMS[type]?.icon ?? '🔌' };
    })
    .filter((a) => a.count > 0)
    .sort((a, b) => b.kw - a.kw);
  const scale = drainScale(fullLoad);
  const battHours = Math.round((battery / ((INVERTER.drain * scale) / Math.max(1, inverters))) * 10) / 10;
  const genHours = gen ? Math.round((fuel / genBurn(gen, fullLoad)) * 10) / 10 : 0;
  const source = grid ? 'NEPA' : solar ? (daylight ? 'Solar' : 'Inverter') : powered ? 'Generator' : 'None';
  return (
    <>
      <div className={`hero ${powered && atHome ? 'hero-yellow' : 'hero-dark'}`}>
        <small>Power source</small>
        <b>
          {!atHome ? '🔌 Off' : `${powered ? '💡' : '🕯️'} ${source}`}
        </b>
        <small>{!atHome ? 'You are out. It comes on when you get home' : grid ? 'Light dey!' : powered ? 'Backup on' : 'No light'}</small>
        <div className="nepa-chips">
          <span>⚡ {load.toFixed(2)} kW</span>
          <span>🧾 {naira(Math.ceil(nepaOwed))}</span>
          <span>🛢️ {Math.round(waterTank)}%</span>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'power' ? 'on' : ''} onClick={() => setTab('power')}>⚡ Power</button>
        <button className={tab === 'bills' ? 'on' : ''} onClick={() => setTab('bills')}>🧾 Bills</button>
        <button className={tab === 'water' ? 'on' : ''} onClick={() => setTab('water')}>💧 Water</button>
      </div>
      {tab === 'power' && (
        <>
          <h4>Power source</h4>
          <div className="power-sources" role="radiogroup" aria-label="Power source">
            {/* NEPA / Grid */}
            <button role="radio" aria-checked={mode === 'grid'} className={`power-source ${mode === 'grid' ? 'on' : ''}`} onClick={() => setPowerMode('grid')}>
              <span className="power-source-icon">💡</span>
              <div className="power-source-info">
                <b>NEPA</b>
                <small>{gridUp ? 'Light dey' : 'No light (NEPA took it)'}</small>
              </div>
              <span className={`pill-tag ${grid ? 'on' : ''}`}>{grid ? 'ON' : 'OFF'}</span>
            </button>
            {/* Solar + Inverter */}
            <button role="radio" aria-checked={mode === 'solar'} className={`power-source ${mode === 'solar' ? 'on' : ''}`} disabled={!ownsSolar} onClick={() => setPowerMode('solar')}>
              <span className="power-source-icon">☀️</span>
              <div className="power-source-info">
                <b>Solar</b>
                <small>{!ownsSolar ? 'Buy solar panels to unlock' : solar ? (daylight ? 'Panels charging' : 'Running on inverter') : 'Off'}</small>
                {ownsSolar && (
                  <div className="power-source-detail">
                    <span>🔋 Inverter{inverters > 1 ? ` ×${inverters}` : ''}</span>
                    <div className="bar"><i style={{ width: `${battery}%`, background: needColor(battery) }} /></div>
                    <b>{Math.round(battery)}%</b>
                  </div>
                )}
                {ownsSolar && <small className="muted">~{battHours} game hrs left{inverters < INVERTER.max ? ' · add inverter to last longer' : ''}</small>}
              </div>
            </button>
            {/* Generator */}
            <button role="radio" aria-checked={mode === 'gen'} className={`power-source ${mode === 'gen' ? 'on' : ''}`} disabled={!ownsGen} onClick={() => setPowerMode('gen')}>
              <span className="power-source-icon">⛽</span>
              <div className="power-source-info">
                <b>Generator</b>
                <small>{!gen ? 'Buy a generator to unlock' : `${ITEMS[gen].name} · carries ${GENERATORS[gen].max} kW · ${genOn ? 'Running' : 'Off'}`}</small>
                {ownsGen && (
                  <div className="power-source-detail">
                    <span>⛽ Fuel</span>
                    <div className="bar"><i style={{ width: `${fuel}%`, background: needColor(fuel) }} /></div>
                    <b>{Math.round(fuel)}%</b>
                  </div>
                )}
                {ownsGen && <small className="muted">~{genHours} game hrs left{fullLoad > GENERATORS[gen!].max ? ' · the house is asking more than it can carry' : ''}</small>}
              </div>
            </button>
          </div>
          <small className="muted" style={{ display: 'block', padding: '0 4px 8px' }}>
            {mode === 'grid'
              ? 'On NEPA: you pay by the kWh. Pick Solar or Gen to cut the grid and stop the bill.'
              : `Grid off. Running on ${mode === 'solar' ? 'solar + inverter' : 'generator'} only, no NEPA bill. If it runs out you sit in the dark.`}
          </small>
          <h4>Power use</h4>
          <div className="list-card">
            <div className="power-row">
              <span>🔌</span>
              <span className="power-label">House load</span>
              <b className="power-val">{load.toFixed(2)} kW</b>
            </div>
            <div className="power-row">
              <span>📹</span>
              <span className="power-label">Cameras ({cams})</span>
              <span className={`pill-tag ${powered ? 'on' : ''}`}>{cams === 0 ? 'NONE' : powered ? 'WATCHING' : 'OFFLINE'}</span>
            </div>
            <button type="button" className="garage-more" style={{ marginLeft: 12 }} aria-expanded={usageOpen} onClick={() => setUsageOpen(!usageOpen)}>
              {usageOpen ? 'Hide appliances ▴' : `What's using power · ${appliances.length + 1} ▾`}
            </button>
            {usageOpen && (
              <>
                <div className="power-row">
                  <span>💡</span>
                  <span className="power-label">Lights, fans &amp; chargers</span>
                  <b className="power-val">{POWER.lights.toFixed(2)} kW</b>
                </div>
                {appliances.map((a) => (
                  <div key={a.type} className="power-row">
                    <span>{a.icon}</span>
                    <span className="power-label">{a.name}{a.count > 1 ? ` ×${a.count}` : ''}</span>
                    <b className="power-val">{a.kw.toFixed(2)} kW</b>
                  </div>
                ))}
                <small className="muted" style={{ padding: '0 12px 8px', display: 'block' }}>
                  Always-on draw for this house. Appliances add their own draw only while you use them: a fan about 0.1 kW, the AC 1.5, a water heater 2, a sauna 3.
                </small>
              </>
            )}
            <small className="muted" style={{ padding: '0 12px 8px', display: 'block' }}>
              Cameras, fridges and freezers run all day, and whatever you switch on adds to it. Run out of power and the cameras go blind.
            </small>
          </div>
        </>
      )}
      {tab === 'bills' && (
        <>
          <div className="list-card">
            <div className="power-row">
              <span>🧾</span>
              <span className="power-label">Owed</span>
              <b className="power-val">{naira(Math.ceil(nepaOwed))}</b>
            </div>
            <small className="muted" style={{ padding: '0 12px 8px', display: 'block' }}>
              NEPA charges {naira(POWER.tariff)} per kWh on the grid and auto-deducts the bill from your account at {POWER.billHour}:00 every game day (you get a warning at {POWER.warnHour}:00). Owe over {naira(POWER.cutoff)} and they cut you off. The meter only runs while you are in the house: step out and the light goes off by itself.
            </small>
          </div>
          <button className="btn wide" disabled={nepaOwed < 1 || money < 1} onClick={payNepaBill}>🧾 Pay now instead</button>
        </>
      )}
      {tab === 'water' && (
        <>
          <div className="need-row">
            <span>🛢️</span>
            <span className="need-label">Tank</span>
            <div className="bar"><i style={{ width: `${waterTank}%`, background: needColor(waterTank) }} /></div>
            <b>{Math.round(waterTank)}%</b>
          </div>
          <button className="btn wide" disabled={!atHome || !powered || waterTank >= 100} onClick={pumpWater}>💧 Pump {!atHome ? '· go home' : !powered ? '· no power' : ''}</button>
          <button className="btn wide" disabled={money < 2_000 || waterTank >= 100} onClick={orderWater}>🛺 Mai Ruwa · ₦2,000</button>
        </>
      )}
    </>
  );
}

/** All stations in one flat list for prev/next navigation. */
const ALL_STATIONS = LIVE_STATIONS.map((s) => ({ ...s, live: true as const }));

const GENRE_COLORS: Record<string, string> = {
  Hits: '#f59e0b', Pidgin: '#10b981', Music: '#6366f1', 'News / Talk': '#64748b',
  'Hausa / News': '#0ea5e9', Entertainment: '#ec4899', 'Amapiano / Club': '#a855f7',
  'Afrobeats / Amapiano': '#f43f5e', 'DJ Mixes / R&B': '#8b5cf6', 'Afrobeat / Highlife': '#22c55e',
  Urban: '#f97316',
};
const genreColor = (genre: string) => GENRE_COLORS[genre] ?? '#94a3b8';

function EqBars({ active, large }: { active: boolean; large?: boolean }) {
  return (
    <span className={`radio-eq ${active ? 'radio-eq-on' : ''} ${large ? 'radio-eq-lg' : ''}`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className="radio-eq-bar" style={{ animationDelay: `${i * 100}ms` }} />)}
    </span>
  );
}

/** Fake waveform visualisation — purely decorative, CSS-animated bars. */
function Waveform({ active }: { active: boolean }) {
  return (
    <div className={`radio-wave ${active ? 'radio-wave-on' : ''}`}>
      {Array.from({ length: 32 }, (_, i) => (
        <span key={i} className="radio-wave-bar" style={{ animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

const LIVE_CITIES = [...new Set(LIVE_STATIONS.map((s) => s.city))];

function Radio() {
  const [playing, setPlaying] = useState(audio.radioOn);
  const [liveId, setLiveId] = useState<string | null>(audio.currentLiveStation?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);

  const currentIdx = liveId ? ALL_STATIONS.findIndex((s) => s.id === liveId) : -1;
  const current = currentIdx >= 0 ? ALL_STATIONS[currentIdx] : null;

  const tuneLive = (station: LiveStation) => {
    setLiveId(station.id);
    setLoading(true);
    setError(null);
    tuneRadio(station);
    const poll = setInterval(() => {
      if (!audio.liveLoading) {
        clearInterval(poll);
        setLoading(false);
        if (audio.liveError) {
          setError(audio.liveError);
          setLiveId(null);
        } else {
          setPlaying(true);
        }
      }
    }, 200);
  };

  const stopAll = () => {
    radioOff();
    setPlaying(false);
    setLoading(false);
  };

  const skip = (dir: 1 | -1) => {
    const next = (currentIdx + dir + ALL_STATIONS.length) % ALL_STATIONS.length;
    tuneLive(ALL_STATIONS[next]);
  };

  // Auto-start first station if nothing playing
  const playFirst = () => tuneLive(ALL_STATIONS[0]);

  return (
    <>
      {/* FM Tuner face */}
      <div className="radio-tuner">
        <div className="radio-tuner-freq">
          <span className="radio-tuner-band">FM</span>
          <b>{current ? current.freq : '—'}</b>
          <span className="radio-tuner-mhz">MHz</span>
        </div>

        <Waveform active={playing && !!current} />

        <div className="radio-tuner-name">
          {loading ? 'Tuning...' : current ? current.name : 'No station'}
        </div>
        {current && <div className="radio-tuner-genre" style={{ color: genreColor(current.genre) }}>{current.genre} · {current.city}</div>}
        {error && <div className="radio-tuner-err">{error}</div>}

        {/* Controls */}
        <div className="radio-controls">
          <button className="radio-ctrl" onClick={() => skip(-1)} disabled={!current} aria-label="Previous">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" transform="scale(-1,1) translate(-24,0)" /></svg>
          </button>
          <button className="radio-ctrl radio-ctrl-play" onClick={playing && current ? stopAll : current ? () => tuneLive(current) : playFirst}>
            {playing && current
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
          </button>
          <button className="radio-ctrl" onClick={() => skip(1)} disabled={!current && !ALL_STATIONS.length} aria-label="Next">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
          </button>
        </div>
      </div>

      {/* Station list toggle */}
      <button className="btn wide" onClick={() => setShowList(!showList)} style={{ fontSize: 12 }}>
        {showList ? '▲ Hide stations' : '▼ All stations'}
      </button>

      {showList && (
        <>
          {LIVE_CITIES.map((city) => (
            <div key={city}>
              <h4>{city}</h4>
              <div className="radio-stations">
                {LIVE_STATIONS.filter((s) => s.city === city).map((s) => {
                  const active = liveId === s.id;
                  return (
                    <button className={`radio-stn ${active ? 'radio-stn-on' : ''}`} key={s.id} onClick={() => { tuneLive(s); setShowList(false); }}>
                      <span className="radio-stn-dot" style={{ background: active ? genreColor(s.genre) : 'var(--bg-e2e8f0)' }}>
                        {active && loading ? <span className="radio-stn-loading" /> : active ? <EqBars active /> : <span style={{ fontSize: 11, fontWeight: 800, color: active ? '#fff' : '#94a3b8' }}>{s.freq}</span>}
                      </span>
                      <span className="radio-stn-info">
                        <b>{s.name}</b>
                        <small style={{ color: genreColor(s.genre) }}>{s.freq} FM · {s.genre}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function CloudRow() {
  const user = useSession((s) => s.user);
  const cloud = useSession((s) => s.cloud);
  const cloudAt = useSession((s) => s.cloudAt);
  const logOut = useSession((s) => s.logOut);
  if (!user) return null;
  const label =
    cloud === 'saving' ? 'Saving…' : cloud === 'error' ? 'Save failed' : cloudAt ? `Saved ${new Date(cloudAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'On';
  return (
    <>
      <div className="need-row">
        <span>☁️</span>
        <span className="need-label">Cloud save</span>
        <span className={`pill-tag ${cloud === 'error' ? 'warn' : ''}`}>{label}</span>
      </div>
      <div className="need-row">
        <span>🔑</span>
        <span className="need-label">{user.email ?? 'Signed in'}</span>
        <button className="btn sm" onClick={logOut}>
          Sign out
        </button>
      </div>
    </>
  );
}

/** The build this page is running, like "v0.1.267 (6faa281)": written into index.html when the game is built (vite.config.ts). */
const GAME_VERSION = document.querySelector<HTMLMetaElement>('meta[name="kaduna-version"]')?.content;

function AboutPhone() {
  const phone = useGame((s) => PHONE_BY_ID[s.phone]);
  const owned = useGame((s) => s.ownedPhones);
  const usePhone = useGame((s) => s.usePhone);
  if (!phone) return null;
  return (
    <>
      <h4>About phone</h4>
      <div className="list-card">
        <div className="need-row">
          <span>📱</span>
          <span className="need-label">
            {phone.name}
            <small className="muted"> · {phone.os === 'ios' ? 'iOS' : 'Android'}</small>
          </span>
        </div>
        {owned.length > 1 && (
          <div className="pills" style={{ padding: '4px 0' }}>
            {owned.map((id) => (
              <button key={id} className={id === phone.id ? 'on' : ''} onClick={() => usePhone(id)}>
                {PHONE_BY_ID[id]?.name ?? id}
              </button>
            ))}
          </div>
        )}
        <div className="need-row">
          <span>🛒</span>
          <span className="need-label muted">New phones: Phone village at Central Market or Jumia</span>
        </div>
        {GAME_VERSION && (
          <div className="need-row">
            <span>🎮</span>
            <span className="need-label">
              Game version
              <small className="muted"> · {GAME_VERSION}</small>
            </span>
          </div>
        )}
      </div>
    </>
  );
}

function SoundSettings() {
  const [on, setOn] = useState(sfx.enabled);
  return (
    <div className="list-card">
      <label className="settings-option">
        <span>
          <b>Sound effects</b>
          <small>{on ? 'On' : 'Off'}</small>
        </span>
        <input type="checkbox" role="switch" aria-label="Sound effects" checked={on} onChange={(e) => { setOn(e.target.checked); sfx.setEnabled(e.target.checked); }} />
      </label>
    </div>
  );
}

function Settings() {
  const name = useGame((s) => s.name);
  const [sure, setSure] = useState(false);
  const [tab, setTab] = useState<'general' | 'account'>('general');
  return (
    <>
      <div className="tabs">
        <button className={tab === 'general' ? 'on' : ''} onClick={() => setTab('general')}>⚙️ General</button>
        <button className={tab === 'account' ? 'on' : ''} onClick={() => setTab('account')}>👤 Account</button>
      </div>
      {tab === 'general' ? (
      <>
      <h4>Sound</h4>
      <SoundSettings />
      <h4>Visuals</h4>
      <div className="list-card">
        <ThemeSettings />
        <PerfSettings />
      </div>
      <h4>Help</h4>
      <div className="list-card">
        <GuideSettings onPlay={() => (useGame.getState().setPanel(null), startGuide())} />
      </div>
      <OpenSourceSettings />
      <AboutPhone />
      </>
      ) : (
      <>
      <LinkAccount />
      <h4>Account</h4>
      <div className="list-card">
        <div className="need-row">
          <span>👤</span>
          <span className="need-label">{name}</span>
        </div>
        <div className="need-row">
          <span>💾</span>
          <span className="need-label">Auto-saved</span>
        </div>
        <CloudRow />
      </div>
      {sure ? (
        <div className="row-btns">
          <button className="btn danger" onClick={() => useGame.getState().endLife()}>
            Yes, start over
          </button>
          <button className="btn" onClick={() => setSure(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="btn danger" onClick={() => setSure(true)}>
          Born again
        </button>
      )}
      </>
      )}
    </>
  );
}

function LocalCivic() {
  const money = useGame((s) => s.money);
  const minutes = useGame((s) => Math.floor(s.minutes));
  const campaign = useGame((s) => s.campaign);
  const office = useGame((s) => s.governmentOffice);
  const goodDeeds = useGame((s) => s.goodDeeds);
  const notoriety = useGame((s) => s.notoriety);
  const storyLog = useGame((s) => s.storyLog);
  const runForOffice = useGame((s) => s.runForOffice);
  const campaignEvent = useGame((s) => s.campaignEvent);
  const today = dayOf(minutes);
  const daysLeft = campaign ? Math.max(0, campaign.electionDay - today) : 0;
  const campaignedToday = campaign?.lastActionDay === today;
  return (
    <>
      <div className="hero hero-green">
        <small>{office ? 'In office' : 'Government'}</small>
        <b>{office ? OFFICE_RULES[office].title : 'Run for office'}</b>
      </div>
      <div className="civic-record">
        <span><Emoji char="🤝" size={14} /> Good deeds <b>{goodDeeds}</b></span>
        <span><Emoji char="🚨" size={14} /> Street heat <b>{notoriety}</b></span>
      </div>
      {storyLog.length > 0 && (
        <>
          <h4>Recent stories</h4>
          <div className="list-card civic-stories">
            {storyLog.slice(0, 3).map((entry, i) => <p key={`${entry}-${i}`}>{entry}</p>)}
          </div>
        </>
      )}
      {campaign ? (
        <>
          <div className="list-card civic-status">
            <b>Running for {OFFICE_RULES[campaign.office].title}</b>
            <span>Support {campaign.support}% · Goal {OFFICE_RULES[campaign.office].targetSupport}% · {daysLeft}d left</span>
            <div className="bar"><i style={{ width: `${campaign.support}%` }} /></div>
          </div>
          <h4>Campaign</h4>
          <button className="civic-action" disabled={campaignedToday || money < CAMPAIGN_EVENTS.rally.cost} onClick={() => campaignEvent('rally')}>
            <span><Emoji char="📣" size={22} /></span><b>{CAMPAIGN_EVENTS.rally.label}</b><small>+{CAMPAIGN_EVENTS.rally.support} support · {naira(CAMPAIGN_EVENTS.rally.cost)}</small>
          </button>
          <button className="civic-action" disabled={campaignedToday || money < CAMPAIGN_EVENTS.townHall.cost} onClick={() => campaignEvent('townHall')}>
            <span><Emoji char="🎤" size={22} /></span><b>{CAMPAIGN_EVENTS.townHall.label}</b><small>+{CAMPAIGN_EVENTS.townHall.support} support · {naira(CAMPAIGN_EVENTS.townHall.cost)}</small>
          </button>
          {campaignedToday && <p className="muted small">Done today</p>}
        </>
      ) : (
        <>
          <h4>Run for</h4>
          {LOCAL_OFFICES.map((race) => (
            <div key={race} className="tile">
              <span className="tile-icon"><Emoji char={OFFICE_ICON[race]} size={24} /></span>
              <span className="tile-info">
                <b>{race === 'governor' ? 'Kaduna Governor' : OFFICE_RULES[race].title}</b>
                <small>{naira(OFFICE_RULES[race].filingFee)}</small>
              </span>
              <button
                className="btn sm"
                disabled={money < OFFICE_RULES[race].filingFee || office === race}
                onClick={() => runForOffice(race)}
              >
                Run
              </button>
            </div>
          ))}
        </>
      )}
    </>
  );
}

type Office = PoliticalOffice;

/** One city's street lights that are out: whoever runs the city can fix them, the same way as its potholes. */
function LampsCard({ city, isGovernor, governor }: { city: CivicCity; isGovernor: boolean; governor: string }) {
  const data = useRoads((s) => s.data);
  const busy = useRoads((s) => s.busy);
  const fix = useRoads((s) => s.fix);
  const money = useGame((s) => s.money);
  const [showAll, setShowAll] = useState(false);
  if (!data) return null;
  const headWord = city === 'abuja' ? 'Minister' : 'Governor';
  const out = (data.lamps ?? []).filter((site) => lampCity(site) === city);
  const shown = showAll ? out : out.slice(0, 4);
  const total = lampSites(city).length;
  const lampNextAt = data.cities?.[city]?.lampNextAt;
  const hoursToNext = lampNextAt ? Math.max(0, Math.ceil((lampNextAt - Date.now()) / 3600_000)) : null;
  const budget = data.cities?.[city]?.budget ?? data.budget ?? data.treasury;
  const cost = LAMPS.fixCost;
  return (
    <div className="roads-card">
      <div className="roads-head">
        <span className="roads-icon"><Emoji char="💡" size={22} /></span>
        <div>
          <b>Street lights</b>
          <small>{CITY_NAME[city]} roads · {headWord} {governor}</small>
        </div>
      </div>
      <div className="roads-stats">
        <span><b>{out.length}</b><small>out of {total}</small></span>
        <span><b>{hoursToNext === null ? '–' : `~${hoursToNext}h`}</b><small>next one</small></span>
        <span><b>{naira(cost)}</b><small>each to fix</small></span>
      </div>
      {isGovernor &&
        shown.map((site) => (
          <div key={site} className="roads-hole">
            <div className="roads-hole-info">
              <b>{lampOf(site)?.road ?? 'a side street'}</b>
              <em>{naira(cost)}</em>
            </div>
            <div className="roads-pay">
              <button className="roads-pocket" disabled={busy || money < cost} onClick={() => void fix(site, 'pocket', 'lamp')}><Emoji char="👛" size={14} /> My pocket</button>
              <button className="roads-treasury" disabled={busy || budget < cost} onClick={() => void fix(site, 'treasury', 'lamp')}><Emoji char="🏦" size={14} /> Treasury</button>
            </div>
          </div>
        ))}
      {isGovernor && out.length > 4 && (
        <button className="ghost-btn" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${out.length}`}</button>
      )}
      {!out.length && <small className="roads-foot">Every street light in {CITY_NAME[city]} is working.</small>}
      {!isGovernor && !!out.length && <small className="roads-foot">Only the {OFFICE_RULES[CITY_HEAD[city]].title} can fix street lights in {CITY_NAME[city]}.</small>}
    </div>
  );
}

/** One city's potholes: whoever runs the city (the governor in Kaduna, the FCT Minister in Abuja) can fix them. */
function RoadsCard({ city, isGovernor, governor }: { city: CivicCity; isGovernor: boolean; governor: string }) {
  const data = useRoads((s) => s.data);
  const busy = useRoads((s) => s.busy);
  const error = useRoads((s) => s.error);
  const fix = useRoads((s) => s.fix);
  const money = useGame((s) => s.money);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => void useRoads.getState().refresh(), []);
  if (!data) return null;
  const title = OFFICE_RULES[CITY_HEAD[city]].title;
  const headWord = city === 'abuja' ? 'Minister' : 'Governor';
  // Worst first, so the governor sees the craters before the dents.
  const open = data.open.filter((site) => potholeCity(site) === city).sort((a, b) => (potholeOf(b)?.severity ?? 0) - (potholeOf(a)?.severity ?? 0));
  const shown = showAll ? open : open.slice(0, 4);
  const hoursToNext = Math.max(0, Math.ceil(((data.cities?.[city]?.nextAt ?? data.nextAt) - Date.now()) / 3600_000));
  const last = data.recent.find((f) => potholeCity(f.site) === city);
  // The city's own treasury is all its government can spend on repairs.
  const budget = data.cities?.[city]?.budget ?? data.budget ?? data.treasury;
  return (
    <div className="roads-card">
      <div className="roads-head">
        <span className="roads-icon"><Emoji char="🕳️" size={22} /></span>
        <div>
          <b>Potholes</b>
          <small>{CITY_NAME[city]} roads · {headWord} {governor}</small>
        </div>
      </div>
      <div className="roads-stats">
        <span><b>{open.length}</b><small>open</small></span>
        <span><b>~{hoursToNext}h</b><small>next one</small></span>
        <span><b>{naira(budget)}</b><small>{CITY_NAME[city]}’s budget</small></span>
      </div>
      {error && <span className="civic-notice civic-error" role="alert">{error}</span>}
      {isGovernor &&
        shown.map((site) => {
          const cost = fixCostOf(site);
          const severity = potholeOf(site)?.severity ?? 2;
          return (
            <div key={site} className="roads-hole">
              <div className="roads-hole-info">
                <b>{roadOf(site)}</b>
                <span>{Array.from({ length: severity }, (_, i) => <Emoji key={i} char="🕳️" size={13} />)}</span>
                <em>{naira(cost)}</em>
              </div>
              <div className="roads-pay">
                <button className="roads-pocket" disabled={busy || money < cost} onClick={() => void fix(site, 'pocket')}><Emoji char="👛" size={14} /> My pocket</button>
                <button className="roads-treasury" disabled={busy || budget < cost} onClick={() => void fix(site, 'treasury')}><Emoji char="🏦" size={14} /> Treasury</button>
              </div>
            </div>
          );
        })}
      {isGovernor && open.length > 4 && (
        <button className="ghost-btn" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${open.length}`}</button>
      )}
      {!isGovernor && <small className="roads-foot">Only the {title} can fix potholes in {CITY_NAME[city]}.</small>}
      {last && (
        <small className="roads-foot">
          Last fixed: {roadOf(last.site)} by {last.by ? `@${last.by}` : `the ${headWord.toLowerCase()}`} ({last.paidFrom === 'pocket' ? 'own pocket' : 'treasury'})
        </small>
      )}
    </div>
  );
}

function SharedCivic() {
  const user = useSession((s) => s.user);
  const data = useCivic((s) => s.data);
  const loading = useCivic((s) => s.loading);
  const busy = useCivic((s) => s.busy);
  const error = useCivic((s) => s.error);
  const refresh = useCivic((s) => s.refresh);
  const uid = user?.uid ?? '';
  // A tapped government notice opens straight on the news.
  const [tab, setTab] = useState<'elections' | 'laws' | 'treasury' | 'news'>(() => (useCivic.getState().wantNews ? 'news' : 'elections'));
  const wantNews = useCivic((s) => s.wantNews);
  useEffect(() => {
    if (!wantNews) return;
    setTab('news');
    useCivic.setState({ wantNews: false });
  }, [wantNews]);
  const wantTreasury = useCivic((s) => s.wantTreasury);
  useEffect(() => {
    if (!wantTreasury) return;
    setTab('treasury');
    useCivic.setState({ wantTreasury: false });
  }, [wantTreasury]);
  // A state's laws, from its card on the map: the Laws tab, on that state's office.
  const wantLaws = useCivic((s) => s.wantLaws);
  const [lawsOf, setLawsOf] = useState<PoliticalOffice | null>(null);
  useEffect(() => {
    if (!wantLaws) return;
    setTab('laws');
    setLawsOf(wantLaws);
    useCivic.setState({ wantLaws: null });
  }, [wantLaws]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const policy = data?.policies;
  const holderOf = (office: Office) => policy?.[office] ?? null;
  const nameOf = (office: Office) => {
    const holder = holderOf(office);
    return holder?.username ? `@${holder.username}` : holder?.name ?? 'Vacant';
  };
  const holds = (office: Office) => holderOf(office)?.uid === uid;
  // Whoever runs a city repairs its roads from the Treasury tab.
  const myCity = CIVIC_CITIES.find((c) => holds(CITY_HEAD[c]));
  return (
    <>
      <TreasuryHero />
      <div className="tabs">
        <button className={tab === 'elections' ? 'on' : ''} onClick={() => setTab('elections')}><Emoji char="🗳️" size={14} /> Elections</button>
        <button className={tab === 'laws' ? 'on' : ''} onClick={() => setTab('laws')}><Emoji char="⚖️" size={14} /> Laws</button>
        <button className={tab === 'treasury' ? 'on' : ''} onClick={() => setTab('treasury')}><Emoji char="🏦" size={14} /> Treasury</button>
        <button className={tab === 'news' ? 'on' : ''} onClick={() => setTab('news')}><Emoji char="📜" size={14} /> News</button>
      </div>
      {error && <div className="civic-notice civic-error" role="alert">{error}</div>}
      {loading && !data && <p className="muted">Loading the shared election board…</p>}
      {data && (
        <>
          {tab === 'elections' && <ElectionBoard />}
          {tab === 'treasury' && <TreasuryTab uid={uid} repairs={myCity && <><RoadsCard key={myCity} city={myCity} isGovernor governor={nameOf(CITY_HEAD[myCity])} /><LampsCard key={`lamps-${myCity}`} city={myCity} isGovernor governor={nameOf(CITY_HEAD[myCity])} /></>} />}
          {tab === 'news' && <CivicNewsTab />}
          {tab === 'laws' && <LawsTab key={lawsOf ?? 'all'} uid={uid} start={lawsOf ?? undefined} />}
          <button className="ghost-btn" disabled={loading || busy} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh election board'}</button>
        </>
      )}
      {!data && !loading && (tab === 'laws' || tab === 'treasury') && (
        <div className="list-card civic-empty">
          <span><Emoji char={tab === 'laws' ? '⚖️' : '🏦'} size={28} /></span>
          <b>{tab === 'laws' ? 'No laws on the books yet' : 'Treasury is empty'}</b>
          <small className="muted">
            {tab === 'laws'
              ? 'Once the government is in office, tax rates, the budget and other laws will show here.'
              : 'Income tax from wages and side hustles will pile up here once the government is running.'}
          </small>
          <button className="ghost-btn" onClick={() => void refresh()}>Check again</button>
        </div>
      )}
      {!data && !loading && tab === 'elections' && <button className="ghost-btn" onClick={() => void refresh()}>Try again</button>}
    </>
  );
}

function Civic() {
  const user = useSession((s) => s.user);
  return user ? <SharedCivic /> : <LocalCivic />;
}

function RideApp() {
  const destinationId = useGame((s) => s.destinationId);
  const origin = useGame((s) => s.origin);
  const properties = useGame((s) => s.properties);
  const hour = useGame((s) => Math.floor(hourOf(s.minutes)));
  const view = useGame((s) => s.view);
  const insideId = useGame((s) => s.insideId);
  const activeTask = useGame((s) => s.task);

  const [query, setQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState('all');

  const homeState = useGame((s) => s.homeState);
  const hasHome = destinationId === homeState && (origin !== 'almajiri' || properties.some((p) => p.stage >= STAGES.length));
  const places = useMemo(() => {
    return regionPlaces(destinationId).filter((p) => (p.id !== 'home' || hasHome) && p.id !== 'prison' && p.id !== 'camp');
  }, [destinationId, hasHome]);

  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const p of places) set.add(p.area);
    return ['all', ...Array.from(set)];
  }, [places]);

  const filteredPlaces = useMemo(() => {
    return places.filter((p) => {
      if (selectedArea !== 'all' && p.area !== selectedArea) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        return p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q) || p.blurb.toLowerCase().includes(q);
      }
      return true;
    });
  }, [places, selectedArea, query]);

  // Where you are on the town map: your own spot out there, or the door of the building you are in. Unknown (an
  // estate, a hotel room) leaves the distance off the row.
  const here = view === 'city' ? avatarCell() : regionPlaces(destinationId).find((p) => p.id === (view === 'home' ? 'home' : insideId))?.door ?? null;
  const getDistanceStr = (p: Place) => {
    if (!here) return '';
    const dist = Math.hypot(p.door.x - here.x, p.door.z - here.z) * 15;
    if (dist < 45) return 'Nearby';
    if (dist < 950) return `~${Math.round(dist / 10) * 10}m`;
    return `~${(dist / 1000).toFixed(1)}km`;
  };

  // Picking a place puts the phone away and brings up its "Go to" sheet on the town map (ui/Sheets.tsx PlaceSheet),
  // where you choose how to travel: same as tapping the building.
  const pick = (place: Place) => {
    const game = useGame.getState();
    if (game.view !== 'city') game.openMap();
    const now = useGame.getState();
    // Too tired or at work: openMap said why, and the phone stays open.
    if (now.view !== 'city') return;
    now.selectPlace(place.id);
    if (useGame.getState().placeId !== place.id) return now.toast('🚗 Park your car first, then pick where to go.');
    now.setPanel(null);
  };

  return (
    <div className="ride-app">
      <div className="hero hero-yellow ride-hero">
        <small>🚖 {regionOf(destinationId).name} Bolt</small>
        <b>Where to? 🚕</b>
        <small>Pick a place, then choose how to get there</small>
        {activeTask?.actionId === 'enter' && activeTask.phase === 'walking' && (
          <div className="ride-active-chip">
            <span>{activeTask.icon} {activeTask.label}</span>
          </div>
        )}
      </div>

      <div className="ride-search-box">
        <span className="ride-search-icon">🔍</span>
        <input
          type="text"
          className="ride-search-input"
          placeholder="Search places, markets, spots..."
          aria-label="Search destinations"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="ride-clear-btn" onClick={() => setQuery('')} aria-label="Clear search">✕</button>
        )}
      </div>

      <div className="ride-area-pills">
        {areas.map((a) => (
          <button
            key={a}
            className={`ride-pill ${selectedArea === a ? 'on' : ''}`}
            onClick={() => setSelectedArea(a)}
          >
            {a === 'all' ? 'All Areas' : a}
          </button>
        ))}
      </div>

      <h4>{selectedArea === 'all' ? 'All Destinations' : `${selectedArea} Destinations`} ({filteredPlaces.length})</h4>
      <div className="ride-list">
        {filteredPlaces.map((p) => {
          const isOpenNow = p.id === 'home' || isOpen(p, hour);
          const distStr = getDistanceStr(p);
          return (
            <button key={p.id} type="button" className={`ride-item ${isOpenNow ? '' : 'closed'}`} onClick={() => pick(p)}>
              <span className="ride-item-icon"><Emoji char={p.icon} size={24} /></span>
              <span className="ride-item-body">
                <b>{p.name}</b>
                <small>{p.area}{distStr ? ` · ${distStr}` : ''}</small>
              </span>
              <span className={`pill-tag ${isOpenNow ? 'on' : ''}`}>{isOpenNow ? 'Open' : 'Closed'}</span>
              <span className="ride-item-chev" aria-hidden="true">›</span>
            </button>
          );
        })}
        {filteredPlaces.length === 0 && (
          <div className="ride-empty">
            <b>No place matches that</b>
            <small>Try another name, or switch back to All Areas.</small>
          </div>
        )}
      </div>
    </div>
  );
}

// Every board game lives behind this one app, so their code only loads when it is opened.
const GamesApp = lazy(() => import('./GamesApp').then((m) => ({ default: m.GamesApp })));

const SCREENS: Record<AppId, () => ReactNode> = {
  // Opens the closet panel instead of a phone screen (see Home).
  closet: () => null,
  // Puts the phone away and raises the camera over the scene (see Home).
  camera: () => null,
  messages: Messages,
  ride: RideApp,
  bank: Bank,
  invest: Invest,
  forbes: ForbesApp,
  cars: Cars,
  gida: House,
  jobs: Jobs,
  mall: Mall,
  gist: GistApp,
  hustle: HustleApp,
  yahoo: YahooApp,
  blackmarket: BlackMarketApp,
  plug: PlugApp,
  fixer: FixerApp,
  grind: GrindApp,
  games: () => <Suspense fallback={null}><GamesApp /></Suspense>,
  area: AreaApp,
  legacy: LegacyApp,
  // Rendered by Phone itself: it needs the device and a way to open apps.
  store: () => null,
  babalawo: BabaApp,
  flex: SnapApp,
  pidgin: PidginApp,
  light: Light,
  radio: Radio,
  settings: Settings,
  civic: Civic,
  police: PoliceApp,
  efcc: EfccApp,
  family: FamilyApp,
  goals: GoalsApp,
  career: CareerApp,
  business: BusinessApp,
  topup: TopUpApp,
  ads: () => null, // the Ads icon opens the bottom sheet instead (see Home)
  help: HelpApp,
  hire: HireApp,
};

/* ---------- Shell ---------- */

/** The class of each front-camera cutout (ui/phones.css; the island and the punch hole are in styles.css). */
const CUTOUT_CLASS: Record<Cutout, string> = { notch: 'notch', 'notch-wide': 'notch wide', island: 'island', 'island-small': 'island small', punch: 'punch', drop: 'drop' };

function StatusBar({ dark, cutout }: { dark: boolean; cutout: Cutout }) {
  const minutes = useGame((s) => Math.floor(s.minutes));
  const powered = useGame(isPowered);
  return (
    <div className={`phone-status ${dark ? 'dark' : ''}`}>
      <span className="st-time">{formatClock(minutes).replace(/ (AM|PM)/, '')}</span>
      <span className={CUTOUT_CLASS[cutout]} />
      <span className="st-right">
        <span className="signal">
          <i />
          <i />
          <i />
          <i />
        </span>
        4G
        <span className={`battery ${powered ? 'charging' : ''}`}>
          <i />
        </span>
      </span>
    </div>
  );
}

/** Each phone keeps its own wallpaper design, with a consistent dark base for legibility. */
function Wallpaper({ device }: { device: PhoneDef }) {
  const { kind, colors } = device.wall;
  const [a, b, c] = colors;
  if (kind === 'hills')
    return (
      <div className="wall wall-night">
        <span className="wall-sun" />
        <svg viewBox="0 0 340 200" preserveAspectRatio="none" className="wall-hills">
          <polygon className="h1" points="0,120 60,70 110,105 170,55 230,95 290,60 340,90 340,200 0,200" />
          <polygon className="h2" points="0,150 50,118 120,140 190,105 260,138 340,115 340,200 0,200" />
          <polygon className="h3" points="0,175 80,150 150,168 230,145 300,165 340,155 340,200 0,200" />
        </svg>
      </div>
    );
  if (kind === 'dunes')
    return (
      <div className="wall wall-dunes" style={{ background: `linear-gradient(180deg, ${a} 0%, #c5ccd1 40%, ${b} 60%, #b59c74 100%)` }}>
        <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
          <path d="M0,208 L55,176 L105,192 L168,152 L228,184 L292,160 L352,186 L400,168 L400,270 L0,270Z" fill={c} opacity="0.7" />
          <path d="M0,238 C90,208 190,254 400,218 L400,400 L0,400Z" fill={b} />
          <path d="M0,296 C120,254 262,326 400,274 L400,400 L0,400Z" fill="#b9a07a" />
          <path d="M0,352 C140,318 250,372 400,336 L400,400 L0,400Z" fill="#a98f69" opacity="0.8" />
        </svg>
      </div>
    );
  return (
    <div className="wall wall-art wall-night" style={{ background: 'linear-gradient(160deg, #111827, #020617 75%)' }}>
      <svg viewBox="0 0 340 680" preserveAspectRatio="xMidYMid slice">
        {kind === 'waves' && (
          <>
            <path d="M0,330 C90,270 170,400 340,320 L340,680 L0,680Z" fill={b} opacity="0.55" />
            <path d="M0,420 C110,360 210,480 340,410 L340,680 L0,680Z" fill={c} opacity="0.45" />
            <path d="M0,520 C120,470 220,580 340,500 L340,680 L0,680Z" fill={a} opacity="0.7" />
          </>
        )}
        {kind === 'blobs' && (
          <>
            <circle cx="60" cy="160" r="150" fill={c} opacity="0.5" />
            <circle cx="300" cy="420" r="190" fill={b} opacity="0.75" />
            <circle cx="90" cy="600" r="140" fill={c} opacity="0.35" />
            <circle cx="250" cy="130" r="60" fill={a} opacity="0.6" />
          </>
        )}
        {kind === 'bloom' && (
          <>
            <defs>
              <radialGradient id="bloom-g" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor={c} />
                <stop offset="0.55" stopColor={b} stopOpacity="0.7" />
                <stop offset="1" stopColor={a} stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx="90" cy="250" rx="260" ry="230" fill="url(#bloom-g)" />
            <ellipse cx="300" cy="520" rx="220" ry="240" fill="url(#bloom-g)" opacity="0.8" />
          </>
        )}
        {kind === 'shapes' && (
          <>
            <circle cx="270" cy="200" r="110" fill={c} />
            <rect x="-30" y="330" width="210" height="210" rx="60" fill={b} />
            <path d="M210,520 L340,450 L340,680 L170,680Z" fill={a} opacity="0.9" />
            <circle cx="90" cy="150" r="34" fill={b} opacity="0.6" />
          </>
        )}
        {kind === 'rings' &&
          [300, 240, 180, 120, 60].map((r, i) => (
            <circle key={r} cx="170" cy="400" r={r} fill="none" stroke={i % 2 ? c : b} strokeWidth={i % 2 ? 6 : 26} opacity={0.35 + i * 0.12} />
          ))}
      </svg>
    </div>
  );
}

/** Players-online count on the phone's home screen. Switched off for now; set true to show it again. */
const SHOW_ONLINE = false;

/** The four apps that stay in the dock at the bottom of the home screen. */
const DOCK_APPS: AppId[] = ['messages', 'bank', 'camera', 'gist'];
function Home({ open, duo }: { open: (id: AppId) => void; duo?: boolean }) {
  const stats = useCityStats((s) => s.stats);
  useEffect(() => watchCityStats(), []);
  // Everyone this game can see in its room, plus you: moves the instant someone comes or goes, like the old HUD chip.
  // The server total covers the other rooms too, so show whichever is bigger.
  const inRoom = useNet((s) => (s.connected ? Object.keys(s.players).length + 1 : 0));
  const online = Math.max(stats?.online ?? 0, inRoom);
  const minutes = useGame((s) => Math.floor(s.minutes));
  const destinationId = useGame((s) => s.destinationId);
  const day = dayOf(minutes);
  const installed = useApps((s) => s.installed);
  const fresh = useApps((s) => s.fresh);
  const downloaded = installed.filter((id): id is AppId => STORE_APP_IDS.has(id) && id in APPS);
  // Newly installed apps go first so the NEW badge is seen; the rest keep importance order. Dock apps live in the dock.
  const rest = downloaded.filter((id) => !fresh.includes(id));
  const apps = [...downloaded.filter((id) => fresh.includes(id)), ...HOME_APPS, ...rest, ...TAIL_APPS].filter((id) => !DOCK_APPS.includes(id));
  const money = useGame((s) => s.money);
  const brand = useGame((s) => PHONE_BY_ID[s.phone]?.brand);
  const clock = formatClock(minutes).replace(/ (AM|PM)/, '').split(':');
  // The iPhone Duo: widgets over the apps, Today View beside them when it is open, and the dock in the rail (DuoRail).
  if (duo)
    return (
      <div className="home duo-home">
        <DuoToday day={day} city={regionOf(destinationId).name} />
        <div className="duo-page">
          <div className="home-scroll">
            <div className="duo-widgets">
              <div className="duo-widget city">
                <small>{regionOf(destinationId).name}</small>
                <b>{formatClock(minutes).replace(/ (AM|PM)/, '')}</b>
                <span>{WEEKDAYS[(day - 1) % 7]}, Day {day}</span>
              </div>
              <button className="duo-widget wallet" onClick={() => open('bank')}>
                <small>Wallet</small>
                <b>{nairaShort(money)}</b>
                <span>{stats ? `${stats.visitsTotal.toLocaleString('en-NG')} ${stats.visitsTotal === 1 ? 'play' : 'plays'}` : 'Naira'}</span>
              </button>
            </div>
            <div className="app-grid">
              {apps.map((id) => (
                <AppIcon key={id} app={APPS[id]} onClick={() => open(id)} />
              ))}
            </div>
          </div>
          <div className="duo-dots" aria-hidden><i className="on" /><i /></div>
        </div>
      </div>
    );
  return (
    <div className="home">
      <div className="home-scroll">
        <div className="phone-clock">
          {/* Hours and minutes apart: a Pixel stacks them (ui/phones.css). */}
          <b><span>{clock[0]}</span><i>:</i><span>{clock[1]}</span></b>
          <small>
            {WEEKDAYS[(day - 1) % 7]}, Day {day} · {regionOf(destinationId).name}
          </small>
        </div>
        {stats && (
          <span className="phone-pill">
            {SHOW_ONLINE && <><i className="live-dot" />{online.toLocaleString('en-NG')} online · </>}<Emoji char="👁️" size={13} /> {stats.visitsTotal.toLocaleString('en-NG')} {stats.visitsTotal === 1 ? 'play' : 'plays'}
          </span>
        )}
        <div className="app-grid">
          {apps.map((id) => (
            <AppIcon key={id} app={APPS[id]} onClick={() => open(id)} />
          ))}
        </div>
      </div>
      <div className="dock">
        {DOCK_APPS.map((id) => (
          <AppIcon key={id} app={APPS[id]} onClick={() => open(id)} />
        ))}
      </div>
      {/* A Pixel keeps a search bar under the dock. Here it finds apps. */}
      {brand === 'Google' && (
        <button className="g-search" onClick={() => open('store')} aria-label="Find apps">
          <b>G</b>
          <span>Search apps</span>
        </button>
      )}
    </div>
  );
}

/** Today View, the left half of the iPhone Duo's inner screen: you, the way Photos shows "On This Day". Hidden while the phone is shut. */
function DuoToday({ day, city }: { day: number; city: string }) {
  const user = useSession((s) => s.user);
  const look = useGame((s) => s.look);
  return (
    <div className="duo-today">
      <div className="duo-photo">
        <Face uid={user?.uid} username={user?.username} look={look} className="duo-face" />
        <div className="duo-caption">
          <b>{user?.username ? `@${user.username}` : 'On This Day'}</b>
          <small>Day {day} · {city}</small>
        </div>
      </div>
    </div>
  );
}

/** The iPhone Duo's status circle: the battery is the ring, the signal the dots closing it, Wi-Fi in the middle. */
function DuoStatus({ powered }: { powered: boolean }) {
  return (
    <svg className={`duo-status ${powered ? 'charging' : ''}`} viewBox="0 0 32 30" aria-hidden>
      <path className="ring" d="M8.83 25.24 A12.5 12.5 0 1 1 23.17 25.24" fill="none" strokeWidth="2.3" strokeLinecap="round" />
      {[[11.72, 26.75], [14.48, 27.41], [17.52, 27.41], [20.28, 26.75]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="1.05" stroke="none" />
      ))}
      <path d="M10.2 12.6 Q16 7.2 21.8 12.6" fill="none" strokeWidth="2" strokeLinecap="round" />
      <path d="M12.8 15.7 Q16 12.7 19.2 15.7" fill="none" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="18.7" r="1.5" stroke="none" />
    </svg>
  );
}

/**
 * The iPhone Duo keeps everything you reach for in a rail down the right edge, on the cover screen and the inner one
 * alike: the camera, the clock, the status circle, then the dock and search at home, or the way back out of an app.
 */
function DuoRail({ current, onHome, open }: { current: AppDef | null; onHome: () => void; open: (id: AppId) => void }) {
  const minutes = useGame((s) => Math.floor(s.minutes));
  const powered = useGame(isPowered);
  return (
    <div className={`duo-rail ${current ? 'dark' : ''}`}>
      <span className="duo-cam" />
      <span className="duo-time">{formatClock(minutes).replace(/ (AM|PM)/, '')}</span>
      <DuoStatus powered={powered} />
      {current ? (
        <button className="duo-btn" onClick={onHome} aria-label="Back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      ) : (
        <>
          <div className="duo-dock">
            {DOCK_APPS.map((id) => (
              <AppIcon key={id} app={APPS[id]} onClick={() => open(id)} />
            ))}
          </div>
          <button className="duo-btn duo-search" onClick={() => open('store')} aria-label="Find apps">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="M15.5 15.5L21 21" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}

function AppIcon({ app, onClick }: { app: AppDef; onClick: () => void }) {
  const unread = useSocial(unreadCount) + useGroups(groupUnread);
  const badge = app.id === 'messages' && unread > 0 ? unread : 0;
  const isNew = useApps((s) => s.fresh.includes(app.id));
  return (
    <button className="app-icon" onClick={() => { if (isNew) useApps.getState().markSeen(app.id); onClick(); }}>
      <span style={iconStyle(app)}><Emoji char={app.icon} size={32} /></span>
      {badge > 0 && <i className="app-badge">{badge > 99 ? '99+' : badge}</i>}
      {isNew && badge === 0 && <i className="app-badge new">NEW</i>}
      <em>{app.label}</em>
    </button>
  );
}

export function Phone() {
  const panel = useGame((s) => s.panel);
  const setPanel = useGame((s) => s.setPanel);
  const [app, setApp] = useState<AppId | null>(null);
  const openBankApp = useGame((s) => s.openBankApp);

  const device = useGame((s) => PHONE_BY_ID[s.phone] ?? PHONE_BY_ID.tecno_spark);
  // Something asked for a chat (name tag, bank): open the phone on Messages.
  const openWith = useSocial((s) => s.openWith);
  useEffect(() => {
    if (!openWith) return;
    setApp('messages');
    if (useGame.getState().panel !== 'phone') setPanel('phone');
  }, [openWith, setPanel]);
  useEffect(() => {
    if (!openBankApp) return;
    setApp('bank');
    useGame.setState({ openBankApp: false });
  }, [openBankApp]);
  const openApp = useGame((s) => s.openApp);
  useEffect(() => {
    if (!openApp) return;
    if (openApp === 'camera') openCamera();
    else if (openApp in APPS) setApp(openApp as AppId);
    useGame.setState({ openApp: null });
  }, [openApp]);
  const wantCivic = useCivic((s) => s.wantOpen);
  useEffect(() => {
    if (!wantCivic) return;
    setApp('civic');
    useCivic.setState({ wantOpen: false });
  }, [wantCivic]);
  const houseWant = useHouseNav((s) => s.want);
  useEffect(() => {
    if (houseWant) setApp('gida');
  }, [houseWant]);
  // Stay mounted briefly after closing so the phone can animate away instead of vanishing.
  const open = panel === 'phone';
  const [leaving, setLeaving] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  // Flip `leaving` during render (not in an effect) so there is no frame where the phone is unmounted before it animates away.
  if (open !== prevOpen) {
    setPrevOpen(open);
    setLeaving(!open);
  }
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(false), 340);
    return () => clearTimeout(t);
  }, [leaving]);
  if (!open && !leaving) return null;
  const current = app ? APPS[app] : null;
  const Screen = app ? SCREENS[app] : null;
  const duo = !!device.duo;
  const buttons = !duo && navOf(device) !== 'bar';
  const leave = () => (current ? setApp(null) : setPanel(null));
  const openFromHome = (id: AppId) => (id === 'closet' ? useGame.getState().setPanel('closet') : id === 'camera' ? openCamera() : id === 'ads' ? openAdsSheet() : setApp(id));
  return (
    <div className={`phone-wrap ${open ? '' : 'closing'}`} onClick={() => setPanel(null)}>
      <div className={`phone-rig ${device.fold ? 'fold' : ''} ${device.flip ? 'flip' : ''} ${duo ? 'duo' : ''}`} onClick={(e) => e.stopPropagation()}>
        <Hand part="back" />
        <button className="phone-x" onClick={() => setPanel(null)}>
          <span aria-hidden>✕</span> Put away
        </button>
        <div className={`phone os-${device.os} brand-${device.brand.toLowerCase()} m-${device.id} tier-${device.tier} ${device.bezel ? `bezel-${device.bezel}` : ''} ${duo ? 'duo' : ''}`} style={{ ['--fa' as string]: device.frame[0], ['--fb' as string]: device.frame[1] }}>
          <span className="btn-side power" />
          <span className="btn-side vol-up" />
          <span className="btn-side vol-down" />
          <div className="screen">
            <Wallpaper device={device} />
            {duo ? <DuoRail current={current} onHome={() => setApp(null)} open={openFromHome} /> : <StatusBar dark={!!current} cutout={cutoutOf(device)} />}
            {current && Screen ? (
              <div className="app" key={current.id}>
                <div className="app-head" style={{ ['--tint' as string]: current.bg[0], ['--tint-2' as string]: current.bg[1] }}>
                  <button className="app-back" onClick={() => setApp(null)} aria-label="Back">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M15 5l-7 7 7 7" />
                    </svg>
                  </button>
                  <b>{current.label}</b>
                  <span className="app-head-icon" style={iconStyle(current)}>
                    <Emoji char={current.icon} size={22} />
                  </span>
                </div>
                <div className="app-body">
                  {current.id === 'store' ? <AppStore ios={device.os === 'ios'} onOpen={(id) => setApp(id as AppId)} /> : <Screen />}
                </div>
              </div>
            ) : (
              <Home open={openFromHome} duo={duo} />
            )}
            {buttons ? (
              // Android's three buttons: Back and Home both leave the app (or put the phone away); Recents is only for show.
              <div className={`nav-buttons ${navOf(device) === 'buttons-samsung' ? 'samsung' : ''} ${current ? 'dark' : ''}`}>
                <button className="nav-back" aria-label={current ? 'Back' : 'Close phone'} onClick={leave}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
                </button>
                <button className="nav-home" aria-label={current ? 'Home' : 'Close phone'} onClick={leave}><i /></button>
                <span className="nav-recents" aria-hidden><i /><i /><i /></span>
              </div>
            ) : (
              <button className={`home-bar ${current ? 'dark' : ''}`} aria-label={current ? 'Home' : 'Close phone'} onClick={leave} />
            )}
          </div>
        </div>
        <Hand part="thumb" />
      </div>
    </div>
  );
}
