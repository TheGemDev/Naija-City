// What every list of your houses shows, so you can tell them apart at a glance: the picture (the real house model,
// three/houseThumbs.tsx), the name you gave it (or its design), where it is (estate, plot, city and state), what it is
// (design, bedrooms) and what is happening there (living here, rented to @someone, being built). Used by the House app
// (Gida.tsx), the going-home picker (TravelPicker.tsx) and the house switcher on the house card (HouseCard.tsx).

import { useState } from 'react';
import { useGame } from '../game/store';
import { CAP, sectionOf } from '../game/estate';
import { DESIGN_BY_ID, estateCity, houseTitle, isComplete, REGION_BY_ID, STAGES, type Property } from '../game/property';
import { EXTENSION_BY_ID, HOUSE_NAME_MAX, cleanHouseName } from '../game/exterior';
import { getRegion } from '../game/regions';
import { paintHex } from '../game/paint';
import { CAR_BY_ID } from '../game/cars';
import { useRentals } from '../net/rentals';
import { useHouseThumb } from '../three/houseThumbs';
import { lotFrame, lotLook, type Lot } from '../three/Estate';
import { Emoji } from './Icons';
import './homes.css';

/** The state each city is in, for the address line. */
const STATE: Record<string, string> = { kaduna: 'Kaduna State', abuja: 'FCT', lagos: 'Lagos State', kano: 'Kano State' };
/** "Abuja, FCT". */
export const cityState = (city: string) => `${getRegion(city)?.name ?? 'Kaduna'}, ${STATE[city] ?? 'Nigeria'}`;

/** Bedrooms (or flats) a house has, extensions included. */
export function bedsOf(p: Pick<Property, 'design' | 'extensions'>): string {
  const base = { selfcon: 1, bungalow: 3, duplex: 4, flats: 0, mansion: 5 }[p.design ?? ''] ?? 0;
  if (p.design === 'flats') return '6 flats';
  const extra = (p.extensions ?? []).reduce((a, e) => a + (e === 'floor2' ? 2 : e === 'bq' ? 1 : 0), 0);
  const n = base + extra;
  return n ? `${n} bed${n === 1 ? '' : 's'}` : '';
}

/** "Gwarinpa Estate 2 · Plot 14". */
export const estateLine = (p: Pick<Property, 'region' | 'slot'>) =>
  `${REGION_BY_ID[p.region]?.name ?? 'Estate'} Estate ${sectionOf(p.slot ?? 0) + 1} · Plot ${((p.slot ?? 0) % CAP) + 1}`;

export type HomeStatus = { text: string; tone: 'home' | 'let' | 'build' | 'idle' | 'land' };

/** What is going on at a house right now, as one short chip. */
export function useHomeStatus(p: Property): HomeStatus {
  const home = useGame((s) => s.homePropertyId === p.id);
  const minutes = useGame((s) => s.minutes);
  const listing = useRentals((s) => s.mine.find((l) => l.propertyId === p.id));
  if (!p.design) return { text: 'Bare land', tone: 'land' };
  if (p.building) {
    const pct = Math.round(100 * Math.max(0, Math.min(1, (minutes - p.building.startedAt) / Math.max(1, p.building.doneAt - p.building.startedAt))));
    const what = p.extending ? EXTENSION_BY_ID[p.extending.id]?.name ?? 'Extension' : STAGES[p.stage]?.name ?? 'Building';
    return { text: `🚧 ${what} · ${pct}%`, tone: 'build' };
  }
  if (!isComplete(p)) return { text: `🚧 Ready for ${STAGES[p.stage]?.name.toLowerCase() ?? 'work'}`, tone: 'build' };
  if (listing?.tenant) return { text: listing.npc ? `🔑 Let to ${listing.tenant}` : `🔑 Rented to @${listing.tenant}`, tone: 'let' };
  if (p.rented) return { text: '🔑 Let to tenants', tone: 'let' };
  if (home) return { text: '🏠 Living here', tone: 'home' };
  if (listing) return { text: '📋 Listed for rent', tone: 'idle' };
  return { text: 'Empty', tone: 'idle' };
}

