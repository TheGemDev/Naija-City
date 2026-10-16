// The birth certificate a new player gets when their life is drawn: their name, @username, the state they were born
// in, their date of birth, and a line of destiny. Drawn from what the game already knows, so nothing is
// stored, and made as one SVG so the screen and the saved picture are the same drawing.

import { avatarSvg } from './face';

export interface BirthCertOf {
  name: string;
  username: string | null | undefined;
  look: string | null | undefined;
  /** The city they were born in, e.g. "Kaduna": only its first letters are used, in the certificate number. */
  city: string;
  /** Its state, e.g. "Kaduna State". */
  state: string;
  /** The start in life they drew, e.g. "Nepo Baby". Left out, the certificate has no status entry. */
  status?: string;
  /** Their line of destiny, from destinyLine(). */
  destiny: string;
  /** Date of birth as YYYY-MM-DD: the one given at sign-up, or randomBirthdate() when there is none. */
  dob: string;
  /** When the certificate was issued. */
  at: number;
  /** Who it is: gives the same certificate number every time. */
  uid?: string | null;
  /** What came with the start in life, already worded: the register has a line for it. */
  start?: { money: string; home: string; phone: string; catches: string[] };
}

export const CERT_W = 800;
export const CERT_H = 1120;
/** The signature, seal and footer sit this much lower than they would on a plain certificate: the register's "at birth" entries go above them. */
const LOWER = 120;

const GREEN = '#0f6b3a';
const INK = '#1b2a20';
const SOFT = '#5d6b60';
const GOLD = '#b0832a';
const PAPER = '#fbf5e2';
const SERIF = `Georgia, 'Times New Roman', 'Noto Serif', serif`;
const MONO = `'Courier New', Courier, monospace`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function hash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Six digits from who they are, so a player's certificate keeps its number. */
const serial = (seed: string) => String((hash(seed) % 900000) + 100000);

/**
 * What the registrar wrote under "Destiny". It hints at the start you drew without naming it, so nobody's
 * certificate says they were born broke. Keyed by origin id (game/origins.ts).
 */
const DESTINIES: Record<string, string[]> = {
  starter: ['Small small, e go better', 'Hustle now, enjoy later', 'Na who try, e go reach'],
  almajiri: ['No gree for anybody', 'From zero to hero', 'Sapa no go last'],
  lapo: ['Small small, e go better', 'Hustle now, enjoy later', 'Na condition make crayfish bend'],
  nepo: ['Na who you know', 'Soft life loading', 'Connection pass certificate'],
  richkid: ['Soft life only', 'Enjoyment allowed', 'Problem no dey finish, enjoy'],
  dangote: ['Money na water', 'Born to chop life', 'Odogwu from birth'],
};

/** A player's line of destiny: one of their origin's, and always the same one for the same player. */
export function destinyLine(origin: string, seed: string): string {
  const lines = DESTINIES[origin] ?? DESTINIES.almajiri;
  return lines[hash(`destiny:${seed}`) % lines.length];
}

/** A made-up date of birth for someone who never gave one: always the same for the same person, and always an adult. */
export function randomBirthdate(seed: string, now = Date.now()): string {
  const year = new Date(now).getFullYear() - 19 - (hash(`y:${seed}`) % 22);
  const month = (hash(`m:${seed}`) % 12) + 1;
  const day = (hash(`d:${seed}`) % 28) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "1998-03-07" as "7 March 1998". Read as written, so no time zone can move it by a day. */
function longDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return MONTHS[m - 1] && d ? `${d} ${MONTHS[m - 1]} ${y}` : ymd;
}

/** The largest size that keeps a line of serif text inside `width`. */
const fit = (text: string, width: number, max: number, perChar = 0.56) => Math.min(max, width / (Math.max(text.length, 1) * perChar));

