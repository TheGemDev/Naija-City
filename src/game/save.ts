// Save / load. The same JSON blob goes to localStorage now and to the Cloudflare API later.

import { avatar, resetAvatar } from './avatar';
import { loadMeter } from './meterBypass';
import { RENAMED_ITEMS } from './catalog';
import { cleanFinishes } from './finishes';
import { dayOf, GOV_WEEKLY_RENT, houseStaffOnly, useGame, type GameState } from './store';
import { STARTER_WARDROBE } from './wardrobe';
import { STARTER_ANDROID } from './phones';
import { getRegion } from './regions';
import type { HotelStay } from './hotel';
import { normalizeOrigin } from './origins';
import { workplaceOf } from './jobs';
import { useVisit } from './visits';
import { useApps } from './apps';

export const SAVE_VERSION = 1;
const LOCAL_KEY = 'kaduna-life-save';

const SAVED_KEYS = [
  'started', 'name', 'look', 'origin', 'loanOwed', 'debtOwed', 'govRentOwed', 'govRentPaidThrough', 'personalStaff', 'wardrobe', 'minutes', 'money', 'needs', 'knowledge', 'cooking',
  'items', 'furnitureInventory', 'jobId', 'jobCity', 'workedDay', 'workDays', 'campaign', 'governmentOffice',
  'goodDeeds', 'notoriety', 'streetStory', 'storyLog', 'power', 'waterTank', 'sallahRam', 'txns', 'deliveries', 'view', 'insideId', 'hotelStays', 'estateId', 'estateNo', 'investments',
  'ownedCars', 'ownedJets', 'jetWear', 'selectedCar', 'carCondition', 'carFuel', 'phone', 'ownedPhones', 'freePhone', 'properties', 'homePropertyId', 'activeHouseId', 'wallEdits', 'housePaint', 'houseFinish', 'destinationId', 'homeState',
  'stats', 'storyFlags', 'achievements', 'recentStories', 'fuelCans', 'nepaOwed', 'meter', 'nepaWarnedDay', 'nepaBilledDay', 'owambeInvite', 'owambeInviteCity', 'houseStation', 'legacy', 'aliases',
] as const;

/** apps: installed store apps (src/game/apps.ts); the police read them in a phone search (worker/phoneSearch.ts). */
export type SaveData = { version: number; savedAt: number; avatar: { x: number; z: number }; apps?: string[] } & Pick<GameState, (typeof SAVED_KEYS)[number]>;

export function serialize(): SaveData {
  const s = useGame.getState();
  const returnSave = useVisit.getState().returnSave;
  const data = Object.fromEntries(SAVED_KEYS.map((k) => [k, s[k]])) as Pick<GameState, (typeof SAVED_KEYS)[number]>;
  if (s.activeHouseId) {
    data.properties = data.properties.map((property) =>
      property.id === s.activeHouseId ? { ...property, items: s.items } : property,
    );
  }
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    avatar: returnSave?.avatar ?? { x: Math.floor(avatar.x), z: Math.floor(avatar.z) },
    apps: useApps.getState().installed,
    ...data,
  };
}

/** A merged item type becomes its replacement when a save loads. */
const renameItems = <T extends { type: string }>(list: T[] | undefined): T[] =>
  (list ?? []).map((i) => (RENAMED_ITEMS[i.type] ? { ...i, type: RENAMED_ITEMS[i.type] } : i));

