// The secretariat's election desk (the State Secretariat in Kaduna, the Federal Secretariat in Abuja): a sheet listing every post, who holds it, who is running, and
// a button to run (or vote). Opens from the floating button or the building's activity list. The same board is in the phone's
// Civic app, and you can file to run from either. While the polls are open (one hour every evening:
// game/civic.ts) it is also the polling unit, and opens from the Vote pill in the top bar wherever you are.

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { banLeft, BALLOT_SIZE, CAMPAIGN_COOLDOWN_MS, CAMPAIGN_EVENTS, CHAOS, ELECTION_DURATION_MS, isElectionDay, OFFICE_ICON as ICON, OFFICE_RULES, OFFICES, POLLS_CLOSE_AT, POLLS_OPEN_AT, pollsOpen, withdrawalFee, type CampaignEvent, type PoliticalOffice } from '../game/civic';
import { naira, nairaShort, useGame } from '../game/store';
import { useVisit } from '../game/visits';
import { useCivic, type CivicCandidate } from '../net/civic';
import { useSession } from '../net/session';
import { Face } from './Face';
import { Chevron, Emoji } from './Icons';
import { LawsTab } from './Laws';
import './election.css';

/** `anywhere` is the polling unit while the polls are open: the sheet opened from the Vote pill, which stays open outside a secretariat. */
const useElection = create<{ open: boolean; anywhere: boolean }>(() => ({ open: false, anywhere: false }));
export const openElectionDesk = () => useElection.setState({ open: true, anywhere: false });
const openPollingUnit = () => useElection.setState({ open: true, anywhere: true });

const nameOf = (c: { username: string | null; name: string | null } | null) => (c ? (c.username ? `@${c.username}` : c.name ?? 'Someone') : 'Vacant');
const left = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** Whether your campaign is folded away, kept while the board is closed and reopened. */
const useCampaignFold = create<{ open: boolean }>(() => ({ open: true }));
const EVENTS = Object.keys(CAMPAIGN_EVENTS) as CampaignEvent[];

/**
 * Your own campaign in a race. A bar with your support that folds the rest away; under it the events as tabs, one shown at
 * a time with what it does and what it costs, and (until the polls open) the way out of the race.
 */
