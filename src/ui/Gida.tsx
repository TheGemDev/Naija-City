// House: the property app. Buy land around Kaduna, build on it stage by stage, then rent it out or sell.
// Each region also has an estate area (three/Estate.tsx) where your houses stand next to other players'.

import { REGION_IDS, regionOf } from '../game/regions';
import { govRentIn, useCityLaws } from '../game/cityLaws';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { naira, netWorthOf, useGame } from '../game/store';
import { sectionOf } from '../game/estate';
import { HOUSE_LAYOUTS } from '../game/grid';
import { HOUSEHOLD_STAFF, HOUSE_STAFF_ROLES, staffTheftChance, type HouseStaffRole } from '../game/staff';
import { GOV_WEEKLY_RENT } from '../game/store';
import { leaveRental, listForRent, loadRentals, rentHouse, unlistRental, useRentals } from '../net/rentals';
import { useStocks } from '../net/stocks';
import {
  builtOn, cityEstates, CONTRACTORS, costOf, DESIGN_BY_ID, DESIGNS, estateCity, extensionDesign, houseTitle, isComplete, landAuthority, LAND_RECLAIM_MINUTES, MATERIAL_BY_ID, materialPrice, PLOTS, REGION_BY_ID,
  PLAYER_RENT, remainingBuildMinutes, remainingStageMaterials, rentDue, rentPerDay, saleValue, weeklyRentOf, stageLabour, stageMaterials, STAGES, type Property,
  type RentalListing,
} from '../game/property';
import {
  CARPORTS, EXTENSIONS, EXTERIOR_COLOURS, exteriorChangeCost, exteriorOf, extensionBlock, FENCES, GATES, layoutKey, PAVINGS, ROOFS, ROOF_FINISHES, ROOM_TYPE, ROOM_TYPES,
  ROOM_NAME_MAX, YARD_ITEMS, exteriorPrice, type ExteriorChoice, type HouseExterior, type RoomType, type YardItem,
} from '../game/exterior';
import { houseLayoutForDesign } from '../game/grid';
import { homeLines, OtherThumb, PropertyThumb, RenameHouse, useHomeStatus } from './homesKit';

