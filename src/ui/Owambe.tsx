// Owambe: a party at the city's square (Murtala Square in Kaduna, Eagle Square in Abuja). Get past the gate (invited or not), spray money, chop jollof, and
// dance for tips in a little rhythm game. Most days it's a stranger's wedding; when a player books the
// square for their own party, guests spray the host for real (src/net/owambe.ts), and anyone at the
// square can spray any other player standing there.

import { useEffect, useMemo, useRef, useState } from 'react';
import { dayOf, hourOf, naira, useGame } from '../game/store';
import { fed } from '../game/catalog';
import { activeEvent } from '../game/live';
import { PARTY, PARTY_KINDS, squareName, type PartyKind } from '../game/owambe';
import { hostParty, inviteGuest, liveParty, playersAtSquare, sprayPlayer, useParty } from '../net/owambe';
import { useNet } from '../net/multiplayer';
import { useSession } from '../net/session';
import { Face } from './Face';

/** Is there an owambe at this city's square right now, and are you on the list? */
export function owambeNow(s = useGame.getState()) {
  const party = liveParty();
  const mega = activeEvent(Date.now(), s.destinationId) === 'owambe';
  const day = dayOf(s.minutes);
  const h = hourOf(s.minutes);
  const daytime = h >= 12 && h < 22;
  // A wedding invitation is for one city's square.
  const invited = mega || (s.owambeInvite === day && (s.owambeInviteCity ?? 'kaduna') === s.destinationId) || !!party?.invited;
  const open = !!party || mega || (daytime && (invited || day % 7 === 6));
  return { open, invited, mega, party };
}

const SPRAYS = PARTY.sprays;
/** Spray target: the NPC couple (money just leaves your wallet) or a real player's uid. */
const COUPLE = 'couple';
const LANES = ['◀', '▼', '▲', '▶'] as const;
const LANE_KEYS: Record<string, number> = { ArrowLeft: 0, a: 0, ArrowDown: 1, s: 1, ArrowUp: 2, w: 2, ArrowRight: 3, d: 3 };
const DANCE_MS = 20_000;
/** Notes fall from the top to the line in this long. */
const FALL_MS = 1_600;
const HIT_WINDOW = 160;

interface Note { lane: number; at: number; hit: boolean | null }

function DanceFloor({ onDone }: { onDone: (score: number) => void }) {
  const notes = useMemo<Note[]>(() => {
    const out: Note[] = [];
    // A steady afrobeat-ish pattern with some off-beats.
    for (let t = 1_400; t < DANCE_MS - 400; t += 380 + Math.floor(Math.random() * 3) * 190) out.push({ lane: Math.floor(Math.random() * 4), at: t, hit: null });
    return out;
  }, []);
  const start = useRef(performance.now());
  const [, frame] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const hits = notes.filter((n) => n.hit).length;
    const wrong = notes.filter((n) => n.hit === false).length;
    onDone(Math.max(0, Math.min(100, Math.round((hits / notes.length) * 100 - wrong * 2))));
  };

  const press = (lane: number) => {
    const t = performance.now() - start.current;
    const target = notes.find((n) => n.lane === lane && n.hit === null && Math.abs(n.at - t) < HIT_WINDOW);
    if (target) {
      target.hit = true;
      setFlash(Math.abs(target.at - t) < 60 ? 'PERFECT! 🔥' : 'Nice!');
    } else {
      const miss = notes.find((n) => n.lane === lane && n.hit === null && Math.abs(n.at - t) < HIT_WINDOW * 2.5);
      if (miss) miss.hit = false;
      setFlash('Off-beat 😬');
    }
  };

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = performance.now() - start.current;
      for (const n of notes) if (n.hit === null && t - n.at > HIT_WINDOW) n.hit = false;
      if (t > DANCE_MS) return finish();
      frame((f) => f + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const key = (e: KeyboardEvent) => {
      const lane = LANE_KEYS[e.key];
      if (lane !== undefined) {
        e.preventDefault();
        press(lane);
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 450);
    return () => clearTimeout(id);
  }, [flash]);

  const t = performance.now() - start.current;
  const hits = notes.filter((n) => n.hit).length;
  return (
    <div className="dance">
      <div className="dance-head">
        <b>💃🏾 Dance floor</b>
        <span>{Math.max(0, Math.ceil((DANCE_MS - t) / 1000))}s · {hits} hits</span>
      </div>
      <div className="dance-lanes">
        {LANES.map((l, lane) => (
          <div key={lane} className="dance-lane">
            {notes
              .filter((n) => n.lane === lane && n.hit === null && n.at - t < FALL_MS && n.at - t > -HIT_WINDOW)
              .map((n) => (
                <i key={n.at} className="dance-note" style={{ top: `${(1 - (n.at - t) / FALL_MS) * 82}%` }}>{l}</i>
              ))}
            <button className="dance-hit" onPointerDown={(e) => { e.preventDefault(); press(lane); }}>{l}</button>
          </div>
        ))}
      </div>
      <div className="dance-flash">{flash ?? ' '}</div>
      <small className="muted">Tap the arrows (or ← ↓ ↑ →) when the notes reach the line.</small>
    </div>
  );
}

