// House: the property app. Buy land around Kaduna, build on it stage by stage, then rent it out or sell.
// Each region also has an estate area (three/Estate.tsx) where your houses stand next to other players'.

import { regionOf } from '../game/regions';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { naira, netWorthOf, useGame } from '../game/store';
import { sectionOf } from '../game/estate';
import { HOUSE_LAYOUTS } from '../game/grid';
import { HOUSEHOLD_STAFF, HOUSE_STAFF_ROLES, staffTheftChance, type HouseStaffRole } from '../game/staff';
import { GOV_WEEKLY_RENT } from '../game/store';
import { leaveRental, listForRent, loadRentals, rentHouse, unlistRental, useRentals } from '../net/rentals';
import {
  builtOn, cityEstates, CONTRACTORS, costOf, DESIGN_BY_ID, DESIGNS, isComplete, landAuthority, LAND_RECLAIM_MINUTES, MATERIAL_BY_ID, materialPrice, PLOTS, REGION_BY_ID,
  PLAYER_RENT, remainingBuildMinutes, remainingStageMaterials, rentDue, rentPerDay, saleValue, weeklyRentOf, stageLabour, stageMaterials, STAGES, type Property,
} from '../game/property';

/** Asks the phone to open House, optionally on one property (from the estate area). */
export const useHouseNav = create<{ want: number; property: string | null }>(() => ({ want: 0, property: null }));
export function openHouse(property: string | null = null) {
  useHouseNav.setState((s) => ({ want: s.want + 1, property }));
  useGame.getState().setPanel('phone');
}

/** The plot drawn as it stands: beacons on bare land, then foundation, walls, roof and a painted house. */
export function SiteArt({ p, height = 120 }: { p: Property; height?: number }) {
  const design = p.design ? DESIGN_BY_ID[p.design] : null;
  const two = design?.floors === 2;
  const wide = p.plot === 'double' ? 1.25 : p.plot === 'half' ? 0.8 : 1;
  const w = 120 * wide;
  const x0 = 120 - w / 2;
  const ground = 92;
  const wallH = two ? 52 : 30;
  const done = p.stage;
  const painted = done >= 4;
  const wall = painted ? '#fde68a' : '#9ca3af';
  return (
    <svg viewBox="0 0 240 110" style={{ width: '100%', height, display: 'block', borderRadius: 14, background: 'linear-gradient(#bae6fd, #e0f2fe)' }} aria-hidden>
      <rect x="0" y={ground} width="240" height="18" fill="#c98b5e" />
      <rect x={x0 - 8} y={ground - 2} width={w + 16} height="4" fill="#b7794c" />
      {/* Survey beacons at the corners */}
      {[x0 - 6, x0 + w + 6].map((bx) => (
        <rect key={bx} x={bx - 2} y={ground - 8} width="4" height="8" fill="#ef4444" />
      ))}
      {done >= 1 && <rect x={x0} y={ground - 5} width={w} height="5" fill="#6b7280" />}
      {done >= 2 && (
        <g>
          <rect x={x0 + 4} y={ground - 5 - wallH} width={w - 8} height={wallH} fill={wall} />
          {!painted &&
            Array.from({ length: Math.floor(wallH / 6) }, (_, i) => (
              <line key={i} x1={x0 + 4} x2={x0 + w - 4} y1={ground - 5 - i * 6} y2={ground - 5 - i * 6} stroke="#6b7280" strokeWidth="0.6" />
            ))}
          {two && <rect x={x0 + 4} y={ground - 5 - wallH / 2 - 1} width={w - 8} height="2" fill="#78716c" />}
        </g>
      )}
      {done >= 2 && painted && (
        <g>
          <rect x={120 - 7} y={ground - 25} width="14" height="20" fill="#7c2d12" />
          {[x0 + 14, x0 + w - 28].map((wx) => (
            <rect key={wx} x={wx} y={ground - 24} width="14" height="10" fill="#38bdf8" stroke="#fff" strokeWidth="1.5" />
          ))}
          {two &&
            [x0 + 14, 113, x0 + w - 28].map((wx) => <rect key={`u${wx}`} x={wx} y={ground - 5 - wallH + 8} width="14" height="10" fill="#38bdf8" stroke="#fff" strokeWidth="1.5" />)}
        </g>
      )}
      {done >= 3 && (
        <polygon points={`${x0 - 6},${ground - 5 - wallH} ${120},${ground - 5 - wallH - 22} ${x0 + w + 6},${ground - 5 - wallH}`} fill={painted ? '#b91c1c' : '#94a3b8'} />
      )}
      {done < 4 && done >= 1 && (
        // Cement bags piled by the site while work goes on
        <g>
          <rect x={x0 + w + 10} y={ground - 10} width="14" height="10" fill="#d6d3d1" stroke="#a8a29e" />
          <rect x={x0 + w + 13} y={ground - 16} width="10" height="6" fill="#d6d3d1" stroke="#a8a29e" />
        </g>
      )}
      {painted && <text x={x0 - 22} y={ground - 2} fontSize="22">🌴</text>}
      {p.building && <text x={x0 + w + 12} y={ground - 24} fontSize="16">👷🏾</text>}
      {!design && <text x="120" y="55" textAnchor="middle" fontSize="11" fill="#475569" fontWeight="700">Bare land · pick a design</text>}
    </svg>
  );
}

