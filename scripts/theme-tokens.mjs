// Turns hard-coded colours in the game's CSS into theme tokens, so the whole UI can switch between light and dark.
//
//   node scripts/theme-tokens.mjs          rewrite the CSS files and regenerate src/theme.tokens.css
//   node scripts/theme-tokens.mjs --check  report what would change, write nothing
//
// Safe to re-run after adding new CSS: it only touches raw colours, and a token's name carries its light value
// (--bg-f1f5f9 is #f1f5f9 in light mode), so light mode never changes. The dark value is worked out from the
// colour's role: backgrounds get dark surfaces, text gets lighter, borders sit in between.
// Add `/* theme:keep */` inside a rule to leave that rule alone.
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = ['src/styles.css', 'src/ui/intruder.css', 'src/ui/update-notice.css', 'src/ui/vice.css', 'src/ui/phone-ui.css'];
const OUT = 'src/theme.tokens.css';
const check = process.argv.includes('--check');

/* ---------- colour maths ---------- */

function parseHex(h) {
  let s = h.slice(1);
  if (s.length === 3) s = [...s].map((c) => c + c).join('');
  if (s.length !== 6) return null;
  const n = parseInt(s, 16);
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, hex: s.toLowerCase() };
}
function hsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}
function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
function lum({ r, g, b }) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const isLightNeutral = (c) => { const { s, l } = hsl(c); return l >= 0.8 && s <= 0.45; };
const isDarkNeutral = (c) => { const { h, s, l } = hsl(c); return l < 0.55 && (s <= 0.15 || (s <= 0.5 && h >= 195 && h <= 235)); };

// The page behind phone apps is darker than the cards on it in both themes.
const DARK_OVERRIDE = { 'bg-f2f4f7': '#0e1422' };

/** Dark-mode value for a colour in a role, or null when the colour should stay as it is in both themes. */
function darkOf(role, c) {
  const { h, s, l } = hsl(c);
  if (role === 'bg') {
    if (l >= 0.8) {
      if (isLightNeutral(c)) return fromHsl(222, 0.3, clamp(0.155 + (1 - l) * 1.1, 0.155, 0.4));
      // Yellows turn olive when dark and saturated, so they get less colour than the other tints.
      return fromHsl(h, Math.min(s * 0.5, h >= 35 && h <= 75 ? 0.3 : 0.38), clamp(0.15 + (1 - l) * 0.7, 0.15, 0.3));
    }
    // Dark slate fills (selected tabs, primary buttons) would vanish on dark surfaces: lift them.
    if (isDarkNeutral(c) && l >= 0.08 && l <= 0.4) return fromHsl(220, 0.25, clamp(0.28 + l * 0.35, 0.3, 0.42));
    return null;
  }
  if (role === 'fg') {
    if (lum(c) >= 0.3) return null;
    if (isDarkNeutral(c)) return fromHsl(215, 0.25, clamp(0.97 - 0.75 * l, 0.55, 0.92));
    return fromHsl(h, Math.min(s, 0.8), clamp(0.62 + (0.5 - l) * 0.4, 0.6, 0.8));
  }
  // border
  if (l >= 0.8) {
    if (isLightNeutral(c)) return fromHsl(222, 0.26, clamp(0.225 + (1 - l) * 1.1, 0.225, 0.45));
    return fromHsl(h, Math.min(s * 0.6, 0.45), 0.36);
  }
  return darkOf('fg', c);
}

/* ---------- declaration rewriting ---------- */

const ROLE = (prop) => {
  if (/^(color|caret-color|-webkit-text-fill-color|text-decoration(-color)?)$/.test(prop)) return 'fg';
  if (/^background(-color|-image)?$/.test(prop)) return 'bg';
  if (/^(border|outline|column-rule)/.test(prop) && !/radius|width|style|collapse|spacing|offset/.test(prop)) return 'bd';
  if (prop === 'box-shadow') return 'shadow';
  return CUSTOM[prop] ?? null;
};
// Custom properties that carry a colour for one role.
const CUSTOM = { '--tile-tint': 'bg', '--hud-bg': 'bg', '--tile-accent': 'fg' };

const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)/g;
const used = new Set();
const stats = { bg: 0, fg: 0, bd: 0, alpha: 0, pinned: 0 };

function token(role, c) {
  if (darkOf(role, c) === null) return null;
  const name = `${role}-${c.hex}`;
  used.add(name);
  stats[role]++;
  return `var(--${name})`;
}
function parseRgb(str) {
  const m = str.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4], alpha: m[4] ?? '1' } : null;
}
const isInk = (c) => c.r === 15 && c.g === 23 && c.b === 42;
const isWhite = (c) => c.r === 255 && c.g === 255 && c.b === 255;

