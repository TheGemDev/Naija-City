// The colour emoji drawings and the library that draws them. By far the biggest file in the game, so it is not part
// of the first download: Emoji (Icons.tsx) fetches it once the game is up and shows the phone's own emoji until then.
import type { CSSProperties } from 'react';
import { Icon as Iconify, addCollection } from '@iconify/react';
import { NOTO, NOTO_MAP } from './notoData';

addCollection(NOTO as never);

/** The drawing for an emoji, with or without its variation selector. Undefined when we carry none. */
export function notoName(char: string): string | undefined {
  const key = char.replace(/️/g, '');
  return NOTO_MAP[char] ?? Object.entries(NOTO_MAP).find(([k]) => k.replace(/️/g, '') === key)?.[1];
}

export function NotoIcon({ name, size, style }: { name: string; size: number | string; style?: CSSProperties }) {
  return <Iconify icon={`noto:${name}`} width={size} height={size} style={{ verticalAlign: 'middle', flexShrink: 0, ...style }} />;
}
