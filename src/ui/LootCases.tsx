// Looting cases between an office holder who took money from a treasury and the EFCC chair who decides what happens
// (worker/loot.ts). Shown on the Treasury tab and at the top of the chat between the two.

import { useEffect } from 'react';
import { CITY_NAME, LOOT, lootBribe, type LootCase } from '../game/civic';
import { naira } from '../game/store';
import { useCivic } from '../net/civic';
import { left, useNow } from './Career';
import { Emoji } from './Icons';
import './treasury.css';

const where = (c: LootCase) => (c.city ? `${CITY_NAME[c.city]}’s treasury` : 'the federal treasury');

function Case({ c, uid }: { c: LootCase; uid: string }) {
  const busy = useCivic((s) => s.busy);
  const offer = useCivic((s) => s.lootOffer);
  const decide = useCivic((s) => s.lootDecide);
  const now = useNow(15_000);
  const looter = c.looterUid === uid;
  const other = looter ? c.chair : c.looter;
  const open = c.status === 'open';
  const time = c.expiresAt - now;

  if (!open) {
    const line = c.status === 'accepted'
      ? looter ? 'The chair took the money. The case is closed.' : 'You took the offer. The case is closed.'
      : c.status === 'refused'
        ? looter ? 'The chair refused. You are out of office.' : 'You sent the looter to court.'
        : 'Time ran out. The old odds decided.';
    return <div className="loot-case closed"><Emoji char="📁" size={16} /><small>{naira(c.amount)} from {where(c)}. {line}</small></div>;
  }

  return (
    <div className="loot-case">
      <b><Emoji char="🐍" size={16} /> {looter ? `You took ${naira(c.amount)}` : `@${c.looter ?? 'someone'} took ${naira(c.amount)}`} from {where(c)}</b>
      <small>{time > 0 ? `${left(time)} left` : 'Settling…'}{other ? ` · ${looter ? 'EFCC chair' : 'Looter'} @${other}` : ''}</small>
      {looter && !c.offer && (
        <>
          <small>Offer the chair a share of the loot. They decide if you go down.</small>
          <div className="row-btns">
            {LOOT.shares.map((pct) => (
              <button key={pct} className="btn sm" disabled={busy || time <= 0} onClick={() => void offer(c.id, pct)}>{pct}% · {naira(lootBribe(c.amount, pct))}</button>
            ))}
          </div>
        </>
      )}
      {looter && !!c.offer && <small>Your offer of {naira(c.offer)} is held until the chair decides.</small>}
      {!looter && (
        <>
          <small>{c.offer ? `Offers you ${naira(c.offer)}. Take it and you may be found out and lose your job.` : 'No offer yet.'}</small>
          <div className="row-btns">
            {!!c.offer && <button className="btn sm" disabled={busy || time <= 0} onClick={() => void decide(c.id, true)}>Take {naira(c.offer)}</button>}
            <button className="btn sm danger" disabled={busy || time <= 0} onClick={() => void decide(c.id, false)}>Send to court</button>
          </div>
        </>
      )}
    </div>
  );
}

/** My looting cases. `only` keeps the ones with one other player (their chat). Renders nothing when there are none. */
export function LootCases({ uid, only }: { uid: string; only?: string }) {
  const data = useCivic((s) => s.data);
  useEffect(() => {
    void useCivic.getState().refresh();
    const timer = window.setInterval(() => void useCivic.getState().refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const cases = (data?.loot ?? []).filter((c) => !only || c.looterUid === only || c.chairUid === only);
  if (!cases.length) return null;
  return <div className="loot-cases">{cases.map((c) => <Case key={c.id} c={c} uid={uid} />)}</div>;
}
