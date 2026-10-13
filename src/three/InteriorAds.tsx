// Player ads inside buildings. Each place gets the fixtures that suit it: framed posters on the walls,
// a TV / LED screen, cloth banners hung on the fence of open-air spots,
// and sandwich boards by the door. Blank spots say "your ad here"; tapping an ad opens its link,
// tapping a blank one opens the Ads sheet. Each fixture is its own bookable slot (src/game/boards.ts): an ad shows
// only on the fixture it was booked on.

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Ad } from '../game/ads';
import type { Interior } from '../game/interiors';
import { layout, NO_ADS, openFixtures, type Fixture } from '../game/interiorAds';
import { interiorBoard } from '../game/boards';
import { cityMap } from '../game/city';
import { useGame } from '../game/store';
import { useAds } from '../net/ads';
import { tapAd, useAdTexture, useRotation } from './Billboard';

function Face({ ad, w, h }: { ad: Ad | null; w: number; h: number }) {
  const map = useAdTexture(ad);
  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={map} roughness={0.9} />
    </mesh>
  );
}

/** Small tap target helper shared by every fixture. */
function Tappable({ ad, board, children }: { ad: Ad | null; board: string; children: React.ReactNode }) {
  return (
    <group
      onClick={(e) => { if (e.delta > 8) return; e.stopPropagation(); tapAd(ad, board); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      {children}
    </group>
  );
}

/** Vertical digital signage display — portrait LED screen like airport ad kiosks. */
function Poster({ ad, board }: { ad: Ad | null; board: string }) {
  const w = 0.7, h = 1.3;
  const map = useAdTexture(ad, w / h);
  return (
    <Tappable ad={ad} board={board}>
      {/* Dark bezel frame */}
      <mesh position={[0, 0, -0.025]}>
        <boxGeometry args={[w + 0.08, h + 0.08, 0.05]} />
        <meshStandardMaterial color="#111318" />
      </mesh>
      {/* Thin accent border */}
      <mesh position={[0, 0, -0.001]}>
        <planeGeometry args={[w + 0.03, h + 0.03]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {/* Emissive screen face */}
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.45} roughness={0.3} />
      </mesh>
    </Tappable>
  );
}

/** Outdoor digital display on fence — slim landscape screen with mounting bracket. */
function Banner({ ad, board }: { ad: Ad | null; board: string }) {
  const w = 1.7, h = 0.7;
  const map = useAdTexture(ad);
  return (
    <Tappable ad={ad} board={board}>
      {/* Mounting bracket at top */}
      <mesh position={[0, h / 2 + 0.04, -0.015]}>
        <boxGeometry args={[w * 0.6, 0.04, 0.04]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {/* Dark bezel */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[w + 0.06, h + 0.06, 0.04]} />
        <meshStandardMaterial color="#111318" />
      </mesh>
      {/* Emissive screen face */}
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.4} roughness={0.35} />
      </mesh>
    </Tappable>
  );
}

/** A TV / LED screen on the wall. Booked, it shows its one ad; unbooked, it rolls through the older unbooked ads. */
function Screen({ ads, board }: { ads: Ad[]; board: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (ads.length < 2) return;
    const t = setInterval(() => setI((n) => n + 1), 7000);
    return () => clearInterval(t);
  }, [ads.length]);
  const ad = ads.length ? ads[i % ads.length] : null;
  const w = 2.6, h = 1.3;
  return (
    <Tappable ad={ad} board={board}>
      <mesh position={[0, 0, -0.03]}>
        <boxGeometry args={[w + 0.16, h + 0.16, 0.08]} />
        <meshStandardMaterial color="#0f172a" flatShading />
      </mesh>
      <group position={[0, 0, 0.02]}>
        <ScreenFace ad={ad} w={w} h={h} />
      </group>
      <mesh position={[0, -h / 2 - 0.13, -0.02]}>
        <boxGeometry args={[0.5, 0.05, 0.03]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
    </Tappable>
  );
}

/** Same as Face but lit from within, so a screen glows in a dim club. */
function ScreenFace({ ad, w, h }: { ad: Ad | null; w: number; h: number }) {
  const map = useAdTexture(ad);
  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.55} roughness={0.4} />
    </mesh>
  );
}

