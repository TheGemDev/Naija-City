// INEC, the Independent National Electoral Commission: election fraud, in the open. Every fake-votes case on anyone, open
// ones first and then the whole history, for every player to read (net/inec.ts), with the voter accounts each case
// accuses of being the candidate's clones or fakes. Who filed a case is never shown. You report a candidate here too,
// and answer a case filed on you; the EFCC still investigates and judges them (worker/efcc.ts settleElection).

import { useEffect, useState, type FormEvent } from 'react';
import { EFCC, ELECTION_FRAUD, VOTE_FLAGS, efccTimeLeft, voteTied, type InecCase } from '../game/efcc';
import { DISQUALIFY_REASON, OFFICE_RULES, type PoliticalOffice } from '../game/civic';
import { naira } from '../game/store';
import { useEfcc, loadEfcc, fileEfccCase } from '../net/efcc';
import { useInec, loadInec, loadMoreInec } from '../net/inec';
import { searchPlayers, type PlayerRef } from '../net/social';
import { useSession } from '../net/session';
import { useCivic } from '../net/civic';
import { CaseCard } from './Efcc';
import { Face } from './Face';
import { Emoji } from './Icons';
import './laws.css';

const dateLabel = (at: number) => new Date(at).toLocaleString();

/** "just now", "5m ago", "3h ago", "2d ago". */
const ago = (at: number, now: number) => {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
};

const STATUS: Record<InecCase['status'], { icon: string; label: string }> = {
  investigating: { icon: '⏳', label: 'Open' },
  convicted: { icon: '🔒', label: 'Convicted' },
  cleared: { icon: '✅', label: 'Cleared' },
  dropped: { icon: '📁', label: 'Dropped' },
};

type Tab = 'cases' | 'mine' | 'report' | 'rules';

const raceOf = (office: string | null) => (office ? OFFICE_RULES[office as PoliticalOffice]?.title ?? null : null);

/** One case as everyone sees it: the candidate, the race, the vote count and the accounts accused of faking their votes. */
function PublicCase({ item, now, me }: { item: InecCase; now: number; me: boolean }) {
  const race = raceOf(item.office);
  const status = STATUS[item.status];
  const pending = item.status === 'investigating';
  const open = pending && now < item.resolvesAt;
  return (
    <article className={`efcc-case ${item.status}`}>
      <div className="efcc-case-head">
        <Face uid={item.targetUid} username={item.target} size="lg" />
        <div>
          <b>@{item.target}{me && <em>You</em>}</b>
          <small>🗳️ {race ? `${race} race` : 'Election'}</small>
          <small title={dateLabel(item.filedAt)}>Reported {ago(item.filedAt, now)}{item.resolvedAt ? ` · decided ${ago(item.resolvedAt, now)}` : ''}</small>
        </div>
        <span className={`efcc-status ${item.status}`}><i aria-hidden>{status.icon}</i>{status.label}</span>
      </div>
      {pending && (
        <div className="efcc-timer">
          <div><i style={{ width: `${open ? Math.min(100, ((item.resolvesAt - now) / EFCC.investigationMs) * 100) : 0}%` }} /></div>
          <b>{open ? `⏱ ${efccTimeLeft(item.resolvesAt - now)}` : '⚖️ Verdict due'}</b>
        </div>
      )}
      {item.status === 'dropped' ? (
        <div className="efcc-verdict"><span>📁 The EFCC dropped the case</span></div>
      ) : (
        <div className="inec-evidence">
          <span><b>{item.votes}</b><small>votes</small></span>
          <span className={item.fake ? 'bad' : ''}><b>{item.fake}</b><small>fake</small></span>
          <span className={item.traced ? 'bad' : ''}><b>{item.traced}</b><small>traced to them</small></span>
        </div>
      )}
      {item.status === 'convicted' && (
        <div className="efcc-verdict bad"><span>⚖️ Out of the race · {naira(item.fine ?? 0)} fine · jailed</span></div>
      )}
      {item.status === 'cleared' && (
        <div className="efcc-verdict good"><span>{item.fake ? '✅ Not traced to the candidate' : '✅ Votes look genuine'}</span></div>
      )}
      {item.accused.length > 0 && (
        <details className="efcc-audit">
          <summary>
            <span><b>🚩 {item.fake} account{item.fake === 1 ? '' : 's'} accused</b><b className="bad">{item.status === 'investigating' ? 'Under audit' : 'Votes struck'}</b></span>
          </summary>
          {item.accused.map((voter) => (
            <div className={`efcc-income inec-voter flagged${voter.struck ? ' struck' : ''}`} key={voter.uid}>
              <Face uid={voter.uid} username={voter.username} size="sm" />
              <span>
                <b>@{voter.username}</b>
                <small>{voter.struck ? 'Vote struck · ' : ''}{voter.flags.map((f) => VOTE_FLAGS[f].label).join(' · ')}</small>
              </span>
              <em>{voteTied(voter.flags) ? 'Candidate’s' : 'Fake'}</em>
            </div>
          ))}
          {item.fake > item.accused.length && <small className="efcc-note">+{item.fake - item.accused.length} more</small>}
        </details>
      )}
    </article>
  );
}

