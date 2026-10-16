// The gun counter (rules: game/guns.ts): the licensed Gun Shop app, and the Fixer's dealer under the counter (the
// Fixer's Guns tab). Same counter, different stock: the shop wants a clean record and puts your gun on the police
// register; the dealer sells anything to anyone, dearer, and throws in the stick-ups.

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
function Carrying({ source }: { source: 'shop' | 'black' }) {
  const state = useGuns((s) => s.state);
  const busy = useGuns((s) => s.busy);
  const money = useGame((s) => s.money);
  const now = useNow(15_000);
  if (!state) return <p className="muted">Loading…</p>;
  const gun = state.gun && GUNS[state.gun.id];
  const box = GUN_RULES.box;
  const canBuyRounds = !!state.gun && (source === 'black' || state.gun.licensed);
  return (
    <>
      <Section title="On you" />
      {gun ? (
        <FxCard icon={gun.icon} tone="mine" title={gun.name} pill={`${state.gun!.ammo} rounds`} sub={state.gun!.licensed ? 'Licensed and on the police register.' : 'No licence: the police take it at your next arrest.'}>
          {canBuyRounds && (
            <div className="fx-actions">
              <button className="btn sm" disabled={busy || money < box[source]} onClick={() => void buyAmmo(source)}>Box of {box.rounds} rounds · {short(box[source])}</button>
            </div>
          )}
          {!canBuyRounds && <small className="fx-note">The gun shop only sells rounds for licensed guns. The Fixer’s dealer sells them for anything.</small>}
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
function Stock({ source }: { source: 'shop' | 'black' }) {
  const state = useGuns((s) => s.state);
  const busy = useGuns((s) => s.busy);
  const money = useGame((s) => s.money);
  const license = source === 'shop' ? state?.license : null;
  const fee = source === 'shop' ? GUN_RULES.license.fee : 0;
  return (
    <>
      <Section title={source === 'shop' ? 'On the shelf' : 'Under the counter'} />
      {license && !license.ok && <FxCard icon="🔒" tone="alert" title="No licence for you" sub={license.why ?? undefined} />}
      {GUN_LIST.filter((g) => (source === 'shop' ? g.shop !== null : true)).map((g) => {
        const price = (source === 'shop' ? g.shop! : g.black) + fee;
        const mine = state?.gun?.id === g.id;
        return (
          <FxCard key={g.id} icon={g.icon} title={g.name} pill={`${Math.round(g.aim * 100)}% hit`} sub={g.blurb}>
            <div className="fx-actions">
              <button className="btn sm" disabled={busy || money < price || (license ? !license.ok : false)} onClick={() => {
                if (state?.gun && !window.confirm(`Swap your ${GUNS[state.gun.id].name} for the ${g.name}? The old one goes.`)) return;
                void buyGun(g.id, source);
              }}>{mine ? 'Buy another' : 'Buy'} · {naira(price)}</button>
            </div>
          </FxCard>
        );
      })}
      {source === 'shop' && <small className="fx-note">Prices include the {naira(fee)} licence, paid to the federal treasury. A licensed gun used in a crime loses its licence.</small>}
    </>
  );
}

/** Protection, from the shop: a vest and an armed bodyguard. */
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

export function GunCounter({ source }: { source: 'shop' | 'black' }) {
  const signedIn = !!useSession((s) => s.user?.username);
  useEffect(() => {
    if (signedIn) void loadGuns();
  }, [signedIn]);
  if (!signedIn) return <p className="muted">Sign in to buy a gun.</p>;
  return (
    <>
      <HowItWorks>
        {source === 'shop'
          ? `The licensed gun shop: no arrest in the last ${GUN_RULES.license.cleanMs / 86_400_000} days, and the gun goes on the police register. Use it in a crime and the police know exactly whose it was.`
          : 'The dealer’s guns have no papers: the police only trace them most of the time, but they take one off you at your next arrest. Dearer, and he has things the shop will never sell.'}
        {' '}Shoot someone and they wake up in hospital. Gunshots bring the police.
      </HowItWorks>
      <Carrying source={source} />
      <Stock source={source} />
      {source === 'shop' ? <Protection /> : <Stickups />}
    </>
  );
}

/** The licensed Gun Shop phone app. */
export function GunShopApp() {
  return (
    <>
      <div className="hero hero-dark">
        <small>Licensed firearms dealer</small>
        <b>🔫 Gun Shop</b>
        <small>Clean record, paperwork, and a vest for the road.</small>
      </div>
      <GunCounter source="shop" />
    </>
  );
}
