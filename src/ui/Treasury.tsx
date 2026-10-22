// Civic app, Treasury tab. Four chips: State (a state's money, its bills and how its property is holding up), Federal
// (the federal treasury, grants, the federal departments and the pay list), Spend (what an office can pay for) and Danger
// (abuse of office, in red). Citizens read; only the holder of an office gets the buttons.
// The header card (TreasuryHero) shows the federal balance and, tapped open, every state's.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ALLOCATION, CITY_HEAD, CITY_NAME, CIVIC_CITIES, IMPEACH, SCHEMES, NO_SALARIES, OFFICE_ICON, OFFICE_RULES, OFFICE_SHORT, OFFICE_STRIKES, OFFICES, SALARY, TREASURY, governorPay, wageBill, type Allocation, type CivicCity, type Department, type PoliticalOffice, type Salaries } from '../game/civic';
import { lampCity, LAMPS, ROADWORK } from '../game/roads';
import { naira, nairaShort } from '../game/store';
import { ASSET_INFO, GOV_STEPS, DEFAULT_STATE_CAPS, DEFAULT_STATE_LAWS, lawChoices, lawText, STATE_LAWS, STATE_LAW_KEYS, GOVHOUSE_SHUT, GRANT_SIZES, repairCost, REPAIR, STATE_ASSETS, UPKEEP_LEVELS, upkeepOf, type StateAsset, type StateLawKey } from '../game/treasury';
import { cityRunBy, isSuspended, useCivic, type CivicHolder, type StateInfo } from '../net/civic';
import { useOfficeBudget } from '../net/office';
import { useRoads } from '../net/roads';
import { potholeCity } from '../game/city';
import { left, useNow } from './Career';
import { Emoji } from './Icons';
import { LootCases } from './LootCases';
import { crazeOf, populationOf, type StatePeople } from '../game/npcs';
import './treasury.css';
import './laws.css';

const HOUR = 3_600_000;
const FIX_COSTS = Object.values(ROADWORK.fixCost);

/** One thing the treasury pays for: what it is, who can order it and whether it can be done right now. */
function Spend({ icon, title, blurb, who, status, ready, shady, children }: {
  icon: string;
  title: string;
  blurb: string;
  who: string;
  status: string;
  ready?: boolean;
  shady?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`tr-spend ${shady ? 'shady' : ''}`}>
      <span className="tr-spend-icon"><Emoji char={icon} size={22} /></span>
      <div className="tr-spend-body">
        <b>{title}</b>
        <small>{blurb}</small>
        <span className="tr-spend-meta"><em>{who}</em><i className={ready ? 'ready' : ''}>{status}</i></span>
        {children}
      </div>
    </div>
  );
}

/** A governor's pay is a maximum: each takes a share of it from their own state. */
const isGov = (o: PoliticalOffice) => CIVIC_CITIES.some((c) => CITY_HEAD[c] === o);

const sum = (a: Allocation) => ALLOCATION.departments.reduce((n, d) => n + a[d], 0);

