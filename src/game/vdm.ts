// VDM's voice: every post is assembled from interchangeable parts (src/game/vdmLines.ts) instead of picked whole
// from a short list, so he never sounds the same twice. Pure and deterministic: the same seed and the same memory
// give the same post, so the server (worker/vdm.ts) can retry safely, and a script can test it.
//
// A post is a shape (which slots, in which order) filled slot by slot: an opener, the facts, a jab or a
// commendation, a rhetorical question, a call to his Ratels, a sign-off and an emoji. How hot he gets follows the
// matter (the money, the trips, the potholes). His memory is the phrases of his last posts: a phrase used recently
// is not used again while a fresh one is free, and a post too close to a recent one is written again.

import { GEN, VDM_TOPICS, type VdmFacts, type VdmTopic, type VdmTopicDef } from './vdmLines';

export { VDM_TOPICS, type VdmFacts, type VdmTopic };
export type VdmTone = 'drag' | 'praise' | 'mixed';

/** How much he remembers: phrases of his last posts are not reused, and he keeps score on people for a week. */
export const VDM_MEMORY = { recent: 20, recordMs: 7 * 24 * 3600_000, keepMs: 14 * 24 * 3600_000, similar: 0.34, attempts: 8 };

/** One of his recent posts, newest first: the phrase ids it was built from, and its text. */
export interface VdmPast { phrases: string[]; text: string }

/** His score on someone this week, before this post. `who` is how they are named. */
export interface VdmRecord { who: string; praised: number; dragged: number; last?: VdmTone | null }

export interface VdmRequest {
  topic: VdmTopic;
  facts: VdmFacts;
  /** A second matter of the opposite tone: praise one thing, drag another. */
  but?: { topic: VdmTopic; facts: VdmFacts };
  seed: string;
  history?: VdmPast[];
  /** His score on the person this post is mostly about (the one dragged, on a mixed post). */
  record?: VdmRecord | null;
}

export interface VdmPost { text: string; phrases: string[]; tone: VdmTone; severity: number }

export const MAX_POST = 280;
export const isPraise = (topic: VdmTopic) => VDM_TOPICS[topic].tone === 'praise';

/* ---------- Seeded randomness ---------- */

function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
function rngOf(seed: string) {
  let a = fnv(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Lines ---------- */

interface Line { id: string; text: string; heat: number; dom: 'g' | 'c' | null; when: [string, boolean][]; needs: string[] }

const parsed = new Map<string, Line[]>();
function lines(key: string, list: readonly string[] | undefined): Line[] {
  if (!list?.length) return [];
  const hit = parsed.get(key);
  if (hit) return hit;
  const out = list.map((raw, i) => {
    const m = raw.match(/^\[([^\]]*)\]/);
    const tags = m ? m[1].split(/\s+/).filter(Boolean) : [];
    const text = m ? raw.slice(m[0].length) : raw;
    const heat = Number(tags.find((t) => /^\d$/.test(t)) ?? 2);
    const dom = tags.includes('g') ? 'g' : tags.includes('c') ? 'c' : null;
    const when = tags.filter((t) => /^[?!]\w+$/.test(t)).map((t) => [t.slice(1), t[0] === '?'] as [string, boolean]);
    const needs = [...text.matchAll(/\{(\w+)/g)].map((x) => x[1].toLowerCase());
    return { id: `${key}.${i}`, text, heat, dom, when, needs };
  });
  parsed.set(key, out);
  return out;
}

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ordinal = (n: number) => ORD[n - 1] ?? `${n}th`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Bag = Record<string, string | number | boolean | undefined | null>;
const has = (v: unknown) => v !== undefined && v !== null && v !== '' && v !== false;

function fits(l: Line, f: Bag) {
  return l.needs.every((k) => has(f[k])) && l.when.every(([k, on]) => has(f[k]) === on);
}

function fill(text: string, f: Bag) {
  return text.replace(/\{(\w+)(?:\|([^}|]+)(?:\|([^}]+))?)?\}/g, (_, k: string, one?: string, many?: string) => {
    const v = f[k.toLowerCase()];
    const s = one ? `${v} ${Number(v) === 1 ? one : many ?? `${one}s`}` : String(v);
    return k[0] === k[0].toUpperCase() && k[0] !== k[0].toLowerCase() ? cap(s) : s;
  });
}

