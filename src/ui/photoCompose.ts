// Draws a finished photo: the shot itself, the stickers and captions placed on it, and the Naija City
// mark along the bottom. The editor's preview and the saved picture both come from drawPhoto(), so what
// you arrange is exactly what gets shared.

export type CaptionStyle = 'outline' | 'bar' | 'pop';
export const CAPTION_STYLES: CaptionStyle[] = ['outline', 'bar', 'pop'];

/** Something placed on the photo. Positions are fractions of the picture, sizes fractions of its short side, so they hold at any resolution. */
export interface Layer {
  id: number;
  /** An emoji, a word badge, or a line of the player's own text. */
  kind: 'emoji' | 'tag' | 'caption';
  text: string;
  x: number;
  y: number;
  /** Text height. */
  size: number;
  /** Turn, in radians. */
  rot: number;
  /** Badge colours (index into TAG_TONES) or caption look. */
  tone: number;
  style: CaptionStyle;
}

/** The rotated box a layer was drawn in, in canvas pixels: used to pick it up under a finger. */
export interface Box {
  id: number;
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  rot: number;
}

/** How the Naija City mark is dressed. Most are bits of paper and card left on the picture (scraps, a ticket, a till receipt, a luggage tag, a rubber stamp, a number plate); the rest frame it or sit quietly in a corner. */
export type MarkStyle = 'papers' | 'ticket' | 'receipt' | 'tag' | 'stamp' | 'plate' | 'polaroid' | 'film' | 'banner' | 'badge';
/** `corners` is whether the mark sits in a corner and can be moved to another one. */
export const MARK_STYLES: { id: MarkStyle; label: string; corners: boolean }[] = [
  { id: 'papers', label: 'Papers', corners: true },
  { id: 'ticket', label: 'Ticket', corners: true },
  { id: 'receipt', label: 'Receipt', corners: true },
  { id: 'tag', label: 'Tag', corners: true },
  { id: 'stamp', label: 'Stamp', corners: true },
  { id: 'plate', label: 'Plate', corners: true },
  { id: 'polaroid', label: 'Polaroid', corners: false },
  { id: 'film', label: 'Film', corners: false },
  { id: 'banner', label: 'Banner', corners: false },
  { id: 'badge', label: 'Badge', corners: true },
];
/** Which corner a corner mark sits in: 0 top right, then clockwise. */
export const CORNERS = 4;

export interface Mark {
  style: MarkStyle;
  corner: number;
  username: string | null;
  /** Where the picture was taken ("Central Market") and on which day of this life. */
  place: string | null;
  /** The city it was taken in. */
  city?: string;
  day: number;
}

export const EMOJI_STICKERS = ['🔥', '😂', '😎', '🥳', '😍', '🤑', '🙏🏾', '💯', '👑', '💸', '❤️', '✨', '🎉', '👀', '💪🏾', '🤝🏾', '🛺', '🏠', '🚗', '🍚', '🌴', '📍', '🇳🇬', '⚡'];
export const TAG_STICKERS = ['ODOGWU', 'NO WAHALA', 'GOD WHEN?', 'SAPA NO DEY', 'SOFT LIFE', 'KADUNA TO THE WORLD', 'ABUJA TO THE WORLD', 'LAGOS TO THE WORLD', 'KANO TO THE WORLD', 'WE MOVE', 'E CHOKE', 'BIG BOSS', 'NA ME BE THIS', 'OUTSIDE', 'MY NEW CRIB'];

const GREEN = '#0f6b3a';
const AMBER = '#f59e0b';
const INK = '#0f172a';
/** Where to play, written out in full on every mark. */
const SITE = 'https://naija.city';
/** Badge background and text colours. */
export const TAG_TONES: [string, string][] = [[AMBER, INK], [GREEN, '#fff'], ['#fff', INK], ['#ef4444', '#fff'], [INK, '#facc15']];

