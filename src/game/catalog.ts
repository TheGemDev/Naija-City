// Static game data: needs, furniture/items, their actions, jobs.
import type { ShopId } from './wardrobe';
import type { PoliticalOffice } from './civic';

export type Need = 'hunger' | 'energy' | 'fun' | 'social' | 'hygiene' | 'bladder';

export const NEEDS: { key: Need; label: string; icon: string }[] = [
  { key: 'hunger', label: 'Hunger', icon: '🍛' },
  { key: 'energy', label: 'Energy', icon: '⚡' },
  { key: 'fun', label: 'Fun', icon: '🎉' },
  { key: 'social', label: 'Social', icon: '💬' },
  { key: 'hygiene', label: 'Hygiene', icon: '🫧' },
];

/**
 * Bladder is folded into hygiene: it is no longer a bar to watch. The key stays in the type and in saves
 * (always full) so old saves and the server's save check keep working. Toilets now freshen you up instead:
 * an action that filled the bladder raises hygiene at this share of its old rate.
 */
export const TOILET_FRESHEN = 0.1;

/** Need change per game hour when not doing anything that affects it. */
export const DECAY: Record<Need, number> = {
  hunger: -3,
  energy: -3,
  fun: -3,
  social: -2,
  hygiene: -2.5,
  bladder: -5,
};

/**
 * Every falling need falls at this share of its listed rate, whatever is draining it: standing around, a task,
 * a shift, walking. The one knob for how hard the bars are to keep up; gains are untouched.
 */
export const DRAIN_SCALE = 0.5;

/** Hunger falls slower on a shift: you eat at work. */
export const WORK_HUNGER = -2;

/** Food is fuel: whatever feeds you gives back this share of it as energy. */
export const FOOD_ENERGY = 0.3;

/** A need change with the energy its food gives added, unless it already says what it does to energy. */
export const fed = <T extends Partial<Record<Need, number>>>(gain: T): T =>
  (gain.hunger ?? 0) > 0 && gain.energy === undefined ? { ...gain, energy: gain.hunger! * FOOD_ENERGY } : gain;

export type Pose = 'stand' | 'sit' | 'lie' | 'hidden';
export type ActivityAnimation = 'sit' | 'stir' | 'type' | 'talk' | 'eat' | 'drink' | 'clean' | 'exercise' | 'dance' | 'read' | 'pray' | 'wash' | 'perform';

export interface ActionDef {
  id: string;
  label: string;
  icon: string;
  /** Duration in game minutes. */
  minutes: number;
  /** Need change per game hour while doing this. Replaces DECAY for listed needs. */
  perHour?: Partial<Record<Need, number>>;
  cost?: number;
  payout?: number;
  needsPower?: boolean;
  /** Plays out at the fast skip rate however short it is (naps, cooking), so a nap never takes longer than a night's sleep. */
  fast?: boolean;
  /** Stop early once this need is full. */
  untilFull?: Need;
  pose?: Pose;
  animation?: ActivityAnimation;
  knowledgePerHour?: number;
  cookingPerHour?: number;
  /** Finishing this course trains a career skill (the server charges the fee and checks the cooldown). */
  skill?: 'cooking' | 'mechanic' | 'tailoring' | 'trading';
  effect?: 'fuelGen' | 'toggleGen' | 'work' | 'goHome' | 'goCity' | 'enterPlace' | 'goodDeed' | 'durbar' | 'buyRam' | 'feedRam' | 'shareRam' | 'shop' | 'phoneShop' | 'travel' | 'bank' | 'bankHeist' | 'sprayMoney' | 'hotelDesk' | 'hotelLift' | 'leaveRoom' | 'villaSuite';
  /** Only whoever holds this office can do it (game/villa.ts). */
  office?: PoliticalOffice;
  /** Destination region for effect 'travel'. */
  destination?: string;
  /** For effect 'travel': flown in your own private jet (src/game/cars.ts), so you must own one. */
  jet?: boolean;
  /** For effect 'shop': which clothes shop opens. */
  shop?: ShopId;
  waterUse?: number;
  category?: 'wild' | 'spend' | 'social' | 'work';
  tagline?: string;
}

export type Category = 'luxury' | 'sleep' | 'kitchen' | 'bath' | 'comfort' | 'fun' | 'skills' | 'power' | 'security' | 'decor' | 'outdoor';

export const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'luxury', label: 'Luxury', icon: '💎' },
  { key: 'sleep', label: 'Sleep', icon: '🛏️' },
  { key: 'kitchen', label: 'Kitchen', icon: '🍳' },
  { key: 'bath', label: 'Bath', icon: '🚿' },
  { key: 'comfort', label: 'Comfort', icon: '🛋️' },
  { key: 'fun', label: 'Fun', icon: '📺' },
  { key: 'skills', label: 'Skills', icon: '📚' },
  { key: 'power', label: 'Power', icon: '🔌' },
  { key: 'security', label: 'Security', icon: '📹' },
  { key: 'outdoor', label: 'Compound', icon: '🌳' },
  { key: 'decor', label: 'Decor', icon: '🪴' },
];

export interface ItemDef {
  type: string;
  name: string;
  icon: string;
  category: Category;
  price: number;
  /** Footprint in tiles at rotation 0 (w along x, d along z). */
  w: number;
  d: number;
  /** Floor items (rugs, mats) can sit under objects and can be walked on. */
  layer: 'floor' | 'object';
  /** Defaults to true for objects. */
  blocks?: boolean;
  /** Cannot be sold or moved. */
  fixed?: boolean;
  /** Local-space offset where the avatar sits / lies. Front of every model faces +z. */
  seat?: { y: number; z: number };
  bed?: { y: number; z: number };
  actions: ActionDef[];
  /** Big-man pieces get a gold badge in the catalogue. */
  luxury?: boolean;
  /** CCTV: watches a cone in front of it and catches burglars who walk in (src/game/security.ts). */
  camera?: boolean;
  /** Needs open sky: only goes in the compound or side yard, never under the roof. */
  outdoorOnly?: boolean;
  /** Optional .glb to use instead of the built-in primitive model. Drop files in /public/models. */
  glb?: string;
}