export function Owambe() {
  const open = useGame((s) => s.owambe);
  const money = useGame((s) => s.money);
  const setOwambe = useGame((s) => s.setOwambe);
  const party = useParty((s) => (s.party && s.party.endsAt > Date.now() ? s.party : null));
  const hostReadyAt = useParty((s) => s.hostReadyAt);
  const partyBusy = useParty((s) => s.busy);
  const rain = useParty((s) => s.rain);
  const signedIn = useSession((s) => !!s.user?.username);
  const online = useNet((s) => s.players);
  const myId = useNet((s) => s.myId);
  const [stage, setStage] = useState<'gate' | 'inside' | 'dance' | 'host'>('gate');
  const [ate, setAte] = useState(false);
  const [danced, setDanced] = useState(false);
  const [notes, setNotes] = useState<number[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [target, setTarget] = useState<string>(COUPLE);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [, tick] = useState(0);

  useEffect(() => {
    if (!open) return;
    setAte(false);
    setDanced(false);
    setInvited(new Set());
    if (useParty.getState().planning) {
      useParty.setState({ planning: false });
      setStage('host');
      setLog([]);
      return;
    }
    const { invited, party } = owambeNow();
    setStage(invited ? 'inside' : 'gate');
    setTarget(party && !party.isHost ? party.host.uid : COUPLE);
    setLog(invited ? [party?.isHost ? '🎉 The MC announced your entrance. The square is yours!' : '🎉 The usher checked your name and waved you in. Welcome!'] : []);
    if (invited) arrive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Money raining on me from other players.
  useEffect(() => {
    if (open && rain) setNotes((n) => [...n, Date.now()].slice(-6));
  }, [rain, open]);

  // Players come and go: refresh who's on the square, and the party clock.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;
  const g = useGame.getState();
  const say = (line: string) => setLog((l) => [line, ...l].slice(0, 5));
  const needs = (d: Partial<Record<'hunger' | 'fun' | 'social' | 'energy', number>>) =>
    useGame.setState((s) => ({ needs: { ...s.needs, ...Object.fromEntries(Object.entries(fed(d)).map(([k, v]) => [k, Math.max(0, Math.min(100, s.needs[k as keyof typeof s.needs] + (v ?? 0)))])) } }));

  function arrive() {
    useGame.getState().bump('owambes');
    needs({ social: 15, fun: 10 });
  }

  // Who you can spray: the celebrant (or the NPC couple), then everyone else on the square.
  const around = signedIn ? playersAtSquare() : [];
  const targets: { id: string; label: string }[] = [];
  if (party && !party.isHost) targets.push({ id: party.host.uid, label: `${PARTY_KINDS[party.kind].icon} @${party.host.username}` });
  if (!party) targets.push({ id: COUPLE, label: '💑 The couple' });
  for (const p of around) if (p.id !== party?.host.uid) targets.push({ id: p.id, label: `@${p.username}` });
  const chosen = targets.find((t) => t.id === target) ?? targets[0];
  const hostAway = !!party && !party.isHost && chosen?.id === party.host.uid && !around.some((p) => p.id === party.host.uid);

  const gate = (how: 'blag' | 'bribe' | 'sneak') => {
    if (how === 'bribe') {
      if (useGame.getState().charge(2_000, 'Owambe bouncer “tip”') < 2_000) return;
      say('💵 The bouncer pocketed ₦2,000 and suddenly remembered you’re family.');
    } else {
      const ok = Math.random() < (how === 'blag' ? 0.5 : 0.35);
      if (!ok) {
        needs({ social: -15, fun: -10 });
        g.toast(how === 'blag' ? `🚪 “Which cousin? ${party ? `@${party.host.username}` : 'The groom'} has no cousin called that.” Thrown out!` : '🚪 Caught climbing the fence. The whole party saw. 😭');
        return setOwambe(false);
      }
      say(how === 'blag' ? `😎 “I’m ${party ? `@${party.host.username}’s` : 'the groom’s'} cousin from Zaria.” It worked!` : '🥷🏾 You slipped in behind the caterers. Nobody noticed.');
    }
    useGame.getState().bump('crashedOwambe');
    arrive();
    setStage('inside');
  };

  const celebrate = (amount: number, who: string) => {
    needs({ social: Math.min(30, 5 + amount / 2_000), fun: 10 });
    setNotes((n) => [...n, Date.now()].slice(-6));
    say(amount >= PARTY.headline ? `💸💸💸 You emptied ${naira(amount)} on ${who}. The DJ shouted your name three times!` : `💸 You sprayed ${naira(amount)} on ${who}. The crowd roared.`);
  };

  const spray = async (amount: number) => {
    if (!chosen) return;
    if (chosen.id !== COUPLE) {
      const username = chosen.id === party?.host.uid ? party.host.username : online[chosen.id]?.username ?? 'player';
      const paid = await sprayPlayer(chosen.id, username, amount);
      if (paid) celebrate(paid, `@${username}`);
      return;
    }
    if (useGame.getState().charge(amount, `Sprayed money at owambe`) < amount) return;
    useGame.getState().bump('sprayed', amount);
    celebrate(amount, 'the couple’s heads');
    if (amount >= 20_000) useGame.setState((s) => ({ goodDeeds: s.goodDeeds + (amount >= PARTY.headline ? 2 : 1) }));
  };

  const host = async (kind: PartyKind) => {
    const p = await hostParty(kind);
    if (!p) return;
    arrive();
    setLog([`${PARTY_KINDS[kind].icon} The canopies are up, the DJ is warming up. Invite people and stay on the square!`]);
    setStage('inside');
  };

  const eat = () => {
    setAte(true);
    needs({ hunger: 45, fun: 10 });
    say('🍛 Party jollof, moin-moin, small chops and a cold malt. Heaven.');
  };

  const takeaway = () => {
    if (Math.random() < 0.3) {
      needs({ social: -6 });
      say('🛍️ An aunty caught you filling nylon bags. “Ah ah! Mekunu!” She seized it.');
    } else {
      needs({ hunger: 20 });
      say('🛍️ Two nylon bags of jollof and chicken, secured. Mekunu energy.');
    }
  };

  const danceDone = (score: number) => {
    setStage('inside');
    setDanced(true);
    const s = useGame.getState();
    s.bump('danceBest', score, true);
    needs({ fun: 25, energy: -12, social: 10 });
    const tips = score >= 30 ? s.earn('dance_tips', score * 150, 'Owambe dance tips') : 0;
    say(score >= 90 ? `🕺🏾 LEGENDARY! Score ${score}. Guests sprayed you ${naira(tips)}!` : score >= 60 ? `💃🏾 Sharp moves! Score ${score}. ${naira(tips)} in tips.` : score >= 30 ? `🙂 Not bad. Score ${score}. ${naira(tips)} in tips.` : `😅 Score ${score}. An uncle laughed so hard he cried. No tips.`);
  };

  const minsLeft = party ? Math.max(0, Math.ceil((party.endsAt - Date.now()) / 60_000)) : 0;
  const cooling = hostReadyAt > Date.now();
  const guests = Object.values(online).filter((p) => p.id !== myId);

  return (
    <div className="story-overlay owambe-overlay">
      <section className="story-card owambe-card" role="dialog" aria-modal="true" aria-labelledby="owambe-title">
        <div className="owambe-rain" aria-hidden>
          {notes.map((n) => (
            <span key={n}>{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 5) * 0.12}s` }}>💵</i>)}</span>
          ))}
        </div>
        <span className="story-icon">{party ? `${PARTY_KINDS[party.kind].icon}🎊💃🏾` : '💃🏾🎊🕺🏾'}</span>
        <small>OWAMBE · {squareName(useGame.getState().destinationId).toUpperCase()}{party ? ` · ${minsLeft} MIN LEFT` : ''}</small>
        <h2 id="owambe-title">{stage === 'host' ? 'Throw your own owambe' : stage === 'gate' ? 'The gate is guarded' : party ? party.title : 'The party is LIT'}</h2>
        {stage === 'host' && (
          <>
            <p>Book {squareName(useGame.getState().destinationId)} for {Math.round(PARTY.durationMs / 60_000)} minutes: canopies, DJ, jollof for everyone. The city hears about it on Naija Gist, and every naira guests spray on you is yours.</p>
            {!signedIn && <p className="muted">Sign in to host a party for other players.</p>}
            {cooling && <p className="muted">You can host again at {new Date(hostReadyAt).toLocaleTimeString()}.</p>}
            {party && <p className="muted">The square is booked for {party.title} right now.</p>}
            <div className="story-choices">
              {(Object.keys(PARTY_KINDS) as PartyKind[]).map((k) => (
                <button key={k} disabled={!signedIn || partyBusy || cooling || !!party || money < PARTY.fee} onClick={() => void host(k)}>
                  {PARTY_KINDS[k].icon} {PARTY_KINDS[k].label} · {naira(PARTY.fee)}
                </button>
              ))}
              <button onClick={() => setOwambe(false)}>🚶🏾 Maybe another day</button>
            </div>
          </>
        )}
        {stage === 'gate' && (
          <>
            <p>A bouncer with a clipboard and a frown blocks the gate. Your name is not on his list.</p>
            <div className="story-choices">
              <button onClick={() => gate('blag')}>😎 “I’m {party ? `@${party.host.username}’s` : 'the groom’s'} cousin from Zaria” (50%)</button>
              <button disabled={money < 2_000} onClick={() => gate('bribe')}>💵 Tip the bouncer · ₦2,000</button>
              <button onClick={() => gate('sneak')}>🥷🏾 Sneak in with the caterers (35%)</button>
              <button onClick={() => setOwambe(false)}>🚶🏾 Walk away with dignity</button>
            </div>
          </>
        )}
        {stage === 'dance' && <DanceFloor onDone={danceDone} />}
        {stage === 'inside' && (
          <>
            <p>
              {party?.isHost
                ? 'Aso-ebi everywhere and YOU are the celebrant. Stay on the square: guests can only spray you while you’re here.'
                : party
                  ? `Aso-ebi everywhere, the DJ is hailing @${party.host.username}, and the money is flying.`
                  : 'Aso-ebi everywhere, the DJ is playing back-to-back bangers, and the couple just made their entrance.'}
            </p>
            {party && (
              <div className="owambe-board">
                <b>💸 {naira(party.sprayed)} sprayed on @{party.host.username}</b>
                {party.top.map((t, i) => <small key={t.username}>{['🥇', '🥈', '🥉', '4.', '5.'][i]} <Face username={t.username} size="xs" />@{t.username} · {naira(t.amount)}</small>)}
              </div>
            )}
            <div className="owambe-log">{log.map((l, i) => <div key={i}>{l}</div>)}</div>
            <h4>Spray money</h4>
            {targets.length > 0 ? (
              <>
                <div className="owambe-targets" role="radiogroup" aria-label="Who to spray">
                  {targets.map((t) => (
                    <button key={t.id} role="radio" aria-checked={chosen?.id === t.id} className={`btn sm ${chosen?.id === t.id ? 'go' : ''}`} onClick={() => setTarget(t.id)}>{t.label}</button>
                  ))}
                </div>
                {hostAway && <small className="muted">@{party!.host.username} has stepped off the square. Wait for them to come back.</small>}
                <div className="owambe-sprays">
                  {SPRAYS.map((a) => (
                    <button key={a} className="btn sm" disabled={money < a || partyBusy || hostAway} onClick={() => void spray(a)}>💵 {naira(a)}</button>
                  ))}
                </div>
              </>
            ) : (
              <small className="muted">Nobody else is on the square yet. Invite some people!</small>
            )}
            {party?.isHost && (
              <>
                <h4>Invite guests</h4>
                {!guests.length && <small className="muted">Nobody else is online right now. Your party is on Naija Gist, so people may still come.</small>}
                <div className="owambe-targets">
                  {guests.slice(0, 16).map((p) => (
                    <button key={p.id} className="btn sm" disabled={partyBusy || invited.has(p.id)} onClick={() => void inviteGuest(p.id, p.username).then((ok) => ok && setInvited((s) => new Set(s).add(p.id)))}>
                      {invited.has(p.id) ? '✓' : '💌'} <Face uid={p.id} username={p.username} size="xs" />@{p.username}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="story-choices">
              <button disabled={danced} onClick={() => setStage('dance')}>💃🏾 Hit the dance floor {danced ? '(done)' : '· tips for good moves'}</button>
              <button disabled={ate} onClick={eat}>🍛 Chop jollof & small chops {ate ? '(full!)' : ''}</button>
              <button onClick={takeaway}>🛍️ Pack takeaway in nylon</button>
              <button onClick={() => setOwambe(false)}>👋🏾 Leave the party</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
