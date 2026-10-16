// Dev-only: ?view=probe (what lies along each station's track) | map (the real city around the station) | loco (close-up)
import { cityMap, placeYaw } from '../src/game/city';
import '../src/game/regions';

const q = new URLSearchParams(location.search);
const w = window as unknown as Record<string, any>;
if (q.get('view') === 'probe') {
  const out: string[] = [];
  for (const id of ['kaduna', 'abuja', 'lagos', 'kano']) {
    const m = cityMap(id);
    const st = m.places.find((p) => p.id === 'station')!;
    const yaw = placeYaw(st);
    const side = Math.abs(Math.sin(yaw)) > 0.5;
    const lw = side ? st.d : st.w, ld = side ? st.w : st.d;
    const cx = st.x + st.w / 2, cz = st.z + st.d / 2;
    // local (x, z) to world: rotate by yaw about y
    const toW = (x: number, z: number) => ({ x: cx + x * Math.cos(yaw) + z * Math.sin(yaw), z: cz - x * Math.sin(yaw) + z * Math.cos(yaw) });
    const near = -ld / 2 + 0.5;
    out.push(`${id}: station x${st.x} z${st.z} w${st.w} d${st.d} yaw ${yaw.toFixed(2)} local w${lw} d${ld} map ${m.w}x${m.h}`);
    for (const dir of [-1, 1]) {
      const row: string[] = [];
      for (let s = lw / 2; s <= lw / 2 + 24; s += 1) {
        const p = toW(dir * s, near);
        const hit = m.places.find((o) => o.id !== 'station' && p.x >= o.x - 0.3 && p.x <= o.x + o.w + 0.3 && p.z >= o.z - 0.3 && p.z <= o.z + o.d + 0.3);
        const lm = m.landmarks.find((o: any) => o.x !== undefined && p.x >= o.x - 0.3 && p.x <= o.x + (o.w ?? 1) + 0.3 && p.z >= o.z - 0.3 && p.z <= o.z + (o.d ?? 1) + 0.3);
        const c = !m.isLand(p.x, p.z) ? '~' : m.isWater(p.x, p.z) ? 'W' : m.isRoad(p.x, p.z) ? 'R' : hit ? 'P' : lm ? 'L' : '.';
        row.push(c + (hit && c === 'P' ? `(${hit.id})` : ''));
      }
      out.push(`  dir ${dir > 0 ? '+x' : '-x'} from plot edge: ${row.join(' ')}`);
    }
  }
  w.__probe = out.join('\n');
  document.getElementById('hud')!.textContent = w.__probe;
}
