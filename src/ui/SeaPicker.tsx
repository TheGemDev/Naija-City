// Pick a patch of sea by zone: choose a named region and a size and the block is placed on free water there.

import { useEffect, useMemo, useState } from 'react';
import { CITY_H, CITY_W, OUTLINE } from '../game/city';
import { parseSea, SEA_CELL_PRICE, SEA_MARGIN, SEA_SIZES, SEA_ZONES, seaAutoPlace, seaBoard, seaZone, seaZoneBox, type SeaRect } from '../game/boards';

const VX = -SEA_MARGIN;
const VW = CITY_W + SEA_MARGIN * 2;
const VH = CITY_H + SEA_MARGIN * 2;

/** `taken` is every sea board someone holds. Reports the chosen board key, or '' while the zone has no room for the size. */
export function SeaPicker({ value, taken, onChange }: { value: string; taken: string[]; onChange: (board: string) => void }) {
  // Opened by tapping water in the world: start in that zone, as close to the tap as there is room.
  const start = useMemo(() => parseSea(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [zoneId, setZoneId] = useState(start ? seaZone(start).id : 'n');
  const [sizeId, setSizeId] = useState<(typeof SEA_SIZES)[number]['id']>('medium');
  const [near, setNear] = useState(start ? { x: start.x + start.w / 2, z: start.z + start.d / 2 } : undefined);
  const others = taken.flatMap((k) => { const r = parseSea(k); return r ? [r] : []; });
  const zone = SEA_ZONES.find((z) => z.id === zoneId)!;
  const size = SEA_SIZES.find((s) => s.id === sizeId)!;
  const takenKey = taken.join('|');
  const rect: SeaRect | null = useMemo(() => seaAutoPlace(zone, size, others, near), [zoneId, sizeId, takenKey, near]); // eslint-disable-line react-hooks/exhaustive-deps
  const free = (z: (typeof SEA_ZONES)[number]) => !!seaAutoPlace(z, size, others);
  const fromPrice = (m: number, cells: number) => `₦${Math.round(cells * SEA_CELL_PRICE * m).toLocaleString('en-NG')}`;

  useEffect(() => { onChange(rect ? seaBoard(rect) : ''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [rect?.x, rect?.z, rect?.w, rect?.d]);

  const box = seaZoneBox(zone);
  return (
    <div className="sea-picker">
      <div className="sea-sizes" role="radiogroup" aria-label="Size">
        {SEA_SIZES.map((s) => (
          <button type="button" role="radio" aria-checked={sizeId === s.id} key={s.id} className={`btn sm ${sizeId === s.id ? 'go' : ''}`} onClick={() => { setSizeId(s.id); setNear(undefined); }}>
            {s.name} · {s.w}×{s.d}
          </button>
        ))}
      </div>
      <div className="bk-plans sea-zones" role="radiogroup" aria-label="Zone">
        {SEA_ZONES.map((z) => {
          const open = free(z);
          return (
            <button type="button" role="radio" aria-checked={zoneId === z.id} key={z.id} disabled={!open} className={`bk-plan ${zoneId === z.id ? 'on' : ''}`} onClick={() => { setZoneId(z.id); setNear(undefined); }}>
              <b>{z.name}</b>
              <small>{open ? `${z.note} · from ${fromPrice(z.mult, size.w * size.d)} a day` : 'Full for this size'}</small>
            </button>
          );
        })}
      </div>
      <svg className="sea-map" viewBox={`${VX} ${VX} ${VW} ${VH}`} role="img" aria-label={`Map of the sea. ${zone.name} is highlighted.`}>
        <rect x={VX} y={VX} width={VW} height={VH} fill="#3f8fb5" />
        <rect x={box.x} y={box.z} width={box.w} height={box.d} fill="#fff" fillOpacity={0.22} />
        <polygon points={OUTLINE.map(([x, z]) => `${x},${z}`).join(' ')} fill="#9fbf5a" stroke="#b06a3b" strokeWidth={0.6} />
        {others.map((o) => <rect key={seaBoard(o)} x={o.x} y={o.z} width={o.w} height={o.d} fill="#ef4444" fillOpacity={0.7} />)}
        {rect && <rect x={rect.x} y={rect.z} width={rect.w} height={rect.d} fill="#22c55e" fillOpacity={0.9} stroke="#fff" strokeWidth={0.5} />}
      </svg>
      <small className={rect ? 'good' : 'muted'}>
        {rect ? `Your ${size.name.toLowerCase()} block goes in ${zone.name}. Red blocks are taken.` : `${zone.name} has no room for a ${size.name.toLowerCase()} block. Try another zone or size.`}
      </small>
    </div>
  );
}
