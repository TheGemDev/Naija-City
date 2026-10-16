// Dev-only flight perf harness: /dev/flight.html?p=0.1 (frozen) or live; ?kind=jet, ?low=1, ?dpr=2
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PCFSoftShadowMap } from 'three';
import { useGame } from '../src/game/store';
import { useQuality } from '../src/game/quality';
import { FlightCabin as Now } from '../src/three/FlightCabin';
import { FlightCabin as Head } from './FlightCabinHead';

const q = new URLSearchParams(location.search);
const FlightCabin = q.get('head') === '1' ? Head : Now;
const kind = (q.get('kind') ?? 'ticket') as 'ticket' | 'jet';
const frozen = q.get('p');
const low = q.get('low') === '1';
const TOTAL = 20;
const FROM = Number(q.get('from') ?? 0);
const SPEED = Number(q.get('speed') ?? 1);
/** Like the game's GameLoop: remaining only moves every TICK seconds (0.1 in the game; 0 = every frame). */
const TICK = Number(q.get('tick') ?? 0.1);
let lastTick = -1;
// Same passengers every load, so draw counts compare.
let seed = 12345;
Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
useQuality.setState({ quality: low ? 'low' : 'high' });
const setR = (R: number) => useGame.setState({ task: { itemId: null, actionId: 'fly_kano', label: 'Flight', icon: '✈️', phase: 'doing', remaining: R, total: TOTAL, flight: kind } as never });
const w = window as unknown as Record<string, any>;
w.__frames = [] as any[];
w.__start = performance.now();
w.__restart = () => { w.__start = performance.now(); w.__frames = []; lastTick = -1; };
setR(frozen ? TOTAL * (1 - Number(frozen)) : TOTAL);

function Probe() {
  const { gl, scene, camera } = useThree();
  w.__gl = gl; w.__scene = scene;
  const ext = gl.getContext().getExtension('EXT_disjoint_timer_query_webgl2');
  const g2 = gl.getContext() as WebGL2RenderingContext;
  const pending: { query: WebGLQuery; rec: any }[] = [];
  let t0 = 0;
  useFrame(() => {
    t0 = performance.now();
    if (!frozen) {
      const el = (t0 - w.__start) / 1000 * SPEED;
      if (lastTick < 0 || el < lastTick || el - lastTick >= TICK) { lastTick = el; setR(Math.max(0, TOTAL * (1 - FROM) - el)); }
    }
  }, -1000);
  useFrame(() => {
    const t1 = performance.now();
    let query: WebGLQuery | null = null;
    if (ext) { query = g2.createQuery(); g2.beginQuery(ext.TIME_ELAPSED_EXT, query!); }
    gl.render(scene, camera);
    if (ext && query) g2.endQuery(ext.TIME_ELAPSED_EXT);
    const t2 = performance.now();
    const t = useGame.getState().task!;
    let ver = 0; scene.traverse((o: any) => { const c = o.geometry?.attributes?.color; if (c && c.count > 20000) ver = c.version; });
    if (!w.__runway) scene.traverse((o: any) => { const pr = o.geometry?.parameters; if (o.isMesh && pr && pr.width === 18 && pr.height === 420) w.__runway = o.parent; });
    const rec = { gy: w.__runway?.parent.position.y ?? 0, rz: w.__runway?.position.z ?? 0, progs: gl.info.programs?.length ?? 0, ver, at: t0, p: 1 - t.remaining / t.total, upd: t1 - t0, rnd: t2 - t1, calls: gl.info.render.calls, tris: gl.info.render.triangles, gpu: -1 };
    w.__frames.push(rec);
    if (query) pending.push({ query, rec });
    for (let i = pending.length - 1; i >= 0; i--) {
      const it = pending[i];
      if (g2.getQueryParameter(it.query, g2.QUERY_RESULT_AVAILABLE)) {
        if (!g2.getParameter(ext!.GPU_DISJOINT_EXT)) it.rec.gpu = g2.getQueryParameter(it.query, g2.QUERY_RESULT) / 1e6;
        g2.deleteQuery(it.query); pending.splice(i, 1);
      }
    }
    if (w.__frames.length % 20 === 0) document.getElementById('hud')!.textContent = `p ${rec.p.toFixed(3)} calls ${rec.calls} tris ${rec.tris} upd ${rec.upd.toFixed(2)} rnd ${rec.rnd.toFixed(2)} gpu ${rec.gpu.toFixed(2)} ext ${!!ext}`;
  }, 1);
  return null;
}

