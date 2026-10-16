import { create } from 'zustand';
import type { SaveData } from './save';
import type { HouseholdStaff } from './staff';
import type { HousePaint } from './paint';
import type { Supply } from './power';

export interface HouseVisit {
  ownerUid: string;
  ownerUsername: string;
  ownerName: string | null;
  propertyId?: string | null;
  /** Where the house stands and when it was finished, for the card inside (ui/HouseCard.tsx). A starter house has only its city. */
  region?: string | null;
  slot?: number | null;
  builtAt?: number | null;
  city?: string | null;
  /** What their house runs on (game/power.ts). The light here follows it, never the visitor's own supply. */
  supply?: Supply;
  /** Their meter is bypassed: you can see the wire and report it. */
  meterBypassed?: boolean;
  save: Pick<SaveData, 'origin' | 'items'> & { design?: string | null; walls?: string[]; paint?: HousePaint; finish?: import('./finishes').HouseFinish; staff?: HouseholdStaff[]; ownedCars?: string[]; houseStation?: string | null; exterior?: import('./exterior').HouseExterior | null };
  selectedItemId?: string | null;
  burglary?: boolean;
}

/** Where an invited house stands, as the invite carries it (worker/social.ts): the city, and the estate plot if it is in one. Null for an older invite. */
export function inviteSpot(text: string): { city: string; region: string | null; slot: number | null } | null {
  const m = /^home:([a-z]+)\|([a-z0-9_]*)\|(\d*)$/.exec(text);
  return m ? { city: m[1], region: m[2] || null, slot: m[3] === '' ? null : Number(m[3]) } : null;
}

interface VisitState {
  current: HouseVisit | null;
  returnSave: SaveData | null;
}

export const useVisit = create<VisitState>(() => ({ current: null, returnSave: null }));