/** INEC's rules, printed like the EFCC charge sheet: how a fake-votes report works and what a conviction costs. */
function RulesReceipt() {
  const line = (title: string, value: string) => (
    <div className="law-line" key={title}><span>{title}</span><i /><b>{value}</b></div>
  );
  return (
    <div className="law-receipt" aria-label="INEC rules">
      <div className="law-receipt-head">
        <b>INEC ELECTORAL OFFENCES</b>
        <small>Independent National Electoral Commission</small>
      </div>
      <div className="law-section">
        <div className="law-signer"><span>Fake votes</span><span>Report a candidate</span></div>
        {line('Filing a report', naira(EFCC.filingFee))}
        {line('Votes audited', 'every vote they have in the race')}
        {line('Report until', `${ELECTION_FRAUD.reportAfterMs / 3_600_000}h after the result`)}
        {line('Investigated by', 'the EFCC')}
        {line('Time to respond', `${EFCC.investigationMs / 1000}s`)}
        {line('Every fake vote', 'struck off')}
        {line('Convicted at', `${Math.round(ELECTION_FRAUD.flaggedShare * 100)}%, or ${ELECTION_FRAUD.flaggedFloor} votes, traced to them`)}
        {line('Traced to them', 'their phone, voters they paid, new accounts on their network')}
        {line('Paid voter', 'paid by them in the 12 game hours before voting')}
        {line('Several accounts on one phone', 'struck, never held against the candidate')}
        {line('Sentence', 'out of the race or unseated, fined, jailed')}
        {line('Disqualified', 'that election only, free to run in the next')}
        {line('Struck votes change the winner', 'the seat moves')}
      </div>
      <small className="law-foot">Every case is public: the candidate, the race and the accounts behind the fake votes. Who reported it is not shown here.</small>
    </div>
  );
}