function status(p: Property, minutes: number) {
  if (p.building) {
    const left = Math.max(0, p.building.doneAt - minutes);
    const pct = 100 * (1 - left / (p.building.doneAt - p.building.startedAt));
    return { text: `${STAGES[p.stage].name} under way · ${Math.ceil(left)} sec left`, pct };
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
  const hired = CONTRACTORS.find((c) => c.id === contractor)!;

  return (
    <>
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={back}>‹ All properties</button>
      <div className="inv-card">
        <SiteArt p={p} height={140} />
        <div className="inv-meta">
          <b>{design ? `${design.icon} ${design.name}` : '📜 Bare land'}</b>
          <small>{PLOTS[p.plot].label} · {region.name}</small>
          {st.text && <small>{st.text}</small>}
        </div>
        {!isComplete(p) && <div className="bar"><i style={{ width: `${st.pct}%` }} /></div>}
        <div className="inv-stats">
          <span>Put in: <b>{naira(p.spent)}</b></span>
          <span>Worth: <b className="good">{naira(sale)}</b></span>
        </div>
        <div className="row-btns inv-actions">
          {isComplete(p) && (
            <button className="btn sm go" disabled={homePropertyId === p.id} title={homePropertyId === p.id ? undefined : 'Moving in ends any current rental'} onClick={() => setHomeProperty(p.id)}>
              {homePropertyId === p.id ? '🏠 Your home' : '🏠 Live here'}
            </button>
          )}
          <button className="btn sm" title={`Go to ${region.name} (${sectionOf(p.slot ?? 0) + 1})`} onClick={() => visitEstate(p.region, sectionOf(p.slot ?? 0))}>📍 Visit</button>
        </div>
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
            if (confirm(`Sell this property for ${naira(sale)}?`)) {
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
          <b>{mine?.tenant ? `Rented by @${mine.tenant}` : mine ? 'Listed for rent' : 'Empty'}</b>
          <small>
            {mine?.tenant ? `${naira(mine.weekly)}/week, paid straight to you` : `Other players can rent it from the For rent tab. ${naira(min)} to ${naira(max)} a week.`}
          </small>
        </span>
        {mine && <button className="btn sm" disabled={busy} onClick={() => unlistRental(p.id)}>{mine.tenant ? 'Evict' : 'Unlist'}</button>}
      </div>
      {!mine?.tenant && (
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
  useEffect(() => { void loadRentals(); }, []);
  const govWeekly = GOV_WEEKLY_RENT[origin] ?? 0;
  const hasOwnHome = !!homePropertyId;

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
      {govWeekly > 0 && (
        <div className="tile" style={govRentOwed > 0 ? { background: '#fef9c3', border: '1px solid #fde047', borderRadius: 12 } : undefined}>
          <span className="tile-icon" style={{ fontSize: 28 }}>🏚️</span>
          <span className="tile-info">
            <b>Government starter house{govRentOwed > 0 ? ' · Current home' : ''}</b>
            <small>Your starter place from Kaduna State.</small>
            <small style={{ color: '#059669', fontWeight: 600 }}>{naira(govWeekly)}/week</small>
          </span>
          {govRentOwed > 0
            ? <button className="btn sm" onClick={() => clearGovRent()}>{hasOwnHome ? 'Stop renting' : 'Move out'}</button>
            : <button className="btn sm go" disabled={!!lease} onClick={() => moveIntoGovHouse()}>{lease ? 'Leave rental first' : 'Rent'}</button>}
        </div>
      )}
      {mine.length > 0 && (
        <>
          <h4 style={{ padding: '0 16px' }}>Your houses for rent</h4>
          {mine.map((l) => (
            <div className="tile" key={l.propertyId}>
              <span className="tile-icon" style={{ fontSize: 28 }}>🏠</span>
              <span className="tile-info">
                <b>{DESIGN_BY_ID[l.design]?.name ?? 'House'} · {REGION_BY_ID[l.region]?.name ?? 'Kaduna'}</b>
                <small>{l.tenant ? `Rented by @${l.tenant}` : 'Waiting for a tenant'}</small>
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
          <span className="tile-icon" style={{ fontSize: 28 }}>🏠</span>
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

  if (open) return <PropertyPage id={open} back={() => setOpen(null)} />;

  const worth = netWorthOf({ money: 0, investments: {}, properties });
  const daily = properties.filter((p) => p.rented && isComplete(p)).reduce((a, p) => a + rentPerDay(p), 0);
  const due   = properties.reduce((a, p) => a + rentDue(p, minutes).amount, 0);

  return (
    <>
      <div className="hero" style={{ background: 'linear-gradient(135deg, #d97706, #78350f)' }}>
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
          <b style={{ fontSize: 13 }}>🏚️ Government house: {naira(govRentOwed)}/week</b>
          <p style={{ fontSize: 12, margin: '4px 0 0', color: '#78350f' }}>
            You're living in a government starter house. Build or rent your own property and
            select it as your home to stop paying weekly rent.
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
          properties.map((p) => {
            const design = p.design ? DESIGN_BY_ID[p.design] : null;
            const st = status(p, minutes);
            return (
              <button key={p.id} className="inv-card" style={{ textAlign: 'left' }} onClick={() => setOpen(p.id)}>
                <SiteArt p={p} height={90} />
                <div className="inv-meta">
                  <b>{design ? design.name : 'Bare land'} · {REGION_BY_ID[p.region].name}</b>
                  {st.text && <small>{st.text}</small>}
                </div>
                {!isComplete(p) && <div className="bar"><i style={{ width: `${st.pct}%` }} /></div>}
              </button>
            );
          })
        )
      )}

      {tab === 'rent' && <RentTab />}
    </>
  );
}
