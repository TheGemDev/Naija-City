// Street Games on the client (server: worker/games.ts, shared types: src/game/streetGames.ts).

import { create } from 'zustand';
import { api } from './session';
import { refreshBalance, setServerBalance } from './wallet';
import { naira, useGame } from '../game/store';
import { STREET_GAMES, type Champion, type GameEvent, type GameId, type GamesLobby, type MatchView } from '../game/streetGames';

interface Board {
  game: GameId | '';
  top: Champion[];
  me: Champion | null;
}

interface GamesState {
  lobby: GamesLobby | null;
  /** The table on screen. */
  match: MatchView | null;
  /** Server clock minus this device's clock, so turn countdowns are right on a phone with the wrong time. */
  skew: number;
  busy: boolean;
  board: Board | null;
}

export const useGames = create<GamesState>(() => ({ lobby: null, match: null, skew: 0, busy: false, board: null }));

const toast = (text: string) => useGame.getState().toast(text);

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await api(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; match?: MatchView };
  // A refused move still says how the table stands now (e.g. it ended while you were choosing).
  if (!res.ok && data.match) show(data.match);
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
  return data;
}

/** Put a match on screen, unless what we already show is newer (answers can arrive out of order). */
function show(match: MatchView) {
  const cur = useGames.getState().match;
  if (cur && cur.id === match.id && cur.version > match.version) return;
  useGames.setState({ match, skew: match.now - Date.now() });
}

export const loadLobby = () =>
  call<GamesLobby>('/api/games')
    .then((lobby) => {
      useGames.setState({ lobby });
      setServerBalance(lobby.balance);
    })
    .catch(() => {});

export const loadChampions = (game: GameId | '') =>
  call<{ top: Champion[]; me: Champion | null }>(`/api/games/top${game ? `?game=${game}` : ''}`)
    .then((r) => useGames.setState({ board: { game, ...r } }))
    .catch(() => {});

/** Fetch the table on screen again. Only applies if the player is still looking at it. */
export async function refreshMatch() {
  const id = useGames.getState().match?.id;
  if (!id) return;
  const r = await call<{ match: MatchView }>(`/api/games/${id}`).catch(() => null);
  if (r && useGames.getState().match?.id === id) show(r.match);
}

export async function openMatch(id: string) {
  useGames.setState({ busy: true });
  try {
    const r = await call<{ match: MatchView }>(`/api/games/${id}`);
    useGames.setState({ match: r.match, skew: r.match.now - Date.now() });
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not open that table');
    void loadLobby();
  } finally {
    useGames.setState({ busy: false });
  }
}

export function closeMatch() {
  useGames.setState({ match: null });
  void loadLobby();
}

async function act(path: string, body: unknown): Promise<boolean> {
  useGames.setState({ busy: true });
  try {
    const r = await call<{ match: MatchView; balance: number }>(path, body);
    show(r.match);
    setServerBalance(r.balance);
    return true;
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not do that now');
    return false;
  } finally {
    useGames.setState({ busy: false });
  }
}

export const createTable = (game: GameId, stake: number, seats: number, invite: string) => act('/api/games/create', { game, stake, seats, invite });
export const joinTable = (id: string) => act(`/api/games/${id}/join`, {});
export const startTable = (id: string) => act(`/api/games/${id}/start`, {});
export const leaveTable = (id: string) => act(`/api/games/${id}/leave`, {});
export const playMove = (id: string, move: Record<string, unknown>) => act(`/api/games/${id}/move`, { move });

/** "Your move" is only toasted once in a while per table, or a fast game would bury the screen in toasts. */
const nudged = new Map<string, number>();
const NUDGE_MS = 20_000;

export function onGameEvent(e: GameEvent) {
  const watching = useGames.getState().match?.id === e.id;
  if (watching) void refreshMatch();
  const name = e.kind === 'update' ? '' : STREET_GAMES[e.game]?.name ?? 'a game';
  if (e.kind === 'invite') {
    // The challenge also arrives as a message (worker/social.ts), and that is what gets toasted.
  } else if (e.kind === 'joined' && !watching) {
    toast(`🎮 @${e.by} sat at your ${name} table.`);
  } else if (e.kind === 'start' && !watching) {
    toast(`🎮 Your ${name} game has started. Open Games on your phone!`);
  } else if (e.kind === 'over') {
    const back = e.amount ? ` ${naira(e.amount)} is back in your account.` : '';
    if (e.result === 'closed') toast(`🎮 Your ${name} table closed.${back}`);
    else if (e.result === 'draw') toast(`🤝 ${name} ended level.${back}`);
    else if (e.result === 'won') toast(e.amount ? `🏆 You won ${naira(e.amount)} at ${name}!` : `🏆 You won at ${name}!`);
    else toast(e.amount ? `😩 You lost ${naira(e.amount)} at ${name}.` : `😩 You lost at ${name}.`);
    void refreshBalance();
  }
  if (watching) return;
  void loadLobby().then(() => {
    if (e.kind !== 'update') return;
    const card = useGames.getState().lobby?.mine.find((m) => m.id === e.id);
    if (!card?.yourTurn || Date.now() - (nudged.get(e.id) ?? 0) < NUDGE_MS) return;
    nudged.set(e.id, Date.now());
    toast(`🎮 Your move at ${STREET_GAMES[card.game].name}.`);
  });
}