/** The naira in a matter: `money`, else whatever number is in `amount` ("₦250,000"). */
function moneyOf(f: VdmFacts) {
  if (typeof f.money === 'number') return f.money;
  const digits = f.amount?.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function severity(def: VdmTopicDef, f: VdmFacts) {
  const m = moneyOf(f);
  const s = def.sev ? def.sev(f, m) : m ? (m >= 5_000_000 ? 3 : m >= 500_000 ? 2 : m >= 50_000 ? 1 : 0) : 1;
  return Math.max(0, Math.min(3, Math.round(s)));
}

/** Signature phrases: at most one per post, so they keep their punch. */
const SIGNATURE = /ratels|\baudio\b|\bmumu\b|shameless|dey watch una/i;

/* ---------- Shapes ---------- */

// Tokens: open core rec jab jab2 q rat sign | praise: commend tail | mixed: pcore dcore pivot (to the drag) ppivot (to the praise).
interface Shape { id: string; min: number; max: number; slots: string[] }
const S = (id: string, min: number, max: number, slots: string) => ({ id, min, max, slots: slots.split(' ') });

const SHAPES: Record<VdmTone, Shape[]> = {
  drag: [
    S('d1', 0, 1, 'core jab'),
    S('d2', 0, 2, 'open core jab'),
    S('d3', 0, 2, 'core q'),
    S('d4', 0, 1, 'core jab sign'),
    S('d5', 1, 3, 'open core jab q'),
    S('d6', 1, 3, 'core q jab rat'),
    S('d7', 1, 2, 'q core jab sign'),
    S('d8', 1, 2, 'open core rat'),
    S('d9', 2, 3, 'open core jab q jab2 rat sign'),
    S('d10', 2, 3, 'core jab q rat sign'),
    S('d11', 2, 3, 'open core q jab jab2 sign'),
    S('d12', 1, 3, 'rat core jab q'),
    S('d13', 3, 3, 'open jab core jab2 q sign'),
  ],
  praise: [
    S('p1', 0, 3, 'open core commend'),
    S('p2', 0, 2, 'core commend tail'),
    S('p3', 1, 3, 'open core commend q tail'),
    S('p4', 1, 3, 'core q commend rat'),
    S('p5', 0, 3, 'open core commend tail sign'),
    S('p6', 0, 3, 'core commend sign'),
    S('p7', 0, 2, 'open core tail'),
    S('p8', 2, 3, 'open core commend commend2 rat sign'),
  ],
  mixed: [
    S('m1', 0, 3, 'open pcore pivot dcore jab'),
    S('m2', 0, 3, 'pcore commend pivot dcore q'),
    S('m3', 0, 3, 'open pcore pivot dcore jab sign'),
    S('m4', 0, 3, 'dcore jab ppivot pcore commend tail'),
    S('m5', 0, 3, 'pcore pivot dcore jab rat'),
    S('m6', 0, 3, 'open dcore ppivot pcore q'),
  ],
};

/** Parts dropped first when a post runs over 280 characters. The facts are never dropped. */
const DROP = ['sign', 'rat', 'jab2', 'commend2', 'q', 'open', 'tail', 'rec', 'commend', 'jab', 'ppivot', 'pivot'];

/* ---------- Similarity ---------- */

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}@₦%\s]/gu, ' ').split(/\s+/).filter(Boolean);
function grams(s: string) {
  const w = words(s);
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
}
/** How alike two posts are: the share of word trigrams they have in common (Jaccard), 0..1. */
export function overlap(a: string, b: string) {
  const x = grams(a);
  const y = grams(b);
  if (!x.size || !y.size) return a === b ? 1 : 0;
  let both = 0;
  for (const g of x) if (y.has(g)) both++;
  return both / (x.size + y.size - both);
}

/* ---------- Building one post ---------- */

