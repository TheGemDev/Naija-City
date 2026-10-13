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
  save: Pick<SaveData, 'origin' | 'items'> & { design?: string | null; walls?: string[]; paint?: HousePaint; staff?: HouseholdStaff[]; ownedCars?: string[]; houseStation?: string | null };
  selectedItemId?: string | null;
  burglary?: boolean;
}

interface VisitState {
  current: HouseVisit | null;
  returnSave: SaveData | null;
}

export const useVisit = create<VisitState>(() => ({ current: null, returnSave: null }));
