import { brokenAsset } from '../net/roads';
import { useEffect, useState } from 'react';
import { ItemThumb } from '../three/thumbnails';
import { CATEGORIES, ITEMS, ITEM_LIST, JOBS, type ActionDef, type Category } from '../game/catalog';
import { findAction, hourOf, houseKeyOf, isPowered, naira, taskDurationSeconds, ticketOf, useGame, type TravelMode, activeDesignOf } from '../game/store';
import { cityMap, hoursLabel, isOpen, PLACE_BY_ID } from '../game/city';
import { cityNameHere, regionPlaces } from '../game/regions';
import { employment } from '../game/jobs';
import { INTERIORS } from '../game/interiors';
import { WALL_BUILD_COST, WALL_KNOCK_COST, edgeKey, houseLayout, wallBuildError } from '../game/grid';
import { avatarCell } from '../game/avatar';
import { kmBetween } from '../game/fares';
import { useTravel } from './TravelPicker';
import { WorkNote } from './WorkChip';
import { PlaceHappening } from './LiveApps';
import { PlaceShopsLine, PlaceShopsPanel } from './Market';
import { usePlaceShops } from '../net/market';
import { useHeldOffice } from '../net/office';
import { TravelSheet, carDry, fareOf, tripCost } from './TravelSheet';
import { ITEM_PAINT, WALL_PARTS } from '../game/paint';
import { LIGHTS } from '../game/finishes';
import { ColourPicker, FinishesTab, LampControls } from './Finishes';
import { placeLink, shareLink } from '../net/deeplink';
import { Emoji, Icon } from './Icons';
import { useApps } from '../game/apps';
import { PIE_MENU } from './PieMenu';
import { DecorPlaceBar, OwnedDecorTools } from './DecorTools';

/** One row of the activities sheet. Shared with the visit bar so visiting a house looks the same as being home. */
export function ActionRow({ action: a, sub, dim, onClick }: { action: ActionDef; sub: string; dim?: boolean; onClick: () => void }) {
  return (
    <button className={`action ${dim ? 'dim' : ''}`} onClick={onClick}>
      <span className="ai">{a.icon}</span>
      <span>
        <b>{a.label}</b>
        <small>{sub}</small>
      </span>
    </button>
  );
}

/** What the selected item (at home) or prop (inside a place) offers: its title, and each action with its line of detail. */
export function useSelectedActions() {
  const selectedId = useGame((s) => s.selectedId);
  const items = useGame((s) => s.items);
  const mode = useGame((s) => s.mode);
  const view = useGame((s) => s.view);
  const insideId = useGame((s) => s.insideId);
  const powered = useGame(isPowered);
  const jobId = useGame((s) => s.jobId);
  const jobPlace = useGame((s) => employment(s)?.place.name);
  const office = useHeldOffice();
  // A ticket (a train at the station's ticket office) shows its price after the fare subsidy.
  const fares = useGame((s) => s.fares);
  const region = useGame((s) => s.destinationId);
  if (mode !== 'live' || !selectedId) return null;

  let title: string;
  let actions: ActionDef[];
  if (view === 'place' && insideId) {
    const prop = INTERIORS[insideId]?.props.find((p) => p.id === selectedId);
    if (!prop) return null;
    title = prop.name ?? 'Here';
    actions = prop.actions.map((a) => findAction(prop.id, a, items, insideId)).filter((a): a is ActionDef => !!a && (!a.office || a.office === office));
  } else {
    const item = items.find((i) => i.id === selectedId);
    if (!item) return null;
    const def = ITEMS[item.type];
    title = `${def.icon} ${def.name}`;
    actions = def.actions;
  }
  const job = JOBS.find((j) => j.id === jobId);
  const placeJob = view === 'place' && insideId ? JOBS.find((j) => PLACE_BY_ID[insideId]?.jobs?.includes(j.id)) : undefined;
  const rows = actions.map((a) => {
    const noPower = a.needsPower && !powered;
    const sub =
      a.effect === 'work'
        ? placeJob
          ? `${placeJob.title} · ${placeJob.start}:00–${placeJob.end}:00`
          : job
            ? `${job.title} at ${jobPlace} · ${job.start}:00–${job.end}:00`
            : 'Get a job from Phone → Jobs'
        : a.effect === 'goCity'
          ? 'Walk out to the town map'
          : [a.minutes ? `${taskDurationSeconds(a.minutes, a.minutes, !!(a.cookingPerHour || a.fast))} sec` : null, a.cost ? naira(ticketOf(a, region, fares)?.price ?? a.cost) : null, noPower ? 'needs light' : null].filter(Boolean).join(' · ');
    return { action: a, sub, dim: !!noPower };
  });
  return { selectedId, title, rows };
}