function build(req: VdmRequest, attempt: number, ages: Map<string, number>): VdmPost {
  const rng = rngOf(`${req.seed}#${attempt}`);
  const main = VDM_TOPICS[req.topic] as VdmTopicDef;
  const second = req.but ? (VDM_TOPICS[req.but.topic] as VdmTopicDef) : null;
  const tone: VdmTone = second && second.tone !== main.tone ? 'mixed' : main.tone;
  // The praised and the dragged halves of a mixed post; a plain post is all one.
  const praise = main.tone === 'praise' ? { def: main, f: req.facts, key: req.topic } : second?.tone === 'praise' ? { def: second, f: req.but!.facts, key: req.but!.topic } : null;
  const drag = main.tone === 'drag' ? { def: main, f: req.facts, key: req.topic } : second?.tone === 'drag' ? { def: second, f: req.but!.facts, key: req.but!.topic } : null;
  const lead = tone === 'praise' ? praise! : drag!;
  const sev = severity(lead.def, lead.f);
  const crime = !!main.crime;

  const taken = new Set<string>();
  const used: string[] = [];
  let signed = false;

  /** A line from these pools that fits: one not used lately if there is one, else the one used longest ago. */
  const choose = (pools: Line[][], f: Bag, ok: (l: Line) => boolean = () => true): Line | null => {
    const all = pools.flat().filter((l) => !taken.has(l.id) && fits(l, f) && ok(l) && (crime ? l.dom !== 'g' : l.dom !== 'c') && !(signed && SIGNATURE.test(l.text)));
    if (!all.length) return null;
    const fresh = all.filter((l) => !ages.has(l.id));
    const from = fresh.length ? fresh : (() => {
      const oldest = Math.max(...all.map((l) => ages.get(l.id)!));
      return all.filter((l) => ages.get(l.id) === oldest);
    })();
    return from[Math.floor(rng() * from.length)];
  };
  /** Topic lines first about half the time, so a topic keeps its own flavour without hogging the slot. */
  const prefer = (own: Line[], generic: Line[]) => (own.length && rng() < 0.55 ? [own] : [own, generic]);
  const heatOk = (l: Line) => (sev <= 0 ? l.heat <= 1 : sev === 1 ? l.heat <= 2 : sev === 2 ? l.heat >= 2 : l.heat >= 2);

  const say = (l: Line | null, f: Bag) => {
    if (!l) return null;
    taken.add(l.id);
    used.push(l.id);
    const text = fill(l.text, f);
    if (SIGNATURE.test(text)) signed = true;
    return text;
  };

  const bagOf = (f: VdmFacts): Bag => ({ ...f });
  const P = praise ? bagOf(praise.f) : {};
  const D = drag ? bagOf(drag.f) : {};
  const side = (pr: boolean) => (pr ? praise! : drag!);

  const core = (pr: boolean) => {
    const s = side(pr);
    const f = pr ? P : D;
    const got = say(choose([lines(`${s.key}.core`, s.def.core)], f), f);
    return got ?? fill(s.def.core[0], f);
  };

  const slot = (tok: string): string | null => {
    switch (tok) {
      case 'core': return core(tone === 'praise');
      case 'pcore': return core(true);
      case 'dcore': return core(false);
      case 'open':
        return tone === 'praise' || (tone === 'mixed' && rng() < 0.6)
          ? say(choose([lines('open.p', GEN.openPraise)], P), P)
          : say(choose([lines('open.d', GEN.openDrag)], D, heatOk), D);
      case 'jab':
      case 'jab2': {
        if (tone === 'praise') return slot('commend');
        return say(choose(prefer(lines(`${drag!.key}.jab`, drag!.def.jab), lines('jab', GEN.jab)), D, heatOk), D);
      }
      case 'commend':
      case 'commend2':
        return say(choose(prefer(lines(`${praise!.key}.jab`, praise!.def.jab), lines('commend', GEN.commend)), P), P);
      case 'q':
        return tone === 'praise'
          ? say(choose(prefer(lines(`${praise!.key}.q`, praise!.def.q), lines('q.p', GEN.qPraise)), P), P)
          : say(choose(prefer(lines(`${drag!.key}.q`, drag!.def.q), lines('q.d', GEN.qDrag)), D), D);
      case 'tail': {
        // Not every praise is backhanded: the bigger the good deed, the less he hedges.
        if (rng() < (sev >= 3 ? 0.35 : sev === 2 ? 0.55 : 0.75) === false) return null;
        return say(choose(prefer(lines(`${praise!.key}.tail`, praise!.def.tail), lines('tail', GEN.tail)), P), P);
      }
      case 'rat':
        return tone === 'praise' ? say(choose([lines('rat.p', GEN.ratPraise)], P), P) : say(choose([lines('rat.d', GEN.ratDrag)], D), D);
      case 'sign':
        return tone === 'praise' ? say(choose([lines('sign.p', GEN.signPraise)], P), P) : say(choose([lines('sign.d', GEN.signDrag)], D), D);
      case 'pivot': return say(choose([lines('pivot.d', GEN.pivotDrag)], {}), {});
      case 'ppivot': return say(choose([lines('pivot.p', GEN.pivotPraise)], {}), {});
      default: return null;
    }
  };

  // His score on this person, said right after the facts when there is something to say.
  const rec = (): string | null => {
    const r = req.record;
    if (!r?.who || rng() < 0.2) return null;
    const towards = tone === 'praise' ? 'praise' : 'drag';
    const f: Bag = { rwho: r.who, times: towards === 'drag' ? r.dragged : r.praised, ord: ordinal((towards === 'drag' ? r.dragged : r.praised) + 1) };
    const pool = towards === 'drag'
      ? r.last === 'praise' ? lines('rec.dp', GEN.recDragAfterPraise) : r.dragged >= 2 ? lines('rec.dd', GEN.recDragAgain) : null
      : r.dragged >= 1 ? lines('rec.pd', GEN.recPraiseAfterDrag) : r.praised >= 1 ? lines('rec.pp', GEN.recPraiseAgain) : null;
    return pool ? say(choose([pool], f), f) : null;
  };

  // The shape: one that suits how hot he is, not used lately.
  const shapes = SHAPES[tone].filter((s) => sev >= s.min && sev <= s.max);
  const fresh = shapes.filter((s) => !ages.has(`shape.${s.id}`));
  const pool = fresh.length ? fresh : shapes;
  const shape = pool[Math.floor(rng() * pool.length)];
  used.push(`shape.${shape.id}`);

  // The facts first, so the signature-phrase rule knows what the core already says.
  const parts: { tok: string; text: string }[] = [];
  const firstCore = shape.slots.findIndex((t) => t === 'core' || t === 'pcore' || t === 'dcore');
  const filled: (string | null)[] = shape.slots.map(() => null);
  for (let i = 0; i < shape.slots.length; i++) if (shape.slots[i].endsWith('core')) filled[i] = slot(shape.slots[i]);
  const record = rec();
  for (let i = 0; i < shape.slots.length; i++) if (!shape.slots[i].endsWith('core')) filled[i] = slot(shape.slots[i]);
  shape.slots.forEach((tok, i) => {
    if (filled[i]) parts.push({ tok, text: filled[i]! });
    if (i === firstCore && record) parts.push({ tok: 'rec', text: record });
  });

  // The emoji: one, or two when he is hot.
  const emojiPool = [...main.emoji, ...(tone === 'praise' ? GEN.emojiPraise : tone === 'mixed' ? GEN.emojiMixed : GEN.emojiDrag)];
  const emojis: string[] = [];
  const emojiLines = lines(`emoji.${req.topic}.${tone}`, emojiPool);
  for (let k = 0; k < (sev >= 2 && tone !== 'mixed' ? 2 : 1); k++) {
    const e = choose([emojiLines], {});
    if (e) {
      taken.add(e.id);
      used.push(e.id);
      emojis.push(e.text);
    }
  }
  const tail = emojis.length ? ` ${emojis.join('')}` : '';

  // Over the limit: drop the least needed parts until it fits.
  const text = () => parts.map((p) => p.text).join(' ') + tail;
  for (const tok of DROP) {
    while (text().length > MAX_POST) {
      const i = parts.map((p) => p.tok).lastIndexOf(tok);
      if (i < 0) break;
      const [gone] = parts.splice(i, 1);
      const id = used.find((u) => fill(lines(u.slice(0, u.lastIndexOf('.')), []).length ? '' : '', {}) === gone.text);
      void id;
    }
  }
  let out = text();
  if (out.length > MAX_POST) out = `${out.slice(0, MAX_POST - 1).replace(/\s+\S*$/, '')}…`;
  return { text: out, phrases: used, tone, severity: sev };
}

