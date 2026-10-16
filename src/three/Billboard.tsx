// Billboards for player ads: on the roadsides in the city and along the verges of the estates. Every board is its
// own slot: an ad is booked on one board and shows only there. A board with no ad says "your ad here"; tapping it
// opens the Ads sheet with that board picked, tapping an ad opens its link.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, Color, SRGBColorSpace, Vector2, type MeshBasicMaterial } from 'three';
import { cityMap, type BillboardSpot } from '../game/city';
import { BILLBOARDS_HIDDEN, cityBoard, cityBoardOpen, ESTATE_BILLBOARDS, estateBoard, parseSea } from '../game/boards';
import { ADS_ON_SALE, type Ad } from '../game/ads';
import { photoHour } from '../game/photo';
import { hourOf, useGame } from '../game/store';
import { LIGHTS_ON, sceneHour, useTheme } from '../game/theme';
import { loadAds, openAdsSheet, useAds } from '../net/ads';
import { useSession } from '../net/session';
import { useTour } from '../game/tour';
import { useAuthUi } from '../ui/Auth';
import { B } from './models';
import { offHover, onHover } from './HoverOutline';

/** Boards lean back so the face reads from the high camera. */
const TILT = 0.7;
/** Roadside boards are small enough to sit on a verge without covering the road. */
const CITY_SCALE = 1;
/** Boards lean back, so the top swings toward whatever is behind: stand them this much further forward. */
const FORWARD = 1.2;

