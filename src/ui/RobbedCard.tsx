import { useEffect } from 'react';
import { BOUNTY, CATCHERS } from '../game/crime';
import { ITEMS } from '../game/catalog';
import { naira, useGame } from '../game/store';
import { payback, usePolice, useRobbed } from '../net/crime';
import './robbed.css';

/** How long the offer stays up. The case is still in the Police app afterwards. */
const SHOW_MS = 45_000;

/** Half of what they took, rounded, within the bounty limits and what I can afford. */
function suggestBounty(taken: number, money: number) {
  const want = Math.max(BOUNTY.min, Math.round((taken * 0.5) / 1000) * 1000);
  const bounty = Math.min(want, BOUNTY.max, Math.floor(money));
  return bounty >= BOUNTY.min ? bounty : 0;
}

/** Shown the moment someone robs me (or is caught trying): report them, and put money on their head, in one tap. */
export function RobbedCard() {
  const crime = useRobbed((s) => s.crime);
  const busy = usePolice((s) => s.busy);
  const money = useGame((s) => s.money);

  useEffect(() => {
    if (!crime) return;
    const id = setTimeout(() => useRobbed.setState({ crime: null }), SHOW_MS);
    return () => clearTimeout(id);
  }, [crime]);

  if (!crime) return null;
  const close = () => useRobbed.setState({ crime: null });
  const act = (bounty: number) => {
    close();
    void payback(crime, bounty);
  };
  const item = crime.item ? ITEMS[crime.item]?.name.toLowerCase() : null;
  const took = [crime.amount ? naira(crime.amount) : '', item ? `your ${item}` : ''].filter(Boolean).join(' and ');
  const how = crime.kind === 'burglary' ? 'burgled your house' : 'picked your pocket';
  const tried = crime.kind === 'burglary' ? 'tried to break into your house' : 'tried to pick your pocket';
  // A guard who catches a thief puts the warrant out already: only the bounty is left to add.
  const wanted = crime.status === 'wanted';
  const bounty = suggestBounty(crime.amount, money);

  return (
    <div className="robbed-card" role="alert">
      <b>
        {crime.success
          ? `😱 @${crime.thief} ${how}${took ? ` and took ${took}` : ''}!`
          : `🚨 ${crime.guard ? `Your ${CATCHERS[crime.guard].label.toLowerCase()} caught @${crime.thief}: they` : `@${crime.thief}`} ${tried}!`}
      </b>
      <small>
        {wanted ? 'There’s a warrant out already.' : 'Report them and a warrant goes out: officers hunt them, and on arrest you get your money back.'}
        {bounty > 0 ? ' A bounty lets anyone make the arrest, and shows hunters where they are.' : ''}
      </small>
      <div className="robbed-actions">
        {!wanted && <button disabled={busy} onClick={() => act(0)}>🚔 Report</button>}
        {bounty > 0 && <button disabled={busy} className="hot" onClick={() => act(bounty)}>💰 {wanted ? 'Bounty' : 'Report + bounty'} · {naira(bounty)}</button>}
        <button className="later" onClick={close}>Later</button>
      </div>
    </div>
  );
}
