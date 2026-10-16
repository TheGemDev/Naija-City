// What is inside the two planes (three/FlightCabin.tsx): the airliner's rows, bins, galley and lavatories, and the
// private jet's leather, walnut and soft light. All of it is built with cabinKit, so each cabin is a few draw calls.

import { Shape } from 'three';
import { Kit, tone, type Built } from './cabinKit';

/** Sky blue through a window: it lights itself, whatever the cabin lights are doing. */
const SKY = '#d4f0ff';
const LAMP = '#fff1d6';

/** A rounded rectangle, centred, `w` by `h`, corners rounded by `r`. */
function roundRect(w: number, h: number, r: number, into = new Shape()) {
  const x = -w / 2, y = -h / 2;
  into.moveTo(x + r, y);
  into.lineTo(x + w - r, y);
  into.quadraticCurveTo(x + w, y, x + w, y + r);
  into.lineTo(x + w, y + h - r);
  into.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  into.lineTo(x + r, y + h);
  into.quadraticCurveTo(x, y + h, x, y + h - r);
  into.lineTo(x, y + r);
  into.quadraticCurveTo(x, y, x + r, y);
  return into;
}
/** A frame: a rounded rectangle with a smaller one cut out of it. */
function bezel(w: number, h: number, r: number, rim: number) {
  const s = roundRect(w + rim * 2, h + rim * 2, r + rim);
  s.holes.push(roundRect(w, h, r));
  return s;
}
/** An oval, `w` by `h`. */
function oval(w: number, h: number, into = new Shape()) {
  into.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
  return into;
}
function ovalRing(w: number, h: number, rim: number) {
  const s = oval(w + rim * 2, h + rim * 2);
  const hole = new Shape();
  hole.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, true, 0);
  s.holes.push(hole);
  return s;
}

/** How far down each window's shade is pulled, in turn along the cabin: most open, a few half down. */
const SHADES = [0, 0.35, 0, 0, 0.6, 0.15, 0, 0.5, 0, 0, 0.25, 0, 0.7, 0];

/* ---------- The airliner ---------- */

export interface AirlinerPlan {
  L: number;
  R: number;
  axis: number;
  rows: number[];
  cols: number[];
  /** Rows in front of this one are business class. */
  business: number;
  seatY: number;
  windows: number[];
  /** Where the windows sit in the far wall: the angle they lean back by, and their distance from the hull's centre line. */
  tilt: number;
  windowR: number;
}

const NAVY_LEATHER = '#1e3a8a';
const ECONOMY = '#15803d';
const COVER = '#f8fafc';
const PLASTIC = '#e2e8f0';
const TRIM = '#94a3b8';
const DARK = '#334155';
const CARPET = '#4b5563';
const RUNNER = '#1e2a5a';

/** One airline seat, facing forward (+z), its cushion top at `seatY`. */
function airlineSeat(k: Kit, x: number, z: number, seatY: number, business: boolean) {
  const w = business ? 0.68 : 0.64;
  const colour = business ? NAVY_LEATHER : ECONOMY;
  const finish = business ? 'satin' : 'matte';
  k.push([x, 0, z]);
  // Legs and the frame under the cushion
  for (const side of [-1, 1]) k.box([0.05, seatY - 0.17, 0.5], [side * 0.22, (seatY - 0.17) / 2, -0.04], TRIM, 'metal');
  k.box([w - 0.04, 0.06, 0.56], [0, seatY - 0.15, 0], DARK, 'satin');
  k.soft([w - 0.02, 0.16, 0.62], [0, seatY - 0.08, 0.03], colour, finish, undefined, 0.06);
  // The back, leaning back a little, with its hard shell behind
  k.push([0, seatY + 0.43, -0.3], [-0.1, 0, 0]);
  k.soft([w - 0.02, 0.88, 0.14], [0, 0, 0], colour, finish, undefined, 0.06);
  k.soft([w, 0.9, 0.05], [0, 0, -0.085], business ? '#1f2937' : '#475569', 'satin', undefined, 0.02);
  // On the back of it: a screen showing the map, and the tray table folded up under it
  k.box([0.26, 0.17, 0.01], [0, 0.2, -0.112], '#2563eb', 'glow');
  k.box([0.3, 0.21, 0.008], [0, 0.2, -0.109], '#0f172a', 'satin');
  k.box([0.44, 0.26, 0.012], [0, -0.12, -0.112], '#64748b', 'satin');
  k.box([0.08, 0.02, 0.01], [0, 0.02, -0.12], '#cbd5e1', 'metal');
  // The headrest cover, over the top of the back
  k.box([w - 0.1, 0.25, 0.012], [0, 0.29, 0.076], COVER);
  k.box([w - 0.1, 0.012, 0.16], [0, 0.446, 0], COVER);
  if (business) for (const side of [-1, 1]) k.soft([0.1, 0.28, 0.12], [side * (w / 2 - 0.07), 0.3, 0.07], colour, 'satin', undefined, 0.04);
  else k.box([w - 0.1, 0.03, 0.013], [0, 0.2, 0.077], ECONOMY);
  k.pop();
  k.pop();
}