const SANS = `'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif`;
const MONO = `ui-monospace, 'SF Mono', Menlo, Consolas, 'Roboto Mono', monospace`;
const EMOJI = `'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
/** A caption wraps before it gets wider than this much of the picture. */
const CAPTION_WIDTH = 0.86;

const font = (weight: number, px: number) => `${weight} ${px}px ${SANS}`;

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** Draws one layer centred on its spot and returns half the width and height it took up. */
function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, w: number, h: number) {
  const px = l.size * Math.min(w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (l.kind === 'emoji') {
    ctx.font = `${px}px ${EMOJI}`;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = px * 0.12;
    ctx.shadowOffsetY = px * 0.04;
    ctx.fillText(l.text, 0, px * 0.06);
    return { hw: px * 0.62, hh: px * 0.62 };
  }
  if (l.kind === 'tag') {
    const [bg, fg] = TAG_TONES[l.tone % TAG_TONES.length];
    ctx.font = font(800, px);
    const hw = ctx.measureText(l.text).width / 2 + px * 0.62;
    const hh = px * 0.92;
    // A white rim and a hard drop shadow, like a sticker peeled off a sheet.
    ctx.shadowColor = 'rgba(0,0,0,0.38)';
    ctx.shadowBlur = px * 0.3;
    ctx.shadowOffsetY = px * 0.12;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(-hw - px * 0.16, -hh - px * 0.16, (hw + px * 0.16) * 2, (hh + px * 0.16) * 2, px * 0.52);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, hw * 2, hh * 2, px * 0.4);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillText(l.text, 0, px * 0.05);
    return { hw: hw + px * 0.16, hh: hh + px * 0.16 };
  }
  ctx.font = font(800, px);
  const lines = wrap(ctx, l.text || 'Your caption', w * CAPTION_WIDTH - px);
  const lh = px * 1.24;
  const tw = Math.max(...lines.map((s) => ctx.measureText(s).width));
  const hw = tw / 2 + px * 0.5;
  const hh = (lines.length * lh) / 2 + px * 0.22;
  if (l.style !== 'outline') {
    ctx.fillStyle = l.style === 'pop' ? AMBER : 'rgba(2,6,23,0.78)';
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, hw * 2, hh * 2, px * 0.36);
    ctx.fill();
  }
  ctx.globalAlpha = l.text ? 1 : 0.55;
  lines.forEach((s, i) => {
    const y = (i - (lines.length - 1) / 2) * lh + px * 0.04;
    if (l.style === 'outline') {
      ctx.strokeStyle = 'rgba(2,6,23,0.9)';
      ctx.lineWidth = px * 0.24;
      ctx.strokeText(s, 0, y);
    }
    ctx.fillStyle = l.style === 'pop' ? INK : '#fff';
    ctx.fillText(s, 0, y);
  });
  return { hw, hh };
}

/** Text cut short with … so it fits in `max` pixels. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Sets the font to `px`, or as much smaller as it takes for `text` to fit in `max` pixels: for numbers, which can't be cut short. */
function shrink(ctx: CanvasRenderingContext2D, weight: number, px: number, text: string, max: number) {
  ctx.font = font(weight, px);
  const tw = ctx.measureText(text).width;
  if (tw > max) ctx.font = font(weight, (px * max) / tw);
}

/** The app icon: a green tile with "I", a heart and the Nigerian flag (public/icons/kaduna-life.svg), drawn in a 512 box. */
const ICON_PATHS: [string, string][] = [
  ['#fff', 'M172.7 222V94H199.3V222Z'],
  ['#fff', 'M141 282H377A18 18 0 0 1 395 300V410A18 18 0 0 1 377 428H141A18 18 0 0 1 123 410V300A18 18 0 0 1 141 282Z'],
  ['#008751', 'M142 292H217V418H142A9 9 0 0 1 133 409V301A9 9 0 0 1 142 292Z M301 292H376A9 9 0 0 1 385 301V409A9 9 0 0 1 376 418H301Z'],
];
const ICON_HEART = 'M350 238C262 180 262 94 320 94c20 0 30 12 30 28 0-16 10-28 30-28 58 0 58 86-30 144z';

function drawIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 512, size / 512);
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 512, 112);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // A hairline of light round the tile so it holds its edge on dark pictures.
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 10;
  ctx.stroke();
  for (const [fill, d] of ICON_PATHS) {
    ctx.fillStyle = fill;
    ctx.fill(new Path2D(d));
  }
  ctx.translate(-44, -2);
  ctx.scale(1, 0.98);
  ctx.fillStyle = '#ef4444';
  ctx.fill(new Path2D(ICON_HEART));
  ctx.restore();
}

/** "NaijaCity" in the brand's two colours, starting at x on the given baseline. Returns its width. */
function wordmark(ctx: CanvasRenderingContext2D, x: number, y: number, px: number, naija: string, city: string) {
  ctx.font = font(800, px);
  ctx.letterSpacing = `${-px * 0.035}px`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = naija;
  ctx.fillText('Naija', x, y);
  const kw = ctx.measureText('Naija').width;
  ctx.fillStyle = city;
  ctx.fillText('City', x + kw, y);
  const lw = ctx.measureText('City').width;
  ctx.letterSpacing = '0px';
  return kw + lw;
}

/** A scrap of paper lying at an angle, with a shadow under it. `inside` draws on it with the scrap's top-left corner as the origin. */
function paper(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rot: number, fill: string, u: number, edge: 'clean' | 'torn', inside: () => void) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rot);
  ctx.translate(-w / 2, -h / 2);
  ctx.beginPath();
  if (edge === 'torn') {
    // Ripped off a pad: the bottom edge wanders, the same way every time.
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h);
    const teeth = 22;
    for (let i = 1; i <= teeth; i++) ctx.lineTo(w - (w * i) / teeth, h - u * (0.25 + 0.55 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1)));
    ctx.closePath();
  } else ctx.roundRect(0, 0, w, h, u * 0.5);
  ctx.shadowColor = 'rgba(2,6,23,0.42)';
  ctx.shadowBlur = u * 2.2;
  ctx.shadowOffsetY = u * 0.9;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  inside();
  ctx.restore();
}

/** The mark as a little pile on a desk: a torn yellow note saying where and when, a white card with the logo taped over it, and a green ticket with the player's name. */
function drawPapers(ctx: CanvasRenderingContext2D, w: number, h: number, mark: Mark) {
  // A touch smaller on upright pictures, where the short side is all the width there is.
  const u = (Math.min(w, h) / 100) * (h > w ? 0.92 : 1);
  const gw = u * 52;
  const gh = u * 35;
  const m = u * 2.5;
  const right = mark.corner % CORNERS < 2;
  const top = mark.corner % CORNERS === 0 || mark.corner % CORNERS === 3;
  ctx.save();
  ctx.translate(right ? w - gw - m : m, top ? m : h - gh - m);

  // The note at the back.
  paper(ctx, u * 21, u * 12.5, u * 29, u * 19, 0.09, '#fde68a', u, 'torn', () => {
    ctx.strokeStyle = 'rgba(146,64,14,0.2)';
    ctx.lineWidth = u * 0.14;
    for (let y = u * 8.4; y < u * 18; y += u * 3.3) {
      ctx.beginPath();
      ctx.moveTo(u * 1.6, y);
      ctx.lineTo(u * 27.4, y);
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(800, u * 1.55);
    ctx.letterSpacing = `${u * 0.16}px`;
    ctx.fillStyle = '#b45309';
    ctx.fillText('SNAPPED AT', u * 2.2, u * 7.6);
    ctx.letterSpacing = '0px';
    ctx.font = font(800, u * 2.9);
    ctx.fillStyle = INK;
    ctx.fillText(fit(ctx, mark.place ?? mark.city ?? 'Naija City', u * 24.5), u * 2.2, u * 11);
    ctx.font = font(700, u * 2.1);
    ctx.fillStyle = '#92400e';
    ctx.fillText(`Day ${mark.day} · ${mark.city ?? 'Naija City'}, Nigeria`, u * 2.2, u * 14.4);
  });

  // The logo card on top of it.
  paper(ctx, u * 3, u * 2.5, u * 42, u * 15.5, -0.055, '#fffdf7', u, 'clean', () => {
    drawIcon(ctx, u * 2.4, u * 2.6, u * 10.3);
    const tx = u * 15;
    wordmark(ctx, tx, u * 8.3, u * 5.2, GREEN, AMBER);
    ctx.font = font(800, u * 2.3);
    ctx.fillStyle = GREEN;
    ctx.fillText(SITE, tx, u * 11.9);
  });

  // A strip of tape holding the card down.
  ctx.save();
  ctx.translate(u * 25, u * 2.4);
  ctx.rotate(0.1);
  ctx.fillStyle = 'rgba(254,243,199,0.72)';
  ctx.fillRect(-u * 5.5, -u * 1.6, u * 11, u * 3.2);
  ctx.strokeStyle = 'rgba(146,64,14,0.14)';
  ctx.lineWidth = u * 0.12;
  ctx.strokeRect(-u * 5.5, -u * 1.6, u * 11, u * 3.2);
  ctx.restore();

  // The player's ticket, tucked under the card's corner.
  if (mark.username) {
    ctx.font = font(800, u * 2.5);
    const name = fit(ctx, `@${mark.username}`, u * 26);
    const tw = ctx.measureText(name).width + u * 4.6;
    paper(ctx, u * 0.6, u * 26.5, tw, u * 5.6, -0.07, GREEN, u, 'clean', () => {
      // Punched like a luggage tag.
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(u * 1.5, u * 2.8, u * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = font(800, u * 2.5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(name, u * 2.9, u * 2.95);
    });
  }
  ctx.restore();
}

/** The mark as one small dark pill in a corner, for when the picture should do the talking. */
function drawBadge(ctx: CanvasRenderingContext2D, w: number, h: number, mark: Mark) {
  const u = Math.min(w, h) / 100;
  const m = u * 3.2;
  const icon = u * 6.4;
  const ph = u * 9;
  const px = u * 4.6;
  ctx.font = font(800, px);
  ctx.letterSpacing = `${-px * 0.035}px`;
  const ww = ctx.measureText('NaijaCity').width;
  ctx.letterSpacing = '0px';
  ctx.font = font(700, u * 2.3);
  const label = fit(ctx, mark.username ? `${SITE} · @${mark.username}` : SITE, u * 46);
  const sw = ctx.measureText(label).width;
  const pw = u * 1.3 + icon + u * 1.8 + ww + u * 2 + sw + u * 3;
  const right = mark.corner % CORNERS < 2;
  const top = mark.corner % CORNERS === 0 || mark.corner % CORNERS === 3;
  const x = right ? w - pw - m : m;
  const y = top ? m : h - ph - m;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = u * 2;
  ctx.shadowOffsetY = u * 0.6;
  ctx.fillStyle = 'rgba(2,6,23,0.78)';
  ctx.beginPath();
  ctx.roundRect(x, y, pw, ph, ph / 2);
  ctx.fill();
  ctx.restore();
  drawIcon(ctx, x + u * 1.3, y + (ph - icon) / 2, icon);
  const tx = x + u * 1.3 + icon + u * 1.8;
  wordmark(ctx, tx, y + ph / 2 + px * 0.34, px, '#fff', '#fbbf24');
  ctx.font = font(700, u * 2.3);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fillText(label, tx + ww + u * 2, y + ph / 2 + u * 0.85);
}

/** The mark as a banner: icon, wordmark and where to play on the left, who took it and where on the right, on a soft shade so it reads over any picture. */
function drawBanner(ctx: CanvasRenderingContext2D, w: number, h: number, mark: Mark) {
  const u = Math.min(w, h) / 100;
  const pad = u * 4.2;
  const shadeH = u * 30;
  const shade = ctx.createLinearGradient(0, h - shadeH, 0, h);
  shade.addColorStop(0, 'rgba(2,6,23,0)');
  shade.addColorStop(0.55, 'rgba(2,6,23,0.34)');
  shade.addColorStop(1, 'rgba(2,6,23,0.74)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, h - shadeH, w, shadeH);

  // The brand's colours as a thin footer line: green with an amber start.
  const line = u * 0.9;
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, h - line, w, line);
  ctx.fillStyle = AMBER;
  ctx.fillRect(0, h - line, w * 0.24, line);

  const icon = u * 10.5;
  const base = h - line - pad;
  drawIcon(ctx, pad, base - icon, icon);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = u * 1.2;
  const tx = pad + icon + u * 2.4;
  const word = u * 6.1;
  ctx.font = font(800, word);
  ctx.letterSpacing = `${-word * 0.035}px`;
  ctx.fillStyle = '#fff';
  ctx.fillText('Naija', tx, base - u * 4.5);
  const kw = ctx.measureText('Naija').width;
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('City', tx + kw, base - u * 4.5);
  const leftEnd = tx + kw + ctx.measureText('City').width;
  ctx.letterSpacing = '0px';
  ctx.font = font(700, u * 2.55);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText('Play free at ', tx, base - u * 0.5);
  const pw = ctx.measureText('Play free at ').width;
  ctx.fillStyle = '#fff';
  ctx.font = font(800, u * 2.55);
  ctx.fillText(SITE, tx + pw, base - u * 0.5);
  const subEnd = tx + pw + ctx.measureText(SITE).width;

  // Who and where, tucked into the other corner if the picture is wide enough to hold both.
  const room = w - pad - Math.max(leftEnd, subEnd) - u * 5;
  ctx.textAlign = 'right';
  if (mark.username && room > u * 16) {
    ctx.font = font(800, u * 3.3);
    ctx.fillStyle = '#fff';
    ctx.fillText(fit(ctx, `@${mark.username}`, room), w - pad, base - u * 4.5);
  }
  if (mark.place && room > u * 16) {
    ctx.font = font(600, u * 2.55);
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.fillText(fit(ctx, `${mark.place} · Day ${mark.day}`, room), w - pad, base - u * (mark.username ? 0.5 : 2.4));
  }
  ctx.shadowColor = 'transparent';
  ctx.textAlign = 'left';
}

/** Puts the origin at the top-left of a `gw` by `gh` mark sitting in the chosen corner, turned a little about its middle. Pair with ctx.restore(). */
function inCorner(ctx: CanvasRenderingContext2D, w: number, h: number, mark: Mark, gw: number, gh: number, m: number, rot: number) {
  const right = mark.corner % CORNERS < 2;
  const top = mark.corner % CORNERS === 0 || mark.corner % CORNERS === 3;
  ctx.save();
  ctx.translate((right ? w - gw - m : m) + gw / 2, (top ? m : h - gh - m) + gh / 2);
  ctx.rotate(rot);
  ctx.translate(-gw / 2, -gh / 2);
}

/** Fills the current path as a piece of card with a shadow under it. */
function card(ctx: CanvasRenderingContext2D, fill: string, u: number) {
  ctx.shadowColor = 'rgba(2,6,23,0.42)';
  ctx.shadowBlur = u * 2.2;
  ctx.shadowOffsetY = u * 0.9;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** The mark as a bus ticket: logo and address on the body, the day on a stub you could tear off along the perforation. */
function drawTicket(ctx: CanvasRenderingContext2D, w: number, h: number, mark: Mark) {
  const u = (Math.min(w, h) / 100) * (h > w ? 0.92 : 1);
  const tw = u * 50;
  const th = u * 17;
  const tear = u * 38;
  const notch = u * 1.5;
  inCorner(ctx, w, h, mark, tw, th, u * 3.4, -0.045);
  // A rounded card with a bite out of each edge where the stub tears off.
  const r = u * 1.2;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(tear - notch, 0);
  ctx.arc(tear, 0, notch, Math.PI, 0, true);
  ctx.lineTo(tw - r, 0);
  ctx.arcTo(tw, 0, tw, r, r);
  ctx.lineTo(tw, th - r);
  ctx.arcTo(tw, th, tw - r, th, r);
  ctx.lineTo(tear + notch, th);
  ctx.arc(tear, th, notch, 0, Math.PI, true);
  ctx.lineTo(r, th);
  ctx.arcTo(0, th, 0, th - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  card(ctx, '#fef3c7', u);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, 0, tw, u * 1.3);
  ctx.fillRect(0, th - u * 1.3, tw, u * 1.3);
  ctx.restore();
  ctx.strokeStyle = 'rgba(146,64,14,0.45)';
  ctx.lineWidth = u * 0.22;
  ctx.setLineDash([u * 0.7, u * 0.7]);
  ctx.beginPath();
  ctx.moveTo(tear, notch + u * 0.6);
  ctx.lineTo(tear, th - notch - u * 0.6);
  ctx.stroke();
  ctx.setLineDash([]);

  drawIcon(ctx, u * 2.4, u * 3, u * 7.4);
  const tx = u * 11.6;
  wordmark(ctx, tx, u * 7.2, u * 4.5, GREEN, '#d97706');
  ctx.font = font(800, u * 2.05);
  ctx.fillStyle = INK;
  ctx.fillText(SITE, tx, u * 10.3);
  ctx.font = font(700, u * 1.8);
  ctx.fillStyle = '#92400e';
  const line = [mark.username && `@${mark.username}`, mark.place ?? mark.city ?? 'Naija City'].filter(Boolean).join(' · ');
  ctx.fillText(fit(ctx, line, tear - u * 4.6), u * 2.4, u * 14);

  // The stub: which day of this life the ride was on.
  const sx = (tear + tw) / 2;
  ctx.textAlign = 'center';
  ctx.font = font(800, u * 1.6);
  ctx.letterSpacing = `${u * 0.3}px`;
  ctx.fillStyle = '#92400e';
  ctx.fillText('DAY', sx + u * 0.15, u * 5.6);
  ctx.letterSpacing = '0px';
  shrink(ctx, 800, u * 5.2, String(mark.day), u * 9.2);
  ctx.fillStyle = INK;
  ctx.fillText(String(mark.day), sx, u * 10.9);
  ctx.font = font(700, u * 1.35);
  ctx.fillStyle = '#92400e';
  ctx.fillText('ADMIT ONE', sx, u * 13.9);
  ctx.textAlign = 'left';
  ctx.restore();
}

/** The mark as a till receipt torn off the roll: logo and address up top, then where, when and who, itemised. */
function drawReceipt(ctx: CanvasRenderingContext2D, w: number, h: number, mark: Mark) {
  const u = (Math.min(w, h) / 100) * (h > w ? 0.92 : 1);
  const rw = u * 27;
  const rh = u * (mark.username ? 36.5 : 34);
  const pad = u * 2.2;
  const mono = (weight: number, px: number) => `${weight} ${px}px ${MONO}`;
  inCorner(ctx, w, h, mark, rw, rh, u * 3.2, 0.035);
  paper(ctx, 0, 0, rw, rh, 0, '#fffdf7', u, 'torn', () => {
    const rule = (y: number) => {
      ctx.strokeStyle = 'rgba(15,23,42,0.5)';
      ctx.lineWidth = u * 0.16;
      ctx.setLineDash([u * 0.6, u * 0.5]);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(rw - pad, y);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const row = (label: string, value: string, y: number) => {
      ctx.textAlign = 'left';
      ctx.fillText(label, pad, y);
      const lw = ctx.measureText(label).width;
      ctx.textAlign = 'right';
      ctx.fillText(fit(ctx, value, rw - pad * 2 - lw - u * 1.4), rw - pad, y);
    };
    drawIcon(ctx, rw / 2 - u * 2.7, u * 2.2, u * 5.4);
    const px = u * 3.5;
    ctx.font = font(800, px);
    ctx.letterSpacing = `${-px * 0.035}px`;
    const ww = ctx.measureText('NaijaCity').width;
    wordmark(ctx, (rw - ww) / 2, u * 11.7, px, GREEN, AMBER);
    ctx.textAlign = 'center';
    ctx.font = mono(700, u * 1.55);
    ctx.fillStyle = INK;
    ctx.fillText(SITE, rw / 2, u * 14.3);
    rule(u * 16);
    ctx.font = mono(600, u * 1.5);
    let y = u * 18.8;
    row('PLACE', mark.place ?? mark.city ?? 'Naija City', y);
    row('DAY', String(mark.day), (y += u * 2.5));
    if (mark.username) row('BY', `@${mark.username}`, (y += u * 2.5));
    rule((y += u * 1.6));
    ctx.font = mono(800, u * 1.85);
    row('TOTAL', 'PRICELESS', (y += u * 3));
    // A barcode to finish: the same bars every time.
    ctx.fillStyle = INK;
    y += u * 1.6;
    for (let x = pad, i = 1; x < rw - pad - u * 0.6; i++) {
      const bw = u * (0.16 + 0.42 * Math.abs((Math.sin(i * 78.233) * 43758.5453) % 1));
      if (i % 2) ctx.fillRect(x, y, Math.min(bw, rw - pad - x), u * 3.6);
      x += bw;
    }
    ctx.textAlign = 'left';
  });
  ctx.restore();
}

/** The mark as a brown luggage tag on a loop of string: logo and address on it, the player's details written underneath. */
function drawTag(ctx: CanvasRenderingContext2D, w: number, h: number, mark: Mark) {
  const u = (Math.min(w, h) / 100) * (h > w ? 0.92 : 1);
  const tw = u * 45;
  const th = u * 16.5;
  const cut = u * 4;
  const hole = { x: u * 3.9, y: th / 2 };
  inCorner(ctx, w, h, mark, tw, th, u * 3.6, -0.06);
  ctx.beginPath();
  ctx.moveTo(cut, 0);
  ctx.lineTo(tw - u, 0);
  ctx.arcTo(tw, 0, tw, u, u);
  ctx.lineTo(tw, th - u);
  ctx.arcTo(tw, th, tw - u, th, u);
  ctx.lineTo(cut, th);
  ctx.lineTo(0, th - cut);
  ctx.lineTo(0, cut);
  ctx.closePath();
  card(ctx, '#e3c594', u);
  // The eyelet: a paper ring round a punched hole.
  ctx.fillStyle = '#fffdf7';
  ctx.beginPath();
  ctx.arc(hole.x, hole.y, u * 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(2,6,23,0.6)';
  ctx.beginPath();
  ctx.arc(hole.x, hole.y, u * 0.85, 0, Math.PI * 2);
  ctx.fill();
  // String looped through it and trailing off.
  ctx.strokeStyle = '#fafaf9';
  ctx.lineWidth = u * 0.5;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(2,6,23,0.45)';
  ctx.shadowBlur = u * 0.8;
  ctx.shadowOffsetY = u * 0.3;
  ctx.beginPath();
  ctx.moveTo(hole.x, hole.y);
  ctx.bezierCurveTo(-u * 4, hole.y - u * 5, -u * 1, hole.y + u * 9, u * 5, th + u * 3.4);
  ctx.moveTo(hole.x, hole.y);
  ctx.bezierCurveTo(-u * 2.6, hole.y + u * 2, -u * 3, hole.y + u * 7, u * 1.2, th + u * 4.6);
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineCap = 'butt';

  drawIcon(ctx, u * 7.4, u * 2.3, u * 7.6);
  const tx = u * 16.8;
  wordmark(ctx, tx, u * 6.9, u * 4.8, GREEN, '#c2410c');
  ctx.font = font(800, u * 2.1);
  ctx.fillStyle = INK;
  ctx.fillText(SITE, tx, u * 9.9);
  ctx.strokeStyle = 'rgba(68,40,12,0.35)';
  ctx.lineWidth = u * 0.16;
  ctx.beginPath();
  ctx.moveTo(u * 7.4, u * 11.5);
  ctx.lineTo(tw - u * 2.2, u * 11.5);
  ctx.stroke();
  ctx.font = font(700, u * 1.85);
  ctx.fillStyle = '#5b3a12';
  ctx.textAlign = 'right';
  ctx.fillText(`Day ${mark.day}`, tw - u * 2.2, u * 14.3);
  const dw = ctx.measureText(`Day ${mark.day}`).width;
  ctx.textAlign = 'left';
  const line = [mark.username && `@${mark.username}`, mark.place ?? mark.city ?? 'Naija City'].filter(Boolean).join(' · ');
  ctx.fillText(fit(ctx, line, tw - u * 11.2 - dw), u * 7.4, u * 14.3);
  ctx.restore();
}

/** Text bent round a circle of radius `r` about the origin, centred on the top of it or the bottom, reading left to right either way. */
function arcText(ctx: CanvasRenderingContext2D, text: string, r: number, top: boolean, gap: number) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width + gap);
  let a = -widths.reduce((sum, cw) => sum + cw, 0) / r / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  chars.forEach((c, i) => {
    const mid = a + widths[i] / r / 2;
    ctx.save();
    ctx.rotate(top ? mid : -mid);
    ctx.fillText(c, 0, top ? -r : r);
    ctx.restore();
    a += widths[i] / r;
  });
}

/** The mark as a round rubber stamp, a little crooked: the name and the address round the rim, where and when in the middle. */
function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, mark: Mark) {
  const u = Math.min(w, h) / 100;
  const r = u * 15.5;
  const m = u * 3;
  const right = mark.corner % CORNERS < 2;
  const top = mark.corner % CORNERS === 0 || mark.corner % CORNERS === 3;
  ctx.save();
  ctx.translate(right ? w - m - r : m + r, top ? m + r : h - m - r);
  ctx.rotate(-0.2);
  // A disc of paper under the ink, so it reads over any picture.
  ctx.shadowColor = 'rgba(2,6,23,0.4)';
  ctx.shadowBlur = u * 2.2;
  ctx.shadowOffsetY = u * 0.8;
  ctx.fillStyle = 'rgba(255,253,247,0.95)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = GREEN;
  for (const [inset, width] of [[0.9, 0.7], [1.9, 0.26], [5.4, 0.26]]) {
    ctx.lineWidth = u * width;
    ctx.beginPath();
    ctx.arc(0, 0, r - u * inset, 0, Math.PI * 2);
    ctx.stroke();
  }
  const rim = r - u * 3.65;
  ctx.fillStyle = GREEN;
  ctx.font = font(800, u * 2.5);
  arcText(ctx, 'NAIJA CITY', rim, true, u * 0.55);
  ctx.font = font(800, u * 1.75);
  arcText(ctx, SITE, rim, false, u * 0.22);
  ctx.fillStyle = AMBER;
  for (const x of [-rim, rim]) {
    ctx.beginPath();
    ctx.arc(x, 0, u * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(800, u * 1.7);
  ctx.fillStyle = GREEN;
  ctx.fillText(fit(ctx, (mark.place ?? mark.city ?? 'Naija City').toUpperCase(), u * 15.5), 0, -u * 3.4);
  shrink(ctx, 800, u * 4.6, `DAY ${mark.day}`, u * 17.5);
  ctx.fillStyle = '#b45309';
  ctx.fillText(`DAY ${mark.day}`, 0, u * 1.9);
  ctx.font = font(700, u * 1.5);
  ctx.fillStyle = GREEN;
  ctx.fillText(mark.username ? fit(ctx, `@${mark.username}`, u * 15.5) : 'NIGERIA', 0, u * 4.9);
  ctx.restore();
}

/** The mark as a car number plate: the icon where the flag goes, the day as the registration, the address where the state motto would be. */
function drawPlate(ctx: CanvasRenderingContext2D, w: number, h: number, mark: Mark) {
  const u = Math.min(w, h) / 100;
  const pw = u * 38;
  const ph = u * 16;
  const m = u * 3.2;
  const navy = '#1e3a8a';
  const right = mark.corner % CORNERS < 2;
  const top = mark.corner % CORNERS === 0 || mark.corner % CORNERS === 3;
  ctx.save();
  ctx.translate(right ? w - pw - m : m, top ? m : h - ph - m);
  ctx.shadowColor = 'rgba(2,6,23,0.45)';
  ctx.shadowBlur = u * 2.2;
  ctx.shadowOffsetY = u * 0.9;
  ctx.fillStyle = '#fffdf7';
  ctx.beginPath();
  ctx.roundRect(0, 0, pw, ph, u * 1.8);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = navy;
  ctx.lineWidth = u * 0.36;
  ctx.beginPath();
  ctx.roundRect(u * 0.7, u * 0.7, pw - u * 1.4, ph - u * 1.4, u * 1.2);
  ctx.stroke();
  const icon = u * 8.4;
  drawIcon(ctx, u * 2.2, (ph - icon) / 2, icon);
  const left = u * 2.2 + icon + u * 1.6;
  const room = pw - left - u * 2;
  const cx = left + room / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(800, u * 1.85);
  ctx.letterSpacing = `${u * 0.5}px`;
  ctx.fillStyle = GREEN;
  ctx.fillText('NAIJA CITY', cx + u * 0.25, u * 4.1);
  ctx.letterSpacing = '0px';
  const reg = `NJC-${String(mark.day).padStart(3, '0')}`;
  shrink(ctx, 800, u * 6.2, reg, room);
  ctx.fillStyle = navy;
  ctx.fillText(reg, cx, u * 10.4);
  ctx.font = font(800, u * 1.9);
  ctx.fillStyle = INK;
  ctx.fillText(SITE, cx, u * 13.6);
  ctx.restore();
  // Whose car it is, on a strip under (or over) the plate.
  if (mark.username) {
    ctx.save();
    ctx.font = font(800, u * 2.3);
    const name = fit(ctx, `@${mark.username}`, pw - u * 4);
    const tw = ctx.measureText(name).width + u * 3.2;
    const x = right ? w - m - tw : m;
    const y = top ? m + ph + u * 1.2 : h - m - ph - u * 1.2 - u * 4.6;
    ctx.shadowColor = 'rgba(2,6,23,0.4)';
    ctx.shadowBlur = u * 1.6;
    ctx.shadowOffsetY = u * 0.5;
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.roundRect(x, y, tw, u * 4.6, u * 1.2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(name, x + u * 1.6, y + u * 2.4);
    ctx.restore();
  }
}

/** The mark as an instant photo: a white frame round the picture with the logo and the details written on the wide bottom edge. */
function drawPolaroid(ctx: CanvasRenderingContext2D, w: number, h: number, mark: Mark) {
  const u = Math.min(w, h) / 100;
  const b = u * 3;
  const band = u * 15;
  ctx.fillStyle = '#fffdf7';
  ctx.fillRect(0, 0, w, b);
  ctx.fillRect(0, 0, b, h);
  ctx.fillRect(w - b, 0, b, h);
  ctx.fillRect(0, h - band, w, band);
  // The picture sits a hair below the card.
  ctx.strokeStyle = 'rgba(2,6,23,0.22)';
  ctx.lineWidth = u * 0.22;
  ctx.strokeRect(b, b, w - b * 2, h - band - b);

  const y = h - band;
  const icon = u * 9;
  drawIcon(ctx, u * 4, y + u * 3, icon);
  const tx = u * 4 + icon + u * 2.2;
  const leftEnd = tx + wordmark(ctx, tx, y + u * 7.7, u * 5.3, GREEN, AMBER);
  ctx.font = font(800, u * 2.3);
  ctx.fillStyle = '#475569';
  ctx.fillText(SITE, tx, y + u * 11.4);
  const room = w - u * 4 - Math.max(leftEnd, tx + ctx.measureText(SITE).width) - u * 4;
  ctx.textAlign = 'right';
  if (mark.username && room > u * 16) {
    ctx.font = font(800, u * 3.1);
    ctx.fillStyle = INK;
    ctx.fillText(fit(ctx, `@${mark.username}`, room), w - u * 4, y + u * 7.4);
  }
  if (mark.place && room > u * 16) {
    ctx.font = font(600, u * 2.3);
    ctx.fillStyle = '#475569';
    ctx.fillText(fit(ctx, `${mark.place} · Day ${mark.day}`, room), w - u * 4, y + u * (mark.username ? 11.4 : 9.4));
  }
  ctx.textAlign = 'left';
}

/** The mark as a frame of film: black edges top and bottom with sprocket holes, the film's name printed along one and the details along the other. */
function drawFilm(ctx: CanvasRenderingContext2D, w: number, h: number, mark: Mark) {
  const u = Math.min(w, h) / 100;
  const strip = u * 9;
  ctx.fillStyle = '#0b0b0f';
  ctx.fillRect(0, 0, w, strip);
  ctx.fillRect(0, h - strip, w, strip);
  const pitch = u * 5.6;
  const holes = Math.floor(w / pitch);
  const first = (w - holes * pitch) / 2 + (pitch - u * 2.7) / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  for (let i = 0; i < holes; i++) {
    ctx.roundRect(first + i * pitch, u * 1.1, u * 2.7, u * 3.3, u * 0.6);
    ctx.roundRect(first + i * pitch, h - u * 4.4, u * 2.7, u * 3.3, u * 0.6);
  }
  ctx.fill();

  // Edge printing along the top, the way the maker's name runs down a roll.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font(800, u * 2);
  ctx.letterSpacing = `${u * 0.35}px`;
  ctx.fillStyle = '#fbbf24';
  const edge = `NAIJA CITY 400   ▸ ${mark.day}A`;
  const run = ctx.measureText(edge).width + u * 12;
  for (let x = u * 3.5; x < w; x += run) ctx.fillText(edge, x, u * 6.85);
  ctx.letterSpacing = '0px';

  const mid = h - u * 6.85;
  const icon = u * 3.6;
  drawIcon(ctx, u * 3.5, mid - icon / 2 - u * 0.1, icon);
  const tx = u * 3.5 + icon + u * 1.3;
  const ww = wordmark(ctx, tx, mid + u * 0.95, u * 2.9, '#fff', '#fbbf24');
  ctx.textBaseline = 'middle';
  ctx.font = font(700, u * 2.1);
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.fillText(SITE, tx + ww + u * 1.8, mid);
  const room = w - u * 3.5 - (tx + ww + u * 1.8 + ctx.measureText(SITE).width) - u * 4;
  const who = [mark.username && `@${mark.username}`, mark.place, `Day ${mark.day}`].filter(Boolean).join(' · ');
  if (room > u * 14) {
    ctx.textAlign = 'right';
    ctx.font = font(800, u * 2.1);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(fit(ctx, who, room), w - u * 3.5, mid);
    ctx.textAlign = 'left';
  }
  ctx.textBaseline = 'alphabetic';
}

const MARK_DRAW: Record<MarkStyle, (ctx: CanvasRenderingContext2D, w: number, h: number, mark: Mark) => void> = {
  papers: drawPapers,
  banner: drawBanner,
  badge: drawBadge,
  ticket: drawTicket,
  receipt: drawReceipt,
  tag: drawTag,
  stamp: drawStamp,
  plate: drawPlate,
  polaroid: drawPolaroid,
  film: drawFilm,
};

/** Paints the whole photo into `ctx` and returns where each layer landed. `selected` gets a dashed frame (editor preview only). */
export function drawPhoto(ctx: CanvasRenderingContext2D, w: number, h: number, shot: CanvasImageSource, layers: Layer[], mark: Mark, selected: number | null = null): Box[] {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(shot, 0, 0, w, h);
  MARK_DRAW[mark.style](ctx, w, h, mark);
  return layers.map((l) => {
    ctx.save();
    ctx.translate(l.x * w, l.y * h);
    ctx.rotate(l.rot);
    const { hw, hh } = drawLayer(ctx, l, w, h);
    ctx.restore();
    if (l.id === selected) {
      const m = Math.min(w, h);
      ctx.save();
      ctx.translate(l.x * w, l.y * h);
      ctx.rotate(l.rot);
      ctx.setLineDash([m * 0.018, m * 0.012]);
      ctx.lineWidth = m * 0.005;
      ctx.strokeStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = m * 0.006;
      ctx.strokeRect(-hw - m * 0.012, -hh - m * 0.012, (hw + m * 0.012) * 2, (hh + m * 0.012) * 2);
      ctx.restore();
    }
    return { id: l.id, cx: l.x * w, cy: l.y * h, hw, hh, rot: l.rot };
  });
}

/** The topmost layer under a point, or null. A little slack makes small stickers easy to grab with a thumb. */
export function hit(boxes: Box[], x: number, y: number, slack: number): number | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    const dx = x - b.cx;
    const dy = y - b.cy;
    const lx = dx * Math.cos(-b.rot) - dy * Math.sin(-b.rot);
    const ly = dx * Math.sin(-b.rot) + dy * Math.cos(-b.rot);
    if (Math.abs(lx) <= b.hw + slack && Math.abs(ly) <= b.hh + slack) return b.id;
  }
  return null;
}
