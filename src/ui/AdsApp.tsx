import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AD_LIMITS, type AdPlan } from '../game/ads';
import {
  BILLBOARDS_HIDDEN, boardLabel, boardPrice, boardSpot, cityBoard, cityBoardOpen, interiorBoard,
  parseSea, seaAutoPlace, seaBoard, seaCellOpen as seaCellOpenIn, seaZone, tvBoard,
  SEA_MARGIN, SEA_MAX_D, SEA_MAX_W, SEA_PLANS, SEA_ZONES, TV_SLOTS,
  type SeaRect,
} from '../game/boards';
import { cityMap, PLACE_BY_ID } from '../game/city';
import { regionOf } from '../game/regions';
import { INTERIORS } from '../game/interiors';
import { layout, NO_ADS, openFixtures } from '../game/interiorAds';
import { useSession } from '../net/session';
import { closeAdsSheet, loadAds, payForAd, placeAd, removeAd, uploadAdImage, useAds } from '../net/ads';
import { useGame } from '../game/store';

const price = (n: number) => `₦${n.toLocaleString('en-NG')}`;
const STEPS = ['Spot', 'Plan', 'Write', 'Picture', 'Pay'] as const;
const STATUS: Record<string, string> = { awaiting_payment: 'Awaiting payment', active: 'Live', removed: 'Removed' };
const KIND_LABEL: Record<string, string> = { poster: 'Wall poster', banner: 'Fence banner', screen: 'TV screen', easel: 'Sandwich board' };

/** Grid lines round every sea cell of a city an ad can be booked on, as one path. Cells the island reaches into get none. */
function seaGridPath(region: string): string {
  const { w: CITY_W, h: CITY_H } = cityMap(region);
  const seaCellOpen = (x: number, z: number) => seaCellOpenIn(x, z, region);
  const x0 = -SEA_MARGIN, x1 = CITY_W + SEA_MARGIN, z0 = -SEA_MARGIN, z1 = CITY_H + SEA_MARGIN;
  let d = '';
  // A line is drawn where a cell on either side of it is bookable; neighbouring pieces join into one run.
  for (let z = z0; z <= z1; z++) {
    for (let x = x0, from = x0; x <= x1; x++) {
      if (seaCellOpen(x, z - 1) || seaCellOpen(x, z)) continue;
      if (x > from) d += `M${from} ${z}h${x - from}`;
      from = x + 1;
    }
  }
  for (let x = x0; x <= x1; x++) {
    for (let z = z0, from = z0; z <= z1; z++) {
      if (seaCellOpen(x - 1, z) || seaCellOpen(x, z)) continue;
      if (z > from) d += `M${x} ${from}v${z - from}`;
      from = z + 1;
    }
  }
  return d;
}

function getInteriorFixtures(id: string) {
  const it = INTERIORS[id];
  return it && !it.jungle && !NO_ADS.has(id) ? layout(id, it) : [];
}

/**
 * The Ads bottom sheet: pick a plan, write the ad, add a picture and link, pay.
 * Its classes start with bk- (booking) and the dialog takes its name from the heading: ad blockers hide anything
 * called .ad-tabs, .ad-place or aria-label="Ads", which left only the dimmed backdrop on screen.
 */
