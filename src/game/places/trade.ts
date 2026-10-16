// Places of trade and transport: the train station, the refinery control room, the textile mill, the buka,
// the market, the suya spot and the motor park. Their props' models are in three/props/trade.tsx; what stands
// outside the station's and the refinery's glass is in three/StationPlatform.tsx and three/RefineryYard.tsx.

import { exit, p, sign, type Interior, type PropDef } from '../interiorKit';
import { ALL_TRAIN_IDS } from '../transport';

/** Sizes of the props only these places use (their models are in three/props/trade.tsx). */
export const TRADE_SIZES: Record<string, PropDef> = {
  // Train station
  station_gate: { w: 2, d: 1, floor: true },
  station_turnstile: { w: 2, d: 1, floor: true },
  station_tickets: { w: 3, d: 1, counter: true },
  station_board: { w: 3, d: 1, floor: true },
  // Refinery
  refinery_console: { w: 3, d: 1 },
  refinery_mimic: { w: 3, d: 1, floor: true },
  refinery_valves: { w: 2, d: 1 },
  refinery_ppe: { w: 2, d: 1 },
  refinery_door: { w: 2, d: 1, floor: true },
  refinery_drum: { w: 1, d: 1 },
  // Textile mill
  mill_loom: { w: 2, d: 1 },
  mill_vat: { w: 1, d: 1 },
  mill_bale: { w: 1, d: 1 },
  mill_spools: { w: 2, d: 1 },
  mill_shelf: { w: 2, d: 1, counter: true },
  mill_table: { w: 2, d: 1 },
  mill_dryline: { w: 3, d: 1, floor: true },
  mill_cart: { w: 1, d: 1 },
  // Buka
  buka_fire: { w: 2, d: 1 },
  buka_counter: { w: 3, d: 1, counter: true },
  buka_form: { w: 3, d: 1, seat: { y: 0.42, z: 0 } },
  buka_table: { w: 3, d: 1 },
  buka_shayi: { w: 2, d: 1, counter: true },
  buka_menu: { w: 2, d: 1, floor: true },
  // Market
  market_spice: { w: 2, d: 1, counter: true },
  market_fruit: { w: 2, d: 1, counter: true },
  market_meat: { w: 2, d: 1, counter: true },
  market_veg: { w: 2, d: 1, counter: true },
  market_cloth: { w: 2, d: 1, counter: true },
  market_sacks: { w: 1, d: 1 },
  market_yams: { w: 1, d: 1 },
  market_okrika: { w: 2, d: 2, counter: true },
  market_rampen: { w: 3, d: 2 },
  market_phones: { w: 2, d: 1, counter: true },
  market_watches: { w: 1, d: 1 },
  market_water: { w: 1, d: 1 },
  market_barrow: { w: 1, d: 1 },
  // Suya spot
  suya_stand: { w: 3, d: 2 },
  suya_table: { w: 1, d: 1 },
  suya_crates: { w: 1, d: 1 },
  suya_charcoal: { w: 1, d: 1 },
  suya_lights: { w: 4, d: 1, floor: true },
  suya_okada: { w: 1, d: 2 },
  // Motor park
  park_bus: { w: 2, d: 5 },
  park_shed: { w: 3, d: 2, counter: true },
  park_luggage: { w: 1, d: 1 },
  park_toilet: { w: 1, d: 1 },
  park_tyres: { w: 1, d: 1 },
};

const HALF = Math.PI / 2;