const list: ItemDef[] = [

  // Luxury — big-man living
  {
    type: 'leather_sectional', name: 'Italian Leather Sectional', icon: '🛋️', category: 'luxury', price: 3_500_000, w: 3, d: 2, layer: 'object', luxury: true,
    seat: { y: 0.45, z: -0.4 },
    actions: [
      { id: 'lounge', label: 'Lounge in style', icon: '😎', minutes: 60, pose: 'sit', perHour: { fun: 22, energy: 8 } },
      { id: 'host_guests', label: 'Host big-man guests', icon: '🥂', minutes: 120, cost: 25_000, pose: 'sit', perHour: { social: 45, fun: 25 } },
      { id: 'nap', label: 'Nap on the leather', icon: '💤', minutes: 60, fast: true, pose: 'sit', perHour: { energy: 12, fun: 0, social: 0 } },
    ],
  },
  {
    type: 'gold_throne', name: 'Gold Throne Chair', icon: '👑', category: 'luxury', price: 2_200_000, w: 1, d: 1, layer: 'object', luxury: true,
    seat: { y: 0.5, z: 0.05 },
    actions: [
      { id: 'sit_throne', label: 'Sit like an Emir', icon: '👑', minutes: 30, pose: 'sit', perHour: { fun: 40, social: 10 } },
      { id: 'receive_visitors', label: 'Receive visitors', icon: '🙇🏾', minutes: 60, pose: 'sit', perHour: { social: 50, fun: 15 } },
    ],
  },
  {
    type: 'massage_chair', name: 'Shiatsu Massage Chair', icon: '💆🏾', category: 'luxury', price: 1_600_000, w: 1, d: 1, layer: 'object', luxury: true,
    seat: { y: 0.45, z: 0.05 },
    actions: [
      { id: 'massage', label: 'Full-body massage', icon: '💆🏾', minutes: 45, pose: 'sit', needsPower: true, perHour: { energy: 30, fun: 25, hygiene: 2 } },
    ],
  },
  {
    type: 'grand_piano', name: 'Steinway-style Grand Piano', icon: '🎹', category: 'luxury', price: 9_500_000, w: 2, d: 2, layer: 'object', luxury: true,
    actions: [
      { id: 'play_piano', label: 'Play the piano', icon: '🎹', minutes: 60, animation: 'perform', knowledgePerHour: 0.2, perHour: { fun: 30, energy: -2 } },
      { id: 'recital', label: 'Host a piano recital', icon: '🎼', minutes: 90, cost: 15_000, animation: 'perform', perHour: { social: 40, fun: 30 } },
    ],
  },
  {
    type: 'home_cinema', name: '110" Home Cinema', icon: '🎞️', category: 'luxury', price: 7_800_000, w: 3, d: 1, layer: 'object', luxury: true,
    actions: [
      { id: 'blockbuster', label: 'Watch a blockbuster', icon: '🍿', minutes: 120, needsPower: true, untilFull: 'fun', perHour: { fun: 45, energy: 3 } },
      { id: 'movie_night', label: 'Movie night with friends', icon: '🎬', minutes: 150, needsPower: true, cost: 8_000, perHour: { fun: 35, social: 35 } },
      { id: 'champions_league', label: 'Watch Champions League', icon: '⚽', minutes: 120, needsPower: true, perHour: { fun: 40, social: 10 } },
    ],
  },
  {
    type: 'aquarium', name: 'Wall Aquarium', icon: '🐠', category: 'luxury', price: 2_800_000, w: 2, d: 1, layer: 'object', luxury: true,
    actions: [
      { id: 'watch_fish', label: 'Watch the fish', icon: '🐠', minutes: 30, needsPower: true, perHour: { fun: 25, energy: 10 } },
      { id: 'feed_fish', label: 'Feed the fish', icon: '🫧', minutes: 10, cost: 1_500, perHour: { fun: 20 } },
    ],
  },
  {
    type: 'marble_bar', name: 'Marble Champagne Bar', icon: '🍾', category: 'luxury', price: 4_500_000, w: 2, d: 1, layer: 'object', luxury: true,
    actions: [
      { id: 'pop_champagne', label: 'Pop champagne', icon: '🍾', minutes: 30, cost: 65_000, perHour: { fun: 80, social: 30, bladder: -20 } },
      { id: 'mocktail', label: 'Mix chapman', icon: '🍹', minutes: 20, cost: 3_500, perHour: { fun: 35, hunger: 15, bladder: -20 } },
      { id: 'bar_party', label: 'Throw a house party', icon: '🪩', minutes: 180, cost: 150_000, perHour: { social: 45, fun: 40, energy: -6 } },
    ],
  },
  {
    type: 'snooker', name: 'Snooker Table', icon: '🎱', category: 'luxury', price: 3_200_000, w: 3, d: 2, layer: 'object', luxury: true,
    actions: [
      { id: 'practice_snooker', label: 'Practise snooker', icon: '🎱', minutes: 60, animation: 'perform', perHour: { fun: 30 } },
      { id: 'snooker_match', label: 'Play friends for money', icon: '💵', minutes: 90, cost: 10_000, animation: 'perform', perHour: { fun: 35, social: 35 } },
    ],
  },
  {
    type: 'arcade', name: 'Retro Arcade Cabinet', icon: '🕹️', category: 'luxury', price: 1_200_000, w: 1, d: 1, layer: 'object', luxury: true,
    actions: [{ id: 'arcade', label: 'Play arcade games', icon: '🕹️', minutes: 45, needsPower: true, untilFull: 'fun', animation: 'type', perHour: { fun: 45 } }],
  },
  {
    type: 'home_gym', name: 'Home Gym (Treadmill + Weights)', icon: '🏋🏾', category: 'luxury', price: 2_600_000, w: 2, d: 1, layer: 'object', luxury: true,
    actions: [
      { id: 'workout', label: 'Work out', icon: '🏋🏾', minutes: 60, animation: 'exercise', perHour: { fun: 12, energy: -10, hygiene: -15, hunger: -6 } },
      { id: 'treadmill_run', label: 'Run on the treadmill', icon: '🏃🏾', minutes: 30, needsPower: true, animation: 'exercise', perHour: { fun: 15, energy: -12, hygiene: -20 } },
    ],
  },
  {
    type: 'jacuzzi', name: 'Jacuzzi Spa Tub', icon: '🛁', category: 'luxury', price: 5_500_000, w: 2, d: 2, layer: 'object', luxury: true,
    seat: { y: 0.3, z: 0.2 },
    actions: [
      { id: 'soak', label: 'Soak in the jacuzzi', icon: '🛁', minutes: 45, pose: 'sit', needsPower: true, untilFull: 'hygiene', waterUse: 20, perHour: { hygiene: 200, fun: 35, energy: 12 } },
      { id: 'spa_date', label: 'Spa date', icon: '🥂', minutes: 60, needsPower: true, pose: 'sit', cost: 20_000, waterUse: 20, perHour: { hygiene: 120, social: 40, fun: 35 } },
    ],
  },
  {
    type: 'gold_toilet', name: 'Gold-Plated WC', icon: '🚽', category: 'luxury', price: 1_800_000, w: 1, d: 1, layer: 'object', luxury: true,
    actions: [{ id: 'use', label: 'Use the golden throne', icon: '✨', minutes: 10, untilFull: 'bladder', perHour: { bladder: 650, fun: 30 } }],
  },
  {
    type: 'smart_fridge', name: 'Double-Door Smart Fridge', icon: '🧊', category: 'luxury', price: 2_400_000, w: 2, d: 1, layer: 'object', luxury: true,
    actions: [
      { id: 'platter', label: 'Grab a seafood platter', icon: '🦐', minutes: 20, cost: 6_000, untilFull: 'hunger', perHour: { hunger: 120, fun: 20 } },
      { id: 'smoothie', label: 'Blend a smoothie', icon: '🥤', minutes: 10, cost: 1_500, needsPower: true, perHour: { hunger: 40, fun: 25, bladder: -25 } },
    ],
  },
  {
    type: 'chef_island', name: "Chef's Marble Island", icon: '🔪', category: 'luxury', price: 4_200_000, w: 2, d: 1, layer: 'object', luxury: true,
    actions: [
      { id: 'pepper_soup', label: 'Cook goat pepper soup', icon: '🍲', minutes: 50, cost: 5_000, untilFull: 'hunger', cookingPerHour: 0.6, perHour: { hunger: 75, fun: 10 } },
      { id: 'asun', label: 'Make asun & fried rice', icon: '🍛', minutes: 60, cost: 7_000, untilFull: 'hunger', cookingPerHour: 0.7, perHour: { hunger: 70, fun: 12 } },
      { id: 'private_chef', label: 'Hire a private chef', icon: '👨🏾‍🍳', minutes: 40, cost: 35_000, perHour: { hunger: 140, fun: 25, social: 10 } },
    ],
  },
  {
    type: 'swimming_pool', name: 'Swimming Pool', icon: '🏊🏾', category: 'luxury', price: 15_000_000, w: 3, d: 3, layer: 'object', luxury: true,
    seat: { y: 0.1, z: 0 },
    actions: [
      { id: 'swim', label: 'Swim laps', icon: '🏊🏾', minutes: 45, pose: 'sit', perHour: { fun: 35, hygiene: 40, energy: -8 } },
      { id: 'pool_party', label: 'Throw a pool party', icon: '🎉', minutes: 180, needsPower: true, cost: 200_000, pose: 'sit', perHour: { social: 50, fun: 45, energy: -5 } },
    ],
  },
  {
    type: 'fountain', name: 'Marble Fountain', icon: '⛲', category: 'luxury', price: 3_800_000, w: 2, d: 2, layer: 'object', luxury: true,
    actions: [{ id: 'admire', label: 'Admire your fountain', icon: '⛲', minutes: 20, needsPower: true, perHour: { fun: 30, energy: 6 } }],
  },
  {
    type: 'chandelier_lamp', name: 'Crystal Floor Chandelier', icon: '💡', category: 'luxury', price: 1_400_000, w: 1, d: 1, layer: 'object', luxury: true, actions: [],
  },
  {
    type: 'bronze_head', name: 'Bronze Royal Head Sculpture', icon: '🗿', category: 'luxury', price: 6_000_000, w: 1, d: 1, layer: 'object', luxury: true,
    actions: [{ id: 'admire_art', label: 'Admire the bronze', icon: '🖼️', minutes: 15, knowledgePerHour: 0.3, perHour: { fun: 20 } }],
  },
  {
    type: 'gilded_mirror', name: 'Gilded Standing Mirror', icon: '🪞', category: 'luxury', price: 900_000, w: 1, d: 1, layer: 'object', luxury: true,
    actions: [{ id: 'mirror_check', label: 'Check your drip', icon: '😎', minutes: 10, perHour: { fun: 40 } }],
  },
  {
    type: 'ming_vase', name: 'Ming-style Vase', icon: '🏺', category: 'luxury', price: 2_500_000, w: 1, d: 1, layer: 'object', luxury: true, actions: [],
  },
  {
    type: 'velvet_rug', name: 'Velvet Gold-Trim Rug', icon: '🟨', category: 'luxury', price: 750_000, w: 3, d: 2, layer: 'floor', blocks: false, luxury: true, actions: [],
  },
  {
    type: 'wine_cellar', name: 'Glass Wine Cellar', icon: '🍷', category: 'luxury', price: 3_000_000, w: 1, d: 1, layer: 'object', luxury: true,
    actions: [
      { id: 'wine_tasting', label: 'Taste a vintage', icon: '🍷', minutes: 30, needsPower: true, cost: 45_000, perHour: { fun: 55, social: 15, bladder: -15 } },
      { id: 'wine_dinner', label: 'Host a wine dinner', icon: '🥂', minutes: 120, needsPower: true, cost: 120_000, perHour: { social: 50, fun: 35, hunger: 25 } },
    ],
  },
  {
    type: 'cigar_lounge', name: 'Cigar & Whisky Lounge Set', icon: '🥃', category: 'luxury', price: 4_800_000, w: 2, d: 2, layer: 'object', luxury: true,
    seat: { y: 0.45, z: 0 },
    actions: [
      { id: 'whisky', label: 'Sip aged whisky', icon: '🥃', minutes: 45, cost: 40_000, pose: 'sit', perHour: { fun: 45, social: 20, bladder: -15 } },
      { id: 'big_man_talk', label: 'Talk business with big men', icon: '🤝🏾', minutes: 90, cost: 60_000, pose: 'sit', perHour: { social: 55, fun: 25 } },
    ],
  },
  {
    type: 'golden_bed', name: 'Gold-Leaf Emperor Bed', icon: '🛏️', category: 'luxury', price: 8_500_000, w: 2, d: 3, layer: 'object', luxury: true,
    bed: { y: 0.7, z: 0.9 },
    actions: [
      { id: 'sleep', label: 'Sleep like an emperor', icon: '😴', minutes: 360, pose: 'lie', untilFull: 'energy', perHour: { energy: 24, hunger: -2, bladder: -3, fun: 2, social: 0, hygiene: -1 } },
      { id: 'nap', label: 'Silk nap', icon: '💤', minutes: 60, fast: true, pose: 'lie', perHour: { energy: 18, fun: 2, social: 0 } },
    ],
  },
  {
    type: 'sauna', name: 'Cedar Steam Sauna', icon: '🧖🏾', category: 'luxury', price: 6_500_000, w: 2, d: 2, layer: 'object', luxury: true,
    seat: { y: 0.4, z: 0 },
    actions: [
      { id: 'steam', label: 'Sweat it out', icon: '🧖🏾', minutes: 40, pose: 'sit', needsPower: true, waterUse: 10, perHour: { hygiene: 60, energy: 18, fun: 25 } },
    ],
  },
  {
    type: 'trophy_cabinet', name: 'Trophy & Award Cabinet', icon: '🏆', category: 'luxury', price: 1_900_000, w: 2, d: 1, layer: 'object', luxury: true,
    actions: [{ id: 'admire_trophies', label: 'Admire your awards', icon: '🏆', minutes: 10, perHour: { fun: 45 } }],
  },
  {
    type: 'lion_statue', name: 'Gold Lion Statue', icon: '🦁', category: 'luxury', price: 5_200_000, w: 1, d: 1, layer: 'object', luxury: true, actions: [],
  },
  // Everyday extras
  {
    type: 'microwave', name: 'Microwave Oven', icon: '📟', category: 'kitchen', price: 95_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'reheat', label: 'Reheat leftovers', icon: '🍲', minutes: 10, needsPower: true, cost: 1_000, untilFull: 'hunger', perHour: { hunger: 110, fun: 4 } }],
  },
  {
    type: 'blender', name: 'Blender Station', icon: '🥤', category: 'kitchen', price: 60_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'zobo', label: 'Blend zobo & tigernut drink', icon: '🥤', minutes: 10, needsPower: true, cost: 1_200, perHour: { hunger: 35, fun: 20, bladder: -25 } }],
  },
  {
    type: 'gas_cooker', name: 'Gas Cooker (4 burner)', icon: '🔥', category: 'kitchen', price: 220_000, w: 2, d: 1, layer: 'object',
    actions: [
      { id: 'jollof', label: 'Cook jollof rice', icon: '🍛', minutes: 60, cost: 4_500, untilFull: 'hunger', cookingPerHour: 0.5, perHour: { hunger: 70, fun: 8 } },
      { id: 'fry_plantain', label: 'Fry plantain & egg', icon: '🍳', minutes: 25, cost: 1_800, untilFull: 'hunger', cookingPerHour: 0.3, perHour: { hunger: 100, fun: 5 } },
    ],
  },
  {
    type: 'recliner', name: 'Reclining Armchair', icon: '🛋️', category: 'comfort', price: 340_000, w: 1, d: 1, layer: 'object',
    seat: { y: 0.45, z: 0 },
    actions: [
      { id: 'recline', label: 'Kick back', icon: '😌', minutes: 45, pose: 'sit', perHour: { energy: 16, fun: 12 } },
      { id: 'recline_nap', label: 'Afternoon snooze', icon: '💤', minutes: 60, fast: true, pose: 'sit', perHour: { energy: 14 } },
    ],
  },
  {
    type: 'xbox', name: 'Xbox Series X', icon: '🎮', category: 'fun', price: 650_000, w: 1, d: 1, layer: 'object',
    seat: { y: 0.45, z: 0.6 },
    actions: [
      { id: 'play_xbox', label: 'Play Call of Duty', icon: '🎮', minutes: 60, pose: 'sit', needsPower: true, perHour: { fun: 38, energy: -4 } },
      { id: 'xbox_friends', label: 'Gaming night with friends', icon: '🕹️', minutes: 120, pose: 'sit', needsPower: true, cost: 3_000, perHour: { fun: 32, social: 32, energy: -5 } },
    ],
  },
  {
    type: 'karaoke', name: 'Karaoke Machine', icon: '🎤', category: 'fun', price: 180_000, w: 1, d: 1, layer: 'object',
    actions: [
      { id: 'sing', label: 'Sing your heart out', icon: '🎤', minutes: 30, needsPower: true, animation: 'perform', perHour: { fun: 45, social: 10 } },
      { id: 'karaoke_night', label: 'Karaoke night', icon: '🎶', minutes: 120, needsPower: true, cost: 6_000, animation: 'perform', perHour: { fun: 35, social: 40 } },
    ],
  },
  {
    type: 'dartboard', name: 'Dartboard', icon: '🎯', category: 'fun', price: 25_000, w: 1, d: 1, layer: 'object', blocks: false,
    actions: [{ id: 'darts', label: 'Throw darts', icon: '🎯', minutes: 20, animation: 'perform', perHour: { fun: 28 } }],
  },
  {
    type: 'ankara_rug', name: 'Ankara Print Rug', icon: '🟧', category: 'decor', price: 70_000, w: 2, d: 2, layer: 'floor', blocks: false, actions: [],
  },
  {
    type: 'wall_clock', name: 'Standing Grandfather Clock', icon: '🕰️', category: 'decor', price: 420_000, w: 1, d: 1, layer: 'object', actions: [],
  },
  {
    type: 'water_tank', name: 'Overhead Water Tank', icon: '🛢️', category: 'outdoor', price: 280_000, w: 1, d: 1, layer: 'object', actions: [],
  },
  // Sleep
  {
    type: 'bed_foam', name: 'Vitafoam Bed', icon: '🛏️', category: 'sleep', price: 120_000, w: 2, d: 3, layer: 'object',
    bed: { y: 0.55, z: 0.9 },
    actions: [
      { id: 'sleep', label: 'Sleep', icon: '😴', minutes: 480, pose: 'lie', untilFull: 'energy', perHour: { energy: 13, hunger: -2, bladder: -3, fun: 0, social: 0, hygiene: -1 } },
      { id: 'nap', label: 'Short nap', icon: '💤', minutes: 90, fast: true, pose: 'lie', perHour: { energy: 10, fun: 0, social: 0 } },
    ],
  },
  {
    type: 'bed_royal', name: 'Royal Four-Poster Bed', icon: '👑', category: 'sleep', price: 650_000, w: 2, d: 3, layer: 'object',
    bed: { y: 0.65, z: 0.9 },
    actions: [
      { id: 'sleep', label: 'Sleep like a king', icon: '😴', minutes: 420, pose: 'lie', untilFull: 'energy', perHour: { energy: 18, hunger: -2, bladder: -3, fun: 1, social: 0, hygiene: -1 } },
      { id: 'nap', label: 'Short nap', icon: '💤', minutes: 60, fast: true, pose: 'lie', perHour: { energy: 16, fun: 1, social: 0 } },
    ],
  },

  // Kitchen
  {
    type: 'fridge', name: 'Fridge', icon: '🧊', category: 'kitchen', price: 350_000, w: 1, d: 1, layer: 'object',
    actions: [
      { id: 'snack', label: 'Grab a snack', icon: '🥪', minutes: 15, cost: 800, perHour: { hunger: 50 } },
      { id: 'zobo', label: 'Drink cold zobo', icon: '🥤', minutes: 10, cost: 300, perHour: { hunger: 20, fun: 30, bladder: -30 } },
    ],
  },
  {
    type: 'washing_machine', name: 'Washing Machine', icon: '🧺', category: 'kitchen', price: 280_000, w: 1, d: 1, layer: 'object',
    actions: [
      { id: 'wash', label: 'Wash clothes', icon: '👕', minutes: 45, cost: 500, needsPower: true, perHour: { hygiene: 10, fun: -2 } },
    ],
  },
  {
    type: 'cooker', name: 'Gas Cooker', icon: '🍳', category: 'kitchen', price: 120_000, w: 1, d: 1, layer: 'object',
    actions: [
      { id: 'jollof', label: 'Cook jollof rice', icon: '🍚', minutes: 60, cost: 3_000, untilFull: 'hunger', cookingPerHour: 0.3, perHour: { hunger: 55 } },
      { id: 'tuwo', label: 'Make tuwo & miyan kuka', icon: '🥣', minutes: 75, cost: 2_500, untilFull: 'hunger', cookingPerHour: 0.35, perHour: { hunger: 50, fun: 2 } },
      { id: 'masa', label: 'Fry masa', icon: '🫓', minutes: 45, cost: 1_500, cookingPerHour: 0.25, perHour: { hunger: 45 } },
    ],
  },
  { type: 'counter', name: 'Kitchen Counter', icon: '🧺', category: 'kitchen', price: 60_000, w: 2, d: 1, layer: 'object', actions: [] },
  {
    type: 'dining', name: 'Dining Table', icon: '🍽️', category: 'kitchen', price: 180_000, w: 2, d: 2, layer: 'object',
    seat: { y: 0.45, z: 0.75 },
    actions: [
      { id: 'meal', label: 'Eat leftover food', icon: '🍲', minutes: 30, cost: 1_000, pose: 'sit', perHour: { hunger: 60, fun: 3 } },
      { id: 'tea', label: 'Drink tea & bread', icon: '☕', minutes: 20, cost: 600, pose: 'sit', perHour: { hunger: 35, fun: 6 } },
      { id: 'family_dinner', label: 'Host family dinner', icon: '🥘', minutes: 90, cost: 4_500, pose: 'sit', perHour: { hunger: 35, social: 30, fun: 18 } },
    ],
  },

  // Bath
  {
    type: 'toilet', name: 'WC Toilet', icon: '🚽', category: 'bath', price: 45_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'use', label: 'Use toilet', icon: '🚽', minutes: 10, untilFull: 'bladder', perHour: { bladder: 650 } }],
  },
  {
    type: 'shower', name: 'Shower', icon: '🚿', category: 'bath', price: 90_000, w: 1, d: 1, layer: 'object', blocks: false,
    actions: [{ id: 'shower', label: 'Take a shower', icon: '🚿', minutes: 20, untilFull: 'hygiene', waterUse: 12, perHour: { hygiene: 320, fun: 6 } }],
  },
  {
    type: 'bucket', name: 'Bucket & Bowl', icon: '🪣', category: 'bath', price: 5_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'bath', label: 'Bucket bath', icon: '🪣', minutes: 25, untilFull: 'hygiene', waterUse: 8, perHour: { hygiene: 220 } }],
  },
  {
    type: 'water_heater', name: 'Electric Water Heater', icon: '♨️', category: 'bath', price: 85_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'hot_bucket', label: 'Hot bucket bath', icon: '♨️', minutes: 25, needsPower: true, untilFull: 'hygiene', waterUse: 6, perHour: { hygiene: 260, energy: 8, fun: 6 } }],
  },
  {
    type: 'hot_shower', name: 'Hot Shower Cubicle', icon: '🚿', category: 'bath', price: 260_000, w: 1, d: 1, layer: 'object', blocks: false,
    actions: [{ id: 'hot_shower', label: 'Take a hot shower', icon: '♨️', minutes: 20, needsPower: true, untilFull: 'hygiene', waterUse: 12, perHour: { hygiene: 380, energy: 10, fun: 12 } }],
  },
  {
    type: 'bathtub', name: 'Bathtub', icon: '🛁', category: 'bath', price: 450_000, w: 2, d: 1, layer: 'object',
    seat: { y: 0.3, z: 0 },
    actions: [{ id: 'tub_soak', label: 'Soak in the tub', icon: '🛁', minutes: 40, pose: 'sit', untilFull: 'hygiene', waterUse: 18, perHour: { hygiene: 260, fun: 18, energy: 12 } }],
  },
  {
    type: 'corner_jacuzzi', name: 'Corner Jacuzzi', icon: '🫧', category: 'bath', price: 1_900_000, w: 2, d: 2, layer: 'object',
    seat: { y: 0.3, z: 0 },
    actions: [
      { id: 'jets', label: 'Switch on the jets', icon: '🫧', minutes: 40, pose: 'sit', needsPower: true, untilFull: 'hygiene', waterUse: 20, perHour: { hygiene: 220, fun: 30, energy: 14 } },
      { id: 'tub_chill', label: 'Chill with a friend', icon: '🥂', minutes: 50, pose: 'sit', needsPower: true, cost: 5_000, waterUse: 20, perHour: { hygiene: 120, social: 38, fun: 28 } },
    ],
  },
  {
    type: 'sink', name: 'Washbasin', icon: '🚰', category: 'bath', price: 55_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'wash_up', label: 'Wash face & hands', icon: '🚰', minutes: 5, untilFull: 'hygiene', waterUse: 2, perHour: { hygiene: 240 } }],
  },
  {
    type: 'bidet_toilet', name: 'Bidet Toilet', icon: '🚽', category: 'bath', price: 160_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'use_bidet', label: 'Use bidet toilet', icon: '🚽', minutes: 10, untilFull: 'bladder', waterUse: 1, perHour: { bladder: 650, hygiene: 40 } }],
  },
  {
    type: 'squat_toilet', name: 'Squat Pan', icon: '🚽', category: 'bath', price: 18_000, w: 1, d: 1, layer: 'floor',
    actions: [{ id: 'use_squat', label: 'Use squat pan', icon: '🚽', minutes: 10, untilFull: 'bladder', perHour: { bladder: 600 } }],
  },
  {
    type: 'bath_mat', name: 'Bath Mat', icon: '🟦', category: 'bath', price: 12_000, w: 1, d: 1, layer: 'floor',
    actions: [],
  },
  {
    type: 'towel_rail', name: 'Towel Rail', icon: '🧺', category: 'bath', price: 25_000, w: 1, d: 1, layer: 'object', blocks: false,
    actions: [],
  },

  // Comfort
  {
    type: 'sofa', name: '3-Seater Sofa', icon: '🛋️', category: 'comfort', price: 280_000, w: 3, d: 1, layer: 'object',
    seat: { y: 0.45, z: 0.05 },
    actions: [
      { id: 'relax', label: 'Relax', icon: '😌', minutes: 60, pose: 'sit', perHour: { fun: 10, energy: 3 } },
      { id: 'nap', label: 'Nap on the sofa', icon: '💤', minutes: 60, fast: true, pose: 'sit', perHour: { energy: 7, fun: 0, social: 0 } },
      { id: 'neighbour_gist', label: 'Invite neighbours for gist', icon: '🫖', minutes: 60, cost: 1_000, pose: 'sit', perHour: { social: 32, fun: 18 } },
    ],
  },
  {
    type: 'plastic_chair', name: 'Plastic Chair', icon: '🪑', category: 'comfort', price: 8_000, w: 1, d: 1, layer: 'object',
    seat: { y: 0.42, z: 0 },
    actions: [{ id: 'sit', label: 'Sit & cool off', icon: '😮‍💨', minutes: 30, pose: 'sit', perHour: { fun: 5, energy: 2 } }],
  },
  {
    type: 'aircon', name: 'Split Air Conditioner', icon: '❄️', category: 'comfort', price: 650_000, w: 2, d: 1, layer: 'object', blocks: false,
    actions: [
      { id: 'chill_ac', label: 'Chill in the AC', icon: '❄️', minutes: 60, needsPower: true, perHour: { energy: 12, fun: 15, hygiene: 1 } },
    ],
  },
  {
    type: 'fan', name: 'Standing Fan', icon: '🌬️', category: 'comfort', price: 45_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'cool_fan', label: 'Sit by the fan', icon: '🌬️', minutes: 15, pose: 'stand', needsPower: true, perHour: { energy: 8, fun: 5 } }],
  },

  // Fun
  {
    type: 'tv', name: 'Flat Screen TV', icon: '📺', category: 'fun', price: 250_000, w: 2, d: 1, layer: 'object',
    actions: [
      { id: 'kannywood', label: 'Watch Kannywood', icon: '🎬', minutes: 90, needsPower: true, untilFull: 'fun', perHour: { fun: 28 } },
      { id: 'football', label: 'Watch football', icon: '⚽', minutes: 120, needsPower: true, perHour: { fun: 30, social: 4 } },
    ],
  },
  {
    type: 'desk', name: 'Desk & Laptop', icon: '💻', category: 'fun', price: 400_000, w: 2, d: 1, layer: 'object',
    actions: [
      { id: 'course', label: 'Take online course', icon: '🎓', minutes: 120, needsPower: true, knowledgePerHour: 0.6, perHour: { fun: -3, energy: -4 } },
      { id: 'games', label: 'Play games', icon: '🎮', minutes: 60, needsPower: true, untilFull: 'fun', perHour: { fun: 32 } },
      { id: 'chat', label: 'Chat with friends online', icon: '💬', minutes: 45, needsPower: true, cost: 300, perHour: { social: 40, fun: 8 } },
    ],
  },

  // Skills
  {
    type: 'bookshelf', name: 'Bookshelf', icon: '📚', category: 'skills', price: 70_000, w: 1, d: 1, layer: 'object',
    actions: [
      { id: 'study', label: 'Study', icon: '📖', minutes: 120, knowledgePerHour: 0.35, perHour: { fun: -4, energy: -4 } },
      { id: 'kaduna_history', label: 'Read Kaduna history', icon: '📜', minutes: 90, knowledgePerHour: 0.5, perHour: { fun: 4, social: 2 } },
    ],
  },
  {
    type: 'prayer_mat', name: 'Prayer Mat', icon: '🕌', category: 'skills', price: 7_000, w: 1, d: 1, layer: 'floor', blocks: false,
    actions: [{ id: 'pray', label: 'Pray', icon: '🤲', minutes: 15, perHour: { fun: 25, social: 10 } }],
  },

  // Power
  {
    type: 'generator', name: '"I-Better-Pass-My-Neighbour" Gen', icon: '⛽', category: 'power', price: 280_000, w: 1, d: 1, layer: 'object',
    actions: [
      { id: 'fuel', label: 'Buy fuel & fill (5L)', icon: '⛽', minutes: 5, cost: 6_000, effect: 'fuelGen' },
      { id: 'toggle', label: 'Switch on / off', icon: '🔌', minutes: 2, effect: 'toggleGen' },
    ],
  },
  // Bigger sets carry more of the house and run longer on a tank (game/power.ts GENERATORS).
  {
    type: 'generator_3kva', name: '3.5kVA Petrol Generator', icon: '⛽', category: 'power', price: 950_000, w: 1, d: 1, layer: 'object',
    actions: [
      { id: 'fuel', label: 'Buy fuel & fill (15L)', icon: '⛽', minutes: 5, cost: 18_000, effect: 'fuelGen' },
      { id: 'toggle', label: 'Switch on / off', icon: '🔌', minutes: 2, effect: 'toggleGen' },
    ],
  },
  {
    type: 'generator_10kva', name: '10kVA Diesel Generator', icon: '🛢️', category: 'power', price: 4_500_000, w: 2, d: 1, layer: 'object', outdoorOnly: true,
    actions: [
      { id: 'fuel', label: 'Buy diesel & fill (50L)', icon: '⛽', minutes: 5, cost: 45_000, effect: 'fuelGen' },
      { id: 'toggle', label: 'Switch on / off', icon: '🔌', minutes: 2, effect: 'toggleGen' },
    ],
  },
  {
    type: 'generator_silent', name: '30kVA Soundproof Generator', icon: '🏭', category: 'power', price: 18_000_000, w: 3, d: 2, layer: 'object', outdoorOnly: true, luxury: true,
    actions: [
      { id: 'fuel', label: 'Buy diesel & fill (120L)', icon: '⛽', minutes: 5, cost: 90_000, effect: 'fuelGen' },
      { id: 'toggle', label: 'Switch on / off', icon: '🔌', minutes: 2, effect: 'toggleGen' },
    ],
  },
  // Takes the high voltage when NEPA brings light back, so nothing in the house blows (game/breakdowns.ts).
  { type: 'stabilizer', name: 'Voltage Stabilizer', icon: '🔌', category: 'power', price: 85_000, w: 1, d: 1, layer: 'object', actions: [] },
  { type: 'cctv', name: 'CCTV Camera', icon: '📹', category: 'security', price: 150_000, w: 1, d: 1, layer: 'object', blocks: false, camera: true, actions: [] },
  { type: 'solar', name: 'Solar Panel + Inverter', icon: '☀️', category: 'power', price: 1_800_000, w: 2, d: 2, layer: 'object', actions: [] },
  { type: 'starlink', name: 'Starlink Dish', icon: '📡', category: 'outdoor', price: 590_000, w: 1, d: 1, layer: 'object', outdoorOnly: true, actions: [] },

  // Compound
  {
    type: 'mango_tree', name: 'Mango Tree', icon: '🥭', category: 'outdoor', price: 25_000, w: 1, d: 1, layer: 'object',
    actions: [
      { id: 'pluck', label: 'Pluck mango', icon: '🥭', minutes: 10, perHour: { hunger: 90, fun: 20 } },
      { id: 'share_mango', label: 'Share mango with neighbour', icon: '🤝', minutes: 15, effect: 'goodDeed', perHour: { social: 12, fun: 8 } },
    ],
  },
  {
    type: 'suya_grill', name: 'Suya Grill', icon: '🍢', category: 'outdoor', price: 95_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'grill', label: 'Grill suya for neighbours', icon: '🍢', minutes: 90, cost: 4_000, perHour: { social: 28, fun: 10, hunger: 15 } }],
  },
  {
    type: 'gate', name: 'Compound Gate', icon: '🚪', category: 'outdoor', price: 0, w: 1, d: 1, layer: 'object', blocks: false, fixed: true,
    actions: [
      { id: 'town', label: 'Go out to town', icon: '🗺️', minutes: 0, effect: 'goCity' },
      { id: 'work', label: 'Go to work', icon: '💼', minutes: 0, pose: 'hidden', effect: 'work' },
      { id: 'stroll', label: 'Stroll round the street', icon: '🚶🏾', minutes: 60, pose: 'hidden', perHour: { fun: 14, social: 18, energy: -5 } },
      { id: 'mosque', label: 'Go to Jumaʼat / church', icon: '🛐', minutes: 90, pose: 'hidden', perHour: { social: 25, fun: 12 } },
      { id: 'feed_ram', label: 'Feed your Sallah ram', icon: '🌾', minutes: 20, cost: 500, pose: 'stand', effect: 'feedRam', perHour: { fun: 5 } },
      { id: 'share_ram', label: 'Share Sallah meat with neighbours', icon: '🍖', minutes: 60, pose: 'stand', effect: 'shareRam', perHour: { social: 45, fun: 24 } },
    ],
  },

  // Decor
  { type: 'rug', name: 'Persian Rug', icon: '🟥', category: 'decor', price: 30_000, w: 2, d: 2, layer: 'floor', blocks: false, actions: [] },
  { type: 'plant', name: 'Potted Plant', icon: '🪴', category: 'decor', price: 12_000, w: 1, d: 1, layer: 'object', actions: [] },

  // More for the house
  {
    type: 'bed_mat', name: 'Raffia Sleeping Mat', icon: '🧺', category: 'sleep', price: 6_000, w: 1, d: 2, layer: 'object', blocks: false,
    bed: { y: 0.08, z: 0.3 },
    actions: [
      { id: 'sleep', label: 'Sleep on the mat', icon: '😴', minutes: 480, pose: 'lie', untilFull: 'energy', perHour: { energy: 8, hunger: -2, bladder: -3, fun: 0, social: 0, hygiene: -2 } },
      { id: 'nap', label: 'Short nap', icon: '💤', minutes: 90, fast: true, pose: 'lie', perHour: { energy: 6, fun: 0, social: 0 } },
    ],
  },
  {
    type: 'bed_single', name: 'Single Bed', icon: '🛏️', category: 'sleep', price: 55_000, w: 1, d: 2, layer: 'object',
    bed: { y: 0.5, z: 0.45 },
    actions: [
      { id: 'sleep', label: 'Sleep', icon: '😴', minutes: 480, pose: 'lie', untilFull: 'energy', perHour: { energy: 11, hunger: -2, bladder: -3, fun: 0, social: 0, hygiene: -1 } },
      { id: 'nap', label: 'Short nap', icon: '💤', minutes: 90, fast: true, pose: 'lie', perHour: { energy: 8, fun: 0, social: 0 } },
    ],
  },
  {
    type: 'wardrobe', name: 'Wardrobe', icon: '🚪', category: 'sleep', price: 150_000, w: 2, d: 1, layer: 'object',
    actions: [{ id: 'dress_up', label: 'Try on outfits', icon: '👗', minutes: 20, perHour: { fun: 30, social: 4 } }],
  },
  { type: 'nightstand', name: 'Bedside Table', icon: '🕯️', category: 'sleep', price: 25_000, w: 1, d: 1, layer: 'object', actions: [] },
  {
    type: 'freezer', name: 'Chest Freezer', icon: '🧊', category: 'kitchen', price: 300_000, w: 2, d: 1, layer: 'object',
    actions: [{ id: 'frozen_meal', label: 'Cook frozen chicken', icon: '🍗', minutes: 40, cost: 3_500, needsPower: true, untilFull: 'hunger', cookingPerHour: 0.2, perHour: { hunger: 65 } }],
  },
  {
    type: 'water_dispenser', name: 'Water Dispenser', icon: '🚰', category: 'kitchen', price: 90_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'drink_water', label: 'Drink cold water', icon: '🥛', minutes: 5, needsPower: true, perHour: { hunger: 20, fun: 6, bladder: -40 } }],
  },
  {
    type: 'mortar', name: 'Wooden Mortar & Pestle', icon: '🥣', category: 'kitchen', price: 18_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'pound_yam', label: 'Pound yam', icon: '🍠', minutes: 40, cost: 2_000, animation: 'exercise', untilFull: 'hunger', cookingPerHour: 0.4, perHour: { hunger: 40, energy: -6, hygiene: -4 } }],
  },
  {
    type: 'armchair', name: 'Armchair', icon: '🪑', category: 'comfort', price: 110_000, w: 1, d: 1, layer: 'object',
    seat: { y: 0.45, z: 0.05 },
    actions: [
      { id: 'relax', label: 'Relax', icon: '😌', minutes: 60, pose: 'sit', perHour: { fun: 9, energy: 4 } },
      { id: 'read_chair', label: 'Read a novel', icon: '📖', minutes: 60, pose: 'sit', knowledgePerHour: 0.2, perHour: { fun: 10, energy: 2 } },
    ],
  },
  {
    type: 'ps5', name: 'PlayStation & Gaming Chair', icon: '🎮', category: 'fun', price: 750_000, w: 2, d: 1, layer: 'object',
    seat: { y: 0.45, z: 0.6 },
    actions: [
      { id: 'fifa', label: 'Play FIFA', icon: '⚽', minutes: 60, pose: 'sit', needsPower: true, untilFull: 'fun', perHour: { fun: 40, energy: -3 } },
      { id: 'fifa_friends', label: 'FIFA with friends', icon: '🏆', minutes: 90, pose: 'sit', needsPower: true, cost: 2_000, perHour: { fun: 35, social: 32, energy: -3 } },
    ],
  },
  {
    type: 'speaker', name: 'Hi-Fi Speaker', icon: '🔊', category: 'fun', price: 220_000, w: 1, d: 1, layer: 'object',
    actions: [
      { id: 'play_music', label: 'Play music', icon: '🎶', minutes: 45, needsPower: true, perHour: { fun: 30, energy: 2 } },
      { id: 'change_station', label: 'Change station', icon: '📻', minutes: 0, needsPower: true, perHour: {} },
      { id: 'house_dance', label: 'Dance round the house', icon: '💃🏾', minutes: 40, needsPower: true, animation: 'exercise', perHour: { fun: 40, social: 6, energy: -8, hygiene: -5 } },
    ],
  },
  {
    type: 'ludo', name: 'Ludo & Ayo Table', icon: '🎲', category: 'fun', price: 35_000, w: 1, d: 1, layer: 'object',
    seat: { y: 0.45, z: 0.55 },
    actions: [
      { id: 'play_ludo', label: 'Play ludo', icon: '🎲', minutes: 45, pose: 'sit', perHour: { fun: 25, social: 20 } },
      { id: 'ludo_neighbours', label: 'Ludo with neighbours', icon: '🤝🏾', minutes: 90, pose: 'sit', cost: 1_000, perHour: { fun: 22, social: 38 } },
    ],
  },
  {
    type: 'sewing_machine', name: 'Sewing Machine', icon: '🧵', category: 'skills', price: 85_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'sew', label: 'Sew a gown', icon: '🧵', minutes: 90, needsPower: true, animation: 'type', knowledgePerHour: 0.25, perHour: { fun: 4, energy: -4 } }],
  },
  {
    type: 'easel', name: 'Painting Easel', icon: '🎨', category: 'skills', price: 60_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'paint_art', label: 'Paint a picture', icon: '🎨', minutes: 90, animation: 'type', cost: 1_500, knowledgePerHour: 0.2, perHour: { fun: 22, energy: -3 } }],
  },
  {
    type: 'drum_kit', name: 'Drum Kit', icon: '🥁', category: 'skills', price: 480_000, w: 2, d: 2, layer: 'object',
    seat: { y: 0.45, z: 0.1 },
    actions: [{ id: 'drum', label: 'Play the drums', icon: '🥁', minutes: 45, pose: 'sit', animation: 'perform', knowledgePerHour: 0.15, perHour: { fun: 35, energy: -8, hygiene: -4 } }],
  },
  {
    type: 'hammock', name: 'Hammock', icon: '🏝️', category: 'outdoor', price: 45_000, w: 2, d: 1, layer: 'object',
    seat: { y: 0.55, z: 0 },
    actions: [{ id: 'hammock_rest', label: 'Swing in the hammock', icon: '😎', minutes: 60, pose: 'sit', perHour: { energy: 10, fun: 15 } }],
  },
  {
    type: 'garden_bench', name: 'Garden Bench', icon: '🪑', category: 'outdoor', price: 65_000, w: 2, d: 1, layer: 'object',
    seat: { y: 0.45, z: 0 },
    actions: [{ id: 'bench_gist', label: 'Sit out for fresh air', icon: '🌤️', minutes: 45, pose: 'sit', perHour: { fun: 10, social: 14, energy: 4 } }],
  },
  {
    type: 'palm_tree', name: 'Coconut Palm', icon: '🌴', category: 'outdoor', price: 60_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'coconut', label: 'Drink fresh coconut', icon: '🥥', minutes: 10, perHour: { hunger: 60, fun: 20, bladder: -20 } }],
  },
  { type: 'flower_bed', name: 'Flower Bed', icon: '🌷', category: 'outdoor', price: 20_000, w: 2, d: 1, layer: 'object', blocks: false, actions: [] },
  { type: 'floor_lamp', name: 'Floor Lamp', icon: '💡', category: 'decor', price: 35_000, w: 1, d: 1, layer: 'object', actions: [] },
  { type: 'coffee_table', name: 'Coffee Table', icon: '☕', category: 'decor', price: 55_000, w: 2, d: 1, layer: 'object', actions: [] },
  { type: 'tv_cabinet', name: 'TV Cabinet', icon: '🗄️', category: 'decor', price: 95_000, w: 2, d: 1, layer: 'object', actions: [] },
  { type: 'safe_box', name: 'Steel Safe', icon: '🔐', category: 'security', price: 260_000, w: 1, d: 1, layer: 'object', actions: [] },

  // Even more for the house: small kitchen pieces
  {
    type: 'air_fryer', name: 'Air Fryer', icon: '🍟', category: 'kitchen', price: 85_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'air_fry', label: 'Air-fry chicken wings', icon: '🍗', minutes: 20, cost: 2_500, needsPower: true, untilFull: 'hunger', cookingPerHour: 0.25, perHour: { hunger: 95, fun: 6 } }],
  },
  {
    type: 'kettle', name: 'Electric Kettle & Tea Tray', icon: '🫖', category: 'kitchen', price: 22_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'brew_tea', label: 'Brew tea & bread', icon: '🍞', minutes: 10, cost: 500, needsPower: true, animation: 'drink', perHour: { hunger: 45, energy: 10, fun: 8 } }],
  },
  {
    type: 'coffee_machine', name: 'Espresso Machine', icon: '☕', category: 'kitchen', price: 420_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'espresso', label: 'Pull an espresso', icon: '☕', minutes: 5, cost: 800, needsPower: true, animation: 'drink', perHour: { energy: 120, fun: 20 } }],
  },
  {
    type: 'kerosene_stove', name: 'Kerosene Stove', icon: '🪔', category: 'kitchen', price: 12_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'indomie', label: 'Cook Indomie & egg', icon: '🍜', minutes: 15, cost: 900, animation: 'stir', untilFull: 'hunger', cookingPerHour: 0.2, perHour: { hunger: 80, hygiene: -3 } }],
  },
  {
    type: 'clay_pot', name: 'Clay Water Pot (Tulu)', icon: '🏺', category: 'kitchen', price: 9_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'cool_water', label: 'Drink cool pot water', icon: '💧', minutes: 5, animation: 'drink', perHour: { hunger: 15, fun: 5 } }],
  },
  {
    type: 'mini_fridge', name: 'Mini Bar Fridge', icon: '🧃', category: 'kitchen', price: 140_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'cold_drink', label: 'Grab a cold malt', icon: '🍺', minutes: 5, cost: 700, needsPower: true, animation: 'drink', perHour: { hunger: 30, fun: 25 } }],
  },
  {
    type: 'popcorn_machine', name: 'Popcorn Machine', icon: '🍿', category: 'fun', price: 160_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'popcorn', label: 'Pop fresh popcorn', icon: '🍿', minutes: 10, cost: 600, needsPower: true, animation: 'eat', perHour: { hunger: 40, fun: 30 } }],
  },

  // Seats and bedroom
  {
    type: 'bean_bag', name: 'Bean Bag', icon: '🫘', category: 'comfort', price: 28_000, w: 1, d: 1, layer: 'object',
    seat: { y: 0.38, z: 0.08 },
    actions: [{ id: 'flop', label: 'Flop on the bean bag', icon: '😌', minutes: 45, pose: 'sit', perHour: { energy: 8, fun: 12 } }],
  },
  {
    type: 'rocking_chair', name: 'Rocking Chair', icon: '🪑', category: 'comfort', price: 75_000, w: 1, d: 1, layer: 'object',
    seat: { y: 0.45, z: 0 },
    actions: [
      { id: 'rock', label: 'Rock and think', icon: '💭', minutes: 45, pose: 'sit', perHour: { energy: 9, fun: 10 } },
      { id: 'tell_tales', label: 'Tell tales by moonlight', icon: '🌙', minutes: 60, pose: 'sit', animation: 'talk', perHour: { social: 28, fun: 14 } },
    ],
  },
  {
    type: 'leather_pouf', name: 'Kano Leather Pouf', icon: '🟤', category: 'comfort', price: 18_000, w: 1, d: 1, layer: 'object',
    seat: { y: 0.36, z: 0 },
    actions: [{ id: 'perch', label: 'Sit on the pouf', icon: '😮‍💨', minutes: 30, pose: 'sit', perHour: { fun: 6, energy: 3 } }],
  },
  {
    type: 'bunk_bed', name: 'Bunk Bed', icon: '🛏️', category: 'sleep', price: 180_000, w: 1, d: 2, layer: 'object',
    bed: { y: 0.45, z: 0.45 },
    actions: [
      { id: 'sleep', label: 'Sleep', icon: '😴', minutes: 480, pose: 'lie', untilFull: 'energy', perHour: { energy: 12, hunger: -2, bladder: -3, fun: 0, social: 0, hygiene: -1 } },
      { id: 'nap', label: 'Short nap', icon: '💤', minutes: 90, fast: true, pose: 'lie', perHour: { energy: 9, fun: 0, social: 0 } },
    ],
  },
  {
    type: 'net_bed', name: 'Bed with Mosquito Net', icon: '🦟', category: 'sleep', price: 260_000, w: 2, d: 3, layer: 'object',
    bed: { y: 0.55, z: 0.9 },
    actions: [
      { id: 'sleep', label: 'Sleep, no mosquito', icon: '😴', minutes: 450, pose: 'lie', untilFull: 'energy', perHour: { energy: 15, hunger: -2, bladder: -3, fun: 0, social: 0, hygiene: -1 } },
      { id: 'nap', label: 'Short nap', icon: '💤', minutes: 75, fast: true, pose: 'lie', perHour: { energy: 12, fun: 0, social: 0 } },
    ],
  },
  {
    type: 'dressing_table', name: 'Dressing Table & Mirror', icon: '💄', category: 'sleep', price: 130_000, w: 2, d: 1, layer: 'object',
    actions: [{ id: 'groom', label: 'Do your face & hair', icon: '💇🏾', minutes: 25, perHour: { hygiene: 60, fun: 18, social: 6 } }],
  },
  {
    type: 'ironing_board', name: 'Ironing Board & Iron', icon: '👔', category: 'bath', price: 30_000, w: 2, d: 1, layer: 'object',
    actions: [{ id: 'iron_clothes', label: 'Iron your clothes', icon: '👔', minutes: 25, needsPower: true, animation: 'clean', perHour: { hygiene: 45, social: 8, energy: -3 } }],
  },

  // Games and exercise
  {
    type: 'table_tennis', name: 'Table Tennis Table', icon: '🏓', category: 'fun', price: 320_000, w: 3, d: 2, layer: 'object',
    actions: [
      { id: 'ping_pong', label: 'Play table tennis', icon: '🏓', minutes: 40, animation: 'exercise', perHour: { fun: 36, energy: -7, hygiene: -4 } },
      { id: 'ping_pong_friends', label: 'Tournament with friends', icon: '🏆', minutes: 90, cost: 2_000, animation: 'exercise', perHour: { fun: 30, social: 34, energy: -7, hygiene: -4 } },
    ],
  },
  {
    type: 'foosball', name: 'Table Football', icon: '⚽', category: 'fun', price: 210_000, w: 2, d: 1, layer: 'object',
    actions: [
      { id: 'foosball', label: 'Play table football', icon: '⚽', minutes: 30, animation: 'perform', perHour: { fun: 34 } },
      { id: 'foosball_friends', label: 'Winner stays on', icon: '🤝🏾', minutes: 60, cost: 1_000, animation: 'perform', perHour: { fun: 28, social: 30 } },
    ],
  },
  {
    type: 'dj_decks', name: 'DJ Decks', icon: '🎧', category: 'fun', price: 900_000, w: 2, d: 1, layer: 'object',
    actions: [
      { id: 'mix_set', label: 'Mix a set', icon: '🎧', minutes: 45, needsPower: true, animation: 'perform', knowledgePerHour: 0.1, perHour: { fun: 40, energy: -4 } },
      { id: 'house_party', label: 'Throw a house party', icon: '🪩', minutes: 150, cost: 15_000, needsPower: true, animation: 'dance', perHour: { fun: 38, social: 45, energy: -8, hygiene: -5 } },
    ],
  },
  {
    type: 'vr_station', name: 'VR Headset Station', icon: '🥽', category: 'fun', price: 520_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'vr_game', label: 'Play VR', icon: '🥽', minutes: 45, needsPower: true, animation: 'exercise', perHour: { fun: 42, energy: -6 } }],
  },
  {
    type: 'punching_bag', name: 'Punching Bag', icon: '🥊', category: 'fun', price: 70_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'hit_bag', label: 'Hit the bag', icon: '🥊', minutes: 30, animation: 'exercise', perHour: { fun: 18, energy: -10, hygiene: -12 } }],
  },
  {
    type: 'exercise_bike', name: 'Exercise Bike', icon: '🚴🏾', category: 'fun', price: 190_000, w: 1, d: 1, layer: 'object',
    seat: { y: 0.83, z: -0.15 },
    actions: [{ id: 'spin_session', label: 'Spin session', icon: '🚴🏾', minutes: 30, pose: 'sit', perHour: { fun: 14, energy: -9, hygiene: -12, hunger: -5 } }],
  },
  {
    type: 'yoga_mat', name: 'Yoga Mat', icon: '🧘🏾', category: 'fun', price: 12_000, w: 1, d: 2, layer: 'floor', blocks: false,
    actions: [{ id: 'stretch', label: 'Stretch & breathe', icon: '🧘🏾', minutes: 30, animation: 'exercise', perHour: { energy: 6, fun: 14 } }],
  },
  {
    type: 'radio', name: 'Transistor Radio', icon: '📻', category: 'fun', price: 9_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'bbc_hausa', label: 'Listen to BBC Hausa', icon: '📻', minutes: 30, knowledgePerHour: 0.1, perHour: { fun: 14, social: 6 } }],
  },
  {
    type: 'gramophone', name: 'Vintage Gramophone', icon: '🎺', category: 'fun', price: 320_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'highlife', label: 'Play highlife records', icon: '🎶', minutes: 40, perHour: { fun: 26, energy: 3 } }],
  },
  {
    type: 'parrot_cage', name: 'Parrot Cage', icon: '🦜', category: 'fun', price: 95_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'talk_parrot', label: 'Teach the parrot to talk', icon: '🦜', minutes: 15, animation: 'talk', perHour: { fun: 26, social: 10 } }],
  },

  // Learning
  {
    type: 'chess_table', name: 'Chess Table', icon: '♟️', category: 'skills', price: 90_000, w: 1, d: 1, layer: 'object',
    seat: { y: 0.42, z: -0.55 },
    actions: [
      { id: 'chess_study', label: 'Study chess openings', icon: '♟️', minutes: 60, pose: 'sit', knowledgePerHour: 0.3, perHour: { fun: 14 } },
      { id: 'chess_neighbour', label: 'Play a neighbour', icon: '🤝🏾', minutes: 60, pose: 'sit', knowledgePerHour: 0.15, perHour: { fun: 20, social: 26 } },
    ],
  },
  {
    type: 'keyboard', name: 'Electric Keyboard', icon: '🎹', category: 'skills', price: 240_000, w: 2, d: 1, layer: 'object',
    seat: { y: 0.46, z: -0.38 },
    actions: [{ id: 'practise_keys', label: 'Practise the keyboard', icon: '🎹', minutes: 45, pose: 'sit', needsPower: true, animation: 'type', knowledgePerHour: 0.2, perHour: { fun: 26, energy: -3 } }],
  },
  {
    type: 'talking_drum', name: 'Talking Drum (Kalangu)', icon: '🪘', category: 'skills', price: 20_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'kalangu', label: 'Beat the kalangu', icon: '🪘', minutes: 30, animation: 'perform', knowledgePerHour: 0.1, perHour: { fun: 28, energy: -4 } }],
  },
  {
    type: 'telescope', name: 'Telescope', icon: '🔭', category: 'skills', price: 380_000, w: 1, d: 1, layer: 'object', outdoorOnly: true,
    actions: [{ id: 'stargaze', label: 'Watch the stars', icon: '✨', minutes: 60, knowledgePerHour: 0.3, perHour: { fun: 24 } }],
  },
  {
    type: 'workbench', name: 'Workbench & Tools', icon: '🛠️', category: 'skills', price: 150_000, w: 2, d: 1, layer: 'object',
    actions: [{ id: 'tinker', label: 'Fix an old radio', icon: '🔧', minutes: 60, animation: 'type', knowledgePerHour: 0.3, perHour: { fun: 8, energy: -5, hygiene: -3 } }],
  },
  {
    type: 'globe', name: 'World Globe', icon: '🌍', category: 'skills', price: 45_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'study_globe', label: 'Study the map', icon: '🗺️', minutes: 20, animation: 'read', knowledgePerHour: 0.25, perHour: { fun: 6 } }],
  },

  // Out in the compound
  {
    type: 'clothes_line', name: 'Clothes Line & Basin', icon: '🧺', category: 'outdoor', price: 15_000, w: 2, d: 1, layer: 'object', outdoorOnly: true,
    actions: [{ id: 'hang_clothes', label: 'Wash & hang clothes', icon: '👕', minutes: 40, animation: 'wash', waterUse: 8, perHour: { hygiene: 70, energy: -5 } }],
  },
  {
    type: 'basketball_hoop', name: 'Basketball Hoop', icon: '🏀', category: 'outdoor', price: 110_000, w: 1, d: 1, layer: 'object', outdoorOnly: true,
    actions: [{ id: 'shoot_hoops', label: 'Shoot hoops', icon: '🏀', minutes: 30, animation: 'exercise', perHour: { fun: 32, energy: -8, hygiene: -10 } }],
  },
  {
    type: 'fire_pit', name: 'Fire Pit', icon: '🔥', category: 'outdoor', price: 55_000, w: 1, d: 1, layer: 'object', outdoorOnly: true,
    actions: [
      { id: 'fireside', label: 'Fireside gist', icon: '🔥', minutes: 60, cost: 800, animation: 'talk', perHour: { social: 30, fun: 18 } },
      { id: 'roast_corn', label: 'Roast corn', icon: '🌽', minutes: 25, cost: 600, untilFull: 'hunger', perHour: { hunger: 70, fun: 10 } },
    ],
  },
  {
    type: 'dog_kennel', name: 'Dog Kennel & Bingo', icon: '🐕', category: 'outdoor', price: 120_000, w: 2, d: 1, layer: 'object', outdoorOnly: true,
    actions: [
      { id: 'play_dog', label: 'Play fetch with Bingo', icon: '🎾', minutes: 25, animation: 'exercise', perHour: { fun: 34, social: 14, energy: -4 } },
      { id: 'feed_dog', label: 'Feed Bingo', icon: '🦴', minutes: 10, cost: 700, animation: 'clean', perHour: { fun: 14, social: 10 } },
    ],
  },
  {
    type: 'chicken_coop', name: 'Chicken Coop', icon: '🐔', category: 'outdoor', price: 85_000, w: 2, d: 1, layer: 'object', outdoorOnly: true,
    actions: [
      { id: 'collect_eggs', label: 'Collect & fry eggs', icon: '🥚', minutes: 20, untilFull: 'hunger', perHour: { hunger: 75, fun: 8 } },
      { id: 'feed_chickens', label: 'Feed the chickens', icon: '🌾', minutes: 10, cost: 400, animation: 'clean', perHour: { fun: 12 } },
    ],
  },
  {
    type: 'veg_garden', name: 'Vegetable Garden', icon: '🥬', category: 'outdoor', price: 40_000, w: 2, d: 2, layer: 'object', blocks: false, outdoorOnly: true,
    actions: [
      { id: 'tend_garden', label: 'Tend the garden', icon: '🌱', minutes: 40, animation: 'clean', perHour: { fun: 16, energy: -5, hygiene: -5 } },
      { id: 'harvest_ugu', label: 'Harvest ugu & tomatoes', icon: '🍅', minutes: 15, animation: 'eat', untilFull: 'hunger', perHour: { hunger: 50, fun: 8 } },
    ],
  },
  {
    type: 'parasol_set', name: 'Parasol Table & Chairs', icon: '⛱️', category: 'outdoor', price: 135_000, w: 2, d: 2, layer: 'object', outdoorOnly: true,
    seat: { y: 0.44, z: -0.65 },
    actions: [
      { id: 'sit_out', label: 'Sit out with a cold drink', icon: '🥤', minutes: 45, cost: 700, pose: 'sit', perHour: { fun: 18, energy: 6, hunger: 10 } },
      { id: 'garden_party', label: 'Host a garden party', icon: '🎉', minutes: 120, cost: 12_000, pose: 'sit', animation: 'talk', perHour: { social: 44, fun: 26 } },
    ],
  },
  {
    type: 'garden_swing', name: 'Garden Swing Seat', icon: '🎠', category: 'outdoor', price: 150_000, w: 2, d: 1, layer: 'object', outdoorOnly: true,
    seat: { y: 0.53, z: 0 },
    actions: [{ id: 'swing', label: 'Swing gently', icon: '🍃', minutes: 40, pose: 'sit', perHour: { fun: 18, energy: 8 } }],
  },
  {
    type: 'well', name: 'Hand-Dug Well', icon: '🪣', category: 'outdoor', price: 90_000, w: 1, d: 1, layer: 'object', outdoorOnly: true,
    actions: [{ id: 'well_wash', label: 'Draw water & wash up', icon: '💦', minutes: 15, animation: 'wash', untilFull: 'hygiene', perHour: { hygiene: 150, energy: -4 } }],
  },
  { type: 'satellite_dish', name: 'Satellite Dish', icon: '📡', category: 'outdoor', price: 70_000, w: 1, d: 1, layer: 'object', outdoorOnly: true, actions: [] },
  { type: 'security_light', name: 'Security Floodlight', icon: '🔦', category: 'security', price: 60_000, w: 1, d: 1, layer: 'object', blocks: false, outdoorOnly: true, actions: [] },
  { type: 'garden_lamp', name: 'Garden Lamp Post', icon: '🏮', category: 'outdoor', price: 30_000, w: 1, d: 1, layer: 'object', outdoorOnly: true, actions: [] },

  // More against the heat (and the harmattan), and more for the kitchen
  {
    type: 'standing_ac', name: 'Standing AC (2HP)', icon: '🧊', category: 'comfort', price: 1_450_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'chill_tower', label: 'Stand in front of the AC', icon: '❄️', minutes: 60, needsPower: true, perHour: { energy: 16, fun: 20, hygiene: 1 } }],
  },
  {
    type: 'air_cooler', name: 'Air Cooler', icon: '💨', category: 'comfort', price: 190_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'cool_mist', label: 'Cool off by the air cooler', icon: '💨', minutes: 30, pose: 'stand', needsPower: true, perHour: { energy: 10, fun: 8 } }],
  },
  {
    type: 'rechargeable_fan', name: 'Rechargeable Fan', icon: '🔋', category: 'comfort', price: 75_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'cool_recharge', label: 'Sit by the fan (no light needed)', icon: '🌬️', minutes: 15, pose: 'stand', perHour: { energy: 6, fun: 4 } }],
  },
  {
    type: 'room_heater', name: 'Harmattan Room Heater', icon: '🔥', category: 'comfort', price: 110_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'warm_up', label: 'Warm up by the heater', icon: '🔥', minutes: 30, pose: 'stand', needsPower: true, perHour: { energy: 10, fun: 6 } }],
  },
  {
    type: 'rice_cooker', name: 'Rice Cooker', icon: '🍚', category: 'kitchen', price: 48_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'white_rice', label: 'Cook white rice & stew', icon: '🍚', minutes: 40, needsPower: true, cost: 2_000, untilFull: 'hunger', cookingPerHour: 0.2, perHour: { hunger: 60 } }],
  },
  {
    type: 'electric_oven', name: 'Electric Oven', icon: '🥧', category: 'kitchen', price: 380_000, w: 1, d: 1, layer: 'object',
    actions: [
      { id: 'bake_meat_pie', label: 'Bake meat pies', icon: '🥟', minutes: 60, needsPower: true, cost: 3_500, untilFull: 'hunger', cookingPerHour: 0.4, perHour: { hunger: 60, fun: 6 } },
      { id: 'roast_chicken', label: 'Roast a whole chicken', icon: '🍗', minutes: 90, needsPower: true, cost: 7_000, untilFull: 'hunger', cookingPerHour: 0.45, perHour: { hunger: 50, fun: 10 } },
    ],
  },
  { type: 'gas_cylinder', name: 'Gas Cylinder (12.5kg)', icon: '🛢️', category: 'kitchen', price: 42_000, w: 1, d: 1, layer: 'object', actions: [] },
  {
    type: 'water_drum', name: 'Water Storage Drum', icon: '🛢️', category: 'bath', price: 24_000, w: 1, d: 1, layer: 'object',
    actions: [{ id: 'drum_bath', label: 'Scoop water & bath', icon: '🪣', minutes: 25, untilFull: 'hygiene', perHour: { hygiene: 140 } }],
  },

  // More to look at
  { type: 'centre_table', name: 'Glass Centre Table', icon: '🫖', category: 'decor', price: 95_000, w: 2, d: 1, layer: 'object', actions: [] },
  { type: 'wall_art', name: 'Framed Ankara Art', icon: '🖼️', category: 'decor', price: 40_000, w: 1, d: 1, layer: 'object', blocks: false, actions: [] },
  { type: 'calabash_display', name: 'Calabash Display', icon: '🧉', category: 'decor', price: 22_000, w: 1, d: 1, layer: 'object', actions: [] },
  { type: 'shoe_rack', name: 'Shoe Rack', icon: '👟', category: 'decor', price: 20_000, w: 1, d: 1, layer: 'object', actions: [] },
  { type: 'snake_plant', name: 'Snake Plant', icon: '🌿', category: 'decor', price: 14_000, w: 1, d: 1, layer: 'object', actions: [] },
  { type: 'room_divider', name: 'Carved Room Divider', icon: '🪵', category: 'decor', price: 85_000, w: 2, d: 1, layer: 'object', actions: [] },
  { type: 'console_table', name: 'Console Table & Vase', icon: '🏺', category: 'decor', price: 60_000, w: 2, d: 1, layer: 'object', actions: [] },
  { type: 'saddle_stand', name: 'Durbar Saddle Stand', icon: '🐎', category: 'decor', price: 240_000, w: 1, d: 1, layer: 'object', actions: [] },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((i) => [i.type, i]));