const PAINTS: [string, string, string][] = [
  ['#f2c14e', '#7a1f1f', '#3b2314'], ['#2a7f62', '#fff4d6', '#0f3d2e'], ['#c8553d', '#fff4d6', '#4a1c14'],
  ['#264653', '#f4d35e', '#0b1d24'], ['#f4f1de', '#b5382a', '#3d405b'], ['#7b2d8b', '#ffe8a3', '#2c0f33'],
];
const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].replace(/.{1,2}$/, '')}…`; }
  return lines;
}

const IMAGES = new Map<string, HTMLImageElement>();

/** Paint one board: border, big lettering, small print, and the poster's picture when there is one. */
export function paint(canvas: HTMLCanvasElement, ad: Ad | null, img: HTMLImageElement | null, aspect = 2, frameless = false) {
  const H = 256;
  const W = Math.round(H * aspect);
  const full = !!ad?.fill && !!img && img.width > 0;
  // One fixed size: a texture can't change size on the GPU once it has been uploaded, so a picture
  // that arrives late (or a board switching between plain and full-picture ads) would never show.
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d')!;
  if (full) {
    // Cover the whole board: scale up to fill, crop the overflow from the centre.
    const r = Math.max(canvas.width / img!.width, canvas.height / img!.height);
    const iw = img!.width * r, ih = img!.height * r;
    ctx.drawImage(img!, (canvas.width - iw) / 2, (canvas.height - ih) / 2, iw, ih);
    return;
  }
  ctx.scale(2, 2);
  const [bg, ink, edge] = ad ? PAINTS[hash(ad.id) % PAINTS.length] : ['#fbe9c6', '#7a1f1f', '#8a5a3a'];
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (!frameless) {
    ctx.strokeStyle = edge; ctx.lineWidth = 12; ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.strokeRect(18, 18, W - 36, H - 36);
  }
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!ad) {
    if (aspect < 1) {
      // Portrait: stack text vertically to fit narrow screen.
      const sz = Math.round(W * 0.32);
      ctx.font = `900 ${sz}px Impact, "Arial Black", sans-serif`;
      ctx.fillText('YOUR', W / 2, H * 0.28);
      ctx.fillText('AD', W / 2, H * 0.28 + sz * 1.1);
      ctx.fillText('HERE', W / 2, H * 0.28 + sz * 2.2);
      ctx.font = `800 ${Math.round(sz * 0.38)}px system-ui, sans-serif`;
      ctx.fillText('Tap to book', W / 2, H * 0.75);
    } else {
      ctx.font = '900 64px Impact, "Arial Black", sans-serif';
      ctx.fillText('YOUR AD HERE', W / 2, H * 0.4);
      ctx.font = '800 26px system-ui, sans-serif';
      ctx.fillText('Tap to book this billboard', W / 2, H * 0.72);
    }
    return;
  }
  const hasImg = !!img && img.width > 0;
  const imgW = hasImg ? W * 0.34 : 0;
  const textL = 34 + imgW;
  const textW = W - textL - 34;
  if (hasImg) {
    const box = H - 70;
    const r = Math.min(imgW - 14, box) / Math.max(img!.width, img!.height);
    const iw = img!.width * r, ih = img!.height * r;
    ctx.drawImage(img!, 34 + (imgW - 14 - iw) / 2, (H - ih) / 2, iw, ih);
  }
  const cx = textL + textW / 2;
  let size = 62;
  ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
  let lines = wrap(ctx, ad.title.toUpperCase(), textW, 2);
  while (size > 24 && lines.some((l) => ctx.measureText(l).width > textW)) {
    size -= 4;
    ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
    lines = wrap(ctx, ad.title.toUpperCase(), textW, 2);
  }
  const small = 22;
  ctx.font = `700 ${small}px system-ui, sans-serif`;
  const body = wrap(ctx, ad.body, textW, 3);
  const total = lines.length * size * 1.05 + body.length * small * 1.25 + (ad.link ? small * 1.6 : 0);
  let y = (H - total) / 2 + size * 0.5;
  ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
  for (const l of lines) { ctx.fillText(l, cx, y); y += size * 1.05; }
  ctx.font = `700 ${small}px system-ui, sans-serif`;
  y += small * 0.2;
  for (const l of body) { ctx.fillText(l, cx, y); y += small * 1.25; }
  if (ad.link) { ctx.font = `800 ${small * 0.9}px system-ui, sans-serif`; ctx.fillText('TAP TO OPEN ▸', cx, y + small * 0.6); }
}

/** A canvas texture that paints the given ad (or the "your ad here" face) and repaints when the ad or its picture changes. */
export function useAdTexture(ad: Ad | null, aspect = 2, frameless = false) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    paint(canvas, null, null, aspect, frameless);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [aspect, frameless]);
  useEffect(() => {
    const repaint = (img: HTMLImageElement | null) => { paint(texture.image as HTMLCanvasElement, ad, img, aspect, frameless); texture.needsUpdate = true; };
    const src = ad?.image ? `${ad.image}?w=${ad.fill ? 1024 : 256}` : null;
    // A picture seen before paints at once, so a refresh of the ad list never flashes the plain board.
    const cached = src ? IMAGES.get(src) : undefined;
    repaint(cached ?? null);
    if (!src || cached) return;
    let live = true;
    const img = new Image();
    img.onload = () => { IMAGES.set(src, img); if (live) repaint(img); };
    img.src = src;
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad?.id, ad?.title, ad?.body, ad?.link, ad?.image, ad?.fill, texture, aspect, frameless]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Tapping an ad opens its link; tapping a blank board opens the Ads sheet. */
export const tapAd = (ad: Ad | null, board: string | null = null) => {
  // A visitor on the city tour has to sign up before they can book a board.
  if (!ad && !ADS_ON_SALE) return;
  if (!ad && useTour.getState().city) useAuthUi.getState().show('up');
  else if (!ad) openAdsSheet(board);
  else if (ad.link) window.open(ad.link, '_blank', 'noopener,noreferrer');
};

const afterDark = () => {
  const h = photoHour() ?? sceneHour(hourOf(useGame.getState().minutes));
  return h < 6.3 || h >= LIGHTS_ON;
};

/** True after dark, when the boards light up. Re-renders only at dusk and dawn. */
function useNight() {
  const [night, setNight] = useState(afterDark);
  useFrame(() => { const n = afterDark(); if (n !== night) setNight(n); });
  return night;
}

/** How brightly a board's face glows after dark: backlit like a lightbox, so it reads against the dark street. */
const BOARD_GLOW = 0.9;

/** One board on two posts. `scale` 1 is the roadside size; estates use a smaller one. */
function Board({ ad, scale, board, night }: { ad: Ad | null; scale: number; board: string; night: boolean }) {
  const texture = useAdTexture(ad);
  const bw = 4 * scale;
  const bh = 2 * scale;
  const legs = 1.1 * scale;
  return (
    <group
      onClick={(e) => {
        if (e.delta > 8) return;
        e.stopPropagation();
        tapAd(ad, board);
      }}
      // Only a booked board does anything when tapped (it opens the ad's link).
      onPointerOver={(e) => ad && onHover(e)}
      onPointerOut={offHover}
    >
      {[-bw * 0.36, bw * 0.36].map((x) => <B key={x} p={[x, legs / 2, 0]} s={[0.14 * scale, legs, 0.14 * scale]} c="#57534e" />)}
      <B p={[0, legs + bh / 2, -0.06 * scale]} s={[bw + 0.2 * scale, bh + 0.2 * scale, 0.1 * scale]} c="#3b2314" />
      <mesh position={[0, legs + bh / 2, 0]}>
        <planeGeometry args={[bw, bh]} />
        <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={night ? BOARD_GLOW : 0} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Indoor fixtures (posters, screens, banners) roll through the older ads that were never booked on a billboard. */
export function useRotation(count: number, scope = '') {
  const live = useAds((s) => s.live);
  const signedIn = !!useSession((s) => s.user?.username);
  useEffect(() => { void loadAds(); }, [signedIn]);
  return useMemo(() => {
    const boards: (Ad | null)[] = Array.from({ length: count }, () => null);
    const ads = live.filter((a) => !a.board).sort((x, y) => (x.id < y.id ? -1 : 1));
    for (const a of ads) {
      if (boards.every(Boolean)) break;
      let i = hash(a.id + scope) % count;
      while (boards[i]) i = (i + 1) % count;
      boards[i] = a;
    }
    return boards;
  }, [live, count, scope]);
}

/** The ad booked on each board, by board key. */
function useBooked() {
  const live = useAds((s) => s.live);
  const signedIn = !!useSession((s) => s.user?.username);
  useEffect(() => { void loadAds(); }, [signedIn]);
  return useMemo(() => new Map(live.filter((a) => a.board).map((a) => [a.board!, a])), [live]);
}

/** Roadside billboards on a city's map. */
export function CityBillboards({ region }: { region: string }) {
  const started = useGame((s) => s.started);
  const booked = useBooked();
  const night = useNight();
  // Visitors looking round before signing in see the boards too.
  const touring = useTour((s) => !!s.city);
  // The hooks above still run while the boards are put away: useBooked loads the ads the sea shows.
  if (BILLBOARDS_HIDDEN || (!started && !touring)) return null;
  return (
    <group>
      {cityMap(region).billboards.map((b: BillboardSpot, i) => {
        const ad = booked.get(cityBoard(i, region)) ?? null;
        // Only the boards on sale stand empty. Any other is up just while an ad booked on it runs.
        if (!ad && !cityBoardOpen(i, region)) return null;
        return (
          <group key={i} position={[b.x + 0.5, 0, b.z + 0.5 + FORWARD]} rotation={[-TILT, 0, 0]}>
            <Board ad={ad} scale={CITY_SCALE} board={cityBoard(i, region)} night={night} />
          </group>
        );
      })}
    </group>
  );
}

/** Billboards along an estate's verges. `width` is the estate's width, for the right-hand ones. */
export function EstateBillboards({ width, region }: { width: number; region: string }) {
  const booked = useBooked();
  const night = useNight();
  if (BILLBOARDS_HIDDEN) return null;
  return (
    <group>
      {ESTATE_BILLBOARDS.map((b, i) => (
        <group key={i} position={[b.side < 0 ? b.x : width + b.x, 0, b.z + FORWARD]} rotation={[-TILT, 0, 0]}>
          <Board ad={booked.get(estateBoard(region, i)) ?? null} scale={0.85} board={estateBoard(region, i)} night={night} />
        </group>
      ))}
    </group>
  );
}

const SEA_WATER_Y = -0.55;

/** How far a sea ad's light spills over the dark water, in cells. */
const SEA_GLOW_REACH = 1.6;

const GLOW_VERT = `
varying vec2 vAt;
void main() {
  vAt = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// A bright line hugging the ad's edge, then light fading out across the water.
const GLOW_FRAG = `
precision highp float;
varying vec2 vAt;
uniform vec2 uHalf;
uniform float uReach;
uniform vec3 uColor;
void main() {
  float dist = length(max(abs(vAt) - uHalf, 0.0));
  float rim = 1.0 - smoothstep(0.06, 0.14, dist);
  float spill = 1.0 - clamp(dist / uReach, 0.0, 1.0);
  gl_FragColor = vec4(uColor, max(rim, spill * spill * 0.5));
}`;

/** After dark a sea ad is lit round its edge and throws light on the water, so it stands out from the night sea. */
function SeaGlow({ w, d }: { w: number; d: number }) {
  const uniforms = useMemo(() => ({
    uHalf: { value: new Vector2(w / 2, d / 2) },
    uReach: { value: SEA_GLOW_REACH },
    uColor: { value: new Color('#9bd8ff') },
  }), [w, d]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_WATER_Y + 0.015, 0]} raycast={() => null}>
      <planeGeometry args={[w + SEA_GLOW_REACH * 2, d + SEA_GLOW_REACH * 2]} />
      <shaderMaterial vertexShader={GLOW_VERT} fragmentShader={GLOW_FRAG} uniforms={uniforms} transparent depthWrite={false} blending={AdditiveBlending} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} toneMapped={false} />
    </mesh>
  );
}

