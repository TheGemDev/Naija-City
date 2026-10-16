import { useEffect, useState, type FormEvent } from 'react';
import { EFCC, EFCC_RECORD_MS, ELECTION_FRAUD, VOTE_FLAGS, voteTied, efccDirty, efccTimeLeft, type EfccCase, type EfccSeizure, type EfccStatus } from '../game/efcc';
import { OFFICE_RULES, type PoliticalOffice } from '../game/civic';
import { naira, nairaShort } from '../game/store';
import { useEfcc, loadEfcc, fileEfccCase, respondEfccCase, bribeEfccCase, buyBackEfccProperty, revealEfccAccuser } from '../net/efcc';
import { searchPlayers, type PlayerRef } from '../net/social';
import { useSession } from '../net/session';
import { useCivic } from '../net/civic';
import { Face } from './Face';
import { Emoji } from './Icons';
import './laws.css';

const dateLabel = (at: number) => new Date(at).toLocaleString();

/** "5m", "3h", "2d": short enough to sit beside a name. */
const ago = (at: number, now: number) => {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
};

const STATUS: Record<EfccStatus, { icon: string; label: string }> = {
  investigating: { icon: '⏳', label: 'Open' },
  convicted: { icon: '🔒', label: 'Convicted' },
  cleared: { icon: '✅', label: 'Cleared' },
  bribed: { icon: '🤝', label: 'Bribed' },
};

const KIND_ICON: Record<string, string> = {
  work: '💼', gig: '🛠️', sell: '🏷️', invest: '📈', property: '🏠', market_sale: '🏪', transfer_in: '💸',
  fence: '📦', theft_in: '🧤', embezzle: '🏛️', bank_heist: '🏦', scam_win: '💻',
  vice_sale: '💊', racket: '🥊', contract: '🔪', ransom: '⛓️', forgery: '📝', counterfeit: '🖨️',
  bunkering: '🛢️', pirate_ads: '📻', betting_shop: '🎰', breakout: '🔓',
  spray_in: '💃🏾', rent_in: '🔑', game_win: '🎲',
};

type Filter = 'all' | 'open' | 'convicted' | 'cleared';
const FILTERS: { id: Filter; icon: string; label: string; match: (s: EfccStatus) => boolean }[] = [
  { id: 'all', icon: '🗂️', label: 'All', match: () => true },
  { id: 'open', icon: '⏳', label: 'Open', match: (s) => s === 'investigating' },
  { id: 'convicted', icon: '🔒', label: 'Convicted', match: (s) => s === 'convicted' },
  { id: 'cleared', icon: '✅', label: 'Cleared', match: (s) => s === 'cleared' || s === 'bribed' },
];

type Tab = 'cases' | 'seized' | 'report' | 'rules';
/** What a report is for: dirty money, or a candidate's fake votes. */
type ReportKind = EfccCase['kind'];

/** One arrest or raid, written up like an exhibit list: every thing taken, what it was worth, and the total. */
function SeizureCard({ s }: { s: EfccSeizure }) {
  const held = s.items.filter((i) => !i.returnedAt);
  const total = held.reduce((n, i) => n + i.value, 0);
  return (
    <div className="law-receipt efcc-exhibits">
      <div className="law-receipt-head">
        <b>{s.title}</b>
        <small>{dateLabel(s.at)}</small>
      </div>
      <div className="law-section">
        {s.items.map((item, n) => (
          <div className={`law-line ${item.returnedAt ? 'efcc-returned' : ''}`} key={n}>
            <span><Emoji char={item.icon} size={14} /> {item.label}{item.qty > 1 ? ` ×${item.qty}` : ''}</span>
            <i />
            <b>{item.returnedAt ? 'Bought back' : item.value ? naira(item.value) : 'Seized'}</b>
          </div>
        ))}
      </div>
      <div className="law-total"><span>TAKEN</span><b>{naira(total)}</b></div>
    </div>
  );
}