function splitTop(str, sep) {
  const out = [];
  let depth = 0, quote = '', start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === sep && depth === 0) { out.push(str.slice(start, i)); start = i + 1; }
  }
  out.push(str.slice(start));
  return out;
}

/** Colours in a background that are opaque and stay the same in both themes (so the text on them must too). */
function fixedBg(value) {
  const fixed = [];
  let mapped = 0, light = 0;
  for (const m of value.replace(/var\([^()]*\)/g, (v) => { if (/--(bg-|card|hud-bg|tile-tint|inverse)/.test(v)) mapped++; return ''; }).match(COLOR) ?? []) {
    if (m[0] === '#') {
      const c = parseHex(m);
      if (!c) continue;
      if (darkOf('bg', c) === null) fixed.push(c); else { mapped++; if (hsl(c).l >= 0.8) light++; }
    } else {
      const c = parseRgb(m);
      if (!c) continue;
      if (c.a >= 0.9) { if (darkOf('bg', c) === null) fixed.push(c); else mapped++; }
      else if (isWhite(c) && c.a >= 0.7) mapped++;
    }
  }
  return { fixed, mapped, light };
}

function rewriteValue(role, value, pinText) {
  if (role === 'fg') {
    if (pinText) {
      const next = value.replace(/var\(--(ink|muted)\)/g, (_, n) => { stats.pinned++; return `var(--${n}-fixed)`; });
      return next;
    }
    value = value.replace(/var\(--(green|green-2)\)/g, 'var(--$1-fg)');
    return value.replace(COLOR, (m) => {
      if (m[0] === '#') { const c = parseHex(m); return (c && token('fg', c)) || m; }
      const c = parseRgb(m);
      if (c && isInk(c) && c.a < 1) { stats.alpha++; return `rgba(var(--ink-rgb), ${c.alpha})`; }
      return m;
    });
  }
  if (role === 'bg') {
    // A gradient or layered background mixing fixed and themed stops would come out half-dark: leave it whole.
    const { fixed, mapped } = fixedBg(value);
    if (fixed.length && mapped) return value;
    value = value.replace(/var\(--ink\)/g, 'var(--inverse)');
    return value.replace(COLOR, (m) => {
      if (m[0] === '#') { const c = parseHex(m); return (c && token('bg', c)) || m; }
      const c = parseRgb(m);
      if (!c) return m;
      if (isInk(c) && c.a <= 0.2) { stats.alpha++; return `rgba(var(--ink-rgb), ${c.alpha})`; }
      if (isWhite(c) && c.a >= 0.7 && c.a < 1) { stats.alpha++; return `rgba(var(--surface-rgb), ${c.alpha})`; }
      return m;
    });
  }
  if (role === 'bd') {
    return value.replace(COLOR, (m) => {
      if (m[0] === '#') { const c = parseHex(m); return (c && token('bd', c)) || m; }
      const c = parseRgb(m);
      if (c && isInk(c) && c.a < 1) { stats.alpha++; return `rgba(var(--ink-rgb), ${c.alpha})`; }
      return m;
    });
  }
  // box-shadow: only rings (0 0 0 Npx colour) act as borders; real shadows stay dark in both themes.
  return splitTop(value, ',').map((layer) => {
    if (!/^\s*(inset\s+)?0\s+0\s+0\s+[\d.]+px\s/.test(layer) && !/\s0\s+0\s+0\s+[\d.]+px\s*(inset)?\s*$/.test(layer)) return layer;
    return layer.replace(COLOR, (m) => {
      if (m[0] === '#') {
        const c = parseHex(m);
        if (!c) return m;
        // Dark and vivid rings (a phone's bezel, a selected outline) are meant to stay as they are.
        if (hsl(c).l < 0.8) return m;
        return token(isLightNeutral(c) ? 'bg' : 'bd', c) || m;
      }
      const c = parseRgb(m);
      if (c && isInk(c) && c.a < 1) { stats.alpha++; return `rgba(var(--ink-rgb), ${c.alpha})`; }
      return m;
    });
  }).join(',');
}

