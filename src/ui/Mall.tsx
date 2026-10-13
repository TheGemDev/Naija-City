import { useState } from 'react';
import { FOOD_DELIVERY, FOOD_ENERGY } from '../game/catalog';
import { PHONES, PHONE_TIERS, type PhoneOS } from '../game/phones';
import { naira, useGame } from '../game/store';
import { cityNameHere } from '../game/regions';
import { Emoji } from './Icons';
import { MiniPhone } from './PhoneShop';

type MallCategory = 'phones' | 'essentials';

const CATEGORIES: { id: MallCategory; label: string; icon: string }[] = [
  { id: 'phones', label: 'Phones', icon: '📱' },
  { id: 'essentials', label: 'Food & essentials', icon: '🛵' },
];

const PHONE_FILTERS: { id: PhoneOS | 'all'; label: string; icon?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ios', label: 'iPhone', icon: '🍏' },
  { id: 'android', label: 'Android', icon: '🤖' },
];

export function Mall() {
  // Hungry people came for food.
  const [category, setCategory] = useState<MallCategory>(() => (useGame.getState().needs.hunger < 40 ? 'essentials' : 'phones'));
  const [os, setOs] = useState<PhoneOS | 'all'>('all');
  const money = useGame((s) => s.money);
  const ownedPhones = useGame((s) => s.ownedPhones);
  const currentPhone = useGame((s) => s.phone);
  const deliveries = useGame((s) => s.deliveries);
  // Whole minutes only: the rider's countdown does not need a redraw every tick.
  const minutes = useGame((s) => Math.floor(s.minutes));
  const { buyPhone, usePhone, orderFood } = useGame.getState();

  return (
    <>
      <div className="hero hero-green mall-hero">
        <small>Jumia · {cityNameHere()} delivery</small>
        <b>Everything you need <Emoji char="🛍️" size={20} /></b>
        <small>Phones and food · Balance: {naira(money)}</small>
      </div>
      <div className="tabs mall-tabs">
        {CATEGORIES.map((item) => (
          <button key={item.id} className={category === item.id ? 'on' : ''} onClick={() => setCategory(item.id)}>
            <Emoji char={item.icon} size={14} /> {item.label}
          </button>
        ))}
      </div>

      {category === 'phones' && (
        <>
          <div className="pills mall-filter">
            {PHONE_FILTERS.map((filter) => (
              <button key={filter.id} className={os === filter.id ? 'on' : ''} onClick={() => setOs(filter.id)}>
                {filter.icon && <Emoji char={filter.icon} size={14} />} {filter.label}
              </button>
            ))}
          </div>
          {PHONE_TIERS.map((tier) => {
            const list = PHONES.filter((phone) => phone.tier === tier.key && (os === 'all' || phone.os === os));
            if (!list.length) return null;
            return (
              <div key={tier.key} className="mall-group">
                <b>{tier.label}</b>
                <div className="mall-phones">
                  {list.map((phone) => {
                    const owned = ownedPhones.includes(phone.id);
                    const active = currentPhone === phone.id;
                    return (
                      <div key={phone.id} className={`mall-phone ${active ? 'picked' : ''}`}>
                        <span className="mall-phone-pic"><MiniPhone phone={phone} size={62} /></span>
                        <b>{phone.name}</b>
                        <small>{phone.os === 'ios' ? 'iOS' : 'Android'}{phone.fold ? ' · Opens wide' : ''}</small>
                        <span className="mall-phone-price">{naira(phone.price)}</span>
                        {active ? (
                          <span className="pill-tag on">In your hand</span>
                        ) : owned ? (
                          <button className="btn sm" onClick={() => usePhone(phone.id)}>Use</button>
                        ) : (
                          <button className="btn sm go" disabled={money < phone.price} onClick={() => buyPhone(phone.id)}>Buy</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="mall-note"><Emoji char="ℹ️" size={13} /> Fold phones only open wide on desktop. On a small screen they look like a normal phone.</p>
        </>
      )}

      {category === 'essentials' && (
        <>
          <div className={`mall-delivery ${deliveries.length ? 'on' : ''}`}>
            <Emoji char="🛵" size={28} />
            <span className="mall-delivery-info">
              <b>{deliveries.length ? `${deliveries.length} order${deliveries.length === 1 ? '' : 's'} on the way` : `Fast delivery around ${cityNameHere()}`}</b>
              {deliveries.length ? (
                deliveries.map((delivery, i) => (
                  <small key={i}><Emoji char={delivery.icon} size={13} /> {delivery.name} · {Math.max(1, Math.ceil(delivery.at - minutes))} min away</small>
                ))
              ) : (
                <small>Meals arrive in about 40 in-game minutes.</small>
              )}
            </span>
          </div>
          <div className="mall-foods">
            {FOOD_DELIVERY.map((food) => (
              <div key={food.id} className="mall-food">
                <span className="mall-food-pic"><Emoji char={food.icon} size={32} /></span>
                <span className="mall-food-info">
                  <b>{food.name}</b>
                  <span className="mall-food-stats">
                    <span><Emoji char="🍛" size={12} /> +{food.hunger}</span>
                    <span><Emoji char="⚡" size={12} /> +{Math.round(food.hunger * FOOD_ENERGY)}</span>
                    <span><Emoji char="🎉" size={12} /> +{food.fun}</span>
                  </span>
                </span>
                <span className="mall-food-buy">
                  <b className="food-price">{naira(food.price)}</b>
                  <button className="btn sm go" disabled={money < food.price} onClick={() => orderFood(food.id)}>Order</button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