/** The president's budget: each department's share of the treasury. Only the president gets the steppers. */
function Budget({ treasury, saved, canEdit, busy, onSave }: { treasury: number; saved: Allocation; canEdit: boolean; busy: boolean; onSave(next: Allocation): void }) {
  const [draft, setDraft] = useState(saved);
  // Somebody else's change (or my own, saved) replaces the draft.
  const key = ALLOCATION.departments.map((d) => saved[d]).join();
  useEffect(() => setDraft(saved), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = canEdit ? draft : saved;
  const free = 100 - sum(shown);
  const dirty = ALLOCATION.departments.some((d) => draft[d] !== saved[d]);
  const move = (d: Department, by: number) => setDraft({ ...draft, [d]: draft[d] + by });
  return (
    <div className="tr-budget">
      <div className="tr-bar" aria-hidden>
        {ALLOCATION.departments.map((d) => <i key={d} className={`dept-${d}`} style={{ width: `${shown[d]}%` }} />)}
      </div>
      {ALLOCATION.departments.map((d) => {
        const info = ALLOCATION.info[d];
        return (
          <div key={d} className="tr-dept">
            <span className={`tr-dept-dot dept-${d}`} />
            <div className="tr-dept-body">
              <b><Emoji char={info.icon} size={14} /> {info.label} <em>{info.runBy}</em></b>
              <small>{info.blurb}</small>
            </div>
            {canEdit ? (
              <div className="tr-step" role="group" aria-label={`${info.label} share`}>
                <button type="button" aria-label={`Less for ${info.label}`} disabled={busy || draft[d] <= 0} onClick={() => move(d, -ALLOCATION.step)}>−</button>
                <span><b>{draft[d]}%</b><small>{naira(ALLOCATION.budget(treasury, draft[d]))}</small></span>
                <button type="button" aria-label={`More for ${info.label}`} disabled={busy || free <= 0} onClick={() => move(d, ALLOCATION.step)}>+</button>
              </div>
            ) : (
              <span className="tr-share"><b>{saved[d]}%</b><small>{naira(ALLOCATION.budget(treasury, saved[d]))}</small></span>
            )}
          </div>
        );
      })}
      <div className="tr-dept tr-free">
        <span className="tr-dept-dot" />
        <div className="tr-dept-body"><b>Unallocated</b><small>Stays in the treasury.</small></div>
        <span className="tr-share"><b>{free}%</b><small>{naira(ALLOCATION.budget(treasury, free))}</small></span>
      </div>
      {canEdit && (
        <div className="row-btns">
          <button className="btn sm" disabled={busy || !dirty} onClick={() => onSave(draft)}>Sign the budget</button>
          <button className="ghost-btn" disabled={busy || !dirty} onClick={() => setDraft(saved)}>Reset</button>
        </div>
      )}
    </div>
  );
}

/**
 * The pay list: what each office is paid a game day. Everybody reads it; only the President gets the steppers, on
 * their own line too. An empty seat is paid nothing, and a bill the treasury cannot cover pays nobody.
 */
function PayList({ treasury, saved, paidAt, holders, uid, canEdit, busy, onSave }: {
  treasury: number;
  saved: Salaries;
  paidAt: number | null;
  holders: Record<PoliticalOffice, CivicHolder | null>;
  uid: string;
  canEdit: boolean;
  busy: boolean;
  onSave(next: Salaries): void;
}) {
  const [draft, setDraft] = useState(saved);
  const now = useNow(30_000);
  // Somebody else's change (or my own, saved) replaces the draft.
  const key = OFFICES.map((o) => saved[o]).join();
  useEffect(() => setDraft(saved), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = canEdit ? draft : saved;
  const dirty = OFFICES.some((o) => draft[o] !== saved[o]);
  // Governors are paid by their states, out of a maximum: only the federal offices come out of this treasury.
  const bill = wageBill(shown, (o) => !!holders[o] && !isGov(o));
  const { options } = SALARY;
  const step = (o: PoliticalOffice, by: number) => setDraft({ ...draft, [o]: options[Math.max(0, Math.min(options.length - 1, options.indexOf(draft[o]) + by))] });
  return (
    <div className="tr-budget tr-pay">
      {OFFICES.map((o) => {
        const holder = holders[o];
        const name = OFFICE_SHORT[o];
        return (
          <div key={o} className="tr-dept">
            <span className="tr-pay-icon"><Emoji char={OFFICE_ICON[o]} size={18} /></span>
            <div className="tr-dept-body">
              <b>{name}{holder?.uid === uid && <em className="tr-pay-you">You</em>}</b>
              <small>{holder ? `@${holder.username ?? holder.name ?? 'someone'}` : 'Empty seat'}</small>
            </div>
            {canEdit ? (
              <div className="tr-step" role="group" aria-label={`${name} pay`}>
                <button type="button" aria-label={`Less for the ${name}`} disabled={busy || draft[o] <= options[0]} onClick={() => step(o, -1)}>−</button>
                <span><b>{naira(draft[o])}</b><small>{isGov(o) ? 'max a day' : 'a day'}</small></span>
                <button type="button" aria-label={`More for the ${name}`} disabled={busy || draft[o] >= options[options.length - 1]} onClick={() => step(o, 1)}>+</button>
              </div>
            ) : (
              <span className="tr-share"><b>{naira(saved[o])}</b><small>{isGov(o) ? 'max a day' : 'a day'}</small></span>
            )}
          </div>
        );
      })}
      <div className="tr-dept tr-free">
        <span className="tr-pay-icon"><Emoji char="💼" size={18} /></span>
        <div className="tr-dept-body">
          <b>Wage bill</b>
          <small>{bill > treasury ? 'More than the treasury holds: nobody will be paid.' : !bill ? 'Nobody in office is being paid.' : paidAt ? `Last paid ${left(now - paidAt)} ago.` : 'Paid from the treasury once a game day.'}</small>
        </div>
        <span className="tr-share"><b>{naira(bill)}</b><small>a day</small></span>
      </div>
      {canEdit && (
        <>
          <small className="tr-note tr-warn"><Emoji char="📢" size={12} /> VDM reads the pay list. Pay yourself fat, or cut somebody to nothing, and he will say so.</small>
          <div className="row-btns">
            <button className="btn sm" disabled={busy || !dirty} onClick={() => onSave(draft)}>Sign the pay list</button>
            <button className="ghost-btn" disabled={busy || !dirty} onClick={() => setDraft(saved)}>Reset</button>
          </div>
        </>
      )}
    </div>
  );
}

/** The Civic app's header card: the federal treasury. Tap it open for every state's. */
export function TreasuryHero() {
  const data = useCivic((s) => s.data);
  const mine = useOfficeBudget();
  const [open, setOpen] = useState(false);
  if (!data) {
    return (
      <div className="hero hero-green">
        <small>Shared government</small>
        <b>Civic life</b>
        <small>Campaign, vote, and shape the laws together with other players.</small>
      </div>
    );
  }
  return (
    <div className={`hero hero-green tr-hero ${open ? 'open' : ''}`}>
      <button type="button" className="tr-hero-top" aria-expanded={open} onClick={() => setOpen(!open)}>
        <small>Federal treasury</small>
        <b>{naira(data.treasury)}</b>
        {/* The whole country's public money: the federal treasury and every state's together. */}
        <small className="tr-hero-own">Nigeria total · {naira(data.treasury + CIVIC_CITIES.reduce((sum, city) => sum + (data.states?.[city]?.balance ?? 0), 0))}</small>
        <small>{open ? 'Each state keeps its own money.' : 'Tap to see the states.'}</small>
        <i className="tr-hero-chev" aria-hidden />
      </button>
      {open && (
        <div className="tr-hero-list">
          {CIVIC_CITIES.map((city) => {
            const state = data.states?.[city];
            const isMine = mine?.city === city;
            return (
              <div key={city} className={`tr-hero-row ${isMine ? 'mine' : ''}`}>
                <Emoji char="🏛️" size={18} />
                <span className="tr-hero-what">
                  <b>{CITY_NAME[city]}{isMine && <i>Yours</i>}{!!state?.arrears && <i className="low">In arrears</i>}</b>
                  <small>{OFFICE_SHORT[CITY_HEAD[city]]}</small>
                </span>
                <em>{naira(state?.balance ?? 0)}</em>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const conditionTone = (n: number) => (n >= 60 ? 'good' : n >= 30 ? 'fair' : 'bad');

/** Names short enough for a property tile. */
const TILE_NAME: Partial<Record<StateAsset, string>> = { govhouse: 'Gov. House', police: 'Police', transport: 'Motor parks', schools: 'Schools', culture: 'Museum', parks: 'Parks' };

/** One thing a state owns, as a tile: how it is holding up. Tap it for what it does (and, for the governor, its controls). */
function AssetTile({ asset, condition, open, onOpen }: { asset: StateAsset; condition: number; open: boolean; onOpen(): void }) {
  const info = ASSET_INFO[asset];
  const tone = conditionTone(condition);
  return (
    <button type="button" className={`tr-tile ${tone} ${open ? 'on' : ''}`} aria-expanded={open} onClick={onOpen}>
      <Emoji char={info.icon} size={16} />
      <span>{TILE_NAME[asset] ?? info.label}</span>
      <em>{condition}%</em>
      <i className={`tr-cond ${tone}`}><u style={{ width: `${condition}%` }} /></i>
    </button>
  );
}

/** The tile that is open: what it does, and for the governor what it costs and the buttons to change that. */
function AssetDetail({ city, asset, condition, level, canEdit, busy, balance, onLevel, onRepair }: {
  city: CivicCity;
  asset: StateAsset;
  condition: number;
  level: number;
  canEdit: boolean;
  busy: boolean;
  balance: number;
  onLevel(level: number): void;
  onRepair(): void;
}) {
  const info = ASSET_INFO[asset];
  const at = UPKEEP_LEVELS.indexOf(level as (typeof UPKEEP_LEVELS)[number]);
  const cost = repairCost(asset, city);
  return (
    <div className="tr-asset">
      <small><b>{info.label}</b> · {info.effect}</small>
      {canEdit && (
        <div className="tr-asset-controls">
          <div className="tr-step" role="group" aria-label={`${info.label} upkeep`}>
            <button type="button" aria-label={`Spend less on ${info.label}`} disabled={busy || at <= 0} onClick={() => onLevel(UPKEEP_LEVELS[at - 1])}>−</button>
            <span><b>{nairaShort(upkeepOf(asset, city, level))}</b><small>an hour</small></span>
            <button type="button" aria-label={`Spend more on ${info.label}`} disabled={busy || at >= UPKEEP_LEVELS.length - 1} onClick={() => onLevel(UPKEEP_LEVELS[at + 1])}>+</button>
          </div>
          <button className="btn sm" disabled={busy || condition >= 100 || balance < cost} onClick={onRepair}>Repair +{REPAIR.condition} · {nairaShort(cost)}</button>
        </div>
      )}
    </div>
  );
}

/** Who lives in the state, how they feel about it, and who came, went and japa'd today (src/game/npcs.ts). */
function PeopleCard({ people }: { people: StatePeople }) {
  const t = people.today;
  const moved = t.movedIn - t.movedOut;
  const mood = people.mood ?? people.life;
  const craze = crazeOf(people.craze?.id);
  const feel = mood >= 70 ? '😄 Happy' : mood >= 50 ? '🙂 Managing' : mood >= 35 ? '😒 Fed up' : '😡 Angry';
  const today = [
    t.arrived && `🧳 ${t.arrived} arrived`, t.born && `🍼 ${t.born} born`, t.adopted && `👶🏾 ${t.adopted} adopted`,
    moved && `🚚 ${moved > 0 ? '+' : ''}${moved} moved`, t.japa && `✈️ ${t.japa} japa’d`, t.arrested && `🚔 ${t.arrested} arrested`,
  ].filter(Boolean) as string[];
  return (
    <div className="tr-sec">
      <h5>People<em>{feel} · life {people.life}/100</em></h5>
      <div className="tr-state-facts">
        <span><b>{populationOf(people).toLocaleString('en-NG')}</b><small>in total</small></span>
        <span><b>{people.kids.toLocaleString('en-NG')}</b><small>children</small></span>
        <span><b>{people.players.toLocaleString('en-NG')}</b><small>players</small></span>
      </div>
      {today.length > 0 && <div className="tr-pills">{today.map((x) => <span key={x}>{x}</span>)}</div>}
      {craze && (
        <small className="tr-note tr-warn"><Emoji char={craze.icon} size={12} /> {craze.label} · {left((people.craze?.until ?? 0) - Date.now())} left</small>
      )}
    </div>
  );
}

function StateCard({ city, state, canEdit, isHead, busy, onLevel, onRepair, onAsk, onLaw, onPay }: {
  city: CivicCity;
  state: StateInfo | undefined;
  canEdit: boolean;
  /** The governor of this state themselves (not the president standing in). */
  isHead: boolean;
  busy: boolean;
  onLevel(asset: StateAsset, level: number): void;
  onRepair(asset: StateAsset): void;
  onAsk(amount: number): void;
  onLaw(key: StateLawKey, step: number): void;
  onPay(step: number): void;
}) {
  const data = useCivic((s) => s.data);
  // The property tile that is open, if any.
  const [openAsset, setOpenAsset] = useState<StateAsset | null>(null);
  const caps = data?.caps ?? DEFAULT_STATE_CAPS;
  const cut = data?.policies.federalCut ?? 0;
  if (!state) return <small className="muted tr-note">No state books yet.</small>;
  const bill = STATE_ASSETS.reduce((n, a) => n + upkeepOf(a, city, state.assets[a]?.level ?? 50), 0);
  const owned = STATE_ASSETS.filter((a) => state.assets[a]);
  const avg = owned.length ? Math.round(owned.reduce((n, a) => n + state.assets[a]!.condition, 0) / owned.length) : 0;
  const open = openAsset && state.assets[openAsset] ? openAsset : null;
  return (
    <div className="tr-state">
      <div className="tr-state-money">
        <small>{CITY_NAME[city]} treasury · {OFFICE_SHORT[CITY_HEAD[city]]}</small>
        <b>{naira(state.balance)}</b>
      </div>
      {state.arrears > 0 && (
        <small className="tr-note tr-warn"><Emoji char="📉" size={12} /> {naira(state.arrears)} in arrears · spending frozen</small>
      )}
      <div className="tr-state-facts">
        <span><b>{nairaShort(bill)}</b><small>bills / hour</small></span>
        <span><b>{nairaShort(state.incoming)}</b><small>in this hour</small></span>
        <span><b>{cut}%</b><small>to federal</small></span>
      </div>
      {state.people && <PeopleCard people={state.people} />}
      {isHead && (() => {
        // What the governor is paid: their share of the president's maximum, held to a slice of the state's money.
        const max = data?.salaries?.[CITY_HEAD[city]] ?? 0;
        const share = state.payShare ?? 100;
        const wanted = Math.floor((max * share) / 100);
        const paid = governorPay(max, share, state.balance);
        return (
          <div className="tr-sec">
            <h5>Your pay<em>{naira(paid)} a day{max ? ` · max ${nairaShort(max)}` : ''}</em></h5>
            {paid < wanted && <small className="tr-note muted">The state can only spare {naira(paid)} a round.</small>}
            <div className="law-options" role="group" aria-label="Your share of the maximum pay">
              {GOV_STEPS.map((step) => (
                <button key={step} className={share === step ? 'on' : ''} aria-pressed={share === step} disabled={busy || share === step} onClick={() => onPay(step)}>{step}%</button>
              ))}
            </div>
          </div>
        );
      })()}
      <div className="tr-sec tr-laws">
        <h5>Taxes and fees</h5>
        {STATE_LAW_KEYS.map((key) => {
          const law = STATE_LAWS[key];
          const value = state.laws?.[key] ?? DEFAULT_STATE_LAWS[key];
          const cap = caps[key];
          return canEdit ? (
            <div className="law-control" key={key}>
              <span><b>{law.title}<em className="tr-max">max {lawText(key, cap)}</em></b></span>
              <div className="law-options" role="group" aria-label={law.title}>
                {lawChoices(cap).map(({ step, value: option }) => (
                  <button key={step} className={value === option ? 'on' : ''} aria-pressed={value === option} disabled={busy || value === option} onClick={() => onLaw(key, step)}>{lawText(key, option)}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="tr-law-line" key={key}><span>{law.title}</span><b>{lawText(key, value)}<em> / {lawText(key, cap)}</em></b></div>
          );
        })}
      </div>
      {owned.length > 0 && (
        <div className="tr-sec">
          <h5>Property<em className={conditionTone(avg)}>{avg}% overall</em></h5>
          <div className="tr-tiles">
            {owned.map((asset) => (
              <AssetTile key={asset} asset={asset} condition={state.assets[asset]!.condition} open={open === asset} onOpen={() => setOpenAsset(open === asset ? null : asset)} />
            ))}
          </div>
          {open && (
            <AssetDetail
              city={city} asset={open} condition={state.assets[open]!.condition} level={state.assets[open]!.level} canEdit={canEdit} busy={busy}
              balance={state.balance} onLevel={(level) => onLevel(open, level)} onRepair={() => onRepair(open)}
            />
          )}
        </div>
      )}
      {canEdit && (
        <div className="tr-sec">
          <h5>Ask the president for money</h5>
          {state.ask ? (
            <small className="muted">Waiting for an answer: {naira(state.ask.amount)}.</small>
          ) : (
            <div className="row-btns">
              {GRANT_SIZES.map((size) => <button key={size} className="btn sm" disabled={busy} onClick={() => onAsk(size)}>{nairaShort(size)}</button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The president's grants: every state's money, what it has asked for and the amounts to send. */
function Grants({ canEdit, busy }: { canEdit: boolean; busy: boolean }) {
  const data = useCivic((s) => s.data);
  const grant = useCivic((s) => s.grant);
  const decline = useCivic((s) => s.declineGrant);
  if (!data) return null;
  return (
    <div className="tr-budget">
      {CIVIC_CITIES.map((city) => {
        const state = data.states?.[city];
        return (
          <div key={city} className="tr-grant">
            <div className="tr-dept">
              <div className="tr-dept-body">
                <b>{CITY_NAME[city]}</b>
                <small>{state?.ask ? `Asks for ${naira(state.ask.amount)}` : state?.arrears ? `${naira(state.arrears)} in arrears` : 'Holds'}</small>
              </div>
              <span className="tr-share"><b>{naira(state?.balance ?? 0)}</b></span>
            </div>
            {canEdit && (
              <div className="row-btns">
                {GRANT_SIZES.map((size) => (
                  <button key={size} className="btn sm" disabled={busy || data.treasury < size} onClick={() => void grant(city, size)}>{nairaShort(size)}</button>
                ))}
                {state?.ask && <button className="ghost-btn" disabled={busy} onClick={() => void decline(city)}>Refuse</button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The president's hold over a state's government: impeach whoever runs it for a few hours, or let them back early. */
function Impeach({ city, holder, busy, wait, now }: { city: CivicCity; holder: CivicHolder; busy: boolean; wait: number; now: number }) {
  const impeach = useCivic((s) => s.impeach);
  const reinstate = useCivic((s) => s.reinstate);
  const [sure, setSure] = useState<number | null>(null);
  const until = holder.suspendedUntil ?? 0;
  const name = holder.username ? `@${holder.username}` : holder.name ?? 'the governor';
  return (
    <div className="tr-ask">
      <b>Impeach {OFFICE_SHORT[CITY_HEAD[city]]}</b>
      {until > now ? (
        <>
          <small className="muted">{name} is impeached for another {left(until - now)}. You run {CITY_NAME[city]} until then.</small>
          <div className="row-btns"><button className="btn sm" disabled={busy} onClick={() => void reinstate(city)}>Reinstate {name}</button></div>
        </>
      ) : (
        <>
          <small className="muted">Suspend {name}: no powers and no pay while you run {CITY_NAME[city]}. Everybody hears about it.{wait > 0 ? ` Next in ${left(wait)}.` : ''}</small>
          {sure ? (
            <div className="row-btns">
              <button className="btn sm danger" disabled={busy} onClick={() => { setSure(null); void impeach(city, sure); }}>Yes, impeach for {sure}h</button>
              <button className="btn sm" onClick={() => setSure(null)}>No</button>
            </div>
          ) : (
            <div className="row-btns">
              {IMPEACH.hours.map((h) => <button key={h} className="btn sm danger" disabled={busy || wait > 0} onClick={() => setSure(h)}>{h} hours</button>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** `repairs` is the pothole and street light lists of the city this player runs (src/ui/Phone.tsx). */
export function TreasuryTab({ uid, repairs }: { uid: string; repairs?: ReactNode }) {
  const data = useCivic((s) => s.data);
  const busy = useCivic((s) => s.busy);
  const roadProject = useCivic((s) => s.roadProject);
  const palliative = useCivic((s) => s.palliative);
  const embezzle = useCivic((s) => s.embezzle);
  const allocate = useCivic((s) => s.allocate);
  const setSalaries = useCivic((s) => s.setSalaries);
  const upkeep = useCivic((s) => s.upkeep);
  const repairAsset = useCivic((s) => s.repairAsset);
  const askGrant = useCivic((s) => s.askGrant);
  const stateLaw = useCivic((s) => s.stateLaw);
  const payShare = useCivic((s) => s.payShare);
  const openSites = useRoads((s) => s.data?.open);
  const lampsOut = useRoads((s) => s.data?.lamps);
  const now = useNow(30_000);
  const contract = useCivic((s) => s.contract);
  const pardon = useCivic((s) => s.pardon);
  const [target, setTarget] = useState('');
  const [contractor, setContractor] = useState('');
  const [prisoner, setPrisoner] = useState('');
  const [sure, setSure] = useState(false);
  const [sureBags, setSureBags] = useState(false);
  // The share of a palliative round the one sharing keeps (SCHEMES.divert).
  const [divert, setDivert] = useState(0);
  const scheme = useCivic((s) => s.scheme);
  const ghosts = useCivic((s) => s.ghosts);
  // Which treasury the money strip is showing: the federal one or a state's.
  const [sel, setSel] = useState<'federal' | CivicCity | null>(null);
  const repairsAt = useRef<HTMLDivElement>(null);
  const toRepairs = () => repairsAt.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  useEffect(() => void useRoads.getState().refresh(), []);
  if (!data) return null;

  const p = data.policies;
  const { treasury } = data;
  // Whoever runs a city spends that state's money: the governor in Kaduna, the FCT Minister in Abuja, and so on.
  const isPres = p.president?.uid === uid;
  const myCity = cityRunBy(p, uid);
  // A seat I hold that the president has impeached me from, for now.
  const lostCity = CIVIC_CITIES.find((city) => p[CITY_HEAD[city]]?.uid === uid && isSuspended(p[CITY_HEAD[city]], now));
  const selected: 'federal' | CivicCity = sel ?? (myCity ?? (isPres ? 'federal' : 'kaduna'));
  const shown: CivicCity = selected === 'federal' ? (myCity ?? 'kaduna') : selected;
  // A state without a government is managed by the president: its seat is empty, or its governor impeached, and the president is looking at it.
  const shownHead = p[CITY_HEAD[shown]];
  const actCity = myCity ?? (isPres && selected !== 'federal' && (!shownHead || isSuspended(shownHead, now)) ? shown : undefined);
  /** Sent with an action when the president is standing in for an empty seat. */
  const standIn = !myCity ? actCity : undefined;
  const isExec = isPres || !!myCity;
  // An impeached governor can't reach the state's money.
  const office = OFFICES.find((o) => p[o]?.uid === uid && !(OFFICE_RULES[o].city && isSuspended(p[o], now)));
  const allocation = { ...ALLOCATION.defaults, ...data.allocation };
  const potholes = openSites?.filter((site) => (actCity ? potholeCity(site) === actCity : !!potholeCity(site))).length;
  const darkLamps = lampsOut?.filter((site) => (actCity ? lampCity(site) === actCity : !!lampCity(site))).length;
  const cityBudget = actCity ? data.states?.[actCity]?.balance ?? 0 : 0;
  const frozen = !!actCity && (data.states?.[actCity]?.arrears ?? 0) > 0;
  const houseShut = !!actCity && (data.states?.[actCity]?.assets.govhouse?.condition ?? 100) < GOVHOUSE_SHUT;
  const palBudget = actCity ? cityBudget : ALLOCATION.budget(treasury, allocation.welfare);
  /** What whoever runs a city has left to spend, said once per row. Nobody else is shown a figure. */
  const cityLeft = actCity ? ` Treasury: ${naira(cityBudget)}.` : '';

  const { palliative: pal, roadProject: project, embezzle: snake, contract: deal, pardon: mercy } = TREASURY;
  const dealWait = (data.cooldowns?.contract ?? 0) + deal.cooldownHours * HOUR - now;
  const mercyWait = (data.cooldowns?.pardon ?? 0) + mercy.cooldownHours * HOUR - now;
  const impeachWait = (data.cooldowns?.impeach ?? 0) + IMPEACH.cooldownHours * HOUR - now;
  const palWait = data.palliativeAt ? data.palliativeAt + pal.cooldownHours * HOUR - now : 0;
  // The server shares at most this much; under ₦500 each it refuses.
  const palLow = palBudget < 500;
  const locked = frozen || houseShut;
  const lockWhy = houseShut ? 'Government House is in ruins' : 'State in arrears';
  const projectLow = !!actCity && (cityBudget < project.cost || locked);
  const snakePot = myCity ? (data.states?.[myCity]?.balance ?? 0) : treasury;
  const snakeWait = data.embezzledAt ? data.embezzledAt + snake.cooldownHours * HOUR - now : 0;
  const snakeTake = Math.min(snake.cap, Math.floor(snakePot * snake.share));
  const blockLeft = data.roadBlockUntil ? data.roadBlockUntil - now : 0;
  const { front, bdc, bags, ghost, divert: skim } = SCHEMES;
  const potName = myCity ? 'your state’s treasury' : 'the federal treasury';
  const waitOf = (key: 'front' | 'bdc' | 'bags') => (data.cooldowns?.[key] ?? 0) + SCHEMES[key].cooldownHours * HOUR - now;
  const frontWait = waitOf('front');
  const bdcWait = waitOf('bdc');
  const bagsWait = waitOf('bags');
  const bagsTake = Math.min(bags.cap, Math.floor(snakePot * bags.share));
  const odds = (p: number) => `${Math.round(p * 100)}%`;
  const mine = data.ghosts;

  return (
    <>
      {blockLeft > 0 && (
        <div className="civic-notice civic-error" role="status">
          <Emoji char="🚧" size={12} /> The government is “fixing” your street for another {left(blockLeft)}: slow travel and double fares.
        </div>
      )}

      {lostCity && (
        <div className="civic-notice civic-error" role="status">
          <Emoji char="⚖️" size={12} /> The president has impeached you for another {left((p[CITY_HEAD[lostCity]]?.suspendedUntil ?? 0) - now)}. No powers and no pay until then: the president runs {CITY_NAME[lostCity]}.
        </div>
      )}

      <LootCases uid={uid} />

      <div className="tr-strip" role="group" aria-label="Treasuries">
        <button type="button" className={selected === 'federal' ? 'on' : ''} aria-pressed={selected === 'federal'} onClick={() => setSel('federal')}>
          <Emoji char="🇳🇬" size={18} /><b>Federal</b>
        </button>
        {CIVIC_CITIES.map((city) => (
          <button key={city} type="button" className={selected === city ? 'on' : ''} aria-pressed={selected === city} onClick={() => setSel(city)}>
            <Emoji char="🏛️" size={18} /><b>{CITY_NAME[city]}</b>
            {!!data.states?.[city]?.arrears && <i className="tr-strip-dot" aria-label="In arrears" />}
          </button>
        ))}
      </div>

      {selected === 'federal' ? (
        <div className="tr-panel">
          <div className="tr-state">
            <div className="tr-state-money">
              <small>Federal treasury</small>
              <b>{naira(treasury)}</b>
            </div>
          </div>
          <small className="muted tr-note">{p.federalCut}% of every state’s revenue comes here, plus fees and loans.</small>
          <b className="tr-sub">Grants</b>
          <Grants canEdit={isPres} busy={busy} />
          <b className="tr-sub">Departments</b>
          <Budget treasury={treasury} saved={allocation} canEdit={isPres} busy={busy} onSave={(next) => void allocate(next)} />
          {data.salariesOpen && (
            <>
              <b className="tr-sub">Pay</b>
              <PayList treasury={treasury} saved={{ ...NO_SALARIES, ...data.salaries }} paidAt={data.salariesPaidAt ?? null} holders={p} uid={uid} canEdit={isPres} busy={busy} onSave={(next) => void setSalaries(next)} />
            </>
          )}
        </div>
      ) : (
        <StateCard
          city={shown}
          state={data.states?.[shown]}
          canEdit={actCity === shown}
          isHead={myCity === shown}
          busy={busy}
          onLevel={(asset, level) => void upkeep(asset, level, standIn)}
          onRepair={(asset) => void repairAsset(asset, standIn)}
          onAsk={(amount) => void askGrant(amount)}
          onLaw={(key, value) => void stateLaw(key, value, standIn)}
          onPay={(step) => void payShare(step)}
        />
      )}
      {isPres && selected !== 'federal' && shownHead && shownHead.uid !== uid && (
        <Impeach city={shown} holder={shownHead} busy={busy} wait={impeachWait} now={now} />
      )}

      {isExec && (
      <section className="tr-block">
        <h4>Spend</h4>
          <div className="list-card">
            <Spend
              icon="🍚"
              title="Palliatives"
              blurb={`Cash for everyone active today. ${isPres || !actCity ? 'Federal' : CITY_NAME[actCity]} budget: ${naira(palBudget)}.`}
              who="President · Governors"
              status={palWait > 0 ? `Next in ${left(palWait)}` : locked && actCity ? lockWhy : palLow ? 'Budget too low' : 'Ready'}
              ready={palWait <= 0 && !palLow && !(locked && !!actCity)}
            >
              {isExec && (
                <>
                  <div className="row-btns" role="group" aria-label="How much each person gets">
                    {pal.sizes.map((size) => (
                      <button key={size} className="btn sm" disabled={busy || palWait > 0 || palBudget < size || (locked && !!actCity)} onClick={() => void palliative(size, standIn, divert)}>{nairaShort(size)}</button>
                    ))}
                  </div>
                  {/* Diverting a share is a scheme like any other: VDM may get the warehouse video. */}
                  <div className="row-btns" role="group" aria-label="Keep a share for yourself">
                    <small className="muted">Divert to your warehouse:</small>
                    {[0, ...skim.shares].map((share) => (
                      <button key={share} className={`btn sm ${share ? 'danger' : ''} ${divert === share ? 'on' : ''}`} aria-pressed={divert === share} disabled={busy} onClick={() => setDivert(share)}>
                        {share ? `${share}% · ${odds(skim.exposed(share))} exposed` : 'None'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </Spend>
            <Spend
              icon="📝"
              title="Award a contract"
              blurb={`Pay a player from the state treasury.${cityLeft}`}
              who="Governors"
              status={actCity && locked ? lockWhy : actCity && dealWait > 0 ? `Next in ${left(dealWait)}` : actCity && cityBudget < deal.sizes[0] ? 'Treasury too low' : `${nairaShort(deal.sizes[0])} to ${nairaShort(deal.sizes[deal.sizes.length - 1])}`}
              ready={!!actCity && !locked && cityBudget >= deal.sizes[0] && dealWait <= 0}
            >
              {actCity && (
                <>
                  <input className="text-input" aria-label="Contractor's username" value={contractor} placeholder={`@contractor in ${CITY_NAME[actCity]}`} onChange={(e) => setContractor(e.target.value)} />
                  <div className="row-btns">
                    {deal.sizes.map((size) => (
                      <button key={size} className="btn sm" disabled={busy || locked || dealWait > 0 || cityBudget < size || !contractor.trim()} onClick={() => void contract(contractor.trim(), size, standIn)}>{naira(size)}</button>
                    ))}
                  </div>
                </>
              )}
            </Spend>
            <Spend
              icon="🕊️"
              title="Grant a pardon"
              blurb="Free somebody from their cell. Everybody is told."
              who="President · Governors"
              status={actCity && houseShut ? lockWhy : isExec && mercyWait > 0 ? `Next in ${left(mercyWait)}` : 'Ready'}
              ready={!(isExec && mercyWait > 0) && !(actCity && houseShut)}
            >
              {isExec && (
                <form className="road-form" onSubmit={(e) => { e.preventDefault(); if (prisoner.trim()) void pardon(prisoner.trim()); }}>
                  <input className="text-input" aria-label="Prisoner's username" value={prisoner} placeholder="@prisoner's username" onChange={(e) => setPrisoner(e.target.value)} />
                  <button className="btn sm" disabled={busy || mercyWait > 0 || !prisoner.trim() || (!!actCity && houseShut)}>Pardon</button>
                </form>
              )}
            </Spend>
          </div>
          {!!actCity && (
            <div className="list-card">
              <Spend
                icon="🕳️"
                title="Potholes"
                blurb={`${nairaShort(Math.min(...FIX_COSTS))} to ${nairaShort(Math.max(...FIX_COSTS))} each.${cityLeft}`}
                who="Governors"
                status={potholes === undefined ? 'Counting…' : potholes ? `${potholes} open` : 'Smooth'}
                ready={potholes === 0}
              >
                {!!potholes && <button className="btn sm" onClick={toRepairs}>Fix potholes ↓</button>}
              </Spend>
              <Spend
                icon="💡"
                title="Street lights"
                blurb={`${nairaShort(LAMPS.fixCost)} each.${cityLeft}`}
                who="Governors"
                status={darkLamps === undefined ? 'Counting…' : darkLamps ? `${darkLamps} out` : 'All working'}
                ready={darkLamps === 0}
              >
                {!!darkLamps && <button className="btn sm" onClick={toRepairs}>Fix lights ↓</button>}
              </Spend>
            </div>
          )}
          {repairs && <div ref={repairsAt} className="tr-repairs">{repairs}</div>}
      </section>
      )}

      {(!!office || !!actCity) && (
      <section className="tr-block danger">
        <h4>Danger</h4>
          <small className="tr-note tr-warn">Everybody hears about it. The EFCC is watching.</small>
          <div className="list-card tr-danger">
            <Spend
              shady
              icon="🚧"
              title="Road project"
              blurb={`Dig up a rival’s street: slow travel and double fares for ${project.hours} hours.`}
              who="Governors"
              status={projectLow ? (locked ? lockWhy : 'Treasury too low') : `${naira(project.cost)} a street`}
            >
              {actCity && (
                <form className="road-form" onSubmit={(e) => { e.preventDefault(); if (target.trim()) void roadProject(target.trim(), standIn); }}>
                  <input className="text-input" aria-label="Rival's username" value={target} placeholder="@rival's username" onChange={(e) => setTarget(e.target.value)} />
                  <button className="btn sm" disabled={busy || projectLow || !target.trim()}>Dig · {naira(project.cost)}</button>
                </form>
              )}
            </Spend>
            {/* Only an office holder is shown the way to steal from it. */}
            {office && (
              <Spend
                shady
                icon="🐍"
                title="Let a snake swallow some money"
                blurb={`Take ${naira(snakeTake)} from ${myCity ? 'your state’s' : 'the federal'} treasury. The EFCC chair decides: refuse and you get a ${naira(snake.fine)} fine and a strike. ${OFFICE_STRIKES} strikes and you are out of office, and in jail.`}
                who="Office holders only"
                status={snakeWait > 0 ? `Lie low for ${left(snakeWait)}` : snakeTake < 1_000 ? 'Nothing to take' : 'Nobody is looking'}
              >
                {sure ? (
                  <div className="row-btns">
                    <button className="btn sm danger" disabled={busy} onClick={() => { setSure(false); void embezzle(); }}>Yes, “borrow” it</button>
                    <button className="btn sm" onClick={() => setSure(false)}>No, I’m honest</button>
                  </div>
                ) : (
                  <button className="btn sm danger" disabled={busy || snakeWait > 0 || snakeTake < 1_000} onClick={() => setSure(true)}>Take {naira(snakeTake)}</button>
                )}
              </Spend>
            )}
            {office && (
              <Spend
                shady
                icon="📦"
                title="Front company"
                blurb={`${potName[0].toUpperCase()}${potName.slice(1)} pays one of your businesses for “supplies” that never come. The bigger the invoice, the likelier an EFCC raid: the money back, a ${naira(front.fine)} fine, and every shelf you own emptied.`}
                who="Office holders with a business"
                status={frontWait > 0 ? `Lie low for ${left(frontWait)}` : `Raid odds ${odds(front.raid(front.sizes[0]))} to ${odds(front.raid(front.sizes[front.sizes.length - 1]))}`}
              >
                <div className="row-btns">
                  {front.sizes.map((size) => (
                    <button key={size} className="btn sm danger" disabled={busy || frontWait > 0 || snakePot < size} onClick={() => void scheme('front', size)}>{nairaShort(size)} · {odds(front.raid(size))}</button>
                  ))}
                </div>
              </Spend>
            )}
            {office && (
              <Spend
                shady
                icon="💱"
                title="Mallam’s BDC"
                blurb={`Change money from ${potName} into dollars. No EFCC and no record, but Mallam keeps ${odds(bdc.fee)}, and ${odds(bdc.vanish)} of the time he vanishes with the lot.`}
                who="Office holders only"
                status={bdcWait > 0 ? `Lie low for ${left(bdcWait)}` : `You keep ${odds(1 - bdc.fee)}`}
              >
                <div className="row-btns">
                  {bdc.sizes.map((size) => (
                    <button key={size} className="btn sm danger" disabled={busy || bdcWait > 0 || snakePot < size} onClick={() => void scheme('bdc', size)}>{nairaShort(size)} → {nairaShort(Math.floor(size * (1 - bdc.fee)))}</button>
                  ))}
                </div>
              </Spend>
            )}
            {office && isExec && (
              <Spend
                shady
                icon="🧳"
                title="Ghana Must Go"
                blurb={`Fly ${naira(bagsTake)} of ${potName} out in bags on the state jet. ${odds(bags.search)} of the time customs search the plane: the bags go back, and you get a fine and a strike. ${OFFICE_STRIKES} strikes and you are out of office.`}
                who="President · Governors"
                status={bagsWait > 0 ? `Lie low for ${left(bagsWait)}` : bagsTake < 1_000 ? 'Nothing to pack' : `${odds(bags.search)} search odds`}
              >
                {sureBags ? (
                  <div className="row-btns">
                    <button className="btn sm danger" disabled={busy} onClick={() => { setSureBags(false); void scheme('bags'); }}>Yes, load the jet</button>
                    <button className="btn sm" onClick={() => setSureBags(false)}>No</button>
                  </div>
                ) : (
                  <button className="btn sm danger" disabled={busy || bagsWait > 0 || bagsTake < 1_000} onClick={() => setSureBags(true)}>Pack {naira(bagsTake)}</button>
                )}
              </Spend>
            )}
            {myCity && (
              <Spend
                shady
                icon="👻"
                title="Ghost workers"
                blurb={`Put workers nobody has met on ${CITY_NAME[myCity]}’s payroll. Every hour they pay you ${odds(ghost.share)} of the state’s money, up to ${nairaShort(ghost.cap)}. Every hour the audit odds rise: caught, it all goes back and you get a fine and a strike. ${OFFICE_STRIKES} strikes and you are out of office.`}
                who="Governors"
                status={mine ? `${mine.rounds} round${mine.rounds === 1 ? '' : 's'} · ${naira(mine.taken)} · next audit ${odds(ghost.audit(mine.rounds))}` : `First audit ${odds(ghost.audit(0))}`}
              >
                {mine ? (
                  <button className="btn sm" disabled={busy} onClick={() => void ghosts(false)}>Take them off the payroll</button>
                ) : (
                  <button className="btn sm danger" disabled={busy} onClick={() => void ghosts(true)}>Add ghost workers</button>
                )}
              </Spend>
            )}
          </div>
      </section>
      )}
    </>
  );
}
