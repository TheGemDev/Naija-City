// Live shared area over WebSocket (Durable Object `Room` in worker/room.ts).

import { create } from 'zustand';
import { avatarView, type NetPose } from '../game/avatar';
import { useGame } from '../game/store';
import { idToken } from './firebase';
import { handOff, takeOver, useSession } from './session';
import { onSocialEvent, type Message, type PlayerRef } from './social';
import { onFriendEvent } from './community';
import type { CrimeReport } from '../game/crime';
import { onCrimeEvent } from './crime';
import { onShotEvent } from './guns';
import type { ShotEvent } from '../game/guns';
import { onElectionEvent, onGazetteEvent, onImpeachedEvent, type ElectionEvent, type GazetteEvent, type ImpeachedEvent } from './civic';
import { loadRentals, onRentalEvent } from './rentals';
import { shoutoutHooks, useShoutouts, type LobbyActionKind } from '../game/shoutout';
import { onFunEvent, type FunEvent } from './live';
import { onViceEvent, type ViceEvent } from './vice';
import { onGameEvent } from './games';
import type { GameEvent } from '../game/streetGames';
import { useVisit } from '../game/visits';
import { onCityEvent } from './cityStats';
import { isPrivateRoom } from '../game/villa';

/** Everyone shares one room; `area` says whether a player is at home (private) or out in the city. */
export const ROOM = 'kaduna';
export type Area = 'home' | `home:${string}` | `city:${string}` | `place:${string}:${string}` | `estate:${string}:${number}`;
const SEND_HZ = 5;

export interface RemoteInfo {
  id: string;
  username: string;
  name: string;
  look: string;
}

/** The building lobby the server put me in (worker/room.ts). Others in a different lobby arrive as `area#n`. */
let myLobby = { area: '', lobby: 0 };
/** My area as other players' positions report it, so a plain comparison only matches my own lobby. */
/** The area of the place you're inside. A hotel room or the President's suite is yours alone: nobody else's room, and nobody in yours. */
export const placeArea = (g: { destinationId: string; insideId: string | null }, uid: string | null) =>
  `place:${g.destinationId}:${isPrivateRoom(g.insideId) ? `room-${uid ?? 'me'}` : g.insideId}`;
export const lobbyArea = (area: string) => (myLobby.area === area && myLobby.lobby ? `${area}#${myLobby.lobby}` : area);

/** Target transform per remote player; read every frame, so kept out of React. */
export const remotePos = new Map<string, { area: Area; x: number; y: number; z: number; yaw: number; pose: NetPose }>();

interface Bubble {
  text: string;
  until: number;
}

interface Net {
  connected: boolean;
  /** This account opened the game in another tab or device, which took over the connection. */
  replaced: boolean;
  /** This tab just took over from another one and is loading the progress it handed off. */
  moving: boolean;
  /** Move the game back to this tab. */
  playHere(): void;
  clockSynced: boolean;
  players: Record<string, RemoteInfo>;
  bubbles: Record<string, Bubble>;
  myId: string | null;
  say(text: string): void;
}

let socket: WebSocket | null = null;

let reconnectNow = () => {};
/** The old tab needs a moment to upload its progress before this one loads it. */
const HANDOFF_WAIT = 1500;

export const useNet = create<Net>(() => ({
  connected: false,
  replaced: false,
  moving: false,
  playHere() {
    useNet.setState({ replaced: false });
    reconnectNow();
  },
  clockSynced: false,
  players: {},
  bubbles: {},
  myId: null,
  say(text) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'chat', text }));
  },
}));

type ServerMsg =
  | { t: 'welcome'; you: string; replacedOther?: boolean; minutes: number; players: (RemoteInfo & Partial<{ area: Area; x: number; y: number; z: number; yaw: number; pose: NetPose }>)[] }
  | { t: 'time'; minutes: number }
  | ({ t: 'join' } & RemoteInfo & Partial<{ area: Area; x: number; y: number; z: number; yaw: number; pose: NetPose }>)
  | { t: 'move'; id: string; area: Area; x: number; y: number; z: number; yaw: number; pose: NetPose }
  | { t: 'leave'; id: string }
  | { t: 'lobby'; area: string; lobby: number }
  | { t: 'here'; players: { id: string; area: Area; x: number; y: number; z: number; yaw: number; pose: NetPose }[] }
  | { t: 'reshard' }
  | { t: 'city'; online: number; visits?: number }
  | { t: 'chat'; id: string; name: string; username: string; text: string }
  | { t: 'shoutout'; id: string; name: string; username: string; action: string; amount: number }
  | { t: 'lobby-action'; id: string; name: string; username: string; action: LobbyActionKind; amount: number; target: string; place: string }
  | { t: 'dm' | 'msg-update'; message: Message; from?: PlayerRef }
  | { t: 'msg-delete'; id: number }
  | { t: 'msg-read'; by: string; upTo: number }
  | { t: 'friend'; uid: string; username: string }
  | { t: 'robbed'; crime: CrimeReport }
  | { t: 'arrested'; crime: CrimeReport; crimes?: CrimeReport[]; charges?: string[]; until: number; jailMinutes?: number; officer?: string | null }
  | { t: 'wanted'; crime: CrimeReport; autoAt: number }
  | { t: 'case'; crime: CrimeReport }
  | { t: 'accused'; by: string; cleared: boolean }
  | { t: 'released'; by: string | null; amount: number; pardon?: string }
  | { t: 'bounty'; crime: CrimeReport; amount: number }
  | { t: 'vdm'; victim: string }
  | ElectionEvent
  | GazetteEvent
  | ImpeachedEvent
  | ShotEvent
  | { t: 'intruder'; thief: string; username: string; until: number }
  | { t: 'beaten'; by: string; until: number; amount: number; items: string[] }
  | { t: 'rental'; text: string }
  | { t: 'blackmarket'; text: string }
  | { t: 'meter-report'; by: string }
  | ViceEvent
  | GameEvent
  | FunEvent;

