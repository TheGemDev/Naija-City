// The kit place props are built from: cylinders, words on panels, tables of rows, barriers, luggage.
// Everything is centred on its footprint, sits on y=0 and faces +z, like the models in interiorModels.tsx.

import { useContext, useMemo, type ReactNode } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { B, SoftCtx } from './models';

export { B };
export type V3 = [number, number, number];

export function Cyl({ p, r, h, c, rt, seg = 12, e, o, rot }: { p: V3; r: number; h: number; c: string; rt?: number; seg?: number; e?: string; o?: number; rot?: V3 }) {
  // Up close (place props) round things are drawn round; out in a big yard they stay cheap and faceted.
  const smooth = useContext(SoftCtx) && seg >= 8;
  return (
    <mesh position={p} rotation={rot} castShadow receiveShadow>
      <cylinderGeometry args={[rt ?? r, r, h, smooth ? Math.max(seg * 2, 20) : seg]} />
      <meshStandardMaterial color={c} emissive={e ?? '#000'} emissiveIntensity={e ? 1 : 0} flatShading={!smooth} roughness={smooth ? 0.62 : 1} transparent={o !== undefined} opacity={o ?? 1} />
    </mesh>
  );
}

export function Ball({ p, r, c, s }: { p: V3; r: number; c: string; s?: V3 }) {
  const smooth = useContext(SoftCtx);
  return (
    <mesh position={p} scale={s} castShadow>
      <icosahedronGeometry args={[r, smooth ? 3 : 1]} />
      <meshStandardMaterial color={c} flatShading={!smooth} roughness={smooth ? 0.6 : 1} />
    </mesh>
  );
}

/* ---------- Words ---------- */

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const textures = new Map<string, CanvasTexture>();

function finish(canvas: HTMLCanvasElement) {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Lines of text on a plain ground, shrunk to fit. Drawn once per wording and shared. */
function labelTexture(text: string, fg: string, bg: string, aspect: number) {
  const key = `${text}|${fg}|${bg}|${aspect.toFixed(2)}`;
  let t = textures.get(key);
  if (t) return t;
  const lines = text.split('\n');
  const H = lines.length > 1 ? 192 : 128;
  const W = Math.min(1024, Math.round(H * aspect));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const row = H / lines.length;
  let size = row * 0.66;
  g.font = `700 ${size}px ${FONT}`;
  const widest = Math.max(...lines.map((l) => g.measureText(l).width));
  if (widest > W * 0.9) size *= (W * 0.9) / widest;
  g.font = `700 ${size}px ${FONT}`;
  lines.forEach((l, i) => g.fillText(l, W / 2, row * (i + 0.5) + size * 0.04));
  textures.set(key, (t = finish(canvas)));
  return t;
}

/** A table of rows on a dark board: a flight board, a rate board, a menu. `tone` colours the last column. */
function tableTexture(title: string, rows: string[][], aspect: number, accent: string) {
  const key = `table|${title}|${rows.map((r) => r.join(',')).join(';')}|${aspect.toFixed(2)}|${accent}`;
  let t = textures.get(key);
  if (t) return t;
  const H = 384;
  const W = Math.round(H * aspect);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#060b16';
  g.fillRect(0, 0, W, H);
  const head = H * 0.2;
  g.fillStyle = accent;
  g.fillRect(0, 0, W, head);
  g.fillStyle = '#0b1220';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = `800 ${head * 0.62}px ${FONT}`;
  g.fillText(title, W * 0.03, head * 0.54);
  const row = (H - head) / rows.length;
  const cols = Math.max(...rows.map((r) => r.length));
  // Each column is as wide as its longest entry; the lot is squeezed to fit if it has to be.
  let size = row * 0.56;
  g.font = `700 ${size}px ${FONT}`;
  const gap = W * 0.035;
  const need = () => Array.from({ length: cols }, (_, c) => Math.max(...rows.map((r) => g.measureText(r[c] ?? '').width)));
  let widths = need();
  const room = W * 0.94 - gap * (cols - 1);
  const total = widths.reduce((a, b) => a + b, 0);
  if (total > room) {
    size *= room / total;
    g.font = `700 ${size}px ${FONT}`;
    widths = need();
  }
  rows.forEach((cells, i) => {
    const y = head + row * (i + 0.5);
    if (i % 2) {
      g.fillStyle = '#0f1a30';
      g.fillRect(0, head + row * i, W, row);
    }
    let x = W * 0.03;
    cells.forEach((cell, c) => {
      const last = c === cells.length - 1 && cols > 1;
      g.fillStyle = !last ? '#fde68a' : /DELAY|CLOSED|CANCEL|FULL/.test(cell) ? '#f87171' : /BOARD|OPEN|NOW/.test(cell) ? '#4ade80' : '#e2e8f0';
      g.textAlign = last ? 'right' : 'left';
      g.fillText(cell, last ? W * 0.97 : x, y);
      x += widths[c] + gap;
    });
  });
  textures.set(key, (t = finish(canvas)));
  return t;
}

/** Words on a flat panel. Faces +z; `ry` turns it. Lit from within a little so it reads in a dim room. */
export function Label({ p, w, h, text, fg = '#f8fafc', bg = '#0f172a', ry = 0, glow = 0.3 }: { p: V3; w: number; h: number; text: string; fg?: string; bg?: string; ry?: number; glow?: number }) {
  const map = useMemo(() => labelTexture(text, fg, bg, w / h), [text, fg, bg, w, h]);
  return (
    <mesh position={p} rotation-y={ry}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={glow} roughness={0.6} />
    </mesh>
  );
}

export function Table({ p, w, h, title, rows, ry = 0, accent = '#facc15' }: { p: V3; w: number; h: number; title: string; rows: string[][]; ry?: number; accent?: string }) {
  const map = useMemo(() => tableTexture(title, rows, w / h, accent), [title, rows, w, h, accent]);
  return (
    <mesh position={p} rotation-y={ry}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.55} roughness={0.5} />
    </mesh>
  );
}

