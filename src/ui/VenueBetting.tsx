import { useState } from 'react';
import { create } from 'zustand';
import { type BetVenue, VENUE_BETS } from '../game/betting';
import { avatarView } from '../game/avatar';
import { naira, useGame } from '../game/store';
import { placeVenueBet } from '../net/betting';

interface BettingState {
  venue: BetVenue | null;
  open: (venue: BetVenue) => void;
  close: () => void;
}

const useVenueBet = create<BettingState>((set) => ({
  venue: null,
  open: (venue) => set({ venue }),
  close: () => set({ venue: null }),
}));

export const openVenueBet = (venue: BetVenue) => useVenueBet.getState().open(venue);

export function VenueBetLauncher() {
  const view = useGame((s) => s.view);
  const destinationId = useGame((s) => s.destinationId);
  const golf = view === 'city' && destinationId === 'kaduna' &&
    avatarView.x >= 10.5 && avatarView.x <= 17.5 && avatarView.z >= 65.5 && avatarView.z <= 72.5;
  if (!golf) return null;
  return (
    <button className="venue-bet-launch" onClick={() => openVenueBet('golf')}>
      <span className="vbl-icon">🎟</span> Golf bet
    </button>
  );
}

export function VenueBetting() {
  const venue = useVenueBet((s) => s.venue);
  const close = useVenueBet((s) => s.close);
  const money = useGame((s) => s.money);
  const toast = useGame((s) => s.toast);
  const [pick, setPick] = useState('');
  const [stake, setStake] = useState(1_000);
  const [busy, setBusy] = useState(false);
  if (!venue) return null;
  const game = VENUE_BETS[venue];
  const selected = game.picks.find((option) => option.id === pick);
  const closeModal = () => {
    if (busy) return;
    close();
    setPick('');
  };
  const submit = async () => {
    if (!selected) return toast('Choose what you think will happen.');
    if (stake > money) return toast('You do not have enough money for that stake.');
    setBusy(true);
    try {
      await placeVenueBet(venue, selected.id, stake);
      setPick('');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not place that bet.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="story-overlay venue-bet-overlay" onClick={closeModal}>
      <section className="story-card venue-bet-card" role="dialog" aria-modal="true" aria-labelledby="venue-bet-title" onClick={(event) => event.stopPropagation()}>
        <button className="x venue-bet-close" onClick={closeModal} aria-label="Close betting">✕</button>
        <span className="story-icon">{venue === 'golf' ? '⛳' : '⚽'}</span>
        <small>IN-GAME NAIRA ONLY · NO REAL-MONEY BETTING</small>
        <h2 id="venue-bet-title">{game.title}</h2>
        <p>{game.prompt}</p>
        <div className="story-choices">
          {game.picks.map((option) => (
            <button key={option.id} className={pick === option.id ? 'selected' : ''} onClick={() => setPick(option.id)}>
              {option.label} · ×{option.odds.toFixed(2)}
            </button>
          ))}
        </div>
        <div className="venue-bet-stakes">
          {[500, 1_000, 5_000, 20_000, 100_000].map((amount) => (
            <button key={amount} className={stake === amount ? 'selected' : ''} disabled={money < amount} onClick={() => setStake(amount)}>
              {naira(amount)}
            </button>
          ))}
        </div>
        <button className="btn go wide" disabled={busy || !selected || money < stake} onClick={() => void submit()}>
          {busy ? 'Rolling…' : `Stake ${naira(stake)}${selected ? ` · win ${naira(Math.floor(stake * selected.odds))}` : ''}`}
        </button>
      </section>
    </div>
  );
}