/** When each player was last seen, so a quick reconnect (a server update drops everybody's connection) is not announced as someone arriving. */
const lastSeen = new Map<string, number>();
const REJOIN_QUIET_MS = 3 * 60_000;

function addPlayer(p: RemoteInfo & Partial<{ area: Area; x: number; y: number; z: number; yaw: number; pose: NetPose }>) {
  useNet.setState((s) => ({ players: { ...s.players, [p.id]: { id: p.id, username: p.username, name: p.name, look: p.look } } }));
  if (p.x !== undefined && !remotePos.has(p.id)) remotePos.set(p.id, { area: p.area ?? 'home', x: p.x, y: p.y ?? 0, z: p.z ?? 0, yaw: p.yaw ?? 0, pose: p.pose ?? 'stand' });
}

function onMessage(m: ServerMsg) {
  if (m.t === 'welcome') {
    remotePos.clear();
    useNet.setState({ myId: m.you, players: {}, bubbles: {} });
    syncGameClock(m.minutes);
    m.players.forEach(addPlayer);
    for (const p of m.players) lastSeen.set(p.id, Date.now());
    if (m.replacedOther) {
      useNet.setState({ moving: true });
      setTimeout(() => void takeOver().finally(() => useNet.setState({ moving: false })), HANDOFF_WAIT);
    }
  } else if (m.t === 'time') {
    syncGameClock(m.minutes);
  } else if (m.t === 'join') {
    addPlayer(m);
    if (Date.now() - (lastSeen.get(m.id) ?? 0) > REJOIN_QUIET_MS) useGame.getState().toast(`👋🏾 @${m.username} is online`);
    lastSeen.set(m.id, Date.now());
  } else if (m.t === 'move') {
    remotePos.set(m.id, { area: m.area, x: m.x, y: m.y, z: m.z, yaw: m.yaw, pose: m.pose });
    lastSeen.set(m.id, Date.now());
  } else if (m.t === 'lobby') {
    myLobby = { area: m.area, lobby: m.lobby };
  } else if (m.t === 'here') {
    // Moves only arrive from my own area and lobby, so whatever I knew about anyone elsewhere is out of date.
    remotePos.clear();
    for (const { id, ...pos } of m.players) remotePos.set(id, pos);
  } else if (m.t === 'reshard') {
    // The server moved us to the room of the house we are visiting: drop this socket and the retry timer reconnects to it.
    socket?.close(1000);
  } else if (m.t === 'city') {
    onCityEvent(m);
  } else if (m.t === 'leave') {
    remotePos.delete(m.id);
    useNet.setState((s) => {
      const { [m.id]: _gone, ...players } = s.players;
      return { players };
    });
  } else if (m.t === 'chat') {
    const bubble = { text: m.text, until: Date.now() + 6000 };
    useNet.setState((s) => ({ bubbles: { ...s.bubbles, [m.id]: bubble } }));
    setTimeout(() => {
      useNet.setState((s) => {
        if (s.bubbles[m.id] !== bubble) return s;
        const { [m.id]: _done, ...bubbles } = s.bubbles;
        return { bubbles };
      });
    }, 6000);
    if (m.id !== useNet.getState().myId) useGame.getState().toast(`💬 @${m.username}: ${m.text}`);
  } else if (m.t === 'shoutout') {
    useShoutouts.getState().push({ name: m.name, username: m.username, action: m.action, amount: m.amount, mine: m.id === useNet.getState().myId });
  } else if (m.t === 'lobby-action') {
    useShoutouts.getState().push({
      name: m.name,
      username: m.username,
      action: m.action,
      amount: m.amount,
      mine: m.id === useNet.getState().myId,
      target: m.target,
      place: m.place,
    });
  } else if (m.t === 'dm' || m.t === 'msg-update' || m.t === 'msg-delete' || m.t === 'msg-read') {
    onSocialEvent(m);
  } else if (m.t === 'friend') {
    onFriendEvent(m);
  } else if (m.t === 'robbed' || m.t === 'arrested' || m.t === 'wanted' || m.t === 'case' || m.t === 'released' || m.t === 'bounty' || m.t === 'accused' || m.t === 'vdm' || m.t === 'intruder' || m.t === 'beaten') {
    onCrimeEvent(m);
  } else if (m.t === 'election') {
    onElectionEvent(m);
  } else if (m.t === 'gazette') {
    onGazetteEvent(m);
  } else if (m.t === 'impeached') {
    onImpeachedEvent(m);
  } else if (m.t === 'shot') {
    onShotEvent(m);
  } else if (m.t === 'meter-report') {
    useGame.getState().meterReported(m.by);
  } else if (m.t === 'blackmarket') {
    useGame.getState().toast(`🕶️ ${m.text}`);
  } else if (m.t === 'rental') {
    onRentalEvent(m);
  } else if (m.t === 'fun') {
    onFunEvent(m);
  } else if (m.t === 'vice') {
    onViceEvent(m);
  } else if (m.t === 'game') {
    onGameEvent(m);
  }

}

