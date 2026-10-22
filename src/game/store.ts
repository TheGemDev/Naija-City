import { brokenAsset } from '../net/roads';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { DECAY, DRAIN_SCALE, fed, FOOD_DELIVERY, FOOD_ENERGY, ITEMS, NEEDS, PHONE_ACTIONS, TOILET_FRESHEN, WORK_HUNGER, type ActionDef, type ActivityAnimation, type Need } from './catalog';
import { HOSPITAL_BILL, HUNGER_WARN, useFainted } from './fainted';
import { STORY_ROUTE_CHANCE, STORY_ROUTE_MIN_CELLS } from './streetScenes';
import { pickStreetStory, RECENT_STORIES, rollChoice, type StoryFlag, type StreetStory } from './stories';
import { activeEvent, activeRoadEvent, blackMarketPrice, FUEL, fuelPrice, gridOn } from './live';
import { isHighNow, SEIZED_SLOTS, viceHooks } from './vice';
import { GIGS, gigRoom, noteGig, oddJobPay, type GigId } from './gigs';
import { SHIFT, shiftBonus, takeShiftScore } from './shiftGame';
import { legacyOf, type LegacyBreakdown, type LegacyRecord, type StatKey, type Stats } from './legacy';
import { driveHooks, driveState } from './driveState';
import { avatar, avatarCell, resetAvatar } from './avatar';
import { useVisit } from './visits';
import { ITEM_PAINT, isColourRef, type HousePaint, type WallPart } from './paint';
import { LIGHTS, applyFinish, cleanLamp, finishCost, finishLabel, validValue, type FinishChange, type HouseFinish, type LampSetting } from './finishes';
import { WALL_BUILD_COST, WALL_KNOCK_COST, arrivalCell, edgeKey, fitItemsToLayout, houseLayout, inGrid, isEditableEdge, wallBuildError, type WallEdge, itemTransform, pathToCell, pathToItem, placementError, type Cell, type HouseLayout, type PlacedItem } from './grid';
import { DEFAULT_ITEMS } from './defaults';
import { childrenOf, tidy, type Pose } from './mount';
import { activeMap, cityMap, cityPathToCell, cityPathToPlace, cityStraightPath, HOME_PLACE, hoursLabel, isOpen, mapGroundY, PLACE_BY_ID, placeAction, placeHere, setActiveMap, turnedAwayForSmell } from './city';
import { exitCell, frontCell, interiorPathToCell, interiorPathToProp, INTERIORS, propDef, propTransform } from './interiors';
import { CHECKOUT_WARNING, HOTEL_ID, isHotelRoom, MAX_NIGHTS, NIGHT, nightlyIn, nightsFree, ROOM_BY_ID, roomNumber, roomPlaceId, stayActive, stayCountdown, stayIn, type HotelStay, type HotelStays, type RoomTypeId } from './hotel';
import { isPrivateRoom, isVillaSuite, roomParent, SUITE_ID, VILLA_ID } from './villa';
import { cellAt, cellHooks, CELLS, CELLS_ID, CELLS_PARENT, inCellNow } from './cells';
import { heldOffice, lostOffice } from '../net/office';
import { SKIP_MIN_TASK, SKIP_RATE, TASK_RATE, TIME_RATE, WORK_RATE } from './timeRates';
import { INVESTMENT_BY_ID, LIQUIDATION_FACTOR, MAX_TRADE_UNITS, paidFor, priceOf, type Holding } from './investments';
import { PHONE_BY_ID, PHONE_RESALE_FACTOR, STARTER_ANDROID } from './phones';
import { SELF_CARE, selfCarePick } from './selfCare';
import { CAR_BY_ID, JET_BY_ID, JET_FUEL, jetFlightsLeft, jetFlown, jetFuelLeft, jetRefuelCost, jetResale, jetServiceCost, jetToFly } from './cars';
import { CAR_FUEL, fuelLeft, fuelUse } from './carFuel';
import { DEFAULT_KM, fareForKm, kmBetween, stateFareForKm } from './fares';
import { chargeTreasury, stateRide } from '../net/civic';
import { drainScale, genBurn, generatorOf, GENERATORS, houseLoad, modeOf, onGrid, POWER, supplied, supplyGen, type PowerMode } from './power';
import { billShare, inspect, meterOn, METER, NO_METER, REASON_TEXT, rollInspection, type InspectionReason, type MeterLevel, type MeterState } from './meterBypass';
import { blockerOf, conditionOf, damage, newCondition, PART_IDS, PARTS, repairCost, resaleOf, valueOf, wear, type CarCondition, type CarPart } from './carCare';
import {
  CONTRACTOR_BY_ID, DAY_MINUTES, DESIGN_BY_ID, costOf, LAND_RECLAIM_MINUTES, landAuthority, landPrice, MATERIAL_BY_ID, materialPrice, missingMaterials, PLOTS, propRef, estateCity, REGION_BY_ID, remainingStageMaterials, rentDue, saleValue, STAGES,
  stageLabour, stageMinutes, houseTitle, extensionDesign, type PlotSize, type Property,
} from './property';
import { estateExit } from './estateRoads';
import { cleanExtensions, cleanHouseName, cleanRooms, ROOM_TYPE, EXTENSION_BY_ID, extensionBlock, exteriorChangeCost, exteriorOf, layoutKey, withPark, type HouseExterior, type ExtensionId, type RoomSetting } from './exterior';
import { audio } from './audio';
import { CLUB_SHOUTS, clearSprayLog, shoutoutHooks, sprayKickChance, useMoneyRain } from './shoutout';
import { entrance, estatePath, houseRect, PLOT, rowsFor, sectionOf, slotOrigin, type EstateLot } from './estate';
import { firstInstallment, ORIGINS, originOf, type OriginId } from './origins';
import { CAMPAIGN_EVENTS, OFFICE_RULES, STATE_FLEET, type CampaignEvent, type ExecutiveOffice, type PoliticalOffice } from './civic';
import { decodeLook, encodeLook, fits, GARMENT_BY_ID, isFullOutfit, STARTER_WARDROBE, type ShopId, type Slot } from './wardrobe';
import { govRentIn } from './cityLaws';
import { getRegion, regionalAction, regionOf, regionPlace, regionPlaces, regionAirportDoor, regionStartDoor } from './regions';
import { fareRef, subsidise, type FareSubsidy } from './transport';
import { HOUSEHOLD_STAFF, HOUSE_STAFF_ROLES, STARTER_HOUSE, rollStaffTheft, type StaffRole, type HouseholdStaff, type HouseStaffRole } from './staff';
import { careerHooks, careerState } from './career';
import { employment, jobById, shiftClock, shiftHours, shiftMinutes, streakPay, wageFor, workplaceOf } from './jobs';
import { KID_ACTIONS, kidHooks } from './kids';

export const START_MINUTES = 7 * 60; // Day 1, 7:00 AM
export const DAY = 24 * 60;
/** Longest nickname you can give another player. */
export const ALIAS_MAX = 24;

/**
 * Who may live in a government house, and the mark `govRentOwed` carries while they do. What they pay a week is the
 * state's own law (game/cityLaws.ts govRentIn), the same for everyone in that state. Sapa / Gbese has no starter house.
 */
export const GOV_RENT = 10_000;
export const GOV_WEEKLY_RENT: Partial<Record<OriginId, number>> = {
  starter: GOV_RENT,
  lapo: GOV_RENT,
  nepo: GOV_RENT,
  richkid: GOV_RENT,
  dangote: GOV_RENT,
};

/** Hooks the network layer fills in (src/net/rentals.ts): tenants go "home" to the house they rent. */
export const rentalHooks: { enter?: () => void } = {};
/**
 * The furniture editor (game/decor.ts) fills these: where the piece being placed really goes (wall, top, free angle,
 * a whole group), turning pieces, and boxing up what lost its wall. Unset, the plain grid rules apply.
 */
export const decorHooks: {
  plan?: (c: Cell) => { err?: string | null; cand?: Pose; items?: PlacedItem[] } | null;
  turn?: (ids: string[], deg: number) => void;
  settle?: (why: string) => void;
} = {};

/** Who a player is renting from (src/net/rentals.ts keeps it current). Not saved: the server owns it. */
export interface Lease {
  propertyId: string;
  ownerUid: string;
  ownerUsername: string;
  design: string;
  region: string;
  weekly: number;
  paidThrough: number;
}

export { TIME_RATE, TASK_RATE, SKIP_RATE, WORK_RATE };
/** Game minutes per real second right now: the slow world rate when idle, the task pace inside a task (see game/timeRates.ts). */
export const timeRate = (s: Pick<GameState, 'task'>) =>
  s.task?.phase !== 'doing' ? TIME_RATE
    // A shift runs at its own pace, and stands still once it has run out and you are waiting to clock out.
    : s.task.actionId === 'work' ? (s.task.over ? TIME_RATE : WORK_RATE)
      : s.task.total >= SKIP_MIN_TASK || s.task.fast ? SKIP_RATE : TASK_RATE;
/** A shift that has run out is clocked out for you after this long (real time), so nobody is left standing at work. */
const CLOCK_OUT_GRACE_MS = 45_000;
export const taskDurationSeconds = (gameMinutes: number, totalGameMinutes = gameMinutes, fast = false) =>
  Math.ceil(gameMinutes / (totalGameMinutes >= SKIP_MIN_TASK || fast ? SKIP_RATE : TASK_RATE));

export interface Task {
  itemId: string | null;
  /** Set when the task is at a town place: travelling to it on the map, or using a prop inside it. */
  placeId?: string;
  travelMode?: TravelMode;
  carId?: string;
  actionId: string;
  animation?: ActivityAnimation;
  actionAfterTravel?: string;
  label: string;
  icon: string;
  phase: 'walking' | 'doing';
  /** Runs at SKIP_RATE however short it is (cooking). */
  fast?: boolean;
  /** Game minutes left once doing. */
  remaining: number;
  total: number;
  /** For work: the minute the shift started. */
  startedAt?: number;
  /** For work: the shift has run out and you have not clocked out yet. The real time (ms) it ran out. */
  over?: number;
  /** In the air: the scene shows the cabin (three/FlightCabin.tsx) instead of the airport. On a train: the coach (three/TrainRide.tsx). */
  flight?: 'ticket' | 'jet' | 'train';
  /** Riding in the state's fleet (game/civic.ts STATE_FLEET) as this office holder: the treasury paid. */
  official?: ExecutiveOffice;
  /** You started this yourself to fill this bar (game/selfCare.ts): it ends when the bar is full, and any tap stops it. */
  auto?: Need;
  /** The bar this activity fills was already full when it began: it runs its length anyway, it just adds nothing. */
  startFull?: boolean;
  /** A ride to an estate (game/estateRoads.ts): ends at its road out of town, then in at the gate, and to `home`'s door if set. */
  estate?: { region: string; no: number; home?: string };
}

/**
 * What a ticket (an airline seat or a train) costs you right now, after the government's fare subsidy, and the ref the
 * server prices it by (worker/wallet.ts charges the same). Null for anything that is not a ticket: your own jet is never subsidised.
 */
export function ticketOf(def: ActionDef, from: string, fares: FareSubsidy) {
  if (def.effect !== 'travel' || def.jet || !def.destination) return null;
  const mode = def.rail ? 'rail' as const : 'air' as const;
  const pct = fares.funded ? fares[mode] : 0;
  const base = def.cost ?? 0;
  const { off, price } = subsidise(base, pct);
  return { mode, base, off, pct: off ? pct : 0, price, ref: fareRef(mode, from, def.destination, def.cls) };
}

/** The kind of flight you are on right now, if you are in the air. */
export const flightOf = (s: Pick<GameState, 'task'>) => (s.task?.phase === 'doing' ? s.task.flight ?? null : null);

export type TravelMode = 'walk' | 'keke' | 'car' | 'okada' | 'cab' | 'helicopter';

export interface Txn {
  /** Game minutes. */
  at: number;
  label: string;
  amount: number;
  /** Real time (ms), on lines logged since the Bank's history became tappable. */
  real?: number;
  /** What sort of money it was, when pay() knows (MoneyKind). */
  kind?: MoneyKind;
}
/** A line for the Bank's history (`txns`), stamped with the game clock and the real one. */
export const txn = (s: { minutes: number }, label: string, amount: number, kind?: MoneyKind): Txn => ({ at: s.minutes, label, amount, real: Date.now(), ...(kind ? { kind } : {}) });
export interface Toast { id: number; text: string; chatUid?: string }

export interface Power {
  grid: boolean; // NEPA / KAEDCO supply
  genFuel: number; // 0-100
  genOn: boolean;
  /** Solar inverter battery, 0-100: charges in daylight, keeps the light on at night when NEPA is gone. */
  battery?: number;
  /** Chosen supply. Default 'grid'. 'solar' / 'gen' switch the grid off for this house. */
  mode?: PowerMode;
}

/**
 * Solar + inverter battery, per game hour: one full charge lasts a whole night of blackout. Each extra
 * inverter (up to `max`) adds a bank of batteries, so the charge lasts that much longer.
 */
export const INVERTER = { charge: 25, drain: 8, max: 3 };
export const inverterCount = (items: { type: string }[]) => Math.min(INVERTER.max, items.filter((i) => i.type === 'solar').length);
/** Game hours a full battery keeps the house lit. */
export const inverterHours = (items: { type: string }[]) => (100 / INVERTER.drain) * inverterCount(items);

interface Delivery { at: number; name: string; icon: string; hunger: number; fun: number }
export interface Campaign {
  office: PoliticalOffice;
  support: number;
  electionDay: number;
  lastActionDay: number;
}
export { CAMPAIGN_EVENTS, OFFICE_RULES, type PoliticalOffice } from './civic';

export interface GameState {
  started: boolean;
  name: string;
  look: string;
  /** Where this life started (src/game/origins.ts). */
  origin: OriginId;
  /** Still owed to LAPO (LAPO origin only). Paid weekly. */
  loanOwed: number;
  /**
   * Weekly rent for the government starter house (non-Almajiri), charged every 7 game days.
   * 0 when they don't live there: they moved into their own house or rent from a player.
   */
  govRentOwed: number;
  /** Day index of the last gov-rent deduction. */
  govRentPaidThrough: number;
  /** Personal staff (driver, nanny, bodyguard) hired in the Hire app, each assigned to a house. */
  personalStaff: HouseholdStaff[];
  /** The house this player rents from another player, if any. */
  lease: Lease | null;
  /** Garment ids you own (game/wardrobe.ts). What you wear is packed into `look`. */
  wardrobe: string[];
  minutes: number;
  money: number;
  debtOwed: number;
  /** Owed on open bank loans, interest included (src/net/loans.ts). Comes from the server, not the save. */
  bankLoanOwed: number;
  needs: Record<Need, number>;
  knowledge: number;
  cooking: number;
  items: PlacedItem[];
  /** Furniture stolen from other houses, waiting to be placed. */
  furnitureInventory: PlacedItem[];
  jobId: string | null;
  /** The city the job's workplace is in (game/jobs.ts). */
  jobCity: string | null;
  /** The day of the last shift you clocked in for. */
  workedDay: number;
  workDays: number;
  campaign: Campaign | null;
  governmentOffice: PoliticalOffice | null;
  goodDeeds: number;
  notoriety: number;
  streetStory: StreetStory | null;
  storyLog: string[];
  power: Power;
  waterTank: number;
  sallahRam: 'none' | 'unfed' | 'fed';
  txns: Txn[];
  deliveries: Delivery[];
  task: Task | null;
  warnedAt: Record<string, number>;
  investments: Record<string, Holding>;
  ownedCars: string[];
  /** Private jets (src/game/cars.ts), flown from the airport's flight desk. */
  ownedJets: string[];
  /** Flights each jet has made since its last service (game/cars.ts, JET_SERVICE). Missing: none. */
  jetWear: Record<string, number>;
  selectedCar: string | null;
  /** Wear and tear on each owned car (game/carCare.ts). Missing: good as new. */
  carCondition: Record<string, CarCondition>;
  /** Litres left in each car's tank (game/carFuel.ts). Missing: a full tank. */
  carFuel: Record<string, number>;
  /** The phone in your hand (game/phones.ts) and every phone you own. */
  phone: string;
  ownedPhones: string[];
  /** The free starter phone: no resale value. */
  freePhone: string | null;
  /** My own nicknames for other players, by uid. Only I see them. */
  aliases: Record<string, string>;
  /** Land and houses around Kaduna (game/property.ts). Shown in the House app, not on the map. */
  properties: Property[];
  /** Finished property selected as the player's home. */
  homePropertyId: string | null;
  /** House currently being visited; defaults to the selected home after loading a save. */
  activeHouseId: string | null;
  /** Interior wall edits per house (property id, or 'starter'): edge keys flipped from the design. */
  wallEdits: Record<string, string[]>;
  /** Repainted walls per house (same keys as wallEdits). */
  housePaint: Record<string, HousePaint>;
  /** Floors, walls, ceilings and night mood per house (same keys). Plain JSON: see game/finishes.ts for the format. */
  houseFinish: Record<string, HouseFinish>;
  /** Lifetime counters for achievements and the legacy score (game/legacy.ts). */
  stats: Stats;
  /** Things street stories left you with (a visa, going viral...). */
  storyFlags: StoryFlag[];
  /** Achievement ids unlocked this life. */
  achievements: string[];
  /** Street stories seen lately, so they don't repeat. */
  recentStories: string[];
  /** 25L jerrycans of fuel in your store. */
  fuelCans: number;
  /** Naira owed to NEPA for power used on the grid. Over POWER.cutoff they cut you off. */
  nepaOwed: number;
  /** Meter bypass bought off the Black Market (src/game/meterBypass.ts). */
  meter: MeterState;
  /** Property ids currently rented to a tenant. The owner pays their electricity. Not saved; comes from the server. */
  rentedOut: string[];
  /** Last game day NEPA was warned about / auto-paid. */
  nepaWarnedDay: number;
  nepaBilledDay: number;
  /** Game day you're invited to an owambe at Murtala Square, if any. */
  owambeInvite: number | null;
  /** The city whose square that invitation is for (Kaduna's when not set). */
  owambeInviteCity: string | null;
  /** Live or synth station id set on home speakers (all speakers play the same). */
  houseStation: string | null;
  /** Your hall of fame: lives you've finished. Kept across new lives. */
  legacy: LegacyRecord[];

  /** In the house, on the town map, inside a place, or walking round a region's estate. */
  view: 'home' | 'city' | 'place' | 'estate';
  /** The city map currently being visited. */
  destinationId: string;
  /** The state you were born in (game/regions.ts): your starter home, or the government house, stands in its city. */
  homeState: string;
  /** Region whose estate you're in when view is 'estate'. */
  estateId: string | null;
  /** Which estate of that region (0 = "Kachia 1"). */
  estateNo: number;
  /** The place you're inside when view is 'place'. A hotel room is a place too (game/hotel.ts). */
  insideId: string | null;
  /** The hotel room you hold, if any. It is yours until `until`, whether you are in it or not. */
  /** The hotel room you hold in each city (game/hotel.ts). */
  hotelStays: HotelStays;
  /** One-shot request for the phone to open its Bank app from a branch counter. */
  openBankApp: boolean;
  /** A phone app id to open next time the Phone mounts or updates (set by tapping a toast). */
  openApp: string | null;
  /** Tab the Bank app should open on (set by the branch's heist action). */
  bankTab: 'account' | 'savings' | 'loans' | 'history' | null;
  /** Tab the NEPA app should open on (set by tapping one of its toasts: game/toastTarget.ts). */
  lightTab: 'power' | 'bills' | 'water' | null;

  // UI state (not saved)
  mode: 'live' | 'buy';
  panel: null | 'phone' | 'map' | 'closet' | 'phoneShop' | 'profile';
  /** Which tab the profile sheet opens on (set by openProfile). */
  profileTab: 'profile' | 'stats' | 'settings';
  /** Clothes shop open (from a rack in the mall, market or boutique). */
  shopId: ShopId | null;
  selectedId: string | null;
  /** Place picked on the town map. */
  placeId: string | null;
  /** Bumped whenever the avatar jumps between views, so the camera can follow. */
  teleportId: number;
  /**
   * The piece being placed or moved. rotDeg: a free angle (game/mount.ts). y: a wall piece's height. paint: colours a
   * duplicate copies. group: ids moving together with moveId (multi-select in game/decor.ts).
   */
  placing: null | { type: string; rot: number; rotDeg?: number; y?: number; paint?: (string | null)[]; group?: string[]; moveId?: string; inventoryItemId?: string };
  /** Buy mode's wall tool is on. */
  wallMode: boolean;
  /** Wall edge picked with the wall tool, waiting for a confirm tap. */
  wallSel: WallEdge | null;
  /** Edge under the pointer (desktop) while the wall tool is on. */
  wallHover: WallEdge | null;
  /** A click made during an activity is performed after the activity finishes. */
  queuedMove: Cell | null;
  hover: Cell | null;
  toasts: Toast[];
  /** Income tax the president set (worker/wallet.ts takes it from wages and hustles). */
  taxRate: number;
  /** The extra wage tax of the state you live in, on top of the president's (worker/wallet.ts). */
  stateTax: number;
  /** The President's subsidy on airline seats and train tickets, as the server last said (worker/wallet.ts). */
  fares: FareSubsidy;
  /** The governor dug up your street until this time (ms): slower travel, dearer fares. */
  roadBlockUntil: number | null;
  /** The owambe screen is open. */
  owambe: boolean;
  /** Shown after ending a life. */
  lifeSummary: (LegacyBreakdown & { record: LegacyRecord }) | null;
  /** Activities & wild actions hub drawer open for current venue. */
  placeHubOpen: boolean;
  /** Reception's booking sheet is open (ui/Hotel.tsx). */
  hotelDesk: boolean;

