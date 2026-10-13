// Quick reactions in the street chat: one tap sends the emoji as your chat bubble. Each one must be in the Noto
// set (scripts/gen-noto.mjs), or it falls back to the phone's own emoji.

export const REACTIONS = [
  { char: '😂', label: 'Laughing' },
  { char: '❤️', label: 'Love' },
  { char: '🔥', label: 'Fire' },
  { char: '👋🏾', label: 'Wave' },
  { char: '👀', label: 'Eyes' },
  { char: '🎉', label: 'Party' },
  { char: '💃🏾', label: 'Dance' },
  { char: '😩', label: 'Tired' },
] as const;

const CHARS = new Set<string>(REACTIONS.map((r) => r.char));

/** A chat line that is nothing but one of the reactions above: drawn big, as the emoji alone. */
export const isReaction = (text: string) => CHARS.has(text);
