// Registry of model files in /public/assets. Add new assets here.

const base = import.meta.env.BASE_URL + 'assets/models/';

export interface CharacterAsset {
  id: string;
  label: string;
  url: string;
}

export const CHARACTERS: CharacterAsset[] = [
  { id: 'man-casual', label: 'Casual', url: base + 'characters/men/man-casual.glb' },
  { id: 'man-casual-2', label: 'Jacket', url: base + 'characters/men/man-casual-2.glb' },
  { id: 'man-long-sleeves', label: 'Long sleeves', url: base + 'characters/men/man-long-sleeves.glb' },
  { id: 'man-suit', label: 'Suit', url: base + 'characters/men/man-suit.glb' },
];

export const characterById = (id: string) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

/** Clip names inside the Quaternius character rigs. */
export const CLIPS = {
  idle: 'HumanArmature|Man_Idle',
  walk: 'HumanArmature|Man_Walk',
  sit: 'HumanArmature|Man_Sitting',
  clap: 'HumanArmature|Man_Clapping',
} as const;

/** Furniture/prop models by item type. Items without an entry use the built-in low-poly model. */
export const ITEM_MODELS: Record<string, string> = {
  // e.g. sofa: base + 'furniture/sofa-3-seater.glb',
};