/** A property as the estate kit draws it: your paint, your outside, your cars where you live. */
export function usePropertyLot(p: Property): Lot {
  const wall = useGame((s) => paintHex(s.housePaint[p.id]?.outer));
  const home = useGame((s) => s.homePropertyId === p.id);
  const cars = useGame((s) => s.ownedCars);
  return {
    key: p.id, slot: 0, plot: p.plot, stage: p.stage, design: p.design, owner: 'You', mine: true, building: !!p.building, uid: null,
    name: p.name, exterior: p.exterior, extensions: p.extensions, wall,
    cars: home && isComplete(p) ? cars.slice(-2).map((id) => CAR_BY_ID[id]?.color ?? '#475569') : [],
  };
}

/** The house's picture: its 3D model once drawn, a soft placeholder with the design's icon until then. */
export function LotThumb({ lot, className = '' }: { lot: Lot; className?: string }) {
  const look = lotLook(lot);
  // Every plot is drawn on the same frame (slot 0), so the picture doesn't change when a plot moves.
  const url = useHouseThumb(look, lotFrame(0, lot.plot).frame);
  return (
    <div className={`hm-thumb ${className}`}>
      {url ? <img src={url} alt="" draggable={false} /> : <span className="hm-thumb-wait"><Emoji char={DESIGN_BY_ID[lot.design ?? '']?.icon ?? '📜'} size={34} /></span>}
    </div>
  );
}

export function PropertyThumb({ p, className }: { p: Property; className?: string }) {
  return <LotThumb lot={usePropertyLot(p)} className={className} />;
}

/** Someone else's house (one you rent, the government's): drawn the way the estate draws a neighbour's. */
export function OtherThumb({ id, design, plot = 'full', className }: { id: string; design: string | null; plot?: Property['plot']; className?: string }) {
  return <LotThumb lot={{ key: id, slot: 0, plot, stage: STAGES.length, design, owner: '', mine: false, building: false, uid: null }} className={className} />;
}

/** Title, design and the full address of a house, as lines for a card. */
export function homeLines(p: Property) {
  const design = DESIGN_BY_ID[p.design ?? ''];
  return {
    title: houseTitle(p),
    /** The design under a name; nothing when the title already is the design. */
    design: p.name && design ? design.name : null,
    estate: estateLine(p),
    city: cityState(estateCity(p.region)),
    beds: bedsOf(p),
  };
}

/** Name a house in place: the pencil opens a field, Enter or Save keeps it (cleaned like the server does). */
export function RenameHouse({ p, big = false }: { p: Property; big?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.name ?? '');
  const rename = useGame((s) => s.renameProperty);
  const save = () => {
    rename(p.id, draft);
    setEditing(false);
  };
  if (!editing) {
    return (
      <button type="button" className={`hm-rename ${big ? 'big' : ''}`} onClick={(e) => { e.stopPropagation(); setDraft(p.name ?? ''); setEditing(true); }} aria-label={`Rename ${houseTitle(p)}`}>
        <span className="hm-title">{houseTitle(p)}</span>
        <span className="hm-pencil" aria-hidden>✏️</span>
      </button>
    );
  }
  return (
    <form className="hm-rename-form" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); save(); }}>
      <input
        className="text-input"
        autoFocus
        maxLength={HOUSE_NAME_MAX * 2}
        value={draft}
        placeholder={DESIGN_BY_ID[p.design ?? '']?.name ?? 'Name this house'}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="House name"
      />
      <small className="hm-count">{Array.from(cleanHouseName(draft)).length}/{HOUSE_NAME_MAX}</small>
      <button type="submit" className="btn sm go">Save</button>
      <button type="button" className="btn sm" onClick={() => setEditing(false)}>Cancel</button>
    </form>
  );
}

/** The houses you can live in, in the House app's order: finished ones, by when you bought them. */
export const finishedHomes = (props: Property[]) => props.filter(isComplete);