/** Armrests for a pair of seats centred on `x`: one each side and one between them. */
function armrests(k: Kit, x: number, z: number, seatY: number, half: number) {
  for (const dx of [-half, 0, half]) {
    k.soft([0.07, 0.06, 0.46], [x + dx, seatY + 0.2, z + 0.02], DARK, 'satin', undefined, 0.025);
    k.box([0.04, 0.22, 0.06], [x + dx, seatY + 0.07, z - 0.18], '#475569', 'satin');
  }
}

export function airlinerFittings(plan: AirlinerPlan, low: boolean): Built {
  const { L, R, axis, rows, cols, business, seatY, windows, tilt, windowR } = plan;
  const k = new Kit(low);
  const half = Math.sqrt(R * R - axis * axis);
  const front = L / 2;
  const back = -L / 2;

  // Floor: grey carpet under the seats, a navy runner down the aisle with green edges, and path lights beside it.
  k.box([half * 2 - 0.04, 0.12, L], [0, -0.06, 0], '#1f2937', 'satin');
  k.box([half * 2 - 0.08, 0.01, L - 0.1], [0, 0.002, 0], CARPET);
  k.box([1.1, 0.012, L - 0.4], [0, 0.006, 0], RUNNER);
  for (const side of [-1, 1]) k.box([0.035, 0.013, L - 0.4], [side * 0.5, 0.007, 0], '#16a34a');
  if (!low) {
    // A small repeating diamond woven into the runner
    for (let z = back + 0.6; z < front - 0.4; z += 0.6) k.box([0.12, 0.013, 0.12], [0, 0.008, z], '#2c3d7a', 'matte', [0, Math.PI / 4, 0]);
  }
  rows.forEach((z) => { for (const side of [-1, 1]) k.box([0.03, 0.014, 0.14], [side * 0.6, 0.008, z + 0.5], '#fde68a', 'glow'); });

  // Seats, two and two either side of the aisle, with their armrests
  rows.forEach((z, r) => {
    cols.forEach((x) => airlineSeat(k, x, z, seatY, r < business));
    for (const side of [-1, 1]) {
      const pair = side * (Math.abs(cols[0]) + Math.abs(cols[1])) / 2;
      armrests(k, pair, z, seatY, Math.abs(Math.abs(cols[0]) - Math.abs(cols[1])) / 2 + (r < business ? 0.37 : 0.345));
    }
  });

  // Windows in the far wall: a frame round each, the sky in it, and some shades part drawn.
  windows.forEach((z, i) => {
    k.push([-windowR * Math.cos(tilt), axis + windowR * Math.sin(tilt), z], [0, 0, -tilt]);
    k.push([0, 0, 0], [0, Math.PI / 2, 0]);
    k.shape(roundRect(0.34, 0.48, 0.13), 'air-pane', [0, 0, 0], SKY, 'glow');
    k.shape(bezel(0.34, 0.48, 0.13, 0.07), 'air-bezel', [0, 0, 0.012], '#f1f5f9', 'satin');
    const shade = SHADES[i % SHADES.length];
    if (shade > 0) {
      const h = 0.48 * shade;
      k.box([0.34, h, 0.006], [0, 0.24 - h / 2, 0.006], '#e5e7eb');
      k.box([0.12, 0.02, 0.014], [0, 0.24 - h, 0.01], TRIM, 'satin');
    }
    k.pop().pop();
  });
  // Exit signs over the wing
  for (const z of [0.15, -1.3]) k.box([0.03, 0.07, 0.24], [-2.36, 1.72, z], '#22c55e', 'glow', [0, 0, -0.35]);

  // Overhead bins along the far wall: a door to each row, a handle on each door, and under them the reading lights,
  // the seat-belt signs and a strip of light washing down the wall.
  const binFront = rows[0] + 0.85, binBack = rows[rows.length - 1] - 1.3;
  const binLen = binFront - binBack, binMid = (binFront + binBack) / 2;
  k.push([-1.98, 2.02, binMid], [0, 0, 0.5]);
  k.box([0.62, 0.36, binLen], [0, 0, 0], PLASTIC, 'satin');
  const doors = Math.round(binLen / 1.45);
  for (let d = 0; d < doors; d++) {
    const z = -binLen / 2 + (d + 0.5) * (binLen / doors);
    k.soft([0.03, 0.33, binLen / doors - 0.04], [0.31, 0, z], '#f8fafc', 'satin', undefined, 0.012);
    k.box([0.02, 0.035, 0.18], [0.33, 0.11, z], TRIM, 'metal');
  }
  k.box([0.5, 0.02, binLen], [-0.02, -0.19, 0], '#cbd5e1', 'satin');
  k.box([0.025, 0.025, binLen], [0.3, -0.195, 0], LAMP, 'glow');
  rows.forEach((rz, r) => {
    const z = rz - binMid;
    for (const dx of [-0.08, 0.08]) k.cyl(0.03, 0.03, 0.012, [dx - 0.05, -0.205, z], r % 3 === 1 && dx > 0 ? '#fffbe6' : '#9ca3af', r % 3 === 1 && dx > 0 ? 'glow' : 'satin', undefined, 10);
    k.box([0.09, 0.012, 0.05], [0.12, -0.205, z - 0.2], '#f59e0b', 'glow');
  });
  k.pop();
  // The bins' end caps
  for (const z of [binFront, binBack]) k.box([0.6, 0.34, 0.03], [-1.98, 2.02, z], '#cbd5e1', 'satin', [0, 0, 0.5]);
  // A trim along the low near-side wall where the hull is cut away
  k.soft([0.1, 0.06, L - 0.2], [half + 0.1, 0.5, 0], PLASTIC, 'satin', undefined, 0.025);

  // Between business and economy: a low divider either side, and the curtain drawn back to the aisle.
  const divider = (rows[business - 1] + rows[business]) / 2 - 0.05;
  for (const side of [-1, 1]) {
    k.soft([1.7, 1.0, 0.06], [side * 1.55, 0.5, divider], '#e2e8f0', 'satin', undefined, 0.02);
    k.box([1.7, 0.05, 0.08], [side * 1.55, 1.02, divider], NAVY_LEATHER, 'satin');
    for (let p = 0; p < 4; p++) k.cyl(0.032, 0.04, 1.85, [side * (0.55 + p * 0.045), 1.0, divider + (p % 2 ? 0.02 : -0.02)], '#1e3a8a', 'matte', undefined, 8);
    k.box([0.05, 0.05, 0.08], [side * 0.6, 1.05, divider], '#d4af37', 'metal');
  }
  k.box([1.5, 0.03, 0.03], [0, 1.94, divider], TRIM, 'metal');

  // The forward galley against the bulkhead on the far side: steel cabinets, two trolleys and the coffee makers.
  const gz = front - 0.4;
  k.push([-1.55, 0, gz]);
  k.box([1.45, 1.9, 0.72], [0, 0.95, 0], '#cbd5e1', 'satin');
  k.box([1.5, 0.05, 0.8], [0, 1.08, -0.02], '#f1f5f9', 'satin');
  for (const x of [-0.4, 0.05]) {
    k.box([0.4, 0.95, 0.02], [x, 0.5, -0.37], '#9ca3af', 'satin');
    k.box([0.3, 0.03, 0.03], [x, 0.9, -0.39], '#e5e7eb', 'metal');
    k.box([0.05, 0.05, 0.01], [x + 0.14, 0.82, -0.385], '#ef4444', 'glow');
  }
  for (const x of [-0.45, -0.05, 0.35]) {
    k.box([0.34, 0.3, 0.02], [x, 1.5, -0.37], '#e5e7eb', 'satin');
    k.box([0.24, 0.16, 0.01], [x, 1.5, -0.385], '#111827', 'satin');
  }
  for (const x of [-0.35, 0.15]) {
    k.box([0.22, 0.3, 0.26], [x, 1.26, 0.05], '#1f2937', 'satin');
    k.box([0.04, 0.04, 0.01], [x + 0.06, 1.33, -0.085], '#22c55e', 'glow');
    k.cyl(0.05, 0.045, 0.1, [x, 1.16, -0.15], '#e5e7eb', 'satin', undefined, 10);
  }
  k.pop();
  // A trolley parked by the door on the near side, and the crew's folded jump seat on the bulkhead.
  k.soft([0.4, 1.0, 0.75], [1.65, 0.53, front - 0.75], '#9ca3af', 'satin', undefined, 0.03);
  k.box([0.42, 0.04, 0.77], [1.65, 1.05, front - 0.75], '#e5e7eb', 'satin');
  k.box([0.3, 0.03, 0.03], [1.65, 0.95, front - 1.14], '#e5e7eb', 'metal');
  for (const dz of [-0.3, 0.3]) for (const dx of [-0.15, 0.15]) k.cyl(0.04, 0.04, 0.04, [1.65 + dx, 0.03, front - 0.75 + dz], '#111827', 'satin', [0, 0, Math.PI / 2], 8);
  k.cyl(0.04, 0.035, 0.12, [1.58, 1.13, front - 0.6], '#fbbf24', 'satin', undefined, 10);
  k.cyl(0.04, 0.035, 0.12, [1.72, 1.13, front - 0.85], '#ffffff', 'satin', undefined, 10);
  k.soft([0.45, 0.55, 0.08], [0.95, 1.05, front - 0.06], '#475569', 'satin', undefined, 0.02);

  // At the back: a lavatory either side, their doors facing up the cabin, and a little galley between them.
  for (const side of [-1, 1]) {
    // The near one is kept lower, so it never stands in front of the rest.
    const h = side < 0 ? 2.0 : 1.55;
    k.push([side * 1.52, 0, back + 0.48]);
    k.box([1.3, h, 0.92], [0, h / 2, 0], '#e2e8f0', 'satin');
    k.soft([0.62, 1.45, 0.04], [-side * 0.2, 0.76, 0.47], '#f8fafc', 'satin', undefined, 0.02);
    k.box([0.01, 1.3, 0.012], [-side * 0.2, 0.76, 0.493], '#cbd5e1');
    k.box([0.04, 0.12, 0.03], [-side * 0.44, 0.85, 0.5], TRIM, 'metal');
    k.box([0.16, 0.06, 0.012], [-side * 0.2, h - 0.14, 0.47], '#22c55e', 'glow');
    k.pop();
  }
  k.box([0.9, 1.05, 0.5], [0, 0.525, back + 0.25], '#cbd5e1', 'satin');
  k.box([0.94, 0.04, 0.54], [0, 1.07, back + 0.25], '#f1f5f9', 'satin');
  for (const y of [0.3, 0.65]) k.box([0.8, 0.02, 0.012], [0, y, back + 0.505], TRIM);
  return k.build();
}

