import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import { avatarView } from "../game/avatar";
import { activeDesignOf, flightOf, useGame } from "../game/store";
import { lobbyArea, placeArea, remotePos, useNet, type RemoteInfo } from "../net/multiplayer";
import { usePlayerLabel, useSocial, type PlayerRef } from "../net/social";
import { usePolice } from "../net/crime";
import { ChatBubble } from "../ui/ChatBubble";
import { useVisit } from "../game/visits";
import { homeTransform } from "../game/origins";
import { TARGET_HEIGHT, type Clip } from "./Avatar";
import { Person, seatDrop } from "./Person";
import { offHover, onHover } from './HoverOutline';

const MAX_SEEN = 10;
let cache = { t: 0, ids: new Set<string>() };
/** Ids of the MAX_SEEN closest remote players in my building; recomputed ~4x/sec, shared by all Remotes. */
function nearest() {
  const now = performance.now();
  if (now - cache.t < 250) return cache.ids;
  const gs = useGame.getState();
  const visit = useVisit.getState().current;
  const area = visit
    ? `home:${visit.ownerUid}`
    : gs.view === "home"
      ? `home:${useNet.getState().myId}`
      : placeArea(gs, useNet.getState().myId);
  const me = avatarView;
  const list: [string, number][] = [];
  remotePos.forEach((p, id) => {
    if (p.area === lobbyArea(area)) list.push([id, (p.x - me.x) ** 2 + (p.z - me.z) ** 2]);
  });
  list.sort((a, b) => a[1] - b[1]);
  const ids = list.slice(0, MAX_SEEN).map((e) => e[0]);
  // The same Set is kept while nobody enters or leaves view, so RemotePlayers only re-renders when someone does.
  const same = ids.length === cache.ids.size && ids.every((id) => cache.ids.has(id));
  cache = { t: now, ids: same ? cache.ids : new Set(ids) };
  return cache.ids;
}

function Remote({ info }: { info: RemoteInfo }) {
  const group = useRef<Group>(null!);
  const body = useRef<Group>(null!);
  const clip = useRef<Clip>("idle");
  const placed = useRef(false);
  const [shown, setShown] = useState(false);
  const bubble = useNet((s) => s.bubbles[info.id]);
  const label = usePlayerLabel(info.id, info.username);
  const wanted = usePolice((s) => s.wanted.some((w) => w.uid === info.id));
  const visit = useVisit((s) => s.current);
  const openInteractions = () => {
    const player: PlayerRef = { uid: info.id, username: info.username, name: info.name };
    useSocial.setState((s) => ({
      interactionWith: player,
      players: { ...s.players, [info.id]: player },
    }));
  };

  useFrame((_, dt) => {
    const p = remotePos.get(info.id);
    const g = group.current;
    // Players are only visible in the same building or hosted house.
    const gs = useGame.getState();
    const area = visit
      ? `home:${visit.ownerUid}`
      : gs.view === "home"
        ? `home:${useNet.getState().myId}`
        : gs.view === "place"
          ? placeArea(gs, useNet.getState().myId)
          : null;
    if (
      !p ||
      !area ||
      p.area !== lobbyArea(area) ||
      !nearest().has(info.id)
    ) {
      g.visible = false;
      placed.current = false;
      setShown(false);
      return;
    }
    g.visible = p.pose !== "hidden";
    setShown(g.visible);
    // Updates arrive ~5 times a second; ease towards them so movement looks smooth.
    const k = placed.current ? Math.min(1, dt * 8) : 1;
    placed.current = true;
    g.position.x += (p.x - g.position.x) * k;
    g.position.y += (p.y - g.position.y) * k;
    g.position.z += (p.z - g.position.z) * k;
    let diff = p.yaw - g.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.rotation.y += diff * k;

    const b = body.current;
    if (p.pose === "lie") {
      b.rotation.set(-Math.PI / 2, 0, 0);
      b.position.set(0, 0.1, 0);
      clip.current = "lie";
    } else if (p.pose === "sit") {
      b.rotation.set(0, 0, 0);
      b.position.set(0, -seatDrop(p.y), 0);
      clip.current = "sit";
    } else {
      b.rotation.set(0, 0, 0);
      b.position.set(0, 0, 0);
      clip.current = p.pose === "walk" ? "walk" : "idle";
    }
  });

  return (
    // Others are only seen inside buildings, so they're always at full size.
    <group ref={group} visible={false} scale={1}>
      <group ref={body}>
        <Person look={info.look} clipRef={clip} />
      </group>
      {shown && (
        <mesh
          visible={false}
          position={[0, TARGET_HEIGHT / 2, 0]}
          onClick={(event) => { event.stopPropagation(); openInteractions(); }}
          onPointerOver={(e) => onHover(e, body.current)}
          onPointerOut={offHover}
        >
          <capsuleGeometry args={[0.55, Math.max(0.2, TARGET_HEIGHT - 0.7), 4, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {shown && (
        <Html
          position={[0, TARGET_HEIGHT + 0.35, 0]}
          center
          distanceFactor={14}
          zIndexRange={[10, 0]}
        >
          <div className="nametag">
            {bubble && <ChatBubble text={bubble.text} />}
            {wanted && <span className="nametag-wanted">🚨 WANTED</span>}
            <button onClick={openInteractions}>
              {label}
            </button>
          </div>
        </Html>
      )}
    </group>
  );
}

export function RemotePlayers() {
  const players = useNet((s) => s.players);
  // The room holds up to 50 players but at most MAX_SEEN are in view, so only those get a body.
  const [near, setNear] = useState(cache.ids);
  useFrame(() => {
    const ids = nearest();
    if (ids !== near) setNear(ids);
  });
  const visit = useVisit((s) => s.current);
  const view = useGame((s) => s.view);
  const origin = useGame((s) => s.origin);
  const homeOrigin = visit?.save.origin ?? origin;
  const inHome = !!visit || view === "home";
  const myDesign = useGame(activeDesignOf);
  // In the air there is only the cabin: the people back in the terminal are not in it.
  const flying = useGame((s) => !!flightOf(s));
  const transform = inHome ? homeTransform(homeOrigin, visit ? visit.save.design : myDesign) : { scale: 1, x: 0, z: 0 };
  if (flying) return null;
  return (
    <group position={[transform.x, 0, transform.z]} scale={[transform.scale, 1, transform.scale]}>
      {Object.values(players).map((p) => near.has(p.id) && (
        <Remote key={p.id + p.look} info={p} />
      ))}
    </group>
  );
}
