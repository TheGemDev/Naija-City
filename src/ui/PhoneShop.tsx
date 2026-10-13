import { useState } from 'react';
import { cutoutOf, PHONES, PHONE_RESALE_FACTOR, PHONE_TIERS, type PhoneDef, type PhoneTier } from '../game/phones';
import './phones.css';
import { naira, useGame } from '../game/store';

/** A little drawing of a phone in its frame colour, with its own camera cutout and shape: wide for folds, tall for the flip, squat for the Duo. */
export function MiniPhone({ phone, size = 54 }: { phone: PhoneDef; size?: number }) {
  return (
    <span
      className={`mini-phone os-${phone.os} cut-${cutoutOf(phone)} ${phone.fold ? 'fold' : ''} ${phone.flip ? 'flip' : ''} ${phone.duo ? 'duo' : ''}`}
      style={{ ['--fa' as string]: phone.frame[0], ['--fb' as string]: phone.frame[1], height: size }}
    >
      <i
        className="mini-screen"
        style={
          phone.wall.kind === 'hills'
            ? undefined
            : { background: `radial-gradient(circle at 70% 75%, ${phone.wall.colors[2]}, transparent 55%), linear-gradient(170deg, ${phone.wall.colors[0]}, ${phone.wall.colors[1]})` }
        }
      />
      <i className="mini-cam" />
    </span>
  );
}

/** Phone shop at the market's phone village or the mall. */
export function PhoneShop() {
  const open = useGame((s) => s.panel === 'phoneShop');
  const money = useGame((s) => s.money);
  const current = useGame((s) => s.phone);
  const owned = useGame((s) => s.ownedPhones);
  const freePhone = useGame((s) => s.freePhone);
  const [tier, setTier] = useState<PhoneTier | 'mine'>('budget');
  if (!open) return null;
  const { buyPhone, usePhone, sellPhone, setPanel } = useGame.getState();
  const list = tier === 'mine' ? PHONES.filter((p) => owned.includes(p.id)) : PHONES.filter((p) => p.tier === tier);

  return (
    <div className="sheet closet phone-shop">
      <div className="sheet-head">
        <h3>📱 Phone shop</h3>
        <button className="ghost-btn" onClick={() => setPanel(null)}>
          Done
        </button>
      </div>
      <p className="muted small closet-blurb">New and sealed. Your balance: <b>{naira(money)}</b>. Old phones sell back for {Math.round(PHONE_RESALE_FACTOR * 100)}%.</p>
      <div className="tabs">
        {PHONE_TIERS.map((t) => (
          <button key={t.key} className={t.key === tier ? 'on' : ''} onClick={() => setTier(t.key)}>
            {t.label}
          </button>
        ))}
        <button className={tier === 'mine' ? 'on' : ''} onClick={() => setTier('mine')}>
          My phones ({owned.length})
        </button>
      </div>
      <div className="phone-list">
        {list.map((p) => {
          const mine = owned.includes(p.id);
          const inHand = current === p.id;
          return (
            <div key={p.id} className={`phone-item ${inHand ? 'picked' : ''}`}>
              <MiniPhone phone={p} />
              <span className="phone-item-info">
                <b>{p.name}</b>
                <small>
                  {p.os === 'ios' ? '🍏 iOS' : '🤖 Android'} · {p.brand}
                </small>
                <small>{p.blurb}</small>
              </span>
              <span className="phone-item-act">
                {inHand ? (
                  <span className="pill-tag on">In your hand</span>
                ) : mine ? (
                  <>
                    <button className="btn sm go" onClick={() => usePhone(p.id)}>
                      Use
                    </button>
                    {freePhone !== p.id && (
                      <button className="btn sm" onClick={() => window.confirm(`Sell your ${p.name} for ${naira(Math.round(p.price * PHONE_RESALE_FACTOR))}?`) && sellPhone(p.id)}>
                        Sell {naira(Math.round(p.price * PHONE_RESALE_FACTOR))}
                      </button>
                    )}
                  </>
                ) : (
                  <button className="btn sm go" disabled={money < p.price} onClick={() => buyPhone(p.id)}>
                    Buy {naira(p.price)}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