/* ---------- The private jet ---------- */

export interface JetPlan {
  L: number;
  R: number;
  axis: number;
  windows: number[];
  tilt: number;
  windowR: number;
  colours: { navy: string; gold: string; walnut: string; leather: string; leatherDark: string };
}

/**
 * A leather club seat on a polished swivel base: a deep cushion, a reclined back with a pillow, wide padded arms
 * capped in walnut. `aft` turns it to face the tail.
 */
function clubSeat(k: Kit, x: number, z: number, aft: boolean, c: JetPlan['colours']) {
  k.push([x, 0, z], [0, aft ? Math.PI : 0, 0]);
  k.cyl(0.3, 0.34, 0.04, [0, 0.02, 0], '#d6d3d1', 'metal', undefined, 20);
  k.cyl(0.08, 0.08, 0.14, [0, 0.11, 0], '#a8a29e', 'metal', undefined, 12);
  k.soft([0.82, 0.12, 0.72], [0, 0.22, 0.02], '#3f2a1d', 'satin', undefined, 0.03);
  k.soft([0.66, 0.18, 0.72], [0, 0.36, 0.04], c.leather, 'satin', undefined, 0.08);
  k.box([0.6, 0.006, 0.006], [0, 0.452, 0.2], c.leatherDark, 'satin');
  k.push([0, 0.86, -0.33], [-0.14, 0, 0]);
  k.soft([0.7, 0.95, 0.2], [0, 0, 0], c.leather, 'satin', undefined, 0.09);
  for (const y of [-0.15, 0.15]) k.box([0.6, 0.006, 0.006], [0, y, 0.101], c.leatherDark, 'satin');
  k.soft([0.46, 0.2, 0.12], [0, 0.4, 0.1], c.leatherDark, 'satin', undefined, 0.06);
  k.pop();
  for (const side of [-1, 1]) {
    k.soft([0.16, 0.34, 0.74], [side * 0.42, 0.42, 0.0], c.leather, 'satin', undefined, 0.07);
    k.soft([0.17, 0.035, 0.6], [side * 0.42, 0.6, 0.03], c.walnut, 'satin', undefined, 0.015);
  }
  k.pop();
}