/** A board with the same words on both faces, so it reads from either side. */
export function TwoSided({ p, w, h, text, fg, bg, t = 0.08 }: { p: V3; w: number; h: number; text: string; fg?: string; bg?: string; t?: number }) {
  return (
    <group position={p}>
      <B p={[0, 0, 0]} s={[w + 0.08, h + 0.08, t]} c="#1f2937" />
      <Label p={[0, 0, t / 2 + 0.004]} w={w} h={h} text={text} fg={fg} bg={bg} />
      <Label p={[0, 0, -t / 2 - 0.004]} w={w} h={h} text={text} fg={fg} bg={bg} ry={Math.PI} />
    </group>
  );
}

/* ---------- Shared bits ---------- */

export const STEEL = '#94a3b8';
export const CHROME = '#cbd5e1';
export const BAGS = ['#7c2d12', '#1d4ed8', '#111827', '#b91c1c', '#0f766e', '#a16207', '#6d28d9'];

/** A suitcase standing on its end, handle up. */
export function Suitcase({ p, c, s = 1, ry = 0 }: { p: V3; c: string; s?: number; ry?: number }) {
  return (
    <group position={p} rotation-y={ry} scale={s}>
      <B p={[0, 0.3, 0]} s={[0.42, 0.56, 0.24]} c={c} />
      <B p={[0, 0.3, 0.125]} s={[0.36, 0.04, 0.01]} c="#e5e7eb" />
      <B p={[0, 0.62, 0]} s={[0.2, 0.08, 0.04]} c="#1f2937" />
    </group>
  );
}

/** Rope or belt barrier: posts with a line strung between them. */
export function Barrier({ w, post, line, n }: { w: number; post: string; line: string; n: number }) {
  const xs = Array.from({ length: n }, (_, i) => -w / 2 + (i * w) / (n - 1));
  return (
    <group>
      {xs.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Cyl p={[0, 0.02, 0]} r={0.15} h={0.04} c={post} />
          <Cyl p={[0, 0.48, 0]} r={0.03} h={0.92} c={post} />
          <Cyl p={[0, 0.96, 0]} r={0.05} h={0.06} c={post} />
        </group>
      ))}
      <B p={[0, 0.86, 0]} s={[w, 0.07, 0.025]} c={line} />
    </group>
  );
}

/** A prop's model. `text` is what its sign says, when the layout gives it one. */
export type Model = (props: { text?: string }) => ReactNode;