const cleanSel = (sel) => sel.replace(/\/\*[\s\S]*?\*\//g, '').trim();
const brightSelectors = new Set();

function declsOf(body) {
  return splitTop(body, ';').map((seg) => {
    const i = seg.indexOf(':');
    if (i < 0 || /^\s*\/\*/.test(seg) && !seg.includes('*/')) return { seg };
    const rawProp = seg.slice(0, i);
    return { seg, rawProp, prop: rawProp.replace(/\/\*[\s\S]*?\*\//g, '').trim().toLowerCase(), value: seg.slice(i + 1) };
  });
}

/** A rule whose own background is bright and the same in both themes: its text must not flip to light. */
function isBrightFixed(decls) {
  return decls.some((d) => {
    if (!d.prop || ROLE(d.prop) !== 'bg' || d.prop.startsWith('--')) return false;
    const { fixed, light } = fixedBg(d.value);
    // A gradient mixing fixed and light stops is left whole (see rewriteValue), so it stays bright too.
    return fixed.length > 0 && (light > 0 || fixed.some((c) => lum(c) > 0.35));
  });
}

const BLOCK = /([^{}]*)\{([^{}]*)\}/g;

function collectBright(css) {
  for (const m of css.matchAll(BLOCK)) {
    const sel = cleanSel(m[1]);
    if (!sel || sel.startsWith('@') || m[2].includes('theme:keep')) continue;
    if (isBrightFixed(declsOf(m[2]))) for (const part of splitTop(sel, ',')) brightSelectors.add(part.trim());
  }
}
const underBright = (sel) => {
  const parts = splitTop(sel, ',').map((p) => p.trim());
  return parts.every((p) => [...brightSelectors].some((b) => p === b || (p.startsWith(b) && /^[\s>+~.:[]/.test(p.slice(b.length)))));
};

function rewrite(css) {
  return css.replace(BLOCK, (whole, sel, body) => {
    if (body.includes('theme:keep')) return whole;
    const decls = declsOf(body);
    const pin = isBrightFixed(decls) || underBright(cleanSel(sel));
    const next = decls.map((d) => {
      if (!d.prop) return d.seg;
      const role = ROLE(d.prop);
      if (!role) return d.seg;
      return `${d.rawProp}:${rewriteValue(role, d.value, pin)}`;
    }).join(';');
    return `${sel}{${next}}`;
  });
}

/* ---------- run ---------- */

const sources = [];
for (const file of FILES) {
  let css;
  try { css = readFileSync(file, 'utf8'); } catch { continue; }
  sources.push({ file, css });
  collectBright(css);
}
let changed = 0;
for (const s of sources) {
  s.next = rewrite(s.css);
  // Tokens already in the file (from an earlier run) still need their definitions.
  for (const m of s.next.matchAll(/var\(--((?:bg|fg|bd)-[0-9a-f]{6})\)/g)) used.add(m[1]);
  if (s.next !== s.css) { changed++; if (!check) writeFileSync(s.file, s.next); }
}

const names = [...used].sort();
const light = names.map((n) => `  --${n}: #${n.slice(3)};`).join('\n');
const dark = names.map((n) => `  --${n}: ${DARK_OVERRIDE[n] ?? darkOf(n.slice(0, 2), parseHex('#' + n.slice(3)))};`).join('\n');
// Things that keep a bright background in both themes (gold cards, yellow buttons, day wallpaper) stay light
// inside too: every token goes back to its light value there, so the text on them is as dark as it was designed.
const BASE_LIGHT = `--ink: #0f172a; --muted: #64748b; --line: #e2e8f0; --card: rgba(255, 255, 255, 0.94); --page: #f2f4f7; --surface: #fff; --surface-2: #f8fafc; --surface-3: #f1f5f9; --surface-rgb: 255, 255, 255; --ink-rgb: 15, 23, 42; --inverse: #0f172a; --green-fg: #0f6b3a; --green-2-fg: #16a34a;`;
const islands = [...brightSelectors].filter((sel) => !sel.includes('::') && !/:(before|after)\b/.test(sel)).sort();
const island = islands.length
  ? `:root[data-theme='dark'] :is(\n  ${islands.join(',\n  ')}\n) {\n  color-scheme: light;\n  ${BASE_LIGHT}\n${light}\n}\n`
  : '';
const out = `/* Generated by scripts/theme-tokens.mjs. Do not edit: re-run the script instead. */\n:root {\n${light}\n}\n:root[data-theme='dark'] {\n${dark}\n}\n${island}`;
if (!check) writeFileSync(OUT, out);

console.log(`${check ? 'would change' : 'changed'} ${changed} file(s); ${names.length} tokens`);
console.log(`replaced this run: bg ${stats.bg}, text ${stats.fg}, border ${stats.bd}, alpha ${stats.alpha}, pinned ${stats.pinned}`);
if (process.argv.includes('--bright')) console.log('bright fixed backgrounds:\n  ' + [...brightSelectors].join('\n  '));
