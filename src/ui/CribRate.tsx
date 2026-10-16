// On a house visit: the house's crib score, and stars to rate it (once a day; the server checks the visit happened).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HouseVisit } from '../game/visits';
import { useGame } from '../game/store';
import { CRIB_TIER_BY_ID, RATING, tierOf } from '../game/cribs';
import { loadHouseCard, rateHouse, type CribHouse } from '../net/cribs';
import { useSession } from '../net/session';
import { Emoji } from './Icons';
import { TierChip } from './CribsApp';

export function CribRate({ visit }: { visit: HouseVisit }) {
  const signedIn = useSession((s) => !!s.user);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  if (!signedIn || visit.burglary) return null;
  // The visit bar is transformed (so it would squeeze the sheet to its own width) and styles its buttons: the sheet
  // goes next to the bar instead, where the game's other sheets sit.
  const host = btn.current?.closest('.house-visit-bar')?.parentElement ?? document.body;
  return (
    <>
      <button ref={btn} className="use" onClick={() => setOpen(true)}>⭐ Rate crib</button>
      {open && createPortal(<RateSheet visit={visit} onClose={() => setOpen(false)} />, host)}
    </>
  );
}

function RateSheet({ visit, onClose }: { visit: HouseVisit; onClose(): void }) {
  const [house, setHouse] = useState<CribHouse | null>(null);
  const [reviews, setReviews] = useState<{ stars: number; comment: string; username: string | null }[]>([]);
  const [rated, setRated] = useState<number | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const pid = visit.propertyId ?? 'starter';
  useEffect(() => {
    loadHouseCard(visit.ownerUid, visit.propertyId ?? null)
      .then((d) => { setHouse(d.house); setReviews(d.reviews); setRated(d.ratedToday); })
      .catch(() => {});
  }, [visit.ownerUid, visit.propertyId]);
  const send = async () => {
    setBusy(true);
    try {
      const r = await rateHouse(visit.ownerUid, pid, stars, comment);
      setRated(stars);
      // Their own review goes to the top of the list (one per rater: a re-rating replaces the old one).
      const me = useSession.getState().user?.username ?? null;
      setReviews((rs) => [{ stars, comment: comment.trim(), username: me }, ...rs.filter((x) => !me || x.username !== me)]);
      useGame.getState().toast(`⭐ Thanks! @${visit.ownerUsername}’s crib is now ${r.score ?? '…'}/100.`);
      if (house && r.score !== null) setHouse({ ...house, score: r.score, tier: r.tier ?? house.tier });
    } catch (e) {
      useGame.getState().toast(e instanceof Error ? e.message : 'Could not rate');
    } finally {
      setBusy(false);
    }
  };
  const tier = house ? CRIB_TIER_BY_ID[house.tier] ?? tierOf(house.score) : null;
  return (
    <div className="sheet small cb-rate">
      <div className="sheet-head">
        <h3>@{visit.ownerUsername}’s crib</h3>
        <button className="x" onClick={onClose}>✕</button>
      </div>
      {house && tier ? (
        <div className="cb-rate-score">
          <Emoji char={tier.icon} size={30} />
          <span><TierChip tier={house.tier} score={house.score} /><small>{house.rating ? `⭐ ${house.rating.avg} from ${house.rating.n}` : 'No ratings yet'} · style {house.base}</small></span>
        </div>
      ) : <small className="cb-note">Loading the score…</small>}
      {rated ? (
        <div className="cb-note">You gave it {'⭐'.repeat(rated)} today. Come back tomorrow to rate again.</div>
      ) : (
        <>
          <div className="cb-stars" role="radiogroup" aria-label="Stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={stars === n} className={n <= stars ? 'on' : ''} onClick={() => setStars(n)}>★</button>
            ))}
          </div>
          <input value={comment} maxLength={RATING.maxComment} placeholder="Say something nice (or not)…" onChange={(e) => setComment(e.target.value)} />
          <button className="btn go" disabled={!stars || busy} onClick={() => void send()}>Rate {stars ? '⭐'.repeat(stars) : ''}</button>
        </>
      )}
      {reviews.length > 0 && (
        <div className="cb-reviews">
          {reviews.slice(0, 4).map((r, i) => <div key={i}><b>{'★'.repeat(r.stars)}</b> <span>@{r.username ?? 'someone'}{r.comment ? `: ${r.comment}` : ''}</span></div>)}
        </div>
      )}
    </div>
  );
}
