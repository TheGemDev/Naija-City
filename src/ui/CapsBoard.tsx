// The Cover Soccer table. Like the pool table (PoolBoard.tsx): the server works out each flick, and this
// replays it by running the same physics (src/game/capball.ts) on the numbers the server sent.

import { useCallback, useEffect, useRef, useState } from 'react';
import { PITCH, capFlick, capOwner } from '../game/capball';
import { CAPS_TARGET, type CapsDisc, type CapsView } from '../game/streetGames';
import { seatName, type BoardProps } from './GameBoards';

/** Space behind each goal line for the nets, in table units, and canvas pixels per unit. */
const EDGE = 7;
const SCALE = 4;
const TEAMS = [{ name: 'Red', fill: '#dc2626', rim: '#7f1d1d' }, { name: 'Blue', fill: '#2563eb', rim: '#1e3a8a' }];

function drawDisc(ctx: CanvasRenderingContext2D, disc: CapsDisc, picked: boolean) {
  const owner = capOwner(disc.id);
  if (owner < 0) {
    ctx.beginPath();
    ctx.arc(disc.x, disc.y, PITCH.BALL, 0, 7);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
    return;
  }
  const team = TEAMS[owner];
  // A bottle cover: a crimped rim round a flat top.
  ctx.beginPath();
  ctx.arc(disc.x, disc.y, PITCH.CAP, 0, 7);
  ctx.fillStyle = team.rim;
  ctx.fill();
  ctx.setLineDash([0.9, 0.9]);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(disc.x, disc.y, PITCH.CAP * 0.72, 0, 7);
  ctx.fillStyle = team.fill;
  ctx.fill();
  if (picked) {
    ctx.beginPath();
    ctx.arc(disc.x, disc.y, PITCH.CAP + 1.6, 0, 7);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#fde047';
    ctx.stroke();
  }
}

