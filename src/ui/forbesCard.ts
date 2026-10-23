// The card a player shares from the Hustlers app, for the rich list or the week's money makers: drawn on a canvas
// so the picture on screen is the exact picture that gets saved or sent.
import { avatarSvg } from '../game/face';

export interface RichCard {
  rank: number;
  name: string;
  handle: string;
  /** Which board the rank is on. */
  board: 'rich' | 'week';
  /** Net worth, or money made this week. Already formatted, e.g. ₦4.3mn. */
  amount: string;
  /** Their job, or their wealth tier when they have none. */
  title: string;
  /** The line under the board's name, e.g. "This week". */
  list: string;
  look: string | null;
}

const W = 1080;
const H = 1350;
const SERIF = `Georgia, 'Times New Roman', serif`;
const SANS = `'Plus Jakarta Sans', system-ui, sans-serif`;

function faceOf(look: string | null): Promise<HTMLImageElement | null> {
  return new Promise((done) => {
    const img = new Image();
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = `data:image/svg+xml,${encodeURIComponent(avatarSvg(look, '#e0f2fe'))}`;
  });
}

/** Set the font at `size`, stepping down until `text` fits in `max` pixels. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, max: number) {
  do ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > max && (size -= 4) > 24);
}

function spaced(ctx: CanvasRenderingContext2D, px: number) {
  // Not every browser spaces canvas text; the card still reads fine without it.
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
}

function pill(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fill();
}

export async function drawRichCard(canvas: HTMLCanvasElement, card: RichCard) {
  const [face] = await Promise.all([faceOf(card.look), document.fonts?.load(`800 40px 'Plus Jakarta Sans'`).catch(() => {})]);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const gold = ctx.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, '#fef08a');
  gold.addColorStop(0.55, '#eab308');
  gold.addColorStop(1, '#b45309');

  // Black with a gold glow (green for the weekly board), like the app's own stage.
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#1c1917');
  bg.addColorStop(1, '#0c0a09');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W, 0, 0, W, 0, W * 1.1);
  const week = card.board === 'week';
  glow.addColorStop(0, week ? 'rgba(74, 222, 128, 0.3)' : 'rgba(250, 204, 21, 0.34)');
  glow.addColorStop(1, 'rgba(250, 204, 21, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
  ctx.lineWidth = 4;
  ctx.strokeRect(32, 32, W - 64, H - 64);

  // Masthead
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = `italic 700 112px ${SERIF}`;
  ctx.fillText('Hustlers', 84, 196);
  ctx.textAlign = 'right';
  spaced(ctx, 5);
  ctx.fillStyle = week ? '#4ade80' : '#facc15';
  ctx.font = `800 30px ${SANS}`;
  ctx.fillText(week ? 'MONEY MAKERS' : 'NAIJA RICH LIST', W - 84, 150);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
  ctx.font = `700 28px ${SANS}`;
  ctx.fillText(card.list.toUpperCase(), W - 84, 198);
  spaced(ctx, 0);
  // Green, white, green under the masthead.
  const third = (W - 168) / 3;
  ctx.fillStyle = '#008751';
  ctx.fillRect(84, 238, third, 6);
  ctx.fillRect(84 + third * 2, 238, third, 6);
  ctx.fillStyle = '#fff';
  ctx.fillRect(84 + third, 238, third, 6);

  // Face in a gold ring, the rank sitting on its lower edge.
  const cx = W / 2, cy = 500, r = 180;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#e0f2fe';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (face) ctx.drawImage(face, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  ctx.textAlign = 'center';
  const rank = `#${card.rank}`;
  ctx.font = `700 76px ${SERIF}`;
  const rankW = Math.max(190, ctx.measureText(rank).width + 96);
  ctx.fillStyle = '#0c0a09';
  pill(ctx, cx, cy + r, rankW + 16, 124);
  ctx.fillStyle = gold;
  pill(ctx, cx, cy + r, rankW, 108);
  ctx.fillStyle = '#422006';
  ctx.fillText(rank, cx, cy + r + 27);

  // Who
  ctx.fillStyle = '#fff';
  fit(ctx, card.name, 800, 68, SANS, W - 200);
  ctx.fillText(card.name, cx, 852);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
  ctx.font = `600 36px ${SANS}`;
  ctx.fillText(card.handle, cx, 908);

  // Net worth, or what they made this week
  spaced(ctx, 5);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = `800 26px ${SANS}`;
  ctx.fillText(week ? 'MADE THIS WEEK' : 'NET WORTH', cx, 996);
  spaced(ctx, 0);
  ctx.fillStyle = gold;
  const amount = week ? `+${card.amount}` : card.amount;
  fit(ctx, amount, 800, 124, SANS, W - 200);
  ctx.fillText(amount, cx, 1118);
  ctx.font = `800 32px ${SANS}`;
  ctx.fillStyle = 'rgba(250, 204, 21, 0.16)';
  pill(ctx, cx, 1186, ctx.measureText(card.title).width + 64, 64);
  ctx.fillStyle = '#fde047';
  ctx.fillText(card.title, cx, 1197);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = `700 28px ${SANS}`;
  ctx.fillText('Catch me on Naija City · naija.city', cx, 1282);
}