export const ITEM_LIST = list;

/** Actions you can do from the phone, anywhere. */
export const PHONE_ACTIONS: ActionDef[] = [
  { id: 'call_mama', label: 'Call Mama', icon: '📞', minutes: 20, cost: 200, perHour: { social: 75, fun: 10 } },
  { id: 'scroll', label: 'Scroll social media', icon: '📱', minutes: 30, cost: 100, untilFull: 'fun', perHour: { fun: 22, social: 12 } },
];

export const FOOD_DELIVERY = [
  { id: 'suya', name: 'Suya (Barnawa)', icon: '🍢', price: 4_000, hunger: 35, fun: 10 },
  { id: 'kilishi', name: 'Kilishi pack', icon: '🥩', price: 3_000, hunger: 25, fun: 6 },
  { id: 'fura', name: 'Fura da nono', icon: '🥛', price: 1_200, hunger: 25, fun: 4 },
  { id: 'shawarma', name: 'Shawarma', icon: '🌯', price: 5_500, hunger: 45, fun: 8 },
  { id: 'jollof_pack', name: 'Jollof & chicken', icon: '🍗', price: 6_500, hunger: 60, fun: 6 },
];

export interface Job {
  id: string;
  title: string;
  place: string;
  icon: string;
  start: number;
  end: number;
  pay: number;
  minKnowledge: number;
  perHour: Partial<Record<Need, number>>;
}