export function CapsBoard({ m, busy, play }: BoardProps) {
  const v = m.view as CapsView;
  const over = m.status !== 'live';
  const me = m.you;
  const canvas = useRef<HTMLCanvasElement>(null);
  const aim = useRef<[number, number]>([0, me === 1 ? 1 : -1]);
  const [power, setPower] = useState(0.7);
  const [rolling, setRolling] = useState(false);
  /** The cover the player will flick. */
  const [picked, setPicked] = useState<number | null>(null);
  const drawn = useRef<CapsDisc[]>(v.discs);
  const latest = useRef(v);
  latest.current = v;
  const replayed = useRef(v.shot?.n ?? 0);
  const mine = m.pending.includes(me) && !busy && !rolling;
  // Until one is tapped, the cover nearest the ball is the one to flick.
  const ball = v.discs.find((o) => o.id === 0);
  const nearest = v.discs.filter((o) => capOwner(o.id) === me).sort((a, b) => (a.x - ball!.x) ** 2 + (a.y - ball!.y) ** 2 - (b.x - ball!.x) ** 2 - (b.y - ball!.y) ** 2)[0]?.id ?? null;
  const cap = picked ?? nearest;

  const paint = useCallback((aiming: boolean, chosen: number | null, strength: number) => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const { W, H, GOAL } = PITCH;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, EDGE * SCALE);
    ctx.fillStyle = '#3f2a14';
    ctx.fillRect(0, -EDGE, W, H + 2 * EDGE);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#15803d' : '#16a34a';
      ctx.fillRect(0, (i * H) / 8, W, H / 8);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(0.3, 0.3, W - 0.6, H - 0.6);
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.moveTo(W / 2 + 12, H / 2);
    ctx.arc(W / 2, H / 2, 12, 0, 7);
    ctx.stroke();
    // Goals: seat 1 defends the top one, seat 0 the bottom one.
    for (const [y, seat] of [[0, 1], [H, 0]] as const) {
      const dir = y === 0 ? -1 : 1;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(GOAL[0], y, GOAL[1] - GOAL[0], dir * (EDGE - 1));
      ctx.fillStyle = TEAMS[seat].fill;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(GOAL[0], y, GOAL[1] - GOAL[0], dir * (EDGE - 1));
      ctx.globalAlpha = 1;
      ctx.strokeRect(GOAL[0] - 8, y, GOAL[1] - GOAL[0] + 16, -dir * 18);
    }
    const discs = drawn.current;
    const from = discs.find((o) => o.id === chosen);
    if (aiming && from) {
      const [dx, dy] = aim.current;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const reach = 10 + 34 * strength;
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(from.x + (dx / len) * reach, from.y + (dy / len) * reach);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(from.x + (dx / len) * reach, from.y + (dy / len) * reach, 1.4, 0, 7);
      ctx.fillStyle = '#fde047';
      ctx.fill();
    }
    for (const disc of discs) drawDisc(ctx, disc, aiming && disc.id === chosen);
  }, []);

  const shotN = v.shot?.n ?? 0;
  useEffect(() => {
    const shot = latest.current.shot;
    if (!shot || shot.n === replayed.current) return;
    replayed.current = shot.n;
    const frames: CapsDisc[][] = [];
    capFlick(shot.from, shot.id, shot.dx, shot.dy, shot.power, (discs) => frames.push(discs));
    setRolling(true);
    setPicked(null);
    const began = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const i = Math.max(0, Math.floor(((now - began) / 1000) * 60));
      if (i >= frames.length) {
        drawn.current = latest.current.discs;
        setRolling(false);
        return;
      }
      drawn.current = frames[i];
      paint(false, null, 0);
      raf = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(raf);
      drawn.current = latest.current.discs;
      setRolling(false);
    };
  }, [shotN, paint]);

  useEffect(() => {
    if (rolling) return;
    drawn.current = latest.current.discs;
    paint(mine && !over, cap, power);
  }, [rolling, mine, over, shotN, cap, power, paint]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!mine || over || (e.type === 'pointermove' && !e.buttons && e.pointerType === 'mouse')) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * PITCH.W;
    const y = ((e.clientY - box.top) / box.height) * (PITCH.H + 2 * EDGE) - EDGE;
    // Touching one of your covers picks it; anywhere else is where to flick towards.
    const own = e.type === 'pointerdown' ? drawn.current.find((o) => capOwner(o.id) === me && (o.x - x) ** 2 + (o.y - y) ** 2 < (PITCH.CAP * 1.5) ** 2) : undefined;
    if (own) return setPicked(own.id);
    const from = drawn.current.find((o) => o.id === cap);
    if (!from || (x - from.x) ** 2 + (y - from.y) ** 2 < 4) return;
    aim.current = [x - from.x, y - from.y];
    paint(true, cap, power);
  };
  const turn = (degrees: number) => {
    const [dx, dy] = aim.current;
    const a = (degrees * Math.PI) / 180;
    aim.current = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
    paint(true, cap, power);
  };

  let line: string;
  if (rolling) line = '…';
  else if (v.last && v.last.goal !== null) line = `GOAL! ${seatName(m, v.last.goal)} ${v.last.goal === me ? 'score' : 'scores'}${v.last.goal !== v.last.seat ? ' (own goal)' : ''}. ${over ? '' : mine ? 'You kick off.' : `${seatName(m, v.turn)} kicks off.`}`;
  else if (over) line = '';
  else if (mine) line = `Tap one of your covers, drag to aim, then flick. You shoot ${me === 0 ? 'up ↑' : 'down ↓'}.`;
  else line = me >= 0 ? `Waiting for ${seatName(m, v.turn)}…` : `${seatName(m, v.turn)} to flick.`;
  return (
    <div className="sg-board sg-caps">
      <div className="sg-scores">
        {[1, 0].map((seat) => (
          <div key={seat} className={v.turn === seat && !over ? 'turn' : ''}>
            <b><i className="sg-dot" style={{ background: TEAMS[seat].fill }} /> {seatName(m, seat)}</b>
            <small>{v.score[seat]} of {CAPS_TARGET} · shoots {seat === 0 ? 'up' : 'down'}</small>
          </div>
        ))}
      </div>
      <canvas
        ref={canvas}
        width={PITCH.W * SCALE}
        height={(PITCH.H + 2 * EDGE) * SCALE}
        className="sg-caps-table"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); point(e); }}
        onPointerMove={point}
        aria-label="Cover Soccer table. Tap a cover and drag to aim."
      />
      <p className="sg-line">{line}</p>
      {!over && me >= 0 && (
        <div className="sg-pool-controls">
          <button className="btn sm" disabled={!mine} onClick={() => turn(-2)} aria-label="Aim a little left">↺</button>
          <label>
            <small>Power {Math.round(power * 100)}%</small>
            <input type="range" min="0.1" max="1" step="0.05" value={power} disabled={!mine} onChange={(e) => setPower(Number(e.target.value))} />
          </label>
          <button className="btn sm" disabled={!mine} onClick={() => turn(2)} aria-label="Aim a little right">↻</button>
          <button className="btn go" disabled={!mine || cap === null} onClick={() => play({ cap, dx: aim.current[0], dy: aim.current[1], power })}>Flick</button>
        </div>
      )}
    </div>
  );
}