export const TRADE: Record<string, Interior> = {
  // Ticket office and departures board on the left, seats in the middle, the VIP lounge roped off on the right;
  // through the barriers and the doors in the glass is the platform, with the train standing at it.
  station: {
    w: 14, h: 10, dense: true, floor: ['#ece9e4', '#dedad3'], wall: '#f5f5f4', doorX: 7,
    glass: [[1, 5], [9, 13]], behind: 9,
    tiles: [
      { x: 0, z: 0, w: 14, d: 2, colour: '#c3c8ce' },
      { x: 10, z: 3, w: 4, d: 4, colour: '#6b3a2a' },
    ],
    staff: [
      { x: 0.35, z: 2.5, yaw: HALF, look: 'clerk' },
      { x: 4.5, z: 1.5, yaw: 0, look: 'attendant' },
      { x: 8.5, z: 1.5, yaw: 0, look: 'security' },
      { x: 12.5, z: 6.5, yaw: Math.PI, look: 'waiter' },
    ],
    props: [
      // Platforms, through the barriers
      p('station_gate', 2, 0, ['abuja', 'platform_sprint'], 0, 'Platform 1 · boarding', 'PLATFORM 1'),
      p('station_turnstile', 2, 1),
      p('station_gate', 10, 0, ['abuja'], 0, 'Platform 2', 'PLATFORM 2'),
      p('station_turnstile', 10, 1),
      p('plant', 5, 0), p('plant', 8, 0),
      // Ticket hall, down the left wall
      p('station_tickets', 0, 1, ['abuja', ...ALL_TRAIN_IDS], 3, 'Ticket office', 'TICKETS'),
      p('kiosk', 0, 5, [], 3, 'Ticket machine'),
      p('station_board', 0, 6, [], 1, 'Departures board'),
      p('trolley', 0, 9),
      p('gate_seat', 3, 4, [], 2), p('gate_seat', 6, 4, [], 2),
      p('gate_seat', 3, 5), p('gate_seat', 6, 5),
      // VIP lounge
      sign('post_sign', 9, 2, 'VIP LOUNGE'),
      p('velvet_rope', 12, 2),
      p('velvet_rope', 9, 3, [], 1), p('velvet_rope', 9, 6, [], 1),
      p('velvet_rope', 12, 7),
      p('sofa', 13, 3, ['vip_lounge'], 1, 'VIP lounge'),
      p('velvet_rug', 10, 4),
      p('coffee_table', 10, 4),
      p('armchair', 11, 6, ['vip_lounge'], 2, 'VIP armchair'),
      p('floor_lamp', 13, 6),
      p('coffee', 13, 8),
      p('plant', 13, 9),
      exit(7, 9),
    ],
  },
  // The control room: consoles under the window onto the yard, the plant drawn on the wall, valves down the side.
  refinery: {
    w: 14, h: 9, dense: true, floor: ['#b9c0ca', '#acb4bf'], wall: '#e5e7eb', doorX: 7,
    glass: [[4, 10]], behind: 13,
    tiles: [
      { x: 3, z: 0, w: 8, d: 2, colour: '#7b8494' },
      { x: 6, z: 2, w: 2, d: 7, colour: '#9aa3b0' },
      { x: 11, z: 0, w: 2, d: 2, colour: '#facc15' },
    ],
    staff: [
      { x: 8.5, z: 1.5, look: 'engineer' },
      { x: 12.4, z: 3, yaw: HALF, look: 'worker' },
      { x: 2, z: 5.4, look: 'office' },
    ],
    props: [
      p('refinery_mimic', 0, 0, [], 1, 'Process overview'),
      p('refinery_ppe', 1, 0, [], 0, 'Hard hats & hi-vis'),
      p('refinery_console', 4, 0, ['work'], 0, 'Your console'),
      p('refinery_console', 7, 0, [], 0, 'Control desk'),
      p('refinery_door', 11, 0, ['flare_tour', 'flare_climb'], 0, 'Door to the plant', 'PLANT AREA'),
      p('refinery_drum', 13, 0),
      p('refinery_valves', 13, 2, ['shift_hustle'], 1, 'Valve manifold'),
      p('refinery_valves', 13, 5, [], 1, 'Valve manifold'),
      p('office_desk', 1, 4, [], 0, 'Shift supervisor'),
      p('notice_board', 0, 5, [], 1),
      p('filing', 0, 7),
      p('water_dispenser', 0, 8),
      p('reading_table', 9, 4, [], 0, 'Permit-to-work desk'),
      p('plastic_chair', 9, 5, [], 2), p('plastic_chair', 10, 5, [], 2),
      p('bench', 11, 7, [], 0, 'Bench'),
      p('refinery_drum', 13, 8),
      exit(7, 8),
    ],
  },
  // The mill floor: two rows of looms, dye vats down the left wall with cloth drying, the fabric store on the right.
  textile: {
    w: 14, h: 10, dense: true, floor: ['#b8b2a7', '#aaa397'], wall: '#d6cfc2', doorX: 7,
    tiles: [
      { x: 0, z: 1, w: 2, d: 5, colour: '#8d877c' },
      { x: 11, z: 0, w: 3, d: 7, colour: '#b98d5f' },
    ],
    staff: [
      { x: 6, z: 3.5, look: 'worker' },
      { x: 9, z: 6.5, look: 'worker' },
      { x: 11.5, z: 6.5, look: 'tailor' },
      { x: 12.5, z: 1.5, yaw: 0, look: 'clerk' },
    ],
    props: [
      // High windows and raw cotton along the back
      p('louvre_window', 1, 0, [], 2), p('louvre_window', 5, 0, [], 2), p('louvre_window', 8, 0, [], 2),
      p('mill_bale', 0, 0), p('mill_bale', 1, 0), p('mill_bale', 2, 0),
      p('mill_cart', 5, 0),
      p('mill_bale', 8, 0), p('mill_bale', 9, 0),
      // Dye house
      p('mill_vat', 0, 2, [], 0, 'Dye vat', 'red'),
      p('mill_vat', 0, 3, ['custom_ankara'], 0, 'Dye vats', 'indigo'),
      p('mill_vat', 0, 4, [], 0, 'Dye vat', 'yellow'),
      p('mill_vat', 0, 5, [], 0, 'Dye vat', 'green'),
      p('mill_dryline', 0, 6, [], 1),
      // Weaving shed
      p('mill_loom', 2, 2, ['work'], 0, 'Your loom', 'red'),
      p('mill_loom', 5, 2, ['loom_race'], 0, 'Racing loom', 'blue'),
      p('mill_loom', 8, 2, [], 0, 'Loom', 'green'),
      p('mill_loom', 2, 5, [], 0, 'Loom', 'yellow'),
      p('mill_loom', 5, 5, ['custom_ankara', 'loom_race'], 0, 'Pattern loom', 'purple'),
      p('mill_loom', 8, 5, [], 0, 'Loom', 'teal'),
      // Fabric store
      p('fabric_roll', 11, 0, ['fabric'], 0, 'Fabric rolls'),
      p('mill_shelf', 12, 0, ['fabric'], 0, 'Fabric store'),
      p('fabric_roll', 13, 2, ['fabric'], 0, 'Fabric rolls'), p('fabric_roll', 13, 3), p('fabric_roll', 13, 4),
      p('mill_spools', 11, 2, [], 1),
      p('mill_table', 11, 5, ['fabric', 'custom_ankara'], 0, 'Cutting table'),
      p('mill_bale', 13, 8), p('mill_bale', 13, 9),
      p('mill_cart', 1, 9),
      p('fan', 0, 9),
      exit(7, 9),
    ],
  },
  // Pots on the fire and the serving counter along the back, mai shayi by the left wall, forms and tables to eat at.
  buka: {
    w: 9, h: 7, dense: true, floor: ['#d6c4a1', '#cbb68f'], wall: '#f2d7b0', doorX: 4,
    tiles: [{ x: 0, z: 0, w: 9, d: 1, colour: '#a58a66' }],
    staff: [
      { x: 2.6, z: 0.6, yaw: -HALF, look: 'cook' },
      { x: 6.5, z: 0.5, yaw: 0, look: 'vendor' },
      { x: 0.5, z: 1.45, yaw: 0.6, look: 'guide' },
    ],
    props: [
      p('buka_fire', 0, 0, ['tuwo', 'indomie', 'indomie_contest'], 0, 'Indomie & tuwo pots'),
      p('buka_menu', 2, 0, [], 2),
      p('buka_counter', 5, 1, ['masa', 'danwake', 'tuwo'], 0, 'Mama’s serving counter', 'FOOD IS READY'),
      p('cooler', 8, 0, ['fura', 'zobo_round'], 0, 'Cold zobo & fura da nono'),
      p('buka_shayi', 0, 2, ['shayi', 'politics_tea'], 3, 'Mai Shayi & toasted bread'),
      p('buka_form', 2, 2, [], 1, 'Bench'),
      p('louvre_window', 0, 4, [], 1),
      p('buka_form', 6, 3, [], 0, 'Bench'),
      p('buka_table', 6, 4),
      p('buka_form', 6, 5, [], 2, 'Bench'),
      p('plant', 0, 6),
      p('bucket', 8, 6),
      exit(4, 6),
    ],
  },
  // Roofed stalls along the back wall, open tables in rows with aisles between, the ram market and the okrika heap
  // at the front, phone village in the back corner.
  market: {
    w: 18, h: 13, dense: true, floor: ['#c4a57c', '#b89a72'], wall: '#e7d3b1', doorX: 9,
    tiles: [{ x: 8, z: 1, w: 3, d: 12, colour: '#b59468' }],
    staff: [
      { x: 3, z: 3.05, yaw: 0, look: 'hawker' },
      { x: 7, z: 3.05, yaw: 0, look: 'tailor' },
      { x: 12, z: 3.05, yaw: 0, look: 'vendor' },
      { x: 14, z: 3.05, yaw: 0, look: 'cook' },
      { x: 3, z: 6.05, yaw: 0, look: 'vendor' },
      { x: 7, z: 6.05, yaw: 0, look: 'hawker' },
      { x: 16, z: 6.05, yaw: 0, look: 'vendor' },
      { x: 4.6, z: 10.5, yaw: -HALF, look: 'guide' },
    ],
    props: [
      // Along the back wall
      p('fabric_stall', 0, 0, ['ankara'], 0, 'Ankara stall'),
      p('market_sacks', 2, 0, ['market_porter'], 0, 'Yam & grain sacks'), p('market_yams', 3, 0),
      p('fabric_stall', 4, 0, ['ankara'], 0, 'Lace & atampa'),
      p('fabric_stall', 6, 0, ['clothes', 'ankara'], 0, 'Caps, beads & wrappers'),
      p('market_yams', 8, 0), p('market_sacks', 9, 0),
      p('food_stall', 10, 0, ['streetfood', 'masa', 'danwake'], 0, 'Masa, kosai & danwake'),
      p('food_stall', 12, 0, ['streetfood', 'fura'], 0, 'Kunu, zobo & fura da nono'),
      p('market_phones', 16, 0, ['phones'], 0, 'Phone village — Tecno, Samsung & iPhone', 'PHONES'),
      // Down the left wall
      p('produce_stall', 0, 1, [], 3, 'Tomatoes & pepper'),
      p('fabric_stall', 0, 3, ['ankara'], 3, 'Shadda & brocade'),
      p('food_stall', 0, 7, ['streetfood', 'kilishi'], 3, 'Akara, bread & kilishi'),
      // First row of tables
      p('market_veg', 2, 3, [], 0, 'Tomatoes & tatashe'),
      p('market_spice', 4, 3, ['work'], 0, 'Your stall'),
      p('market_cloth', 6, 3, ['clothes', 'ankara'], 0, 'Clothes & wrappers'),
      p('market_fruit', 11, 3, ['fruit_tasting'], 0, 'Fruit seller'),
      p('market_meat', 13, 3, ['kilishi', 'dambu', 'streetfood'], 0, 'Kilishi & dambu nama'),
      p('market_phones', 15, 3, ['phones'], 0, 'Phone accessories', 'CHARGERS'),
      // Second row
      p('market_cloth', 2, 6, ['ankara'], 0, 'Atampa & lace'),
      p('market_veg', 4, 6, [], 0, 'Yam & onions'),
      p('market_spice', 6, 6, ['dambu'], 0, 'Grains & spices'),
      p('market_veg', 11, 6, [], 0, 'Okra & onions'),
      p('market_watches', 13, 6, ['fake_rolex', 'thief_prank'], 0, 'Watches & shades'),
      p('market_water', 14, 6, ['hawk_water'], 0, 'Pure water seller'),
      p('market_spice', 15, 6, [], 0, 'Pepper & daddawa'),
      // Open ground at the front
      p('market_rampen', 1, 9, ['buy_ram'], 0, 'Kasuwan Rago — Sallah ram market'),
      p('umbrella', 4, 9),
      p('market_fruit', 5, 8, ['fruit_tasting'], 0, 'Oranges & watermelon'),
      p('market_barrow', 5, 11, ['market_porter'], 0, 'Porter’s wheelbarrow'),
      p('market_veg', 11, 9, [], 0, 'Pepper & okra'),
      p('market_okrika', 14, 9, ['okrika_dispute', 'clothes'], 0, 'Okrika bend-down-select'),
      p('market_sacks', 17, 9), p('market_yams', 17, 10),
      exit(9, 12),
    ],
  },
  // Mai suya's grill smoking at the back, plastic tables under a string of bulbs, ludo in the corner.
  suya: {
    w: 12, h: 9, outdoor: true, dense: true, floor: ['#c98b5e', '#bf8155'], doorX: 6,
    tiles: [{ x: 4, z: 0, w: 5, d: 3, colour: '#a8734a' }],
    staff: [
      { x: 6, z: 0.5, yaw: 0, look: 'cook' },
      { x: 7.4, z: 0.5, yaw: 0, look: 'waiter' },
    ],
    props: [
      p('neem', 0, 0),
      p('suya_charcoal', 4, 0),
      p('suya_stand', 5, 0, ['eat', 'yaji_challenge', 'suya_sprint', 'buy_grill'], 0, 'Mai Suya’s grill', 'MAI SUYA'),
      p('cooler', 10, 0, ['gist'], 0, 'Drinks cooler'),
      p('suya_crates', 11, 0),
      p('suya_okada', 0, 3),
      p('suya_table', 2, 3),
      p('plastic_chair', 1, 3, ['gist'], 3), p('plastic_chair', 3, 3, ['gist', 'landlord_gist'], 1), p('plastic_chair', 2, 4, ['gist'], 2),
      p('suya_table', 9, 3),
      p('plastic_chair', 8, 3, ['gist'], 3), p('plastic_chair', 10, 3, ['landlord_gist'], 1), p('plastic_chair', 9, 4, ['gist'], 2),
      p('plastic_chair', 11, 4, [], 0),
      p('ludo', 11, 5, ['ludo_smash'], 1, 'Ludo board'),
      p('suya_lights', 2, 5),
      p('dining', 0, 6, ['eat', 'gist'], 0, 'Table'),
      p('suya_lights', 7, 7),
      p('umbrella', 4, 7),
      p('neem', 0, 8),
      exit(6, 8),
    ],
  },
  // Buses nose-out in their bays along the back with where they are going over the windscreen, the keke rank on the
  // right, the park office on the left, corn roasting by the gate.
  motorpark: {
    w: 18, h: 13, outdoor: true, dense: true, floor: ['#78716c', '#6b6560'], doorX: 9,
    tiles: [
      ...[2.05, 3.85, 5.95, 8.05, 9.85, 11.95, 14.05].map((x) => ({ x, z: 0.2, w: 0.1, d: 5, colour: '#f8fafc' })),
      { x: 0, z: 5.2, w: 14.15, d: 0.12, colour: '#facc15' },
      { x: 14.6, z: 1.6, w: 3.4, d: 3, colour: '#5f5a55' },
    ],
    staff: [
      { x: 8.5, z: 6.5, yaw: 0, look: 'agbero' },
      { x: 3.2, z: 5.7, yaw: 0, look: 'driver' },
      { x: 4.6, z: 9.5, yaw: -HALF, look: 'cook' },
      { x: 12, z: 7.5, yaw: 0, look: 'hawker' },
      { x: 16.5, z: 4.7, yaw: 0, look: 'driver' },
    ],
    props: [
      p('park_bus', 0, 0, ['zaria'], 0, 'Bus to Zaria', 'ZARIA'),
      p('park_bus', 4, 0, ['conductor_shout'], 0, 'Loading bus', 'KANO'),
      p('park_bus', 6, 0, ['park_hustle'], 0, 'Bus with a roof rack to load', 'JOS'),
      p('park_bus', 10, 0, [], 0, 'Park bus', 'SOKOTO'),
      p('park_bus', 12, 0, [], 0, 'Park bus', 'LAGOS'),
      p('park_luggage', 3, 2, ['park_hustle'], 0, 'Luggage to load'),
      p('market_barrow', 2, 4),
      p('park_luggage', 8, 3, ['park_hustle'], 0, 'Luggage to load'),
      // Keke rank
      sign('post_sign', 14, 5, 'KEKE'),
      p('keke', 15, 2, ['work'], 0, 'Your keke'),
      p('keke', 16, 2),
      p('keke', 17, 2),
      p('park_tyres', 16, 0),
      p('park_toilet', 17, 0, ['public_toilet'], 0, 'Public toilet'),
      p('suya_okada', 17, 6),
      // Park office and the food corner
      p('park_shed', 0, 6, ['zaria'], 3, 'Park office · tickets', 'TICKETS'),
      p('corn_roaster', 3, 9, ['corn'], 3, 'Roasted corn'),
      p('umbrella', 2, 9),
      p('market_water', 0, 10),
      p('bench', 2, 11, ['corn'], 2, 'Bench'),
      // Waiting passengers
      p('bench', 14, 8, [], 0, 'Bench'),
      p('park_luggage', 16, 9),
      p('bench', 14, 11, [], 2, 'Bench'),
      exit(9, 12),
    ],
  },
};