/** A flat plane on the water surface that fills the grid cells the advertiser paid for. */
function SeaBoard({ ad, w, d, glow }: { ad: Ad; w: number; d: number; glow: boolean }) {
  const texture = useAdTexture(ad, w / d, true);
  return (
    <>
      {glow && <SeaGlow w={w} d={d} />}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, SEA_WATER_Y + 0.02, 0]}
        onClick={(e) => {
          if (e.delta > 8) return;
          e.stopPropagation();
          tapAd(ad);
        }}
      >
        <planeGeometry args={[w, d]} />
        {/* Pulled in front of the booking grid, whose lines would otherwise cross the ad. */}
        <meshBasicMaterial map={texture} toneMapped={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </mesh>
    </>
  );
}

/** The sea around a city's island, centred on (x, z), and the ads booked on it. */
export function SeaAds({ region, x = 30, z = 42 }: { region: string; x?: number; z?: number }) {
  const live = useAds((s) => s.live);
  const boards = useMemo(
    () => live.flatMap((a) => { const r = a.board ? parseSea(a.board) : null; return r && (r.region ?? 'kaduna') === region ? [{ ad: a, r }] : []; }),
    [live, region],
  );
  // A visitor's tour of a city is always shown by day (game/theme.ts), so there it is the day sea in either appearance.
  const touring = useTour((s) => !!s.city);
  const dark = useTheme((s) => s.mode === 'dark') && !touring;
  // The sea is the sky the island floats in, so it takes the sky's colour (three/Scene.tsx): day blue, night navy,
  // greyed by cloud and dusted by harmattan. It is drawn before everything else so the sun and moon can sit on it,
  // and writes no depth: the island's rock, waterfalls and clouds hang below it (three/IslandBase.tsx) and must show.
  const sea = useRef<MeshBasicMaterial>(null);
  useFrame(({ scene }) => {
    const bg = scene.background as Color | null;
    if (sea.current && bg?.isColor) sea.current.color.copy(bg);
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, SEA_WATER_Y, z]} raycast={() => null} renderOrder={-20}>
        <circleGeometry args={[160, 48]} />
        <meshBasicMaterial ref={sea} color={dark ? '#0b1430' : '#bfe3f5'} toneMapped={false} depthWrite={false} />
      </mesh>
      {boards.map(({ ad, r }) => (
        <group key={ad.id} position={[r.x + r.w / 2, 0, r.z + r.d / 2]}>
          <SeaBoard ad={ad} w={r.w} d={r.d} glow={dark} />
        </group>
      ))}
    </group>
  );
}
