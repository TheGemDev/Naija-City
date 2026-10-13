// Civic app, Laws tab. Citizens read the laws as a gazette receipt: what each rate is and who set it. Only the
// holder of an office gets controls, and only for the laws that office owns. The chips pick one office at a time.

import { useState } from 'react';
import { BIZ } from '../game/career';
import { ALLOCATION, OFFICES, type Allocation, type PoliticalOffice } from '../game/civic';
import { naira, OFFICE_RULES } from '../game/store';
import { STATE_CUT, TRANSFER_FEE_LIMITS } from '../game/treasury';
import { useCivic, type CivicSnapshot, type PolicyChange } from '../net/civic';
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
  ],
  governor: [
    { key: 'roadsFunding', title: 'Road funding', unit: '%', options: [0, 25, 50, 75, 100], hint: 'Less funding: potholes open more often on Kaduna’s roads.' },
    okadaBan('okadaBanKaduna', 'Kaduna'),
  ],
  minister: [
    { key: 'roadsFundingAbuja', title: 'Road funding', unit: '%', options: [0, 25, 50, 75, 100], hint: 'Less funding: potholes open more often on Abuja’s roads.' },
    okadaBan('okadaBanAbuja', 'Abuja'),
  ],
  lagosgov: [
    { key: 'roadsFundingLagos', title: 'Road funding', unit: '%', options: [0, 25, 50, 75, 100], hint: 'Less funding: potholes open more often on Lagos’s roads.' },
    okadaBan('okadaBanLagos', 'Lagos'),
  ],
  kanogov: [
    { key: 'roadsFundingKano', title: 'Road funding', unit: '%', options: [0, 25, 50, 75, 100], hint: 'Less funding: potholes open more often on Kano’s roads.' },
    okadaBan('okadaBanKano', 'Kano'),
  ],
  igp: [
    { key: 'patrols', title: 'Street patrols', unit: '%', options: [0, 25, 50, 75, 100], hint: 'More patrols: more thieves get caught.' },
    { key: 'jailMinutes', title: 'Jail term', unit: ' min', options: [5, 10, 15, 20, 30], hint: 'How long an arrested thief stays in a cell.' },
  ],
  efcc: [
    { key: 'finePct', title: 'Theft fine', unit: '%', options: [0, 25, 50, 100, 200], hint: 'Fine on arrest, on top of paying back what was stolen.', treasury: true },
    { key: 'reportHours', title: 'Reporting deadline', unit: 'h', options: [6, 12, 24, 48, 72], hint: 'How long victims have to report a theft.' },
  ],
};

/** Chip labels: the full titles are too long for one row. */
const SHORT: Record<PoliticalOffice, string> = { president: 'President', governor: 'Kaduna', minister: 'Abuja', lagosgov: 'Lagos', kanogov: 'Kano', igp: 'IGP', efcc: 'EFCC' };
const pct = (share: number) => `${+(share * 100).toFixed(1)}%`;

/** Rates no office can change. All of them are paid into the treasury. */
const FIXED: [string, string][] = [
  ['VAT on spending', pct(STATE_CUT.vat)],
  ['Land registration', pct(STATE_CUT.land)],
  ['Business registration', pct(BIZ.registrationShare)],
  ['Business move permit', naira(BIZ.moveFee)],
  ['Delivery levy', pct(BIZ.deliveryShare)],
];

/** The office holder's desk: one card per law they own, with the values they can pick. */
function Desk({ office, policies, busy, onSet }: { office: PoliticalOffice; policies: CivicSnapshot['policies']; busy: boolean; onSet(change: PolicyChange): void }) {
  return (
    <div className="law-desk">
      <div className="law-desk-head">
        <b>Your desk · {OFFICE_RULES[office].title}</b>
        <small>Only you can change these. Citizens see the result on the gazette.{office === 'president' ? ' The budget allocation is in the Treasury tab.' : ''}{OFFICE_RULES[office].city ? ' Contracts, road repairs and pardons are in the Treasury tab.' : ''}</small>
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
function Gazette({ policies, treasury, allocation, only }: { policies: CivicSnapshot['policies']; treasury: number; allocation: Allocation; only?: PoliticalOffice }) {
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
            <span>TREASURY BALANCE</span>
            <b>{naira(treasury)}</b>
          </div>
          <small className="law-foot"><Emoji char="🏛️" size={12} /> paid into the treasury · fines, bail, hospital bills and EFCC fees go there too</small>
        </>
      )}
    </div>
  );
}

export function LawsTab({ uid }: { uid: string }) {
  const data = useCivic((s) => s.data);
  const busy = useCivic((s) => s.busy);
  const setPolicy = useCivic((s) => s.setPolicy);
  const holds = (office: PoliticalOffice) => !!uid && data?.policies[office]?.uid === uid;
  // An office holder lands on their own desk.
  const [view, setView] = useState<'all' | PoliticalOffice>(() => OFFICES.find(holds) ?? 'all');
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
        <Gazette policies={data.policies} treasury={data.treasury} allocation={{ ...ALLOCATION.defaults, ...data.allocation }} only={view === 'all' ? undefined : view} />
      )}
    </>
  );
}