  // actions
  setPlaceHubOpen(open: boolean): void;
  setHotelDesk(open: boolean): void;
  /** The airport's flight desk is open (ui/Airport.tsx). */
  flightDesk: boolean;
  setFlightDesk(open: boolean): void;
  /** Queueing at the gate while the airport search is answered: the terminal's menus stay shut (boardingStop). */
  boarding: boolean;
  /** Pay for nights in a room: a new stay, more nights on the room you hold, or a move to another kind of room. */
  bookRoom(room: RoomTypeId, nights: number): void;
  /** Up the lift from the lobby to the room you hold. */
  enterRoom(): void;
  /** Back down to the lobby. The room stays yours until the stay runs out. */
  leaveRoom(): void;
  /** Through the door behind the President's office at Aso Villa (game/villa.ts): the President only. */
  enterSuite(): void;
  /** Through the gate at the back of the police station to the cells (game/cells.ts): anybody can visit. */
  enterCells(): void;
  /** Back out of the cells to the charge room. */
  leaveCells(): void;
  begin(name: string, look: string, origin: OriginId, state?: string): void;
  tick(dtMinutes: number): void;
  toast(text: string, chatUid?: string): void;
  dismissToast(id: number): void;
  select(id: string | null): void;
  setMode(m: 'live' | 'buy'): void;
  setWallMode(on: boolean): void;
  /** Recolour one colour slot of a placed item (null = back to the model's own colour). */
  paintItem(id: string, slot: number, colour: string | null): void;
  paintWalls(part: WallPart, colour: string | null): void;
  /** Buys a finish for this house (floors, walls, a feature wall, ceilings) or sets its mood. Returns false if refused. */
  setFinish(change: FinishChange): boolean;
  /** A light's colour (tone id or colour ref) and brightness. Free. */
  setLamp(id: string, light: LampSetting): void;
  /** After loading a save: refit the current house's furniture and keep you on its plot. */
  fitHome(): void;
  setWallHover(e: WallEdge | null): void;
  /** First tap picks an edge; tapping the picked edge again builds/knocks it. */
  tapWall(e: WallEdge): void;
  toggleWall(e: WallEdge): void;
  setPanel(p: GameState['panel']): void;
  openProfile(tab?: GameState['profileTab']): void;
  /** Nickname another player; an empty one clears it. */
  setAlias(uid: string, alias: string): void;
  runForOffice(office: PoliticalOffice): void;
  campaignEvent(event: CampaignEvent): void;
  resolveStreetStory(choiceId: string): void;
  walkTo(c: Cell): void;
  startAction(itemId: string | null, actionId: string): void;
  selectPlace(id: string | null): void;
  startPlace(placeId: string, travelMode?: TravelMode, carId?: string): void;
  startPlaceAction(placeId: string, actionId: string): void;
  arriveFlight(destination: string): void;
  openMap(): void;
  /** `homeId` picks which home: one of your finished houses, 'lease' (the house you rent) or 'gov'. Left out, it is the usual one. */
  goHome(travelMode?: TravelMode, carId?: string, homeId?: string): void;
  /** In a house you built: step out of the door onto its estate's road. */
  leaveHome(): void;
  /** In a police cell until this time (ms), or null. The server keeps the real time (src/net/crime.ts). */
  jailedUntil: number | null;
  /** The cell you are locked in (game/cells.ts CELLS), while you are. */
  jailCell: number | null;
  /** Released: the warder has opened this cell's door and is walking you out to the charge room. Nothing else until you are out. */
  cellExit: { cell: number } | null;
  /** Held by kidnappers until this time (src/ui/Vice.tsx moves you to their camp). */
  heldUntil: number | null;
  /** Arrested until `until`: whatever you were doing stops and you're locked in a cell at the police station of the city you're in. */
  arrest(until: number): void;
  /** Out of the cell (time served, bail, a pardon, a jailbreak): the door opens and the warder walks you out to the charge room. */
  release(): void;
  /** Kidnapped until `until`: dragged to the bush camp, no leaving until freed. */
  abduct(until: number): void;
  /** Shot (game/guns.ts): whatever you were doing ends and you wake up in the hospital. */
  hospitalize(): void;
  /** Freed (ransom met, escaped or time up): out of the camp and back home. */
  freed(): void;
  /** The ransom ran out: kidnappers take your phone, your accessories and the car you were snatched in. */
  seize(carId: string | null): void;
  cancelTask(): void;
  orderFood(id: string): void;
  /** Apply for a job in a city (the one you are in when none is named). With the Knowledge for it, it is yours. */
  takeJob(id: string, city?: string): void;
  quitJob(): void;
  /** End the shift you are on: the day's pay once it has run out, pay for the time you put in before that. */
  clockOut(): void;
  startPlacing(type: string, inventoryItemId?: string): void;
  startMoving(id: string): void;
  rotatePlacing(): void;
  rotateItem(id: string): void;
  storeItem(id: string): void;
  setHover(c: Cell | null): void;
  placeAt(c: Cell): void;
  cancelPlacing(): void;
  sell(id: string): void;
  /** Buy or sell `qty` units in one go (one by default, MAX_TRADE_UNITS at most). */
  buyInvestment(id: string, qty?: number): void;
  sellInvestment(id: string, qty?: number): void;
  buyCar(id: string): void;
  buyJet(id: string): void;
  sellJet(id: string): void;
  selectCar(id: string): void;
  sellCar(id: string): void;
  cruiseCar(): void;
  /** Pay the mechanic to fix one part, or everything. */
  repairCar(id: string, part: CarPart | 'all'): void;
  /** Something hit the car (a pothole, a crash). */
  damageCar(id: string, part: CarPart, amount: number, why?: string): void;
  buyPhone(id: string): void;
  usePhone(id: string): void;
  sellPhone(id: string): void;
  /** `slot`: the empty plot the player tapped in an estate; without it they get the lowest free one. */
  buyLand(region: string, plot: PlotSize, slot?: number): void;
  setHomeProperty(propertyId: string): void;
  /** Step straight into another of your finished houses on the same estate (the house card's ‹ ›); false if it isn't next door. */
  hopToHouse(propertyId: string): boolean;
  /** Give a house your own name (cleaned: game/exterior.ts cleanHouseName); empty clears it. */
  renameProperty(propertyId: string, name: string): void;
  /** Change the outside of a finished house, paying for what changes (game/exterior.ts exteriorChangeCost). */
  changeExterior(propertyId: string, patch: HouseExterior): void;
  /** Start building an extension: every stage paid up front, like startConstruction. */
  startExtension(propertyId: string, ext: ExtensionId, contractorId: string): void;
  /** Name a room and set what it is used for (game/exterior.ts ROOM_TYPES). */
  setRoom(propertyId: string, room: string, setting: RoomSetting): void;
  hireHouseholdStaff(propertyId: string, role: StaffRole): void;
  dismissHouseholdStaff(propertyId: string, role: StaffRole): void;
  hirePersonalStaff(role: StaffRole, propertyId: string): void;
  dismissPersonalStaff(role: StaffRole): void;
  /** Move a personal staff member to work at another of your houses. */
  assignPersonalStaff(role: StaffRole, propertyId: string): void;
  /** Stop paying government rent: they moved into their own house or a player's rental. */
  clearGovRent(message?: string): void;
  /** Move (back) into the government starter house and start paying its rent again. */
  /** Live in the government house of `city` (your state's when left out): moving in, or moving across from another state's. */
  moveIntoGovHouse(city?: string): void;
  chooseDesign(propertyId: string, design: string): void;
  buyMaterials(propertyId: string, materialId?: string): void;
  startConstruction(propertyId: string, contractor: string): void;
  setRented(propertyId: string, rented: boolean): void;
  collectRent(): void;
  sellProperty(propertyId: string): void;
  visitEstate(region: string, no?: number, travelMode?: TravelMode, carId?: string): void;
  /** In an estate: walk over to another estate of the same region. */
  gotoEstate(no: number): void;
  /** In an estate: walk to the door of your finished house and go in (the usual house scene). */
  enterOwnHouse(propertyId: string): void;
  openShop(id: ShopId | null): void;
  buyGarment(id: string): void;
  wear(id: string): void;
  takeOff(slot: Slot): void;
  pumpWater(): void;
  /** Pay for something small from a phone app. False if you can't afford it. */
  payFor(amount: number, label: string): boolean;
  orderWater(): void;
  /** Add to a lifetime stat (or raise it to `max`). */
  bump(key: StatKey, by?: number, max?: boolean): void;
  /** Pay for something outside the usual actions (rentals, bribes, dues). Returns what was paid. */
  charge(amount: number, label: string, ref?: string): number;
  /** A side-hustle payout, checked by the server against src/game/gigs.ts. */
  earn(gig: GigId, amount: number, label: string): number;
  /** Maybe start a street story (strolling out, arriving somewhere, driving). */
  maybeStory(chance: number): void;
  buyFuel(black: boolean): void;
  pourFuel(): void;
  /** Pay what you owe NEPA (all of it, or what you can). */
  payNepaBill(): void;
  setPowerMode(mode: PowerMode): void;
  /** Pay the NEPA boy to slow or bypass your meter. */
  hireMeterBoy(level: Exclude<MeterLevel, 'off'>): void;
  /** Have the meter put back to normal. */
  restoreMeter(): void;
  /** A visitor reported the dodgy wire: the inspectors come. */
  meterReported(by: string): void;
  /** Switch a house's power on or off (only houses you own). */
  /** Pour a jerrycan into a car's tank. */
  refuelCar(carId: string): void;
  /** Fill a private jet's tank with aviation fuel (game/cars.ts, JET_FUEL). */
  refuelJet(id: string): void;
  /** Send a private jet to the engineers (game/cars.ts, JET_SERVICE). */
  serviceJet(id: string): void;
  sellFuel(): void;
  setOwambe(open: boolean): void;
  /** Finish this life: score it, keep it in the hall of fame, and show the summary. */
  endLife(): void;
  /** After the summary: start over, keeping the hall of fame. */
  newLife(): void;
  reset(): void;
}

let toastId = 1;
/** Plots the land authority already reclaimed (and announced) this session. */
const announcedReclaims = new Set<string>();
/** Notices raised from the game tick: the same one is not repeated for a few minutes. A save or sync that rewinds state would otherwise replay them on a loop. */
const tickNoticeAt = new Map<string, number>();
/** Self-care (game/selfCare.ts): real seconds stood idle at home, and the time before which you are left alone. */
let idleSeconds = 0;
let selfCareHoldUntil = 0;
const TICK_NOTICE_COOLDOWN_MS = 3 * 60_000;
let uid = Date.now();
const newId = () => (uid++).toString(36);

export const dayOf = (m: number) => Math.floor(m / DAY) + 1;
export const hourOf = (m: number) => (m % DAY) / 60;

export function findAction(itemId: string | null, actionId: string, items: PlacedItem[], placeId?: string): ActionDef | undefined {
  if (placeId) {
    const regionId = useGame.getState().destinationId;
    if (actionId === `fly_${regionId}`) return undefined;
    return regionalAction(regionId, placeId, actionId) ?? placeAction(placeId, actionId);
  }

  // Caring for an adopted child (game/kids.ts) is done where you stand when there is no nursery furniture to do it at.
  if (!itemId) return PHONE_ACTIONS.find((a) => a.id === actionId) ?? KID_ACTIONS.find((a) => a.id === actionId);
  const it = items.find((i) => i.id === itemId);
  return it ? ITEMS[it.type].actions.find((a) => a.id === actionId) : undefined;
}

function activityAnimation(action: ActionDef): ActivityAnimation | undefined {
  if (action.animation) return action.animation;
  if (action.effect === 'work' || action.effect === 'travel' || action.effect === 'enterPlace' || action.effect === 'goHome' || action.effect === 'goCity') return undefined;
  const text = `${action.id} ${action.label}`.toLowerCase();
  if (/eat|meal|food|snack|suya|corn|masa|danwake|bread|lunch|dinner|breakfast|yaji/.test(text)) return 'eat';
  if (/drink|tea|fura|nono|water|juice|coffee|kunu/.test(text)) return 'drink';
  if (/cook|stir|fry|grill|bake|roast/.test(text)) return 'stir';
  if (/clean|sweep|mop|wash|scrub|laundry/.test(text)) return /wash|scrub/.test(text) ? 'wash' : 'clean';
  if (/pray|prayer|mosque|church|worship|juma/.test(text)) return 'pray';
  if (/read|study|learn|revise|research|lecture|class|exam/.test(text)) return 'read';
  if (/dance|party|club|concert|sing|music|celebrat|dj|hawan/.test(text)) return 'dance';
  if (/run|sprint|exercise|workout|gym|jog|football|soccer|train/.test(text)) return 'exercise';
  if (/phone|text|type|computer|email|write|record|selfie|snap|photo/.test(text)) return 'type';
  if (/talk|gist|chat|meet|greet|interview|negotiate|customer|speech|debate/.test(text)) return 'talk';
  if (action.pose === 'sit' || action.pose === 'lie') return undefined;
  return action.pose === 'hidden' ? undefined : 'perform';
}

export const isDaylight = (minutes: number) => {
  const h = hourOf(minutes);
  return h >= 7 && h < 19;
};

/** Solar panels power the house by day; the inverter battery carries it through the night. */
export function solarActive(s: Pick<GameState, 'items' | 'minutes' | 'power'>) {
  if (!s.items.some((i) => i.type === 'solar') || modeOf(s.power) === 'gen') return false;
  return isDaylight(s.minutes) || (s.power.battery ?? 100) > 0;
}

/** Your own house has a supply: NEPA, the sun or inverter, or a running generator. */
export function isPowered(s: Pick<GameState, 'power' | 'items' | 'minutes'>) {
  const genRuns = s.power.genOn && s.power.genFuel > 0 && !!generatorOf(s.items);
  const mode = modeOf(s.power);
  if (mode === 'solar') return solarActive(s);
  if (mode === 'gen') return genRuns;
  return s.power.grid || solarActive(s) || genRuns;
}

/** The generator is what's carrying the house right now (no NEPA, no sun, no inverter): which one it is, or null. */
export function runningGen(s: Pick<GameState, 'items' | 'minutes' | 'power'>) {
  if (onGrid(s.power) || modeOf(s.power) === 'solar' || solarActive(s) || !s.power.genOn || s.power.genFuel <= 0) return null;
  return generatorOf(s.items);
}

/** You are inside your own house. Its light follows you: on while you are in, off once you step out or into someone else's. */
export const inOwnHouse = (s: Pick<GameState, 'view'>) => s.view === 'home' && !useVisit.getState().current;

/** Light where the player stands indoors. A house you are visiting runs on its owner's supply, never on yours. */
export function litHere(s: Pick<GameState, 'power' | 'items' | 'minutes'>) {
  const visit = useVisit.getState().current;
  return visit ? !visit.supply || supplied(visit.supply, gridOn()) : isPowered(s);
}

/** The generator running where the player stands: the owner's in a house you are visiting, yours at home. */
export function genHere(s: Pick<GameState, 'items' | 'minutes' | 'power'>) {
  const visit = useVisit.getState().current;
  return visit ? (visit.supply ? supplyGen(visit.supply, gridOn()) : null) : runningGen(s);
}

/** Starting this appliance would ask more of the running generator than it can carry: what it would pull and the gen's limit (kW). */
export function genOverload(s: Pick<GameState, 'items' | 'minutes' | 'power'>, actionId: string) {
  const gen = runningGen(s);
  const load = houseLoad(s.items, actionId);
  return gen && load > GENERATORS[gen].max ? { gen, load, max: GENERATORS[gen].max } : null;
}

/** Needs to whole points: screens showing them redraw when a bar visibly moves, not on every tick. */
export function useNeeds() {
  return useGame(useShallow((s) => Object.fromEntries(NEEDS.map((n) => [n.key, Math.round(s.needs[n.key])])) as Record<Need, number>));
}

export function moodOf(needs: Record<Need, number>) {
  const avg = NEEDS.reduce((a, n) => a + needs[n.key], 0) / NEEDS.length;
  const low = Math.min(...NEEDS.map((n) => needs[n.key]));
  const score = avg - (low < 15 ? 15 : 0);
  if (score >= 80) return { label: 'Very Happy', emoji: '😄', color: '#16a34a', score };
  if (score >= 62) return { label: 'Happy', emoji: '🙂', color: '#22c55e', score };
  if (score >= 45) return { label: 'Okay', emoji: '😐', color: '#ca8a04', score };
  if (score >= 25) return { label: 'Stressed', emoji: '😟', color: '#ea580c', score };
  return { label: 'Wahala', emoji: '😫', color: '#dc2626', score };
}

export { DEFAULT_ITEMS };

const START_CELL: Cell = { x: 11, z: 8 };
/** Just inside the compound gate. */
const GATE_CELL: Cell = { x: 11, z: 11 };

const fresh = () => ({
  started: false,
  name: '',
  look: 'man-casual',
  origin: 'almajiri' as OriginId,
  loanOwed: 0,
  govRentOwed: 0,
  govRentPaidThrough: 0,
  personalStaff: [] as HouseholdStaff[],
  lease: null as Lease | null,
  wardrobe: STARTER_WARDROBE,
  minutes: START_MINUTES,
  money: 150_000,
  debtOwed: 0,
  bankLoanOwed: 0,
  needs: { hunger: 70, energy: 80, fun: 60, social: 55, hygiene: 75, bladder: 65 } as Record<Need, number>,
  knowledge: 0,
  cooking: 0,
  items: DEFAULT_ITEMS,
  furnitureInventory: [] as PlacedItem[],
  jobId: null as string | null,
  jobCity: null as string | null,
  workedDay: 0,
  workDays: 0,
  campaign: null as Campaign | null,
  governmentOffice: null as PoliticalOffice | null,
  goodDeeds: 0,
  notoriety: 0,
  streetStory: null as StreetStory | null,
  storyLog: [] as string[],
  power: { grid: true, genFuel: 40, genOn: true, battery: 100 },
  waterTank: 100,
  sallahRam: 'none' as 'none' | 'unfed' | 'fed',
  txns: [] as Txn[],
  deliveries: [] as Delivery[],
  task: null as Task | null,
  warnedAt: {} as Record<string, number>,
  view: 'home' as GameState['view'],
  destinationId: 'kaduna',
  homeState: 'kaduna',
  insideId: null as string | null,
  hotelStays: {} as HotelStays,
  openBankApp: false,
  openApp: null,
  bankTab: null,
  lightTab: null,
  jailedUntil: null as number | null,
  jailCell: null as number | null,
  cellExit: null as { cell: number } | null,
  heldUntil: null as number | null,
  estateId: null as string | null,
  estateNo: 0,
  investments: {} as Record<string, Holding>,
  ownedCars: [] as string[],
  ownedJets: [] as string[],
  jetWear: {} as Record<string, number>,
  selectedCar: null as string | null,
  carCondition: {} as Record<string, CarCondition>,
  carFuel: {} as Record<string, number>,
  phone: STARTER_ANDROID,
  ownedPhones: [STARTER_ANDROID] as string[],
  freePhone: STARTER_ANDROID as string | null,
  aliases: {} as Record<string, string>,
  properties: [] as Property[],
  homePropertyId: null as string | null,
  activeHouseId: null as string | null,
  wallEdits: {} as Record<string, string[]>,
  housePaint: {} as Record<string, HousePaint>,
  houseFinish: {} as Record<string, HouseFinish>,
  stats: {} as Stats,
  storyFlags: [] as StoryFlag[],
  achievements: [] as string[],
  recentStories: [] as string[],
  fuelCans: 0,
  nepaOwed: 0,
  meter: NO_METER,
  rentedOut: [] as string[],
  nepaWarnedDay: 0,
  nepaBilledDay: 0,
  owambeInvite: null as number | null,
  owambeInviteCity: null as string | null,
  houseStation: null as string | null,
  legacy: [] as LegacyRecord[],
});

const clamp = (v: number) => Math.max(0, Math.min(100, v));
/**
 * Layout key of the house the player is in (game/exterior.ts layoutKey): its design, the extensions built on it and
 * the car bay when cars are parked there. Null for the starter home without cars. Pass it wherever a layout is needed.
 */
export const activeDesignOf = (s: Pick<GameState, 'properties' | 'activeHouseId' | 'homePropertyId'> & Partial<Pick<GameState, 'ownedCars'>>) => {
  const p = s.properties.find((x) => x.id === (s.activeHouseId ?? s.homePropertyId));
  return layoutKey(p?.design ?? null, p?.extensions, s.ownedCars?.length ?? 0);
};
/** Layout key of a property, with the car bay when you own cars (they park at whichever house you are in). */
export const propertyLayoutKey = (p: Pick<Property, 'design' | 'extensions'> | undefined, cars: number) => layoutKey(p?.design ?? null, p?.extensions, cars);

/**
 * One step of an extension's build (game/exterior.ts EXTENSIONS) once its stage is done: the next paid stage starts,
 * or the last one finishes and the extension joins the house. The house itself stays finished and lived in throughout.
 */
function extensionStep(p: Property, minutes: number, notices: string[]): Property {
  const ext = p.extending!;
  const def = EXTENSION_BY_ID[ext.id];
  const design = extensionDesign(p.design, ext.id);
  let stage = ext.stage;
  let building: Property['building'] = p.building;
  const plan = p.constructionPlan ?? null;
  while (building && building.doneAt <= minutes) {
    stage++;
    if (stage >= STAGES.length || !plan || !design) {
      building = null;
      break;
    }
    const contractor = CONTRACTOR_BY_ID[plan.contractor] ?? CONTRACTOR_BY_ID.standard;
    building = { contractor: contractor.id, startedAt: building.doneAt, doneAt: building.doneAt + stageMinutes(design, STAGES[stage], contractor) };
  }
  if (stage >= STAGES.length) {
    notices.push(`${def?.icon ?? '🏗️'} Your ${def?.name.toLowerCase() ?? 'extension'} at ${houseTitle(p)} is finished`);
    return { ...p, building: null, constructionPlan: null, extending: null, extensions: cleanExtensions([...(p.extensions ?? []), ext.id]) };
  }
  return { ...p, building, constructionPlan: building ? plan : null, extending: { ...ext, stage } };
}

/** Which house the player is standing in, for per-house data like wall edits. */
export const houseKeyOf = (s: Pick<GameState, 'activeHouseId' | 'homePropertyId'>) => s.activeHouseId ?? s.homePropertyId ?? 'starter';

/** kW your house is drawing. Light follows you: it runs while you are inside and goes off when you leave, so an empty house costs nothing. A rented-out one is the tenant's bill. */
export function homeLoad(s: Pick<GameState, 'items' | 'view' | 'activeHouseId' | 'homePropertyId' | 'rentedOut'>, using?: string | null) {
  if (!inOwnHouse(s) || s.rentedOut?.includes(houseKeyOf(s))) return 0;
  return houseLoad(s.items, using);
}

const naira = (n: number) => `${n < 0 ? '-' : ''}₦${Math.abs(Math.round(n)).toLocaleString('en-NG')}`;
/** Compact money for tight spots: ₦4.3bn, ₦3.4mn. Under a million it is written in full. */
export function nairaShort(n: number) {
  const abs = Math.abs(n);
  const units: [number, string][] = [[1e12, 'tn'], [1e9, 'bn'], [1e6, 'mn']];
  for (const [size, suffix] of units) {
    if (abs >= size) return `${n < 0 ? '-' : ''}₦${(abs / size).toFixed(1).replace(/\.0$/, '')}${suffix}`;
  }
  return naira(n);
}

/** What your phones would fetch. You always keep one (the free network phone if you have it, else your cheapest), so that one counts for nothing. */
function phonesWorth(owned: string[], freePhone?: string | null): number {
  const resale = owned.filter((id) => id !== freePhone && PHONE_BY_ID[id]).map((id) => Math.round(PHONE_BY_ID[id].price * PHONE_RESALE_FACTOR));
  const total = resale.reduce((a, b) => a + b, 0);
  const keepsFree = !!freePhone && owned.includes(freePhone);
  return keepsFree || !resale.length ? total : total - Math.min(...resale);
}

export function netWorthOf(s: Pick<GameState, 'money' | 'investments'> & { debtOwed?: number; bankLoanOwed?: number; ownedCars?: string[]; ownedJets?: string[]; carCondition?: Record<string, CarCondition>; ownedPhones?: string[]; freePhone?: string | null; properties?: Property[] }): number {
  let total = s.money - (s.debtOwed ?? 0) - (s.bankLoanOwed ?? 0);
  if (s.investments) {
    for (const [id, h] of Object.entries(s.investments)) {
      const inv = INVESTMENT_BY_ID[id];
      if (inv && h && h.units > 0) {
        total += h.units * priceOf(inv);
      }
    }
  }
  if (s.ownedCars) {
    for (const carId of s.ownedCars) {
      if (CAR_BY_ID[carId]) total += valueOf(carId, conditionOf(s.carCondition, carId));
    }
  }
  for (const id of s.ownedJets ?? []) total += jetResale(id);
  total += phonesWorth(s.ownedPhones ?? [], s.freePhone);
  for (const p of s.properties ?? []) total += saleValue(p);
  return total;
}

/** Fare for a keke to an estate when you don't have a car. */
/** What a ride of `km` costs, by how you travel (trekking and your own car are free). */
export const fareOf = (mode: TravelMode, km = DEFAULT_KM) => fareForKm(mode, km);
/** Estates have no map position, so distance grows with the section number (about 0.8km apart). */
export const estateKm = (section: number) => DEFAULT_KM + 0.8 * Math.max(0, section);
/** The finished house you go home to, if any. */
export const ownHouseOf = (s: Pick<GameState, 'properties' | 'homePropertyId' | 'origin'>) =>
  s.properties.find((p) => p.id === s.homePropertyId && p.stage >= STAGES.length && !p.rented)
  ?? (s.origin === 'almajiri' ? s.properties.find((p) => p.stage >= STAGES.length && !p.rented) : undefined);
/** Distance of the trip home: to your estate house, or across town to the government house. */
export const homeTripKm = (s: Pick<GameState, 'properties' | 'homePropertyId' | 'origin'>) => {
  const house = ownHouseOf(s);
  return house ? estateKm(sectionOf(house.slot ?? 0)) : kmBetween(avatarCell(), (activeMap().placeById.home ?? HOME_PLACE).door);
};

/** The network layer (net/estate.ts) shares neighbours' plots so the estate can lay out and path round them. */
export const estateHooks: {
  slots: null | ((region: string) => number[]);
  lots: null | ((region: string) => EstateLot[]);
  onVisit: null | ((region: string, no: number) => void);
} = { slots: null, lots: null, onVisit: null };

/** Why money changed. Signed-in players' changes are checked by the server (worker/wallet.ts). */
export type MoneyKind = 'work' | 'gig' | 'sell' | 'buy' | 'spend' | 'invest' | 'property' | 'debt';
/** The network layer posts a finished life to Naija Gist (net/live.ts). */
export const lifeHooks: { onEnd: null | ((r: LegacyRecord) => void) } = { onEnd: null };

