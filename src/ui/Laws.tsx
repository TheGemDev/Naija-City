// Civic app, Laws tab. Citizens read the laws as a gazette receipt: what each rate is and who set it. Only the
// holder of an office gets controls, and only for the laws that office owns. The chips pick one office at a time.

import { useState } from 'react';
import { BIZ } from '../game/career';
import { ALLOCATION, OFFICES, type Allocation, type PoliticalOffice } from '../game/civic';
import { naira, OFFICE_RULES } from '../game/store';
import { ASSET_INFO, DEFAULT_STATE_CAPS, DEFAULT_STATE_LAWS, lawText, STATE_ASSETS, STATE_CUT, STATE_LAWS, STATE_LAW_KEYS, TRANSFER_FEE_LIMITS, type StateCaps, type StateLawKey } from '../game/treasury';
import { FARE_SUBSIDY } from '../game/transport';
import { isSuspended, useCivic, type CivicSnapshot, type PolicyChange, type StateInfo } from '../net/civic';
import { Emoji } from './Icons';
import './laws.css';

interface Law {
  key: keyof PolicyChange;
  title: string;
  unit: string;
  options: number[];
  /** What the number does, in the office holder's words. */
  hint: string;
  /** Shown on the receipt when the money lands in the treasury. */
  treasury?: boolean;
  /** Names for the values of a law that is a choice, not a number (a ban is on or off). */
  labels?: Record<number, string>;
}

const BAN = { 0: 'Allowed', 1: 'Banned' };
const okadaBan = (key: 'okadaBanKaduna' | 'okadaBanAbuja' | 'okadaBanLagos' | 'okadaBanKano', city: string): Law => ({
  key, title: `Okada in ${city}`, unit: '', options: [0, 1], labels: BAN,
  hint: `Ban it and no okada carries passengers in ${city}: everybody pays keke or cab fares, and nobody rents a bike at the motor park.`,
});
/** A law's value as the gazette prints it. */
const show = (law: Law, value: number) => law.labels?.[value] ?? `${value}${law.unit}`;

const steps = ([lo, hi]: readonly [number, number], list: number[]) => list.filter((n) => n >= lo && n <= hi);

export const LAWS: Record<PoliticalOffice, Law[]> = {
  president: [
    { key: 'taxRate', title: 'Income tax', unit: '%', options: [0, 5, 10, 15, 20], hint: 'Taken from every wage and side hustle. Keke, okada, cab and helicopter fares rise by the same percentage.', treasury: true },
    { key: 'loanRate', title: 'Bank loan rate', unit: '% / week', options: [0, 5, 10, 15, 20, 30], hint: 'Interest on every bank loan, per game week.', treasury: true },
    { key: 'transferFee', title: 'Transfer fee', unit: '%', options: steps(TRANSFER_FEE_LIMITS, [0, 1, 2, 3, 5, 10]), hint: 'Charged to the sender on money sent between players.', treasury: true },
    ...STATE_LAW_KEYS.map((k): Law => ({
      key: STATE_LAWS[k].capField as keyof PolicyChange,
      title: `Max ${STATE_LAWS[k].title.toLowerCase()}`,
      unit: STATE_LAWS[k].unit,
      options: STATE_LAWS[k].capOptions,
      labels: STATE_LAWS[k].unit === '₦' ? Object.fromEntries(STATE_LAWS[k].capOptions.map((v) => [v, lawText(k, v)])) : undefined,
      hint: `The most any state may set. Lowering it cuts every state above it down. ${STATE_LAWS[k].hint}`,
    })),
    { key: 'federalCut', title: 'Federal cut', unit: '%', options: [0, 5, 10, 15, 20, 25, 30], hint: 'The share of every state’s revenue sent up to the federal treasury each hour. The states keep the rest.', treasury: true },
    { key: 'airSubsidy', title: 'Air fare subsidy', unit: '%', options: [...FARE_SUBSIDY.air.options], hint: `Taken off every airline seat at the flight desk. The federal treasury pays it, and stops paying when it falls below ${naira(FARE_SUBSIDY.reserve)}.` },
    { key: 'railSubsidy', title: 'Train fare subsidy', unit: '%', options: [...FARE_SUBSIDY.rail.options], hint: `Taken off every train ticket at the stations. The federal treasury pays it, and stops paying when it falls below ${naira(FARE_SUBSIDY.reserve)}.` },
  ],
  governor: [
    okadaBan('okadaBanKaduna', 'Kaduna'),
  ],
  minister: [
    okadaBan('okadaBanAbuja', 'Abuja'),
  ],
  lagosgov: [
    okadaBan('okadaBanLagos', 'Lagos'),
  ],
  kanogov: [
    okadaBan('okadaBanKano', 'Kano'),
  ],
  igp: [
    { key: 'patrols', title: 'Street patrols', unit: '%', options: [0, 25, 50, 75, 100], hint: 'More patrols: more thieves get caught.' },
    { key: 'jailMinutes', title: 'Jail term', unit: ' min', options: [5, 10, 15, 20, 30], hint: 'How long an arrested thief stays in a cell.' },
  ],
  efcc: [
    { key: 'finePct', title: 'Theft fine', unit: '%', options: [0, 25, 50, 100, 200], hint: 'Fine on arrest, on top of paying back what was stolen.', treasury: true },
    { key: 'reportHours', title: 'Reporting deadline', unit: 'h', options: [6, 12, 24, 48, 72], hint: 'How long victims have to report a theft.' },
    {
      key: 'caseCooldownMin', title: 'Case cooldown', unit: ' min', options: [10, 30, 60, 180, 360, 720],
      labels: { 10: '10 min', 30: '30 min', 60: '1 hour', 180: '3 hours', 360: '6 hours', 720: '12 hours' },
      hint: 'After a case on someone, how long before anybody can file another on them. 12 hours at most, 10 minutes at least.',
    },
  ],
};