export function AdsSheet() {
  const open = useAds((s) => s.sheetOpen);
  const region = useGame((s) => s.destinationId);
  const tap = useRef<{ x: number; y: number } | null>(null);
  const onBackdropDown = useCallback((e: React.PointerEvent) => {
    if (e.target === e.currentTarget) tap.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onBackdropUp = useCallback((e: React.PointerEvent) => {
    const s = tap.current; tap.current = null;
    if (s && Math.abs(e.clientX - s.x) < 8 && Math.abs(e.clientY - s.y) < 8) closeAdsSheet();
  }, []);
  if (!open) return null;
  return (
    <div className="bk-backdrop" onPointerDown={onBackdropDown} onPointerUp={onBackdropUp}>
      <div className="bk-sheet" role="dialog" aria-modal="true" aria-labelledby="bk-title">
        <div className="bk-sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <h3 id="bk-title">📣 {regionOf(region).name} Ads</h3>
          <button className="x" onClick={closeAdsSheet} aria-label="Close">✕</button>
        </div>
        <AdsBody />
      </div>
    </div>
  );
}

/** Thumbnail of the city an ad is in, with a pin on its board. */
function AdSpotMap({ board }: { board: string }) {
  const spot = boardSpot(board);
  if (!spot) return null;
  const map = cityMap(spot.region);
  const w = map.w + SEA_MARGIN * 2, h = map.h + SEA_MARGIN * 2;
  const pin = Math.max(w, h) / 14;
  return (
    <svg className="bk-spot-map" viewBox={`${-SEA_MARGIN} ${-SEA_MARGIN} ${w} ${h}`} role="img" aria-label={`Where it is in ${regionOf(spot.region).name}`}>
      <rect x={-SEA_MARGIN} y={-SEA_MARGIN} width={w} height={h} fill="#3b82a8" />
      <polygon points={map.outline.map(([x, z]) => `${x},${z}`).join(' ')} fill="#9fbf5a" />
      {map.roads.map((r, i) => <rect key={i} x={r.x} y={r.z} width={r.w} height={r.d} fill="#e2d5be" />)}
      <circle cx={spot.x} cy={spot.z} r={pin} fill="#ef4444" stroke="#fff" strokeWidth={pin * 0.4} />
    </svg>
  );
}

/* ---------- Interactive map picker ---------- */

/** The map of `region`, the city you are in: its roadside boards and its sea are what you can book from here. */
function AdMapPicker({ region, board, onChange, held, reserved, takenSea, children }: {
  region: string; board: string; onChange: (k: string) => void; held: Map<string, unknown>; reserved: string[]; takenSea: SeaRect[]; /** Spots that are not on the map, listed under it. */ children?: React.ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const map = cityMap(region);
  const { w: CITY_W, h: CITY_H, places: PLACES, roads: ROADS, billboards: BILLBOARDS } = map;
  const MAP_W = CITY_W + SEA_MARGIN * 2, MAP_H = CITY_H + SEA_MARGIN * 2;
  const OUTLINE_PTS = useMemo(() => map.outline.map(([x, z]) => `${x},${z}`).join(' '), [map]);
  const RIVER_PTS = useMemo(() => map.riverDraw.map(([x, z]) => `${x},${z}`).join(' '), [map]);
  const seaCellOpen = (x: number, z: number) => seaCellOpenIn(x, z, region);
  // Opened by tapping water in the world: keep that block's size and start zoomed in on it.
  const start = useMemo(() => parseSea(board), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [zoom, setZoom] = useState(start ? 2.5 : 1);
  const [pan, setPan] = useState<[number, number]>(start ? [start.x + start.w / 2 - CITY_W / 2, start.z + start.d / 2 - CITY_H / 2] : [0, 0]);
  const [seaW, setSeaW] = useState(start?.w ?? 2);
  const [seaD, setSeaD] = useState(start?.d ?? 1);
  const drag = useRef<{ sx: number; sy: number; px: number; pz: number; moved: boolean } | null>(null);
  // Fingers on the map, and the spread and zoom a two-finger pinch started from.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const spread = () => {
    const [a, b] = [...touches.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const vw = MAP_W / zoom, vh = MAP_H / zoom;
  // Billboard dots keep a readable size when zoomed out, and stop growing once you are close.
  const dot = Math.max(0.8, vw / 55);
  const vx = Math.max(-SEA_MARGIN, Math.min(CITY_W + SEA_MARGIN - vw, -SEA_MARGIN + (MAP_W - vw) / 2 + pan[0]));
  const vz = Math.max(-SEA_MARGIN, Math.min(CITY_H + SEA_MARGIN - vh, -SEA_MARGIN + (MAP_H - vh) / 2 + pan[1]));

  const seaRect = useMemo(() => parseSea(board), [board]);
  const seaGrid = useMemo(() => seaGridPath(region), [region]);
  const isSea = board.startsWith('sea:');

  // Re-place sea ad when size changes
  useEffect(() => {
    if (!isSea) return;
    const cur = parseSea(board);
    if (!cur || (cur.w === seaW && cur.d === seaD)) return;
    const placed = seaAutoPlace(seaZone(cur), { w: seaW, d: seaD }, takenSea, { x: cur.x + cur.w / 2, z: cur.z + cur.d / 2 }, region);
    onChange(placed ? seaBoard(placed) : '');
  }, [seaW, seaD]); // eslint-disable-line react-hooks/exhaustive-deps

  // Non-passive wheel zoom
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const fn = (e: WheelEvent) => { e.preventDefault(); setZoom(z => Math.max(1, Math.min(8, z * (e.deltaY > 0 ? 0.85 : 1.18)))); };
    el.addEventListener('wheel', fn, { passive: false });
    return () => el.removeEventListener('wheel', fn);
  }, []);

  // Screen pixels per map tile. The map is letterboxed inside its box, so this comes from the SVG itself, not the box size.
  const pxPerTile = () => svgRef.current?.getScreenCTM()?.a || 1;
  const toWorld = (cx: number, cy: number) => {
    const m = svgRef.current!.getScreenCTM()!;
    return { x: (cx - m.e) / m.a, z: (cy - m.f) / m.d };
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (touches.current.size === 2) {
      pinch.current = { dist: spread() || 1, zoom };
      drag.current = null;
    } else if (touches.current.size === 1) {
      drag.current = { sx: e.clientX, sy: e.clientY, px: pan[0], pz: pan[1], moved: false };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && touches.current.size >= 2) {
      setZoom(Math.max(1, Math.min(8, p.zoom * spread() / p.dist)));
      return;
    }
    const d = drag.current; if (!d) return;
    // A finger wobbles more than a mouse: a small slip is still a tap.
    const slop = e.pointerType === 'mouse' ? 3 : 8;
    if (!d.moved && (Math.abs(e.clientX - d.sx) > slop || Math.abs(e.clientY - d.sy) > slop)) d.moved = true;
    if (!d.moved) return;
    const k = pxPerTile();
    setPan([d.px - (e.clientX - d.sx) / k, d.pz - (e.clientY - d.sy) / k]);
  };
  const onCancel = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    drag.current = null;
  };
  const onUp = (e: React.PointerEvent) => {
    const pinched = !!pinch.current;
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    const d = drag.current; drag.current = null;
    if (pinched || !d || d.moved) return;
    const pt = toWorld(e.clientX, e.clientY);
    // A tap picks the nearest billboard within a finger's reach, so the dots work without zooming in first.
    const reach = 24 / pxPerTile();
    let near = -1, nearDist = reach;
    BILLBOARDS.forEach((b, i) => {
      if (!cityBoardOpen(i, region)) return;
      const dist = Math.hypot(b.x + 0.5 - pt.x, b.z + 0.5 - pt.z);
      if (dist < nearDist) { near = i; nearDist = dist; }
    });
    if (near >= 0) {
      const key = cityBoard(near, region);
      if (!held.has(key) && !reserved.includes(key)) onChange(board === key ? '' : key);
      return;
    }
    // Click on background → try sea placement if on a bookable water cell
    if (seaCellOpen(Math.floor(pt.x), Math.floor(pt.z))) {
      const col: 0 | 1 | 2 = pt.x < 0 ? 0 : pt.x > CITY_W ? 2 : 1;
      const row: 0 | 1 | 2 = pt.z < 0 ? 0 : pt.z > CITY_H ? 2 : 1;
      const zone = SEA_ZONES.find(z => z.col === col && z.row === row)!;
      const placed = seaAutoPlace(zone, { w: seaW, d: seaD }, takenSea, pt, region);
      if (placed) onChange(seaBoard(placed));
    }
  };

  return (
    <div className="bk-map-picker">
      <div className="bk-map-wrap">
        <svg ref={svgRef} className="bk-map" viewBox={`${vx} ${vz} ${vw} ${vh}`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}>
          {/* Water */}
          <rect x={-SEA_MARGIN} y={-SEA_MARGIN} width={MAP_W} height={MAP_H} fill="#3b82a8" />
          {/* Sea grid – only round the cells an ad can go on, so none of it runs into the island */}
          <path d={seaGrid} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={0.05} pointerEvents="none" />
          {/* Land */}
          <polygon points={OUTLINE_PTS} fill="#9fbf5a" stroke="#7a9a4a" strokeWidth={0.4} />
          {/* River and roads stop at the shore, as they do in the world: none of it runs out over the sea grid */}
          <clipPath id="bk-map-land"><polygon points={OUTLINE_PTS} /></clipPath>
          <g clipPath="url(#bk-map-land)">
            {map.riverDraw.length > 1 && <polyline points={RIVER_PTS} fill="none" stroke="#4a9ec4" strokeWidth={map.riverHalf * 2} strokeLinecap="round" strokeLinejoin="round" />}
            {map.lakes.map((l) => <ellipse key={l.name} cx={l.x} cy={l.z} rx={l.rx} ry={l.rz} fill="#4a9ec4" />)}
            {ROADS.map((r, i) => <rect key={i} x={r.x} y={r.z} width={r.w} height={r.d} fill={r.main ? '#e2d5be' : '#d6c8ac'} />)}
          </g>
          {/* Places */}
          {PLACES.map(p => <rect key={p.id} x={p.x} y={p.z} width={p.w} height={p.d} fill="#d4c4a8" stroke="#c0ae8e" strokeWidth={0.15} />)}
          {zoom >= 3 && PLACES.map(p => (
            <text key={`i${p.id}`} x={p.x + p.w / 2} y={p.z + p.d / 2 + 0.4} textAnchor="middle" fontSize={1.6} fill="#4a3c2a" fontWeight="700" pointerEvents="none">{p.icon}</text>
          ))}
          {zoom >= 5 && PLACES.map(p => (
            <text key={`n${p.id}`} x={p.x + p.w / 2} y={p.z - 0.5} textAnchor="middle" fontSize={1.1} fill="#333" fontWeight="600" pointerEvents="none">
              {p.name.length > 18 ? p.name.slice(0, 17) + '…' : p.name}
            </text>
          ))}
          {/* Taken sea blocks */}
          {takenSea.filter(o => (o.region ?? 'kaduna') === region).map(o => <rect key={`${o.x},${o.z}`} x={o.x} y={o.z} width={o.w} height={o.d} fill="#ef4444" fillOpacity={0.6} rx={0.3} />)}
          {/* Selected sea block */}
          {seaRect && (seaRect.region ?? 'kaduna') === region && <rect x={seaRect.x} y={seaRect.z} width={seaRect.w} height={seaRect.d} fill="#22c55e" fillOpacity={0.85} stroke="#fff" strokeWidth={0.4} rx={0.3} />}
          {/* Billboard markers */}
          {BILLBOARDS.map((b, i) => {
            const key = cityBoard(i, region);
            const tk = held.has(key) || reserved.includes(key);
            const sel = board === key;
            // A board that is not on sale is on the map only while an ad runs on it.
            if (!cityBoardOpen(i, region) && !held.has(key)) return null;
            return (
              <circle key={key} cx={b.x + 0.5} cy={b.z + 0.5} r={sel ? dot * 1.75 : dot}
                fill={tk ? '#ef4444' : sel ? '#22c55e' : '#fff'} stroke={sel ? '#166534' : '#555'} strokeWidth={dot * (sel ? 0.44 : 0.22)}
                style={{ cursor: tk ? 'default' : 'pointer' }}
              />
            );
          })}
        </svg>
        <div className="bk-map-zoom">
          <button type="button" onClick={() => setZoom(z => Math.min(8, z * 1.4))} aria-label="Zoom in">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
          </button>
          <button type="button" onClick={() => setZoom(z => Math.max(1, z / 1.4))} aria-label="Zoom out">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M3 8h10" /></svg>
          </button>
        </div>
        {isSea && (
          <div className="sea-size-controls">
            <div className="size-control">
              <span>W</span>
              <button type="button" disabled={seaW <= 1} onClick={() => setSeaW(w => w - 1)}>−</button>
              <b>{seaW}</b>
              <button type="button" disabled={seaW >= SEA_MAX_W} onClick={() => setSeaW(w => w + 1)}>+</button>
            </div>
            <div className="size-control">
              <span>D</span>
              <button type="button" disabled={seaD <= 1} onClick={() => setSeaD(d => d - 1)}>−</button>
              <b>{seaD}</b>
              <button type="button" disabled={seaD >= SEA_MAX_D} onClick={() => setSeaD(d => d + 1)}>+</button>
            </div>
          </div>
        )}
      </div>
      <small className={board ? 'good' : 'muted'}>
        {board
          ? (isSea && seaRect ? `${seaRect.w}×${seaRect.d} block · ${seaZone(seaRect).name}` : !isSea ? boardLabel(board) : 'No room – try smaller')
          : BILLBOARDS_HIDDEN ? 'Tap the water' : 'Tap a white dot or the water'}
      </small>
      {children}
    </div>
  );
}

/* ---------- Interior board list (inside a building) ---------- */

function InteriorBoards({ placeId, region, fixtures, open, board, onSelect, held, reserved, children }: {
  placeId: string; region: string; fixtures: { kind: string }[]; /** The numbers of the fixtures on sale. */ open: number[]; board: string; onSelect: (k: string) => void; held: Map<string, unknown>; reserved: string[]; children?: React.ReactNode;
}) {
  const place = cityMap(region).placeById[placeId] ?? PLACE_BY_ID[placeId];
  return (
    <div className="interior-board-list">
      {place && <div className="interior-board-place">{place.icon} {place.name}</div>}
      <div className="bk-plans" style={{ gridTemplateColumns: '1fr' }}>
        {fixtures.map((f, i) => {
          const key = interiorBoard(placeId, i, region);
          const taken = held.has(key) || reserved.includes(key);
          // A fixture that is not on sale is listed only while an ad runs on it.
          if (!open.includes(i) && !held.has(key)) return null;
          return (
            <button key={key} type="button" className={`bk-plan ${board === key ? 'on' : ''}`} disabled={taken}
              onClick={() => onSelect(board === key ? '' : key)}>
              <b>{KIND_LABEL[f.kind] ?? f.kind} #{i + 1}</b>
              <small>{taken ? 'Taken' : 'Available'}</small>
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}

/* ---------- Home TV slots (the TVs in every house in the city) ---------- */

function TvSlots({ region, board, onSelect, held, reserved }: {
  region: string; board: string; onSelect: (k: string) => void; held: Map<string, unknown>; reserved: string[];
}) {
  const city = regionOf(region).name;
  return (
    <div className="interior-board-list">
      <div className="interior-board-place">📺 Home TVs in {city}</div>
      <small className="muted">Your ad plays on the TV in every house in {city}, taking turns with the other slots.</small>
      <div className="bk-plans">
        {Array.from({ length: TV_SLOTS }, (_, i) => {
          const key = tvBoard(region, i);
          const taken = held.has(key) || reserved.includes(key);
          return (
            <button key={key} type="button" className={`bk-plan ${board === key ? 'on' : ''}`} disabled={taken}
              onClick={() => onSelect(board === key ? '' : key)}>
              <b>TV slot #{i + 1}</b>
              <small>{taken ? 'Taken' : 'Available'}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Main body ---------- */

function AdsBody() {
  const signedIn = !!useSession((s) => s.user?.username);
  const { plans, live, mine, enabled, busy, reserved, wantBoard, wantPlace } = useAds();
  const insideId = useGame((s) => s.insideId);
  // Roadside boards and sea blocks are booked for the city you are in.
  const region = useGame((s) => cityMap(s.destinationId).id);
  const [tab, setTab] = useState<'board' | 'place' | 'mine'>('mine');
  const [step, setStep] = useState(0);
  const [board, setBoard] = useState('');
  const [plan, setPlan] = useState('day');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [image, setImage] = useState('');
  const [fill, setFill] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [imgError, setImgError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (signedIn) void loadAds(); }, [signedIn]);
  useEffect(() => {
    if (!wantBoard) return;
    setBoard(wantBoard);
    setStep(wantBoard.startsWith('sea:') ? 0 : 1);
    setTab('place');
    useAds.setState({ wantBoard: null });
  }, [wantBoard]);
  useEffect(() => {
    if (!wantPlace) return;
    setTab('place');
    useAds.setState({ wantPlace: false });
  }, [wantPlace]);
  const held = new Map(live.filter((a) => a.board).map((a) => [a.board!, a.endsAt]));
  const isSea = board.startsWith('sea:');
  const isTv = board.startsWith('tv:');
  const allowedPlans = plans.filter((p) => !isSea || SEA_PLANS.includes(p.id));
  const chosen: AdPlan | undefined = allowedPlans.find((p) => p.id === plan);
  const takenSeaRects = useMemo(() =>
    [...live.map(a => a.board ?? ''), ...reserved].filter(k => k.startsWith('sea:')).flatMap(k => { const r = parseSea(k); return r ? [r] : []; }),
    [live, reserved],
  );
  const interiorFix = useMemo(() => insideId ? getInteriorFixtures(insideId) : [], [insideId]);
  const interiorOpen = useMemo(() => openFixtures(interiorFix, insideId ? INTERIORS[insideId]?.w ?? 0 : 0), [interiorFix, insideId]);
  // Nothing to pick inside a place with no fixture on sale: the city's map is offered there instead.
  const hasInterior = interiorOpen.length > 0;
  if (!signedIn) return <small className="muted">Sign in and pick a username to use Ads.</small>;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { setImgError('Use a PNG, JPG, WebP or GIF picture.'); return; }
    if (file.size > 2 * 1024 * 1024) { setImgError('That picture is over 2 MB. Pick a smaller one.'); return; }
    setImgError('');
    setUploading(true);
    const url = await uploadAdImage(file);
    setUploading(false);
    if (!url) return;
    setImage(url);
    // A TV shows the picture itself, the way a channel would: lettering beside it is the exception there.
    if (isTv) setFill(true);
  };
  const tvSlots = <TvSlots region={region} board={board} onSelect={setBoard} held={held} reserved={reserved} />;
  const submit = async () => {
    if (await placeAd({ board, plan, title, body, link, image, fill })) {
      setTitle(''); setBody(''); setLink(''); setImage(''); setFill(false);
      setBoard(''); setStep(0);
      setTab('mine');
    }
  };

  return (
    <>
      {/* Stays put: the tabs (and the steps while placing an ad). Only .bk-scroll moves. */}
      <div className="bk-fixed">
      <div className="bk-tabs" role="tablist">
        {(['board', 'place', 'mine'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'board' ? 'Ad board' : t === 'place' ? 'Place an ad' : `My ads${mine.length ? ` (${mine.length})` : ''}`}
          </button>
        ))}
      </div>
      {tab === 'place' && (
      <ol className="bk-steps" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <button type="button" disabled={i > step} onClick={() => setStep(i)}>
              <span>{i < step ? '✓' : i + 1}</span>
              <em>{label}</em>
            </button>
          </li>
        ))}
      </ol>
      )}
      </div>
      <div className="bk-scroll">
      {tab !== 'place' && <div className="hero hero-green">
        <small>Promote your business</small>
        <b>Your ad on the billboard you pick, and tapping it opens your link</b>
        <small>Pick a billboard and plan, add a picture and link, then pay.</small>
      </div>}
      {tab === 'board' && (
        <div className="list-card">
          {!live.length && <small className="muted" style={{ padding: 12 }}>No ads yet. Be the first to place one!</small>}
          {live.map((a) => (
            <div className="tile" key={a.id}>
              {a.image ? <img src={`${a.image}?w=128`} alt="" width={56} height={56} style={{ objectFit: 'cover', borderRadius: 8 }} loading="lazy" /> : <span className="tile-icon">📣</span>}
              <span className="tile-info">
                <b>{a.title}</b>
                <small>{a.body}</small>
                <small className="muted">{a.by ? `@${a.by}` : 'Sponsored'}</small>
              </span>
              {a.link && <a className="btn sm" href={a.link} target="_blank" rel="noopener noreferrer nofollow">Open</a>}
            </div>
          ))}
        </div>
      )}

      {tab === 'place' && (
        <div className="bk-form bk-place">
          {/* Left on wide screens, always there; on phones it only shows on the first step. */}
          <div className={`bk-place-map${step === 0 ? '' : ' mobile-off'}`}>
            {hasInterior ? (
              <InteriorBoards placeId={insideId!} region={region} fixtures={interiorFix} open={interiorOpen} board={board} onSelect={setBoard} held={held} reserved={reserved}>{tvSlots}</InteriorBoards>
            ) : (
              <AdMapPicker key={region} region={region} board={board} onChange={setBoard} held={held} reserved={reserved} takenSea={takenSeaRects}>{tvSlots}</AdMapPicker>
            )}
          </div>
          <div className="bk-place-main">

          {step === 0 && (
            <div className="bk-step-head">
              <b>Pick your spot</b>
              <small>{hasInterior ? `Choose an ad fixture in ${cityMap(region).placeById[insideId!]?.name ?? PLACE_BY_ID[insideId!]?.name ?? 'this place'}, or a slot on home TVs` : BILLBOARDS_HIDDEN ? 'Tap the water for a sea ad, or take a slot on home TVs' : 'Tap a billboard on the map, tap the water for a sea ad, or take a slot on home TVs'}</small>
            </div>
          )}

          {step === 1 && (
            <>
              <div className="bk-step-head"><b>Choose how long it runs</b><small>Ads run for one real day, not a game day.</small></div>
              <div className="bk-plans" role="radiogroup" aria-label="Ad plan">
                {allowedPlans.map((p) => (
                  <button type="button" role="radio" aria-checked={plan === p.id} key={p.id} className={`bk-plan ${plan === p.id ? 'on' : ''}`} onClick={() => setPlan(p.id)}>
                    {p.tag && <em>{p.tag}</em>}
                    <span className="bk-plan-icon">{p.icon}</span>
                    <b>{p.label}</b>
                    <strong>{price(board ? boardPrice(p.price, board) : p.price)}</strong>
                    <small>{p.days} real day{p.days > 1 ? 's' : ''}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="bk-step-head"><b>Write your ad</b><small>Short and clear works best on a billboard.</small></div>
              <label className="bk-field">
                <span>Title <i>{title.length}/{AD_LIMITS.title}</i></span>
                <input placeholder="e.g. Mama Put Jollof" maxLength={AD_LIMITS.title} value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="bk-field">
                <span>Message <i>{body.length}/{AD_LIMITS.body}</i></span>
                <textarea placeholder="Tell people what you offer" rows={3} maxLength={AD_LIMITS.body} value={body} onChange={(e) => setBody(e.target.value)} />
              </label>
              <label className="bk-field">
                <span>Link <i>optional · tapping the ad opens it</i></span>
                <input placeholder="yourshop.com or a WhatsApp link" inputMode="url" maxLength={AD_LIMITS.link} value={link} onChange={(e) => setLink(e.target.value)} />
              </label>
            </>
          )}

          {step === 3 && (
            <>
              <div className="bk-step-head"><b>Add a picture</b><small>Optional. Skip it for a text-only billboard.</small></div>
              {image ? (
                <div className="bk-drop has-image">
                  <img src={`${image}?w=256`} alt="Ad picture" />
                  <div>
                    <b>Picture added</b>
                    <div className="bk-drop-actions">
                      <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}>Change</button>
                      <button type="button" className="btn sm" onClick={() => { setImage(''); setFill(false); }}>Remove</button>
                    </div>
                    <label className="bk-fill">
                      <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} /> Fill the whole {isTv ? 'screen' : 'billboard'}
                    </label>
                  </div>
                </div>
              ) : (
                <div
                  className={`bk-drop ${dragging ? 'over' : ''} ${uploading ? 'busy' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Add a picture: click to choose or drop one here"
                  onClick={() => !uploading && fileRef.current?.click()}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) { e.preventDefault(); fileRef.current?.click(); } }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); if (!uploading) void pick(e.dataTransfer.files?.[0]); }}
                >
                  <span className="bk-drop-icon">{uploading ? '⏳' : '🖼️'}</span>
                  <b>{uploading ? 'Uploading…' : dragging ? 'Drop it here' : 'Tap to choose a picture'}</b>
                  <small>{uploading ? 'One moment' : 'or drag and drop · PNG, JPG, WebP, GIF · up to 2 MB'}</small>
                </div>
              )}
              {imgError && <small className="bk-error" role="alert">{imgError}</small>}
              <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
            </>
          )}

          {step === 4 && (
            <>
              <div className="bk-step-head"><b>Check and pay</b><small>This is how your ad looks on your billboard.</small></div>
              <div className={`bk-preview ${image && fill ? 'fill' : ''}`} aria-label="Billboard preview">
                {image && <img src={`${image}?w=${fill ? 512 : 256}`} alt="" />}
                {!(image && fill) && <div>
                  <b>{title.trim() || 'YOUR TITLE'}</b>
                  <small>{body.trim() || 'Your message shows here.'}</small>
                  {link.trim() && <em>TAP TO OPEN ▸</em>}
                </div>}
              </div>
              {chosen && (
                <dl className="bk-summary">
                  <div><dt>{isTv ? 'Where' : 'Billboard'}</dt><dd>{boardLabel(board)}</dd></div>
                  <div><dt>Plan</dt><dd>{chosen.icon} {chosen.label} · {chosen.days} real day{chosen.days > 1 ? 's' : ''}</dd></div>
                  <div><dt>Link</dt><dd>{link.trim() || 'None'}</dd></div>
                  <div><dt>Total</dt><dd><strong>{price(boardPrice(chosen.price, board))}</strong></dd></div>
                </dl>
              )}
            </>
          )}
          </div>
        </div>
      )}

      {tab === 'mine' && (
        <div className="list-card">
          {!mine.length && <small className="muted" style={{ padding: 12 }}>You have not placed any ads.</small>}
          {mine.map((a) => (
            <div className="tile" key={a.id}>
              {a.board && <AdSpotMap board={a.board} />}
              {a.image && <img src={`${a.image}?w=64`} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 6 }} loading="lazy" />}
              <span className="tile-info">
                <b>{a.title}</b>
                <small>{a.body}</small>
                {a.board && <small className="bk-where">📍 {[boardSpot(a.board) && regionOf(boardSpot(a.board)!.region).name, boardLabel(a.board)].filter(Boolean).join(' · ')}</small>}
                <small className={a.status === 'active' ? 'good' : 'muted'}>
                  {STATUS[a.status]} · {price(a.price)}{a.status === 'active' && a.endsAt ? ` · ends ${new Date(a.endsAt).toLocaleDateString()}` : ''}
                </small>
              </span>
              {a.status === 'awaiting_payment' && <button className="btn sm go" disabled={busy} onClick={() => payForAd(a.id)}>Pay</button>}
              {a.status === 'awaiting_payment' && <button className="btn sm" disabled={busy} onClick={() => removeAd(a.id)}>Remove</button>}
            </div>
          ))}
        </div>
      )}
      </div>
      {/* Stays put under the scrolling body: the buttons and the small print. */}
      <div className="bk-foot">
        {tab === 'place' && (
            <div className="bk-nav">
              {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
              {step < STEPS.length - 1 ? (
                <button type="button" className="btn go" disabled={uploading || (step === 0 && !board) || (step === 1 && !chosen) || (step === 2 && !(title.trim() && body.trim()))} onClick={() => setStep(step + 1)}>
                  {step === 3 && !image ? 'Skip' : 'Next'}
                </button>
              ) : (
                <button className="btn go" disabled={busy || uploading || !board || !title.trim() || !body.trim() || !chosen} onClick={submit}>
                  {chosen ? `Place ad · ${price(boardPrice(chosen.price, board))}` : 'Place ad'}
                </button>
              )}
            </div>
        )}
        {tab === 'place' && step === STEPS.length - 1 && !enabled && <small className="muted">Payments are opening soon. Your ad is saved now and goes live once you pay.</small>}
        <small className="muted">Ads must follow the rules. We may remove ads without refund if they break them.</small>
      </div>
    </>
  );
}