/** Everything the EFCC has taken from me: what it all came to, then each arrest or raid, newest first. */
function Seized() {
  const seizures = useEfcc((s) => s.seizures);
  if (!seizures.length) {
    return (
      <div className="list-card civic-empty">
        <span><Emoji char="🗄️" size={28} /></span>
        <b>Nothing seized</b>
        <small className="muted">When the EFCC takes cash, a house, furniture, apps or stock from you, every item is listed here.</small>
      </div>
    );
  }
  const items = seizures.flatMap((s) => s.items.filter((i) => !i.returnedAt));
  const sum = (kinds: string[]) => items.filter((i) => kinds.includes(i.kind)).reduce((n, i) => n + i.value, 0);
  const things = items.filter((i) => i.kind === 'house' || i.kind === 'furniture' || i.kind === 'app' || i.kind === 'stock').reduce((n, i) => n + i.qty, 0);
  return (
    <>
      <div className="efcc-seized-sum">
        <span><b>{nairaShort(sum(['cash', 'savings', 'loot']))}</b><small>cash</small></span>
        <span><b>{nairaShort(sum(['house', 'furniture', 'stock']))}</b><small>property</small></span>
        <span><b>{nairaShort(sum(['fine']))}</b><small>fines</small></span>
        <span><b>{things}</b><small>items</small></span>
      </div>
      {seizures.map((s) => <SeizureCard key={s.event} s={s} />)}
    </>
  );
}

/** The commission's rules printed like the Civic gazette: what it costs, what gets you convicted, what you lose. */
function RulesReceipt() {
  const chair = useCivic((s) => s.data?.policies.efcc);
  const line = (title: string, value: string) => (
    <div className="law-line" key={title}><span>{title}</span><i /><b>{value}</b></div>
  );
  return (
    <div className="law-receipt" aria-label="EFCC rules">
      <div className="law-receipt-head">
        <b>EFCC CHARGE SHEET</b>
        <small>Economic and Financial Crimes Commission</small>
      </div>
      <div className="law-section">
        <div className="law-signer"><span>Chairman</span><span>{chair?.username ? `@${chair.username}` : chair?.name ?? 'Vacant'}</span></div>
        {line('Filing a case', naira(EFCC.filingFee))}
        {line('Incomes audited', `last ${EFCC.auditSize}, new since their last case`)}
        {line('Next case on the same person', `after ${EFCC.caseCooldownMs / 3_600_000}h`)}
        {line('Time to respond', `${EFCC.investigationMs / 1000}s`)}
        {line('Unmask your accuser', naira(EFCC.revealFee))}
        {line('Bribe', `${naira(EFCC.bribeAmount)} · ${Math.round(EFCC.bribeChance * 100)}% works`)}
        {line('Bribe goes to', 'the EFCC chair')}
      </div>
      <div className="law-section">
        <div className="law-signer"><span>Verdict</span><span>From the audit</span></div>
        {line('Convicted at', `${Math.round(EFCC.dirtyShare * 100)}% dirty`)}
        {line('...or flagged money of', naira(EFCC.dirtyFloor))}
        {line('Money from accounts under', `${EFCC.freshAccountMs / 86_400_000} days old: flagged`)}
        {line('Wallet and savings seized', `${EFCC.walletSeizurePercent}%`)}
        {line('Property seized', 'one, can be bought back')}
        {line('Seized money goes to', 'federal treasury')}
        {line('Big clean income', 'never evidence')}
      </div>
      <div className="law-section">
        <div className="law-signer"><span>Fake votes</span><span>Report a candidate</span></div>
        {line('Votes audited', 'every vote they have in the race')}
        {line('Report until', `${ELECTION_FRAUD.reportAfterMs / 3_600_000}h after the result`)}
        {line('Every fake vote', 'struck off')}
        {line('Convicted at', `${Math.round(ELECTION_FRAUD.flaggedShare * 100)}%, or ${ELECTION_FRAUD.flaggedFloor} votes, traced to them`)}
        {line('Traced to them', 'their phone, voters they paid, new accounts on their network')}
        {line('Paid voter', 'paid by them in the 12 game hours before voting')}
        {line('Several accounts on one phone', 'struck, never held against the candidate')}
        {line('Sentence', 'disqualified or unseated, barred, fined, jailed')}
        {line('Struck votes change the winner', 'the seat moves')}
      </div>
      <div className="law-section">
        <div className="law-signer"><span>Flagged money</span><span /></div>
        <small className="law-foot" style={{ textAlign: 'left' }}>Scams, theft, heists, fencing, embezzlement and every vice hustle: drugs, rackets, contracts, ransoms, forgery, fake notes, bunkering, pirate ads, betting shops and jailbreaks. Also money from another account played on the same phone, or from a brand-new account on the same network. Money a stranger sends you never counts against you.</small>
      </div>
      <small className="law-foot">Closed cases are struck off the record after {Math.round(EFCC_RECORD_MS / 86_400_000)} days. A seized property stays on file until it is bought back.</small>
    </div>
  );
}

