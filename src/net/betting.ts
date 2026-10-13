import { type BetVenue, VENUE_BETS } from '../game/betting';
import { naira, useGame } from '../game/store';
import { api, serial } from './session';
import { flushWalletNow, setServerBalance } from './wallet';

export async function placeVenueBet(venue: BetVenue, pick: string, stake: number) {
  return serial(async () => {
    await flushWalletNow();
    const response = await api('/api/venue-bet', { method: 'POST', body: JSON.stringify({ venue, pick, stake }) });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      balance?: number;
      outcome?: string;
      payout?: number;
    };
    if (!response.ok) throw new Error(result.error ?? 'Could not place that bet');
    if (result.balance === undefined || !result.outcome || result.payout === undefined) throw new Error('Bet result was incomplete');
    setServerBalance(result.balance);
    useGame.getState().bump('bets');
    const label = VENUE_BETS[venue].picks.find((option) => option.id === result.outcome)?.label ?? result.outcome;
    const won = result.payout > 0;
    useGame.getState().toast(won ? `🎉 ${label}! You won ${naira(result.payout)}.` : `😬 The result was ${label}. Better luck next time.`);
    return { outcome: result.outcome, payout: result.payout };
  });
}