/** Chip labels: the full titles are too long for one row. */
const SHORT: Record<PoliticalOffice, string> = { president: 'President', governor: 'Kaduna', minister: 'Abuja', lagosgov: 'Lagos', kanogov: 'Kano', igp: 'IGP', efcc: 'EFCC' };
const pct = (share: number) => `${+(share * 100).toFixed(1)}%`;

/** Rates no office can change. All of them are paid into the treasury. */
const FIXED: [string, string][] = [
  ['VAT on spending', pct(STATE_CUT.vat)],
  ['Land registration', pct(STATE_CUT.land)],
  ['Business registration (standard)', pct(BIZ.registrationShare)],
  ['Business move permit (standard)', naira(BIZ.moveFee)],
  ['Delivery levy (standard)', pct(BIZ.deliveryShare)],
];

/** A state's own rate as the gazette prints it: fees are a share of the standard fee, the rest plain percents. */
function stateRate(key: StateLawKey, value: number) {
  if (STATE_LAWS[key].max !== 200) return lawText(key, value);
  return value === 100 ? 'Standard' : `${value}% of standard`;
}

/** What a city's government charges and how its treasury and services stand, under its head's signature. */
function StateLines({ state, caps, full }: { state?: StateInfo; caps: StateCaps; full: boolean }) {
  const laws = { ...DEFAULT_STATE_LAWS, ...state?.laws };
  return (
    <>
      {STATE_LAW_KEYS.map((k) => (
        <div className="law-line" key={k}>
          <span>{STATE_LAWS[k].title} <Emoji char="🏛️" size={12} /></span>
          <i />
          <b>{stateRate(k, Math.min(laws[k], caps[k]))}</b>
        </div>
      ))}
      {full && state && (
        <>
          {state.payShare !== undefined && (
            <div className="law-line"><span>Governor’s pay</span><i /><b>{state.payShare}% of the maximum</b></div>
          )}
          <div className="law-line"><span>State treasury</span><i /><b>{naira(state.balance)}</b></div>
          {state.arrears > 0 && <div className="law-line"><span>Unpaid bills</span><i /><b>{naira(state.arrears)}</b></div>}
          {STATE_ASSETS.filter((a) => state.assets[a]).map((a) => (
            <div className="law-line" key={a}>
              <span><Emoji char={ASSET_INFO[a].icon} size={12} /> {ASSET_INFO[a].label}</span>
              <i />
              <b>{Math.round(state.assets[a]!.condition)}% condition</b>
            </div>
          ))}
        </>
      )}
    </>
  );
}

