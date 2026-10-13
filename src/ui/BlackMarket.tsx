// Black Market phone app: sell furniture you stole (your name is on the listing), or buy hot goods
// at half price. Rules in src/game/blackmarket.ts, server in worker/blackmarket.ts.

import { useEffect, useState } from 'react';
import { ITEMS } from '../game/catalog';
import { blackMarketFee, blackMarketPrice, type BlackMarketListing } from '../game/blackmarket';
import { naira, useGame } from '../game/store';
import { FINE, meterFine, meterOn, METER, REASON_TEXT } from '../game/meterBypass';
import { saveLocal } from '../game/save';
import { api, pushSave, useSession } from '../net/session';
import { setServerBalance } from '../net/wallet';

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await api(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
  return data;
}

const ago = (at: number) => {
  const m = Math.floor((Date.now() - at) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
};

/** Put a piece of furniture into (or take one out of) storage to match what the server just did. */
function giveItem(type: string) {
  useGame.setState((s) => ({ furnitureInventory: [...s.furnitureInventory, { id: `bm-${crypto.randomUUID()}`, type, x: 0, z: 0, rot: 0, stolen: true }] }));
  saveLocal();
  void pushSave();
}
function takeItem(type: string) {
  useGame.setState((s) => {
    const i = s.furnitureInventory.findIndex((x) => x.type === type);
    return i < 0 ? {} : { furnitureInventory: s.furnitureInventory.filter((_, j) => j !== i) };
  });
  saveLocal();
  void pushSave();
}

export function BlackMarketApp() {
  const signedIn = !!useSession((s) => s.user?.username);
  const myUid = useSession((s) => s.user?.uid);
  const money = useGame((s) => s.money);
  const storage = useGame((s) => s.furnitureInventory);
  const toast = useGame((s) => s.toast);
  const meter = useGame((s) => s.meter);
  const minutes = useGame((s) => s.minutes);
  const hireMeterBoy = useGame((s) => s.hireMeterBoy);
  const restoreMeter = useGame((s) => s.restoreMeter);
  const [tab, setTab] = useState<'buy' | 'sell' | 'light'>('buy');
  const [listings, setListings] = useState<BlackMarketListing[]>([]);
  const [mine, setMine] = useState<BlackMarketListing[]>([]);
  const [sellable, setSellable] = useState<Record<string, number>>({});
  const [stolen, setStolen] = useState<{ id: number; item: string; at: number; victim: string; fate: 'fenced' | 'recovered' | 'kept' }[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () =>
    call<{ listings: BlackMarketListing[]; mine: BlackMarketListing[]; sellable: Record<string, number>; stolen?: typeof stolen }>('/api/blackmarket')
      .then((d) => { setListings(d.listings); setMine(d.mine); setSellable(d.sellable); setStolen(d.stolen ?? []); })
      .catch(() => {});
  useEffect(() => {
    if (!signedIn) return;
    void load();
    const id = setInterval(() => void load(), 20_000);
    return () => clearInterval(id);
  }, [signedIn]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { toast(e instanceof Error ? e.message : 'The connect fell through'); } finally {
      setBusy(false);
      void load();
    }
  };

  if (!signedIn) {
    return <div className="list-card" style={{ padding: 14 }}><b>🕶️ Sign in first</b><small className="muted">The plug only deals with people he can find.</small></div>;
  }

  // Stolen pieces sitting in storage (placed ones have to be picked up first).
  const inStorage = Object.entries(sellable)
    .map(([type, n]) => ({ type, n: Math.min(n, storage.filter((i) => i.type === type).length), total: n }))
    .filter((x) => x.total > 0);

  return (
    <>
      <div className="hero" style={{ background: 'linear-gradient(135deg, #292524, #0c0a09)' }}>
        <small>No questions asked</small>
        <b>🕶️ Black Market</b>
        <small>Everything goes for half price. Your name is on every listing, so the owner might see it 👀</small>
      </div>
      <div className="tabs">
        <button className={tab === 'buy' ? 'on' : ''} onClick={() => setTab('buy')}>🛒 Buy{listings.length ? ` (${listings.length})` : ''}</button>
        <button className={tab === 'sell' ? 'on' : ''} onClick={() => setTab('sell')}>💰 Sell</button>
        <button className={tab === 'light' ? 'on' : ''} onClick={() => setTab('light')}>💡 Light{meterOn(meter) ? ' ●' : ''}</button>
      </div>

      {tab === 'buy' && (
        <>
          {!listings.length && <small className="muted">Nothing hot right now. Check back later.</small>}
          {listings.map((l) => {
            const def = ITEMS[l.item];
            const own = l.sellerUid === myUid;
            return (
              <div className="tile" key={l.id}>
                <span className="tile-icon">{def?.icon ?? '📦'}</span>
                <span className="tile-info">
                  <b>{def?.name ?? l.item}</b>
                  <small>Sold by @{l.seller} · {ago(l.at)}</small>
                  <small>
                    <b className="good">{naira(l.price)}</b>
                    {def ? <s className="muted" style={{ marginLeft: 6 }}>{naira(def.price)}</s> : null}
                  </small>
                </span>
                {!own && (
                  <button
                    className="btn sm go"
                    disabled={busy || money < l.price}
                    onClick={() => run(async () => {
                      const r = await call<{ item: string; balance: number }>('/api/blackmarket/buy', { id: l.id });
                      setServerBalance(r.balance);
                      giveItem(r.item);
                      toast(`🕶️ Bought a ${def?.name ?? 'item'}. It’s in your furniture storage. Don’t ask where it came from.`);
                    })}
                  >
                    {money < l.price ? 'Can’t afford' : 'Buy'}
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}

      {tab === 'light' && (
        <>
          <h4>Light connect</h4>
          <small className="muted">
            Call a NEPA boy to bypass your meter so light is cheap or free. No bill, no wahala… until NEPA and the police do a random check, a neighbour snitches, or someone who visits your house reports the wire.
          </small>
          {(['tamper', 'bypass'] as const).map((level) => {
            const cfg = METER[level];
            const on = meter.level === level;
            const banned = minutes < meter.banUntil;
            return (
              <div className="tile" key={level}>
                <span className="tile-icon">{cfg.icon}</span>
                <span className="tile-info">
                  <b>{cfg.label}{on ? ' · running' : ''}</b>
                  <small>{cfg.blurb}</small>
                  <small>Boy’s fee <b className="good">{naira(cfg.cost)}</b> · you pay {Math.round(cfg.billShare * 100)}% of the bill</small>
                </span>
                <button
                  className="btn sm danger"
                  disabled={on || banned || money < cfg.cost}
                  onClick={() => hireMeterBoy(level)}
                >
                  {on ? 'Active' : banned ? 'Blacklisted' : money < cfg.cost ? `Fee ${naira(cfg.cost)}` : 'Connect'}
                </button>
              </div>
            );
          })}
          {meterOn(meter) && (
            <div className="tile">
              <span className="tile-icon">⚠️</span>
              <span className="tile-info">
                <b>Light you haven’t paid for: {naira(Math.round(meter.saved))}</b>
                <small>If you’re caught the fine is about <b>{naira(meterFine(meter))}</b> on your NEPA bill, and they put the meter right.</small>
                {meter.reported !== null && <small className="muted">📞 Somebody called NEPA on you. Inspectors are coming.</small>}
              </span>
              <button className="btn sm" onClick={() => window.confirm('Have the boy put the meter back to normal? You keep what you saved; you just pay full price from now on.') && restoreMeter()}>
                Restore meter
              </button>
            </div>
          )}
          {minutes < meter.banUntil && (
            <small className="muted">🚫 NEPA is watching your house. The plug won’t touch your meter for about {Math.max(1, Math.ceil((meter.banUntil - minutes) / 1440))} more day(s).</small>
          )}
          {meter.strikes > 0 && (
            <small className="muted">Times caught: {meter.strikes}. Each strike adds {naira(FINE.perStrike)} to the fine and makes checks more likely.</small>
          )}
          {meter.log.length > 0 && (
            <>
              <h4>Checks on your meter</h4>
              {meter.log.map((e, i) => (
                <div className="tile" key={`${e.at}-${i}`}>
                  <span className="tile-icon">{e.found ? '🚨' : '🕵🏾'}</span>
                  <span className="tile-info">
                    <b>{REASON_TEXT[e.reason]}{e.by ? ` (@${e.by})` : ''}</b>
                    <small>{e.found ? `Caught. Fined ${naira(e.fine)}.` : 'They found nothing.'}</small>
                  </span>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {tab === 'sell' && (
        <>
          <h4>Your stolen goods</h4>
          <small className="muted">Only furniture you took in a burglary. It sells for half its shop price; listing costs a fee you don’t get back.</small>
          {!inStorage.length && (
            <small className="muted">
              {stolen.length
                ? 'None of the furniture you stole is still with you (see below). Steal something and keep it in storage to sell it here.'
                : 'You have nothing hot to sell. Break into a house, tap a piece of furniture and carry it out… or don’t.'}
            </small>
          )}
          {inStorage.map(({ type, n, total }) => {
            const def = ITEMS[type];
            const fee = blackMarketFee(type);
            return (
              <div className="tile" key={type}>
                <span className="tile-icon">{def?.icon ?? '📦'}</span>
                <span className="tile-info">
                  <b>{def?.name ?? type} × {total}</b>
                  <small>Sells for <b className="good">{naira(blackMarketPrice(type))}</b> · listing fee {naira(fee)}</small>
                  {n < total && <small className="muted">{total - n} placed in a house: put it back in storage to sell it</small>}
                </span>
                <button
                  className="btn sm danger"
                  disabled={busy || n < 1 || money < fee}
                  onClick={() => window.confirm(`List your ${def?.name ?? 'item'} for ${naira(blackMarketPrice(type))}? The ${naira(fee)} fee is not refunded and your name will be on it.`) && run(async () => {
                    const r = await call<{ balance: number }>('/api/blackmarket/list', { item: type });
                    setServerBalance(r.balance);
                    takeItem(type);
                    toast(`🕶️ ${def?.name ?? 'Item'} listed. Everybody can see it’s from you.`);
                  })}
                >
                  {money < fee ? `Fee ${naira(fee)}` : 'List'}
                </button>
              </div>
            );
          })}

          {stolen.length > 0 && (
            <>
              <h4>Everything you’ve stolen</h4>
              {stolen.map((c) => {
                const def = ITEMS[c.item];
                const ready = c.fate === 'kept' && (sellable[c.item] ?? 0) > 0;
                const note = c.fate === 'fenced'
                  ? 'Sold for cash on the spot (old break-in). You never kept it.'
                  : c.fate === 'recovered'
                    ? 'The police got it back for the owner.'
                    : ready
                      ? storage.some((i) => i.type === c.item) ? '✅ In your storage: you can list it above.' : 'Placed in a house. Put it back in storage to list it.'
                      : 'You don’t have it any more (sold, listed, or someone stole it from you).';
                return (
                  <div className="tile" key={c.id}>
                    <span className="tile-icon">{def?.icon ?? '📦'}</span>
                    <span className="tile-info">
                      <b>{def?.name ?? c.item} · from @{c.victim}</b>
                      <small>{note} · {ago(c.at)}</small>
                    </span>
                  </div>
                );
              })}
            </>
          )}

          {mine.length > 0 && (
            <>
              <h4>Your listings</h4>
              {mine.map((l) => (
                <div className="tile" key={l.id}>
                  <span className="tile-icon">{ITEMS[l.item]?.icon ?? '📦'}</span>
                  <span className="tile-info">
                    <b>{ITEMS[l.item]?.name ?? l.item} · {naira(l.price)}</b>
                    <small>
                      {l.status === 'sold' ? `✅ Sold to @${l.buyer}` : l.status === 'cancelled' ? 'Taken down' : `On sale · ${ago(l.at)}`}
                    </small>
                  </span>
                  {l.status === 'listed' && (
                    <button
                      className="btn sm"
                      disabled={busy}
                      onClick={() => run(async () => {
                        const r = await call<{ item: string }>('/api/blackmarket/cancel', { id: l.id });
                        giveItem(r.item);
                        toast('📦 Taken down. It’s back in your storage.');
                      })}
                    >
                      Take down
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}
