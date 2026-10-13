// The pool table of the Street Games app. The server works out every shot; this draws the table, lets the
// player aim, and replays each shot by running the same physics (src/game/pool.ts) on the numbers the server
// sent, so both players watch the same balls roll.

import { useCallback, useEffect, useRef, useState } from 'react';
import { POOL, POOL_BLACK, POOL_POCKETS, poolGroupOf, poolShoot } from '../game/pool';
import type { PoolBall, PoolGroup, PoolView } from '../game/streetGames';
import { seatName, type BoardProps } from './GameBoards';

/** Wooden rail round the cloth, in table units, and canvas pixels per unit. */
const RAIL = 6;
const SCALE = 4;
const COLORS = ['#f8fafc', '#facc15', '#2563eb', '#dc2626', '#7c3aed', '#f97316', '#16a34a', '#7f1d1d'];
const GROUP_NAME: Record<PoolGroup, string> = { plain: 'Plain', stripe: 'Stripes' };

function drawBall(ctx: CanvasRenderingContext2D, ball: PoolBall) {
  const { R } = POOL;
  const color = ball.id === POOL_BLACK ? '#0f172a' : COLORS[ball.id % 8];
  const stripe = poolGroupOf(ball.id) === 'stripe';
  ctx.save();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, R, 0, 7);
  ctx.fillStyle = stripe ? '#f8fafc' : color;
  ctx.fill();
  if (stripe) {
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(ball.x - R, ball.y - R * 0.5, 2 * R, R);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(ball.x - R * 0.3, ball.y - R * 0.35, R * 0.28, 0, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, R, 0, 7);
  ctx.lineWidth = 0.25;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();
}

/** How far along the aim the white travels before it touches a ball or a cushion. */
function reach(balls: PoolBall[], cue: PoolBall, ux: number, uy: number): number {
  const { R, W, H } = POOL;
  let best = Infinity;
  for (const o of balls) {
    if (o.id === 0) continue;
    const along = (o.x - cue.x) * ux + (o.y - cue.y) * uy;
    if (along <= 0) continue;
    const off2 = (o.x - cue.x) ** 2 + (o.y - cue.y) ** 2 - along * along;
    if (off2 >= 4 * R * R) continue;
    best = Math.min(best, along - Math.sqrt(4 * R * R - off2));
  }
  if (ux) best = Math.min(best, ((ux > 0 ? W - R : R) - cue.x) / ux);
  if (uy) best = Math.min(best, ((uy > 0 ? H - R : R) - cue.y) / uy);
  return Math.max(0, best);
}

