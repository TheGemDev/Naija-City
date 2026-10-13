import { useEffect, useState, type FormEvent } from 'react';
import { EFCC, efccDirty, efccTimeLeft, type EfccCase, type EfccStatus } from '../game/efcc';
import { naira } from '../game/store';
import { useEfcc, loadEfcc, fileEfccCase, respondEfccCase, bribeEfccCase, buyBackEfccProperty, revealEfccAccuser } from '../net/efcc';
import { searchPlayers, type PlayerRef } from '../net/social';
import { useSession } from '../net/session';
import { Face } from './Face';

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
};

type Filter = 'all' | 'open' | 'convicted' | 'cleared';
const FILTERS: { id: Filter; icon: string; label: string; match: (s: EfccStatus) => boolean }[] = [
  { id: 'all', icon: '🗂️', label: 'All', match: () => true },
  { id: 'open', icon: '⏳', label: 'Open', match: (s) => s === 'investigating' },
  { id: 'convicted', icon: '🔒', label: 'Convicted', match: (s) => s === 'convicted' },
  { id: 'cleared', icon: '✅', label: 'Cleared', match: (s) => s === 'cleared' || s === 'bribed' },
];

export function EfccApp() {
  const user = useSession((s) => s.user);
  const { cases, loading, busy, error } = useEfcc();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PlayerRef[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [statement, setStatement] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
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

  if (!user) return <div className="efcc-empty"><span>🕵🏾</span><b>EFCC</b><small>Sign in to use investigations</small></div>;

  // The search runs as you type (effect above); Enter just must not reload the page.
  const submitSearch = (event: FormEvent) => event.preventDefault();

  const act = (fn: () => Promise<void>) => void fn();
  const caseCard = (item: EfccCase) => {
    const isTarget = item.target === user.username;
    const pending = item.status === 'investigating';
    const open = pending && now < item.resolvesAt;
    const response = statement[item.id] ?? '';
    const flagged = item.audit.filter((entry) => entry.illicit).length;
    const dirty = Math.round(efccDirty(item.audit).share * 100);
    const status = STATUS[item.status];
    return (
      <article className={`efcc-case ${item.status}`} key={item.id}>
        <div className="efcc-case-head">
          <Face uid={item.targetUid} username={item.target} size="lg" />
          <div>
            <b>@{item.target}{isTarget && <em>You</em>}</b>
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
        {item.status === 'convicted' && (
          <div className="efcc-verdict bad">
            <span>💰 {naira(item.fine ?? 0)} seized</span>
            {item.seizedProperty && <span>🏠 {item.seizedProperty.boughtBack ? 'Bought back ✓' : 'Property seized'}</span>}
          </div>
        )}
        {item.status === 'cleared' && <div className="efcc-verdict good"><span>✅ Clean audit</span></div>}
        {item.status === 'bribed' && <div className="efcc-verdict good"><span>🤝 Bribe accepted</span></div>}
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

  return (
    <div className="efcc-app">
      <div className="efcc-hero">
        <span className="efcc-badge" aria-hidden>🕵🏾</span>
        <div className="efcc-hero-title"><b>EFCC</b><small>Economic and Financial Crimes Commission</small></div>
        <div className="efcc-stats">
          <span><b>💸 {naira(EFCC.filingFee)}</b><small>to file</small></span>
          <span><b>🧾 {EFCC.auditSize}</b><small>incomes audited</small></span>
          <span><b>⏱ {EFCC.investigationMs / 1000}s</b><small>to respond</small></span>
        </div>
      </div>
      <form className="efcc-search" onSubmit={submitSearch}>
        <i aria-hidden>{searching ? '⏳' : '🔍'}</i>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Who are you reporting?" aria-label="Find a player by username" />
      </form>
      {searchError && <small className="efcc-error">⚠️ {searchError}</small>}
      {found.filter((player) => player.uid !== user.uid).slice(0, 8).map((player) => (
        <div className="efcc-row" key={player.uid}>
          <Face uid={player.uid} username={player.username} look={player.look} />
          <span><b>{player.name ?? 'Naija City player'}</b><small>@{player.username ?? 'player'}</small></span>
          <button className="btn sm danger" disabled={busy} onClick={() => {
            if (confirm(`File an investigation against @${player.username}? This costs ${naira(EFCC.filingFee)} and reviews their ${EFCC.auditSize} latest verified incomes.`)) {
              act(() => fileEfccCase(player.username ?? ''));
            }
          }}>⚖️ Accuse</button>
        </div>
      ))}
      {error && <small className="efcc-error">⚠️ {error}</small>}
      <div className="efcc-tabs">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
            <i aria-hidden>{f.icon}</i>{f.label}<b>{cases.filter((item) => f.match(item.status)).length}</b>
          </button>
        ))}
      </div>
      {loading && !cases.length && <p className="efcc-note">Loading…</p>}
      {!loading && !shown.length && <div className="efcc-empty"><span>🗂️</span><small>No cases here</small></div>}
      {shown.map(caseCard)}
      <details className="efcc-rules">
        <summary>ℹ️ How verdicts work</summary>
        <ul>
          <li><i aria-hidden>🚩</i>Scam, theft, heist, fencing and vice money is flagged</li>
          <li><i aria-hidden>🔒</i>Convicted at {Math.round(EFCC.dirtyShare * 100)}%+ dirty, or {naira(EFCC.dirtyFloor)}+ flagged</li>
          <li><i aria-hidden>💰</i>{EFCC.walletSeizurePercent}% of wallet and savings seized, plus a property</li>
          <li><i aria-hidden>✅</i>Big clean income alone is never evidence</li>
        </ul>
      </details>
    </div>
  );
}
