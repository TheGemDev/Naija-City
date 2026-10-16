// The Fixer's gun dealer (the Fixer's Guns tab; rules: game/guns.ts). Guns are illegal, so this is the only counter:
// guns, rounds, a vest and a bodyguard, and the stick-ups. Get arrested with a gun on you and it goes, with a huge fine.

import { useEffect } from 'react';
import { GUN_LIST, GUN_RULES, GUNS, HOLDUPS, type HoldupKind } from '../game/guns';
import { naira, useGame } from '../game/store';
import { buyAmmo, buyGun, buyVest, hireEscort, holdUp, loadGuns, useGuns } from '../net/guns';
import { useSession } from '../net/session';
import { left, useNow } from './Career';
import { Emoji } from './Icons';
import { FxCard, HowItWorks, Section } from './Vice';
import './vice.css';

const short = (n: number) => (n >= 1_000_000 ? `₦${+(n / 1_000_000).toFixed(1)}m` : `₦${Math.round(n / 1_000)}k`);

/** What I carry: the gun and its rounds, my vest, my bodyguard. */
function Carrying() {
  const state = useGuns((s) => s.state);
  const busy = useGuns((s) => s.busy);
  const money = useGame((s) => s.money);
  const now = useNow(15_000);
  if (!state) return <p className="muted">Loading…</p>;
  const gun = state.gun && GUNS[state.gun.id];
  const box = GUN_RULES.box;
  return (
    <>
      <Section title="On you" />
      {gun ? (
        <FxCard icon={gun.icon} tone="mine" title={gun.name} pill={`${state.gun!.ammo} rounds`} sub={`Illegal. Get arrested with it on you and it’s gone, with a ${naira(gun.fine)} fine.`}>
          <div className="fx-actions">
            <button className="btn sm" disabled={busy || money < box.price} onClick={() => void buyAmmo()}>Box of {box.rounds} rounds · {short(box.price)}</button>
          </div>
        </FxCard>
      ) : (
        <p className="fx-empty">You aren’t carrying a gun.</p>
      )}
      {(state.vest > 0 || (state.escortUntil ?? 0) > now) && (
        <div className="fx-chips">
          {state.vest > 0 && <small><Emoji char="🦺" size={13} /> Vest stops {state.vest} more</small>}
          {(state.escortUntil ?? 0) > now && <small><Emoji char="🕶️" size={13} /> Bodyguard for {left(state.escortUntil! - now)}</small>}
        </div>
      )}
    </>
  );
}

/** The guns on sale here. Buying one replaces the one you have. */
function Stock() {
  const state = useGuns((s) => s.state);
  const busy = useGuns((s) => s.busy);
  const money = useGame((s) => s.money);
  return (
    <>
      <Section title="Under the counter" />
      {GUN_LIST.map((g) => {
        const mine = state?.gun?.id === g.id;
        return (
          <FxCard key={g.id} icon={g.icon} title={g.name} pill={`${Math.round(g.aim * 100)}% hit`} sub={`${g.blurb} Caught with it: ${short(g.fine)} fine.`}>
            <div className="fx-actions">
              <button className="btn sm" disabled={busy || money < g.price} onClick={() => {
                if (state?.gun && !window.confirm(`Swap your ${GUNS[state.gun.id].name} for the ${g.name}? The old one goes.`)) return;
                void buyGun(g.id);
              }}>{mine ? 'Buy another' : 'Buy'} · {naira(g.price)}</button>
            </div>
          </FxCard>
        );
      })}
    </>
  );
}

/** Protection: a vest and an armed bodyguard. */
function Protection() {
  const busy = useGuns((s) => s.busy);
  const money = useGame((s) => s.money);
  const { vest, escort } = GUN_RULES;
  return (
    <>
      <Section title="Stay alive" />
      <FxCard icon="🦺" title="Bulletproof vest" pill={short(vest.price)} sub={`Stops the next ${vest.hits} bullets that would have put you in hospital.`}>
        <div className="fx-actions"><button className="btn sm" disabled={busy || money < vest.price} onClick={() => void buyVest()}>Wear one · {naira(vest.price)}</button></div>
      </FxCard>
      <FxCard icon="🕶️" title="Armed bodyguard" pill={short(escort.price)} sub={`Walks behind you for ${escort.hours} hours and stops ${Math.round(escort.stops * 100)}% of anyone who pulls a gun on you, and shoots back.`}>
        <div className="fx-actions"><button className="btn sm" disabled={busy || money < escort.price} onClick={() => void hireEscort()}>Hire · {naira(escort.price)}</button></div>
      </FxCard>
    </>
  );
}

/** Stick-ups of people who aren't players. */
function Stickups() {
  const state = useGuns((s) => s.state);
  const busy = useGuns((s) => s.busy);
  const now = useNow(5_000);
  const wait = (state?.readyAt ?? 0) - now;
  const loaded = !!state?.gun && state.gun.ammo >= GUNS[state.gun.id].rounds;
  return (
    <>
      <Section title="Stick-ups" extra={wait > 0 ? `Lie low ${left(wait)}` : undefined} />
      {(Object.keys(HOLDUPS) as HoldupKind[]).map((k) => {
        const h = HOLDUPS[k];
        return (
          <FxCard key={k} icon={h.icon} title={h.label} pill={`${short(h.loot[0])}–${short(h.loot[1])}`} sub={`${h.blurb} Police ${Math.round(h.police * 100)}% of the time.`}>
            <div className="fx-actions">
              <button className="btn sm danger" disabled={busy || !loaded || wait > 0} onClick={() => void holdUp(k)}>{!state?.gun ? 'Buy a gun first' : !loaded ? 'Out of rounds' : k === 'shop' ? 'Walk in with it out' : 'Stop someone'}</button>
            </div>
          </FxCard>
        );
      })}
      <small className="fx-note">To rob or shoot a player, stand close to them and tap them. Their bodyguard, their own gun or their vest may answer first.</small>
    </>
  );
}

export function GunCounter() {
  const signedIn = !!useSession((s) => s.user?.username);
  useEffect(() => {
    if (signedIn) void loadGuns();
  }, [signedIn]);
  if (!signedIn) return <p className="muted">Sign in to buy a gun.</p>;
  return (
    <>
      <HowItWorks>
        Guns are illegal in Nigeria, so they only come from here. Get arrested for anything with one on you and the police
        seize it and fine you hard. Shoot someone and they wake up in hospital. Gunshots bring the police.
      </HowItWorks>
      <Carrying />
      <Stock />
      <Protection />
      <Stickups />
    </>
  );
}