export function PoolBoard({ m, busy, play }: BoardProps) {
  const v = m.view as PoolView;
  const over = m.status !== 'live';
  const me = m.you;
  const canvas = useRef<HTMLCanvasElement>(null);
  /** Direction the white will be hit in. */
  const aim = useRef<[number, number]>([0, -1]);
  const [power, setPower] = useState(0.6);
  const [rolling, setRolling] = useState(false);
  /** The balls as drawn now: mid-roll during a replay, otherwise where the server says they rest. */
  const drawn = useRef<PoolBall[]>(v.balls);
  const latest = useRef(v);
  latest.current = v;
  /** Number of the last shot already replayed. Starts at the current one: opening a table does not replay old shots. */
  const replayed = useRef(v.shot?.n ?? 0);
  const mine = m.pending.includes(me) && !busy && !rolling;

  const paint = useCallback((aiming: boolean) => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const { W, H, R } = POOL;
    ctx.setTransform(SCALE, 0, 0, SCALE, RAIL * SCALE, RAIL * SCALE);
    ctx.fillStyle = '#713f12';
    ctx.fillRect(-RAIL, -RAIL, W + 2 * RAIL, H + 2 * RAIL);
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(0, 150);
    ctx.lineTo(W, 150);
    ctx.stroke();
    for (const [x, y, r] of POOL_POCKETS) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.85, 0, 7);
      ctx.fillStyle = '#020617';
      ctx.fill();
    }
    const balls = drawn.current;
    const cue = balls.find((o) => o.id === 0);
    if (aiming && cue) {
      const [dx, dy] = aim.current;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const d = reach(balls, cue, ux, uy);
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(cue.x, cue.y);
      ctx.lineTo(cue.x + ux * d, cue.y + uy * d);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cue.x + ux * d, cue.y + uy * d, R, 0, 7);
      ctx.stroke();
    }
    for (const ball of balls) drawBall(ctx, ball);
  }, []);

  // A new shot arrived (mine or theirs): roll it out frame by frame, then settle on the server's table.
  const shotN = v.shot?.n ?? 0;
  useEffect(() => {
    const shot = latest.current.shot;
    if (!shot || shot.n === replayed.current) return;
    replayed.current = shot.n;
    const frames: PoolBall[][] = [];
    poolShoot(shot.from, shot.dx, shot.dy, shot.power, (balls) => frames.push(balls));
    setRolling(true);
    const began = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      // The first frame's timestamp can be a hair earlier than `began`.
      const i = Math.max(0, Math.floor(((now - began) / 1000) * 60));
      if (i >= frames.length) {
        drawn.current = latest.current.balls;
        setRolling(false);
        return;
      }
      drawn.current = frames[i];
      paint(false);
      raf = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(raf);
      drawn.current = latest.current.balls;
      setRolling(false);
    };
  }, [shotN, paint]);

  useEffect(() => {
    if (rolling) return;
    drawn.current = latest.current.balls;
    paint(mine && !over);
  }, [rolling, mine, over, shotN, paint]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!mine || over || (e.type === 'pointermove' && !e.buttons && e.pointerType === 'mouse')) return;
    const cue = drawn.current.find((o) => o.id === 0);
    if (!cue) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * (POOL.W + 2 * RAIL) - RAIL;
    const y = ((e.clientY - box.top) / box.height) * (POOL.H + 2 * RAIL) - RAIL;
    if ((x - cue.x) ** 2 + (y - cue.y) ** 2 < 4) return;
    aim.current = [x - cue.x, y - cue.y];
    paint(true);
  };
  /** Fine aim: turn the cue a little either way. */
  const turn = (degrees: number) => {
    const [dx, dy] = aim.current;
    const a = (degrees * Math.PI) / 180;
    aim.current = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
    paint(true);
  };

  const left = (group: PoolGroup | null) => (group ? v.balls.filter((o) => poolGroupOf(o.id) === group).length : null);
  const label = (seat: number) => {
    const group = v.group[seat];
    const n = left(group);
    return `${seatName(m, seat)} · ${group ? (n ? `${GROUP_NAME[group]}, ${n} left` : 'On the black') : 'Open table'}`;
  };
  let line: string;
  if (rolling) line = '…';
  else if (!v.last) line = 'Break! Drag on the table to aim.';
  else {
    const who = seatName(m, v.last.seat);
    const sank = v.last.potted.length;
    line = v.last.foul ? `Foul: ${who} ${v.last.foul}.` : sank ? `${who} sank ${sank === 1 ? 'a ball' : `${sank} balls`}.` : `${who} sank nothing.`;
    if (!over) line += mine ? ' Your shot.' : me >= 0 && v.turn !== me ? ` ${seatName(m, v.turn)} to shoot.` : '';
  }
  return (
    <div className="sg-board sg-pool">
      <div className="sg-scores">
        {[0, 1].map((seat) => <div key={seat} className={v.turn === seat && !over ? 'turn' : ''}><b>{label(seat)}</b></div>)}
      </div>
      <canvas
        ref={canvas}
        width={(POOL.W + 2 * RAIL) * SCALE}
        height={(POOL.H + 2 * RAIL) * SCALE}
        className="sg-pool-table"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); point(e); }}
        onPointerMove={point}
        aria-label="Pool table. Drag to aim."
      />
      <p className="sg-line">{line}</p>
      {!over && me >= 0 && (
        <div className="sg-pool-controls">
          <button className="btn sm" disabled={!mine} onClick={() => turn(-1.5)} aria-label="Aim a little left">↺</button>
          <label>
            <small>Power {Math.round(power * 100)}%</small>
            <input type="range" min="0.1" max="1" step="0.05" value={power} disabled={!mine} onChange={(e) => setPower(Number(e.target.value))} />
          </label>
          <button className="btn sm" disabled={!mine} onClick={() => turn(1.5)} aria-label="Aim a little right">↻</button>
          <button className="btn go" disabled={!mine} onClick={() => play({ dx: aim.current[0], dy: aim.current[1], power })}>Shoot</button>
        </div>
      )}
    </div>
  );
}