/**
 * VDM's post about a matter. Deterministic: the same request (seed, facts, memory) gives the same post. Lines used in
 * his recent posts are avoided, and a draft too close to one of them (or the same) is written again with another
 * roll, up to a few times; the least alike draft wins.
 */
export function composeVdm(req: VdmRequest): VdmPost {
  const history = (req.history ?? []).slice(0, VDM_MEMORY.recent);
  const ages = new Map<string, number>();
  history.forEach((h, age) => h.phrases.forEach((id) => { if (!ages.has(id)) ages.set(id, age); }));
  // Older posts are "less recent": a line last used long ago is the one to reuse when a slot runs dry.
  for (const [id, age] of ages) ages.set(id, VDM_MEMORY.recent - age);
  let best: { post: VdmPost; score: number } | null = null;
  for (let attempt = 0; attempt < VDM_MEMORY.attempts; attempt++) {
    const post = build(req, attempt, ages);
    const score = Math.max(0, ...history.map((h) => (h.text === post.text ? 1 : overlap(h.text, post.text))));
    if (!best || score < best.score) best = { post, score };
    if (score < VDM_MEMORY.similar) break;
  }
  return best!.post;
}

/** What VDM tells a caller when he won't carry their matter. Seeded, so asking twice in a moment gets the same answer. */
export function vdmPass(seed: string) {
  const rng = rngOf(seed);
  const why = GEN.passWhy[Math.floor(rng() * GEN.passWhy.length)];
  const then = GEN.passThen[Math.floor(rng() * GEN.passThen.length)];
  return rng() < 0.25 ? why : `${why} ${then}`;
}