export function EfccApp() {
  const user = useSession((s) => s.user);
  const [tab, setTab] = useState<Tab>('cases');
  const seizedCount = useEfcc((s) => s.seizures.length);
  const { cases, loading, busy, error } = useEfcc();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PlayerRef[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [statement, setStatement] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [reportKind, setReportKind] = useState<ReportKind>('money');
  const races = useCivic((s) => s.data?.races);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void loadEfcc();
    const refresh = window.setInterval(() => void loadEfcc(), 10_000);
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
    if (tab === 'report' && reportKind === 'election' && !useCivic.getState().data) void useCivic.getState().refresh();
  }, [tab, reportKind]);

  if (!user) return <div className="efcc-empty"><span>🕵🏾</span><b>EFCC</b><small>Sign in to use investigations</small></div>;

  // The search runs as you type (effect above); Enter just must not reload the page.
  const submitSearch = (event: FormEvent) => event.preventDefault();

  const act = (fn: () => Promise<void>) => void fn();
  const reportVotes = (username: string) => {
    if (!confirm(`Report @${username} for fake votes? This costs ${naira(EFCC.filingFee)}. The EFCC audits every vote they have in their race.`)) return;
    act(async () => {
      if (!(await fileEfccCase(username, 'election'))) return;
      setQuery('');
      setTab('cases');
    });
  };
  const caseCard = (item: EfccCase) => {
    const isTarget = item.target === user.username;
    const pending = item.status === 'investigating';
    const open = pending && now < item.resolvesAt;
    const response = statement[item.id] ?? '';
    const election = item.kind === 'election';
    const votes = item.votes ?? [];
    const flagged = election ? votes.filter((v) => v.illicit).length : item.audit.filter((entry) => entry.illicit).length;
    // Fake votes are all struck; only the ones traced to the candidate count towards convicting them.
    const tied = votes.filter((v) => voteTied(v.flags)).length;
    const dirty = election
      ? Math.round((votes.length ? tied / votes.length : 0) * 100)
      : Math.round(efccDirty(item.audit).share * 100);
    const race = election && item.office ? OFFICE_RULES[item.office as PoliticalOffice]?.title : null;
    const status = STATUS[item.status];
    return (
      <article className={`efcc-case ${item.status}`} key={item.id}>
        <div className="efcc-case-head">
          <Face uid={item.targetUid} username={item.target} size="lg" />
          <div>
            <b>@{item.target}{isTarget && <em>You</em>}</b>
            {election && <small>🗳️ Fake votes{race ? ` · ${race} race` : ''}</small>}
            <small title={dateLabel(item.filedAt)}>
              {item.accuserHidden ? '🎭 Anonymous' : <><Face uid={item.accuserUid} username={item.accuser} size="xs" />@{item.accuser}</>} · {ago(item.filedAt, now)}
            </small>
          </div>
          <span className={`efcc-status ${item.status}`}><i aria-hidden>{status.icon}</i>{status.label}</span>
        </div>
        {pending && (
          <div className="efcc-timer">
            <div><i style={{ width: `${open ? Math.min(100, ((item.resolvesAt - now) / EFCC.investigationMs) * 100) : 0}%` }} /></div>
            <b>{open ? `⏱ ${efccTimeLeft(item.resolvesAt - now)}` : '⚖️ Verdict due'}</b>
          </div>
        )}
        {item.status === 'convicted' && election && (
          <div className="efcc-verdict bad">
            <span>🗳️ {flagged} vote{flagged === 1 ? '' : 's'} struck</span>
            <span>⚖️ {naira(item.fine ?? 0)} fine · barred from running</span>
          </div>
        )}
        {item.status === 'convicted' && !election && (
          <div className="efcc-verdict bad">
            <span>💰 {naira(item.fine ?? 0)} seized</span>
            {item.seizedProperty && <span>🏠 {item.seizedProperty.boughtBack ? 'Bought back ✓' : 'Property seized'}</span>}
          </div>
        )}
        {item.status === 'cleared' && (
          <div className="efcc-verdict good">
            <span>{election ? (flagged ? '✅ Not traced to the candidate' : '✅ Votes look genuine') : '✅ Clean audit'}</span>
            {election && flagged > 0 && <span>🗳️ {flagged} fake vote{flagged === 1 ? '' : 's'} struck</span>}
          </div>
        )}
        {item.status === 'bribed' && <div className="efcc-verdict good"><span>🤝 Bribe accepted</span></div>}
        {election ? (
          <details className="efcc-audit">
            <summary>
              <span><b>🗳️ {votes.length} votes</b><b className={flagged ? 'bad' : 'good'}>{flagged ? `🚩 ${flagged} fake · ${tied} traced to them` : '✓ Nothing flagged'}</b></span>
              <span className="efcc-meter"><i style={{ width: `${dirty}%` }} /><u style={{ left: `${ELECTION_FRAUD.flaggedShare * 100}%` }} /></span>
            </summary>
            {votes.map((vote, index) => (
              <div className={`efcc-income${vote.illicit ? ' flagged' : ''}`} key={`${vote.at}-${index}`}>
                <i aria-hidden>{vote.flags.length ? VOTE_FLAGS[vote.flags[0]].icon : '🗳️'}</i>
                <span>
                  <b>{vote.flags.length ? vote.flags.map((f) => VOTE_FLAGS[f].label).join(' · ') : 'Nothing unusual'}</b>
                  <small title={dateLabel(vote.at)}>Vote {votes.length - index} · {ago(vote.at, now)}{voteTied(vote.flags) ? ' · 🚩 traced to them' : vote.illicit ? ' · 🚩 fake, not theirs' : ''}</small>
                </span>
              </div>
            ))}
          </details>
        ) : (
        <details className="efcc-audit">
          <summary>
            <span><b>🧾 {item.audit.length} incomes</b><b className={flagged ? 'bad' : 'good'}>{flagged ? `🚩 ${flagged} flagged · ${dirty}% dirty` : '✓ Nothing flagged'}</b></span>
            <span className="efcc-meter"><i style={{ width: `${dirty}%` }} /><u style={{ left: `${EFCC.dirtyShare * 100}%` }} /></span>
          </summary>
          {item.audit.length ? item.audit.map((entry, index) => (
            <div className={`efcc-income${entry.illicit ? ' flagged' : ''}`} key={`${entry.at}-${index}`}>
              <i aria-hidden>{KIND_ICON[entry.kind] ?? '💰'}</i>
              <span><b>{entry.source}</b><small title={dateLabel(entry.at)}>{ago(entry.at, now)}{entry.illicit ? ' · 🚩 flagged' : ''}</small></span>
              <strong>{naira(entry.amount)}</strong>
            </div>
          )) : <small className="efcc-note">No income on record.</small>}
        </details>
        )}
        {isTarget && item.accuserHidden && (
          <div className="efcc-row">
            <i aria-hidden>🎭</i>
            <span><b>Who filed this?</b><small>Unmask your accuser</small></span>
            <button className="btn sm" disabled={busy} onClick={() => act(() => revealEfccAccuser(item.id))}>Reveal · {naira(EFCC.revealFee)}</button>
          </div>
        )}
        {isTarget && open && (
          <div className="efcc-actions">
            <textarea
              value={response}
              maxLength={500}
              placeholder={item.statement ? '✍️ Update your statement' : '✍️ Your statement to investigators'}
              onChange={(e) => setStatement((current) => ({ ...current, [item.id]: e.target.value }))}
              aria-label="Investigation response"
            />
            <div>
              <button className="btn sm" disabled={busy || !response.trim()} onClick={() => act(() => respondEfccCase(item.id, response))}>
                {item.statement ? '📨 Update' : '📨 Send'}
              </button>
              {!item.bribeAttempted && (
                <button className="btn sm danger" disabled={busy} onClick={() => {
                  if (confirm(`Attempt a risky bribe for ${naira(EFCC.bribeAmount)}? Success is not guaranteed.`)) act(() => bribeEfccCase(item.id));
                }}>
                  🤝 Bribe {naira(EFCC.bribeAmount)} · {Math.round(EFCC.bribeChance * 100)}%
                </button>
              )}
            </div>
            {item.statement && <small className="efcc-note">✓ Statement on file</small>}
            {item.bribeAttempted && <small className={item.bribeSucceeded ? 'good' : 'bad'}>{item.bribeSucceeded ? '🤝 Bribe accepted' : '🚫 Bribe rejected'}</small>}
          </div>
        )}
        {isTarget && item.status === 'convicted' && item.seizedProperty && !item.seizedProperty.boughtBack && (
          <div className="efcc-row">
            <i aria-hidden>🏠</i>
            <span><b>{item.seizedProperty.name}</b><small>Seized · {naira(item.seizedProperty.price)}</small></span>
            <button className="btn sm" disabled={busy} onClick={() => act(() => buyBackEfccProperty(item.id))}>Buy back</button>
          </div>
        )}
      </article>
    );
  };

  const shown = cases.filter((item) => FILTERS.find((f) => f.id === filter)!.match(item.status));

  const count = (f: Filter) => cases.filter((item) => FILTERS.find((x) => x.id === f)!.match(item.status)).length;

  return (
    <div className="efcc-app">
      <div className="efcc-hero">
        <span className="efcc-badge" aria-hidden>🕵🏾</span>
        <div className="efcc-hero-title"><b>EFCC</b><small>Economic and Financial Crimes Commission</small></div>
        <div className="efcc-stats">
          <span><b>⏳ {count('open')}</b><small>open</small></span>
          <span><b>🔒 {count('convicted')}</b><small>convicted</small></span>
          <span><b>✅ {count('cleared')}</b><small>cleared</small></span>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'cases' ? 'on' : ''} onClick={() => setTab('cases')}><Emoji char="🗂️" size={14} /> Cases</button>
        <button className={tab === 'seized' ? 'on' : ''} onClick={() => setTab('seized')}><Emoji char="🗄️" size={14} /> Seized{seizedCount ? ` · ${seizedCount}` : ''}</button>
        <button className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}><Emoji char="⚖️" size={14} /> Report</button>
        <button className={tab === 'rules' ? 'on' : ''} onClick={() => setTab('rules')}><Emoji char="📜" size={14} /> Rules</button>
      </div>
      {error && <small className="efcc-error">⚠️ {error}</small>}

      {tab === 'cases' && (
        <>
          <div className="efcc-tabs">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
                <i aria-hidden>{f.icon}</i>{f.label}<b>{count(f.id)}</b>
              </button>
            ))}
          </div>
          {loading && !cases.length && <p className="efcc-note">Loading…</p>}
          {!loading && !shown.length && (
            <div className="list-card civic-empty">
              <span><Emoji char="🗂️" size={28} /></span>
              <b>{cases.length ? 'No cases of this kind' : 'No cases on record'}</b>
              <small className="muted">Investigations you file, or that are filed against you, show here.</small>
              <button className="ghost-btn" onClick={() => setTab('report')}>Report someone</button>
            </div>
          )}
          {shown.map(caseCard)}
        </>
      )}

      {tab === 'report' && (
        <>
          <div className="efcc-tabs">
            <button type="button" className={reportKind === 'money' ? 'on' : ''} onClick={() => setReportKind('money')}><i aria-hidden>💰</i>Dirty money</button>
            <button type="button" className={reportKind === 'election' ? 'on' : ''} onClick={() => setReportKind('election')}><i aria-hidden>🗳️</i>Fake votes</button>
          </div>
          {reportKind === 'election' && !query.trim() && (() => {
            const running = (Object.entries(races ?? {}) as [PoliticalOffice, NonNullable<typeof races>[PoliticalOffice]][])
              .flatMap(([office, race]) => (race?.candidates ?? []).map((c) => ({ ...c, office })))
              .filter((c) => c.uid !== user.uid && c.username);
            return running.length ? running.map((c) => (
              <div className="efcc-row" key={`${c.office}-${c.uid}`}>
                <Face uid={c.uid} username={c.username ?? undefined} />
                <span><b>@{c.username}</b><small>{OFFICE_RULES[c.office].title} · {c.votes} vote{c.votes === 1 ? '' : 's'}</small></span>
                <button className="btn sm danger" disabled={busy || !c.votes} onClick={() => reportVotes(c.username!)}>🗳️ Audit votes</button>
              </div>
            )) : <small className="efcc-note">Nobody is running in an election right now. To report the winner of a race that just ended, search for them below.</small>;
          })()}
          <form className="efcc-search" onSubmit={submitSearch}>
            <i aria-hidden>{searching ? '⏳' : '🔍'}</i>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={reportKind === 'election' ? 'Or find a candidate by username' : 'Who are you reporting?'} aria-label="Find a player by username" />
          </form>
          {searchError && <small className="efcc-error">⚠️ {searchError}</small>}
          {found.filter((player) => player.uid !== user.uid).slice(0, 8).map((player) => (
            <div className="efcc-row" key={player.uid}>
              <Face uid={player.uid} username={player.username} look={player.look} />
              <span><b>{player.name ?? 'Naija City player'}</b><small>@{player.username ?? 'player'}</small></span>
              {reportKind === 'election' ? (
                <button className="btn sm danger" disabled={busy} onClick={() => reportVotes(player.username ?? '')}>🗳️ Audit votes</button>
              ) : <button className="btn sm danger" disabled={busy} onClick={() => {
                if (confirm(`File an investigation against @${player.username}? This costs ${naira(EFCC.filingFee)} and reviews their ${EFCC.auditSize} latest verified incomes.`)) {
                  act(async () => {
                    if (!(await fileEfccCase(player.username ?? ''))) return;
                    setQuery('');
                    setTab('cases');
                  });
                }
              }}>⚖️ Accuse</button>}
            </div>
          ))}
          {!query.trim() && reportKind === 'election' && (
            <small className="efcc-note">Filing costs {naira(EFCC.filingFee)}. The EFCC audits every vote the candidate has, during the race or up to {ELECTION_FRAUD.reportAfterMs / 3_600_000}h after the result. Fake votes are struck off; they are convicted only for votes traced to them: from their own phone, voters they paid, or brand-new accounts on their network. See Rules.</small>
          )}
          {!query.trim() && reportKind === 'money' && (
            <small className="efcc-note">Filing costs {naira(EFCC.filingFee)}. The EFCC audits their last {EFCC.auditSize} incomes and gives them {EFCC.investigationMs / 1000}s to answer. See Rules for what gets someone convicted.</small>
          )}
        </>
      )}

      {tab === 'seized' && <Seized />}

      {tab === 'rules' && <RulesReceipt />}
    </div>
  );
}