/** A sandwich board on two legs, leaning back a touch, facing the room. */
function Easel({ ad, board }: { ad: Ad | null; board: string }) {
  const w = 1.0, h = 0.5;
  return (
    <Tappable ad={ad} board={board}>
      {[-w * 0.38, w * 0.38].map((x) => (
        <mesh key={x} position={[x, 0.3, -0.12]} rotation={[0.22, 0, 0]}>
          <boxGeometry args={[0.05, 0.62, 0.05]} />
          <meshStandardMaterial color="#57534e" flatShading />
        </mesh>
      ))}
      <group position={[0, 0.62, 0]} rotation={[-0.14, 0, 0]}>
        <mesh position={[0, 0, -0.02]}>
          <boxGeometry args={[w + 0.08, h + 0.08, 0.04]} />
          <meshStandardMaterial color="#3b2314" flatShading />
        </mesh>
        <group position={[0, 0, 0.005]}>
          <Face ad={ad} w={w} h={h} />
        </group>
      </group>
    </Tappable>
  );
}

/** A wall fixture goes out of sight when its wall drops to half height to let the camera see over it. */
function OnWall({ wall, indoor, children, ...place }: { wall: Fixture['wall']; indoor: boolean; x: number; y: number; z: number; yaw: number; it: Interior; children: React.ReactNode }) {
  const ref = useRef<Group>(null!);
  const { it } = place;
  useFrame(({ camera }) => {
    if (!indoor || wall === 'fence') return;
    const n = wall === 'back' ? [0, -1] : wall === 'left' ? [-1, 0] : [1, 0];
    ref.current.visible = n[0] * (camera.position.x - it.w / 2) + n[1] * (camera.position.z - it.h / 2) <= 0;
  });
  return <group ref={ref} position={[place.x, place.y, place.z]} rotation-y={place.yaw}>{children}</group>;
}

export function InteriorAds({ placeId, it }: { placeId: string; it: Interior }) {
  const fixtures = layout(placeId, it);
  // A board is in one city: Kaduna's airport posters are not Abuja's.
  const region = useGame((s) => cityMap(s.destinationId).id);
  const live = useAds((s) => s.live);
  const booked = new Map(live.filter((a) => a.board).map((a) => [a.board!, a]));
  const legacy = live.filter((a) => !a.board);
  const open = openFixtures(fixtures, it.w);
  const ads = useRotation(open.filter((i) => fixtures[i].kind !== 'screen').length, placeId);
  if (it.jungle || NO_ADS.has(placeId)) return null;
  let k = 0;
  return (
    <group>
      {fixtures.map((f, i) => {
        const indoor = !it.outdoor;
        const board = interiorBoard(placeId, i, region);
        const own = booked.get(board) ?? null;
        // Only the fixtures on sale hang empty. Any other is up just while an ad booked on it runs.
        const onSale = open.includes(i);
        if (!own && !onSale) return null;
        if (f.kind === 'screen') {
          return <OnWall key={i} wall={f.wall} indoor={indoor} x={f.x} y={f.y} z={f.z} yaw={f.yaw} it={it}><Screen ads={own ? [own] : legacy} board={board} /></OnWall>;
        }
        const old = onSale ? ads[k++] ?? null : null;
        const ad = own ?? old;
        return (
          <OnWall key={i} wall={f.wall} indoor={indoor} x={f.x} y={f.y} z={f.z} yaw={f.yaw} it={it}>
            {f.kind === 'poster' ? <Poster ad={ad} board={board} /> : f.kind === 'banner' ? <Banner ad={ad} board={board} /> : <Easel ad={ad} board={board} />}
          </OnWall>
        );
      })}
    </group>
  );
}
