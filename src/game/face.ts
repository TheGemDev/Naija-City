// A flat head-and-shoulders drawing of a player, used where a 3D portrait is too heavy: chat lists and share cards.

import { decodeLook, GARMENT_BY_ID, HAIR_COLORS, SKINS } from './wardrobe';

/** What everyone wears in a police picture. */
const PRISON_TOP = { color: '#f97316', accent: '#c2410c' };

/**
 * Head and shoulders drawn from the player's look: skin, hair, headwear, eyewear and the colour of their top.
 * `prison` is how the police photograph them: orange overalls, and no cap or glasses (a hijab stays on).
 */
export function avatarSvg(look: string | null | undefined, bg: string, prison = false): string {
  const a = decodeLook(look);
  const skin = SKINS[a.skin], hair = HAIR_COLORS[a.hairColor];
  const worn = a.outfit.head ? GARMENT_BY_ID[a.outfit.head] : null;
  const hijab = worn?.shape === 'hijab';
  const top = prison ? PRISON_TOP : a.outfit.top ? GARMENT_BY_ID[a.outfit.top] : null;
  const hat = prison && !hijab ? null : worn;
  const eyes = !prison && a.outfit.eyes ? GARMENT_BY_ID[a.outfit.eyes] : null;
  const crown = `<path d="M130,150 C130,60 270,60 270,150 C250,115 150,115 130,150 Z" fill="${hair}"/>`;

  let out = `<rect width="400" height="400" fill="${bg}"/>`;
  // Behind the head: long or big hair, or the hijab's drape.
  if (hijab) out += `<path d="M96,170 C96,40 304,40 304,170 C320,300 330,340 350,400 L50,400 C70,340 80,300 96,170 Z" fill="${worn.color}"/>`;
  else if (a.hair === 'afro') out += `<circle cx="200" cy="125" r="106" fill="${hair}"/>`;
  else if (a.hair === 'dreads') out += `<rect x="116" y="100" width="168" height="180" rx="42" fill="${hair}"/>`;
  else if (a.hair === 'braids') out += `<rect x="110" y="100" width="180" height="240" rx="46" fill="${hair}"/>`;

  out += `<path d="M40,400 C40,300 110,272 200,272 C290,272 360,300 360,400 Z" fill="${top?.color ?? '#e2e8f0'}"/>`;
  if (top?.accent) out += `<path d="M150,276 Q200,318 250,276" fill="none" stroke="${top.accent}" stroke-width="10"/>`;
  out += `<rect x="170" y="220" width="60" height="68" rx="22" fill="${skin}"/>`;
  out += `<circle cx="128" cy="172" r="14" fill="${skin}"/><circle cx="272" cy="172" r="14" fill="${skin}"/>`;
  // A face rather than an egg: full at the cheekbones, then a jaw that turns in to a chin.
  out += `<path d="M200,81 C241,81 272,112 272,156 C272,186 266,211 250,229 C236,245 220,253 200,253 C180,253 164,245 150,229 C134,211 128,186 128,156 C128,112 159,81 200,81 Z" fill="${skin}"/>`;

  if (hijab) {
    out += `<path d="M124,165 C120,60 280,60 276,165 C262,118 138,118 124,165 Z" fill="${worn.color}"/><ellipse cx="200" cy="268" rx="76" ry="34" fill="${worn.color}"/>`;
  } else {
    if (a.hair !== 'bald') out += crown;
    if (a.hair === 'fade') out += `<path d="M130,150 C130,128 136,108 148,94 L150,122 Z" fill="${skin}" opacity="0.45"/><path d="M270,150 C270,128 264,108 252,94 L250,122 Z" fill="${skin}" opacity="0.45"/>`;
    if (a.hair === 'cornrows') for (const x of [164, 182, 200, 218, 236]) out += `<line x1="${x}" y1="94" x2="${x}" y2="122" stroke="${skin}" stroke-width="3" opacity="0.5"/>`;
    if (a.hair === 'bun') out += `<circle cx="200" cy="62" r="30" fill="${hair}"/>`;
  }

  out += '<circle cx="172" cy="168" r="7" fill="#111"/><circle cx="228" cy="168" r="7" fill="#111"/>';
  out += '<path d="M194,190 Q200,197 206,190" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="4" stroke-linecap="round"/>';
  out += '<path d="M178,212 Q200,230 222,212" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>';
  if (eyes?.shape === 'shades') out += `<rect x="146" y="150" width="46" height="32" rx="12" fill="${eyes.color}"/><rect x="208" y="150" width="46" height="32" rx="12" fill="${eyes.color}"/><rect x="190" y="160" width="20" height="6" fill="${eyes.color}"/>`;
  else if (eyes) out += `<circle cx="172" cy="168" r="22" fill="none" stroke="${eyes.color}" stroke-width="5"/><circle cx="228" cy="168" r="22" fill="none" stroke="${eyes.color}" stroke-width="5"/><rect x="192" y="165" width="16" height="5" fill="${eyes.color}"/>`;

  if (hat && !hijab) {
    const trim = hat.accent ?? hat.color;
    if (hat.shape === 'zanna' || hat.shape === 'fila') {
      out += `<path d="M126,138 L140,52 Q200,32 260,52 L274,138 Q200,112 126,138 Z" fill="${hat.color}"/><path d="M130,116 Q200,92 270,116" fill="none" stroke="${trim}" stroke-width="8"/>`;
    } else if (hat.shape === 'gele' || hat.shape === 'headtie' || hat.shape === 'turban') {
      out += `<ellipse cx="200" cy="92" rx="118" ry="72" fill="${hat.color}"/><path d="M92,112 Q200,60 308,112" fill="none" stroke="${trim}" stroke-width="10" opacity="0.7"/><path d="M110,136 Q200,96 290,136" fill="none" stroke="${trim}" stroke-width="8" opacity="0.5"/>`;
    } else {
      out += `<path d="M126,140 C126,48 274,48 274,140 Q200,118 126,140 Z" fill="${hat.color}"/>`;
      if (hat.shape === 'beanie') out += `<path d="M126,140 Q200,118 274,140" fill="none" stroke="${trim}" stroke-width="20"/>`;
      else if (hat.shape === 'bucket') out += `<ellipse cx="200" cy="138" rx="112" ry="18" fill="${hat.color}"/>`;
      else if (hat.shape !== 'durag') out += `<ellipse cx="200" cy="138" rx="92" ry="14" fill="${trim}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">${out}</svg>`;
}
