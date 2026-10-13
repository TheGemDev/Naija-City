// The small card you see inside a house: whose it is, where it stands and when it was built.
// In your own house it is a card of its own; in someone else's the same lines sit on the visit bar (ui/HouseVisitBar.tsx).

import type { ReactNode } from 'react';
import { useGame } from '../game/store';
import { useVisit } from '../game/visits';
import { CAP, sectionOf } from '../game/estate';
import { builtOn, REGION_BY_ID } from '../game/property';
import { getRegion } from '../game/regions';
import { Icon } from './Icons';
import './house-card.css';

export interface HouseAddress {
  /** Estate region of a house that was built; none for the government starter house. */
  region?: string | null;
  slot?: number | null;
  builtAt?: number | null;
  /** The city the house is in. A built house takes it from its estate. */
  city?: string | null;
}

/** Where a house stands and when it went up: "Kachia 2, Kaduna · Plot 14 · Built 3/4/26". Empty when nothing is known. */
export function houseFacts(h: HouseAddress): string {
  const estate = REGION_BY_ID[h.region ?? ''];
  const city = getRegion(estate?.city ?? h.city ?? '')?.name;
  if (!estate && !city) return '';
  const built = builtOn({ builtAt: h.builtAt ?? undefined });
  return [
    estate
      ? [`${estate.name}${h.slot != null ? ` ${sectionOf(h.slot) + 1}` : ''}`, city].filter(Boolean).join(', ')
      : `Government house, ${city}`,
    estate && h.slot != null && `Plot ${(h.slot % CAP) + 1}`,
    built && `Built ${built}`,
  ].filter(Boolean).join(' · ');
}

/** The owner on one line, the address and build date under it. */
export function HouseFacts({ title, address }: { title: ReactNode; address: HouseAddress }) {
  const facts = houseFacts(address);
  return (
    <span className="house-facts">
      <b>{title}</b>
      {facts && <small>{facts}</small>}
    </span>
  );
}

/** At home: the card for the house you are standing in. */
export function HouseCard() {
  const visiting = useVisit((v) => !!v.current);
  // The action sheet, furnishing and the phone all use this strip of screen.
  const shown = useGame((s) => s.view === 'home' && s.mode === 'live' && !s.selectedId && !s.panel && !s.placing);
  const house = useGame((s) => s.properties.find((p) => p.id === (s.activeHouseId ?? s.homePropertyId)));
  const city = useGame((s) => s.homeState);
  if (!shown || visiting) return null;
  return (
    <div className="house-card" role="status">
      <Icon name="home" size={15} />
      <HouseFacts title="Your house" address={house ?? { city }} />
    </div>
  );
}