/** The office holder's desk: one card per law they own, with the values they can pick. */
function Desk({ office, policies, busy, onSet }: { office: PoliticalOffice; policies: CivicSnapshot['policies']; busy: boolean; onSet(change: PolicyChange): void }) {
  return (
    <div className="law-desk">
      <div className="law-desk-head">
        <b>Your desk · {OFFICE_RULES[office].title}</b>
        <small>Only you can change these. Citizens see the result on the gazette.{office === 'president' ? ' The budget allocation is in the Treasury tab.' : ''}{OFFICE_RULES[office].city ? ' Contracts, upkeep and pardons are in the Treasury tab.' : ''}</small>
      </div>
      {LAWS[office].map((law) => {
        const value = policies[law.key];
        return (
          <div className="law-control" key={law.key}>
            <span><b>{law.title}</b><small>{law.hint}{law.treasury ? ' Goes to the treasury.' : ''}</small></span>
            <div className="law-options" role="group" aria-label={law.title}>
              {law.options.map((option) => (
                <button key={option} className={value === option ? 'on' : ''} aria-pressed={value === option} disabled={busy || value === option} onClick={() => onSet({ [law.key]: option })}>
                  {law.labels?.[option] ?? `${option}${law.unit.replace(/ \/.*$/, '')}`}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The laws in force, printed like a receipt: no controls, just what each setting is and who signed it. */
function Gazette({ policies, treasury, allocation, states, caps, only }: { policies: CivicSnapshot['policies']; treasury: number; allocation: Allocation; states?: CivicSnapshot['states']; caps: StateCaps; only?: PoliticalOffice }) {
  const signer = (office: PoliticalOffice) => {
    const holder = policies[office];
    return holder?.username ? `@${holder.username}` : holder?.name ?? 'Vacant';
  };
  return (
    <div className="law-receipt" aria-label="Laws in force">
      <div className="law-receipt-head">
        <b>GOVERNMENT GAZETTE</b>
        <small>{only ? `Office of the ${OFFICE_RULES[only].title}` : 'Laws and rates in force'}</small>
      </div>
      {(only ? [only] : OFFICES).map((office) => (
        <div className="law-section" key={office}>
          <div className="law-signer"><span>{OFFICE_RULES[office].title}</span><span>{signer(office)}</span></div>
          {LAWS[office].map((law) => (
            <div className="law-line" key={law.key}>
              <span>{law.title}{law.treasury ? <> <Emoji char="🏛️" size={12} /></> : null}</span>
              <i />
              <b>{show(law, policies[law.key])}</b>
            </div>
          ))}
          {OFFICE_RULES[office].city && <StateLines state={states?.[OFFICE_RULES[office].city!]} caps={caps} full={!!only} />}
        </div>
      ))}
      {(!only || only === 'president') && (
        <div className="law-section">
          <div className="law-signer"><span>Treasury allocation</span><span>{signer('president')}</span></div>
          {ALLOCATION.departments.map((d) => (
            <div className="law-line" key={d}>
              <span>{ALLOCATION.info[d].label}</span>
              <i />
              <b>{allocation[d]}% · {naira(ALLOCATION.budget(treasury, allocation[d]))}</b>
            </div>
          ))}
          <div className="law-line">
            <span>Unallocated</span>
            <i />
            <b>{100 - ALLOCATION.departments.reduce((n, d) => n + allocation[d], 0)}%</b>
          </div>
        </div>
      )}
      {only ? (
        <small className="law-foot">Only the {OFFICE_RULES[only].title} can change these.{LAWS[only].some((law) => law.treasury) ? <> <Emoji char="🏛️" size={12} /> paid into the treasury.</> : null}</small>
      ) : (
        <>
          <div className="law-section">
            <div className="law-signer"><span>Fixed by law</span><span>All to treasury</span></div>
            {FIXED.map(([title, value]) => (
              <div className="law-line" key={title}><span>{title} <Emoji char="🏛️" size={12} /></span><i /><b>{value}</b></div>
            ))}
          </div>
          <div className="law-total">
            <span>FEDERAL TREASURY</span>
            <b>{naira(treasury)}</b>
          </div>
          <small className="law-foot"><Emoji char="🏛️" size={12} /> paid into the treasury · fines, bail, hospital bills and EFCC fees go there too</small>
        </>
      )}
    </div>
  );
}

export function LawsTab({ uid, start }: { uid: string; start?: PoliticalOffice }) {
  const data = useCivic((s) => s.data);
  const busy = useCivic((s) => s.busy);
  const setPolicy = useCivic((s) => s.setPolicy);
  // A state's laws are signed by whoever runs it: its head, or the president while that head is impeached.
  const holds = (office: PoliticalOffice) => {
    const holder = data?.policies[office];
    if (!uid || !holder) return false;
    if (!OFFICE_RULES[office].city) return holder.uid === uid;
    return isSuspended(holder) ? data?.policies.president?.uid === uid : holder.uid === uid;
  };
  // An office holder lands on their own desk, even when the board loads a moment after the tab opens. Until you pick another tab, yours is the one shown.
  const [picked, setView] = useState<'all' | PoliticalOffice | null>(start ?? null);
  const view: 'all' | PoliticalOffice = picked ?? OFFICES.find(holds) ?? 'all';
  if (!data) return null;
  return (
    <>
      <div className="law-tabs" role="group" aria-label="Pick an office">
        <button type="button" className={view === 'all' ? 'on' : ''} aria-pressed={view === 'all'} onClick={() => setView('all')}>All</button>
        {OFFICES.map((office) => (
          <button key={office} type="button" className={`${view === office ? 'on' : ''} ${holds(office) ? 'mine' : ''}`} aria-pressed={view === office} onClick={() => setView(office)}>
            {SHORT[office]}
          </button>
        ))}
      </div>
      {view !== 'all' && holds(view) ? (
        <Desk office={view} policies={data.policies} busy={busy} onSet={(change) => void setPolicy(change)} />
      ) : (
        <Gazette policies={data.policies} treasury={data.treasury} allocation={{ ...ALLOCATION.defaults, ...data.allocation }} states={data.states} caps={{ ...DEFAULT_STATE_CAPS, ...data.caps }} only={view === 'all' ? undefined : view} />
      )}
    </>
  );
}
