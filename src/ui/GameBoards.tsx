// The boards of the Street Games app: one component per game. Each draws what the server lets this player
// see (the match's `view`) and sends moves back; none of them decide anything.

import { useEffect, useState, type ReactNode } from 'react';
import { Face } from './Face';
import {
  AYO_TARGET, BELT_TARGET, TENTEN_TARGET, WHOT_POWERS, WHOT_SHAPES, isWhot, whotCanPlay, whotNum, whotShape,
  type AyoView, type BeltView, type DiceView, type MatchView, type Side, type TenTenView, type WhotCard, type WhotShape, type WhotView,
} from '../game/streetGames';

export interface BoardProps {
  m: MatchView;
  busy: boolean;
  play: (move: Record<string, unknown>) => void;
}

/** "You" for your own seat, the username for everyone else. */
export const seatName = (m: MatchView, seat: number) => (seat === m.you ? 'You' : `@${m.players[seat]?.username ?? 'someone'}`);

/** True for a moment after `key` changes, to play the result of a round before the next one starts. */
function useReveal(key: number | null, ms: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (key === null) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return on;
}

function Pips({ n, of }: { n: number; of: number }) {
  return (
    <span className="sg-pips" aria-label={`${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}
    </span>
  );
}

function Scores({ m, score, target }: { m: MatchView; score: [number, number]; target: number }) {
  return (
    <div className="sg-scores">
      {[0, 1].map((seat) => (
        <div key={seat} className={m.pending.includes(seat) ? 'turn' : ''}>
          <b>{seatName(m, seat)}</b>
          <Pips n={score[seat]} of={target} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Belt ---------- */

const LOOP_X: Record<Side, number> = { L: 108, R: 172 };
const LOOP_NAME: Record<Side, string> = { L: 'A', R: 'B' };

/** Leather with a line of stitching: every part of the belt is drawn twice. */
function Leather({ children }: { children: ReactNode }) {
  return (
    <>
      <g fill="none" stroke="#7c4a21" strokeWidth="12" strokeLinecap="round">{children}</g>
      <g fill="none" stroke="#e7c9a0" strokeWidth="1.2" strokeDasharray="3 4" strokeLinecap="round">{children}</g>
    </>
  );
}

export function BeltBoard({ m, busy, play }: BoardProps) {
  const v = m.view as BeltView;
  const over = m.status !== 'live';
  const reveal = useReveal(v.last?.round ?? null, 2600) || (over && !!v.last);
  const me = m.you;
  const folding = me === v.folder;
  const mine = m.pending.includes(me);
  const other = seatName(m, me === 0 ? 1 : 0);
  const last = v.last;
  // While the last pull is playing, the board shows that round, not the new one.
  const stick = reveal && last ? last.pick : null;
  const truth = reveal && last ? last.hold : folding ? v.hold : null;
  const canTap = mine && !busy && !reveal;
  let line: string;
  if (reveal && last) {
    const picker = seatName(m, 1 - last.folder);
    line = last.caught ? `CAUGHT! The belt held on loop ${LOOP_NAME[last.hold]}. ${picker} ${picker === 'You' ? 'score' : 'scores'}.` : `SLIPPED! The true loop was ${LOOP_NAME[last.hold]}. ${seatName(m, last.folder)} ${last.folder === me ? 'score' : 'scores'}.`;
  } else if (me < 0) line = v.folded ? 'The belt is folded. Which loop will they pick?' : 'The belt is being folded…';
  else if (!v.folded) line = folding ? 'You are folding. Tap the loop that should catch the stick.' : `${other} is folding the belt. No peeping!`;
  else line = folding ? `You made loop ${v.hold ? LOOP_NAME[v.hold] : '?'} the true one. ${other} is choosing…` : 'Push your stick into a loop. Will the belt catch it?';
  return (
    <div className="sg-board sg-belt">
      <Scores m={m} score={v.score} target={BELT_TARGET} />
      <svg viewBox="0 0 300 150" className="sg-belt-svg" role="img" aria-label="A coiled belt with two loops, A and B">
        <ellipse cx="140" cy="132" rx="110" ry="9" fill="rgba(0,0,0,0.12)" />
        <g className={`sg-coil ${reveal && last ? (last.caught ? 'caught' : 'slip') : !v.folded && !folding && !over ? 'folding' : ''}`} key={reveal ? `r${last?.round}` : 'live'}>
          <Leather>
            <ellipse cx="140" cy="75" rx="98" ry="56" />
            <ellipse cx="140" cy="75" rx="76" ry="39" />
            <path d="M236 64 C262 52 276 50 290 46" />
          </Leather>
          <rect x="282" y="34" width="16" height="22" rx="3" fill="none" stroke="#cbd5e1" strokeWidth="4" />
          {(['L', 'R'] as Side[]).map((s) => (
            <g key={s} className={`sg-loop ${truth === s ? 'true' : ''} ${canTap ? 'tap' : ''}`} onClick={canTap ? () => play({ side: s }) : undefined}>
              <ellipse cx={LOOP_X[s]} cy="75" rx="25" ry="22" fill="rgba(0,0,0,0.18)" stroke="#5b3413" strokeWidth="9" />
              <text x={LOOP_X[s]} y="81" textAnchor="middle">{LOOP_NAME[s]}</text>
            </g>
          ))}
        </g>
        {stick && (
          <g className="sg-stick">
            <circle cx={LOOP_X[stick]} cy="75" r="9" fill="#e2e8f0" stroke="#334155" strokeWidth="3" />
            <circle cx={LOOP_X[stick] - 3} cy="72" r="2.5" fill="#fff" />
          </g>
        )}
      </svg>
      <p className={`sg-line ${reveal && last ? (last.caught ? 'good' : 'bad') : ''}`}>{line}</p>
      {!over && me >= 0 && (
        <div className="sg-choice">
          {(['L', 'R'] as Side[]).map((s) => (
            <button key={s} className="btn" disabled={!canTap} onClick={() => play({ side: s })}>
              {folding ? `Loop ${LOOP_NAME[s]} is true` : `Stick in loop ${LOOP_NAME[s]}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Ten-Ten ---------- */

function Kicker({ side, label, win }: { side: Side | null; label: string; win: boolean }) {
  const kick = (s: Side) => (side === s ? (s === 'L' ? '40,64 12,82' : '40,64 68,82') : s === 'L' ? '40,64 33,104' : '40,64 47,104');
  return (
    <figure className={`sg-kicker ${win ? 'win' : ''}`}>
      <svg viewBox="0 0 80 110" aria-hidden>
        <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="40" cy="15" r="10" />
          <path d="M40 26V64M40 38 24 24M40 38 56 24" />
          <polyline points={kick('L')} />
          <polyline points={kick('R')} />
        </g>
        {side === null && <text x="40" y="20" textAnchor="middle" className="sg-q">?</text>}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function TenTenBoard({ m, busy, play }: BoardProps) {
  const v = m.view as TenTenView;
  const over = m.status !== 'live';
  const reveal = useReveal(v.last?.round ?? null, 2200) || (over && !!v.last);
  const me = m.you;
  const mine = m.pending.includes(me);
  const last = v.last;
  const legs: [Side | null, Side | null] = reveal && last ? last.picks : [me === 0 ? v.mine : null, me === 1 ? v.mine : null];
  let line: string;
  if (reveal && last) line = `${last.picks[0] === last.picks[1] ? 'The legs MATCH!' : 'The legs CROSS!'} Point to ${seatName(m, last.point)}.`;
  else if (me < 0) line = 'Clap, clap…';
  else if (mine) line = me === 0 ? 'You are MATCH: you score when you both kick the same leg.' : 'You are CROSS: you score when your legs are different.';
  else line = `You have kicked. Waiting for ${seatName(m, 1 - me)}…`;
  return (
    <div className="sg-board sg-tenten">
      <Scores m={m} score={v.score} target={TENTEN_TARGET} />
      <div className="sg-kickers" key={reveal ? `r${last?.round}` : 'live'}>
        <Kicker side={legs[0]} label={`${seatName(m, 0)} · match`} win={!!(reveal && last && last.point === 0)} />
        <span className="sg-vs">{reveal ? '💥' : '👏🏾'}</span>
        <Kicker side={legs[1]} label={`${seatName(m, 1)} · cross`} win={!!(reveal && last && last.point === 1)} />
      </div>
      <p className={`sg-line ${reveal && last ? (last.point === me ? 'good' : me >= 0 ? 'bad' : '') : ''}`}>{line}</p>
      {!over && me >= 0 && (
        <div className="sg-choice">
          <button className="btn" disabled={!mine || busy || reveal} onClick={() => play({ side: 'L' })}>🦵🏾 Left leg</button>
          <button className="btn" disabled={!mine || busy || reveal} onClick={() => play({ side: 'R' })}>Right leg 🦵🏾</button>
        </div>
      )}
    </div>
  );
}

/* ---------- Street Dice ---------- */

const DIE_PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function Die({ n }: { n: number }) {
  return (
    <span className="sg-die" aria-label={String(n)}>
      {Array.from({ length: 9 }, (_, i) => <i key={i} className={DIE_PIPS[n]?.includes(i) ? 'on' : ''} />)}
    </span>
  );
}

export function DiceBoard({ m, busy, play }: BoardProps) {
  const v = m.view as DiceView;
  const over = m.status !== 'live';
  const me = m.you;
  const mine = m.pending.includes(me);
  const total = (r: [number, number] | null) => (r ? r[0] + r[1] : 0);
  const winner = over && m.winners.length === 1 ? m.players.findIndex((p) => p.uid === m.winners[0]) : -1;
  let line: string;
  if (over) line = winner >= 0 ? `${seatName(m, winner)} ${winner === me ? 'carry' : 'carries'} the pot!` : 'Table closed.';
  else if (v.last && v.rolls.every((r) => !r)) line = `Tie on ${total(v.last.rolls[v.last.tied[0]])}! ${v.last.tied.map((s) => seatName(m, s)).join(' and ')} shake again.`;
  else if (mine) line = 'Your turn. Shake the dice!';
  else if (me >= 0 && !v.alive[me]) line = 'You are out of this one.';
  else line = 'Waiting for the others to shake…';
  return (
    <div className="sg-board sg-dice">
      <div className="sg-dice-rows">
        {m.players.map((p, seat) => {
          const roll = v.rolls[seat];
          return (
            <div key={p.uid} className={`sg-dice-row ${!v.alive[seat] ? 'out' : ''} ${seat === winner ? 'win' : ''}`}>
              <b>{seatName(m, seat)}</b>
              {roll ? (
                <span className="sg-roll" key={`${v.round}-${roll.join('')}`}>
                  <Die n={roll[0]} />
                  <Die n={roll[1]} />
                  <em>{total(roll)}</em>
                </span>
              ) : (
                <small>{!v.alive[seat] ? 'out' : over ? '' : 'shaking…'}</small>
              )}
            </div>
          );
        })}
      </div>
      <p className={`sg-line ${over && winner === me ? 'good' : ''}`}>{line}</p>
      {!over && me >= 0 && v.alive[me] && (
        <button className="btn big sg-shake" disabled={!mine || busy} onClick={() => play({ roll: true })}>
          🎲 Shake am!
        </button>
      )}
    </div>
  );
}

/* ---------- Ayo ---------- */

function Pit({ seeds, on, hit, onClick }: { seeds: number; on: boolean; hit: boolean; onClick?: () => void }) {
  return (
    <button className={`sg-pit ${on ? 'on' : ''} ${hit ? 'hit' : ''}`} disabled={!onClick} onClick={onClick} aria-label={`${seeds} seeds`}>
      <span className="sg-seeds" aria-hidden>
        {Array.from({ length: Math.min(seeds, 12) }, (_, i) => <i key={i} />)}
      </span>
      <b>{seeds}</b>
    </button>
  );
}

export function AyoBoard({ m, busy, play }: BoardProps) {
  const v = m.view as AyoView;
  const over = m.status !== 'live';
  // Someone watching sees it from seat 0's side.
  const me = m.you < 0 ? 0 : m.you;
  const them = 1 - me;
  const mine = m.pending.includes(m.you);
  const lastPit = v.last ? v.last.seat * 6 + v.last.pit : -1;
  let line: string;
  if (v.last) line = `${seatName(m, v.last.seat)} played${v.last.captured ? ` and captured ${v.last.captured} seeds!` : '.'}`;
  else line = 'Sow anticlockwise. Make a 2 or a 3 on their side to capture.';
  if (!over) line += mine ? ' Your turn.' : m.you >= 0 ? ` Waiting for ${seatName(m, them)}…` : '';
  return (
    <div className="sg-board sg-ayo">
      <div className={`sg-ayo-store ${m.pending.includes(them) ? 'turn' : ''}`}>
        <b>{seatName(m, them)}</b>
        <span>{v.store[them]} / {AYO_TARGET}</span>
      </div>
      <div className="sg-ayo-wood">
        <div className="sg-ayo-row">
          {[5, 4, 3, 2, 1, 0].map((i) => <Pit key={i} seeds={v.pits[them * 6 + i]} on={false} hit={lastPit === them * 6 + i} />)}
        </div>
        <div className="sg-ayo-row">
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const ok = mine && !busy && v.legal.includes(i);
            return <Pit key={i} seeds={v.pits[me * 6 + i]} on={ok} hit={lastPit === me * 6 + i} onClick={ok ? () => play({ pit: i }) : undefined} />;
          })}
        </div>
      </div>
      <div className={`sg-ayo-store ${m.pending.includes(me) ? 'turn' : ''}`}>
        <b>{seatName(m, me)}</b>
        <span>{v.store[me]} / {AYO_TARGET}</span>
      </div>
      <p className="sg-line">{line}</p>
    </div>
  );
}

/* ---------- Whot ---------- */

const cardName = (c: WhotCard) => (isWhot(c) ? 'Whot 20' : `${WHOT_SHAPES[whotShape(c) as WhotShape].glyph} ${whotNum(c)}`);

function WhotFace({ card, playable, onClick }: { card: WhotCard; playable?: boolean; onClick?: () => void }) {
  const whot = isWhot(card);
  const num = whotNum(card);
  return (
    <button className={`sg-card ${whot ? 'whot' : ''} ${playable ? 'ok' : ''}`} disabled={!onClick} onClick={onClick} aria-label={cardName(card)}>
      <i>{num}</i>
      <b>{whot ? 'W' : WHOT_SHAPES[whotShape(card) as WhotShape].glyph}</b>
      {WHOT_POWERS[num] && <small>{WHOT_POWERS[num]}</small>}
    </button>
  );
}

function whotLine(m: MatchView, v: WhotView): string {
  const l = v.last;
  if (!l) return 'Game on. Match the shape or the number.';
  const who = seatName(m, l.seat);
  if (l.market) return `${who} went to market.`;
  let text = `${who} played ${cardName(l.card ?? '')}`;
  if (l.call) text += ` and called ${WHOT_SHAPES[l.call].name}`;
  if (l.picked && l.picked.seats.length > 1) text += '. General market! Everybody else picks 1';
  else if (l.picked) text += `. ${seatName(m, l.picked.seats[0])} must pick ${l.picked.n}`;
  else if (l.skipped !== undefined) text += `. Suspension! ${seatName(m, l.skipped)} must wait`;
  else if (l.again) text += '. Hold on!';
  return `${text}.`;
}

const SHAPE_ORDER = 'ctxsrw';

export function WhotBoard({ m, busy, play }: BoardProps) {
  const v = m.view as WhotView;
  const over = m.status !== 'live';
  const me = m.you;
  const mine = m.pending.includes(me) && !busy;
  /** The Whot card waiting for its shape to be called. */
  const [calling, setCalling] = useState(false);
  useEffect(() => {
    if (!mine) setCalling(false);
  }, [mine]);
  const hand = [...v.hand].sort((a, b) => SHAPE_ORDER.indexOf(a[0]) - SHAPE_ORDER.indexOf(b[0]) || whotNum(a) - whotNum(b));
  const canPlay = (c: WhotCard) => whotCanPlay(v.top, v.call, c);
  const stuck = mine && !hand.some(canPlay);
  return (
    <div className="sg-board sg-whot">
      <div className="sg-whot-seats">
        {m.players.map((p, seat) => seat !== me && (
          <div key={p.uid} className={`${v.turn === seat && !over ? 'turn' : ''} ${v.out[seat] ? 'out' : ''}`}>
            <b><Face uid={p.uid} username={p.username} size="xs" />@{p.username}</b>
            <span>{v.out[seat] ? 'left' : v.counts[seat] === 1 ? 'Last card!' : `${v.counts[seat]} cards`}</span>
          </div>
        ))}
      </div>
      <div className="sg-whot-table">
        <button className={`sg-card back ${stuck ? 'ok' : ''}`} disabled={!mine} onClick={() => play({ draw: true })} aria-label="Go to market">
          <b>WHOT</b>
          <small>Market · {v.market}</small>
        </button>
        <div className="sg-whot-top" key={`${v.top}-${v.counts.join('.')}`}>
          <WhotFace card={v.top} />
          {v.call && <em>Called: {WHOT_SHAPES[v.call].glyph} {WHOT_SHAPES[v.call].name}</em>}
        </div>
      </div>
      <p className="sg-line">{whotLine(m, v)}</p>
      {me >= 0 && !v.out[me] && (
        <>
          <small className="muted sg-whot-hint">
            {over ? '' : mine ? (stuck ? 'Nothing matches. Tap the market to draw.' : 'Your turn. Tap a card to play it.') : `Waiting for ${seatName(m, v.turn)}…`}
          </small>
          {calling ? (
            <div className="sg-call">
              <b>Call a shape</b>
              <div>
                {(Object.keys(WHOT_SHAPES) as WhotShape[]).map((s) => (
                  <button key={s} className="btn" disabled={!mine} onClick={() => { setCalling(false); play({ card: 'w20', call: s }); }}>
                    {WHOT_SHAPES[s].glyph} {WHOT_SHAPES[s].name}
                  </button>
                ))}
              </div>
              <button className="btn sm ghost" onClick={() => setCalling(false)}>Back</button>
            </div>
          ) : (
            <div className="sg-hand">
              {hand.map((c, i) => {
                const ok = mine && canPlay(c);
                return <WhotFace key={`${c}-${i}`} card={c} playable={ok} onClick={ok ? () => (isWhot(c) ? setCalling(true) : play({ card: c })) : undefined} />;
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