export function birthCertSvg({ name, username, look, city, state, status, destiny, dob, at, uid, start }: BirthCertOf): string {
  const d = new Date(at);
  const date = longDate(dob);
  const who = name.trim() || 'New Citizen';
  const no = `NC-${city.slice(0, 3).toUpperCase()}-${d.getFullYear()}-${serial(uid ?? username ?? who)}`;
  const mid = CERT_W / 2;

  let out = '<defs>';
  // Security-paper lines, like the back of a cheque.
  out += `<pattern id="weave" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M0,14 Q7,4 14,14 T28,14" fill="none" stroke="${GREEN}" stroke-width="0.7" opacity="0.13"/><path d="M0,28 Q7,18 14,28 T28,28" fill="none" stroke="${GOLD}" stroke-width="0.6" opacity="0.14"/></pattern>`;
  out += `<radialGradient id="glow" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
  out += `<radialGradient id="wax" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#e2bd62"/><stop offset="0.6" stop-color="${GOLD}"/><stop offset="1" stop-color="#8a6417"/></radialGradient>`;
  out += `<path id="ring" d="M640,${838 - 44} a44,44 0 1,1 -0.01,0"/>`;
  out += `<clipPath id="photo"><rect x="72" y="520" width="196" height="236" rx="6"/></clipPath>`;
  out += '</defs>';

  // Paper and frame.
  out += `<rect width="${CERT_W}" height="${CERT_H}" fill="${PAPER}"/>`;
  out += `<rect width="${CERT_W}" height="${CERT_H}" fill="url(#weave)"/>`;
  out += `<rect width="${CERT_W}" height="${CERT_H}" fill="url(#glow)"/>`;
  out += `<rect x="22" y="22" width="${CERT_W - 44}" height="${CERT_H - 44}" fill="none" stroke="${GREEN}" stroke-width="7"/>`;
  out += `<rect x="36" y="36" width="${CERT_W - 72}" height="${CERT_H - 72}" fill="none" stroke="${GOLD}" stroke-width="1.6"/>`;
  out += `<rect x="42" y="42" width="${CERT_W - 84}" height="${CERT_H - 84}" fill="none" stroke="${GREEN}" stroke-width="0.8" opacity="0.6"/>`;
  for (const [x, y] of [[36, 36], [CERT_W - 36, 36], [36, CERT_H - 36], [CERT_W - 36, CERT_H - 36]]) {
    out += `<g transform="translate(${x},${y}) rotate(45)"><rect x="-11" y="-11" width="22" height="22" fill="${PAPER}" stroke="${GOLD}" stroke-width="1.6"/><rect x="-5" y="-5" width="10" height="10" fill="${GREEN}"/></g>`;
  }

  // The game's own mark (public/icons/kaduna-life.svg): I, a heart, and the flag. Drawn in, because a picture can't load a file.
  out += `<g transform="translate(${mid - 41},61) scale(${(82 / 512).toFixed(4)})"><rect width="512" height="512" rx="112" fill="${GREEN}"/><path d="M172.7 222V94H199.3V222Z" fill="#fff"/><path d="M350 238C262 180 262 94 320 94c20 0 30 12 30 28 0-16 10-28 30-28 58 0 58 86-30 144z" fill="#ef4444" transform="translate(-44 -2) scale(1 .98)"/><path d="M141 282H377A18 18 0 0 1 395 300V410A18 18 0 0 1 377 428H141A18 18 0 0 1 123 410V300A18 18 0 0 1 141 282Z" fill="#fff"/><path d="M142 292H217V418H142A9 9 0 0 1 133 409V301A9 9 0 0 1 142 292Z M301 292H376A9 9 0 0 1 385 301V409A9 9 0 0 1 376 418H301Z" fill="#008751"/></g>`;
  out += `<text x="${mid}" y="180" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="23" letter-spacing="9" fill="${GREEN}">NAIJA CITY</text>`;
  out += `<text x="${mid}" y="204" text-anchor="middle" font-family="${SERIF}" font-size="12.5" letter-spacing="5" fill="${SOFT}">REGISTRY OF BIRTHS</text>`;

  out += `<text x="${mid}" y="272" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-weight="700" font-size="58" fill="${INK}">Certificate of Birth</text>`;
  out += `<g stroke="${GOLD}" stroke-width="1.4" fill="${GOLD}"><line x1="230" y1="298" x2="${mid - 16}" y2="298"/><line x1="${mid + 16}" y1="298" x2="570" y2="298"/><path d="M${mid},290 l8,8 -8,8 -8,-8 Z"/></g>`;

  out += `<text x="${mid}" y="340" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="18" fill="${SOFT}">This is to certify that</text>`;
  out += `<text x="${mid}" y="398" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="${fit(who, 620, 54).toFixed(1)}" fill="${INK}">${esc(who)}</text>`;
  out += `<line x1="150" y1="414" x2="650" y2="414" stroke="${INK}" stroke-width="1" stroke-dasharray="1 4" stroke-linecap="round"/>`;
  if (username) out += `<text x="${mid}" y="444" text-anchor="middle" font-family="${MONO}" font-weight="700" font-size="22" fill="${GREEN}">@${esc(username)}</text>`;
  out += `<text x="${mid}" y="482" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="17" fill="${SOFT}">was born a citizen of Naija City, and is entered in the register as follows</text>`;

  // Passport photo.
  out += `<rect x="64" y="512" width="212" height="252" rx="9" fill="#fff" stroke="${GOLD}" stroke-width="1.6"/>`;
  out += `<g clip-path="url(#photo)"><svg x="72" y="520" width="196" height="236" viewBox="52 34 305 367" preserveAspectRatio="xMidYMid slice">${avatarSvg(look, '#dfe9d4')}</svg></g>`;
  out += `<rect x="72" y="520" width="196" height="236" rx="6" fill="none" stroke="${GREEN}" stroke-width="1" opacity="0.5"/>`;

  // The register entries.
  const rows: [string, string][] = [
    ['STATE OF BIRTH', state],
    ['DATE OF BIRTH', date],
    ...(status ? [['STATUS AT BIRTH', status] as [string, string]] : []),
    ['DESTINY', `“${destiny}”`],
  ];
  // Four entries sit closer together than three, to end level with the photo either way.
  const [top, gap, size] = rows.length > 3 ? [546, 59, 26] : [552, 76, 30];
  rows.forEach(([label, value], i) => {
    const y = top + i * gap;
    out += `<text x="306" y="${y}" font-family="${SERIF}" font-size="11.5" letter-spacing="2.6" fill="${SOFT}">${label}</text>`;
    out += `<text x="306" y="${y + size + 2}" font-family="${SERIF}" font-weight="700" font-size="${fit(value, 420, size).toFixed(1)}" fill="${INK}">${esc(value)}</text>`;
    out += `<line x1="306" y1="${y + size + 13}" x2="728" y2="${y + size + 13}" stroke="${INK}" stroke-width="1" stroke-dasharray="1 4" stroke-linecap="round" opacity="0.7"/>`;
  });

  // What came with the start: money, home and phone, and the catch if there is one.
  if (start) {
    out += `<line x1="72" y1="790" x2="728" y2="790" stroke="${GOLD}" stroke-width="1.2"/>`;
    out += `<text x="72" y="814" font-family="${SERIF}" font-size="11.5" letter-spacing="2.6" fill="${SOFT}">AT BIRTH, YOU RECEIVED</text>`;
    ([['MONEY', start.money, 72, 176], ['HOME', start.home, 268, 236], ['PHONE', start.phone, 524, 204]] as [string, string, number, number][]).forEach(([label, value, x, w]) => {
      out += `<text x="${x}" y="842" font-family="${SERIF}" font-size="10.5" letter-spacing="2.2" fill="${SOFT}">${label}</text>`;
      out += `<text x="${x}" y="870" font-family="${SERIF}" font-weight="700" font-size="${fit(value, w, 24, 0.6).toFixed(1)}" fill="${INK}">${esc(value)}</text>`;
      out += `<line x1="${x}" y1="880" x2="${x + w}" y2="880" stroke="${INK}" stroke-width="1" stroke-dasharray="1 4" stroke-linecap="round" opacity="0.7"/>`;
    });
    if (start.catches.length) {
      const line = `The catch: ${start.catches.join(' · ')}`;
      out += `<text x="72" y="910" font-family="${SERIF}" font-style="italic" font-size="${fit(line, 656, 17, 0.5).toFixed(1)}" fill="#9a3412">${esc(line)}</text>`;
    }
  }

  // Signed and sealed.
  out += `<g transform="translate(0,${LOWER})">`;
  out += `<path d="M84,850 c14,-30 24,-34 26,-14 c2,22 -12,34 -4,8 c8,-24 22,-30 26,-10 c2,12 6,12 14,-2 c6,-10 12,-8 14,2 c2,8 8,6 16,-6 c10,-14 20,-10 22,4 c8,-6 22,-10 44,-12" fill="none" stroke="#1e3a5f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  out += `<line x1="72" y1="866" x2="300" y2="866" stroke="${INK}" stroke-width="1.2"/>`;
  out += `<text x="72" y="886" font-family="${SERIF}" font-size="13" letter-spacing="1.6" fill="${SOFT}">REGISTRAR OF BIRTHS</text>`;

  let seal = '';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    seal += `<circle cx="${(640 + Math.cos(a) * 62).toFixed(1)}" cy="${(838 + Math.sin(a) * 62).toFixed(1)}" r="9.5" fill="url(#wax)"/>`;
  }
  out += `<g transform="rotate(-9 640 838)">${seal}<circle cx="640" cy="838" r="63" fill="url(#wax)"/><circle cx="640" cy="838" r="55" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.75"/><circle cx="640" cy="838" r="31" fill="none" stroke="#fff" stroke-width="1" opacity="0.6"/>`;
  out += `<text font-family="${SERIF}" font-weight="700" font-size="10.5" fill="#fff"><textPath href="#ring" startOffset="0" textLength="268" lengthAdjust="spacing">NAIJA CITY ★ REGISTRY OF BIRTHS ★ </textPath></text>`;
  out += `<path d="M640,816 l6.5,14 15.5,1.8 -11.5,10.6 3,15.2 -13.5,-7.6 -13.5,7.6 3,-15.2 -11.5,-10.6 15.5,-1.8 Z" fill="#fff" opacity="0.95"/></g>`;

  out += `<text x="72" y="919" font-family="${MONO}" font-weight="700" font-size="12.5" fill="${INK}">No. ${esc(no)}</text>`;
  // Where to play, big enough to read when the picture is shared small.
  out += `<rect x="${mid - 118}" y="897" width="236" height="34" rx="17" fill="${GREEN}"/><text x="${mid}" y="920" text-anchor="middle" font-family="${MONO}" font-weight="700" font-size="19" fill="#fff">https://naija.city</text>`;
  out += `<text x="${mid}" y="945" text-anchor="middle" font-family="${SERIF}" font-size="10.5" fill="${SOFT}" opacity="0.9">Issued inside the game Naija City. For fun only: not a legal document.</text>`;

  out += '</g>';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CERT_W}" height="${CERT_H}" viewBox="0 0 ${CERT_W} ${CERT_H}">${out}</svg>`;
}
