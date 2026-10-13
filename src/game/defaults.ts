// Furniture every new house starts with. Kept dependency-free so the server can read it too
// (worker/wallet.ts uses it to check that a player really owns what they sell).

import type { PlacedItem } from './grid';

export const DEFAULT_ITEMS: PlacedItem[] = [
  // Parlour
  { id: 'tv', type: 'tv', x: 2, z: 0, rot: 0 },
  { id: 'rug', type: 'rug', x: 2, z: 1, rot: 0 },
  { id: 'sofa', type: 'sofa', x: 1, z: 3, rot: 2 },
  { id: 'fan', type: 'fan', x: 0, z: 0, rot: 0 },
  { id: 'shelf', type: 'bookshelf', x: 7, z: 0, rot: 0 },
  { id: 'mat', type: 'prayer_mat', x: 6, z: 3, rot: 0 },
  { id: 'plant1', type: 'plant', x: 0, z: 5, rot: 0 },
  // Kitchen
  { id: 'counter', type: 'counter', x: 10, z: 0, rot: 0 },
  { id: 'cooker', type: 'cooker', x: 12, z: 0, rot: 0 },
  { id: 'fridge', type: 'fridge', x: 13, z: 0, rot: 0 },
  // Dining
  { id: 'dining', type: 'dining', x: 12, z: 6, rot: 3 },
  { id: 'plant2', type: 'plant', x: 13, z: 9, rot: 0 },
  // Bedroom
  { id: 'bed', type: 'bed_foam', x: 0, z: 7, rot: 0 },
  // Bathroom
  { id: 'toilet', type: 'toilet', x: 7, z: 9, rot: 2 },
  { id: 'shower', type: 'shower', x: 5, z: 9, rot: 2 },
  // Compound
  { id: 'gen', type: 'generator', x: 0, z: 12, rot: 0 },
  { id: 'chair1', type: 'plastic_chair', x: 3, z: 11, rot: 3 },
  { id: 'chair2', type: 'plastic_chair', x: 5, z: 11, rot: 1 },
  { id: 'mango', type: 'mango_tree', x: 8, z: 12, rot: 0 },
  { id: 'gate', type: 'gate', x: 11, z: 12, rot: 0 },
];