shoutoutHooks.send = (action) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'shoutout', action }));
};

/** Announce a public player interaction to everyone in this building lobby. */
export function announceLobbyAction(target: string, action: LobbyActionKind) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'lobby-action', target, action }));
}

function syncGameClock(minutes: number) {
  if (!Number.isFinite(minutes)) return;
  useGame.setState({ minutes });
  useNet.setState({ clockSynced: true });
}

/** Server time arrives in `welcome`; the clock then runs locally. Re-ask only when the tab comes back (frames pause while hidden). */
function requestServerTime() {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'time' }));
}

function hello(ws: WebSocket) {
  const g = useGame.getState();
  ws.send(JSON.stringify({ t: 'hello', name: g.name, look: g.look }));
}

/** Keeps one connection open while signed in and playing; reconnects with backoff. */
export function startMultiplayer() {
  let stopped = false;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = '';

  const wanted = () => {
    const s = useSession.getState();
    return !!s.user?.username && s.status === 'ready' && useGame.getState().started;
  };

  async function connect() {
    if (stopped || socket || !wanted() || useNet.getState().replaced) return;
    const token = await idToken();
    if (!token || stopped || socket) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/room/${ROOM}?token=${encodeURIComponent(token)}`);
    socket = ws;
    ws.onopen = () => {
      retry = 0;
      last = '';
      useNet.setState({ connected: true, replaced: false });
      hello(ws);
      // Who I rent from decides where Home takes me.
      void loadRentals();
    };
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data));
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = (e) => {
      if (socket === ws) socket = null;
      remotePos.clear();
      useNet.setState({ connected: false, clockSynced: false, players: {}, bubbles: {} });
      // 4000: this account opened the game in another tab. Don't fight over the slot; ConnectionGate tells the player.
      if (e.code === 4000) {
        useNet.setState({ replaced: true, moving: false });
        void handOff();
      }
      else if (!stopped) {
        // Spread out: after a deploy every player in the city reconnects at the same moment.
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++) * (0.5 + Math.random()));
      }
    };
  }

  function disconnect() {
    if (timer) clearTimeout(timer);
    timer = null;
    socket?.close(1000);
    socket = null;
  }

  const sync = () => {
    if (wanted()) return connect();
    disconnect();
    useNet.setState({ replaced: false, moving: false }); // signed out / new player: start fresh
  };
  reconnectNow = () => {
    if (timer) clearTimeout(timer);
    retry = 0;
    void connect();
  };
  const unsubSession = useSession.subscribe(sync);
  const unsubGame = useGame.subscribe((s, p) => {
    if (s.started !== p.started) sync();
    // Name or look changed (new life): re-introduce.
    if (socket?.readyState === WebSocket.OPEN && (s.name !== p.name || s.look !== p.look)) hello(socket);
  });
  sync();

  const onResume = () => document.visibilityState === 'visible' && requestServerTime();
  document.addEventListener('visibilitychange', onResume);

  const send = setInterval(() => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    const v = avatarView;
    const g = useGame.getState();
    const visit = useVisit.getState().current;
    const uid = useNet.getState().myId;
    const area = visit
      ? `home:${visit.ownerUid}`
      : g.view === 'home' && uid
        ? `home:${uid}`
        : g.view === 'place' && g.insideId
          ? placeArea(g, uid)
          : g.view === 'city'
            ? `city:${g.destinationId}`
            : g.view === 'estate' && g.estateId
              ? `estate:${g.estateId}:${g.estateNo}`
              : 'home';
    const msg = { t: 'move', area, x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2), yaw: +Math.atan2(Math.sin(v.yaw), Math.cos(v.yaw)).toFixed(2), pose: v.pose };
    const key = JSON.stringify(msg);
    if (key === last) return;
    last = key;
    socket.send(key);
  }, 1000 / SEND_HZ);

  return () => {
    stopped = true;
    clearInterval(send);
    document.removeEventListener('visibilitychange', onResume);
    unsubSession();
    unsubGame();
    disconnect();
  };
}