export function hydrate(data: SaveData) {
  if (!data || data.version !== SAVE_VERSION) return false;
  const { version: _v, savedAt: _s, avatar: pos, apps, ...rest } = data;
  const legacyStay = (data as { hotelStay?: HotelStay | null }).hotelStay;
  if (Array.isArray(apps)) useApps.setState({ installed: apps });
  // Any running task is dropped on load.
  useGame.setState((s) => ({
    ...rest,
    origin: normalizeOrigin(rest.origin),
    items: renameItems(rest.items),
    loanOwed: rest.loanOwed ?? 0,
    // Saves from before government rent: anyone without a home of their own lives in the government house.
    govRentOwed: rest.govRentOwed ?? (rest.homePropertyId ? 0 : GOV_WEEKLY_RENT[normalizeOrigin(rest.origin)] ?? 0),
    govRentPaidThrough: rest.govRentPaidThrough ?? dayOf(rest.minutes),
    personalStaff: (rest.personalStaff ?? []).map((m) => ({ ...m, propertyId: m.propertyId ?? 'starter' })),
    debtOwed: rest.debtOwed ?? Math.max(0, -rest.money),
    money: Math.max(0, rest.money),
    wardrobe: rest.wardrobe ?? STARTER_WARDROBE,
    investments: rest.investments ?? {},
    ownedCars: rest.ownedCars ?? [],
    ownedJets: rest.ownedJets ?? [],
    jetWear: rest.jetWear ?? {},
    selectedCar: rest.selectedCar ?? null,
    carCondition: rest.carCondition ?? {},
    carFuel: rest.carFuel ?? {},
    phone: rest.phone ?? STARTER_ANDROID,
    ownedPhones: rest.ownedPhones ?? [rest.phone ?? STARTER_ANDROID],
    freePhone: rest.ownedPhones ? (rest.freePhone ?? null) : STARTER_ANDROID,
    properties: (rest.properties ?? []).map((property) => ({
      ...property,
      boughtAt: property.boughtAt ?? rest.minutes,
      staff: houseStaffOnly(property.staff),
      constructionPlan: property.constructionPlan ?? null,
      items: renameItems(property.items ?? (property.id === (rest.homePropertyId ?? null) ? rest.items : [])),
    })),
    homePropertyId: rest.homePropertyId ?? null,
    // A job from before jobs had a city: it is in the state you were born in if that state has the workplace, else Kaduna's.
    jobCity: !rest.jobId ? null : workplaceOf(rest.jobId, rest.jobCity) ? rest.jobCity : workplaceOf(rest.jobId, rest.homeState) ? rest.homeState : 'kaduna',
    activeHouseId: rest.activeHouseId ?? rest.homePropertyId ?? null,
    wallEdits: rest.wallEdits && typeof rest.wallEdits === 'object' ? rest.wallEdits : {},
    housePaint: rest.housePaint && typeof rest.housePaint === 'object' ? rest.housePaint : {},
    // Saves from before finishes have none: every house is as built.
    houseFinish: cleanFinishes(rest.houseFinish),
    furnitureInventory: renameItems(rest.furnitureInventory),
    aliases: rest.aliases && typeof rest.aliases === 'object' ? rest.aliases : {},
    campaign: rest.campaign ?? null,
    governmentOffice: rest.governmentOffice ?? null,
    goodDeeds: rest.goodDeeds ?? 0,
    notoriety: rest.notoriety ?? 0,
    streetStory: rest.streetStory ?? null,
    storyLog: rest.storyLog ?? [],
    stats: rest.stats ?? {},
    storyFlags: rest.storyFlags ?? [],
    achievements: rest.achievements ?? [],
    recentStories: rest.recentStories ?? [],
    fuelCans: rest.fuelCans ?? 0,
    nepaOwed: rest.nepaOwed ?? 0,
    meter: loadMeter(rest.meter),
    nepaWarnedDay: rest.nepaWarnedDay ?? 0,
    nepaBilledDay: rest.nepaBilledDay ?? 0,
    owambeInvite: rest.owambeInvite ?? null,
    owambeInviteCity: rest.owambeInviteCity ?? null,
    houseStation: rest.houseStation ?? null,
    legacy: rest.legacy ?? [],
    waterTank: rest.waterTank ?? 100,
    sallahRam: rest.sallahRam ?? 'none',
    view: rest.view === 'estate' && !rest.estateId ? 'city' : (rest.view ?? 'home'),
    destinationId: getRegion(rest.destinationId ?? '')?.id ?? 'kaduna',
    // Lives from before you could be born anywhere else are Kaduna's.
    homeState: getRegion(rest.homeState ?? '')?.id ?? 'kaduna',
    insideId: rest.insideId ?? null,
    // Saves from before Abuja had a hotel of its own held one room, and it was Kaduna's.
    hotelStays: rest.hotelStays ?? (legacyStay ? { kaduna: legacyStay } : {}),
    estateId: rest.estateId ?? null,
    estateNo: rest.estateNo ?? 0,
    task: null,
    teleportId: s.teleportId + 1,
  }));
  resetAvatar(pos);
  useGame.getState().fitHome();
  return true;
}

export function saveLocal() {
  const s = useGame.getState();
  if (!s.started) return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(serialize()));
  } catch {
    /* storage full or blocked */
  }
}

export function loadLocal(): boolean {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? hydrate(JSON.parse(raw)) : false;
  } catch {
    return false;
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

/** Autosave every 15s and when the tab is hidden or closed. */
export function startAutosave() {
  loadLocal();
  const id = setInterval(saveLocal, 15_000);
  // Save right away on big moments so a refresh never loses them.
  const unsub = useGame.subscribe((s, p) => {
    if (
      s.started !== p.started || s.items !== p.items || s.housePaint !== p.housePaint || s.houseFinish !== p.houseFinish || s.jobId !== p.jobId || s.jobCity !== p.jobCity ||
      s.aliases !== p.aliases || s.campaign !== p.campaign ||
      s.governmentOffice !== p.governmentOffice || s.money !== p.money ||
      s.streetStory !== p.streetStory || s.storyLog !== p.storyLog ||
      s.goodDeeds !== p.goodDeeds || s.notoriety !== p.notoriety ||
      s.look !== p.look || s.wardrobe !== p.wardrobe || s.loanOwed !== p.loanOwed || s.debtOwed !== p.debtOwed || s.govRentOwed !== p.govRentOwed || s.personalStaff !== p.personalStaff || s.destinationId !== p.destinationId
      || s.achievements !== p.achievements || s.legacy !== p.legacy || s.fuelCans !== p.fuelCans || s.storyFlags !== p.storyFlags
      || s.waterTank !== p.waterTank || s.sallahRam !== p.sallahRam || s.properties !== p.properties || s.phone !== p.phone || s.ownedPhones !== p.ownedPhones
    ) saveLocal();
  });
  const onHide = () => document.visibilityState === 'hidden' && saveLocal();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', saveLocal);
  return () => {
    clearInterval(id);
    unsub();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', saveLocal);
  };
}
