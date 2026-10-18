// Government notices (worker/gazette.ts): the banner everyone sees the moment an office holder does something,
// and the Civic app's News tab, where the week's notices are kept.

import { useEffect, useState } from 'react';
import type { CivicNews, GazetteKind } from '../game/civic';
import { useGame } from '../game/store';
import { useCivic, useGazette } from '../net/civic';
import { Emoji } from './Icons';
import './gazette.css';

/** How long a notice stays up (the banner's animation in gazette.css runs as long). */
const SHOWN_MS = 14_000;

const KIND_LABEL: Record<GazetteKind, string> = { law: 'New law', project: 'Public works', palliative: 'Palliatives', scandal: 'Scandal', elected: 'Election' };

function ago(at: number) {
  const mins = Math.max(0, Math.floor((Date.now() - at) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / (24 * 60))}d ago`;
}

/** Opens the phone on Civic → News. */
function openNews() {
  useCivic.setState({ wantOpen: true, wantNews: true });
  useGame.getState().setPanel('phone');
}

/** One notice at a time across the top of the screen, whatever you are doing. Tap it for the full record. */
export function GazetteBanner() {
  const cur = useGazette((s) => s.queue[0]);
  const shift = useGazette((s) => s.shift);
  useEffect(() => {
    if (!cur) return;
    const id = setTimeout(shift, SHOWN_MS);
    return () => clearTimeout(id);
  }, [cur, shift]);
  if (!cur) return null;
  return (
    <button key={cur.key} type="button" className={`gazette-banner kind-${cur.kind}`} style={{ ['--gz-shown' as string]: `${SHOWN_MS}ms` }} aria-live="polite" onClick={() => { shift(); openNews(); }}>
      {/* Green-white-green down the edge, like the flag. */}
      <span className="gz-flag" aria-hidden><i /><i /><i /></span>
      <span className="gz-icon"><Emoji char={cur.icon} size={24} /></span>
      <span className="gz-body">
        <span className="gz-head">
          <b className="gz-seal">Federal Gazette</b>
          <i className="gz-kind">{KIND_LABEL[cur.kind]}</i>
        </span>
        <span className="gz-text">{cur.text}</span>
        <small className="gz-foot">Just now{cur.more ? ` · +${cur.more} more` : ''} · Tap for the full record ›</small>
      </span>
      <span className="gz-gavel" aria-hidden><Gavel /></span>
    </button>
  );
}

/** A judge's gavel striking its block, for the notice's corner badge. */
function Gavel() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
      <g transform="rotate(-40 12 9)">
        <rect x="7.5" y="3.2" width="9" height="4.6" rx="1.4" />
        <rect x="6.3" y="2.6" width="1.6" height="5.8" rx="0.6" />
        <rect x="16.1" y="2.6" width="1.6" height="5.8" rx="0.6" />
        <rect x="11.1" y="7.6" width="1.8" height="10" rx="0.9" />
      </g>
      <rect x="3" y="18.6" width="11" height="2.8" rx="1.1" />
    </svg>
  );
}

const FILTERS: { id: 'all' | 'laws' | 'money' | 'people'; label: string; kinds: GazetteKind[] | null }[] = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'laws', label: 'Laws', kinds: ['law'] },
  { id: 'money', label: 'Treasury', kinds: ['project', 'palliative', 'scandal'] },
  { id: 'people', label: 'Elected', kinds: ['elected'] },
];

/** Government notices as a list, in the order given. */
export function NewsList({ items }: { items: CivicNews[] }) {
  return (
    <ul className="list-card gazette-list">
      {items.map((n) => (
        <li key={n.id} className={`kind-${n.kind}`}>
          <span className="gazette-icon"><Emoji char={n.icon} size={22} /></span>
          <div>
            <p>{n.text}</p>
            <small><em>{KIND_LABEL[n.kind]}</em> · {ago(n.at)}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Civic → News: what the government has done lately, newest first. */
export function CivicNewsTab() {
  const news = useCivic((s) => s.data?.news) ?? [];
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const kinds = FILTERS.find((f) => f.id === filter)?.kinds;
  const shown: CivicNews[] = kinds ? news.filter((n) => kinds.includes(n.kind)) : news;
  return (
    <div className="gazette">
      <div className="gazette-filters" role="group" aria-label="Filter the news">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={filter === f.id ? 'on' : ''} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="list-card civic-empty">
          <span><Emoji char="📜" size={28} /></span>
          <b>{news.length ? 'Nothing of this kind lately' : 'The government has been quiet'}</b>
          <small className="muted">New laws, treasury spending, scandals and election winners from the last week show here. Everyone gets an alert the moment one happens.</small>
        </div>
      ) : <NewsList items={shown} />}
    </div>
  );
}