export function jetFittings(plan: JetPlan, low: boolean): Built {
  const { L, R, axis, windows, tilt, windowR, colours: c } = plan;
  const k = new Kit(low);
  const half = Math.sqrt(R * R - axis * axis);
  const CREAM = '#f3e9d6';
  const STONE = '#f5efe3';
  const COVE = '#ffd9a0';

  // Floor: walnut boards, cream carpet laid over them with a gold-edged border, and a runner of deeper wool.
  k.box([half * 2 - 0.04, 0.08, L], [0, -0.04, 0], '#6b4a2f', 'satin');
  k.box([half * 2 - 0.3, 0.008, L - 0.3], [0, 0.002, 0], '#efe2c6');
  k.box([0.9, 0.01, L - 0.9], [0, 0.005, 0], '#dcc79e');
  for (const side of [-1, 1]) k.box([0.025, 0.011, L - 0.9], [side * 0.45, 0.006, 0], c.gold, 'metal');
  // Soft light along the foot of both walls, the full length of the cabin
  for (const side of [-1, 1]) k.box([0.03, 0.02, L - 0.4], [side * (half - 0.14), 0.03, 0], COVE, 'glow');

  // Walnut ledges under the windows on both sides, gold along their edge and lit from beneath.
  for (const side of [-1, 1]) {
    const [z0, z1] = [1.3, 4.3];
    const len = z1 - z0, z = (z0 + z1) / 2;
    const x = side * (half - 0.1);
    k.soft([0.2, 0.05, len], [x, 0.6, z], c.walnut, 'satin', undefined, 0.02);
    k.box([0.02, 0.02, len], [x - side * 0.1, 0.6, z], c.gold, 'metal');
    k.box([0.17, 0.55, len], [x + side * 0.02, 0.29, z], tone(CREAM, 0.94), 'satin');
    k.box([0.02, 0.012, len - 0.05], [x - side * 0.08, 0.565, z], COVE, 'glow');
  }
  // Light along the top of the far wall, and a gold line under it
  k.box([0.04, 0.025, L - 0.6], [-1.32, 1.98, 0], COVE, 'glow', [0, 0, -0.75]);

  // Oval windows in leather-coloured frames, a pleated shade part way down in some.
  windows.forEach((z, i) => {
    k.push([-windowR * Math.cos(tilt), axis + windowR * Math.sin(tilt), z], [0, 0, -tilt]);
    k.push([0, 0, 0], [0, Math.PI / 2, 0]);
    k.shape(oval(0.4, 0.52), 'jet-pane', [0, 0, 0], SKY, 'glow');
    k.shape(ovalRing(0.4, 0.52, 0.07), 'jet-ring', [0, 0, 0.012], '#e2d3b1', 'satin');
    k.shape(ovalRing(0.54, 0.66, 0.015), 'jet-gold', [0, 0, 0.016], c.gold, 'metal');
    const shade = SHADES[(i * 3) % SHADES.length];
    if (shade > 0) {
      const h = 0.5 * shade;
      for (let p = 0; p * 0.04 < h; p++) k.box([0.36, 0.035, 0.008], [0, 0.24 - p * 0.04 - 0.018, 0.006], p % 2 ? '#efe6d4' : '#f7f0e2');
    }
    k.pop().pop();
  });

  // Club four: two seats facing two, a walnut table with a gold edge between each pair.
  for (const x of [-1.0, 1.0]) {
    clubSeat(k, x, 3.6, true, c);
    clubSeat(k, x, 1.9, false, c);
    k.soft([0.86, 0.05, 0.64], [x * 1.12, 0.63, 2.75], c.walnut, 'satin', undefined, 0.02);
    k.soft([0.9, 0.02, 0.68], [x * 1.12, 0.6, 2.75], c.gold, 'metal', undefined, 0.01);
    k.cyl(0.05, 0.05, 0.56, [x * 1.12 + x * 0.25, 0.3, 2.75], '#d6d3d1', 'metal', undefined, 12);
    k.cyl(0.18, 0.2, 0.025, [x * 1.12 + x * 0.25, 0.012, 2.75], '#d6d3d1', 'metal', undefined, 16);
  }
  // Your table: champagne in an ice bucket, a flute, and a plate of jollof
  k.cyl(0.1, 0.08, 0.2, [0.88, 0.75, 2.92], '#e7e5e4', 'metal', undefined, 16);
  k.cyl(0.025, 0.045, 0.3, [0.88, 0.9, 2.92], '#14532d', 'satin', [0, 0, 0.2], 10);
  k.cyl(0.012, 0.012, 0.05, [0.85, 1.07, 2.92], c.gold, 'metal', [0, 0, 0.2], 6);
  k.cyl(0.04, 0.02, 0.14, [1.3, 0.79, 2.9], '#fde68a', 'satin', undefined, 10);
  k.cyl(0.008, 0.008, 0.08, [1.3, 0.69, 2.9], '#f5f5f4', 'satin', undefined, 6);
  k.cyl(0.16, 0.14, 0.02, [1.1, 0.67, 2.6], '#ffffff', 'satin', undefined, 18);
  k.ball(0.1, [1.1, 0.69, 2.6], '#ea580c', 'satin', [1, 0.45, 1]);
  // A book and reading glasses on the other table
  k.box([0.22, 0.03, 0.3], [-1.05, 0.67, 2.7], '#7c2d12', 'satin', [0, 0.3, 0]);

  // The galley by the door: walnut cupboards with gold pulls, a stone top, the coffee machine and an orchid.
  k.push([-1.25, 0, 4.85]);
  k.soft([0.62, 0.9, 0.95], [0, 0.45, 0], c.walnut, 'satin', undefined, 0.02);
  for (const dz of [-0.23, 0.23]) {
    k.box([0.01, 0.8, 0.43], [0.315, 0.45, dz], tone(c.walnut, 1.15), 'satin');
    k.box([0.02, 0.14, 0.02], [0.33, 0.6, dz + (dz < 0 ? 0.17 : -0.17)], c.gold, 'metal');
  }
  k.soft([0.66, 0.04, 0.99], [0, 0.92, 0], STONE, 'satin', undefined, 0.015);
  k.box([0.6, 0.02, 0.97], [0.01, 0.89, 0], COVE, 'glow');
  k.box([0.26, 0.32, 0.24], [-0.08, 1.1, -0.25], '#1c1917', 'satin');
  k.box([0.06, 0.06, 0.01], [0.05, 1.18, -0.25], '#f59e0b', 'glow');
  k.cyl(0.035, 0.03, 0.07, [0.1, 0.975, -0.12], '#ffffff', 'satin', undefined, 10);
  k.cyl(0.07, 0.05, 0.12, [0.0, 1.0, 0.25], '#fafaf9', 'satin', undefined, 14);
  for (const [dx, dz, h] of [[0, 0, 0.32], [0.03, 0.04, 0.26], [-0.03, -0.02, 0.36]]) {
    k.cyl(0.005, 0.005, h, [dx, 1.06 + h / 2, 0.25 + dz], '#4d7c0f', 'matte', undefined, 5);
    k.ball(0.035, [dx + 0.02, 1.06 + h, 0.25 + dz], '#fdf4ff', 'satin', [1, 0.6, 1]);
  }
  for (const a of [0, 2.1, 4.2]) k.box([0.03, 0.01, 0.16], [Math.sin(a) * 0.06, 1.07, 0.25 + Math.cos(a) * 0.06], '#166534', 'satin', [0, a, 0.3]);
  k.pop();

  // The lounge: a divan with buttoned cushions along the far wall, a round coffee table on a gold column, a rug.
  k.cyl(1.0, 1.0, 0.012, [-0.35, 0.008, -0.6], '#b8a07a', 'matte', undefined, 32);
  k.cyl(0.92, 0.92, 0.014, [-0.35, 0.009, -0.6], '#e9dcc0', 'matte', undefined, 32);
  k.soft([0.92, 0.22, 2.6], [-1.2, 0.11, -0.6], '#3f2a1d', 'satin', undefined, 0.03);
  for (let i = 0; i < 3; i++) {
    const z = 0.27 - i * 0.87;
    k.soft([0.86, 0.18, 0.85], [-1.18, 0.31, z], c.leather, 'satin', undefined, 0.08);
    k.soft([0.2, 0.55, 0.85], [-1.55, 0.68, z], c.leather, 'satin', [0, 0, 0.12], 0.09);
    if (!low) for (const by of [0.55, 0.8]) for (const bz of [-0.2, 0.2]) k.ball(0.018, [-1.47, by, z + bz], c.leatherDark, 'satin');
  }
  for (const z of [0.72, -1.92]) k.soft([0.92, 0.32, 0.16], [-1.2, 0.5, z], c.leatherDark, 'satin', undefined, 0.07);
  for (const [z, colour] of [[0.25, c.navy], [-0.6, c.gold], [-1.45, c.navy]] as const) {
    k.soft([0.16, 0.38, 0.4], [-1.38, 0.62, z], colour, 'matte', [0, 0, 0.25], 0.07);
  }
  k.soft([0.5, 0.06, 0.4], [-1.15, 0.43, -0.95], '#1e3a5f', 'matte', [0, 0.25, 0], 0.03);
  k.cyl(0.08, 0.2, 0.38, [-0.25, 0.2, -0.6], c.gold, 'metal', undefined, 18);
  k.cyl(0.38, 0.38, 0.045, [-0.25, 0.42, -0.6], c.walnut, 'satin', undefined, 28);
  k.cyl(0.39, 0.39, 0.015, [-0.25, 0.4, -0.6], c.gold, 'metal', undefined, 28);
  k.box([0.2, 0.04, 0.26], [-0.32, 0.465, -0.52], '#0f172a', 'satin', [0, 0.4, 0]);
  k.cyl(0.08, 0.06, 0.06, [-0.12, 0.475, -0.72], '#e7e5e4', 'satin', undefined, 12);

  // The bar opposite: walnut fronts in panels, a stone top, lit beneath, and the bottles and glasses on it.
  k.push([1.25, 0, -0.6]);
  k.soft([0.7, 0.95, 1.9], [0, 0.475, 0], c.walnut, 'satin', undefined, 0.02);
  for (const dz of [-0.62, 0, 0.62]) {
    k.box([0.01, 0.62, 0.56], [-0.351, 0.5, dz], tone(c.walnut, 1.18), 'satin');
    k.box([0.012, 0.012, 0.3], [-0.358, 0.75, dz], c.gold, 'metal');
  }
  k.box([0.012, 0.025, 1.86], [-0.352, 0.1, 0], COVE, 'glow');
  k.soft([0.78, 0.05, 1.98], [0, 0.97, 0], STONE, 'satin', undefined, 0.015);
  k.box([0.02, 0.02, 1.98], [-0.39, 0.995, 0], c.gold, 'metal');
  ['#14532d', '#7c2d12', '#1e3a8a', '#a16207'].forEach((colour, i) => {
    const z = 0.55 - i * 0.3;
    k.cyl(0.055, 0.055, 0.24, [0.05, 1.12, z], colour, 'satin', undefined, 12);
    k.cyl(0.02, 0.045, 0.12, [0.05, 1.3, z], colour, 'satin', undefined, 10);
    k.cyl(0.022, 0.022, 0.03, [0.05, 1.375, z], c.gold, 'metal', undefined, 8);
  });
  for (const z of [-0.4, -0.55, -0.7]) {
    k.cyl(0.035, 0.03, 0.1, [-0.2, 1.045, z], '#e0f2fe', 'satin', undefined, 10);
  }
  k.cyl(0.1, 0.08, 0.16, [-0.05, 1.075, -0.4], '#d6d3d1', 'metal', undefined, 14);
  k.pop();

  // The wall before the bedroom: veneer either side of the doorway, the television in a walnut frame.
  k.soft([1.2, 1.9, 0.1], [-1.1, 0.95, -2.4], CREAM, 'satin', undefined, 0.02);
  k.box([1.2, 0.5, 0.11], [-1.1, 0.25, -2.4], c.walnut, 'satin');
  k.soft([1.1, 0.5, 0.1], [1.15, 0.25, -2.4], c.walnut, 'satin', undefined, 0.02);
  k.box([1.12, 0.02, 0.12], [1.15, 0.5, -2.4], c.gold, 'metal');
  k.box([0.05, 1.9, 0.12], [-0.5, 0.95, -2.4], c.gold, 'metal');
  k.soft([1.04, 0.64, 0.05], [-1.05, 1.22, -2.33], c.walnut, 'satin', undefined, 0.015);
  k.box([0.94, 0.54, 0.02], [-1.05, 1.22, -2.305], '#0f172a', 'satin');
  k.box([0.9, 0.5, 0.01], [-1.05, 1.22, -2.29], '#38bdf8', 'glow');
  k.box([0.02, 1.6, 0.02], [-0.52, 0.95, -2.34], COVE, 'glow');

  // The bedroom: a bed made up in white and navy against a buttoned headboard, a bench at its foot, a rug,
  // the nightstand and its lamp, and a low chest of drawers on the near side.
  k.box([2.2, 0.01, 1.6], [-0.4, 0.008, -4.0], '#c9b28a');
  k.soft([1.9, 0.32, 2.3], [-0.7, 0.16, -4.2], c.walnut, 'satin', undefined, 0.03);
  k.soft([1.82, 0.22, 2.2], [-0.7, 0.42, -4.2], '#ffffff', 'matte', undefined, 0.06);
  k.soft([1.86, 0.08, 1.4], [-0.7, 0.54, -3.85], c.navy, 'matte', undefined, 0.035);
  k.box([1.87, 0.012, 0.1], [-0.7, 0.585, -3.5], c.gold, 'metal');
  k.soft([1.86, 0.06, 0.35], [-0.7, 0.56, -4.7], '#f5f5f4', 'matte', undefined, 0.03);
  for (const x of [-1.12, -0.28]) k.soft([0.72, 0.16, 0.4], [x, 0.62, -5.0], '#ffffff', 'matte', [-0.3, 0, 0], 0.07);
  k.soft([0.5, 0.16, 0.18], [-0.7, 0.62, -4.75], c.gold, 'matte', [-0.3, 0, 0], 0.06);
  k.soft([2.0, 1.1, 0.12], [-0.7, 0.75, -5.38], c.leatherDark, 'satin', undefined, 0.05);
  if (!low) for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) k.ball(0.02, [-1.5 + i * 0.32, 0.85 + j * 0.3, -5.31], tone(c.leatherDark, 0.8), 'satin');
  k.soft([1.2, 0.36, 0.34], [-0.7, 0.2, -2.8], c.leather, 'satin', undefined, 0.06);
  for (const dx of [-0.5, 0.5]) k.cyl(0.025, 0.025, 0.18, [-0.7 + dx, 0.09, -2.8], c.gold, 'metal', undefined, 8);
  k.soft([0.5, 0.5, 0.5], [1.2, 0.25, -5.05], c.walnut, 'satin', undefined, 0.02);
  k.box([0.012, 0.012, 0.25], [0.945, 0.35, -5.05], c.gold, 'metal');
  k.cyl(0.03, 0.08, 0.24, [1.2, 0.62, -5.05], c.gold, 'metal', undefined, 12);
  k.cyl(0.1, 0.16, 0.22, [1.2, 0.84, -5.05], '#fff7e0', 'glow', undefined, 16);
  k.soft([0.5, 0.7, 1.1], [1.35, 0.35, -3.7], c.walnut, 'satin', undefined, 0.02);
  for (const y of [0.18, 0.5]) {
    k.box([0.01, 0.26, 1.0], [1.096, y, -3.7], tone(c.walnut, 1.15), 'satin');
    k.box([0.02, 0.02, 0.24], [1.09, y, -3.7], c.gold, 'metal');
  }
  k.soft([0.54, 0.03, 1.14], [1.35, 0.715, -3.7], STONE, 'satin', undefined, 0.01);
  return k.build();
}