/** Live mode: tap an item (at home) or a prop (inside a place) → choose what to do with it. On desktop the pie menu
 *  round the object does this instead (PieMenu.tsx). */
export function ActionSheet() {
  const sel = useSelectedActions();
  const start = useGame((s) => s.startAction);
  const select = useGame((s) => s.select);
  if (!sel || PIE_MENU) return null;
  return (
    <div className="sheet small">
      <div className="sheet-head">
        <h3>{sel.title}</h3>
        <button className="x" onClick={() => select(null)}>
          ✕
        </button>
      </div>
      {sel.rows.length === 0 && <p className="muted">Nothing to do with this one. E fine sha ✨</p>}
      <div className="actions">
        {sel.rows.map(({ action: a, sub, dim }) => (
          <ActionRow key={a.id} action={a} sub={sub} dim={dim} onClick={() => start(sel.selectedId, a.id)} />
        ))}
      </div>
    </div>
  );
}

/** Buy mode catalogue. */
export function BuyPanel() {
  const mode = useGame((s) => s.mode);
  const placing = useGame((s) => s.placing);
  const selectedId = useGame((s) => s.selectedId);
  const money = useGame((s) => s.money);
  const furnitureInventory = useGame((s) => s.furnitureInventory);
  const startPlacing = useGame((s) => s.startPlacing);
  const wallMode = useGame((s) => s.wallMode);
  const setWallMode = useGame((s) => s.setWallMode);
  const [cat, setCat] = useState<Category>('comfort');
  const [hidden, setHidden] = useState(false);
  const [picked, setPicked] = useState<HouseTab | null>(null);
  if (mode !== 'buy' || placing || selectedId) return null;
  // Wall edit mode follows the tab: tapping the house picks a wall edge only while Walls is open.
  const stolen = furnitureInventory.length;
  const tab: HouseTab | null = wallMode ? 'walls' : picked === 'stolen' && !stolen ? null : picked === 'walls' ? null : picked;
  const back = () => {
    setPicked(null);
    setHidden(false);
    if (wallMode) setWallMode(false);
  };
  const choose = (t: HouseTab) => {
    setPicked(t);
    setHidden(false);
    if (wallMode !== (t === 'walls')) setWallMode(t === 'walls');
  };
  const list = ITEM_LIST.filter((i) => i.category === cat && !i.fixed);
  const tabs: { key: HouseTab; icon: string; label: string; sub: string; count?: number }[] = [
    { key: 'furniture', icon: '🛋️', label: 'Furniture', sub: 'Buy & place' },
    ...(stolen ? (furnitureInventory.every((i) => i.stolen)
      ? [{ key: 'stolen' as const, icon: '🥷', label: 'Stolen', sub: 'Place loot free', count: stolen }]
      : [{ key: 'stolen' as const, icon: '📦', label: 'Storage', sub: 'Put things back', count: stolen }]) : []),
    { key: 'walls', icon: '🧱', label: 'Walls', sub: 'Build & knock' },
    { key: 'paint', icon: '🎨', label: 'Paint', sub: 'Pick colours' },
    { key: 'finishes', icon: '✨', label: 'Finishes', sub: 'Floors, walls, lights' },
  ];
  return (
    <div className={`sheet catalogue ${hidden ? 'collapsed' : ''}`}>
      {/* Head and the furniture type filter stay put; only .cat-scroll moves. */}
      <div className="cat-fixed">
      <div className="sheet-head">
        {tab && (
          <button className="ghost-btn" onClick={back} aria-label="Back to decor options">
            ← Back
          </button>
        )}
        <h3>{tab ? tabs.find((t) => t.key === tab)?.label : 'Decorate your house'}</h3>
        {tab && (
          <div className="sheet-head-actions">
            <button className="ghost-btn" onClick={() => setHidden(!hidden)}>
              {hidden ? 'Show' : 'Hide'}
            </button>
          </div>
        )}
      </div>
      {!hidden && tab === 'furniture' && (
        <div className="house-section">
          <span className="house-section-label">Browse by type</span>
          <div className="cat-filter" role="group" aria-label="Furniture type">
            {CATEGORIES.map((c) => (
              <button key={c.key} type="button" className={c.key === cat ? 'on' : ''} aria-pressed={c.key === cat} onClick={() => setCat(c.key)}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
      </div>
      <div className="cat-scroll">
      {!tab && <div className="house-section-label tools">What do you want to do?</div>}
      {!tab && (
      <div className="house-tabs" role="tablist" aria-label="House tools">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={false} className={`house-tab tab-${t.key}`} onClick={() => choose(t.key)}>
            <span className="house-tab-icon">{t.icon}</span>
            <span className="house-tab-text">
              <b>{t.label}</b>
              <em>{t.sub}</em>
            </span>
            {t.count ? <small>{t.count}</small> : null}
          </button>
        ))}
      </div>
      )}
      {!hidden && tab === 'furniture' && (
        <>
          <div className="house-section-label items">{CATEGORIES.find((c) => c.key === cat)?.label ?? 'Items'}</div>
          <div className="cards">
            {list.map((i) => (
              <button key={i.type} className={`card ${money < i.price ? 'dim' : ''} ${i.luxury ? 'lux' : ''}`} onClick={() => startPlacing(i.type)}>
                <span className="dims">
                  {i.mount === 'wall' ? `Wall ${i.w}` : i.mount === 'ceiling' ? 'Ceiling' : `${i.w}×${i.d}`}{i.small ? ' · on tops' : ''}
                </span>
                {i.luxury && <span className="lux-badge">💎 Luxury</span>}
                <ItemThumb type={i.type} icon={i.icon} />
                <b>{i.name}</b>
                <span className="price">{naira(i.price)}</span>
              </button>
            ))}
          </div>
          <p className="muted hint">Tip: tap something in your house to move or sell it.</p>
        </>
      )}
      {!hidden && tab === 'stolen' && (
        <>
          <p className="muted house-note">{furnitureInventory.some((i) => i.stolen) ? 'Things you stored, and loot from break-ins. Placing them is free.' : 'Things you stored. Placing them back is free.'}</p>
          <div className="cards">
            {furnitureInventory.map((item) => {
              const def = ITEMS[item.type];
              return (
                <button key={item.id} className="card stolen" onClick={() => startPlacing(item.type, item.id)}>
                  {item.stolen && <span className="lux-badge stolen-badge">🥷 Stolen</span>}
                  <ItemThumb type={item.type} icon={def.icon} />
                  <b>{def.name}</b>
                  <span className="price">Place in your house</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {!hidden && tab === 'walls' && <WallTools />}
      {!hidden && tab === 'paint' && <PaintTools />}
      {!hidden && tab === 'finishes' && <FinishesTab />}
      </div>
    </div>
  );
}

type HouseTab = 'furniture' | 'stolen' | 'walls' | 'paint' | 'finishes';

/** Walls tab: pick an edge in the house, then confirm build / knock down. */
function WallTools() {
  const sel = useGame((s) => s.wallSel);
  const money = useGame((s) => s.money);
  const items = useGame((s) => s.items);
  const toggleWall = useGame((s) => s.toggleWall);
  const layout = useGame((s) => houseLayout(activeDesignOf(s), s.wallEdits[houseKeyOf(s)]));
  const exists = !!sel && layout.edgeSet.has(edgeKey(sel));
  const error = sel && !exists ? wallBuildError(layout, sel, items, avatarCell()) : null;
  const cost = exists ? WALL_KNOCK_COST : WALL_BUILD_COST;
  return (
    <div className="house-pane">
      {!sel ? (
        <p>
          Tap the line between two tiles inside your house. <span className="wl add">Build {naira(WALL_BUILD_COST)}</span>{' '}
          <span className="wl knock">Knock down {naira(WALL_KNOCK_COST)}</span>
        </p>
      ) : error ? (
        <div className="wallbar-row">
          <span className="wallbar-err">⚠️ {error}</span>
          <button onClick={() => useGame.setState({ wallSel: null })}>OK</button>
        </div>
      ) : (
        <div className="wallbar-row">
          <button className={exists ? 'danger' : 'go'} disabled={money < cost} onClick={() => toggleWall(sel)}>
            {exists ? '🔨 Knock down' : '🧱 Build wall'} · {naira(cost)}
          </button>
          <button onClick={() => useGame.setState({ wallSel: null })}>Cancel</button>
        </div>
      )}
    </div>
  );
}

/** Paint tab: repaint the outside and inside walls of the house you're in. */
function PaintTools() {
  const paint = useGame((s) => s.housePaint[houseKeyOf(s)]);
  const paintWalls = useGame((s) => s.paintWalls);
  return (
    <div className="house-pane">
      {WALL_PARTS.map((part) => (
        <div key={part.key} className="paint-group">
          <small>{part.icon} {part.label}</small>
          <Swatches value={paint?.[part.key]} onPick={(id) => paintWalls(part.key, id)} />
        </div>
      ))}
    </div>
  );
}

/** Shown while dragging a new or moved item around (ui/DecorTools.tsx: turns, wall height, place). */
export function PlaceBar() {
  return <DecorPlaceBar />;
}

/** The palette (24 colours and a custom one, ui/Finishes.tsx) plus an "original" swatch. */
function Swatches({ value, onPick }: { value: string | null | undefined; onPick: (id: string | null) => void }) {
  return <ColourPicker value={value} onPick={onPick} />;
}

/** Buy mode: tap an owned item → move or sell. */
export function OwnedSheet() {
  const mode = useGame((s) => s.mode);
  const selectedId = useGame((s) => s.selectedId);
  const items = useGame((s) => s.items);
  const select = useGame((s) => s.select);
  const sell = useGame((s) => s.sell);
  const move = useGame((s) => s.startMoving);
  const rotateItem = useGame((s) => s.rotateItem);
  const storeItem = useGame((s) => s.storeItem);
  const paintItem = useGame((s) => s.paintItem);
  const hasBlackMarket = useApps((s) => s.installed.includes('blackmarket'));
  const item = items.find((i) => i.id === selectedId);
  if (mode !== 'buy' || !item) return null;
  const def = ITEMS[item.type];
  const slots = ITEM_PAINT[item.type];
  return (
    <div className="sheet small">
      <div className="sheet-head">
        <h3>
          {def.icon} {def.name}
        </h3>
        <button className="x" onClick={() => select(null)}>
          ✕
        </button>
      </div>
      {def.fixed ? (
        <p className="muted">This one is part of the house.</p>
      ) : (
        <div className="actions">
          {slots && (
            <div className="paint-card">
              <b>🎨 Colours</b>
              {slots.map((slot, i) => (
                <div key={slot.label} className="paint-group">
                  {slots.length > 1 && <small>{slot.label}</small>}
                  <Swatches value={item.paint?.[i]} onPick={(id) => paintItem(item.id, i, id)} />
                </div>
              ))}
            </div>
          )}
          {LIGHTS[item.type] && <LampControls item={item} />}
          <OwnedDecorTools id={item.id} />
          <div className="owned-actions">
            <button className="action tile" onClick={() => move(item.id)}>
              <span className="ai">✋</span>
              <b>Move</b>
            </button>
            <button className="action tile" onClick={() => rotateItem(item.id)}>
              <span className="ai">⟳</span>
              <b>Rotate</b>
            </button>
            <button className="action tile" onClick={() => storeItem(item.id)}>
              <span className="ai">📦</span>
              <b>Store</b>
            </button>
            {item.stolen ? (
              <button className="action tile" onClick={() => {
                select(null);
                useGame.setState({ panel: 'phone', openApp: hasBlackMarket ? 'blackmarket' : 'store' });
              }}>
                <span className="ai">🕶️</span>
                <b>{hasBlackMarket ? 'Fence' : 'Get App'}</b>
                <small>{hasBlackMarket ? 'Black Market' : 'Install Black Market'}</small>
              </button>
            ) : (
              <button className="action tile" onClick={() => window.confirm(`Sell your ${def.name} for ${naira(def.price * 0.5)}?`) && sell(item.id)}>
                <span className="ai">💸</span>
                <b>Sell</b>
                <small>{naira(def.price * 0.5)}</small>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function StreetStorySheet() {
  const story = useGame((s) => s.streetStory);
  const money = useGame((s) => s.money);
  const resolve = useGame((s) => s.resolveStreetStory);
  if (!story) return null;
  return (
    <div className="story-overlay">
      <section className="story-card" role="dialog" aria-modal="true" aria-labelledby="street-story-title">
        <span className="story-icon">{story.icon}</span>
        <small>ON THE STREETS OF {cityNameHere().toUpperCase()}</small>
        <h2 id="street-story-title">{story.title}</h2>
        <p>{story.scene}</p>
        <div className="story-choices">
          {story.choices.map((choice) => (
            <button
              key={choice.id}
              disabled={choice.outcome.money !== undefined && choice.outcome.money < 0 && money < -choice.outcome.money}
              onClick={() => resolve(choice.id)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Town map: tap a building → this card. */
export function PlaceSheet() {
  const placeId = useGame((s) => s.placeId);
  const view = useGame((s) => s.view);
  const destinationId = useGame((s) => s.destinationId);
  const money = useGame((s) => s.money);
  const ownedCars = useGame((s) => s.ownedCars);
  const carFuel = useGame((s) => s.carFuel);
  const hour = useGame((s) => Math.floor(hourOf(s.minutes)));
  const go = useGame((s) => s.startPlace);
  const close = useGame((s) => s.selectPlace);
  const [travelMode, setTravelMode] = useState<TravelMode>('walk');
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  // The sheet flips between how to get there and what the player shops there sell.
  const [shops, setShops] = useState(false);
  const shopsOpen = usePlaceShops((s) => (placeId ? s.places[placeId]?.open : 0) ?? 0);
  const place = placeId ? regionPlaces(destinationId).find((p) => p.id === placeId) ?? PLACE_BY_ID[placeId] : null;
  // Tapping a place on the map is a new intent: dismiss the estates travel picker so this sheet isn't hidden behind it.
  useEffect(() => {
    if (placeId) useTravel.getState().close();
    setShops(false);
  }, [placeId]);
  if (view !== 'city' || !place) return null;
  const shopsButton = shopsOpen > 0 && (
    <button
      className={`travel-shops-btn ${shops ? 'on' : ''}`}
      aria-pressed={shops}
      aria-label={`Player shops here, ${shopsOpen} open`}
      title="Player shops here"
      onClick={() => setShops(!shops)}
    >
      <Emoji char="🏪" size="1em" /><i>{shopsOpen}</i>
    </button>
  );
  if (shops) {
    return (
      <div className="sheet place-sheet travel-sheet" role="dialog" aria-label={`Player shops at ${place.name}`}>
        <div className="travel-head">
          <h3 className="travel-title"><Emoji char="🏪" size="1em" /> Shops at {place.name}</h3>
          {shopsButton}
        </div>
        <div className="travel-body">
          <PlaceShopsPanel placeId={place.id} onGo={() => setShops(false)} />
        </div>
        <div className="travel-actions">
          <button type="button" className="travel-cancel" onClick={() => setShops(false)}>← Back</button>
        </div>
      </div>
    );
  }
  const open = place.id === 'home' || isOpen(place, hour);
  // Shut because the state let it fall apart.
  const broken = brokenAsset(destinationId, place.id);
  const km = kmBetween(avatarCell(), place.door);
  const travelFare = fareOf(travelMode, km);
  const canAfford = money >= travelFare;
  return (
    <TravelSheet
      title={<><Emoji char={place.icon} size="1em" /> {place.name}</>}
      action={
        <>
          {place.id !== 'home' && (
            <button
              className="share-place-btn travel-share-btn"
              aria-label="Share this location"
              title="Share location"
              onClick={() => void shareLink(placeLink(place.id, cityMap(destinationId).id), `${place.icon} ${place.name} — Naija City`)}
            >
              <Icon name="share" size={16} />
            </button>
          )}
          {shopsButton}
        </>
      }
      km={km}
      top={
        <>
          <p className="muted place-meta">
            <Emoji char="📍" size="1em" /> {place.area} · {place.id === 'home' ? 'Your compound' : <span className={open ? 'good' : 'bad'}>{open ? 'Open' : 'Closed'} · {hoursLabel(place)}</span>}
          </p>
          {broken && <p className="place-broken"><Emoji char="🔧" size="1em" /> Closed: fallen apart. The governor has to repair it.</p>}
          {place.blurb && <p className="place-blurb">{place.blurb}</p>}
          <WorkNote city={cityMap(destinationId).id} placeId={place.id} />
          <PlaceHappening placeId={place.id} />
          <PlaceShopsLine placeId={place.id} onOpen={() => setShops(true)} />
        </>
      }
      allowWalk
      mode={travelMode}
      setMode={setTravelMode}
      carId={selectedCarId}
      setCarId={setSelectedCarId}
      goLabel={broken ? <><Emoji char="🔧" size="1em" /> Closed for repairs</> : open ? <>Go · {tripCost(travelMode, selectedCarId, km)}</> : <><Emoji char="🔒" size="1em" /> Closed now</>}
      goDisabled={!!broken || !open || !canAfford || carDry(travelMode, selectedCarId, carFuel, km) || (travelMode === 'car' && (!selectedCarId || !ownedCars.includes(selectedCarId)))}
      onGo={() => go(place.id, travelMode, travelMode === 'car' ? selectedCarId ?? undefined : undefined)}
      onCancel={() => close(null)}
    />
  );
}