const ago = (at: number) => {
  const m = Math.floor((Date.now() - at) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
};

/** Who lives in one of my listed houses: a player's handle, or an NPC household's name. */
const tenantTitle = (l: RentalListing) => (l.npc ? `${l.tenant} · NPC tenant` : `Rented by @${l.tenant}`);
/** When they moved in and what they have paid me so far. */
const tenantSince = (l: RentalListing) =>
  [l.movedIn ? `Moved in ${ago(l.movedIn)}` : '', l.received !== undefined ? `${naira(l.received)} received` : ''].filter(Boolean).join(' · ');

/** Asks the phone to open House, optionally on one property (from the estate area). */
export const useHouseNav = create<{ want: number; property: string | null }>(() => ({ want: 0, property: null }));
export function openHouse(property: string | null = null) {
  useHouseNav.setState((s) => ({ want: s.want + 1, property }));
  useGame.getState().setPanel('phone');
}

function status(p: Property, minutes: number) {
  if (p.building) {
    const left = Math.max(0, p.building.doneAt - minutes);
    const pct = 100 * (1 - left / (p.building.doneAt - p.building.startedAt));
    // An extension on a finished house builds its own stages while p.stage is already past the last one.
    const stage = STAGES[p.extending?.stage ?? p.stage];
    const what = p.extending ? `${EXTENSIONS.find((e) => e.id === p.extending!.id)?.name ?? 'Extension'}: ` : '';
    return { text: `${what}${stage?.name ?? 'Work'} under way · ${Math.ceil(left)} sec left`, pct };
  }
  if (!p.design) {
    const remaining = Math.max(0, (p.boughtAt ?? minutes) + LAND_RECLAIM_MINUTES - minutes);
    return { text: `Bare land · ${landAuthority(p.region)} may reclaim in ${Math.ceil(remaining / 1440)} days`, pct: 0 };
  }
  // A finished house says when it was built, not that it is finished.
  if (isComplete(p)) {
    const built = builtOn(p);
    return { text: [built && `Built ${built}`, p.rented && `Rented · ${naira(rentPerDay(p))}/day`].filter(Boolean).join(' · '), pct: 100 };
  }
  return { text: `Ready for ${STAGES[p.stage].name.toLowerCase()}`, pct: (p.stage / STAGES.length) * 100 };
}

/** What is happening at the house, as the chip over its picture. */
function StatusChip({ p }: { p: Property }) {
  const st = useHomeStatus(p);
  return <span className={`hm-chip ${st.tone}`}>{st.text}</span>;
}

/** One house in the list: its picture, name, address, what it is and what it's worth. */
function HomeCard({ p, minutes, onOpen }: { p: Property; minutes: number; onOpen: () => void }) {
  const lines = homeLines(p);
  const st = status(p, minutes);
  const design = p.design ? DESIGN_BY_ID[p.design] : null;
  return (
    <div className="hm-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
      <div className="hm-card-pic">
        <PropertyThumb p={p} />
        <StatusChip p={p} />
        <span className="hm-worth">{naira(saleValue(p))}</span>
      </div>
      <div className="hm-card-body">
        <RenameHouse p={p} />
        {lines.design && <span className="hm-sub">{lines.design}</span>}
        <span className="hm-where">📍 {lines.estate}</span>
        <span className="hm-sub">{lines.city}</span>
        <div className="hm-facts">
          {design ? <span>{design.icon} {lines.beds || design.name}</span> : <span>📜 Bare land</span>}
          <span>📐 {PLOTS[p.plot].label}</span>
          {design && isComplete(p) && <span>💵 {naira(rentPerDay(p))}/day</span>}
          {(p.extensions ?? []).map((e) => <span key={e}>{EXTENSIONS.find((x) => x.id === e)?.icon} {EXTENSIONS.find((x) => x.id === e)?.name}</span>)}
        </div>
        {!isComplete(p) && <div className="hm-progress"><i style={{ width: `${st.pct}%` }} /></div>}
      </div>
    </div>
  );
}

/** A row of choices: the one standing now marked, each with its price (nothing for what you already have). */
function Choices<T extends string>({ list, now, pick, picked, design }: { list: ExteriorChoice<T>[]; now: T; pick: (id: T) => void; picked: T | undefined; design: string | null }) {
  return (
    <div className="hm-opts">
      {list.map((c) => (
        <button key={c.id} type="button" className={`hm-opt ${(picked ?? now) === c.id ? 'on' : ''}`} onClick={() => pick(c.id)} title={c.blurb}>
          <b>{c.icon} {c.name}</b>
          <small>{c.id === now ? 'Yours now' : naira(exteriorPrice(c.price, design))}</small>
        </button>
      ))}
    </div>
  );
}

function Swatches({ now, picked, pick }: { now: string; picked: string | undefined; pick: (id: string) => void }) {
  return (
    <div className="hm-swatches">
      {EXTERIOR_COLOURS.map((c) => (
        <button key={c.id} type="button" className={`hm-swatch ${(picked ?? now) === c.id ? 'on' : ''}`} style={{ background: c.hex }} aria-label={c.name} title={c.name} onClick={() => pick(c.id)} />
      ))}
    </div>
  );
}

/**
 * The outside of a finished house (game/exterior.ts): pick a fence, gate, roof, trim, paving, carport and what stands in
 * the compound; the picture above shows the result before you pay, and Apply charges for what changed.
 */
function OutsideSection({ p }: { p: Property }) {
  const money = useGame((s) => s.money);
  const change = useGame((s) => s.changeExterior);
  const [draft, setDraft] = useState<HouseExterior>({});
  const now = exteriorOf(p.design, p.exterior);
  const cost = exteriorChangeCost(p.design, now, draft);
  const items = new Set(draft.items ?? now.items);
  const set = <K extends keyof HouseExterior>(k: K, v: HouseExterior[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggle = (id: YardItem) => {
    const next = new Set(items);
    if (next.has(id)) next.delete(id); else next.add(id);
    set('items', [...next]);
  };
  const changed = Object.keys(draft).length > 0;
  const preview: Property = { ...p, exterior: { ...p.exterior, ...draft } };
  return (
    <div className="hm-section">
      <h4>Outside</h4>
      {changed && <div className="hm-detail-hero"><PropertyThumb p={preview} /></div>}
      <span className="hm-row-label">Fence</span>
      <Choices list={FENCES} now={now.fence} picked={draft.fence} pick={(v) => set('fence', v)} design={p.design} />
      <Swatches now={now.fenceColour} picked={draft.fenceColour} pick={(v) => set('fenceColour', v)} />
      <span className="hm-row-label">Gate</span>
      <Choices list={GATES} now={now.gate} picked={draft.gate} pick={(v) => set('gate', v)} design={p.design} />
      <Swatches now={now.gateColour} picked={draft.gateColour} pick={(v) => set('gateColour', v)} />
      <span className="hm-row-label">Roof</span>
      <Choices list={ROOFS} now={now.roof} picked={draft.roof} pick={(v) => set('roof', v)} design={p.design} />
      <Choices list={ROOF_FINISHES} now={now.roofFinish} picked={draft.roofFinish} pick={(v) => set('roofFinish', v)} design={p.design} />
      <Swatches now={now.roofColour} picked={draft.roofColour} pick={(v) => set('roofColour', v)} />
      <span className="hm-row-label">Trim (windows, fascia, pillar caps)</span>
      <Swatches now={now.trim} picked={draft.trim} pick={(v) => set('trim', v)} />
      <span className="hm-row-label">Paving</span>
      <Choices list={PAVINGS} now={now.paving} picked={draft.paving} pick={(v) => set('paving', v)} design={p.design} />
      <span className="hm-row-label">Carport</span>
      <Choices list={CARPORTS} now={now.carport} picked={draft.carport} pick={(v) => set('carport', v)} design={p.design} />
      <Swatches now={now.carportColour} picked={draft.carportColour} pick={(v) => set('carportColour', v)} />
      <span className="hm-row-label">In the compound</span>
      <div className="hm-opts" style={{ flexWrap: 'wrap' }}>
        {YARD_ITEMS.map((i) => {
          const had = now.items.includes(i.id);
          const blocked = i.bigPlot && p.plot === 'half';
          return (
            <button key={i.id} type="button" disabled={blocked} className={`hm-opt ${items.has(i.id) ? 'on' : ''}`} title={i.blurb} onClick={() => toggle(i.id)}>
              <b>{i.icon} {i.name}</b>
              <small>{blocked ? 'Full plot only' : had ? (items.has(i.id) ? 'Yours' : 'Remove (free)') : naira(exteriorPrice(i.price, p.design))}</small>
            </button>
          );
        })}
      </div>
      {changed && (
        <div className="hm-buy">
          <span>{cost ? `Outside work: ${naira(cost)}` : 'No charge'}</span>
          <button className="btn sm" onClick={() => setDraft({})}>Reset</button>
          <button className="btn sm go" disabled={money < cost} onClick={() => { change(p.id, draft); setDraft({}); }}>{money < cost ? `Need ${naira(cost)}` : 'Apply'}</button>
        </div>
      )}
    </div>
  );
}

/** Extensions: building work on a finished house, paid up front and built in stages like the house was. */
function ExtensionsSection({ p }: { p: Property }) {
  const money = useGame((s) => s.money);
  const start = useGame((s) => s.startExtension);
  const minutes = useGame((s) => s.minutes);
  const [contractor, setContractor] = useState('standard');
  const c = CONTRACTORS.find((x) => x.id === contractor)!;
  const roof = exteriorOf(p.design, p.exterior).roof;
  const built = p.extensions ?? [];
  const list = EXTENSIONS.filter((e) => e.designs.includes(p.design ?? ''));
  if (!list.length) return null;
  return (
    <div className="hm-section">
      <h4>Extensions</h4>
      <div className="hm-opts">
        {CONTRACTORS.map((x) => (
          <button key={x.id} type="button" className={`hm-opt ${contractor === x.id ? 'on' : ''}`} onClick={() => setContractor(x.id)}>
            <b>{x.icon} {x.name}</b>
            <small>{x.fee < 1 ? 'Cheaper, slower' : x.fee > 1 ? 'Dearer, faster' : 'Fair price'}</small>
          </button>
        ))}
      </div>
      {list.map((e) => {
        const d = extensionDesign(p.design, e.id)!;
        const total = costOf(remainingStageMaterials(d, 0), p.region, p.design) + STAGES.reduce((a, st) => a + stageLabour(d, st, c, p.region), 0);
        const working = p.extending?.id === e.id;
        const block = extensionBlock(e, p.design, built, roof);
        const pct = working && p.building ? Math.round(100 * ((p.extending!.stage + Math.min(1, (minutes - p.building.startedAt) / Math.max(1, p.building.doneAt - p.building.startedAt))) / STAGES.length)) : 0;
        return (
          <div className="tile" key={e.id}>
            <span className="tile-icon">{e.icon}</span>
            <span className="tile-info">
              <b>{e.name}{built.includes(e.id) ? ' · Built' : ''}</b>
              <small>{e.blurb}</small>
              {working ? <small>🚧 {STAGES[p.extending!.stage]?.name ?? 'Finishing'} · {pct}%</small> : !built.includes(e.id) && <small>{block ?? `${naira(total)} · about ${remainingBuildMinutes(d, c)} sec`}</small>}
            </span>
            {!built.includes(e.id) && !working && (
              <button className="btn sm go" disabled={!!block || !!p.building || money < total} onClick={() => start(p.id, e.id, contractor)}>
                {p.building ? 'Builders busy' : money < total ? 'Short' : 'Build'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Rooms: give each a name and a use (bedroom, study, kitchen, parlour, prayer room) for a small bonus inside. */
function RoomsSection({ p }: { p: Property }) {
  const setRoom = useGame((s) => s.setRoom);
  const rooms = houseLayoutForDesign(layoutKey(p.design, p.extensions)).rooms.filter((r) => !/^(Side yard|Compound|Carport|Hallway|Main hallway|Shared corridor)$/.test(r.name));
  return (
    <div className="hm-section">
      <h4>Rooms</h4>
      <small className="muted">A room's use gives what you do in it a small edge: {ROOM_TYPES.map((t) => `${t.icon} ${t.name}: ${t.bonus.toLowerCase()}`).join('. ')}.</small>
      {rooms.map((r) => {
        const own = p.rooms?.[r.name];
        return (
          <div className="hm-room" key={r.name}>
            <input
              className="text-input"
              defaultValue={own?.name ?? ''}
              placeholder={r.name}
              maxLength={ROOM_NAME_MAX * 2}
              aria-label={`Name for ${r.name}`}
              onBlur={(e) => { if ((e.target.value || '') !== (own?.name ?? '')) setRoom(p.id, r.name, { ...own, name: e.target.value }); }}
            />
            <select value={own?.type ?? ''} aria-label={`Use of ${r.name}`} onChange={(e) => setRoom(p.id, r.name, { ...own, type: (e.target.value || undefined) as RoomType | undefined })}>
              <option value="">No set use</option>
              {ROOM_TYPES.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
            </select>
          </div>
        );
      })}
      {Object.values(p.rooms ?? {}).some((r) => r.type) && (
        <small className="muted">Set: {Object.entries(p.rooms ?? {}).filter(([, r]) => r.type).map(([k, r]) => `${r.name || k} → ${ROOM_TYPE[r.type!].name}`).join(', ')}</small>
      )}
    </div>
  );
}

function BuyLand() {
  const money = useGame((s) => s.money);
  const properties = useGame((s) => s.properties);
  const buyLand = useGame((s) => s.buyLand);
  const visit = useGame((s) => s.visitEstate);
  // The land office sells what is in the city you are in: the other city's estates are a flight away.
  const city = useGame((s) => s.destinationId);
  return (
    <>
      <h4>Land for sale in {regionOf(city).name}</h4>
      {cityEstates(city).map((r) => (
        <div key={r.id} className="inv-card land-card">
          <div className="inv-card-head">
            <span className="tile-icon" style={{ background: '#fef3c7', fontSize: 22 }}>📍</span>
            <div className="inv-meta">
              <b>{r.name}</b>
            </div>
          </div>
          <div className="inv-stats">
            <span>Plot: <b>{naira(r.plotPrice)}</b></span>
            <span>Building: <b>×{r.build}</b></span>
            <span>Rent: <b className="good">×{r.rent}</b></span>
          </div>
          <div className="inv-actions land-actions">
            <button
              className="btn sm go"
              disabled={money < r.plotPrice}
              onClick={() => {
                buyLand(r.id, 'full');
                // Show the new plot: head to the estate where it sits.
                if (useGame.getState().properties.length > properties.length) visit(r.id);
              }}
            >
              Buy
            </button>
            <button className="btn sm" onClick={() => visit(r.id)}>Visit</button>
          </div>
        </div>
      ))}
    </>
  );
}

function PropertyPage({ id, back }: { id: string; back: () => void }) {
  const p = useGame((s) => s.properties.find((x) => x.id === id));
  const money = useGame((s) => s.money);
  const homePropertyId = useGame((s) => s.homePropertyId);
  const minutes = useGame((s) => Math.floor(s.minutes));
  const { chooseDesign, startConstruction, setHomeProperty, setRented, collectRent, sellProperty, visitEstate, hireHouseholdStaff, dismissHouseholdStaff } = useGame.getState();
  const [contractor, setContractor] = useState('standard');
  const [choosingDesign, setChoosingDesign] = useState(false);
  // Open on the house's picture, not wherever the list was scrolled to.
  const top = useRef<HTMLButtonElement>(null);
  useEffect(() => { top.current?.closest('.app-body, .phone-screen')?.scrollTo?.({ top: 0 }); }, [id]);
  if (!p) return <button className="btn sm" onClick={back}>‹ All properties</button>;
  const region = REGION_BY_ID[p.region];
  const design = p.design ? DESIGN_BY_ID[p.design] : null;
  const materialsNeeded = design ? remainingStageMaterials(design, p.stage) : {};
  const materialsToBuy: Record<string, number> = {};
  for (const [id, amount] of Object.entries(materialsNeeded)) {
    const short = Math.max(0, amount - (p.stock[id] ?? 0));
    if (short > 0) materialsToBuy[id] = short;
  }
  const materialCost = costOf(materialsToBuy, p.region, p.design);
  const stagesLeft = STAGES.length - p.stage;
  const st = status(p, minutes);
  const due = rentDue(p, minutes);
  const sale = saleValue(p);
  // The state's house market (HOUSE_MARKET): how today's prices compare with a day ago.
  const market = useStocks((s) => s.houses[estateCity(p.region)]);
  const trend = market && market.dayAgo ? Math.round(((market.mult - market.dayAgo) / market.dayAgo) * 1000) / 10 : 0;
  const hired = CONTRACTORS.find((c) => c.id === contractor)!;
  const lines = homeLines(p);

  return (
    <>
      <button ref={top} className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={back}>‹ All properties</button>
      <div className="hm-detail-hero">
        <div className="hm-card-pic">
          <PropertyThumb p={p} />
          <StatusChip p={p} />
          <span className="hm-worth">{naira(sale)}</span>
        </div>
        <div className="hm-card-body">
          <RenameHouse p={p} big />
          <span className="hm-sub">{[lines.design, design ? null : '📜 Bare land', PLOTS[p.plot].label].filter(Boolean).join(' · ')}</span>
          <span className="hm-where">📍 {lines.estate}</span>
          <span className="hm-sub">{lines.city}{st.text ? ` · ${st.text}` : ''}</span>
          {!isComplete(p) && <div className="hm-progress"><i style={{ width: `${st.pct}%` }} /></div>}
          <div className="hm-actions">
            {isComplete(p) && (
              <button className="btn sm go" disabled={homePropertyId === p.id} title={homePropertyId === p.id ? undefined : 'Moving in ends any current rental'} onClick={() => setHomeProperty(p.id)}>
                {homePropertyId === p.id ? '🏠 Your home' : '🏠 Live here'}
              </button>
            )}
            <button className="btn sm" title={`Go to ${region.name} (${sectionOf(p.slot ?? 0) + 1})`} onClick={() => visitEstate(p.region, sectionOf(p.slot ?? 0))}>📍 Visit</button>
          </div>
        </div>
      </div>
      <div className="hm-stats">
        <div className="hm-stat"><small>Put in</small><b>{naira(p.spent)}</b></div>
        <div className="hm-stat" title={`House prices in ${regionOf(estateCity(p.region)).name} follow how the state is run: roads, hospitals, police, taxes.`}>
          <small>Worth{trend ? ` · ${trend > 0 ? '▲' : '▼'} ${Math.abs(trend)}% today` : ''}</small>
          <b className={sale >= p.spent ? 'good' : 'bad'}>{naira(sale)}</b>
        </div>
        <div className="hm-stat"><small>{design ? 'Rent' : 'Plot'}</small><b>{design ? `${naira(rentPerDay(p))}/day` : PLOTS[p.plot].label}</b></div>
      </div>

      {!design && (
        <>
          {!choosingDesign ? (
            <button className="btn wide go" onClick={() => setChoosingDesign(true)}>🏠 Build on this plot</button>
          ) : (
            <>
              <h4>Choose a house to build</h4>
              <small className="muted">Any house can be built on a half, full or double plot.</small>
              {DESIGNS.map((d) => {
                const build = STAGES.reduce((a, s) => a + costOf(stageMaterials(d, s), p.region, d.id) + stageLabour(d, s, CONTRACTORS[1], p.region), 0);
                return (
                  <div key={d.id} className="tile">
                    <span className="tile-icon">{d.icon}</span>
                    <span className="tile-info">
                      <b>{d.name}</b>
                      <small>{d.blurb}</small>
                      <small>
                        📐 {HOUSE_LAYOUTS[d.id].width}×{HOUSE_LAYOUTS[d.id].depth} interior · {HOUSE_LAYOUTS[d.id].width * HOUSE_LAYOUTS[d.id].depth} tiles
                      </small>
                      <small>
                        ~{naira(build)} to build · rent <b className="good">{naira(Math.round((d.rentPerDay * region.rent) / 100) * 100)}</b>/day
                      </small>
                    </span>
                    <button className="btn sm" onClick={() => chooseDesign(p.id, d.id)}>Select house</button>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}

      {design && !isComplete(p) && !p.building && (
        <>
          <h4>Build the full house · {stagesLeft} stage{stagesLeft === 1 ? '' : 's'} remaining</h4>
          <p className="muted">Pay once and the foundation, walls, roof and finishing will continue automatically.</p>
          <div className="list-card">
            {Object.entries(materialsNeeded).map(([mid, need]) => {
              const m = MATERIAL_BY_ID[mid];
              const have = Math.min(need, p.stock[mid] ?? 0);
              return (
                <div key={mid} className="txn">
                  <span className="txn-dot in">{m.icon}</span>
                  <span className="txn-label">
                    {m.name}
                    <small>
                      {have}/{need} × {m.unit}
                    </small>
                  </span>
                  <b>{naira((materialsToBuy[mid] ?? 0) * materialPrice(mid, p.region, p.design))}</b>
                </div>
              );
            })}
          </div>
          <h4>Choose your builder</h4>
          {CONTRACTORS.map((c) => {
            const labour = STAGES.slice(p.stage).reduce((sum, stageDef) => sum + stageLabour(design, stageDef, c, p.region), 0);
            const duration = remainingBuildMinutes(design, c, p.stage);
            return (
              <button key={c.id} className={`tile ${contractor === c.id ? 'mine' : ''}`} onClick={() => setContractor(c.id)} style={{ textAlign: 'left' }}>
                <span className="tile-icon">{c.icon}</span>
                <span className="tile-info">
                  <b>{c.name}</b>
                  <small>{c.blurb}</small>
                  <small>{naira(labour + materialCost)} total · about {Math.max(1, duration)} sec</small>
                </span>
              </button>
            );
          })}
          {(() => {
            const labour = STAGES.slice(p.stage).reduce((sum, stageDef) => sum + stageLabour(design, stageDef, hired, p.region), 0);
            const total = materialCost + labour;
            return (
              <button className="btn wide go" disabled={money < total} onClick={() => startConstruction(p.id, contractor)}>
                {money < total ? `Need ${naira(total)} for the full build` : `Pay ${naira(total)} · build all ${stagesLeft} stages`}
              </button>
            );
          })()}
        </>
      )}

      {isComplete(p) && <OutsideSection p={p} />}
      {isComplete(p) && <ExtensionsSection p={p} />}
      {isComplete(p) && <RoomsSection p={p} />}

      {isComplete(p) && (
        <>
          <h4>Household staff</h4>
          <p className="muted">Staff stay at this house. Wages are paid daily; staff leave if you cannot pay. Any of them may steal from you (you will be notified); a guard on site deters the rest.</p>
          {HOUSE_STAFF_ROLES.map((role) => {
            const member = p.staff?.find((person) => person.role === role);
            const staff = HOUSEHOLD_STAFF[role];
            return (
              <div className="tile" key={role}>
                <span className="tile-icon">{staff.icon}</span>
                <span className="tile-info">
                  <b>{staff.name}{member ? ' · Hired' : ''}</b>
                  <small>{member ? staff.blurb : `${staff.blurb} · ${naira(staff.wage)}/day`}{' · '}theft risk {+(staffTheftChance(role as HouseStaffRole, [...(p.staff ?? []), ...(member ? [] : [{ role, paidThrough: 0 }])]) * 100).toFixed(1)}%/day</small>
                </span>
                {member
                  ? <button className="btn sm" onClick={() => dismissHouseholdStaff(p.id, role)}>Dismiss</button>
                  : <button className="btn sm go" disabled={p.rented || money < staff.wage} onClick={() => hireHouseholdStaff(p.id, role)}>Hire · {naira(staff.wage)}/day</button>}
              </div>
            );
          })}
          <h4>Rental</h4>
          {p.rented ? (
            <>
              <div className="tile">
                <span className="tile-icon">🔑</span>
                <span className="tile-info">
                  <b>Let to NPC tenants</b>
                  <small>{naira(rentPerDay(p))} per day · due now: <b className="good">{naira(due.amount)}</b></small>
                </span>
                <button className="btn sm" onClick={() => setRented(p.id, false)}>End lease</button>
              </div>
              {due.amount > 0 && <button className="btn wide go" onClick={collectRent}>Collect rent · {naira(due.amount)}</button>}
            </>
          ) : (
            <RentOut p={p} isHome={homePropertyId === p.id} />
          )}
        </>
      )}

      {!p.building && (
        <button
          className="btn wide danger"
          onClick={() => {
            if (confirm(`Sell ${houseTitle(p)} (${lines.estate}) for ${naira(sale)}?`)) {
              sellProperty(p.id);
              back();
            }
          }}
        >
          Sell for {naira(sale)}
        </button>
      )}
    </>
  );
}

/** List a finished house for other players to rent (worker/rentals.ts). */
function RentOut({ p, isHome }: { p: Property; isHome: boolean }) {
  const mine = useRentals((st) => st.mine.find((r) => r.propertyId === p.id));
  const busy = useRentals((st) => st.busy);
  const base = p.design ? weeklyRentOf(p.design, p.region) : 0;
  const [weekly, setWeekly] = useState(String(base));
  useEffect(() => { void loadRentals(); }, []);
  useEffect(() => { if (mine) setWeekly(String(mine.weekly)); }, [mine?.weekly]);
  const min = Math.round(base * PLAYER_RENT.minFactor);
  const max = Math.round(base * PLAYER_RENT.maxFactor);
  const price = Math.round(Number(weekly));

  if (isHome) {
    return (
      <div className="tile">
        <span className="tile-icon">🔑</span>
        <span className="tile-info"><b>Your home · not for rent</b><small>Choose another home to rent this one out.</small></span>
      </div>
    );
  }
  return (
    <>
      <div className="tile">
        <span className="tile-icon">🔑</span>
        <span className="tile-info">
          <b>{mine?.tenant ? tenantTitle(mine) : mine ? 'Listed for rent' : 'Empty'}</b>
          <small>
            {mine?.tenant
              ? `${naira(mine.weekly)}/week, paid straight to you`
              : `Other players can rent it from the For rent tab, and NPC households look too: near ${naira(base)} fills fastest. ${naira(min)} to ${naira(max)} a week.`}
          </small>
          {mine?.tenant && <small>{tenantSince(mine)}</small>}
        </span>
        {mine && <button className="btn sm" disabled={busy} onClick={() => unlistRental(p.id)}>{mine.tenant ? 'Evict' : 'Unlist'}</button>}
      </div>
      {/* An NPC household's rent can still be changed; raise it and they may move out. */}
      {(!mine?.tenant || mine.npc) && (
        <div className="tile">
          <input className="text-input" inputMode="numeric" value={weekly} onChange={(e) => setWeekly(e.target.value.replace(/\D/g, ''))} aria-label="Weekly rent" />
          <button className="btn sm go" disabled={busy || !(price >= min && price <= max)} onClick={() => listForRent(p.id, price)}>
            {mine ? 'Update' : 'List for rent'} · {naira(price || 0)}/wk
          </button>
        </div>
      )}
    </>
  );
}

/** For rent tab: the government starter house plus houses other players have listed. */
function RentTab() {
  const origin = useGame((st) => st.origin);
  const govRentOwed = useGame((st) => st.govRentOwed);
  const lease = useGame((st) => st.lease);
  const money = useGame((st) => st.money);
  const homePropertyId = useGame((st) => st.homePropertyId);
  const moveIntoGovHouse = useGame((st) => st.moveIntoGovHouse);
  const clearGovRent = useGame((st) => st.clearGovRent);
  const { listings, mine, loaded, busy } = useRentals();
  const properties = useGame((st) => st.properties);
  // Your own listings by the name you gave the house, with where it is.
  const myTitle = (l: RentalListing) => {
    const own = properties.find((x) => x.id === l.propertyId);
    return own ? `${houseTitle(own)} · ${REGION_BY_ID[l.region]?.name ?? 'Kaduna'}` : `${DESIGN_BY_ID[l.design]?.name ?? 'House'} · ${REGION_BY_ID[l.region]?.name ?? 'Kaduna'}`;
  };
  useEffect(() => { void loadRentals(); }, []);
  const govOk = (GOV_WEEKLY_RENT[origin] ?? 0) > 0;
  const hasOwnHome = !!homePropertyId;
  const homeState = useGame((st) => st.homeState);
  // Every state's government houses, at the rent its governor set: yours first, then the cheapest.
  const rents = useCityLaws((st) => st.govRent);
  const govStates = [...REGION_IDS].sort((a, b) => (a === homeState ? -1 : b === homeState ? 1 : (rents[a] ?? govRentIn(a)) - (rents[b] ?? govRentIn(b))));

  return (
    <>
      <p className="muted" style={{ padding: '8px 16px' }}>
        Rent the government starter house, or a house another player has built. Rent comes out of your account every week, and you can stop renting any time.
      </p>
      {lease && (
        <div className="tile" style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 12 }}>
          <span className="tile-icon">🔑</span>
          <span className="tile-info">
            <b>Renting from @{lease.ownerUsername} · Current home</b>
            <small>{DESIGN_BY_ID[lease.design]?.name ?? 'House'} in {REGION_BY_ID[lease.region]?.name ?? 'Kaduna'} · {naira(lease.weekly)}/week</small>
          </span>
          <button className="btn sm" disabled={busy} onClick={() => leaveRental()}>Stop renting</button>
        </div>
      )}
      {govOk && (
        <>
          <h4 style={{ padding: '0 16px' }}>Government houses</h4>
          <p className="muted" style={{ padding: '0 16px', margin: 0, fontSize: 12 }}>Each state’s governor sets its rent, up to the president’s maximum. It goes into that state’s treasury. Too dear? Move to another state’s.</p>
          {govStates.map((city) => {
            const here = govRentOwed > 0 && city === homeState;
            return (
              <div className="tile" key={city} style={here ? { background: '#fef9c3', border: '1px solid #fde047', borderRadius: 12 } : undefined}>
                <span className="tile-icon" style={{ fontSize: 28 }}>🏚️</span>
                <span className="tile-info">
                  <b>{regionOf(city).name}{here ? ' · Current home' : ''}</b>
                  <small>{regionOf(city).tagline.split(' · ')[1] ?? `${regionOf(city).name} State`} government house</small>
                  <small style={{ color: '#059669', fontWeight: 600 }}>{naira(rents[city] ?? govRentIn(city))}/week</small>
                </span>
                {here
                  ? <button className="btn sm" onClick={() => clearGovRent()}>{hasOwnHome ? 'Stop renting' : 'Move out'}</button>
                  : <button className="btn sm go" disabled={!!lease} onClick={() => moveIntoGovHouse(city)}>{lease ? 'Leave rental first' : govRentOwed > 0 ? 'Move here' : 'Rent'}</button>}
              </div>
            );
          })}
        </>
      )}
      {mine.length > 0 && (
        <>
          <h4 style={{ padding: '0 16px' }}>Your houses for rent</h4>
          {mine.map((l) => (
            <div className="tile" key={l.propertyId}>
              <OtherThumb id={l.propertyId} design={l.design} className="hm-tile-pic" />
              <span className="tile-info">
                <b>{myTitle(l)}</b>
                <small>{l.tenant ? tenantTitle(l) : 'Waiting for a tenant'}</small>
                {l.tenant && <small>{tenantSince(l)}</small>}
                <small style={{ color: '#059669', fontWeight: 600 }}>{naira(l.weekly)}/week</small>
              </span>
              <button className="btn sm" disabled={busy} onClick={() => unlistRental(l.propertyId)}>{l.tenant ? 'Evict' : 'Unlist'}</button>
            </div>
          ))}
        </>
      )}
      <h4 style={{ padding: '0 16px' }}>Houses from players</h4>
      {listings.map((l) => (
        <div className="tile" key={l.propertyId}>
          <OtherThumb id={l.propertyId} design={l.design} className="hm-tile-pic" />
          <span className="tile-info">
            <b>{DESIGN_BY_ID[l.design]?.name ?? 'House'} · {REGION_BY_ID[l.region]?.name ?? 'Kaduna'}</b>
            <small>Owned by @{l.owner}</small>
            <small style={{ color: '#059669', fontWeight: 600 }}>{naira(l.weekly)}/week · first week up front</small>
          </span>
          <button className="btn sm go" disabled={busy || !!lease || money < l.weekly} onClick={() => rentHouse(l.propertyId)}>
            {lease ? 'Renting' : 'Rent'}
          </button>
        </div>
      ))}
      {loaded && !listings.length && <p className="muted" style={{ padding: '8px 16px' }}>No player houses are for rent right now. Owners list them from their house page.</p>}
    </>
  );
}

export function House() {
  const properties      = useGame((s) => s.properties);
  const minutes         = useGame((s) => Math.floor(s.minutes));
  const collectRent     = useGame((s) => s.collectRent);
  const govRentOwed     = useGame((s) => s.govRentOwed);
  const homeState       = useGame((s) => s.homeState);
  const govRent         = useCityLaws((s) => s.govRent[homeState] ?? govRentIn(homeState));
  const navWant         = useHouseNav((s) => s.want);
  const lastNavWant     = useRef(navWant);
  const [tab, setTab]   = useState<'mine' | 'land' | 'rent'>(properties.length ? 'mine' : 'land');
  const [open, setOpen] = useState<string | null>(() => {
    const p = useHouseNav.getState().property;
    useHouseNav.setState({ property: null });
    return p;
  });
  useEffect(() => {
    if (navWant === lastNavWant.current) return;
    lastNavWant.current = navWant;
    const property = useHouseNav.getState().property;
    useHouseNav.setState({ property: null });
    setOpen(property);
    setTab('mine');
  }, [navWant]);

  useEffect(() => { void loadRentals(); }, []);
  if (open) return <PropertyPage id={open} back={() => setOpen(null)} />;

  const worth = netWorthOf({ money: 0, investments: {}, properties });
  const daily = properties.filter((p) => p.rented && isComplete(p)).reduce((a, p) => a + rentPerDay(p), 0);
  const due   = properties.reduce((a, p) => a + rentDue(p, minutes).amount, 0);

  return (
    <>
      <div className="hero">
        <small>Property portfolio</small>
        <b>{naira(worth)}</b>
        <small>
          {properties.length} propert{properties.length === 1 ? 'y' : 'ies'} · rent {naira(daily)}/day
        </small>
        {due > 0 && (
          <button className="btn sm go" style={{ marginTop: 8, background: 'var(--surface)', color: '#92400e', alignSelf: 'flex-start' }} onClick={collectRent}>
            Collect {naira(due)} rent
          </button>
        )}
      </div>

      {/* Government rent notice */}
      {govRentOwed > 0 && (
        <div style={{
          margin: '12px 12px 0', padding: '12px 14px', borderRadius: 12,
          background: '#fef3c7', border: '1px solid #fcd34d',
        }}>
          <b style={{ fontSize: 13 }}>🏚️ Government house, {regionOf(homeState).name}: {naira(govRent)} a week</b>
          <p style={{ fontSize: 12, margin: '4px 0 0', color: '#78350f' }}>
            Taken every game week (about 7 hours of play), at the rate {regionOf(homeState).name}’s governor sets. Build or
            rent your own place to stop paying, or move to a cheaper state’s government house under For rent.
          </p>
        </div>
      )}

      <div className="tabs">
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>🏠 My properties</button>
        <button className={tab === 'land' ? 'on' : ''} onClick={() => setTab('land')}>📍 Buy land</button>
        <button className={tab === 'rent' ? 'on' : ''} onClick={() => setTab('rent')}>🔑 For rent</button>
      </div>

      {tab === 'land' && (
        <BuyLand />
      )}

      {tab === 'mine' && (
        properties.length === 0 ? (
          <p className="muted">No land yet. Buy a plot in Kaduna, Abuja, Lagos or Kano, then build on it.</p>
        ) : (
          properties.map((p) => <HomeCard key={p.id} p={p} minutes={minutes} onOpen={() => setOpen(p.id)} />)
        )
      )}

      {tab === 'rent' && <RentTab />}
    </>
  );
}