const d = 26 * Number(q.get('zoom') ?? 1) / Math.hypot(1, 1.15, 1);
const az = Number(q.get('az') ?? 0);
const tz = Number(q.get('tz') ?? 0);
const camPos: [number, number, number] = [d * Math.SQRT2 * Math.sin(Math.PI / 4 + az), 0.8 + 1.15 * d, tz + d * Math.SQRT2 * Math.cos(Math.PI / 4 + az)];
createRoot(document.getElementById('root')!).render(
  <Canvas shadows={low ? false : { type: PCFSoftShadowMap }} dpr={Number(q.get('dpr') ?? (low ? 0.75 : Math.min(2, devicePixelRatio)))} gl={{ antialias: !low }}
    camera={{ position: camPos, fov: 35, near: 0.1, far: 400 }}
    onCreated={({ camera }) => camera.lookAt(0, 0.8, tz)}>
    <color attach="background" args={['#bfe3f5']} />
    <hemisphereLight args={['#fff8ec', '#6b5a3a', 1]} />
    <directionalLight position={[20, 24, 10]} intensity={2.2} castShadow={!low} shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={22} shadow-camera-bottom={-22} />
    <Probe />
    <FlightCabin kind={kind} />
  </Canvas>,
);

// Per-phase report: render CPU ms (avg/max), frame gap, draw calls, shader compiles and long frames.
w.__rep = (edges = { descent: 0.56, touch: 0.86 }) => {
  const F = w.__frames;
  const ph = (p: number) => (p < 0.18 ? 'climb' : p < edges.descent ? 'cruise' : p < edges.touch ? 'descent' : 'rollout');
  const out: Record<string, any> = {};
  const comp: string[] = [], long: string[] = [];
  for (let i = 1; i < F.length; i++) {
    const f = F[i], dt = f.at - F[i - 1].at;
    if (f.progs !== F[i - 1].progs) comp.push(`${f.p.toFixed(3)}:+${f.progs - F[i - 1].progs}`);
    if (dt > 25) long.push(`${f.p.toFixed(3)}:${dt.toFixed(0)}${f.ver !== F[i - 1].ver ? 't' : ''}${f.progs !== F[i - 1].progs ? 'c' : ''}(u${f.upd.toFixed(0)} r${f.rnd.toFixed(0)})`);
    const o = out[ph(f.p)] ??= { n: 0, rnd: 0, rmax: 0, upd: 0, umax: 0, dt: 0, dmax: 0, cmin: 1e9, cmax: 0, tints: 0 };
    o.n++; o.rnd += f.rnd; o.rmax = Math.max(o.rmax, f.rnd); o.upd += f.upd; o.umax = Math.max(o.umax, f.upd); o.dt += dt; o.dmax = Math.max(o.dmax, dt);
    o.cmin = Math.min(o.cmin, f.calls); o.cmax = Math.max(o.cmax, f.calls); if (f.ver !== F[i - 1].ver) o.tints++;
  }
  return Object.entries(out).map(([k, o]) => `${k}: rnd ${(o.rnd / o.n).toFixed(2)}/${o.rmax.toFixed(1)} upd ${(o.upd / o.n).toFixed(2)}/${o.umax.toFixed(1)} dt ${(o.dt / o.n).toFixed(1)}/${o.dmax.toFixed(0)} calls ${o.cmin}-${o.cmax} tints ${o.tints}`).join('\n')
    + `\ncompiles ${comp.join(' ')} total ${F.at(-1).progs}\nlong ${long.join(' ')}`;
};

// Other edits in the repo must not reload or hot-swap the page mid-measurement (reload by hand to pick up changes).
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', () => { throw new Error('flight harness: reload skipped'); });
  import.meta.hot.on('vite:beforeUpdate', () => { throw new Error('flight harness: update skipped'); });
}

/** Motion smoothness per phase: how unevenly the ground moves up/down and the runway slides, frame to frame. */
w.__smooth = (edges = { descent: 0.56, touch: 0.86 }) => {
  const F = w.__frames;
  const ph = (p: number) => (p < 0.18 ? 'climb' : p < edges.descent ? 'cruise' : p < edges.touch ? 'descent' : 'rollout');
  const out: Record<string, any> = {};
  for (let i = 2; i < F.length; i++) {
    const a = F[i - 2], b = F[i - 1], c = F[i];
    const o = out[ph(c.p)] ??= { n: 0, still: 0, jerk: 0, maxStep: 0, rjerk: 0 };
    const dy1 = b.gy - a.gy, dy2 = c.gy - b.gy;
    o.n++;
    if (Math.abs(dy2) < 1e-6 && Math.abs(dy1) > 1e-6) o.still++;
    o.jerk += Math.abs(dy2 - dy1);
    o.maxStep = Math.max(o.maxStep, Math.abs(dy2));
    o.rjerk += Math.abs((c.rz - b.rz) - (b.rz - a.rz));
  }
  return Object.entries(out).map(([k, o]) => `${k}: ground-y frames stalled ${o.still}/${o.n}, mean |accel| ${(o.jerk / o.n).toFixed(3)}, max step ${o.maxStep.toFixed(2)}; runway-z mean |accel| ${(o.rjerk / o.n).toFixed(3)}`).join('\n');
};