/** The network layer listens here to mirror money changes to the server wallet. */
/** Set by game/trip.ts: called when a task is cut short, which calls off a trip to another city that is under way. */
export const tripHooks: { cancel: null | (() => void) } = { cancel: null };
/** Filled in by game/work.ts: show the way to work (the gate at home has a "Go to work"). */
export const workHooks: { go: null | (() => void) } = { go: null };
/** Everything that lifts a wage: days worked in a row, where you come from and your rank in the job (game/career.ts). */
export const wageMult = (s: Pick<GameState, 'workDays' | 'origin'>, jobId: string) =>
  streakPay(s.workDays) * originOf(s.origin).pay * (careerState.mult[jobId] ?? 1);
export const moneyHooks: { onChange: null | ((e: { amount: number; kind: MoneyKind; ref?: string; /** Units traded, on an investment buy or sale of more than one. */ qty?: number }) => void) } = { onChange: null };

/** Houses personal staff can work from: finished houses you own, plus the government house you live in. */
export function staffHouses(s: Pick<GameState, 'properties' | 'govRentOwed'>): { id: string; name: string }[] {
  const own = s.properties.filter((p) => p.stage >= STAGES.length).map((p) => ({
    id: p.id,
    name: `${DESIGN_BY_ID[p.design ?? '']?.name ?? 'House'}, ${REGION_BY_ID[p.region]?.name ?? 'Kaduna'}`,
  }));
  return s.govRentOwed > 0 ? [{ id: STARTER_HOUSE, name: 'Government house' }, ...own] : own;
}

/** House staff only: personal staff used to be copied into property.staff, which paid them twice. */
export const houseStaffOnly = (staff: HouseholdStaff[] | undefined) =>
  staff?.filter((m) => HOUSE_STAFF_ROLES.includes(m.role as HouseStaffRole));

