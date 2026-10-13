// Civic app, Treasury tab: how the president shares the treasury between the cities and the federal departments,
// and what each government can spend its share on. Citizens read; only the holder of an office gets the buttons.
// It is split into four chips: the allocation, the money going out, the repairs (whoever runs a city gets every open
// pothole and dark street light there, each with its fix) and, in red, the ways to abuse the office.
// The balance itself is on the Civic app's header card (TreasuryHero), which opens to show every budget.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ALLOCATION, CITY_HEAD, CITY_NAME, CIVIC_CITIES, NO_SALARIES, OFFICE_ICON, OFFICE_SHORT, OFFICES, SALARY, TREASURY, wageBill, type Allocation, type Department, type PoliticalOffice, type Salaries } from '../game/civic';
import { lampCity, LAMPS, ROADWORK } from '../game/roads';
import { naira, nairaShort } from '../game/store';
import { useCivic, type CivicHolder } from '../net/civic';
import { useOfficeBudget } from '../net/office';
import { useRoads } from '../net/roads';
import { potholeCity } from '../game/city';
import { left, useNow } from './Career';
import { Emoji } from './Icons';
import './treasury.css';

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
  const bill = wageBill(shown, (o) => !!holders[o]);
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
                <span><b>{naira(draft[o])}</b><small>a day</small></span>
                <button type="button" aria-label={`More for the ${name}`} disabled={busy || draft[o] >= options[options.length - 1]} onClick={() => step(o, 1)}>+</button>
              </div>
            ) : (
              <span className="tr-share"><b>{naira(saved[o])}</b><small>a day</small></span>
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

/** The Civic app's header card: what the federation has. Tap it open for what each government and department may spend of it. */
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
  const allocation = { ...ALLOCATION.defaults, ...data.allocation };
  const free = 100 - sum(allocation);
  return (
    <div className={`hero hero-green tr-hero ${open ? 'open' : ''}`}>
      <button type="button" className="tr-hero-top" aria-expanded={open} onClick={() => setOpen(!open)}>
        <small>Federation Treasury · Kaduna, Abuja, Lagos and Kano</small>
        <b>{naira(data.treasury)}</b>
        <small>{open ? 'What each government may spend of it right now.' : 'Tap to see every budget.'}</small>
        <i className="tr-hero-chev" aria-hidden />
      </button>
      {open && (
        <div className="tr-hero-list">
          {ALLOCATION.departments.map((d) => {
            const info = ALLOCATION.info[d];
            const isMine = mine?.department === d;
            return (
              <div key={d} className={`tr-hero-row ${isMine ? 'mine' : ''}`}>
                <Emoji char={info.icon} size={18} />
                <span className="tr-hero-what">
                  <b>{info.label}{isMine && <i>Yours</i>}{isMine && mine.low && <i className="low">Empty</i>}</b>
                  <small>{info.runBy} · {allocation[d]}%</small>
                </span>
                <em>{naira(ALLOCATION.budget(data.treasury, allocation[d]))}</em>
              </div>
            );
          })}
          {free > 0 && (
            <div className="tr-hero-row">
              <Emoji char="🏦" size={18} />
              <span className="tr-hero-what"><b>Unallocated</b><small>Stays in the treasury · {free}%</small></span>
              <em>{naira(ALLOCATION.budget(data.treasury, free))}</em>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Section = 'allocation' | 'pay' | 'out' | 'repairs' | 'danger';
/** Words only, so they all fit across a phone: just Danger carries a sign. */
const SECTIONS: { id: Section; icon?: string; label: string }[] = [
  { id: 'allocation', label: 'Allocation' },
  { id: 'pay', label: 'Pay' },
  { id: 'out', label: 'Money out' },
  { id: 'repairs', label: 'Repairs' },
  { id: 'danger', icon: '⚠️', label: 'Danger' },
];

/** `repairs` is the pothole and street light lists of the city this player runs (src/ui/Phone.tsx). */
export function TreasuryTab({ uid, repairs }: { uid: string; repairs?: ReactNode }) {
  const data = useCivic((s) => s.data);
  const busy = useCivic((s) => s.busy);
  const roadProject = useCivic((s) => s.roadProject);
  const palliative = useCivic((s) => s.palliative);
  const embezzle = useCivic((s) => s.embezzle);
  const allocate = useCivic((s) => s.allocate);
  const setSalaries = useCivic((s) => s.setSalaries);
  const openSites = useRoads((s) => s.data?.open);
  const lampsOut = useRoads((s) => s.data?.lamps);
  const now = useNow(30_000);
  const contract = useCivic((s) => s.contract);
  const pardon = useCivic((s) => s.pardon);
  const [target, setTarget] = useState('');
  const [contractor, setContractor] = useState('');
  const [prisoner, setPrisoner] = useState('');
  const [sure, setSure] = useState(false);
  const [section, setSection] = useState<Section>('allocation');
  const repairsAt = useRef<HTMLDivElement>(null);
  const toRepairs = () => repairsAt.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  useEffect(() => void useRoads.getState().refresh(), []);
  if (!data) return null;

  const p = data.policies;
  const { treasury } = data;
  // Everything a city's government does is open to whoever runs a city: the governor in Kaduna, the FCT
  // Minister in Abuja. Each fixes their own city's potholes.
  const isPres = p.president?.uid === uid;
  const myCity = CIVIC_CITIES.find((city) => p[CITY_HEAD[city]]?.uid === uid);
  const isExec = isPres || !!myCity;
  const office = OFFICES.find((o) => p[o]?.uid === uid);
  const allocation = { ...ALLOCATION.defaults, ...data.allocation };
  // Each city's government spends its own share; the president's palliatives have a share of their own.
  // The potholes of the city you run; anybody else is shown the count for the whole country.
  const potholes = openSites?.filter((site) => (myCity ? potholeCity(site) === myCity : !!potholeCity(site))).length;
  const darkLamps = lampsOut?.filter((site) => (myCity ? lampCity(site) === myCity : !!lampCity(site))).length;
  const cityBudget = myCity ? ALLOCATION.budget(treasury, allocation[myCity]) : 0;
  const palFrom = isPres || !myCity ? 'welfare' : myCity;
  const palBudget = ALLOCATION.budget(treasury, allocation[palFrom]);
  /** What whoever runs a city has left to spend, said once per row. Nobody else is shown a figure. */
  const cityLeft = myCity ? ` Budget: ${naira(cityBudget)}.` : '';

  const { palliative: pal, roadProject: project, embezzle: snake, contract: deal, pardon: mercy } = TREASURY;
  const dealWait = (data.cooldowns?.contract ?? 0) + deal.cooldownHours * HOUR - now;
  const mercyWait = (data.cooldowns?.pardon ?? 0) + mercy.cooldownHours * HOUR - now;
  const palWait = data.palliativeAt ? data.palliativeAt + pal.cooldownHours * HOUR - now : 0;
  // The server shares at most this much; under ₦500 each it refuses.
  const palLow = palBudget < 500;
  const projectLow = !!myCity && cityBudget < project.cost;
  const snakeWait = data.embezzledAt ? data.embezzledAt + snake.cooldownHours * HOUR - now : 0;
  const snakeTake = Math.min(snake.cap, Math.floor(treasury * snake.share));
  const blockLeft = data.roadBlockUntil ? data.roadBlockUntil - now : 0;

  return (
    <>
      {blockLeft > 0 && (
        <div className="civic-notice civic-error" role="status">
          <Emoji char="🚧" size={12} /> The government is “fixing” your street for another {left(blockLeft)}: slow travel and double fares.
        </div>
      )}

      <div className="tr-chips" role="tablist" aria-label="Treasury">
        {SECTIONS.filter((s) => s.id !== 'pay' || data.salariesOpen).map((s) => {
          const count = s.id === 'repairs' ? (potholes ?? 0) + (darkLamps ?? 0) : 0;
          return (
            <button key={s.id} type="button" role="tab" aria-selected={section === s.id} className={`tr-chip ${s.id === 'danger' ? 'danger' : ''} ${section === s.id ? 'on' : ''}`} onClick={() => setSection(s.id)}>
              {s.icon && <Emoji char={s.icon} size={13} />}{s.label}{count > 0 && <i>{count}</i>}
            </button>
          );
        })}
      </div>

      {section === 'allocation' && (
        <>
          <small className="muted tr-note">Set by the President: each government’s share of the treasury.</small>
          <Budget treasury={treasury} saved={allocation} canEdit={isPres} busy={busy} onSave={(next) => void allocate(next)} />
        </>
      )}

      {section === 'pay' && (
        <>
          <small className="muted tr-note">Set by the President, their own pay included. The treasury pays whoever is in office once a game day.</small>
          <PayList treasury={treasury} saved={{ ...NO_SALARIES, ...data.salaries }} paidAt={data.salariesPaidAt ?? null} holders={p} uid={uid} canEdit={isPres} busy={busy} onSave={(next) => void setSalaries(next)} />
        </>
      )}

      {section === 'out' && (
        <div className="list-card">
          <Spend
            icon="🍚"
            title="Palliatives"
            blurb={`Cash for everyone active today: you pick how much each. Budget: ${naira(palBudget)}.`}
            who="President · Governors · Minister"
            status={palWait > 0 ? `Next round in ${left(palWait)}` : palLow ? 'Budget too low' : 'Ready to share'}
            ready={palWait <= 0 && !palLow}
          >
            {isExec && (
              <div className="row-btns" role="group" aria-label="How much each person gets">
                {pal.sizes.map((size) => (
                  <button key={size} className="btn sm" disabled={busy || palWait > 0 || palBudget < size} onClick={() => void palliative(size)}>{nairaShort(size)}</button>
                ))}
              </div>
            )}
          </Spend>
          <Spend
            icon="📝"
            title="Award a contract"
            blurb={`Pay a player from the city’s budget. Everybody sees who got it.${cityLeft}`}
            who="Governors · Minister"
            status={myCity && dealWait > 0 ? `Next contract in ${left(dealWait)}` : myCity && cityBudget < deal.sizes[0] ? 'City budget too low' : `${naira(deal.sizes[0])} to ${naira(deal.sizes[deal.sizes.length - 1])}`}
            ready={!!myCity && cityBudget >= deal.sizes[0] && dealWait <= 0}
          >
            {myCity && (
              <>
                <input className="text-input" aria-label="Contractor's username" value={contractor} placeholder={`@contractor in ${CITY_NAME[myCity]}`} onChange={(e) => setContractor(e.target.value)} />
                <div className="row-btns">
                  {deal.sizes.map((size) => (
                    <button key={size} className="btn sm" disabled={busy || dealWait > 0 || cityBudget < size || !contractor.trim()} onClick={() => void contract(contractor.trim(), size)}>{naira(size)}</button>
                  ))}
                </div>
              </>
            )}
          </Spend>
          <Spend
            icon="🕊️"
            title="Grant a pardon"
            blurb="Free somebody from their cell. Everybody is told."
            who="President · Governors · Minister"
            status={isExec && mercyWait > 0 ? `Next pardon in ${left(mercyWait)}` : 'Prerogative of mercy'}
            ready={!(isExec && mercyWait > 0)}
          >
            {isExec && (
              <form className="road-form" onSubmit={(e) => { e.preventDefault(); if (prisoner.trim()) void pardon(prisoner.trim()); }}>
                <input className="text-input" aria-label="Prisoner's username" value={prisoner} placeholder="@prisoner's username" onChange={(e) => setPrisoner(e.target.value)} />
                <button className="btn sm" disabled={busy || mercyWait > 0 || !prisoner.trim()}>Pardon</button>
              </form>
            )}
          </Spend>
        </div>
      )}

      {section === 'repairs' && (
        <>
          <div className="list-card">
            <Spend
              icon="🕳️"
              title="Pothole repairs"
              blurb={`${naira(Math.min(...FIX_COSTS))} to ${naira(Math.max(...FIX_COSTS))} each.${cityLeft}`}
              who="Governors · Minister"
              status={potholes === undefined ? 'Counting…' : potholes ? `${potholes} open` : 'Roads are smooth'}
              ready={potholes === 0}
            >
              {!!myCity && !!potholes && <button className="btn sm" onClick={toRepairs}>Fix potholes ↓</button>}
            </Spend>
            <Spend
              icon="💡"
              title="Street light repairs"
              blurb={`${naira(LAMPS.fixCost)} each.${cityLeft}`}
              who="Governors · Minister"
              status={darkLamps === undefined ? 'Counting…' : darkLamps ? `${darkLamps} out` : 'All lights working'}
              ready={darkLamps === 0}
            >
              {!!myCity && !!darkLamps && <button className="btn sm" onClick={toRepairs}>Fix lights ↓</button>}
            </Spend>
          </div>
          {repairs && <div ref={repairsAt} className="tr-repairs">{repairs}</div>}
        </>
      )}

      {section === 'danger' && (
        <>
          <small className="tr-note tr-warn">Abuse of office. Everybody hears about it, and the EFCC is watching.</small>
          <div className="list-card tr-danger">
            <Spend
              shady
              icon="🚧"
              title="Road project"
              blurb={`Dig up a rival’s street: slow travel and double fares for ${project.hours} hours.`}
              who="Governors · Minister"
              status={projectLow ? 'City budget too low' : `${naira(project.cost)} a street`}
            >
              {myCity && (
                <form className="road-form" onSubmit={(e) => { e.preventDefault(); if (target.trim()) void roadProject(target.trim()); }}>
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
                blurb={`Take ${naira(snakeTake)} quietly. If caught: out of office, ${naira(snake.fine)} fine and jail.`}
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
          </div>
        </>
      )}
    </>
  );
}
