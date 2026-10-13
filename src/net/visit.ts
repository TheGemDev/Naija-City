import { avatar, resetAvatar } from '../game/avatar';
import { useGame } from '../game/store';
import { useVisit, type HouseVisit } from '../game/visits';
import { saveLocal, serialize } from '../game/save';
import { revokeHomeVisit } from './social';
import { api } from './session';
import { houseLayoutForDesign } from '../game/grid';

async function post<T>(path: string, body: object): Promise<T> {
  const response = await api(path, { method: 'POST', body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'Could not enter the house');
  return data;
}

export async function startBreakIn(target: string, slot: number, region: string): Promise<HouseVisit> {
  const { home } = await post<{ home: HouseVisit }>('/api/break-in/start', { target, slot, region });
  return { ...home, burglary: true, selectedItemId: null };
}

/** Start carrying an item out; the server says how many seconds it takes. */
export async function startStealing(itemId: string): Promise<number> {
  const r = await post<{ seconds: number }>('/api/break-in/steal/start', { itemId });
  return r.seconds;
}

export async function cancelStealing() {
  await post('/api/break-in/steal/cancel', {});
}

export async function stealHouseFurniture(itemId: string): Promise<{ stolen: boolean; caught: boolean; camera?: boolean; item?: import('../game/grid').PlacedItem }> {
  return post('/api/break-in/steal', { itemId });
}

/** Ask the server whether a CCTV camera just caught me; it checks the position it tracks itself. */
export async function reportSpotted(): Promise<boolean> {
  const r = await post<{ caught: boolean }>('/api/break-in/spotted', {});
  return r.caught;
}

export function enterHouseVisit(home: HouseVisit) {
  if (useVisit.getState().current) return;
  if (useGame.getState().task) useGame.getState().cancelTask();
  const returnSave = serialize();
  useVisit.setState({ current: { ...home, selectedItemId: null }, returnSave });
  // A visit leaves `view` and `insideId` where you came from (the airport, a hotel): shut what that venue had open.
  useGame.setState({ mode: 'live', panel: null, selectedId: null, placing: null, placeHubOpen: false, hotelDesk: false, flightDesk: false });
  const layout = houseLayoutForDesign(home.save.design);
  resetAvatar(layout.entry.side === 'south'
    ? { x: layout.entry.at, z: layout.depth - 1 }
    : layout.entry.side === 'north'
      ? { x: layout.entry.at, z: 0 }
      : { x: 0, z: layout.entry.at });
  avatar.yaw = layout.entry.side === 'south' ? Math.PI : layout.entry.side === 'north' ? 0 : Math.PI / 2;
  avatar.path = [layout.entry.side === 'south'
    ? { x: layout.entry.at, z: layout.depth - 2 }
    : layout.entry.side === 'north'
      ? { x: layout.entry.at, z: 1 }
      : { x: 1, z: layout.entry.at }];
  useGame.getState().toast(home.burglary ? `🥷 You broke into @${home.ownerUsername}'s house` : `🏠 Visiting @${home.ownerUsername}'s house`);
}

export function leaveHouseVisit() {
  const returnSave = useVisit.getState().returnSave;
  if (!returnSave) return;
  if (useGame.getState().task) useGame.getState().cancelTask();
  void revokeHomeVisit().catch((e) => useGame.getState().toast(e instanceof Error ? `Could not close house access: ${e.message}` : 'Could not close house access'));
  useVisit.setState({ current: null, returnSave: null });
  resetAvatar(returnSave.avatar);
  avatar.path = [];
  avatar.onArrive = null;
  useGame.setState((s) => ({
    view: returnSave.view,
    insideId: returnSave.insideId,
    destinationId: returnSave.destinationId,
    estateId: returnSave.estateId,
    estateNo: returnSave.estateNo,
    panel: null,
    mode: 'live',
    selectedId: null,
    placing: null,
    teleportId: s.teleportId + 1,
  }));
  saveLocal();
}
