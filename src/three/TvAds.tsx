// Player ads on the TVs in people's houses. A city's home TVs share a few bookable slots (`tv:<city>:<n>`,
// src/game/boards.ts): a TV that is on rolls through the ads booked on them, in your own house and in one you visit.
// With no ad booked the TV keeps its plain screen. Tapping the set still picks the TV, not the ad.

import { useEffect, useMemo, useState } from 'react';
import { parseTv } from '../game/boards';
import { cityMap } from '../game/city';
import { useGame } from '../game/store';
import { loadLiveAds, useAds } from '../net/ads';
import { useAdTexture } from './Billboard';
import type { Ad } from '../game/ads';

/** How long each ad stays on screen. */
const SHOW_MS = 8000;
/** How often a TV that is on looks for newly booked ads. */
const REFRESH_MS = 5 * 60_000;
/** The glass of the flat screen TV (models.tsx 'tv'). */
const W = 1.42, H = 0.78;

/** Shared by every TV in the house, so two sets do not both fetch. */
let loadedAt = 0;
function refresh() {
  if (Date.now() - loadedAt < REFRESH_MS) return;
  loadedAt = Date.now();
  void loadLiveAds();
}

function Glass({ ad }: { ad: Ad }) {
  // No "tap to open" line: a tap on the set picks the TV.
  const map = useAdTexture(useMemo(() => ({ ...ad, link: null }), [ad]), W / H, true);
  return (
    <mesh position={[0, 1.0, -0.083]} raycast={() => null}>
      <planeGeometry args={[W, H]} />
      {/* Lit from within: the picture keeps its own colours whatever the room's light. */}
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}

/** The ad on a TV's glass right now. Goes inside the TV's own group, and only while the set has power. */
export function TvAd() {
  const started = useGame((s) => s.started);
  // The channel is the city's: a house in Abuja does not show Kaduna's ads.
  const region = useGame((s) => cityMap(s.destinationId).id);
  const live = useAds((s) => s.live);
  const ads = useMemo(
    () => live.filter((a) => parseTv(a.board ?? '')?.region === region).sort((x, y) => (x.board! < y.board! ? -1 : 1)),
    [live, region],
  );
  // Counted off the clock, so every TV (and every player) is on the same ad at the same time.
  const [turn, setTurn] = useState(() => Math.floor(Date.now() / SHOW_MS));
  useEffect(() => {
    if (!started) return;
    refresh();
    const t = setInterval(() => { refresh(); setTurn(Math.floor(Date.now() / SHOW_MS)); }, 1000);
    return () => clearInterval(t);
  }, [started]);
  if (!started) return null;
  const now = Date.now();
  const showing = ads.filter((a) => !a.endsAt || a.endsAt > now);
  if (!showing.length) return null;
  return <Glass ad={showing[turn % showing.length]} />;
}
