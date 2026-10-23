// The governor's desk in the Civic app (rules in src/game/desk.ts, server in worker/desk.ts): the crazy matter waiting on
// whoever runs a state, its clock, and the choices, each with what it visibly does. Tap one, then tap it again to commit.
// Under it, how the last matter went.

import { useState } from 'react';
import { CITY_NAME, type CivicCity } from '../game/civic';
import { DILEMMA_BY_ID, deskAmount, deskChips, deskText } from '../game/desk';
import { useCivic } from '../net/civic';
import { left, useNow } from './Career';
import { Emoji } from './Icons';
import './desk.css';

export function GovDesk({ city }: { city: CivicCity }) {
  const desk = useCivic((s) => s.data?.desk);
  const balance = useCivic((s) => s.data?.states?.[city]?.balance ?? 0);
  const busy = useCivic((s) => s.busy);
  const decide = useCivic((s) => s.decideDesk);
  const now = useNow(1000);
  const [picked, setPicked] = useState<string | null>(null);
  const open = desk?.open && desk.open.due > now ? desk.open : null;
  const d = open ? DILEMMA_BY_ID[open.dilemma] : null;
  const name = CITY_NAME[city];

  if (open && d) {
    const urgent = open.due - now < 15 * 60_000;
    return (
      <section className="desk" aria-label="On your desk">
        <div className="desk-head">
          <span className="desk-tag"><Emoji char="🏛️" size={13} /> On your desk</span>
          <span className={`desk-clock${urgent ? ' urgent' : ''}`}><Emoji char="⏳" size={12} /> {left(open.due - now)}</span>
        </div>
        <div className="desk-matter">
          <span className="desk-icon"><Emoji char={d.icon} size={30} /></span>
          <div>
            <b>{d.title}</b>
            <p>{deskText(d.body, name, 'you')}</p>
          </div>
        </div>
        <div className="desk-options">
          {d.options.map((o) => {
            const cost = o.effect.money && o.effect.money < 0 ? deskAmount(-o.effect.money, city) : 0;
            const short = cost > balance;
            const on = picked === o.id;
            return (
              <button
                key={o.id}
                type="button"
                className={`desk-option${on ? ' on' : ''}`}
                disabled={busy || short}
                aria-pressed={on}
                onClick={() => (on ? void decide(open.id, o.id).then(() => setPicked(null)) : setPicked(o.id))}
              >
                <span className="desk-option-top"><Emoji char={o.icon} size={20} /><b>{o.label}</b></span>
                <span className="desk-chips">
                  {deskChips(o, city).map((c) => <i key={c.text} className={c.tone}><Emoji char={c.icon} size={11} /> {c.text}</i>)}
                </span>
                {short && <small className="desk-short">{name} can’t afford this</small>}
                {on && <small className="desk-confirm">Tap again to decide</small>}
              </button>
            );
          })}
        </div>
        <small className="desk-foot">Decide in time or it gets decided for you, and the people will remember.</small>
      </section>
    );
  }

  const last = desk?.last;
  const ld = last ? DILEMMA_BY_ID[last.dilemma] : null;
  if (!last || !ld) return null;
  const chose = ld.options.find((o) => o.id === last.choice);
  return (
    <section className="desk quiet" aria-label="Your last decision">
      <span className="desk-icon"><Emoji char={ld.icon} size={22} /></span>
      <div>
        <b>{ld.title}</b>
        <small>{chose ? <>You chose: {chose.label}</> : <>You didn’t decide in time.</>}{last.twistPending && <> · <Emoji char="🎲" size={11} /> it’s not over yet</>}</small>
      </div>
    </section>
  );
}