function Campaign({ office, me, voting }: { office: PoliticalOffice; me: CivicCandidate; voting: boolean }) {
  const money = useGame((s) => s.money);
  const busy = useCivic((s) => s.busy);
  const campaign = useCivic((s) => s.campaign);
  const withdraw = useCivic((s) => s.withdraw);
  const open = useCampaignFold((s) => s.open);
  const [pick, setPick] = useState<CampaignEvent>('rally');
  const [leaving, setLeaving] = useState(false);
  const def = CAMPAIGN_EVENTS[pick];
  const shady = pick === 'buyVotes';
  const cooldown = Math.max(0, me.lastActionAt + CAMPAIGN_COOLDOWN_MS - Date.now());
  const fee = withdrawalFee(office);
  return (
    <div className="ev-campaign">
      <button className="ev-camp-head" aria-expanded={open} onClick={() => useCampaignFold.setState({ open: !open })}>
        <b><Emoji char="📣" size={16} /> Your campaign</b>
        <span className="ev-meter" aria-label={`${me.support}% support`}><i style={{ width: `${me.support}%` }} /></span>
        <small>{me.support}%</small>
        <Chevron dir={open ? 'up' : 'down'} size={14} />
      </button>
      {open && (
        <div className="ev-camp-body">
          <div className="ev-picks" role="tablist">
            {EVENTS.map((ev) => (
              <button key={ev} role="tab" aria-selected={ev === pick} className={`ev-pick ${ev === pick ? 'on' : ''} ${ev === 'buyVotes' ? 'shady' : ''}`} onClick={() => setPick(ev)}>
                <Emoji char={CAMPAIGN_EVENTS[ev].icon} size={20} />
                <span>{CAMPAIGN_EVENTS[ev].label}</span>
              </button>
            ))}
          </div>
          <div className={`ev-plan ${shady ? 'shady' : ''}`}>
            <p>{def.blurb}</p>
            {shady && <span className="ev-risk"><Emoji char="🚨" size={12} /> {Math.round(CHAOS.stingChance * 100)}%+ chance of an EFCC sting</span>}
            <button className="ev-go" disabled={busy || cooldown > 0 || money < def.cost} onClick={() => void campaign(office, pick)}>
              <span>{def.label}<small>+{def.support} support</small></span>
              <b>{nairaShort(def.cost)}</b>
            </button>
            {cooldown > 0 && <small><Emoji char="⏱️" size={12} /> Next campaign event in {left(cooldown)}.</small>}
          </div>
          {!voting && !leaving && <button className="ev-leave-ask" onClick={() => setLeaving(true)}>Withdraw from the race</button>}
          {!voting && leaving && (
            <div className="ev-leave">
              <p>Withdrawing costs {naira(fee)}. Your filing fee is not refunded, and your support and billboards go.</p>
              <div>
                <button className="out" disabled={busy || money < fee} onClick={() => void withdraw(office)}>Withdraw</button>
                <button onClick={() => setLeaving(false)}>Stay in the race</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One post: who holds it, the race, the candidates and (for you) the campaign. */
function OfficeCard({ office }: { office: PoliticalOffice }) {
  const uid = useSession((s) => s.user?.uid ?? '');
  const money = useGame((s) => s.money);
  const data = useCivic((s) => s.data);
  const busy = useCivic((s) => s.busy);
  const run = useCivic((s) => s.run);
  const vote = useCivic((s) => s.vote);
  useTick();
  const rules = OFFICE_RULES[office];
  const race = data?.races[office];
  const holder = data?.policies[office] ?? null;
  const me = race?.candidates.find((c) => c.uid === uid);
  const bannedFor = (data?.bannedUntil ?? 0) - Date.now();
  const banned = bannedFor > 0;
  const elsewhere = data?.runningFor && data.runningFor !== office ? data.runningFor : null;
  // A race takes candidates all day and votes only in the polling hour, when the ballot is closed to newcomers.
  const voting = !!race && pollsOpen(race.endsAt, Date.now());
  const totalVotes = race?.totalVotes ?? 0;
  const topVotes = race ? Math.max(0, ...race.candidates.map((c) => c.votes)) : 0;
  return (
    <section className={`ev-card ev-${office}`}>
      <header className="ev-head">
        <span className="ev-icon"><Emoji char={ICON[office]} size={26} /></span>
        <span className="ev-title">
          <b>{rules.title}</b>
          <small>{rules.powers}</small>
          {/* Under the description, not beside it: next to it the chip squeezes the text into a narrow column. */}
          <span className="ev-chips">
            {voting && <span className="ev-chip live"><Emoji char="⏳" size={12} /> {left(race.endsAt - Date.now())} left to vote</span>}
            {race && !voting && <span className="ev-chip"><Emoji char="🗳️" size={12} /> Polls open in {left(race.endsAt - ELECTION_DURATION_MS - Date.now())}</span>}
            {!race && <span className="ev-chip">Election every day · polls {POLLS_OPEN_AT}</span>}
          </span>
        </span>
      </header>

      <div className="ev-holder">
        <span className="ev-avatar sm">{holder ? <Face uid={holder.uid} username={holder.username ?? holder.name} size="fill" /> : '—'}</span>
        <span>
          {holder ? <>In office: <b>{nameOf(holder)}{holder.uid === uid ? ' (you)' : ''}</b></> : <>No one in office</>}
          {holder?.termEnds ? <small> · {left(holder.termEnds - Date.now())} left</small> : null}
        </span>
      </div>

      {race && (
        <div className="ev-race">
          {race.candidates.length === 0 && <p className="muted small">No candidates yet. Be the first.</p>}
          {race.candidates.map((c, i) => {
            const share = totalVotes ? Math.round((c.votes / totalVotes) * 100) : 0;
            const leading = c.votes > 0 && c.votes === topVotes;
            return (
              <div key={c.uid} className={`ev-cand ${c.uid === uid ? 'me' : ''} ${leading ? 'lead' : ''}`}>
                <span className="ev-rank">{leading ? <Emoji char="👑" size={16} /> : i < BALLOT_SIZE ? i + 1 : '·'}</span>
                <span className="ev-avatar"><Face uid={c.uid} username={c.username ?? c.name} size="fill" /></span>
                <span className="ev-cinfo">
                  <b>{nameOf(c)}{c.uid === uid ? ' · You' : ''}</b>
                  <span className="ev-bar" aria-label={`${share}% of votes`}><i style={{ width: `${share}%` }} /></span>
                  <small>{c.votes} vote{c.votes === 1 ? '' : 's'} · <Emoji char="📣" size={12} /> {c.support}% support</small>
                </span>
                {c.uid !== uid && voting && (
                  <button className={`ev-vote ${race.myVote === c.uid ? 'done' : ''}`} disabled={busy || race.myVote === c.uid} onClick={() => void vote(office, c.uid)}>
                    {race.myVote === c.uid ? '✓ Voted' : 'Vote'}
                  </button>
                )}
              </div>
            );
          })}
          {race.running > race.candidates.length && <p className="muted small">+{race.running - race.candidates.length} more in the race</p>}
        </div>
      )}

      {!me && banned && <p className="ev-note"><Emoji char="🚫" size={14} /> You were caught buying votes. You can run again in {banLeft(bannedFor)}.</p>}
      {!me && !banned && elsewhere && <p className="ev-note">You’re already running for {OFFICE_RULES[elsewhere].title}. One post per election.</p>}
      {race && !voting && <p className="ev-note"><Emoji char="🗳️" size={14} /> Voting is from {POLLS_OPEN_AT} to {POLLS_CLOSE_AT}, Nigerian time. Until then anyone can file, and candidates campaign.</p>}
      {!me && voting && !banned && <p className="ev-note"><Emoji char="🔒" size={14} /> The ballot is closed. File after the result to run tomorrow.</p>}
      {!me && !voting && !banned && !elsewhere && (
        <button className="ev-cta" disabled={busy || money < rules.filingFee} onClick={() => void run(office)}>
          <span>{race ? 'Join the race' : `Run for ${rules.title}`}</span>
          <b>{naira(rules.filingFee)}</b>
        </button>
      )}

      {me && <Campaign office={office} me={me} voting={voting} />}
    </section>
  );
}

/** Every post, polished. */
export function ElectionBoard() {
  const loading = useCivic((s) => s.loading);
  const data = useCivic((s) => s.data);
  const error = useCivic((s) => s.error);
  return (
    <div className="ev-board">
      {error && <div className="civic-notice civic-error" role="alert">{error}</div>}
      {loading && !data && <p className="muted">Loading the election board…</p>}
      {data && OFFICES.map((office) => <OfficeCard key={office} office={office} />)}
    </div>
  );
}

/** Floating button shown while you are inside a secretariat. */
export function ElectionLauncher() {
  const here = useGame((s) => s.view === 'place' && s.insideId === 'secretariat');
  const open = useElection((s) => s.open);
  const signedIn = !!useSession((s) => s.user?.username);
  // Visiting a house from here leaves you "inside" the secretariat until you are back.
  const visiting = useVisit((s) => !!s.current);
  if (!here || visiting || open || !signedIn) return null;
  return (
    <button className="venue-bet-launch" onClick={openElectionDesk}>
      <span className="vbl-icon"><Emoji char="🗳️" size={18} /></span> Elections · run for a post
    </button>
  );
}

/**
 * The Vote pill in the top bar's stack, while the polls are open only: one tap to the polling unit from wherever you are.
 * It shows while there is a race to vote in, and says so once you have voted in all of them.
 */
export function ElectionDayPill() {
  const signedIn = !!useSession((s) => s.user?.username);
  const uid = useSession((s) => s.user?.uid ?? '');
  const refresh = useCivic((s) => s.refresh);
  const races = useCivic((s) => s.data?.races);
  useTick(60_000);
  const today = isElectionDay(Date.now());
  useEffect(() => {
    if (!today || !signedIn) return;
    void refresh();
    const id = setInterval(() => void refresh(), 5 * 60_000);
    return () => clearInterval(id);
  }, [today, signedIn, refresh]);
  if (!today || !signedIn) return null;
  const polls = Object.values(races ?? {}).filter((race) => pollsOpen(race.endsAt, Date.now()));
  if (!polls.length) return null;
  // A race you are alone in, or have voted in, needs nothing more from you.
  const waiting = polls.filter((race) => !race.myVote && race.candidates.some((c) => c.uid !== uid)).length;
  return (
    <button type="button" className={`hud-card election-pill ${waiting ? 'waiting' : ''}`} onClick={openPollingUnit}>
      <Emoji char="🗳️" size={18} />
      <span>
        <b>Polls are open</b>
        <small>{waiting ? `Vote now · ${waiting} race${waiting === 1 ? '' : 's'} waiting` : `You have voted · results at ${POLLS_CLOSE_AT}`}</small>
      </span>
    </button>
  );
}

export function ElectionSheet() {
  const open = useElection((s) => s.open);
  const anywhere = useElection((s) => s.anywhere);
  const here = useGame((s) => s.view === 'place' && s.insideId === 'secretariat');
  const city = useGame((s) => s.destinationId);
  const refresh = useCivic((s) => s.refresh);
  const data = useCivic((s) => s.data);
  const loading = useCivic((s) => s.loading);
  const error = useCivic((s) => s.error);
  const uid = useSession((s) => s.user?.uid ?? '');
  const [tab, setTab] = useState<'posts' | 'laws'>('posts');

  useEffect(() => {
    if (!open) return;
    setTab('posts');
    void refresh();
    const id = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(id);
  }, [open, refresh]);
  // Walking out closes the desk. The polling unit is wherever you are.
  useEffect(() => {
    if (!here && !anywhere) useElection.setState({ open: false });
  }, [here, anywhere]);
  if (!open) return null;
  const close = () => useElection.setState({ open: false });
  return (
    <div className="story-overlay" onClick={close}>
      <section
        className="story-card ev-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="election-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ev-sheet-head">
          <button className="x venue-bet-close" onClick={close} aria-label="Close">✕</button>
          <small>{here ? `${city === 'abuja' ? 'FEDERAL' : 'STATE'} SECRETARIAT · ELECTION DESK` : 'POLLS OPEN · POLLING UNIT'}</small>
          <h2 id="election-title"><Emoji char={tab === 'posts' ? '🗳️' : '⚖️'} size={24} /> {tab === 'posts' ? 'Posts available' : 'Laws of the land'}</h2>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'posts'} className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}><Emoji char="🗳️" size={14} /> Posts</button>
            <button role="tab" aria-selected={tab === 'laws'} className={tab === 'laws' ? 'on' : ''} onClick={() => setTab('laws')}><Emoji char="⚖️" size={14} /> Laws</button>
          </div>
        </header>
        <div className="ev-sheet-body" key={tab}>
          {tab === 'posts' && (
            <>
              <ElectionBoard />
              <small className="muted">Anyone arrested in the last 12 hours can’t run.</small>
            </>
          )}
          {tab === 'laws' && (
            <>
              {error && <div className="civic-notice civic-error" role="alert">{error}</div>}
              {!data && <p className="muted">{loading ? 'Loading the laws…' : 'No laws on the books yet.'}</p>}
              <LawsTab uid={uid} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