export const JOBS: Job[] = [
  { id: 'keke', title: 'Keke Driver', place: 'Kawo – Central Market route', icon: '🛺', start: 6, end: 18, pay: 30_000, minKnowledge: 0, perHour: { energy: -5, social: 2, fun: -2, hygiene: -4 } },
  { id: 'airport', title: 'Airport Ground Assistant', place: 'Kaduna International Airport', icon: '🧳', start: 6, end: 18, pay: 36_000, minKnowledge: 1, perHour: { energy: -4, social: 2, fun: -1, hygiene: -3 } },
  { id: 'trader', title: 'Market Trader', place: 'Kaduna Central Market', icon: '🧺', start: 7, end: 19, pay: 27_000, minKnowledge: 0, perHour: { energy: -4, social: 3, fun: -1, hygiene: -3 } },
  { id: 'textile', title: 'Mill Hand', place: 'KTL Textile Mill, Kakuri', icon: '🧶', start: 7, end: 18, pay: 30_000, minKnowledge: 0, perHour: { energy: -5, social: 2, fun: -2, hygiene: -3 } },
  { id: 'hotel', title: 'Hotel Receptionist', place: 'Hamdala Hotel', icon: '🛎️', start: 7, end: 19, pay: 36_000, minKnowledge: 1, perHour: { energy: -3, social: 4, fun: -1 } },
  { id: 'banker', title: 'Bank Teller', place: 'Kaduna Community Bank', icon: '🏦', start: 8, end: 18, pay: 45_000, minKnowledge: 2, perHour: { energy: -3, social: 3, fun: -1 } },
  { id: 'police', title: 'Police Officer', place: 'Kaduna Police HQ', icon: '👮🏾', start: 7, end: 19, pay: 39_000, minKnowledge: 1, perHour: { energy: -4, social: 2, fun: -1, hygiene: -3 } },
  { id: 'fitness', title: 'Fitness Coach', place: 'Ahmadu Bello Stadium', icon: '🏋🏾', start: 8, end: 20, pay: 33_000, minKnowledge: 1, perHour: { energy: -6, social: 3, fun: 2, hygiene: -5 } },
  { id: 'teacher', title: 'Primary School Teacher', place: 'LEA School, Barnawa', icon: '🧑🏾‍🏫', start: 7, end: 16, pay: 27_000, minKnowledge: 2, perHour: { energy: -4, social: 2, fun: -2 } },
  { id: 'civil', title: 'Civil Servant', place: 'State Secretariat', icon: '🏛️', start: 7, end: 19, pay: 42_000, minKnowledge: 3, perHour: { energy: -3, social: 1, fun: -3 } },
  { id: 'refinery', title: 'Refinery Technician', place: 'Kaduna Refinery (KRPC)', icon: '🛢️', start: 6, end: 18, pay: 90_000, minKnowledge: 5, perHour: { energy: -5, fun: -3, hygiene: -4 } },
  { id: 'dev', title: 'Software Developer', place: 'Tech hub, Ungwan Rimi', icon: '💻', start: 9, end: 21, pay: 120_000, minKnowledge: 7, perHour: { energy: -3, fun: -1, social: 0 } },
  { id: 'dj', title: 'Resident Club DJ', place: 'The Castle Lounge & Nightclub', icon: '🎧', start: 19, end: 5, pay: 60_000, minKnowledge: 2, perHour: { energy: -5, social: 4, fun: 5, hygiene: -3 } },
];

/** Seconds a burglar spends carrying an item out: big, heavy pieces take longer than small ones. */
export function stealSeconds(type: string): number {
  const def = ITEMS[type];
  if (!def) return 5;
  const area = def.w * def.d;
  const bulk = def.layer === 'floor' ? area : area * 2;
  const fragile = def.price >= 1_000_000 ? 2 : 0;
  return Math.min(20, Math.max(3, 2 + bulk + fragile));
}

/** Item types that were merged into another. Old saves and purchase records still say the old name. */
export const RENAMED_ITEMS: Record<string, string> = { standing_fan: 'fan' };

/** Club actions that trigger the money-spray animation (continuous rain while doing them). */
export const SPRAY_ACTIONS = new Set(['spray_money', 'spray_heavy', 'dorime', 'club_takeover']);

/** The subset of spray actions that get gold "hot" tile treatment in the PlaceHub. */
export const HOT_ACTIONS = new Set(['spray_heavy', 'dorime', 'club_takeover']);