export const useGame = create<GameState>((set, get) => {
  /** The use the owner gave the room you are standing in, if any. */
  const roomTypeAt = (s: GameState, house: Property | undefined) => {
    if (!house?.rooms) return null;
    const c = avatarCell();
    const room = houseLayoutForState(s).rooms.find((r) => c.x >= r.x0 && c.x < r.x1 && c.z >= r.z0 && c.z < r.z1);
    const type = room ? house.rooms[room.name]?.type : undefined;
    return type ? ROOM_TYPE[type] : null;
  };
  function houseLayoutForState(s: Pick<GameState, 'properties' | 'homePropertyId' | 'activeHouseId' | 'wallEdits' | 'ownedCars'>): HouseLayout {
    return houseLayout(activeDesignOf(s), s.wallEdits[houseKeyOf(s)]);
  }

  const toast = (text: string) => get().toast(text);

  /** While visiting a house, its furniture can be used like your own: the task system resolves these too. */
  const visitItemOf = (id: string | null) => (id ? useVisit.getState().current?.save.items.find((i) => i.id === id) : undefined);
  const taskItems = (s: Pick<GameState, 'items'>) => {
    const v = useVisit.getState().current;
    return v ? [...s.items, ...v.save.items] : s.items;
  };
  /** Does the item's house have power? Visited houses follow their owner's supply; yours follows your own. */
  const litFor = (s: GameState, id: string | null) => (visitItemOf(id) ? litHere(s) : isPowered(s));

  /** Burn a trip's fuel. False (with a toast) if the tank can't cover it. */
  const burnFuel = (carId: string, km = DEFAULT_KM) => {
    const use = fuelUse(carId, km);
    const left = fuelLeft(get().carFuel, carId);
    if (left < use) {
      toast(`⛽ ${CAR_BY_ID[carId]?.name ?? 'Your car'} has ${Math.floor(left)}L left but needs ${use}L. Pour in a jerrycan (Phone → Hustle)`);
      return false;
    }
    set((st) => ({ carFuel: { ...st.carFuel, [carId]: left - use } }));
    return true;
  };

  /** Wear the car for one trip. False if it won't move (something critical is spoilt). */
  const driveOff = (carId: string, km = DEFAULT_KM) => {
    const name = CAR_BY_ID[carId]?.name ?? 'Your car';
    const before = conditionOf(get().carCondition, carId);
    const stuck = blockerOf(before);
    if (stuck) {
      toast(`${name} won't move: ${PARTS[stuck].label.toLowerCase()} is spoilt. Fix it in KD Autos 🔧`);
      return false;
    }
    if (!burnFuel(carId, km)) return false;
    const { next, broke } = wear(before);
    set((st) => ({ carCondition: { ...st.carCondition, [carId]: next } }));
    if (broke) {
      const stopped = blockerOf(next);
      toast(`${PARTS[broke].icon} ${PARTS[broke].breaks}! ${stopped ? 'The car is going nowhere. Get a mechanic 🔧' : 'Better see a mechanic soon.'}`);
      return !stopped;
    }
    const weak = PART_IDS.find((p) => next.parts[p] < 30 && before.parts[p] >= 30);
    if (weak) toast(`${PARTS[weak].icon} Your ${PARTS[weak].label.toLowerCase()} is getting bad. See a mechanic before it spoils.`);
    return true;
  };

  const pay = (amount: number, label: string, kind: MoneyKind = 'spend', ref?: string, qty?: number) => {
    // Wages and hustles are taxed by the server; show the same deduction straight away.
    const tax = (kind === 'work' || kind === 'gig') && amount > 0 ? Math.floor((amount * (get().taxRate + get().stateTax)) / 100) : 0;
    set((s) => ({
      money: s.money + amount - tax,
      txns: [...(tax ? [txn(s, `Income tax (${s.taxRate + s.stateTax}%)`, -tax)] : []), txn(s, label, amount, kind), ...s.txns].slice(0, 40),
    }));
    moneyHooks.onChange?.({ amount, kind, ref, qty });
  };

  /** The job you hold and where it is, with how its shift stands right now. */
  const shiftInfo = (s: GameState) => {
    const work = employment(s);
    return work ? { ...work, clock: shiftClock(work.job, s.minutes) } : null;
  };

  /**
   * Boarding a flight. Your own jet needs a jet; a ticketed flight goes through the airport search first
   * (src/net/vice.ts), and `retry` runs the action again once you are through. True means: don't start it now.
   */
  /** A private flight in the state's jet: the office it belongs to, when I hold it and its budget covers the trip. */
  const stateJet = (def: ActionDef) => (def.effect === 'travel' && def.jet ? stateRide(def.cost ?? 0) : null);
  /** What an action costs you: a flight in the state's jet is the treasury's bill. */
  const actionCost = (def: ActionDef) => (stateJet(def) ? 0 : ticketOf(def, get().destinationId, get().fares)?.price ?? def.cost ?? 0);

  let searched = false;
  const boardingStop = (def: ActionDef, retry: () => void): boolean => {
    if (def.effect !== 'travel') return false;
    // Nobody searches the train.
    if (def.rail) {
      set({ placeHubOpen: false });
      return false;
    }
    if (def.jet) {
      const jet = jetToFly(get().ownedJets, get().carFuel, get().jetWear);
      const fuelled = !!jet && jetFuelLeft(get().carFuel, jet) >= 1;
      if (!stateJet(def) && !(jet && fuelled && jetFlightsLeft(get().jetWear, jet) >= 1)) {
        toast(!jet ? '🛩️ You don’t own a private jet. Buy one in Phone → Autos.'
          : !fuelled ? '⛽ Your jet has no fuel. Refuel it at the flight desk or in Phone → Autos.'
            : '🔧 Your jet is due its service and is grounded. Service it at the flight desk or in Phone → Autos.');
        return true;
      }
    } else if (!searched && viceHooks.onBoard) {
      // The server answers the search. Until it does you have no task, so without `boarding` the terminal
      // would offer its activities and its flight desk to someone who is already on the way to a gate.
      set({ boarding: true, placeHubOpen: false });
      void viceHooks.onBoard().then((arrested) => {
        if (arrested) return;
        searched = true;
        try { retry(); } finally { searched = false; }
      }).finally(() => set({ boarding: false }));
      return true;
    }
    // Cleared to board: the terminal's activities are behind you.
    set({ placeHubOpen: false });
    return false;
  };

  /** End the current task, paying out work if needed. */
  const finish = (cancelled = false) => {
    const s = get();
    const t = s.task;
    avatar.snap = null;
    avatar.pose = 'stand';
    avatar.recoverAt = 0;
    if (!t) return;
    if (cancelled) tripHooks.cancel?.();
    // Stopped something you had gone to do on your own: you are left alone for a while.
    if (cancelled && t.auto) selfCareHoldUntil = Date.now() + SELF_CARE.holdSeconds * 1000;
    const action = findAction(t.itemId, t.actionId, taskItems(s), t.placeId);
    if (!cancelled && action?.effect === 'travel' && action.destination) {
      // Your own jet burns one flight of fuel getting there, and is one flight nearer its service.
      const flown = action.jet && !t.official ? jetToFly(s.ownedJets, s.carFuel, s.jetWear) : null;
      if (flown) set((st) => ({
        carFuel: { ...st.carFuel, [flown]: Math.max(0, jetFuelLeft(st.carFuel, flown) - 1) },
        jetWear: { ...st.jetWear, [flown]: jetFlown(st.jetWear, flown) + 1 },
      }));
      set({ task: null, destinationId: action.destination });
      toast(`Welcome to ${regionOf(action.destination).name}! ${action.rail ? '🚆' : '✈️'}`);
      // Landing puts you on the map, but it doesn't snatch the phone out of your hand mid-scroll.
      const onPhone = get().panel === 'phone';
      // A train pulls in at the city's station; a flight lands at its airport.
      enterCity((action.rail && regionPlace(action.destination, 'station')?.door) || regionAirportDoor(action.destination));
      if (onPhone) set({ panel: 'phone' });
      return;
    }
    if (!cancelled && action?.effect === 'goodDeed') {
      set((state) => ({ goodDeeds: state.goodDeeds + 1 }));
    }
    if (!cancelled && action?.waterUse && !visitItemOf(t.itemId)) {
      set((state) => ({ waterTank: Math.max(0, state.waterTank - action.waterUse!) }));
    }
    if (!cancelled && action?.effect === 'durbar') {
      set((state) => ({ goodDeeds: state.goodDeeds + 1 }));
      toast(s.destinationId === 'lagos'
        ? `Eyo day at ${placeHere('murtala')?.name ?? 'the square'}! 🎭 White robes, staffs and drums fill the square!`
        : `Durbar day at ${placeHere('murtala')?.name ?? 'the square'}! 🐎 Kakaki, drummers and horsemen!`);
    }
    if (!cancelled && action?.effect === 'feedRam' && s.sallahRam === 'unfed') {
      set({ sallahRam: 'fed' });
      toast('Your ram is fed and ready for Sallah 🐏');
    }
    if (!cancelled && action?.effect === 'shareRam' && s.sallahRam === 'fed') {
      set((state) => ({ sallahRam: 'none', goodDeeds: state.goodDeeds + 2 }));
      toast('Sallah meat shared with the neighbours. Gida daya, zumunci daya! 🍖');
    }
    if (!cancelled && action?.effect === 'sprayMoney') {
      const amount = action.cost ?? 20_000;
      toast(`💸 Odogwu! You sprayed ${naira(amount)} at ${placeHere('club')?.name ?? 'the club'}! The crowd goes wild! 🍾🎉`);
      useMoneyRain.getState().fall(amount >= 100_000);
    }
    if (!cancelled && t.placeId === 'club' && action && CLUB_SHOUTS[action.id] && action.id !== 'dorime') shoutoutHooks.send?.(action.id);
    if (!cancelled && action?.effect === 'sprayMoney' && (action.cost ?? 0) < 500_000 && Math.random() < sprayKickChance(s.minutes, action.cost ?? 20_000, s.destinationId)) {
      clearSprayLog();
      set({ task: null, queuedMove: null });
      toast('🚪 Security: "Oga, you don spray too much, the manager wants you outside!" You have been thrown out of ' + (placeHere('club')?.name ?? 'the club') + '.');
      return enterCity(doorOf('club'));
    }
    if (!cancelled && action?.skill) careerHooks.train?.(action.skill);
    // A care for an adopted child is done: the server applies it and charges for it (src/net/kids.ts).
    if (!cancelled && action?.effect === 'kidCare') kidHooks.done?.(t.actionId, t.itemId ? taskItems(s).find((i) => i.id === t.itemId)?.type ?? null : null);
    if (!cancelled && action?.payout && action.payout > 0) {
      // An earning, so the server checks it as one (worker/wallet.ts): sent as spending it was refused and taken back.
      const got = get().earn('odd_job', oddJobPay(action.payout), action.label);
      toast(got > 0 ? `💰 You earned ${naira(got)} from ${action.label}!` : `${action.label}: done`);
    }
    if (t.actionId === 'work' && t.phase === 'doing') {
      const job = jobById(s.jobId);
      // What you did at your post (ui/ShiftGame.tsx): every job done right adds to a bonus on top.
      const score = takeShiftScore();
      if (job) {
        // Pay is for the minutes of the shift you put in, counted on the shift's own clock: it runs faster than the world's.
        const worked = t.total - t.remaining;
        const ratio = Math.min(1, worked / shiftMinutes(job));
        const earned = wageFor(job, worked, wageMult(s, job.id));
        if (earned > 0) pay(earned, `${job.title} pay`, 'work', job.id);
        // No wage, no bonus: the server only accepts one that follows the shift's pay.
        const bonus = score.hits > 0 && earned > 0 ? get().earn('shift_bonus', shiftBonus(job.pay, score.hits), `${job.title} bonus (${score.hits}/${SHIFT.rounds})`) : 0;
        set({ workedDay: shiftClock(job, t.startedAt ?? s.minutes).day, workDays: s.workDays + (ratio > 0.5 ? 1 : 0) });
        const extra = bonus > 0 ? ` + ${naira(bonus)} bonus for sharp work (${score.hits}/${SHIFT.rounds}) 🎯` : '';
        toast(t.over ? `Clocked out! You earned ${naira(earned)}${extra} 💰` : `Left work early. Earned ${naira(earned)}${extra}`);
      }
    }
    const queuedMove = cancelled ? null : s.queuedMove;
    set({ task: null, queuedMove: null });
    if (queuedMove) get().walkTo(queuedMove);
  };

  /** Where you come out on the map from a place in the city you are in. A room inside a place lets you out at that place. */
  const doorOf = (placeId?: string | null): Cell =>
    activeMap().placeById[roomParent(placeId) ?? '']?.door ?? startDoor();
  /** Somewhere that is in another city (a house, an estate): you fly there first. */
  const awayFrom = (city: string, what = regionOf(city).name) => {
    const here = regionOf(get().destinationId);
    if (here.id === city) return false;
    toast(`✈️ You are in ${here.name}. ${what === regionOf(city).name ? `Fly to ${what}` : `${what} is in ${regionOf(city).name}: fly there`} from ${here.airport} first.`);
    return true;
  };
  /** The government house is in the state you were born in. */
  const awayFromHome = () => awayFrom(get().homeState);
  /** Where you stand in the city you are in with nowhere particular to be: your door in your own state, the airport elsewhere. */
  const startDoor = () => (get().destinationId === get().homeState ? regionStartDoor : regionAirportDoor)(get().destinationId);
  const enterCity = (at: Cell = startDoor()) => {
    const current = get();
    resetAvatar(at);
    set((s) => ({
      view: 'city',
      properties: s.activeHouseId
        ? s.properties.map((property) => property.id === s.activeHouseId ? { ...property, items: current.items } : property)
        : s.properties,
      insideId: null, mode: 'live', panel: null, selectedId: null, placing: null, placeId: null, placeHubOpen: false, hotelDesk: false, flightDesk: false, teleportId: s.teleportId + 1,
    }));
  };
  const enterHome = (propertyId?: string) => {
    const s = get();
    if (s.origin === 'almajiri' && !s.properties.some((p) => p.stage >= STAGES.length)) {
      get().toast('No home yet. Use the public washroom or build a house from House.');
      return enterCity();
    }
    const nextHouseId = propertyId ?? s.homePropertyId;
    const properties = s.activeHouseId
      ? s.properties.map((property) => property.id === s.activeHouseId ? { ...property, items: s.items } : property)
      : s.properties;
    const nextHouse = properties.find((property) => property.id === nextHouseId);
    // Each house type has its own plot size: refit furniture that came from a different layout.
    const layout = houseLayout(propertyLayoutKey(nextHouse, s.ownedCars.length), s.wallEdits[nextHouseId ?? 'starter']);
    const fitted = fitItemsToLayout(nextHouse?.items ?? (nextHouse ? [] : s.items), layout);
    if (fitted.boxed.length) toast(`📦 ${fitted.boxed.length} item${fitted.boxed.length > 1 ? 's' : ''} didn't fit this house. Place them again from Buy mode.`);
    resetAvatar(arrivalCell(layout));
    avatar.yaw = Math.PI;
    set({
      view: 'home',
      // A house you built stands in its estate's city; the government house is in the state you were born in.
      destinationId: nextHouse ? estateCity(nextHouse.region) : s.homeState,
      properties,
      items: fitted.items,
      furnitureInventory: fitted.boxed.length ? [...s.furnitureInventory, ...fitted.boxed] : s.furnitureInventory,
      activeHouseId: nextHouseId,
      insideId: null,
      panel: null,
      placeId: null,
      selectedId: null,
      placeHubOpen: false,
      teleportId: s.teleportId + 1,
    });
  };
  /** Rows the estate needs right now: enough for every plot we know of (yours and the neighbours'). */
  const estateRows = (_region: string) => rowsFor();
  /** Plots of the estate you're standing in, for pathing round the houses. */
  const estateLots = (region: string) => (estateHooks.lots?.(region) ?? []).filter((l) => sectionOf(l.slot) === get().estateNo);
  const enterEstate = (region: string, no: number, slot?: number, atGate = false) => {
    // Arrive on the road in front of the plot named, or your first plot there, or at the estate gate (always, off a ride).
    const mine = atGate ? undefined : get().properties.find((p) => p.region === region && sectionOf(p.slot ?? 0) === no);
    const o = slot !== undefined ? slotOrigin(slot) : mine ? slotOrigin(mine.slot ?? 0) : null;
    resetAvatar(o ? { x: o.x + PLOT / 2, z: o.z + PLOT + 1 } : entrance(estateRows(region)));
    avatar.yaw = Math.PI / 2;
    set((s) => ({ view: 'estate', destinationId: estateCity(region), estateId: region, estateNo: no, insideId: null, panel: null, placeId: null, selectedId: null, mode: 'live', placeHubOpen: false, teleportId: s.teleportId + 1 }));
  };
  /** Where the map lets you out when you leave an estate (or a house in one): that estate's road into town. */
  const estateExitCell = (region: string | null | undefined) => (region ? estateExit(get().destinationId, region)?.cell : undefined);
  /**
   * The ride to an estate: across the city map by the mode picked (car, keke, okada, cab, helicopter) to where the
   * estate's road leaves town (game/estateRoads.ts), then in at the estate gate and, when `home` names a house, on
   * foot to its door (arrive → enterOwnHouse). Fares, fuel and the state fleet are charged as before, at the start.
   */
  const rideToEstate = (region: string, no: number, mode: TravelMode, carId: string | undefined, home?: string) => {
    const s = get();
    const estate = REGION_BY_ID[region];
    if (!estate) return;
    // Already in that estate: no ride, just the walk to the door.
    if (s.view === 'estate' && s.estateId === region && s.estateNo === no) {
      if (home) get().enterOwnHouse(home);
      return;
    }
    if (s.task?.actionId === 'work' && s.task.phase === 'doing') return toast('You are at work');
    const km = estateKm(no);
    const fare = fareOf(mode, km);
    const onState = stateFareForKm(mode, km);
    if (s.money < fare) return toast(`You need ${naira(fare)} to get to ${estate.name}`);
    if (mode === 'car' && (!carId || !s.ownedCars.includes(carId))) return toast('You need to own that car before driving it');
    if (s.view !== 'city') get().openMap();
    if (get().view !== 'city') return; // openMap said why (exhausted, in a cell)
    const exit = estateExit(get().destinationId, region);
    if (!exit) return toast("Can't find the road to that estate");
    const path = mode === 'helicopter' ? cityStraightPath(avatarCell(), exit.cell) : cityPathToCell(avatarCell(), exit.cell);
    if (!path) return toast("Can't find a way there");
    if (mode === 'car' && carId && !driveOff(carId, km)) return;
    if (driveState.vehicle) driveHooks.stop?.();
    if (get().task) finish(true);
    avatar.snap = null;
    avatar.pose = 'stand';
    avatar.recoverAt = 0;
    const where = `${estate.name} Estate`;
    if (fare) pay(-fare, `${mode === 'keke' ? 'Keke' : mode === 'okada' ? 'Okada' : mode === 'cab' ? 'Cab' : 'Helicopter'} to ${where}`);
    else if (onState) chargeTreasury(onState.amount, onState.vehicle);
    avatar.path = path;
    avatar.onArrive = () => arrive();
    avatar.storyAt = mode !== 'helicopter' && path.length >= STORY_ROUTE_MIN_CELLS && Math.random() < STORY_ROUTE_CHANCE ? Math.floor(path.length * (0.3 + Math.random() * 0.4)) : null;
    const car = mode === 'car' && carId ? CAR_BY_ID[carId] : null;
    const label = mode === 'walk' ? `Walking to ${where}` : mode === 'keke' ? `Taking keke to ${where}` : mode === 'okada' ? `Taking okada to ${where}` : mode === 'cab' ? `Taking a cab to ${where}` : mode === 'helicopter' ? `Flying by helicopter to ${where}` : `Driving to ${where}`;
    const icon = mode === 'walk' ? '🚶🏾' : mode === 'keke' ? '🛺' : mode === 'okada' ? '🏍️' : mode === 'cab' ? '🚕' : mode === 'helicopter' ? '🚁' : '🚗';
    set({ task: { itemId: null, actionId: 'enter', estate: { region, no, home }, label: onState ? `${STATE_FLEET[onState.office][onState.vehicle]} to ${where}` : label, icon, travelMode: mode, carId: car?.id, official: onState?.office, phase: 'walking', remaining: 0, total: 0 }, placeId: null });
    if (!path.length) arrive();
  };
  const enterPlace = (id: string) => {
    const inside = INTERIORS[id];
    const place = regionPlaces(get().destinationId).find((p) => p.id === id);
    if (!inside || !place) return;
    resetAvatar(exitCell(inside));
    avatar.yaw = Math.PI;
    set((s) => ({ view: 'place', insideId: id, panel: null, placeId: null, selectedId: null, placeHubOpen: true, hotelDesk: false, flightDesk: false, teleportId: s.teleportId + 1 }));
    toast(`${place.icon} Welcome to ${place.name}`);
  };
  /** Stand at the door of a hotel room, or at the lobby lift when `room` is null. */
  const enterHotel = (room: RoomTypeId | null) => {
    const id = room ? roomPlaceId(room) : HOTEL_ID;
    resetAvatar(room ? exitCell(INTERIORS[id]) : frontCell(INTERIORS[id], 'hotel_lift'));
    avatar.yaw = room ? Math.PI : 0;
    set((s) => ({ view: 'place', insideId: id, panel: null, placeId: null, selectedId: null, placeHubOpen: false, hotelDesk: false, flightDesk: false, teleportId: s.teleportId + 1 }));
  };
  /** Stand at the door of the President's suite at Aso Villa, or back in the office in front of that door. */
  const enterVilla = (suite: boolean) => {
    const id = suite ? SUITE_ID : VILLA_ID;
    resetAvatar(suite ? exitCell(INTERIORS[id]) : frontCell(INTERIORS[id], 'room_door'));
    avatar.yaw = suite ? Math.PI : 0;
    set((s) => ({ view: 'place', insideId: id, panel: null, placeId: null, selectedId: null, placeHubOpen: false, hotelDesk: false, flightDesk: false, teleportId: s.teleportId + 1 }));
  };
  /** In the cells' corridor at the gate in from the charge room, or back in the charge room in front of that gate. */
  const enterCellBlock = (cells: boolean) => {
    const id = cells ? CELLS_ID : CELLS_PARENT;
    resetAvatar(cells ? exitCell(INTERIORS[id]) : frontCell(INTERIORS[id], 'cellblock_gate'));
    avatar.yaw = cells ? Math.PI : 0;
    set((s) => ({ view: 'place', insideId: id, panel: null, placeId: null, selectedId: null, placeHubOpen: false, hotelDesk: false, flightDesk: false, teleportId: s.teleportId + 1 }));
  };
  /** Locked in a cell in the cells right now (not visiting, not out in the corridor). */
  const lockedIn = () => inCellNow(get());
  /** How long the cell door takes to slide open before the warder walks you through it (three/CellBlock.tsx draws it). */
  const DOOR_OPEN_MS = 900;
  let walkOutTimer: ReturnType<typeof setTimeout> | undefined;
  /** Released while in the cell: the door slides open, then you are walked out of it, down the corridor and out to the charge room. */
  const walkOut = (cell: number) => {
    const inside = INTERIORS[CELLS_ID];
    const c = CELLS[cell];
    const toDoor = interiorPathToCell(inside, avatarCell(), c.inside) ?? [];
    const toGate = interiorPathToCell(inside, c.outside, exitCell(inside)) ?? [];
    avatar.snap = null;
    avatar.pose = 'stand';
    avatar.path = [];
    avatar.onArrive = null;
    set({
      cellExit: { cell }, jailCell: null, placeHubOpen: false, panel: null, selectedId: null, queuedMove: null,
      task: { itemId: null, actionId: 'walk', label: 'The warder is walking you out', icon: '🔓', phase: 'walking', remaining: 0, total: 0 },
    });
    clearTimeout(walkOutTimer);
    walkOutTimer = setTimeout(() => {
      if (get().cellExit?.cell !== cell) return;
      avatar.path = [...toDoor, c.door, c.outside, ...toGate];
      avatar.onArrive = () => {
        if (get().cellExit?.cell !== cell) return;
        set({ cellExit: null, task: null });
        enterCellBlock(false);
        toast('🚶🏾 You are out. Behave yourself!');
      };
    }, DOOR_OPEN_MS);
  };

  /** The hotel's name in that city: Hamdala in Kaduna, the Hilton in Abuja. */
  const hotelName = (city: string) => cityMap(city).placeById[HOTEL_ID]?.name ?? 'the hotel';
  /** Some things are for whoever holds an office (the President's desk and suite). */
  const notInOffice = (def: ActionDef) => {
    if (!def.office || heldOffice() === def.office) return false;
    toast(`🇳🇬 Only the ${OFFICE_RULES[def.office].title} can do that.`);
    return true;
  };

  /** Locked in a cell: no leaving, no travel, no work. Being walked out of one counts too, until you are out. */
  const jailed = () => {
    if (get().cellExit) {
      toast('🔓 The warder is walking you out. One moment.');
      return true;
    }
    const until = get().jailedUntil;
    if (!until || until <= Date.now()) {
      const held = get().heldUntil;
      if (!held || held <= Date.now()) return false;
      toast('🪢 You are being held. Raise the ransom or slip the ropes.');
      return true;
    }
    toast('⛓️ You are in a cell. Wait out your time or pay bail.');
    return true;
  };

  /** Called when the avatar reaches the item or place. */
  const arrive = () => {
    const s = get();
    const t = s.task;
    if (!t) return;
    if (t.actionId === 'walk') return set({ task: null });
    if (t.estate) {
      // Off the ride at the estate's road: in at the gate, then the walk to your door.
      const { region, no, home } = t.estate;
      set({ task: null });
      estateHooks.onVisit?.(region, no);
      enterEstate(region, no, undefined, true);
      toast(`${t.icon} ${t.travelMode === 'car' ? 'You drove' : t.travelMode === 'helicopter' ? 'You flew' : 'Dropped'} in at the ${REGION_BY_ID[region]?.name ?? ''} Estate gate`);
      if (home) get().enterOwnHouse(home);
      return;
    }
    const def = findAction(t.itemId, t.actionId, taskItems(s), t.placeId);
    if (!def) return set({ task: null });

    if (def.effect === 'goCity') {
      set({ task: null });
      return enterCity(doorOf(t.placeId));
    }
    if (def.effect === 'goHome') {
      set({ task: null });
      return enterHome();
    }
    if (def.effect === 'enterPlace') {
      const actionAfterTravel = t.actionAfterTravel;
      set({ task: null });
      enterPlace(t.placeId!);
      if (actionAfterTravel) get().startPlaceAction(t.placeId!, actionAfterTravel);
      return;
    }
    if (def.effect === 'shop') {
      set({ task: null, shopId: def.shop ?? 'market' });
      return;
    }
    if (def.effect === 'hotelDesk') {
      set({ task: null, hotelDesk: true, placeHubOpen: false });
      return;
    }
    if (def.effect === 'hotelLift') {
      set({ task: null });
      return get().enterRoom();
    }
    if (def.effect === 'leaveRoom') {
      set({ task: null });
      return get().leaveRoom();
    }
    if (def.effect === 'villaSuite') {
      set({ task: null });
      return get().enterSuite();
    }
    if (def.effect === 'cellBlock') {
      set({ task: null });
      return get().enterCells();
    }
    if (def.effect === 'leaveCells') {
      set({ task: null });
      return get().leaveCells();
    }
    if (def.effect === 'phoneShop') {
      set({ task: null, panel: 'phoneShop' });
      return;
    }
    if (def.effect === 'bank') {
      if (t.placeId !== 'bank') return set({ task: null });
      set({ task: null, panel: 'phone', openBankApp: true });
      return;
    }
    if (def.effect === 'bankHeist') {
      if (t.placeId !== 'bank') return set({ task: null });
      set({ task: null, panel: 'phone', openBankApp: true, bankTab: 'savings' });
      return;
    }

    const prop = s.view === 'place' && t.placeId ? INTERIORS[t.placeId]?.props.find((p) => p.id === t.itemId) : undefined;
    const item = prop ? undefined : taskItems(s).find((i) => i.id === t.itemId);
    if (!item && !prop && !t.placeId) return set({ task: null });

    if (def.effect === 'fuelGen') {
      // One tank feeds the house: the biggest set's. Don't sell a small fill for the big tank, or fuel for a full one.
      const wired = generatorOf(s.items);
      if (item && wired && item.type !== wired) {
        toast(`Your ${ITEMS[wired].name} is the one wired to the house. Fill that one ⛽`);
        return set({ task: null });
      }
      if (s.power.genFuel >= 99.5) {
        toast('The generator tank is already full');
        return set({ task: null });
      }
    }
    const official = stateJet(def) ?? undefined;
    // A ticket is charged after the fare subsidy, under a ref the server prices it by.
    const ticket = ticketOf(def, s.destinationId, s.fares);
    const cost = ticket?.price ?? def.cost ?? 0;
    if (official) chargeTreasury(def.cost ?? 0, 'jet', def.destination);
    else if (cost) {
      if (s.money < cost) {
        toast(`You need ${naira(cost)} for that`);
        return set({ task: null });
      }
      pay(-cost, ticket?.off ? `${def.label} (govt subsidy −${ticket.pct}%)` : def.label, 'spend', ticket?.ref);
    }

    if (def.effect === 'fuelGen') {
      set((st) => ({ power: { ...st.power, genFuel: 100 } }));
      toast('Generator tank full ⛽');
      return set({ task: null });
    }
    if (def.effect === 'toggleGen') {
      const on = !s.power.genOn;
      set((st) => ({ power: { ...st.power, genOn: on }, task: null }));
      toast(on ? 'Gen switched on 🔊' : 'Gen switched off 🔇');
      return;
    }
    if (def.effect === 'buyRam') {
      set({ sallahRam: 'unfed', task: null });
      toast('Ram bought at the Sallah market. Take it home to feed it! 🐏');
      return;
    }

    let remaining = def.minutes;
    let startedAt: number | undefined;
    const flight = def.effect === 'travel' ? (def.jet ? 'jet' as const : def.rail ? 'train' as const : 'ticket' as const) : undefined;
    if (def.effect === 'work') {
      const info = shiftInfo(s);
      if (!info || info.clock.phase !== 'on') {
        toast('It is not work time');
        return set({ task: null });
      }
      // You work what is left of the shift: come late and the day pays less.
      remaining = info.clock.left;
      startedAt = s.minutes;
      set({ placeHubOpen: false });
      toast(`${info.job.icon} Clocked in at ${info.place.name}. Stay to the end for the full day’s pay`);
    }

    if (prop) {
      // Sit on seats, stand at everything else; trips and shifts take you out of sight.
      const { cx, cz, yaw } = propTransform(prop);
      const pd = propDef(prop.type);
      avatar.snap = null;
      if (def.pose === 'hidden') avatar.pose = 'hidden';
      else if (def.pose === 'lie' && pd.bed) {
        avatar.pose = 'lie';
        avatar.snap = { x: cx + Math.sin(yaw) * pd.bed.z, y: pd.bed.y, z: cz + Math.cos(yaw) * pd.bed.z, yaw };
      } else if (pd.seat) {
        avatar.pose = 'sit';
        avatar.snap = { x: cx + Math.sin(yaw) * pd.seat.z, y: pd.seat.y, z: cz + Math.cos(yaw) * pd.seat.z, yaw };
      } else {
        avatar.pose = 'stand';
        avatar.yaw = pd.floor ? yaw : Math.atan2(cx - avatar.x, cz - avatar.z);
      }
      if (t.placeId === 'club' && def.id === 'dorime') shoutoutHooks.send?.('dorime');
      return set({ task: { ...t, phase: 'doing', remaining, total: remaining, startedAt, flight, official, fast: !!(def.cookingPerHour || def.fast) } });
    }

    // Pose and facing
    if (item) {
      const { cx, cz, yaw } = itemTransform(item);
      const def2 = ITEMS[item.type];
      avatar.pose = def.pose ?? 'stand';
      if (def.pose === 'lie' && def2.bed) {
        avatar.snap = { x: cx + Math.sin(yaw) * def2.bed.z, y: def2.bed.y, z: cz + Math.cos(yaw) * def2.bed.z, yaw };
      } else if (def.pose === 'sit' && def2.seat) {
        avatar.snap = { x: cx + Math.sin(yaw) * def2.seat.z, y: def2.seat.y, z: cz + Math.cos(yaw) * def2.seat.z, yaw };
      } else {
        avatar.snap = null;
        if (def2.blocks !== false) avatar.yaw = Math.atan2(cx - avatar.x, cz - avatar.z);
      }
      set({ task: { ...t, phase: 'doing', remaining, total: remaining, startedAt, fast: !!(def.cookingPerHour || def.fast) } });
      if (item.type === 'gate' && t.actionId === 'stroll') get().maybeStory(0.6);
      return;
    }

    // Direct place action
    avatar.snap = null;
    avatar.pose = def.pose ?? 'stand';
    set({ task: { ...t, phase: 'doing', remaining, total: remaining, startedAt, flight, official, fast: !!(def.cookingPerHour || def.fast) } });
  };

  return {
    ...fresh(),
    mode: 'live',
    panel: null,
    profileTab: 'profile',
    selectedId: null,
    placeId: null,
    shopId: null,
    teleportId: 0,
    placing: null,
    wallMode: false,
    wallSel: null,
    wallHover: null,
    hover: null,
    toasts: [],
    taxRate: 0,
    fares: { air: 0, rail: 0, funded: false },
    stateTax: 0,
    roadBlockUntil: null,
    owambe: false,
    lifeSummary: null,
    placeHubOpen: false,
    hotelDesk: false,
    flightDesk: false,
    boarding: false,
    queuedMove: null,

    setPlaceHubOpen(open) {
      set({ placeHubOpen: open });
    },

    setHotelDesk(open) {
      set({ hotelDesk: open, ...(open ? { placeHubOpen: false, selectedId: null } : {}) });
    },

    setFlightDesk(open) {
      set({ flightDesk: open, ...(open ? { placeHubOpen: false, selectedId: null } : {}) });
    },

    bookRoom(room, nights) {
      const s = get();
      const type = ROOM_BY_ID[room];
      const city = s.destinationId;
      const here = stayIn(s.hotelStays, city);
      const held = stayActive(here, s.minutes) ? here : null;
      const same = held?.room === room;
      const n = Math.floor(nights);
      if (!type || n < 1 || n > (same ? nightsFree(held, s.minutes) : MAX_NIGHTS)) return;
      const cost = nightlyIn(type, city) * n;
      const span =`${n} night${n > 1 ? 's' : ''}`;
      if (s.money < cost) return toast(`You need ${naira(cost)} for ${span} in the ${type.name}`);
      pay(-cost, `${hotelName(city)} · ${type.name} (${span})`, 'spend', `hotel:${room}`);
      // More nights go on the end of the room you hold; another kind of room is a fresh stay, and the old one is given up.
      const stay: HotelStay = same ? { ...held, until: held.until + n * NIGHT } : { room, no: roomNumber(room), until: s.minutes + n * NIGHT };
      set({ hotelStays: { ...s.hotelStays, [city]: stay }, hotelDesk: false });
      const upstairs = s.view === 'place' && isHotelRoom(s.insideId);
      const inLobby = s.view === 'place' && s.insideId === HOTEL_ID;
      // A room just paid for is where you go next: reception sends you straight up, unless you cannot leave what you are doing.
      const working = s.task?.actionId === 'work' && s.task.phase === 'doing';
      const goUp = !same && (upstairs || (inLobby && !avatar.exhausted && !working));
      if (goUp) {
        if (s.task) get().cancelTask();
        enterHotel(room);
      }
      toast(same
        ? `🛎️ ${span} added. Room ${stay.no} is yours for another ${stayCountdown(stay.until - s.minutes)}.`
        : upstairs
          ? `🔑 Moved to Room ${stay.no}, the ${type.name}. Yours for ${span}.`
          : goUp
            ? `🔑 Welcome to Room ${stay.no}, the ${type.name}. Yours for ${span}. Tap anything in the room to use it.`
            : `🔑 Room ${stay.no}, the ${type.name}, is yours for ${span}. Take the lift up 🛗`);
    },

    enterRoom() {
      const s = get();
      const inLobby = s.view === 'place' && s.insideId === HOTEL_ID;
      const stay = stayIn(s.hotelStays, s.destinationId);
      if (!stayActive(stay, s.minutes)) {
        toast('🛎️ You have no room here yet. Book one at reception.');
        if (inLobby) get().setHotelDesk(true);
        return;
      }
      if (!inLobby) return toast(`🏨 Your room is upstairs at ${hotelName(s.destinationId)}. Take the lift from the lobby.`);
      if (avatar.exhausted) return toast('You are too exhausted to move. Rest a little longer 😵');
      if (s.task?.actionId === 'work' && s.task.phase === 'doing') return toast('You are at work');
      if (s.task) get().cancelTask();
      enterHotel(stay.room);
      toast(`🔑 Room ${stay.no} · ${ROOM_BY_ID[stay.room].name}. Tap anything in the room to use it.`);
    },

    leaveRoom() {
      const s = get();
      if (s.view !== 'place' || !isPrivateRoom(s.insideId)) return;
      if (avatar.exhausted) return toast('You are too exhausted to move. Rest a little longer 😵');
      if (s.task) get().cancelTask();
      if (isVillaSuite(s.insideId)) return enterVilla(false);
      enterHotel(null);
      const stay = stayIn(s.hotelStays, s.destinationId);
      if (stayActive(stay, s.minutes)) toast(`🛗 Back in the lobby. Room ${stay.no} is still yours: take the lift whenever you like.`);
    },

    enterSuite() {
      const s = get();
      if (s.view !== 'place' || s.insideId !== VILLA_ID) return toast('🏛️ The Presidential Suite is behind the President’s office at Aso Villa, in Abuja.');
      if (heldOffice() !== 'president') return toast('🚫 The guard steps in front of the door. The suite is for the President alone.');
      if (avatar.exhausted) return toast('You are too exhausted to move. Rest a little longer 😵');
      if (s.task) get().cancelTask();
      enterVilla(true);
      toast('👑 Welcome home, Your Excellency. Tap anything in the suite to use it.');
    },

    enterCells() {
      const s = get();
      if (s.view !== 'place' || s.insideId !== CELLS_PARENT) return toast('⛓️ The cells are at the back of the police station. Go to the station first.');
      if (jailed()) return;
      if (avatar.exhausted) return toast('You are too exhausted to move. Rest a little longer 😵');
      if (s.task) get().cancelTask();
      enterCellBlock(true);
      toast('⛓️ The warder lets you through. Tap anybody behind the bars to talk to them, or pay their bail.');
    },

    leaveCells() {
      const s = get();
      if (s.view !== 'place' || s.insideId !== CELLS_ID || lockedIn() || jailed()) return;
      if (s.task) get().cancelTask();
      enterCellBlock(false);
    },

    begin(name, look, origin, state) {
      const o = ORIGINS[origin];
      // Born in one of the states: the starter home, and the first streets you see, are that city's.
      const homeState = getRegion(state ?? '')?.id ?? 'kaduna';
      setActiveMap(homeState);
      // Each origin is born with its own phone, free of charge.
      const phone = PHONE_BY_ID[o.phone] ? o.phone : STARTER_ANDROID;
      set({
        started: true,
        name: name.trim() || 'Musa',
        look,
        origin,
        homeState,
        destinationId: homeState,
        // Born on the first installment; the server pays the rest a day at a time (worker/wallet.ts payStarter).
        money: firstInstallment(o),
        debtOwed: o.debt ?? 0,
        items: o.items,
        ownedCars: o.car ? [o.car] : [],
        ownedJets: [],
        jetWear: {},
        selectedCar: o.car,
        loanOwed: o.loan?.owed ?? 0,
        govRentOwed: GOV_WEEKLY_RENT[origin] ?? 0,
        govRentPaidThrough: dayOf(START_MINUTES),
        personalStaff: [],
        wardrobe: [...new Set([...STARTER_WARDROBE, ...Object.values(decodeLook(look).outfit), ...o.clothes])],
        phone,
        ownedPhones: [phone],
        freePhone: phone,
        view: origin === 'almajiri' ? 'city' : 'home',
        teleportId: get().teleportId + 1,
      });
      if (origin === 'almajiri') resetAvatar(regionStartDoor(homeState));
      else resetAvatar(GATE_CELL);
      toast(`${o.emoji} ${o.label}: ${o.tagline}`);
    },

    toast(text, chatUid) {
      // The same line twice in a row is one toast.
      if (get().toasts.some((t) => t.text === text)) return;
      const id = toastId++;
      set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, chatUid }] }));
      setTimeout(() => get().dismissToast(id), 8000);
    },
    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    select(id) {
      set((s) => ({ selectedId: id, ...(id && s.view === 'place' ? { placeHubOpen: false } : {}) }));
    },
    setMode(mode) {
      if (mode === 'buy' && get().view !== 'home') return toast('Go home first to buy furniture 🏠');
      set({ mode, selectedId: null, placing: null, panel: null, wallMode: false, wallSel: null, wallHover: null });
    },
    fitHome() {
      const s = get();
      if (s.view !== 'home') return;
      const layout = houseLayoutForState(s);
      const fitted = fitItemsToLayout(s.items, layout);
      if (fitted.boxed.length) {
        set({ items: fitted.items, furnitureInventory: [...s.furnitureInventory, ...fitted.boxed] });
        toast(`📦 ${fitted.boxed.length} item${fitted.boxed.length > 1 ? 's' : ''} didn't fit this house. Place them again from Buy mode.`);
      } else if (fitted.items.some((it, i) => it !== s.items[i])) set({ items: fitted.items });
      if (!inGrid(avatarCell(), layout)) resetAvatar(arrivalCell(layout));
    },
    setWallMode(on) {
      set({ wallMode: on, wallSel: null, wallHover: null, selectedId: null, placing: null });
    },
    setWallHover(e) {
      const h = get().wallHover;
      if (h === e || (h && e && edgeKey(h) === edgeKey(e))) return;
      set({ wallHover: e });
    },
    tapWall(e) {
      const s = get();
      if (!isEditableEdge(houseLayoutForState(s), e)) {
        set({ wallSel: null });
        return toast('Tap between two tiles inside the house — outer walls stay');
      }
      if (s.wallSel && edgeKey(s.wallSel) === edgeKey(e)) return get().toggleWall(e);
      set({ wallSel: e });
    },
    toggleWall(e) {
      const s = get();
      const layout = houseLayoutForState(s);
      if (!isEditableEdge(layout, e)) return;
      const k = edgeKey(e);
      const exists = layout.edgeSet.has(k);
      if (!exists) {
        const err = wallBuildError(layout, e, s.items, avatarCell());
        if (err) return toast(err);
      }
      const cost = exists ? WALL_KNOCK_COST : WALL_BUILD_COST;
      if (s.money < cost) return toast(`You need ${naira(cost)}`);
      pay(-cost, exists ? 'Knocked down a wall' : 'Built a wall', 'spend', 'walls');
      const house = houseKeyOf(s);
      const current = s.wallEdits[house] ?? [];
      const next = current.includes(k) ? current.filter((x) => x !== k) : [...current, k];
      set((st) => ({ wallEdits: { ...st.wallEdits, [house]: next }, wallSel: null }));
      toast(exists ? '🔨 Wall knocked down' : '🧱 Wall built');
      // Pictures, shelves and the like that hung on a wall that is gone go into storage.
      if (exists) decorHooks.settle?.('came off the wall');
    },
    setPanel(panel) {
      set({ panel, selectedId: null, placing: null, mode: panel ? 'live' : get().mode });
    },
    openProfile(tab = 'profile') {
      set({ panel: 'profile', profileTab: tab, selectedId: null, placing: null, mode: 'live' });
    },
    setAlias(uid, alias) {
      const { [uid]: _old, ...rest } = get().aliases;
      const clean = alias.trim().slice(0, ALIAS_MAX);
      set({ aliases: clean ? { ...rest, [uid]: clean } : rest });
    },
    runForOffice(office) {
      const s = get();
      if (s.campaign) return toast('Finish this campaign first.');
      if (s.governmentOffice === office) return toast('You already hold this office.');
      const { title, filingFee } = OFFICE_RULES[office];
      if (s.jailedUntil && s.jailedUntil > Date.now()) return toast('You can’t file for office from a police cell.');
      if (s.money < filingFee) return toast(`You need ${naira(filingFee)} to file.`);
      pay(-filingFee, `Filed for ${title}`);
      const today = dayOf(s.minutes);
      set({ campaign: { office, support: 10, electionDay: today + 4, lastActionDay: today - 1 } });
      toast(`You are running for ${title}!`);
    },
    campaignEvent(event: CampaignEvent) {
      const s = get();
      const campaign = s.campaign;
      if (!campaign) return;
      const today = dayOf(s.minutes);
      if (today >= campaign.electionDay) return toast('Election day has arrived.');
      if (campaign.lastActionDay === today) return toast('You already campaigned today.');
      const { label, cost, support } = CAMPAIGN_EVENTS[event];
      if (s.money < cost) return toast(`You need ${naira(cost)} for this event.`);
      pay(-cost, event === 'rally' ? `Campaign ${label.toLowerCase()}` : label);
      set({
        campaign: {
          ...campaign,
          support: Math.min(100, campaign.support + support),
          lastActionDay: today,
        },
      });
      toast(event === 'rally' ? 'Rally held! Support is growing 📣' : 'Town hall complete! Support is growing 🎤');
    },
    resolveStreetStory(choiceId) {
      const story = get().streetStory;
      if (!story) return;
      const choice = story.choices.find((option) => option.id === choiceId);
      if (!choice) return;
      const { outcome, result, rare } = rollChoice(choice, Math.random());
      const moneyChange = outcome.money ?? 0;
      if (moneyChange < 0) {
        const applied = Math.max(moneyChange, -get().money);
        if (applied) pay(applied, `${story.title}: ${choice.label}`);
      } else if (moneyChange > 0) {
        get().earn('luck', moneyChange, `${story.title}: ${choice.label}`);
      }
      set((s) => ({
        streetStory: null,
        goodDeeds: Math.max(0, s.goodDeeds + (outcome.goodDeeds ?? 0)),
        notoriety: Math.max(0, s.notoriety + (outcome.notoriety ?? 0)),
        knowledge: Math.min(10, s.knowledge + (outcome.knowledge ?? 0)),
        storyFlags: outcome.flag && !s.storyFlags.includes(outcome.flag) ? [...s.storyFlags, outcome.flag] : s.storyFlags,
        needs: {
          ...s.needs,
          ...Object.fromEntries(NEEDS.map(({ key }) => [key, clamp(s.needs[key] + (fed(outcome.needs ?? {})[key] ?? 0))])),
        } as Record<Need, number>,
        storyLog: [`${story.icon} ${result}`, ...s.storyLog].slice(0, 8),
      }));
      get().bump('stories');
      if (rare) get().bump('rareStories');
      toast(rare ? `🍀 RARE! ${result}` : result);
    },

    tick(dt) {
      const s = get();
      if (!s.started || dt <= 0) return;
      const prevMinutes = s.minutes;
      // The world clock runs at TIME_RATE (a day is an hour); `hours` is real time, which tasks scale by their own pace below.
      const minutes = prevMinutes + dt * TIME_RATE;
      const hours = dt / 60;
      const worldHours = hours * TIME_RATE;
      const toast = (text: string) => {
        const now = Date.now();
        if (now - (tickNoticeAt.get(text) ?? 0) < TICK_NOTICE_COOLDOWN_MS) return;
        tickNoticeAt.set(text, now);
        get().toast(text);
      };
      let properties = s.properties;
      let availableMoney = s.money;
      for (let day = dayOf(prevMinutes) + 1; day <= dayOf(minutes); day++) {
        let changed = false;
        const stolenItems = new Map<string, string[]>();
        properties = properties.map((property) => {
          if (!property.staff?.length) return property;
          const staff = property.staff.flatMap((member) => {
            if ((member.paidThrough ?? day - 1) >= day) return [member];
            const wage = HOUSEHOLD_STAFF[member.role].wage;
            if (availableMoney < wage) {
              changed = true;
              toast(`${HOUSEHOLD_STAFF[member.role].name} stopped working at your house because wages were unpaid.`);
              return [];
            }
            availableMoney -= wage;
            pay(-wage, `${HOUSEHOLD_STAFF[member.role].name} wages`);
            // Trust has a price: a paid-up worker may still help themselves, then vanish.
            const def = HOUSEHOLD_STAFF[member.role];
            const theft = property.rented ? null : rollStaffTheft(member.role as HouseStaffRole, property.staff!, availableMoney, property.items?.length ?? 0);
            if (theft?.kind === 'cash') {
              availableMoney -= theft.amount;
              pay(-theft.amount, `Stolen by your ${def.name.toLowerCase()}`);
              changed = true;
              get().toast(`🥷 Your ${def.name.toLowerCase()} stole ${naira(theft.amount)} and disappeared!`);
              return [];
            }
            if (theft?.kind === 'item') {
              const taken = property.items![theft.index];
              stolenItems.set(property.id, [...(stolenItems.get(property.id) ?? []), taken.id]);
              changed = true;
              get().toast(`🥷 Your ${def.name.toLowerCase()} stole your ${ITEMS[taken.type]?.name ?? taken.type} and disappeared!`);
              return [];
            }
            return [{ ...member, paidThrough: day }];
          });
          const lost = stolenItems.get(property.id);
          const items = lost ? property.items?.filter((i) => !lost.includes(i.id)) : property.items;
          return staff.every((member, i) => member === property.staff![i]) && staff.length === property.staff.length && !lost
            ? property
            : { ...property, staff, items };
        });
        if (changed) {
          const activeId = s.activeHouseId ?? s.homePropertyId;
          const lostHere = activeId ? stolenItems.get(activeId) : undefined;
          set(lostHere ? (st) => ({ properties, items: st.items.filter((i) => !lostHere.includes(i.id)) }) : { properties });
        }
      }
      const t = s.task;
      const doing = t && t.phase === 'doing' ? t : null;
      const def = doing ? (doing.actionId === 'work' ? null : findAction(doing.itemId, doing.actionId, taskItems(s), doing.placeId)) : null;
      const job = doing?.actionId === 'work' && !doing.over ? jobById(s.jobId) : null;
      // The world clock is the server's and always runs in real time. Long tasks (sleep, work) only
      // play out faster: their progress and effects run SKIP_RATE times quicker, matching the "sec" labels.
      const taskHours = hours * timeRate(s);

      // Needs
      const rates: Record<Need, number> = { ...DECAY };
      const activeHouse = properties.find((p) => p.id === (s.activeHouseId ?? s.homePropertyId));
      if (s.view === 'home' && activeHouse?.staff?.length) {
        if (activeHouse.staff.some((member) => member.role === 'cook')) rates.hunger += 6;
        if (activeHouse.staff.some((member) => member.role === 'cleaner')) rates.hygiene += 3;
      }
      if (avatar.exhausted) rates.energy = 35;
      if (t?.actionId === 'enter' && t.phase === 'walking' && (t.travelMode ?? 'walk') === 'walk') rates.energy = -15;
      if (def?.perHour) Object.assign(rates, fed(def.perHour));
      // At work you eat and use the toilet there, so those drain slowly.
      if (job) Object.assign(rates, { hunger: WORK_HUNGER, bladder: -2 }, job.perHour);
      if (def?.cookingPerHour && rates.hunger > 0) rates.hunger *= 1 + s.cooking * 0.05;
      // A room the owner has given a use (game/exterior.ts ROOM_TYPES) helps what is done in it: sleep in a bedroom, study in a study.
      const roomUse = doing && s.view === 'home' && !useVisit.getState().current ? roomTypeAt(s, activeHouse) : null;
      if (roomUse?.needs) for (const [n, k] of Object.entries(roomUse.needs)) if (rates[n as Need] > 0) rates[n as Need] *= 1 + k;
      // Behind the wheel: a cruise is fun, a keke shift is work.
      if (driveState.vehicle === 'car' || driveState.vehicle === 'horse') Object.assign(rates, { fun: 6, energy: -2 });
      else if (driveState.vehicle) Object.assign(rates, { fun: -1, energy: -4, social: 2 });
      // Bladder is folded into hygiene (catalog.ts): a toilet freshens you up, and drinks no longer cost anything.
      if (rates.bladder > 0) rates.hygiene = Math.max(0, rates.hygiene) + rates.bladder * TOILET_FRESHEN;
      const needs = { ...s.needs, bladder: 100 };
      for (const n of NEEDS) needs[n.key] = clamp(needs[n.key] + rates[n.key] * (rates[n.key] < 0 ? DRAIN_SCALE : 1) * taskHours);

      const knowledge = Math.min(10, s.knowledge + (def?.knowledgePerHour ?? 0) * (1 + (roomUse?.knowledge ?? 0)) * taskHours);
      const cooking = Math.min(10, s.cooking + (def?.cookingPerHour ?? 0) * (1 + (roomUse?.cooking ?? 0)) * taskHours);

      // Power: NEPA comes and goes. Generator burns fuel when it's carrying the house.
      // The grid is shared: everyone in the city loses (and gets back) light at the same moment.
      const power = { ...s.power };
      // Everything plugged in draws power: cameras and fridges all day, plus whatever you're using now.
      // Only while you are in the house: step out and the light goes off, so nothing draws, bills or burns.
      const home = inOwnHouse(s);
      const load = homeLoad(s, def?.needsPower ? def.id : null);
      const cut = s.nepaOwed >= POWER.cutoff;
      const grid = gridOn() && !cut;
      if (grid !== power.grid) {
        power.grid = grid;
        if (home) toast(grid ? 'Up NEPA! Light don come 💡' : cut && gridOn() ? '🧾 NEPA cut you off for the unpaid bill. Pay it in Phone → NEPA' : 'NEPA don take light 🕯️');
      }
      // On the grid you pay by the kWh. NEPA is not cheap. It is taken from your account once a game day.
      let nepaOwed = s.nepaOwed;
      let meter = s.meter;
      if (onGrid(power)) {
        // A bypassed meter pays little or nothing; what you didn't pay is what the fine is based on.
        const real = load * worldHours * POWER.tariff;
        const share = billShare(meter.level);
        nepaOwed += real * share;
        if (meterOn(meter)) {
          meter = { ...meter, saved: meter.saved + real * (1 - share) };
          const reason: InspectionReason | null = meter.reported !== null ? 'report' : rollInspection(meter, worldHours);
          if (reason) {
            const { meter: next, event } = inspect(meter, reason, minutes);
            meter = next;
            if (event?.found) {
              nepaOwed += event.fine;
              toast(`🚨 ${REASON_TEXT[reason]}: NEPA found the bypass! ${naira(event.fine)} fine added to your bill, meter restored, and the plug will not touch you for a while.`);
            } else {
              toast(`🕵🏾 ${REASON_TEXT[reason]}: inspectors checked your meter and found nothing... this time.`);
            }
          }
        }
      }
      if (meter !== s.meter) set({ meter });
      const day = dayOf(minutes);
      const clock = hourOf(minutes);
      let warnedDay = s.nepaWarnedDay;
      let billedDay = s.nepaBilledDay;
      if (nepaOwed >= 1 && clock >= POWER.warnHour && warnedDay < day && billedDay < day) {
        warnedDay = day;
        const short = get().money < nepaOwed;
        toast(`🧾 NEPA will auto-deduct about ${naira(Math.ceil(nepaOwed))} from your account at ${POWER.billHour}:00${short ? '. You may not have enough, top up your account!' : '. See the bill in Phone → NEPA'}`);
      }
      if (clock >= POWER.billHour && billedDay < day) {
        billedDay = day;
        warnedDay = day;
        if (nepaOwed >= 1) {
          const due = Math.ceil(nepaOwed);
          const paid = Math.min(due, Math.max(0, Math.floor(get().money)));
          if (paid > 0) pay(-paid, 'NEPA bill (auto-paid)');
          nepaOwed = Math.max(0, nepaOwed - paid);
          toast(paid >= due ? `🧾 NEPA auto-deducted ${naira(paid)} for your electricity` : `🧾 NEPA took ${naira(paid)}. ${naira(due - paid)} still owed. Pay up before they cut you off!`);
        }
      }
      if (nepaOwed !== s.nepaOwed || warnedDay !== s.nepaWarnedDay || billedDay !== s.nepaBilledDay) set({ nepaOwed, nepaWarnedDay: warnedDay, nepaBilledDay: billedDay });
      if (s.items.some((i) => i.type === 'solar')) {
        const battery = power.battery ?? 100;
        if (isDaylight(minutes)) power.battery = Math.min(100, battery + INVERTER.charge * worldHours);
        else if (home && !onGrid(power) && modeOf(power) !== 'gen' && battery > 0) {
          power.battery = Math.max(0, battery - (INVERTER.drain * drainScale(load) / inverterCount(s.items)) * worldHours);
          if (power.battery === 0) toast('Inverter battery don die 🔋');
        }
      }
      const gen = home ? runningGen({ items: s.items, minutes, power }) : null;
      if (gen) {
        power.genFuel = Math.max(0, power.genFuel - genBurn(gen, load) * worldHours);
        if (power.genFuel === 0) toast('Generator fuel don finish ⛽');
      }

      // Works on the tick's own `properties`: the final set() below writes that list back, so a separate set() here was undone at once.
      const reclaimed = properties.filter(
        (p) => !p.design && p.stage === 0 && !p.building && minutes - (p.boughtAt ?? minutes) >= LAND_RECLAIM_MINUTES,
      );
      if (reclaimed.length) {
        // A plot that comes back (failed save, other device) is dropped again without a repeat notice.
        for (const p of reclaimed) if (!announcedReclaims.has(p.id)) {
          announcedReclaims.add(p.id);
          toast(`📜 ${landAuthority(p.region)} reclaimed your unused plot in ${REGION_BY_ID[p.region]?.name ?? 'Kaduna'} after ${LAND_RECLAIM_MINUTES / DAY_MINUTES} days without building. No refund.`);
        }
        properties = properties.filter((p) => !reclaimed.some((expired) => expired.id === p.id));
      }

      // LAPO repayment every 7 days. Whatever you can't cover stays on the loan.
      if (s.loanOwed > 0 && dayOf(minutes) > dayOf(prevMinutes) && (dayOf(minutes) - 1) % 7 === 0) {
        const weekly = ORIGINS.lapo.loan!.weekly;
        const paid = Math.min(weekly, s.loanOwed, Math.max(0, Math.floor(get().money)));
        if (paid > 0) pay(-paid, 'LAPO loan repayment');
        const owed = s.loanOwed - paid;
        set({ loanOwed: owed });
        toast(
          owed === 0
            ? '🎉 You don clear your LAPO loan! Free at last'
            : paid < weekly
              ? `😬 LAPO officers came. You could only pay ${naira(paid)}. Still owing ${naira(owed)}`
              : `📉 LAPO took ${naira(paid)}. Still owing ${naira(owed)}`,
        );
      }

      // Government house rent, weekly, at the rate the state's governor set (game/cityLaws.ts), into that state's
      // treasury. `govRentOwed` only says you live in one; the price is the state's law.
      if (s.govRentOwed > 0 && dayOf(minutes) > dayOf(prevMinutes) && (dayOf(minutes) - s.govRentPaidThrough) >= 7) {
        const weekly = govRentIn(s.homeState);
        const paid = Math.min(weekly, Math.max(0, Math.floor(get().money)));
        if (paid > 0) pay(-paid, `Government house rent, ${regionOf(s.homeState).name}`, 'spend', `govrent:${s.homeState}`);
        // Whatever they couldn't pay goes on their debt.
        set((st) => ({ govRentPaidThrough: dayOf(minutes), debtOwed: st.debtOwed + (weekly - paid) }));
        toast(
          paid < weekly
            ? `🏚️ Landlord Agent came! You could only pay ${naira(paid)} of ${naira(weekly)} weekly rent. ${naira(weekly - paid)} added to your debt.`
            : `🏚️ Landlord Agent collected ${naira(paid)} rent for your government house.`,
        );
      }

      // Personal staff (driver, nanny, bodyguard) — paid daily like house staff.
      if (dayOf(minutes) > dayOf(prevMinutes) && s.personalStaff.length > 0) {
        const day = dayOf(minutes);
        let personalStaff = s.personalStaff;
        let changedPersonal = false;
        personalStaff = personalStaff.flatMap((member) => {
          if ((member.paidThrough ?? day - 1) >= day) return [member];
          const wage = HOUSEHOLD_STAFF[member.role].wage;
          if (availableMoney < wage) {
            changedPersonal = true;
            toast(`${HOUSEHOLD_STAFF[member.role].name} left because wages were unpaid.`);
            return [];
          }
          availableMoney -= wage;
          pay(-wage, `${HOUSEHOLD_STAFF[member.role].name} wages`);
          return [{ ...member, paidThrough: day }];
        });
        if (changedPersonal || personalStaff.length !== s.personalStaff.length) set({ personalStaff });
      }

      // Paid construction projects move through each remaining stage automatically.
      const buildNotices: string[] = [];
      if (s.properties.some((p) => p.building && p.building.doneAt <= minutes)) {
        properties = properties.map((p) => {
          if (!p.building || p.building.doneAt > minutes) return p;
          if (p.extending) return extensionStep(p, minutes, buildNotices);
          const region = REGION_BY_ID[p.region]?.name ?? '';
          let stageIndex = p.stage;
          let building: Property['building'] = p.building;
          const plan = p.constructionPlan ?? null;
          while (building && building.doneAt <= minutes) {
            const completed = STAGES[stageIndex];
            stageIndex++;
            const finished = stageIndex >= STAGES.length;
            buildNotices.push(finished ? `🏠 Your house for ${region} don complete! Open House to rent or sell` : `${completed.icon} ${completed.name} done for ${region}`);
            if (finished || !plan) {
              building = null;
              break;
            }
            const next = STAGES[stageIndex];
            const contractor = CONTRACTOR_BY_ID[plan.contractor] ?? CONTRACTOR_BY_ID.standard;
            building = {
              contractor: contractor.id,
              startedAt: building.doneAt,
              doneAt: building.doneAt + stageMinutes(DESIGN_BY_ID[p.design!]!, next, contractor),
            };
          }
          return { ...p, stage: stageIndex, building, constructionPlan: building ? plan : null, ...(stageIndex >= STAGES.length ? { builtAt: Date.now() } : {}) };
        });
      }

      // Deliveries
      const due = s.deliveries.filter((d) => d.at <= minutes);
      for (const d of due) {
        needs.hunger = clamp(needs.hunger + d.hunger);
        needs.energy = clamp(needs.energy + d.hunger * FOOD_ENERGY);
        needs.fun = clamp(needs.fun + d.fun);
        toast(`🛵 Your ${d.name} don land! Chop am 😋`);
      }

      set({
        minutes,
        properties,
        needs,
        knowledge,
        cooking,
        power,
        deliveries: due.length ? s.deliveries.filter((d) => d.at > minutes) : s.deliveries,
      });
      for (const notice of buildNotices) toast(notice);

      const campaign = get().campaign;
      if (campaign && dayOf(minutes) >= campaign.electionDay) {
        const { targetSupport, title } = OFFICE_RULES[campaign.office];
        const won = campaign.support >= targetSupport;
        set({ campaign: null, ...(won ? { governmentOffice: campaign.office } : {}) });
        toast(won ? `You won the ${title.toLowerCase()} election! 🎉` : 'You lost the election. You can run again next time.');
      }

      // Task progress
      if (doing?.over) {
        // The shift has run out: you are paid when you clock out, and clocked out for you if you never do.
        if (Date.now() - doing.over >= CLOCK_OUT_GRACE_MS) finish();
      } else if (doing) {
        const remaining = doing.remaining - dt * timeRate(s);
        const st = get();
        // An "until full" activity stops once its bar fills, but one started on a full bar (a shower when you're
        // already clean) still runs its length: you can always use it, it just adds nothing.
        const fills = def?.untilFull ? (def.untilFull === 'bladder' ? 'hygiene' : def.untilFull) : null;
        const startFull = doing.startFull ?? (fills ? needs[fills] >= 100 : false);
        if (def?.needsPower && !litFor(st, doing.itemId)) {
          toast('No light! You had to stop 🕯️');
          finish(true);
        } else if (remaining <= 0 || (fills && !startFull && needs[fills] >= 100) || (doing.auto && needs[doing.auto] >= 100)) {
          if (doing.actionId === 'work') {
            set({ task: { ...doing, remaining: 0, over: Date.now() } });
            toast('🎉 Shift done! Clock out to collect your pay');
          } else finish();
        } else {
          set({ task: { ...doing, remaining, startFull } });
        }
      }

      // Self-care: standing idle in your own house with a bar running low, you go and sort it out.
      const idle = get();
      const free = idle.view === 'home' && !idle.task && idle.mode === 'live' && !idle.panel && !idle.selectedId && !idle.placing && !avatar.exhausted && !useVisit.getState().current;
      idleSeconds = free ? idleSeconds + dt : 0;
      if (free && idleSeconds >= SELF_CARE.idleSeconds && Date.now() >= selfCareHoldUntil) {
        idleSeconds = 0;
        const pick = selfCarePick(idle.needs, idle.items, idle.money, (item, action) =>
          !item.broken && (!action.needsPower || (isPowered(idle) && !genOverload(idle, action.id))) && (!action.waterUse || idle.waterTank >= action.waterUse));
        if (pick) {
          get().startAction(pick.itemId, pick.actionId);
          const started = get().task;
          if (started?.itemId === pick.itemId && started.actionId === pick.actionId) {
            set({ task: { ...started, auto: pick.need } });
            toast(`${pick.icon} ${NEEDS.find((n) => n.key === pick.need)!.label} is low: ${pick.label}. Tap anywhere to stop.`);
          } else {
            // Could not get there: do not keep trying every few seconds.
            selfCareHoldUntil = Date.now() + SELF_CARE.holdSeconds * 1000;
          }
        }
      }

      // Crises
      const st = get();
      const warn = (k: string, text: string, every = 180) => {
        if (minutes - (st.warnedAt[k] ?? -1e9) < every) return;
        set((x) => ({ warnedAt: { ...x.warnedAt, [k]: minutes } }));
        toast(text);
      };
      if (st.needs.hunger <= 0) {
        if (st.task) finish(true);
        const available = Math.max(0, Math.floor(get().money));
        const paid = Math.min(HOSPITAL_BILL, available);
        const debt = HOSPITAL_BILL - paid;
        if (paid > 0) pay(-paid, 'Hospital treatment');
        set((x) => ({
          money: Math.max(0, x.money),
          debtOwed: x.debtOwed + debt,
          needs: { ...x.needs, ...Object.fromEntries(NEEDS.map(({ key }) => [key, 100])) } as Record<Need, number>,
        }));
        if (debt > 0) moneyHooks.onChange?.({ amount: debt, kind: 'debt', ref: 'hospital' });
        avatar.exhausted = false;
        enterPlace('hospital');
        // The card (ui/Fainted.tsx) says why you are here, what it cost and how not to come back.
        useFainted.setState({ report: { paid, debt, hospital: placeHere('hospital')?.name ?? 'the hospital' } });
      } else if (avatar.exhausted) {
        if (st.needs.energy >= 25) {
          avatar.exhausted = false;
          avatar.pose = 'stand';
          avatar.snap = null;
          avatar.recoverAt = 0;
          toast('You have rested enough to get back up 💪🏾');
        }
      } else if (st.needs.energy <= 0 && st.task?.actionId !== 'sleep') {
        if (st.task) finish(true);
        avatar.path = [];
        avatar.onArrive = null;
        avatar.pose = 'lie';
        avatar.exhausted = true;
        avatar.snap = { x: avatar.x, y: st.view === 'city' ? mapGroundY(avatar.x, avatar.z) : 0, z: avatar.z, yaw: avatar.yaw };
        avatar.recoverAt = 0;
        toast('You collapsed from tiredness 😵 Resting here until you recover.');
      } else {
        // Two warnings on the way down: an early one, then a last call that keeps coming until you eat.
        if (st.needs.hunger < HUNGER_WARN.faint) warn('hunger', `🥵 You are about to faint from hunger! Eat now, or you wake up in hospital with a ${naira(HOSPITAL_BILL)} bill.`, HUNGER_WARN.faintEvery);
        else if (st.needs.hunger < HUNGER_WARN.low) warn('hungry', `🍛 Your belle dey shout! Go chop something soon. If your Hunger bar runs out you faint, and the hospital charges ${naira(HOSPITAL_BILL)}.`);
        if (st.needs.energy < 12) warn('energy', 'You are very tired. Find bed 😴');
        if (st.needs.hygiene < 10) warn('hygiene', 'You dey smell small. Go bath 🫧');
      }

      // Hotel: an hour's warning, then the room is taken back. Housekeeping walks you down if you are still in it.
      // Every city's hotel runs its own clock, whichever city you are in.
      const inRoom = st.view === 'place' && isHotelRoom(st.insideId);
      for (const [city, stay] of Object.entries(st.hotelStays)) {
        if (minutes >= stay.until) {
          set((now) => ({ hotelStays: Object.fromEntries(Object.entries(now.hotelStays).filter(([c]) => c !== city)) }));
          toast(`🛎️ Checkout time. Room ${stay.no} at ${hotelName(city)} has gone back to the hotel.`);
        } else if (prevMinutes < stay.until - CHECKOUT_WARNING && minutes >= stay.until - CHECKOUT_WARNING) {
          toast(`⏰ Room ${stay.no} at ${hotelName(city)}: ${stayCountdown(stay.until - minutes)} to checkout. Add nights from the room card or at reception.`);
        }
      }
      // Also catches a save loaded upstairs after the stay ran out while you were away.
      if (inRoom && !stayActive(stayIn(get().hotelStays, st.destinationId), minutes) && !avatar.exhausted) {
        if (get().task) get().cancelTask();
        enterHotel(null);
      }
      // The suite at Aso Villa goes with the office: a President whose term is over is shown back out to the office.
      if (st.view === 'place' && isVillaSuite(st.insideId) && lostOffice('president') && !avatar.exhausted) {
        if (get().task) get().cancelTask();
        enterVilla(false);
        toast('🏛️ Your term is over. The suite belongs to the next President now.');
      }

      // The call to work as the shift starts: the chip (ui/WorkChip.tsx) takes you there.
      const info = shiftInfo(st);
      if (info && st.workedDay !== info.clock.day && st.task?.actionId !== 'work') {
        const startMin = info.job.start * 60;
        const prev = prevMinutes % DAY;
        const now = minutes % DAY;
        if (prev < startMin && now >= startMin) toast(`⏰ Time for work at ${info.place.name}! Tap “Go to work”`);
      }
    },

    walkTo(c) {
      const s = get();
      if (avatar.exhausted) return toast('You are too exhausted to move. Rest a little longer 😵');
      if (s.view === 'city' || s.cellExit) return;
      if (s.task) {
        if (s.task.actionId === 'work' && s.task.phase === 'doing') return toast('You are at work');
        if (s.task.phase === 'doing' && !s.task.auto) {
          set({ queuedMove: c });
          return toast('Finish this activity first, then you’ll move there.');
        }
        finish(true);
      }
      const inside = s.view === 'place' && s.insideId ? INTERIORS[s.insideId] : null;
      const path =
        s.view === 'estate' && s.estateId
          ? estatePath(avatarCell(), c, estateLots(s.estateId), estateRows(s.estateId))
          : inside
            ? interiorPathToCell(inside, avatarCell(), c)
            : pathToCell(avatarCell(), c, s.items, houseLayoutForState(s));
      if (!path) return;
      avatar.path = path;
      avatar.onArrive = () => arrive();
      set({ task: { itemId: null, actionId: 'walk', label: 'Walking', icon: '🚶🏾', phase: 'walking', remaining: 0, total: 0 }, selectedId: null });
      if (!path.length) arrive();
    },

    startAction(itemId, actionId) {
      const s = get();
      if (avatar.exhausted) return toast('You are too exhausted to do that. Rest a little longer 😵');
      const placeId = itemId && s.view === 'place' && s.insideId ? s.insideId : undefined;
      const def = findAction(itemId, actionId, taskItems(s), placeId);
      if (!def) return;
      if (s.task?.actionId === 'work' && s.task.phase === 'doing') return toast('You are at work');
      if ((!itemId || def.effect === 'work' || def.effect === 'travel' || s.cellExit) && jailed()) return;
      if (itemId && !placeId && taskItems(s).find((i) => i.id === itemId)?.broken) return toast(visitItemOf(itemId) ? 'This one don spoil. E no dey work 🔧' : 'E don spoil. Tap the 🔧 on it to call the repairer');
      if (def.needsPower && !litFor(s, itemId)) return toast(visitItemOf(itemId) ? `🕯️ No light in @${useVisit.getState().current?.ownerUsername}'s house right now` : 'No light! NEPA has taken it. Fuel the gen? ⛽');
      if (def.needsPower && itemId && !placeId && !visitItemOf(itemId)) {
        const over = genOverload(s, def.id);
        if (over) return toast(`🔌 Your ${ITEMS[over.gen].name} can’t carry that: the house would pull ${over.load.toFixed(1)} kW and it gives ${over.max} kW. Wait for NEPA or buy a bigger gen.`);
      }
      if (notInOffice(def)) return;
      if (s.money < actionCost(def)) return toast(`You need ${naira(actionCost(def))} for that`);
      if (boardingStop(def, () => get().startAction(itemId, actionId))) return;
      if (def.waterUse && !visitItemOf(itemId) && s.waterTank < def.waterUse) return toast('The overhead tank is dry. Pump water or call Mai Ruwa from Phone → NEPA.');
      if ((def.effect === 'durbar' || def.effect === 'buyRam') && dayOf(s.minutes) % 28 !== 0) return toast('Hawan Sallah is on the 28th day of each in-game month. Check back on Durbar day! 🐎');
      if (def.effect === 'buyRam' && s.sallahRam !== 'none') return toast('You already have a ram at home. Feed it before sharing Sallah meat.');
      if (def.effect === 'kidCare' && !kidHooks.canStart?.(actionId)) return;
      if (def.effect === 'feedRam' && s.sallahRam !== 'unfed') return toast('Buy a ram at Murtala Square on Durbar day first.');
      if (def.effect === 'shareRam' && s.sallahRam !== 'fed') return toast('Feed your Sallah ram first, then share the meat with your neighbours.');
      if (def.effect === 'work') {
        // Work is done at the workplace: the gate at home only shows the way there (game/work.ts).
        if (!placeId) {
          set({ selectedId: null });
          return workHooks.go?.();
        }
        const city = cityMap(s.destinationId).id;
        const here = placeHere(placeId)?.jobs ?? [];
        const held = employment(s);
        // Walking in and asking is applying: with the Knowledge for it, the job at this place is yours, no trip to the phone.
        if (!(held && held.city === city && here.includes(held.job.id))) {
          const job = jobById(here[0]);
          if (!job) return toast('You don’t work here');
          if (s.knowledge < job.minKnowledge) return toast(`You need Knowledge ${job.minKnowledge} to work as a ${job.title}. Study more 📚`);
          set({ jobId: job.id, jobCity: city, workDays: 0 });
          toast(`You got the job! ${job.title}, ${shiftHours(job)}`);
        }
        const info = shiftInfo(get());
        if (!info) return toast('Get a job first. Open Phone → Jobs 📱');
        if (info.clock.phase === 'on' && s.workedDay === info.clock.day) return toast('You already worked today. Rest!');
        if (info.clock.phase !== 'on') return toast(info.clock.phase === 'soon' ? `You are early. Your shift starts at ${info.job.start}:00` : `Your shift is ${shiftHours(info.job)}`);
      }
      // Speaker "Change station" → open the phone Radio app directly
      if (actionId === 'change_station') {
        set({ panel: 'phone', openApp: 'radio' });
        return;
      }
      if (s.task) finish(true);

      if (!itemId) {
        // Phone action: do it where you stand.
        if (def.cost) pay(-def.cost, def.label);
        set({ task: { itemId: null, actionId, label: def.label, icon: def.icon, animation: def.animation, phase: 'doing', remaining: def.minutes, total: def.minutes }, panel: null });
        return;
      }
      let path;
      if (placeId) {
        const inside = INTERIORS[placeId];
        const prop = inside.props.find((p) => p.id === itemId);
        path = prop ? interiorPathToProp(inside, avatarCell(), prop) : null;
      } else {
        const visit = useVisit.getState().current;
        const theirs = visitItemOf(itemId);
        if (visit && theirs) path = pathToItem(avatarCell(), theirs, visit.save.items, houseLayout(withPark(visit.save.design, visit.save.ownedCars?.length ?? 0), visit.save.walls));
        else path = pathToItem(avatarCell(), s.items.find((i) => i.id === itemId)!, s.items, houseLayoutForState(s));
      }
      if (!path) return toast("Can't reach that. Something dey block the way");
      avatar.path = path;
      avatar.onArrive = () => arrive();
      set({ task: { itemId, placeId, actionId, label: def.label, icon: def.icon, animation: activityAnimation(def), phase: 'walking', remaining: def.minutes, total: def.minutes }, selectedId: null });
      if (!path.length) arrive();
    },

    selectPlace(placeId) {
      // Behind the wheel the map is for driving: no tapping a place to travel there.
      if (placeId && driveState.vehicle) return;
      set({ placeId, selectedId: null });
    },

    startPlace(placeId, travelMode = 'walk', carId) {
      const s = get();
      if (avatar.exhausted) return toast('You are too exhausted to travel. Rest a little longer 😵');
      if (jailed()) return;
      if (s.view !== 'city') {
        get().openMap();
      }
      const st = get();
      const place = regionPlaces(st.destinationId).find((p) => p.id === placeId);
      // A building the state has let fall apart is shut until it is repaired.
      const broken = brokenAsset(st.destinationId, placeId);
      if (broken) return toast(`🔧 ${place?.name ?? 'That building'} is closed: the state has let it fall apart. The governor has to repair it.`);
      const def = findAction(null, 'enter', st.items, placeId);
      // The government house stands only in the state you were born in.
      if (placeId === 'home' && st.view === 'city' && awayFromHome()) return;
      // The door opens the house you call home: one in another city's estate is a flight away, not a walk.
      const homeHouse = placeId === 'home' ? st.properties.find((p) => p.id === st.homePropertyId) : undefined;
      if (homeHouse && st.view === 'city' && awayFrom(estateCity(homeHouse.region), 'Your house')) return;
      if (!place && PLACE_BY_ID[placeId] && st.view === 'city') awayFromHome();
      if (!place || !def || st.view !== 'city') return;
      if (s.task?.actionId === 'work' && s.task.phase === 'doing') return toast('You are at work');
      if (place.id !== 'home' && !isOpen(place, hourOf(s.minutes))) return toast(`${place.name} is closed now · ${hoursLabel(place)}`);
      // Nobody turns away a guest with a key: the hotel you hold a room in, and the villa for the President, whose suite is inside.
      const hasRoom = place.id === HOTEL_ID ? stayActive(stayIn(s.hotelStays, st.destinationId), s.minutes) : place.id === VILLA_ID && heldOffice() === 'president';
      if (Math.round(s.needs.hygiene) <= 0 && turnedAwayForSmell(place) && !hasRoom) return toast(`🤢 Security at ${place.name}: "Oga, the smell! Go and bath first, then come back." The hospital shower is free.`);
      const km = kmBetween(avatarCell(), place.door);
      const fare = fareOf(travelMode, km);
      const onState = stateFareForKm(travelMode, km);
      if (fare && s.money < fare) return toast(`You need ${naira(fare)} for that ride`);
      if (travelMode === 'car' && (!carId || !s.ownedCars.includes(carId))) return toast('You need to own that car before driving it');
      if (travelMode === 'car' && carId && !driveOff(carId, km)) return;
      if (driveState.vehicle) driveHooks.stop?.();
      const path = travelMode === 'helicopter'
        ? cityStraightPath(avatarCell(), place.door)
        : cityPathToPlace(avatarCell(), place);
      if (!path) return toast("Can't find a way there");
      if (s.task) finish(true);
      avatar.snap = null;
      avatar.pose = 'stand';
      avatar.recoverAt = 0;
      if (fare) pay(-fare, `${travelMode === 'keke' ? 'Keke fare' : travelMode === 'okada' ? 'Okada fare' : travelMode === 'cab' ? 'Cab fare' : 'Helicopter ride'} to ${place.name}`);
      else if (onState) chargeTreasury(onState.amount, onState.vehicle);
      avatar.path = path;
      avatar.onArrive = () => arrive();
      // Anything that happens on the way happens part-way there, never once you've arrived.
      avatar.storyAt = travelMode !== 'helicopter' && path.length >= STORY_ROUTE_MIN_CELLS && Math.random() < STORY_ROUTE_CHANCE ? Math.floor(path.length * (0.3 + Math.random() * 0.4)) : null;
      const car = travelMode === 'car' && carId ? CAR_BY_ID[carId] : null;
      const label = travelMode === 'walk' ? `Walking to ${place.name}` : travelMode === 'keke' ? `Taking keke to ${place.name}` : travelMode === 'okada' ? `Taking okada to ${place.name}` : travelMode === 'cab' ? `Taking a cab to ${place.name}` : travelMode === 'helicopter' ? `Flying by helicopter to ${place.name}` : `Driving to ${place.name}`;
      const icon = travelMode === 'walk' ? '🚶🏾' : travelMode === 'keke' ? '🛺' : travelMode === 'okada' ? '🏍️' : travelMode === 'cab' ? '🚕' : travelMode === 'helicopter' ? '🚁' : '🚗';
      set({ task: { itemId: null, placeId, actionId: 'enter', label: onState ? `${STATE_FLEET[onState.office][onState.vehicle]} to ${place.name}` : label, icon, travelMode, carId: car?.id, official: onState?.office, phase: 'walking', remaining: 0, total: 0 }, placeId: null });
      if (!path.length) arrive();
    },

    startPlaceAction(placeId, actionId) {
      const s = get();
      if (avatar.exhausted) return toast('You are too exhausted to do that. Rest a little longer 😵');
      const def = findAction(null, actionId, s.items, placeId);
      if (!def) return;
      if (s.task?.actionId === 'work' && s.task.phase === 'doing') return toast('You are at work');
      // A cell has its own things to do (sleep, eat, wash, gist, exercise); everything else stays locked.
      const inCell = s.view === 'place' && s.insideId === placeId && (placeId === CELLS_ID ? actionId.startsWith('cell_') : placeId === 'camp') && !s.cellExit;
      if (!inCell && jailed()) return;
      if (notInOffice(def)) return;
      if (s.money < actionCost(def)) return toast(`You need ${naira(actionCost(def))} for that`);
      if (s.view === 'place' && s.insideId === placeId) {
        if (boardingStop(def, () => get().startPlaceAction(placeId, actionId))) return;
        const inside = INTERIORS[placeId];
        // The nearest one you can get to: in the cells, every cell has its own toilet, and only yours is in reach.
        const props = inside?.props.filter((p) => p.actions.includes(actionId)) ?? [];
        const prop = props.length > 1
          ? props.map((p) => ({ p, path: interiorPathToProp(inside, avatarCell(), p) })).filter((o) => o.path).sort((a, b) => a.path!.length - b.path!.length)[0]?.p ?? props[0]
          : props[0];
        if (prop) return get().startAction(prop.id, actionId);
        if (s.task) finish(true);
        if (!inside) return;
        const cells = Array.from({ length: inside.w * inside.h }, (_, i) => ({ x: i % inside.w, z: Math.floor(i / inside.w) }))
          .sort((a, b) => Math.hypot(a.x - inside.w / 2, a.z - inside.h / 2) - Math.hypot(b.x - inside.w / 2, b.z - inside.h / 2));
        const target = cells.find((cell) => interiorPathToCell(inside, avatarCell(), cell) !== null);
        const path = target ? interiorPathToCell(inside, avatarCell(), target) : null;
        if (!path) return toast("Can't find a clear spot for that activity");
        if (actionCost(def) && !ticketOf(def, s.destinationId, s.fares)) pay(-def.cost!, def.label);
        avatar.snap = null;
        avatar.pose = 'stand';
        avatar.path = path;
        avatar.onArrive = () => arrive();
        set({ task: { itemId: null, placeId, actionId, label: def.label, icon: def.icon, animation: activityAnimation(def), phase: 'walking', remaining: def.minutes, total: def.minutes } });
        if (!path.length) arrive();
        return;
      }
      // If outside, travel to place first
      get().startPlace(placeId);
      if (get().task?.actionId === 'enter') set((state) => ({ task: state.task ? { ...state.task, actionAfterTravel: actionId } : null }));
    },

    arriveFlight(destination) {
      if (!getRegion(destination) || jailed()) return;
      set({ task: null, destinationId: destination, view: 'city' });
      toast(`Landed in ${regionOf(destination).name}! ✈️`);
      const onPhone = get().panel === 'phone';
      enterCity(regionAirportDoor(destination));
      if (onPhone) set({ panel: 'phone' });
    },

    openMap() {
      const s = get();
      if (avatar.exhausted) return toast('You are too exhausted to move. Rest a little longer 😵');
      if (s.view === 'city' || jailed()) return;
      if (s.task?.actionId === 'work' && s.task.phase === 'doing') return toast('You are at work');
      if (s.task) get().cancelTask();
      // Out of an estate (or a house in one) you come out where its road meets the town.
      const house = s.view === 'home' ? s.properties.find((p) => p.id === (s.activeHouseId ?? s.homePropertyId)) : undefined;
      const fromEstate = s.view === 'estate' ? estateExitCell(s.estateId) : house ? estateExitCell(house.region) : undefined;
      enterCity(s.view === 'place' ? doorOf(s.insideId) : fromEstate);
      if (s.view === 'estate') set({ estateId: null });
    },

    goHome(travelMode = 'walk', carId, homeId) {
      const s = get();
      if (avatar.exhausted) return toast('You are too exhausted to move. Rest a little longer 😵');
      // At home already: only a trip to another of your houses (the house card's ‹ ›) goes anywhere.
      if ((s.view === 'home' && (!homeId || homeId === (s.activeHouseId ?? s.homePropertyId) || homeId === 'lease' || homeId === 'gov')) || jailed()) return;
      // A house picked by name must be finished and lived in by you: one with a tenant in it is theirs for now.
      const picked = homeId && homeId !== 'lease' && homeId !== 'gov' ? s.properties.find((p) => p.id === homeId) : undefined;
      if (picked && (picked.stage < STAGES.length || picked.rented || s.rentedOut.includes(picked.id))) return toast('That house is rented out. Your tenant lives there now.');
      const house = picked ?? (homeId ? undefined : ownHouseOf(s));
      // Home is in the city its estate is in (the government house: the state you were born in). From another city you fly first.
      if (awayFrom(house ? estateCity(house.region) : homeId !== 'gov' && s.lease ? estateCity(s.lease.region) : s.homeState, 'Your house')) return;
      // Your own house: the ride across town to its estate's road, in at the gate, and the walk to the door.
      if (house) return rideToEstate(house.region, sectionOf(house.slot ?? 0), travelMode, carId, house.id);
      if (homeId !== 'gov' && s.lease && rentalHooks.enter) return rentalHooks.enter();
      if (s.origin === 'almajiri') return toast('No home yet. Build a house or choose one to live in from House.');
      if (!s.govRentOwed) get().moveIntoGovHouse();
      if (s.view === 'place' || s.view === 'estate') get().openMap();
      get().startPlace('home', travelMode, carId);
    },

    leaveHome() {
      const s = get();
      const house = s.properties.find((p) => p.id === (s.activeHouseId ?? s.homePropertyId));
      if (s.view !== 'home' || !house || jailed()) return;
      if (avatar.exhausted) return toast('You are too exhausted to move. Rest a little longer 😵');
      if (s.task) get().cancelTask();
      const no = sectionOf(house.slot ?? 0);
      estateHooks.onVisit?.(house.region, no);
      enterEstate(house.region, no, house.slot ?? 0);
    },

    arrest(until) {
      clearTimeout(walkOutTimer);
      set({ cellExit: null });
      const s = get();
      if (s.task) get().cancelTask();
      set({ jailedUntil: until, panel: null, placing: null, selectedId: null, placeId: null, shopId: null });
      // Caught inside someone's house: the visit ends here, and the cells replace the house on screen.
      const visiting = !!useVisit.getState().current;
      if (visiting) useVisit.setState({ current: null, returnSave: null });
      // Already behind bars (a longer sentence, or the game opening where you left it): you stay in the cell you're in.
      const here = !visiting && lockedIn() ? cellAt(avatarCell()) : -1;
      if (here >= 0) return set({ jailCell: here });
      // A free cell at the police station of the city you're in (game/cells.ts assignCells), shared when they're all taken.
      const cell = Math.min(CELLS.length - 1, Math.max(0, cellHooks.pick?.() ?? 0));
      resetAvatar(CELLS[cell].spot);
      avatar.yaw = Math.PI;
      set((st) => ({ view: 'place', insideId: CELLS_ID, jailCell: cell, estateId: null, mode: 'live', placeHubOpen: true, teleportId: st.teleportId + 1 }));
    },

    abduct(until) {
      const s = get();
      if (s.task) get().cancelTask();
      set({ heldUntil: until, panel: null, placing: null, selectedId: null, placeId: null, shopId: null });
      if (s.view === 'place' && s.insideId === 'camp') return;
      resetAvatar({ x: 7, z: 5 });
      avatar.yaw = Math.PI;
      set((st) => ({ view: 'place', insideId: 'camp', estateId: null, mode: 'live', placeHubOpen: false, teleportId: st.teleportId + 1 }));
    },

    hospitalize() {
      const s = get();
      if (s.task) get().cancelTask();
      set({ panel: null, placing: null, selectedId: null, placeId: null, shopId: null });
      if (s.view === 'place' && s.insideId === 'hospital') return;
      enterPlace('hospital');
    },

    seize(carId) {
      const s = get();
      const lost: string[] = [];
      // Phone: the one in your hand goes; you fall back to the cheapest you still own, else the free starter.
      const patch: Partial<GameState> = {};
      if (s.phone !== STARTER_ANDROID) {
        const left = s.ownedPhones.filter((id) => id !== s.phone && PHONE_BY_ID[id]);
        const cheapest = [...left].sort((a, b) => PHONE_BY_ID[a].price - PHONE_BY_ID[b].price)[0];
        if (cheapest) {
          patch.ownedPhones = left;
          patch.phone = cheapest;
        } else {
          patch.ownedPhones = [STARTER_ANDROID];
          patch.phone = STARTER_ANDROID;
          patch.freePhone = STARTER_ANDROID;
        }
        lost.push(`your ${PHONE_BY_ID[s.phone]?.name ?? 'phone'}`);
      }
      // Accessories: headwear, glasses, chains, watches and bags, owned and worn.
      const slots = new Set<string>(SEIZED_SLOTS);
      const kept = s.wardrobe.filter((id) => !slots.has(GARMENT_BY_ID[id]?.slot ?? ''));
      if (kept.length !== s.wardrobe.length) {
        patch.wardrobe = kept;
        const a = decodeLook(s.look);
        const outfit = { ...a.outfit };
        for (const slot of SEIZED_SLOTS) delete outfit[slot];
        patch.look = encodeLook({ ...a, outfit });
        lost.push('your accessories');
      }
      // The car they took you in.
      if (carId && s.ownedCars.includes(carId)) {
        patch.ownedCars = s.ownedCars.filter((id) => id !== carId);
        if (s.selectedCar === carId) patch.selectedCar = null;
        const { [carId]: _gone, ...condition } = s.carCondition;
        patch.carCondition = condition;
        const { [carId]: _tank, ...carFuel } = s.carFuel;
        patch.carFuel = carFuel;
        lost.push(`your ${CAR_BY_ID[carId]?.name ?? 'car'}`);
      }
      if (Object.keys(patch).length) set(patch);
      if (lost.length) toast(`🥾 The kidnappers kept ${lost.join(', ')}.`);
    },

    freed() {
      const s = get();
      set({ heldUntil: null });
      if (s.view !== 'place' || s.insideId !== 'camp') return;
      if (s.task) get().cancelTask();
      enterCity();
      if (get().destinationId === get().homeState) get().goHome();
    },

    release() {
      const s = get();
      // Seen live (the server said so while you sat in the cell) you are walked out; let go while you were away, you
      // simply start outside your cell.
      const live = !!s.jailedUntil;
      set({ jailedUntil: null, jailCell: null });
      if (s.cellExit || !lockedIn()) return;
      const cell = cellAt(avatarCell());
      if (s.task) get().cancelTask();
      if (live) return walkOut(cell);
      resetAvatar(CELLS[cell].outside);
      avatar.yaw = 0;
      set((st) => ({ placeHubOpen: false, teleportId: st.teleportId + 1 }));
    },

    cancelTask() {
      // Being walked out of a cell runs to the end (store.walkOut): only a new arrest stops it.
      if (get().cellExit) return;
      avatar.path = [];
      avatar.onArrive = null;
      // Snap back to the cell centre so the avatar is on the grid again.
      const c = avatarCell();
      avatar.x = c.x + 0.5;
      avatar.z = c.z + 0.5;
      finish(true);
    },

    orderFood(id) {
      const s = get();
      const f = FOOD_DELIVERY.find((x) => x.id === id);
      if (!f) return;
      if (s.money < f.price) return toast(`You need ${naira(f.price)}`);
      pay(-f.price, `Food delivery: ${f.name}`);
      set((st) => ({ deliveries: [...st.deliveries, { at: st.minutes + 40, name: f.name, icon: f.icon, hunger: f.hunger, fun: f.fun }] }));
      toast(`Order placed! ${f.icon} Rider go reach in ~40 mins`);
    },

    takeJob(id, city = cityMap(get().destinationId).id) {
      const s = get();
      const job = jobById(id);
      const place = workplaceOf(id, city);
      if (!job || !place) return;
      if (s.task?.actionId === 'work' && s.task.phase === 'doing') return toast('You are at work. Clock out first');
      if (s.knowledge < job.minKnowledge) return toast(`You need Knowledge ${job.minKnowledge} for this job. Study more 📚`);
      set({ jobId: id, jobCity: city, workDays: 0 });
      toast(`You got the job! ${job.title} at ${place.name}, ${regionOf(city).name}. Shift: ${shiftHours(job)}`);
    },
    quitJob() {
      const s = get();
      if (s.task?.actionId === 'work' && s.task.phase === 'doing') return toast('You are at work. Clock out first');
      set({ jobId: null, jobCity: null, workDays: 0 });
      toast('You resigned 😬');
    },
    clockOut() {
      const t = get().task;
      if (t?.actionId !== 'work' || t.phase !== 'doing') return;
      if (t.over) finish();
      else get().cancelTask();
    },

    startPlacing(type, inventoryItemId) {
      set({ placing: { type, rot: 0, inventoryItemId }, selectedId: null });
    },
    startMoving(id) {
      const it = get().items.find((i) => i.id === id);
      if (!it || ITEMS[it.type].fixed) return;
      set({ placing: { type: it.type, rot: it.rot, rotDeg: it.rotDeg, y: it.y, moveId: id }, selectedId: null, hover: { x: it.x, z: it.z } });
    },
    rotatePlacing() {
      // A free angle turns with it, a quarter at a time.
      set((s) => (s.placing ? { placing: { ...s.placing, rot: (s.placing.rot + 1) % 4, rotDeg: s.placing.rotDeg === undefined ? undefined : (s.placing.rotDeg + 90) % 360 } } : {}));
    },
    rotateItem(id) {
      if (decorHooks.turn) return decorHooks.turn([id], 90);
      const s = get();
      const it = s.items.find((i) => i.id === id);
      if (!it || ITEMS[it.type].fixed) return;
      const cand = { type: it.type, x: it.x, z: it.z, rot: (it.rot + 1) % 4 };
      const err = placementError(cand, s.items, avatarCell(), id, houseLayoutForState(s));
      if (err) return toast(err);
      set({ items: s.items.map((i) => (i.id === id ? { ...i, rot: cand.rot } : i)) });
    },
    paintItem(id, slot, colour) {
      const s = get();
      const it = s.items.find((i) => i.id === id);
      const slots = it && ITEM_PAINT[it.type];
      if (!it || !slots || !slots[slot] || (colour && !isColourRef(colour))) return;
      const paint = slots.map((_, i) => (i === slot ? colour : it.paint?.[i] ?? null));
      set({ items: s.items.map((i) => (i.id === id ? { ...i, paint: paint.some(Boolean) ? paint : undefined } : i)) });
    },
    paintWalls(part, colour) {
      if (colour && !isColourRef(colour)) return;
      const house = houseKeyOf(get());
      set((s) => {
        const next = { ...s.housePaint[house], [part]: colour ?? undefined };
        if (!next.outer) delete next.outer;
        if (!next.inner) delete next.inner;
        return { housePaint: { ...s.housePaint, [house]: next } };
      });
    },
    setFinish(change) {
      const s = get();
      if (!validValue(change.part, change.value)) return false;
      const layout = houseLayoutForState(s);
      const cost = finishCost(change, layout);
      if (cost > 0 && s.money < cost) {
        toast(`You need ${naira(cost)}`);
        return false;
      }
      const house = houseKeyOf(s);
      const next = applyFinish(s.houseFinish[house], change, layout);
      // Charged like building a wall: a plain spend the server books against the wallet.
      if (cost > 0) pay(-cost, finishLabel(change), 'spend', 'finish');
      set((st) => {
        const all = { ...st.houseFinish };
        if (Object.keys(next).length) all[house] = next;
        else delete all[house];
        return { houseFinish: all };
      });
      return true;
    },
    setLamp(id, light) {
      const clean = cleanLamp(light);
      if (!clean) return;
      set((s) => ({ items: s.items.map((i) => (i.id === id && LIGHTS[i.type] ? { ...i, light: clean } : i)) }));
    },
    storeItem(id) {
      const s = get();
      const it = s.items.find((i) => i.id === id);
      if (!it || ITEMS[it.type].fixed) return;
      if (s.task?.itemId === id) get().cancelTask();
      // What stands on it goes into storage with it.
      const kids = childrenOf(s.items, id);
      const gone = new Set([id, ...kids.map((k) => k.id)]);
      set({ items: s.items.filter((i) => !gone.has(i.id)), furnitureInventory: [...s.furnitureInventory, it, ...kids], selectedId: null });
      toast(`${ITEMS[it.type].name} stored 📦${kids.length ? ` with ${kids.length} thing${kids.length > 1 ? 's' : ''} on it` : ''}`);
    },
    setHover(hover) {
      const h = get().hover;
      if (h && hover && h.x === hover.x && h.z === hover.z) return;
      set({ hover });
    },
    placeAt(c) {
      const s = get();
      const p = s.placing;
      if (!p) return;
      // The editor knows the real spot (a wall, a table top, a free angle, a whole group); else the plain grid.
      const plan = decorHooks.plan?.(c) ?? null;
      const cand: Pose & { type: string } = plan?.cand ? { type: p.type, ...plan.cand } : { type: p.type, x: c.x, z: c.z, rot: p.rot };
      const err = plan ? plan.err : placementError(cand, s.items, avatarCell(), p.moveId, houseLayoutForState(s));
      if (err) return toast(err);
      if (plan?.items) {
        set({ items: plan.items, placing: null });
        return;
      }
      if (p.moveId) {
        set({ items: s.items.map((i) => (i.id === p.moveId ? tidy({ ...i, ...cand }) : i)), placing: null });
        return;
      }
      const def = ITEMS[p.type];
      if (p.inventoryItemId) {
        const stored = s.furnitureInventory.find((i) => i.id === p.inventoryItemId && i.type === p.type);
        if (!stored) return toast('That item is no longer in your furniture inventory.');
        set({
          items: [...s.items, tidy({ ...stored, ...cand })],
          furnitureInventory: s.furnitureInventory.filter((i) => i.id !== stored.id),
          placing: null,
        });
        return;
      }
      if (s.money < def.price) return toast(`You need ${naira(def.price)}`);
      pay(-def.price, `Bought ${def.name}`, 'buy', def.type);
      set({ items: [...get().items, tidy({ id: newId(), ...cand, paint: p.paint })] });
      // Keep placing more of the same unless they can't afford another.
      if (get().money < def.price) set({ placing: null });
    },
    cancelPlacing() {
      set({ placing: null });
    },
    sell(id) {
      const s = get();
      const it = s.items.find((i) => i.id === id);
      if (!it) return;
      const def = ITEMS[it.type];
      if (def.fixed || it.stolen) return;
      if (s.task?.itemId === id) get().cancelTask();
      const value = Math.round(def.price * 0.5);
      // What stood on it is kept, in storage.
      const kids = childrenOf(get().items, id);
      const kidIds = new Set(kids.map((k) => k.id));
      set((st) => ({ items: st.items.filter((i) => i.id !== id && !kidIds.has(i.id)), furnitureInventory: kids.length ? [...st.furnitureInventory, ...kids] : st.furnitureInventory, selectedId: null }));
      pay(value, `Sold ${def.name}`, 'sell', def.type);
    },

    buyInvestment(id, qty = 1) {
      const inv = INVESTMENT_BY_ID[id];
      if (!inv || !Number.isInteger(qty) || qty < 1 || qty > MAX_TRADE_UNITS) return;
      const s = get();
      const price = priceOf(inv) * qty;
      if (s.money < price) {
        return toast(`You need ${naira(price)} to invest in ${inv.title}`);
      }
      // One money event for the lot: the server counts the units from `qty` (worker/wallet.ts).
      pay(-price, `Invest: ${inv.title}${qty > 1 ? ` × ${qty}` : ''}`, 'spend', inv.id, qty > 1 ? qty : undefined);
      const current = s.investments[id] ?? { id, units: 0 };
      set({
        investments: {
          ...s.investments,
          [id]: {
            ...current,
            units: current.units + qty,
            cost: paidFor(inv, current) + price,
          },
        },
      });
      toast(qty > 1 ? `Bought ${qty} units of ${inv.title}! 📈` : `Invested in ${inv.title}! 📈`);
    },

    sellInvestment(id, qty = 1) {
      const inv = INVESTMENT_BY_ID[id];
      const s = get();
      const current = s.investments[id];
      if (!inv || !current || !Number.isInteger(qty) || qty < 1 || qty > MAX_TRADE_UNITS || current.units < qty) return;
      const units = `${qty} unit${qty > 1 ? 's' : ''}`;
      const refund = Math.round(priceOf(inv) * LIQUIDATION_FACTOR) * qty;
      pay(refund, `Sold ${units} of ${inv.title}`, 'invest', inv.id, qty > 1 ? qty : undefined);
      const nextUnits = current.units - qty;
      // Each unit sold carries the average price paid for the units held.
      const cost = paidFor(inv, current);
      const paid = Math.round((cost / current.units) * qty);
      const gain = refund - paid;
      set({
        investments: {
          ...s.investments,
          [id]: {
            ...current,
            units: nextUnits,
            cost: nextUnits > 0 ? cost - paid : 0,
            realized: (current.realized ?? 0) + gain,
          },
        },
      });
      toast(`Sold ${units} of ${inv.title} for ${naira(refund)} · ${gain >= 0 ? 'profit' : 'loss'} ${naira(Math.abs(gain))} ${gain >= 0 ? '📈' : '📉'}`);
    },

    buyCar(id) {
      const car = CAR_BY_ID[id];
      if (!car) return;
      const s = get();
      if (s.ownedCars?.includes(id)) return toast('You already own this vehicle!');
      if (s.money < car.price) return toast(`You need ${naira(car.price)} for this car`);
      pay(-car.price, `Bought ${car.name}`, 'buy', car.id);
      set({
        ownedCars: [...(s.ownedCars ?? []), id],
        selectedCar: id,
        carCondition: { ...s.carCondition, [id]: newCondition() },
      });
      audio.honk();
      toast(`Congratulations! ${car.name} parked in your compound 🚗`);
    },

    buyJet(id) {
      const jet = JET_BY_ID[id];
      if (!jet) return;
      const s = get();
      if (s.ownedJets.includes(id)) return toast('You already own this jet!');
      if (s.money < jet.price) return toast(`You need ${naira(jet.price)} for this jet`);
      pay(-jet.price, `Bought ${jet.name}`, 'buy', jet.id);
      // It is delivered with a full tank.
      set({ ownedJets: [...s.ownedJets, id], carFuel: { ...s.carFuel, [id]: JET_FUEL.tank } });
      toast(`Congratulations! ${jet.name} is waiting at the airport 🛩️`);
    },

    refuelJet(id) {
      const jet = JET_BY_ID[id];
      const s = get();
      if (!jet || !s.ownedJets.includes(id)) return;
      const cost = jetRefuelCost(s.carFuel, id);
      if (cost <= 0) return toast('The tank is already full.');
      if (s.money < cost) return toast(`You need ${naira(cost)} of aviation fuel to fill the ${jet.name}`);
      pay(-cost, `Aviation fuel for ${jet.name}`);
      set((st) => ({ carFuel: { ...st.carFuel, [id]: JET_FUEL.tank } }));
      toast(`⛽ ${jet.name} refuelled: ${JET_FUEL.tank} flights in the tank.`);
    },

    serviceJet(id) {
      const jet = JET_BY_ID[id];
      const s = get();
      if (!jet || !s.ownedJets.includes(id)) return;
      const cost = jetServiceCost(s.jetWear, id);
      if (cost <= 0) return toast('The engineers say it is fresh from its last service.');
      if (s.money < cost) return toast(`You need ${naira(cost)} to service the ${jet.name}`);
      pay(-cost, `Serviced ${jet.name}`);
      set((st) => ({ jetWear: { ...st.jetWear, [id]: 0 } }));
      toast(`🔧 ${jet.name} serviced and signed off.`);
    },

    sellJet(id) {
      const jet = JET_BY_ID[id];
      const s = get();
      if (!jet || !s.ownedJets.includes(id)) return;
      const refund = jetResale(id);
      pay(refund, `Sold ${jet.name}`, 'sell', jet.id);
      const { [id]: _sold, ...jetWear } = s.jetWear;
      set({ ownedJets: s.ownedJets.filter((j) => j !== id), jetWear });
      toast(`Sold ${jet.name} for ${naira(refund)} 💸`);
    },

    selectCar(id) {
      const s = get();
      if (!s.ownedCars?.includes(id)) return;
      set({ selectedCar: id });
      audio.honk();
      toast(`Switched active car to ${CAR_BY_ID[id]?.name ?? 'vehicle'} 🚗`);
    },

    sellCar(id) {
      const car = CAR_BY_ID[id];
      const s = get();
      if (!car || !s.ownedCars?.includes(id)) return;
      const refund = resaleOf(id, conditionOf(s.carCondition, id));
      const nextOwned = s.ownedCars.filter((c) => c !== id);
      const { [id]: _sold, ...carCondition } = s.carCondition ?? {};
      const { [id]: _tank, ...carFuel } = s.carFuel ?? {};
      pay(refund, `Sold ${car.name}`, 'sell', car.id);
      set({
        ownedCars: nextOwned,
        carCondition,
        carFuel,
        selectedCar: s.selectedCar === id ? (nextOwned[0] ?? null) : s.selectedCar,
      });
      toast(`Sold ${car.name} for ${naira(refund)} 💸`);
    },

    buyPhone(id) {
      // Mobile has no hand preview: pop the phone open so the new device is actually seen.
      const showNewPhone = () => {
        if (typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches) set({ panel: 'phone' });
      };
      const ph = PHONE_BY_ID[id];
      if (!ph) return;
      const s = get();
      if (s.ownedPhones.includes(id) && s.freePhone !== id) return toast('You already get this phone.');
      if (s.money < ph.price) return toast(`You need ${naira(ph.price)} for the ${ph.name}`);
      pay(-ph.price, `Bought ${ph.name}`, 'buy', id);
      set({ ownedPhones: [...new Set([...s.ownedPhones, id])], phone: id, freePhone: s.freePhone === id ? null : s.freePhone });
      showNewPhone();
      toast(`New phone! ${ph.name} dey your hand now 📱`);
    },

    usePhone(id) {
      const showNewPhone = () => {
        if (typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches) set({ panel: 'phone' });
      };
      const s = get();
      if (!s.ownedPhones.includes(id)) return;
      set({ phone: id });
      showNewPhone();
      toast(`Switched to your ${PHONE_BY_ID[id]?.name ?? 'phone'} 📱`);
    },

    sellPhone(id) {
      const ph = PHONE_BY_ID[id];
      const s = get();
      if (!ph || !s.ownedPhones.includes(id)) return;
      if (s.phone === id) return toast('Switch to another phone before you sell this one.');
      if (s.freePhone === id) return toast('Nobody go buy free network phone. Keep am as backup.');
      const refund = Math.round(ph.price * PHONE_RESALE_FACTOR);
      pay(refund, `Sold ${ph.name}`, 'sell', id);
      set({ ownedPhones: s.ownedPhones.filter((p) => p !== id) });
      toast(`Sold ${ph.name} for ${naira(refund)} 💸`);
    },

    cruiseCar() {
      const s = get();
      const carId = s.selectedCar ?? s.ownedCars?.[0];
      const car = carId ? CAR_BY_ID[carId] : null;
      if (!car) return toast('You need a car to go on a cruise! Open KD Autos.');
      if (!driveOff(car.id)) return;
      audio.honk();
      // No AC or a bad suspension takes the fun out of it.
      const c = conditionOf(get().carCondition, car.id);
      const bonus = Math.round((car.funBonus ?? 25) * (c.parts.ac <= 0 ? 0.5 : 1) * (c.parts.suspension < 30 ? 0.7 : 1));
      set((st) => ({
        minutes: st.minutes + 45,
        needs: {
          ...st.needs,
          fun: Math.min(100, st.needs.fun + bonus),
          social: Math.min(100, st.needs.social + 15),
        },
      }));
      toast(`Cruised round ${regionOf(get().destinationId).name} in your ${car.name}! 💨 +${bonus} Fun`);
    },

    repairCar(id, part) {
      const s = get();
      const car = CAR_BY_ID[id];
      if (!car || !s.ownedCars.includes(id)) return;
      const c = conditionOf(s.carCondition, id);
      const parts = part === 'all' ? PART_IDS.filter((p) => c.parts[p] < 100) : [part];
      const cost = parts.reduce((sum, p) => sum + repairCost(id, c, p), 0);
      if (!cost) return toast('Nothing to fix. The car is in good shape ✨');
      if (s.money < cost) return toast(`The mechanic wants ${naira(cost)} for that`);
      const label = part === 'all' ? 'full service' : PARTS[part].label.toLowerCase();
      pay(-cost, `Mechanic: ${car.name} ${label}`, 'spend', `repair:${id}`);
      const fixed = { ...c, parts: { ...c.parts, ...Object.fromEntries(parts.map((p) => [p, 100])) } };
      set((st) => ({ carCondition: { ...st.carCondition, [id]: fixed } }));
      toast(`🔧 Mechanic fixed the ${label} on your ${car.name} for ${naira(cost)}`);
    },

    damageCar(id, part, amount, why) {
      const s = get();
      if (!s.ownedCars.includes(id)) return;
      const next = damage(conditionOf(s.carCondition, id), part, amount);
      set((st) => ({ carCondition: { ...st.carCondition, [id]: next } }));
      if (why) toast(why);
    },

    buyLand(regionId, plot, wanted) {
      const region = REGION_BY_ID[regionId];
      if (!region || !PLOTS[plot]) return;
      const price = landPrice(region, plot);
      if (get().money < price) return toast(`You need ${naira(price)} for land in ${region.name}`);
      const id = newId();
      // A local slot for now; signed-in players get theirs from the server so neighbours don't overlap.
      const taken = new Set([...get().properties.filter((p) => p.region === regionId).map((p) => p.slot), ...(estateHooks.slots?.(regionId) ?? [])]);
      if (wanted !== undefined && taken.has(wanted)) return toast('Someone just took that plot. Pick another one');
      let slot = wanted ?? 0;
      while (wanted === undefined && taken.has(slot)) slot++;
      pay(-price, `Land: ${PLOTS[plot].label}, ${region.name}`, 'spend', propRef(id, 'land'));
      set((s) => ({
        properties: [...s.properties, { id, region: regionId, plot, design: null, stage: 0, building: null, constructionPlan: null, stock: {}, boughtAt: s.minutes, spent: price, rented: false, rentFrom: s.minutes, slot, ...(wanted !== undefined ? { chosenSlot: wanted } : {}), items: [] }],
      }));
      toast(`📜 You don buy ${PLOTS[plot].label.toLowerCase()} for ${region.name}! Pick a design to start building`);
    },

    chooseDesign(propertyId, designId) {
      const p = get().properties.find((x) => x.id === propertyId);
      const design = DESIGN_BY_ID[designId];
      if (!p || !design || p.stage > 0 || p.building) return;
      set((s) => ({ properties: s.properties.map((x) => (x.id === propertyId ? { ...x, design: designId } : x)) }));
    },

    buyMaterials(propertyId, materialId) {
      const p = get().properties.find((x) => x.id === propertyId);
      if (!p) return;
      const missing = missingMaterials(p);
      const order = materialId ? (missing[materialId] ? { [materialId]: missing[materialId] } : {}) : missing;
      const ids = Object.keys(order);
      if (!ids.length) return;
      const cost = ids.reduce((a, id) => a + materialPrice(id, p.region, p.design) * order[id], 0);
      if (get().money < cost) return toast(`You need ${naira(cost)} for the materials`);
      const label = ids.length === 1 ? `${order[ids[0]]} × ${MATERIAL_BY_ID[ids[0]].name}` : 'Building materials';
      pay(-cost, label, 'spend', propRef(p.id, 'mat'));
      set((s) => ({
        properties: s.properties.map((x) => {
          if (x.id !== propertyId) return x;
          const stock = { ...x.stock };
          for (const id of ids) stock[id] = (stock[id] ?? 0) + order[id];
          return { ...x, stock, spent: x.spent + cost };
        }),
      }));
      toast(ids.length === 1 ? `🚚 ${MATERIAL_BY_ID[ids[0]].name} delivered to site` : '🚚 Materials delivered to site');
    },

    startConstruction(propertyId, contractorId) {
      const s = get();
      const p = s.properties.find((x) => x.id === propertyId);
      const c = CONTRACTOR_BY_ID[contractorId];
      const design = p?.design ? DESIGN_BY_ID[p.design] : null;
      if (!p || !c || !design || p.stage >= STAGES.length || p.building) return;
      const materialsNeeded = remainingStageMaterials(design, p.stage);
      const missing: Record<string, number> = {};
      for (const [id, amount] of Object.entries(materialsNeeded)) {
        missing[id] = Math.max(0, amount - (p.stock[id] ?? 0));
      }
      const materialOrder = Object.fromEntries(Object.entries(missing).filter(([, amount]) => amount > 0));
      const materialCost = costOf(materialOrder, p.region, p.design);
      const labourByStage = STAGES.slice(p.stage).map((stage) => ({ stage, fee: stageLabour(design, stage, c, p.region) }));
      const totalCost = materialCost + labourByStage.reduce((total, item) => total + item.fee, 0);
      if (s.money < totalCost) return toast(`You need ${naira(totalCost)} to pay for the full build`);
      if (materialCost > 0) {
        pay(-materialCost, `All materials: ${design.name}`, 'spend', propRef(p.id, 'mat'));
      }
      for (const { stage, fee } of labourByStage) {
        pay(-fee, `${c.name}: ${stage.name}`, 'spend', propRef(p.id, 'labour'));
      }
      const stock = { ...p.stock };
      for (const [id, n] of Object.entries(materialsNeeded)) stock[id] = Math.max(0, (stock[id] ?? 0) - n);
      const firstStage = STAGES[p.stage];
      const startedAt = s.minutes;
      set((st) => ({
        properties: st.properties.map((x) =>
          x.id === propertyId
            ? {
                ...x,
                stock,
                spent: x.spent + totalCost,
                constructionPlan: { contractor: c.id },
                building: { contractor: c.id, startedAt, doneAt: startedAt + stageMinutes(design, firstStage, c) },
              }
            : x,
        ),
      }));
      toast(`${c.icon} ${c.name} don start your full build. All ${STAGES.length - p.stage} stages are paid for and will finish automatically`);
    },

    hopToHouse(propertyId) {
      const s = get();
      const here = s.properties.find((p) => p.id === (s.activeHouseId ?? s.homePropertyId));
      const next = s.properties.find((p) => p.id === propertyId);
      if (s.view !== 'home' || !here || !next || next.id === here.id || useVisit.getState().current) return false;
      if (next.region !== here.region || sectionOf(next.slot ?? 0) !== sectionOf(here.slot ?? 0)) return false;
      if (next.stage < STAGES.length || next.rented || s.rentedOut.includes(next.id)) return false;
      if (s.task) get().cancelTask();
      // Same estate: out of one gate and in at the next, no ride needed.
      enterHome(next.id);
      toast(`🏠 ${houseTitle(next)}`);
      return true;
    },

    renameProperty(propertyId, name) {
      const clean = cleanHouseName(name);
      if (!get().properties.some((p) => p.id === propertyId)) return;
      set((s) => ({
        properties: s.properties.map((p) => {
          if (p.id !== propertyId) return p;
          const { name: _old, ...rest } = p;
          return clean ? { ...rest, name: clean } : rest;
        }),
      }));
      toast(clean ? `🏷️ Named it “${clean}”` : '🏷️ Name cleared');
    },

    changeExterior(propertyId, patch) {
      const s = get();
      const p = s.properties.find((x) => x.id === propertyId);
      if (!p || p.stage < STAGES.length) return toast('Finish building the house first.');
      const now = exteriorOf(p.design, p.exterior);
      if (patch.items?.includes('pool') && p.plot === 'half' && !now.items.includes('pool')) return toast('A pool needs a full or double plot.');
      const cost = exteriorChangeCost(p.design, now, patch);
      if (s.money < cost) return toast(`You need ${naira(cost)} for that`);
      // Charged like furniture and paint indoors: everyday spending, not money sunk into the property's value.
      if (cost) pay(-cost, `Outside work: ${houseTitle(p)}`, 'spend', 'exterior');
      set((st) => ({ properties: st.properties.map((x) => (x.id === propertyId ? { ...x, exterior: { ...x.exterior, ...patch } } : x)) }));
      toast(cost ? `🧰 Done for ${naira(cost)}` : '🧰 Done');
    },

    startExtension(propertyId, extId, contractorId) {
      const s = get();
      const p = s.properties.find((x) => x.id === propertyId);
      const c = CONTRACTOR_BY_ID[contractorId];
      const def = EXTENSION_BY_ID[extId];
      const design = p ? extensionDesign(p.design, extId) : null;
      if (!p || !c || !def || !design || p.stage < STAGES.length) return;
      if (p.building || p.extending) return toast('The builders are already on site.');
      const block = extensionBlock(def, p.design, p.extensions ?? [], exteriorOf(p.design, p.exterior).roof);
      if (block) return toast(block);
      const materials = remainingStageMaterials(design, 0);
      const materialCost = costOf(materials, p.region, p.design);
      const labour = STAGES.map((stage) => ({ stage, fee: stageLabour(design, stage, c, p.region) }));
      const total = materialCost + labour.reduce((a, l) => a + l.fee, 0);
      if (s.money < total) return toast(`You need ${naira(total)} for the ${def.name.toLowerCase()}`);
      // Property refs: the server books it into what the house cost, so it counts when the house is sold.
      pay(-materialCost, `Materials: ${def.name}`, 'spend', propRef(p.id, 'mat'));
      for (const { stage, fee } of labour) pay(-fee, `${c.name}: ${def.name} ${stage.name.toLowerCase()}`, 'spend', propRef(p.id, 'labour'));
      const startedAt = s.minutes;
      set((st) => ({
        properties: st.properties.map((x) => x.id === propertyId ? {
          ...x,
          spent: x.spent + total,
          extending: { id: extId, stage: 0 },
          constructionPlan: { contractor: c.id },
          building: { contractor: c.id, startedAt, doneAt: startedAt + stageMinutes(design, STAGES[0], c) },
        } : x),
      }));
      toast(`${c.icon} ${c.name} don start your ${def.name.toLowerCase()}. You can stay in the house meanwhile`);
    },

    setRoom(propertyId, room, setting) {
      const p = get().properties.find((x) => x.id === propertyId);
      if (!p || room.length > 40) return;
      const next = cleanRooms({ ...p.rooms, [room]: setting });
      set((s) => ({ properties: s.properties.map((x) => (x.id === propertyId ? { ...x, rooms: next } : x)) }));
    },

    setHomeProperty(propertyId) {
      const s = get();
      const p = s.properties.find((x) => x.id === propertyId);
      if (!p || p.stage < STAGES.length) return toast('Finish building the house before moving in.');
      if (p.rented && rentDue(p, s.minutes).amount > 0) get().collectRent();
      const latest = get();
      const properties = latest.view === 'home' && latest.activeHouseId
        ? latest.properties.map((property) => property.id === latest.activeHouseId ? { ...property, items: latest.items } : property)
        : latest.properties;
      const target = properties.find((property) => property.id === propertyId);
      set({
        homePropertyId: propertyId,
        activeHouseId: latest.view === 'home' ? propertyId : latest.activeHouseId,
        items: latest.view === 'home' ? target?.items ?? [] : latest.items,
        properties: properties.map((x) => x.id === propertyId ? { ...x, rented: false, rentFrom: latest.minutes } : x),
      });
      toast(`🏠 ${DESIGN_BY_ID[p.design ?? '']?.name ?? 'Your house'} in ${REGION_BY_ID[p.region]?.name ?? 'Kaduna'} is now your home`);
      // Player now owns their home — stop charging government rent.
      if (get().govRentOwed > 0) get().clearGovRent('🏠 You moved into your own house. No more government rent!');
    },

    hireHouseholdStaff(propertyId, role) {
      const s = get();
      const property = s.properties.find((x) => x.id === propertyId);
      const staffDef = HOUSEHOLD_STAFF[role];
      if (!property || property.stage < STAGES.length || property.rented) return;
      if (!staffDef) return;
      if (property.staff?.some((member) => member.role === role)) return toast(`You already hired a ${staffDef.name.toLowerCase()}.`);
      if (s.money < staffDef.wage) return toast(`You need ${naira(staffDef.wage)} for the first day of wages.`);
      pay(-staffDef.wage, `${staffDef.name} first-day wages`);
      set((state) => ({
        properties: state.properties.map((x) =>
          x.id === propertyId
            ? { ...x, staff: [...(x.staff ?? []), { role, paidThrough: dayOf(state.minutes) }] }
            : x,
        ),
      }));
      toast(`${staffDef.icon} Hired a ${staffDef.name.toLowerCase()} for ${naira(staffDef.wage)}/day.`);
    },

    dismissHouseholdStaff(propertyId, role) {
      const staffDef = HOUSEHOLD_STAFF[role];
      set((s) => ({
        properties: s.properties.map((property) =>
          property.id === propertyId
            ? { ...property, staff: property.staff?.filter((member) => member.role !== role) }
            : property,
        ),
      }));
      toast(`${staffDef.name} dismissed.`);
    },

    hirePersonalStaff(role, propertyId) {
      const s = get();
      const staffDef = HOUSEHOLD_STAFF[role];
      if (!staffDef || !staffDef.personal) return;
      if (s.personalStaff.some((m) => m.role === role)) return toast(`You already have a ${staffDef.name.toLowerCase()}.`);
      if (!staffHouses(s).some((h) => h.id === propertyId)) return toast('Pick one of your houses for them to work from.');
      if (s.money < staffDef.wage) return toast(`You need ${naira(staffDef.wage)} for the first day of wages.`);
      pay(-staffDef.wage, `${staffDef.name} first-day wages`);
      set((state) => ({ personalStaff: [...state.personalStaff, { role, paidThrough: dayOf(state.minutes), propertyId }] }));
      toast(`${staffDef.icon} ${staffDef.name} hired for ${naira(staffDef.wage)}/day.`);
    },

    dismissPersonalStaff(role) {
      const staffDef = HOUSEHOLD_STAFF[role];
      set((s) => ({ personalStaff: s.personalStaff.filter((m) => m.role !== role) }));
      toast(`${staffDef.name} dismissed.`);
    },

    assignPersonalStaff(role, propertyId) {
      const s = get();
      const house = staffHouses(s).find((h) => h.id === propertyId);
      if (!house) return;
      set({ personalStaff: s.personalStaff.map((m) => (m.role === role ? { ...m, propertyId } : m)) });
      toast(`${HOUSEHOLD_STAFF[role].icon} ${HOUSEHOLD_STAFF[role].name} now works at ${house.name}.`);
    },

    clearGovRent(message = '🏠 You moved out of the government house. No more government rent!') {
      set({ govRentOwed: 0 });
      toast(message);
    },

    moveIntoGovHouse(city) {
      const s = get();
      if (!GOV_WEEKLY_RENT[s.origin]) return;
      const to = getRegion(city ?? s.homeState)?.id ?? s.homeState;
      const moving = s.govRentOwed > 0;
      if (moving && to === s.homeState) return;
      if (s.lease) return toast('End your lease first.');
      if (s.task) get().cancelTask();
      // Standing in the government house you are leaving: out to the street first.
      if (moving && s.view === 'home' && houseKeyOf(s) === STARTER_HOUSE) get().openMap();
      // Moving across keeps the rent week running, so a move is never a way round paying.
      set({ homeState: to, govRentOwed: GOV_WEEKLY_RENT[s.origin]!, govRentPaidThrough: moving ? s.govRentPaidThrough : dayOf(s.minutes) });
      const weekly = naira(govRentIn(to));
      toast(moving
        ? `🚚 Moved to a government house in ${regionOf(to).name}. Your things went ahead of you. Rent there is ${weekly} a week.`
        : `🏚️ You moved into a government house in ${regionOf(to).name}. Rent is ${weekly} a week.`);
    },

    setRented(propertyId, rented) {
      const s = get();
      const p = s.properties.find((x) => x.id === propertyId);
      if (!p || p.stage < STAGES.length || p.rented === rented) return;
      if (rented && s.homePropertyId === propertyId) return toast('Choose another home before renting this house.');
      if (rented && p.staff?.length) return toast('Dismiss your household staff before renting this property.');
      if (!rented && rentDue(p, s.minutes).amount > 0) get().collectRent();
      set((st) => ({ properties: st.properties.map((x) => (x.id === propertyId ? { ...x, rented, rentFrom: st.minutes } : x)) }));
      toast(rented ? '🔑 Tenants don pack in. Rent go dey come every day' : 'Tenants don pack out');
    },

    collectRent() {
      const s = get();
      let total = 0;
      const properties = s.properties.map((p) => {
        const due = rentDue(p, s.minutes);
        if (!due.amount) return p;
        total += due.amount;
        pay(due.amount, `Rent: ${DESIGN_BY_ID[p.design!].name}, ${REGION_BY_ID[p.region].name}`, 'property', propRef(p.id, 'rent'));
        return { ...p, rentFrom: p.rentFrom + due.days * DAY };
      });
      if (!total) return toast('No rent due yet. Tenants pay per full day 🗓️');
      set({ properties });
      toast(`🏠 Collected ${naira(total)} rent`);
    },

    sellProperty(propertyId) {
      const s = get();
      const p = s.properties.find((x) => x.id === propertyId);
      if (!p) return;
      if (p.building) return toast('Wait for the contractor to finish this stage first');
      if (rentDue(p, s.minutes).amount > 0) get().collectRent();
      const value = saleValue(p);
      pay(value, `Sold property in ${REGION_BY_ID[p.region].name}`, 'property', propRef(p.id, 'sell'));
      set((st) => ({ properties: st.properties.filter((x) => x.id !== propertyId) }));
      toast(`🤝 Property sold for ${naira(value)}`);
    },

    visitEstate(regionId, no, travelMode, carId) {
      const s = get();
      const region = REGION_BY_ID[regionId];
      if (!region || jailed() || awayFrom(region.city, region.name)) return;
      if (avatar.exhausted) return toast('You are too exhausted to travel. Rest a little longer 😵');
      // No mode given (older callers): your selected car if you have one, otherwise a keke.
      const mode: TravelMode = travelMode ?? (s.selectedCar && CAR_BY_ID[s.selectedCar] ? 'car' : 'keke');
      const carToUse = mode === 'car' ? carId ?? s.selectedCar ?? undefined : undefined;
      const mine = s.properties.find((p) => p.region === regionId);
      rideToEstate(regionId, no ?? (mine ? sectionOf(mine.slot ?? 0) : 0), mode, carToUse);
    },

    gotoEstate(no) {
      const s = get();
      if (s.view !== 'estate' || !s.estateId || no < 0 || no === s.estateNo) return;
      if (s.task) get().cancelTask();
      estateHooks.onVisit?.(s.estateId, no);
      enterEstate(s.estateId, no);
    },

    enterOwnHouse(propertyId) {
      const s = get();
      const p = s.properties.find((x) => x.id === propertyId);
      if (!p || s.view !== 'estate' || s.estateId !== p.region || sectionOf(p.slot ?? 0) !== s.estateNo) return;
      if (p.stage < STAGES.length) return toast('The house never finish. Wait for the builders 🚧');
      const r = houseRect(p.slot ?? 0, p.plot);
      const door = { x: Math.floor((r.x0 + r.x1) / 2), z: r.z1 };
      const path = estatePath(avatarCell(), door, estateLots(p.region), estateRows(p.region));
      if (!path) return toast("Can't find a way to your gate");
      if (s.task) finish(true);
      const goIn = () => {
        set({ task: null, estateId: null });
        enterHome(propertyId);
        toast('🏠 Welcome home');
      };
      avatar.path = path;
      avatar.onArrive = goIn;
      set({ task: { itemId: null, actionId: 'walk', label: 'Going home', icon: '🏠', phase: 'walking', remaining: 0, total: 0 }, selectedId: null });
      if (!path.length) goIn();
    },

    payFor(amount, label) {
      if (get().money < amount) {
        toast(`You need ${naira(amount)} for that.`);
        return false;
      }
      pay(-amount, label);
      return true;
    },

    pumpWater() {
      const s = get();
      if (s.view !== 'home') return toast('Go back to your compound to use the water pump.');
      if (s.waterTank >= 100) return toast('The overhead tank is already full.');
      if (!isPowered(s)) return toast('No electricity to run the pump. Wait for NEPA or call Mai Ruwa.');
      set({ waterTank: Math.min(100, s.waterTank + 50) });
      toast('Water pumped into the GP tank while the light is on 💧');
    },

    orderWater() {
      const s = get();
      if (s.waterTank >= 100) return toast('The overhead tank is already full.');
      if (s.money < 2_000) return toast(`Mai Ruwa needs ${naira(2_000)} for ten jerrycans.`);
      pay(-2_000, 'Mai Ruwa — 10 jerrycans');
      set((state) => ({ waterTank: Math.min(100, state.waterTank + 50) }));
      toast('Mai Ruwa delivered ten yellow jerrycans. The tank is filling! 🛢️');
    },

    openShop(id) {
      set({ shopId: id, panel: null });
    },

    buyGarment(id) {
      const s = get();
      const gm = GARMENT_BY_ID[id];
      if (!gm || s.wardrobe.includes(id)) return;
      if (s.money < gm.price) return toast(`You need ${naira(gm.price)} for the ${gm.name}`);
      pay(-gm.price, gm.name, 'spend', id);
      set({ wardrobe: [...s.wardrobe, id] });
      if (fits(gm, decodeLook(s.look).body)) get().wear(id);
      toast(`🛍️ You bought the ${gm.name}`);
    },

    wear(id) {
      const s = get();
      const gm = GARMENT_BY_ID[id];
      const a = decodeLook(s.look);
      if (!gm || !s.wardrobe.includes(id) || !fits(gm, a.body)) return;
      const outfit = { ...a.outfit, [gm.slot]: id };
      // A dress or abaya is the whole outfit; putting on a bottom swaps it for the last normal top.
      if (gm.slot === 'top' && isFullOutfit(id)) delete outfit.bottom;
      if (gm.slot === 'bottom' && isFullOutfit(outfit.top)) {
        outfit.top = s.wardrobe.find((w) => GARMENT_BY_ID[w]?.slot === 'top' && !isFullOutfit(w) && fits(GARMENT_BY_ID[w], a.body));
      }
      set({ look: encodeLook({ ...a, outfit }) });
    },

    takeOff(slot) {
      const a = decodeLook(get().look);
      // You can't walk around town without a top, bottom... or shoes, at least not in this game.
      if (slot === 'top' || (slot === 'bottom' && !isFullOutfit(a.outfit.top))) return toast('Abeg, put something else on first 😅');
      const outfit = { ...a.outfit };
      delete outfit[slot];
      set({ look: encodeLook({ ...a, outfit }) });
    },

    bump(key, by = 1, max = false) {
      set((s) => {
        const cur = s.stats[key] ?? 0;
        const next = max ? Math.max(cur, by) : cur + by;
        return next === cur ? s : { stats: { ...s.stats, [key]: next } };
      });
    },

    charge(amount, label, ref) {
      const paid = Math.max(0, Math.round(amount));
      if (paid > 0) pay(-paid, label, 'spend', ref);
      return paid;
    },

    earn(gig, amount, label) {
      const want = Math.max(0, Math.min(GIGS[gig].max, Math.round(amount)));
      // The server takes back anything past the gig's hourly limit (game/gigs.ts), so it is never paid here either.
      const paid = Math.min(want, gigRoom(gig));
      if (want > 0 && paid < want) toast(`⏳ ${GIGS[gig].label}: that’s the most it pays in an hour. Try another hustle for now`);
      if (paid > 0) {
        noteGig(gig, paid);
        pay(paid, label, 'gig', gig);
      }
      return paid;
    },

    maybeStory(chance) {
      const s = get();
      if (s.streetStory || !s.started || Math.random() >= chance) return;
      const story = pickStreetStory(Math.random(), {
        notoriety: s.notoriety,
        goodDeeds: s.goodDeeds,
        hour: hourOf(s.minutes),
        hasCar: s.ownedCars.length > 0,
        money: s.money,
        event: activeEvent(Date.now(), s.destinationId),
        city: s.destinationId,
        inOffice: !!heldOffice(),
        driving: !!driveState.vehicle,
        vehicle: driveState.vehicle,
        roadEvent: activeRoadEvent(),
        high: isHighNow(),
        recent: s.recentStories,
      });
      set({ streetStory: story, recentStories: [story.id, ...s.recentStories.filter((id) => id !== story.id)].slice(0, RECENT_STORIES) });
    },

    buyFuel(black) {
      const s = get();
      if (!black && activeEvent() === 'fuel') return toast('⛽ The filling stations are dry. Only the black market has fuel now');
      if (s.fuelCans >= FUEL.maxCans) return toast(`Your store only holds ${FUEL.maxCans} jerrycans`);
      const price = black ? blackMarketPrice() : fuelPrice();
      if (s.money < price) return toast(`You need ${naira(price)} for a jerrycan`);
      pay(-price, black ? 'Black-market fuel (25L)' : 'Fuel, 25L jerrycan');
      set((st) => ({ fuelCans: st.fuelCans + 1 }));
      get().bump(black ? 'fuelStolen' : 'fuelBought');
      if (black && Math.random() < FUEL.raidChance) {
        const fine = Math.min(FUEL.raidFine, Math.max(0, Math.floor(get().money)));
        if (fine > 0) pay(-fine, 'Police raid on the fuel boys');
        set((st) => ({ fuelCans: Math.max(0, st.fuelCans - 1), notoriety: st.notoriety + 1 }));
        return toast(`🚔 Police raid! The jerrycan was seized and you paid ${naira(fine)} to walk away.`);
      }
      toast(black ? '🛢️ The boys filled your can from a “leaking” pipe. Don’t ask questions.' : '⛽ Jerrycan filled. Smell of petrol is now your perfume.');
    },

    pourFuel() {
      const s = get();
      if (s.fuelCans <= 0) return toast('No fuel in store. Buy a jerrycan first');
      const gen = generatorOf(s.items);
      if (!gen) return toast('You don’t have a generator');
      if (s.power.genFuel >= 100) return toast('The generator tank is already full');
      set((st) => ({ fuelCans: st.fuelCans - 1, power: { ...st.power, genFuel: Math.min(100, st.power.genFuel + GENERATORS[gen].can) } }));
      toast('⛽ Poured a jerrycan into the gen');
    },

    refuelCar(carId) {
      const s = get();
      if (!s.ownedCars.includes(carId)) return;
      const left = fuelLeft(s.carFuel, carId);
      if (left > CAR_FUEL.tank - 1) return toast('The tank is already full');
      const filled = Math.min(CAR_FUEL.tank, left + CAR_FUEL.can);
      // A jerrycan in store is used first; otherwise fill at the pump, paying per litre.
      if (s.fuelCans > 0) {
        set((st) => ({ fuelCans: st.fuelCans - 1, carFuel: { ...st.carFuel, [carId]: filled } }));
      } else {
        if (activeEvent() === 'fuel') return toast('⛽ The filling stations are dry. Only the black market has fuel now');
        const price = Math.ceil((fuelPrice() / CAR_FUEL.can) * (filled - left));
        if (s.money < price) return toast(`You need ${naira(price)} to fill the tank`);
        pay(-price, `Fuel, ${Math.round(filled - left)}L`);
        set((st) => ({ carFuel: { ...st.carFuel, [carId]: filled } }));
        get().bump('fuelBought');
      }
      toast(`⛽ ${CAR_BY_ID[carId]?.name ?? 'Car'} filled up: ${Math.round(filled)}L`);
    },

    hireMeterBoy(level) {
      const s = get();
      const cfg = METER[level];
      if (s.meter.level === level) return toast('That connect is already running');
      if (s.minutes < s.meter.banUntil) return toast('🚫 NEPA is watching you. The plug will not touch your meter yet.');
      if (s.money < cfg.cost) return toast(`The boy wants ${naira(cfg.cost)} cash`);
      pay(-cfg.cost, `NEPA boy (${cfg.label.toLowerCase()})`);
      set({ meter: { ...s.meter, level, reported: null } });
      toast(level === 'bypass' ? '🔌 Done. The wire is on the pole. Light is free, but do not tell anybody.' : '🪛 Meter tampered. It spins slow now. Light go cheap.');
    },

    restoreMeter() {
      const s = get();
      if (!meterOn(s.meter)) return;
      set({ meter: { ...s.meter, level: 'off', saved: 0, reported: null } });
      toast('🧰 The boy came back and put the meter right. Clean as a whistle.');
    },

    meterReported(by) {
      const s = get();
      if (!meterOn(s.meter) || s.meter.reported !== null) return;
      set({ meter: { ...s.meter, reported: s.minutes } });
      toast(`📞 Somebody called NEPA on you. Inspectors are on their way... (tip-off from @${by})`);
    },

    payNepaBill() {
      const s = get();
      if (s.nepaOwed < 1) return toast('You owe NEPA nothing');
      const paid = Math.min(Math.ceil(s.nepaOwed), Math.max(0, Math.floor(s.money)));
      if (paid <= 0) return toast('You have no money to pay NEPA');
      pay(-paid, 'NEPA bill');
      set({ nepaOwed: Math.max(0, s.nepaOwed - paid) });
      toast(paid >= s.nepaOwed ? '🧾 NEPA bill cleared' : `🧾 Paid ${naira(paid)} to NEPA. ${naira(Math.ceil(s.nepaOwed - paid))} still owed`);
    },

    setPowerMode(mode) {
      const s = get();
      if (modeOf(s.power) === mode) return;
      if (mode === 'solar' && !s.items.some((i) => i.type === 'solar')) return toast('You have no solar panels in this house');
      if (mode === 'gen' && !generatorOf(s.items)) return toast('You have no generator in this house');
      set((st) => ({ power: { ...st.power, mode, genOn: mode === 'gen' ? true : st.power.genOn } }));
      toast(mode === 'grid' ? '💡 Back on NEPA' : mode === 'solar' ? '☀️ Grid off. Running on solar only' : '⛽ Grid off. Running on the generator only');
    },

    sellFuel() {
      const s = get();
      if (activeEvent() !== 'fuel') return toast('Nobody is buying fuel at a premium right now. Wait for a scarcity');
      if (s.fuelCans <= 0) return toast('You have no fuel to sell');
      set((st) => ({ fuelCans: st.fuelCans - 1 }));
      const paid = get().earn('fuel_sale', FUEL.scarcitySell, 'Sold a jerrycan during the scarcity');
      get().bump('fuelSold');
      toast(`💰 A desperate neighbour paid ${naira(paid)} for one jerrycan`);
    },

    setOwambe(open) {
      set({ owambe: open, panel: null, placeId: null });
    },

    endLife() {
      const s = get();
      const b = legacyOf({
        stats: s.stats,
        flags: s.storyFlags,
        netWorth: netWorthOf(s),
        goodDeeds: s.goodDeeds,
        notoriety: s.notoriety,
        knowledge: s.knowledge,
        governmentOffice: s.governmentOffice,
        houses: s.properties.filter((p) => p.stage >= STAGES.length).length,
        cars: s.ownedCars.length,
        workDays: s.workDays,
        days: dayOf(s.minutes),
        achievements: s.achievements.length,
      });
      const record: LegacyRecord = { name: s.name, origin: s.origin, score: b.total, title: b.title, icon: b.icon, days: dayOf(s.minutes), at: Date.now() };
      set({ lifeSummary: { ...b, record }, legacy: [record, ...s.legacy].sort((x, y) => y.score - x.score).slice(0, 10), panel: null });
      lifeHooks.onEnd?.(record);
    },

    newLife() {
      const keep = get().legacy;
      get().reset();
      set({ legacy: keep, lifeSummary: null });
    },

    reset() {
      resetAvatar(START_CELL);
      driveState.vehicle = null;
      set((s) => ({ ...fresh(), mode: 'live', panel: null, selectedId: null, placeId: null, placing: null, toasts: [], owambe: false, lifeSummary: null, teleportId: s.teleportId + 1 }));
    },
  };
});

// The map's cell checks and pathfinding (city.ts) follow the city you are in.
setActiveMap(useGame.getState().destinationId);
useGame.subscribe((s, prev) => {
  if (s.destinationId !== prev.destinationId) setActiveMap(s.destinationId);
});

// Buying or selling a car at home grows or shrinks the car bay (game/grid.ts), which moves the compound gate down or
// up: the gate is a placed item, so it follows.
useGame.subscribe((s, prev) => {
  if (s.view !== 'home' || Math.min(3, s.ownedCars.length) === Math.min(3, prev.ownedCars.length)) return;
  const layout = houseLayout(activeDesignOf(s), s.wallEdits[houseKeyOf(s)]);
  const gate = s.items.find((i) => i.type === 'gate');
  if (gate && (gate.x !== layout.gate.x || gate.z !== layout.gate.z)) useGame.setState({ items: s.items.map((i) => (i === gate ? { ...i, x: layout.gate.x, z: layout.gate.z, rot: 0 } : i)) });
});

export { naira };