export function InecApp() {
  const user = useSession((s) => s.user);
  const [tab, setTab] = useState<Tab>('cases');
  const { open, decided, next, loading, error } = useInec();
  const { cases, busy, error: efccError } = useEfcc();
  // My own election cases (filed by me or on me): answered here, with the EFCC's case card.
  const mine = cases.filter((item) => item.kind === 'election');
  const races = useCivic((s) => s.data?.races);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PlayerRef[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void loadInec();
    void loadEfcc();
    const refresh = window.setInterval(() => {
      void loadInec();
      void loadEfcc();
    }, 15_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    const term = query.trim().replace(/^@/, '');
    if (!term) {
      setFound([]);
      setSearchError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      void searchPlayers(term)
        .then(setFound)
        .catch((e: unknown) => setSearchError(e instanceof Error ? e.message : 'Player search failed'))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  // The candidates to pick from come with the Civic snapshot; fetch it if Civic hasn't been opened yet.
  useEffect(() => {
    if (tab === 'report' && !useCivic.getState().data) void useCivic.getState().refresh();
  }, [tab]);

  if (!user) return <div className="efcc-empty"><span>🗳️</span><b>INEC</b><small>Sign in to see election cases</small></div>;

  // The search runs as you type (effect above); Enter just must not reload the page.
  const submitSearch = (event: FormEvent) => event.preventDefault();

  const reportVotes = (username: string) => {
    if (!confirm(`Report @${username} for fake votes? This costs ${naira(EFCC.filingFee)}. The EFCC audits every vote they have in their race.`)) return;
    void (async () => {
      if (!(await fileEfccCase(username, 'election'))) return;
      setQuery('');
      setTab('mine');
      void loadInec();
    })();
  };

  const running = (Object.entries(races ?? {}) as [PoliticalOffice, NonNullable<typeof races>[PoliticalOffice]][])
    .flatMap(([office, race]) => (race?.candidates ?? []).map((c) => ({ ...c, office })))
    .filter((c) => c.uid !== user.uid && c.username);
  // Thrown out already: listed struck through, with nothing left to report.
  const thrownOut = (Object.entries(races ?? {}) as [PoliticalOffice, NonNullable<typeof races>[PoliticalOffice]][])
    .flatMap(([office, race]) => (race?.disqualified ?? []).map((d) => ({ ...d, office })));
  const answering = mine.filter((item) => item.status === 'investigating' && item.targetUid === user.uid).length;

  return (
    <div className="efcc-app inec-app">
      <div className="efcc-hero">
        <span className="efcc-badge" aria-hidden><Emoji char="🗳️" size={28} /></span>
        <div className="efcc-hero-title"><b>INEC</b><small>Independent National Electoral Commission</small></div>
        <div className="efcc-stats">
          <span><b>⏳ {open.length}</b><small>open</small></span>
          <span><b>⚖️ {decided.length}{next ? '+' : ''}</b><small>decided</small></span>
          <span><b>👤 {mine.length}</b><small>yours</small></span>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'cases' ? 'on' : ''} onClick={() => setTab('cases')}><Emoji char="🗳️" size={14} /> Cases</button>
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}><Emoji char="👤" size={14} /> Yours{answering ? ` · ${answering}` : ''}</button>
        <button className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}><Emoji char="⚖️" size={14} /> Report</button>
        <button className={tab === 'rules' ? 'on' : ''} onClick={() => setTab('rules')}><Emoji char="📜" size={14} /> Rules</button>
      </div>
      {(error || efccError) && <small className="efcc-error">⚠️ {error ?? efccError}</small>}

      {tab === 'cases' && (
        <>
          <h4 className="inec-head">Open cases<b>{open.length}</b></h4>
          {loading && !open.length && !decided.length && <p className="efcc-note">Loading…</p>}
          {!loading && !open.length && <small className="efcc-note">No candidate is under investigation right now.</small>}
          {open.map((item) => <PublicCase key={item.id} item={item} now={now} me={item.targetUid === user.uid} />)}
          <h4 className="inec-head"><Emoji char="🗂️" size={14} /> History</h4>
          {!loading && !decided.length && <small className="efcc-note">No election case has been decided yet.</small>}
          {decided.map((item) => <PublicCase key={item.id} item={item} now={now} me={item.targetUid === user.uid} />)}
          {next && <button className="ghost-btn" disabled={loading} onClick={() => void loadMoreInec()}>{loading ? 'Loading…' : 'Show more'}</button>}
        </>
      )}

      {tab === 'mine' && (
        <>
          {!mine.length && (
            <div className="list-card civic-empty">
              <span><Emoji char="🗳️" size={28} /></span>
              <b>No cases of yours</b>
              <small className="muted">Fake-votes reports you file, or that are filed on your campaign, show here. Answer one on you before time runs out.</small>
              <button className="ghost-btn" onClick={() => setTab('report')}>Report a candidate</button>
            </div>
          )}
          {mine.map((item) => <CaseCard key={item.id} item={item} now={now} />)}
        </>
      )}

      {tab === 'report' && (
        <>
          {!query.trim() && (running.length ? running.map((c) => (
            <div className="efcc-row" key={`${c.office}-${c.uid}`}>
              <Face uid={c.uid} username={c.username ?? undefined} />
              <span><b>@{c.username}</b><small>{OFFICE_RULES[c.office].title} · {c.votes} vote{c.votes === 1 ? '' : 's'}</small></span>
              <button className="btn sm danger" disabled={busy || !c.votes} onClick={() => reportVotes(c.username!)}>🗳️ Audit votes</button>
            </div>
          )) : <small className="efcc-note">Nobody is running in an election right now. To report the winner of a race that just ended, search for them below.</small>)}
          {!query.trim() && thrownOut.map((d) => (
            <div className="efcc-row inec-out" key={`${d.office}-${d.uid}`}>
              <Face uid={d.uid} username={d.username ?? d.name ?? undefined} />
              <span><b>@{d.username ?? d.name}</b><small>{OFFICE_RULES[d.office].title} · disqualified · {DISQUALIFY_REASON[d.reason]}</small></span>
            </div>
          ))}
          <form className="efcc-search" onSubmit={submitSearch}>
            <i aria-hidden>{searching ? '⏳' : '🔍'}</i>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Or find a candidate by username" aria-label="Find a player by username" />
          </form>
          {searchError && <small className="efcc-error">⚠️ {searchError}</small>}
          {found.filter((player) => player.uid !== user.uid).slice(0, 8).map((player) => (
            <div className="efcc-row" key={player.uid}>
              <Face uid={player.uid} username={player.username} look={player.look} />
              <span><b>{player.name ?? 'Naija City player'}</b><small>@{player.username ?? 'player'}</small></span>
              <button className="btn sm danger" disabled={busy} onClick={() => reportVotes(player.username ?? '')}>🗳️ Audit votes</button>
            </div>
          ))}
          {!query.trim() && (
            <small className="efcc-note">Filing costs {naira(EFCC.filingFee)}. The EFCC audits every vote the candidate has, during the race or up to {ELECTION_FRAUD.reportAfterMs / 3_600_000}h after the result. Fake votes are struck off; they are convicted only for votes traced to them: from their own phone, voters they paid, or brand-new accounts on their network. Your name is not on the public case; the candidate can pay the EFCC to find out who filed it. See Rules.</small>
          )}
        </>
      )}

      {tab === 'rules' && <RulesReceipt />}
    </div>
  );
}
