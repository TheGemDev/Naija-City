// Inside areas for every place on the town map. Each is a small grid like the house:
// walls round the edge (a fence outdoors), a door gap at the front, and props you tap.
// Props use the same cell convention and facing as house items (front = +z, rot in quarter turns).

import { ITEMS } from './catalog';
import type { Cell } from './grid';
import { activeMap } from './city';
import { exit, p, sign, type Interior, type Prop, type PropDef } from './interiorKit';
import { CIVIC, CIVIC_SIZES } from './places/civic';
import { CULTURE, CULTURE_SIZES } from './places/culture';
import { TRADE, TRADE_SIZES } from './places/trade';
import { OUTDOOR, OUTDOOR_SIZES } from './places/outdoor';
import { VILLA } from './places/villa';

export type { Interior, Prop, PropDef, StaffSpot } from './interiorKit';

/** Sizes for props that aren't house items. House item types (dining, plastic_chair...) reuse ITEMS. */
export const PROPS: Record<string, PropDef> = {
  exit: { w: 1, d: 1, floor: true },
  cooler: { w: 1, d: 1 },
  umbrella: { w: 1, d: 1 },
  pot_counter: { w: 2, d: 1 },
  bench: { w: 2, d: 1, seat: { y: 0.42, z: 0 } },
  kettle_table: { w: 1, d: 1 },
  pew: { w: 3, d: 1, seat: { y: 0.45, z: 0 } },
  fishing_spot: { w: 1, d: 1, floor: true },
  neem: { w: 1, d: 1 },
  fabric_stall: { w: 2, d: 1 },
  food_stall: { w: 2, d: 1 },
  produce_stall: { w: 2, d: 1 },
  exhibit: { w: 2, d: 1 },
  info_desk: { w: 2, d: 1 },
  grandstand: { w: 6, d: 2 },
  flagpole: { w: 1, d: 1 },
  cone: { w: 1, d: 1, floor: true },
  office_desk: { w: 2, d: 1 },
  filing: { w: 1, d: 1 },
  cinema_seat: { w: 3, d: 1, seat: { y: 0.45, z: 0 } },
  screen: { w: 6, d: 1 },
  icecream: { w: 2, d: 1 },
  shop_rack: { w: 2, d: 1 },
  statue: { w: 1, d: 1 },
  gazebo: { w: 2, d: 2 },
  picnic_mat: { w: 2, d: 2, floor: true },
  beanbag: { w: 1, d: 1, seat: { y: 0.3, z: 0 } },
  blackboard: { w: 4, d: 1 },
  keke: { w: 1, d: 2 },
  corn_roaster: { w: 1, d: 1 },
  stand: { w: 12, d: 2 },
  goal: { w: 1, d: 3 },
  ball: { w: 1, d: 1, floor: true },
  coffee: { w: 1, d: 1 },
  fabric_roll: { w: 1, d: 1 },
  rail: { w: 4, d: 1 },
  cadets: { w: 3, d: 2, floor: true },
  pool_edge: { w: 1, d: 1, floor: true },
  sun_lounger: { w: 1, d: 2, seat: { y: 0.35, z: 0 } },
  archive_shelf: { w: 2, d: 1 },
  reading_table: { w: 2, d: 1 },
  prison_mat: { w: 1, d: 2, bed: { y: 0.12, z: 0 } },
  cell_door: { w: 1, d: 1, floor: true },
  bamboo_gate: { w: 1, d: 1, floor: true },
  dj_booth: { w: 3, d: 2 },
  dance_floor: { w: 6, d: 5, floor: true },
  vip_booth: { w: 3, d: 2, seat: { y: 0.42, z: -0.2 } },
  club_bar: { w: 4, d: 2 },
  bar_stool: { w: 1, d: 1, seat: { y: 0.55, z: 0 } },
  money_pile: { w: 1, d: 1 },
  // Hotel (game/hotel.ts)
  reception: { w: 4, d: 1 },
  hotel_lift: { w: 2, d: 1 },
  luggage_cart: { w: 1, d: 1 },
  red_carpet: { w: 2, d: 4, floor: true },
  minibar: { w: 1, d: 1 },
  room_door: { w: 1, d: 1, floor: true },
  // Flat against the wall behind their cells, so you can stand right at them.
  wall_window: { w: 2, d: 1, floor: true },
  wall_art: { w: 1, d: 1, floor: true },
  wall_sign: { w: 2, d: 1, floor: true },
  wall_portrait: { w: 1, d: 1, floor: true },
  notice_board: { w: 2, d: 1, floor: true },
  wall_clock: { w: 1, d: 1, floor: true },
  louvre_window: { w: 2, d: 1, floor: true },
  flag_stand: { w: 1, d: 1 },
  // Signs and dividers any place can use (three/placeProps.tsx)
  gantry_sign: { w: 4, d: 1, floor: true },
  post_sign: { w: 1, d: 1 },
  glass_partition: { w: 2, d: 1 },
  queue_rope: { w: 3, d: 1 },
  velvet_rope: { w: 2, d: 1 },
  planter: { w: 2, d: 1 },
  atm: { w: 1, d: 1, counter: true },
  // Airport
  checkin_desk: { w: 2, d: 2, counter: true },
  kiosk: { w: 1, d: 1, counter: true },
  fids_board: { w: 3, d: 1, floor: true },
  xray: { w: 1, d: 3 },
  metal_detector: { w: 1, d: 1, floor: true },
  security_desk: { w: 1, d: 1 },
  gate_seat: { w: 3, d: 1, seat: { y: 0.45, z: 0 } },
  gate_desk: { w: 2, d: 1 },
  gate_door: { w: 2, d: 1, floor: true },
  viewer: { w: 1, d: 1 },
  crew_station: { w: 1, d: 1 },
  carousel: { w: 5, d: 2, counter: true },
  trolley: { w: 1, d: 1 },
  dutyfree: { w: 2, d: 1, counter: true },
  promo_stand: { w: 1, d: 1 },
  cafe_kiosk: { w: 3, d: 1, counter: true },
  cafe_table: { w: 1, d: 1 },
  bureau: { w: 2, d: 1, counter: true },
  info_point: { w: 2, d: 1, counter: true },
  ...CIVIC_SIZES,
  ...CULTURE_SIZES,
  ...TRADE_SIZES,
  ...OUTDOOR_SIZES,
};

export function propDef(type: string): PropDef {
  const p = PROPS[type];
  if (p) return p;
  const it = ITEMS[type];
  return { w: it.w, d: it.d, floor: it.layer === 'floor' || it.blocks === false, seat: it.seat, bed: it.bed };
}

export const INTERIORS: Record<string, Interior> = {
  // Door, check-in hall and baggage claim at the front; through security to the gates, whose glass looks onto the apron (three/AirportApron.tsx).
  airport: {
    w: 24, h: 16, dense: true, floor: ['#eef2f6', '#e2e8ef'], wall: '#f8fafc', doorX: 12,
    glass: [[4, 10], [14, 20]], behind: 19,
    tiles: [
      { x: 0, z: 0, w: 3, d: 6, colour: '#efe2bd' },
      { x: 3, z: 2, w: 8, d: 4, colour: '#6f8bb8' },
      { x: 13, z: 2, w: 5, d: 4, colour: '#6f8bb8' },
      { x: 18, z: 0, w: 6, d: 5, colour: '#8a5a3c' },
      { x: 18, z: 5, w: 6, d: 3, colour: '#e9dcc3' },
      { x: 10, z: 7, w: 4, d: 3, colour: '#aab4c2' },
      { x: 11, z: 10, w: 2, d: 6, colour: '#cfe3d6' },
    ],
    props: [
      // Gate A1: the airliner on the jet bridge
      p('viewer', 5, 0, ['planespot'], 0, 'Apron viewing window'),
      p('gate_door', 8, 0, ['fly_abuja', 'fly_kaduna', 'fly_lagos', 'fly_kano', 'planespot'], 0, 'Gate A1 · boarding', 'A1'),
      p('gate_desk', 6, 1, [], 0, 'Gate A1 desk'),
      p('gate_seat', 4, 3, [], 2), p('gate_seat', 7, 3, [], 2),
      p('gate_seat', 4, 4), p('gate_seat', 7, 4),
      p('plant', 10, 0),
      // Gate A2: the private jet stand
      p('crew_station', 13, 0, ['ground_crew_hustle'], 0, 'Ground crew station'),
      p('gate_door', 14, 0, ['fly_abuja_jet', 'fly_kaduna_jet', 'fly_lagos_jet', 'fly_kano_jet', 'runway_dash'], 0, 'Gate A2 · private jets', 'A2'),
      p('viewer', 17, 0, ['planespot'], 0, 'Apron viewing window'),
      p('gate_seat', 14, 3, [], 2),
      p('gate_seat', 14, 4),
      // Duty free, down the left wall
      p('dutyfree', 0, 0, [], 0, 'Duty free'),
      p('dutyfree', 0, 1, [], 3, 'Duty free'),
      p('dutyfree', 0, 3, [], 3, 'Duty free'),
      p('promo_stand', 2, 3),
      // First-class lounge, back right
      sign('wall_sign', 22, 0, 'FIRST CLASS LOUNGE', 2),
      p('plant', 23, 0),
      p('sofa', 19, 1, ['first_class_flex'], 0, 'First-class lounge'),
      p('velvet_rug', 19, 2),
      p('coffee_table', 19, 3),
      p('armchair', 21, 3, ['first_class_flex'], 1, 'First-class recliner'),
      p('marble_bar', 22, 1, [], 1, 'Lounge bar'),
      p('floor_lamp', 23, 3),
      p('plant', 18, 1),
      p('velvet_rope', 18, 3, [], 1),
      p('velvet_rope', 19, 5), p('velvet_rope', 22, 5),
      // Café on the right wall
      p('cafe_kiosk', 22, 5, [], 1, 'Café', 'CAFÉ'),
      p('cafe_table', 20, 6), p('cafe_table', 18, 7),
      // Security: through the arch, bags through the scanner
      p('glass_partition', 8, 8),
      p('security_desk', 10, 8, [], 0, 'Security'),
      p('metal_detector', 11, 8), p('metal_detector', 12, 8),
      p('xray', 13, 7),
      ...[14, 16, 18, 20, 22].map((x) => p('glass_partition', x, 8)),
      sign('gantry_sign', 10, 12, '✈ DEPARTURES · SECURITY'),
      // Check-in hall, left of the door
      p('checkin_desk', 0, 8, [], 0, 'Check-in', 'AREWA AIR'),
      p('checkin_desk', 2, 8, ['work'], 0, 'Your check-in desk', 'AREWA AIR'),
      p('checkin_desk', 4, 8, [], 0, 'Check-in', 'SAHEL WINGS'),
      p('checkin_desk', 6, 8, [], 0, 'Check-in', 'GREEN EAGLE'),
      p('kiosk', 8, 9, [], 0, 'Self check-in'), p('kiosk', 9, 9, [], 0, 'Self check-in'),
      p('queue_rope', 0, 11), p('queue_rope', 4, 11),
      p('fids_board', 0, 12, [], 1, 'Departures board'),
      p('gate_seat', 3, 12, [], 1), p('gate_seat', 4, 12, [], 3),
      p('trolley', 8, 14), p('trolley', 9, 14),
      // Arrivals and baggage claim, right of the door
      p('info_point', 14, 12, [], 0, 'Information'),
      p('carousel', 16, 10, [], 0, 'Baggage claim'),
      p('gate_seat', 17, 13, [], 2), p('gate_seat', 20, 14, [], 2),
      p('bureau', 20, 9, [], 0, 'Bureau de change'),
      p('atm', 22, 9, [], 0, 'ATM'), p('atm', 23, 9, [], 0, 'ATM'),
      p('gate_seat', 23, 11, [], 1),
      p('trolley', 14, 14), p('trolley', 15, 14),
      p('plant', 0, 15), p('plant', 23, 15),
      exit(12, 15),
    ],
  },
  // The lobby. Rooms are upstairs: book at reception, then ride the lift (game/hotel.ts).
  hamdala: {
    w: 18, h: 14, dense: true, floor: ['#f5f0e6', '#e7dccb'], wall: '#fbf7ef', doorX: 8,
    blocked: [{ x: 12, z: 9, w: 5, d: 3 }], blockedColour: '#38bdf8',
    tiles: [{ x: 11, z: 8, w: 7, d: 5, colour: '#d9c7a3' }, { x: 0, z: 0, w: 7, d: 8, colour: '#e9d3b4' }],
    props: [
      // Restaurant, back left
      p('pot_counter', 1, 0, ['buffet'], 0, 'Buffet'),
      p('pot_counter', 4, 0, ['buffet'], 0, 'Grill & desserts'),
      p('dining', 1, 3, ['buffet'], 0, 'Restaurant table'),
      p('dining', 4, 3, ['buffet'], 0, 'Restaurant table'),
      p('dining', 1, 6, ['buffet'], 0, 'Restaurant table'),
      p('wall_window', 0, 1, [], 1),
      p('wall_window', 0, 3, [], 1),
      // Reception, facing the door
      p('plant', 6, 1),
      p('reception', 7, 1, ['hotel_desk', 'work'], 0, 'Reception'),
      p('plant', 11, 1),
      p('wall_art', 6, 0, [], 2),
      p('wall_art', 11, 0, [], 2),
      p('hotel_lift', 12, 0, ['hotel_lift'], 0, 'Lift to the rooms'),
      p('luggage_cart', 15, 1),
      // Fountain and the red carpet in from the door
      p('fountain', 8, 5),
      p('red_carpet', 8, 9),
      // Lounge and bar, right
      p('velvet_rug', 11, 4),
      p('sofa', 11, 3, ['lobby_lounge'], 0, 'Lobby lounge'),
      p('coffee_table', 11, 5),
      p('armchair', 10, 4, ['lobby_lounge'], 3, 'Lobby lounge'),
      p('marble_bar', 16, 4, ['presidential_suite'], 1, 'Lobby bar'),
      p('bar_stool', 15, 4, ['presidential_suite'], 3, 'Bar stool'),
      p('bar_stool', 15, 5, ['presidential_suite'], 3, 'Bar stool'),
      // Pool terrace, front right
      p('pool_edge', 14, 8, ['swim'], 0, 'Swimming pool'),
      p('sun_lounger', 17, 9, ['swim'], 0, 'Sun lounger'),
      p('sun_lounger', 11, 10, ['swim'], 0, 'Sun lounger'),
      p('plant', 0, 13),
      p('plant', 17, 13),
      p('plant', 5, 9),
      exit(8, 13),
    ],
  },
  // Rooms. The door mat at the front takes you back down to the lobby.
  hamdala_standard: {
    w: 7, h: 6, room: true, dense: true, floor: ['#c9b08a', '#c2a880'], wall: '#f3ead8', doorX: 5,
    tiles: [{ x: 0, z: 3, w: 2, d: 3, colour: '#dbeafe' }],
    props: [
      p('bed_foam', 1, 0, ['room_sleep', 'room_nap'], 0, 'Bed'),
      p('nightstand', 3, 0),
      p('wall_window', 4, 0, ['room_view'], 2, 'Window'),
      p('kettle_table', 6, 0, ['room_tea'], 0, 'Tea tray'),
      p('tv', 6, 1, ['room_tv'], 1, 'TV'),
      p('plastic_chair', 4, 2, ['room_tv'], 3, 'Chair'),
      p('toilet', 0, 3, ['room_toilet'], 3, 'Toilet'),
      p('shower', 0, 5, ['room_shower'], 3, 'Shower'),
      p('wardrobe', 2, 5, [], 2),
      p('room_door', 5, 5, ['leave_room'], 0, 'Door'),
    ],
  },
  hamdala_deluxe: {
    w: 9, h: 7, room: true, dense: true, floor: ['#b98d5f', '#b08556'], wall: '#f1e4cf', doorX: 6,
    tiles: [{ x: 0, z: 0, w: 2, d: 4, colour: '#e0f2fe' }],
    props: [
      p('bathtub', 0, 0, ['room_bath'], 0, 'Bathtub'),
      p('toilet', 0, 2, ['room_toilet'], 3, 'Toilet'),
      p('hot_shower', 0, 3, ['room_shower'], 3, 'Hot shower'),
      p('nightstand', 3, 0),
      p('bed_royal', 4, 0, ['room_sleep', 'room_nap'], 0, 'Four-poster bed'),
      p('nightstand', 6, 0),
      p('wall_window', 7, 0, ['room_view'], 2, 'Window'),
      p('minibar', 8, 2, ['room_minibar'], 1, 'Minibar'),
      p('rug', 6, 4),
      p('sofa', 5, 4, ['room_tv'], 3, 'Sofa'),
      p('tv', 8, 4, ['room_tv'], 1, 'TV'),
      p('wardrobe', 0, 5, [], 3),
      p('desk', 2, 6, ['room_read'], 2, 'Work desk'),
      p('plant', 8, 6),
      p('room_door', 6, 6, ['leave_room'], 0, 'Door'),
    ],
  },
  hamdala_executive: {
    w: 12, h: 8, room: true, dense: true, floor: ['#8a5a3c', '#825236'], wall: '#efe2cc', doorX: 8,
    tiles: [{ x: 0, z: 0, w: 3, d: 3, colour: '#e0f2fe' }],
    props: [
      p('bathtub', 0, 0, ['room_bath'], 0, 'Bathtub'),
      p('sink', 2, 0),
      p('bidet_toilet', 0, 2, ['room_toilet'], 3, 'Toilet'),
      p('hot_shower', 2, 2, ['room_shower'], 0, 'Hot shower'),
      p('nightstand', 3, 0),
      p('bed_royal', 4, 0, ['room_sleep', 'room_nap'], 0, 'King bed'),
      p('nightstand', 6, 0),
      p('wall_window', 7, 0, ['room_view'], 2, 'Window'),
      p('wall_art', 9, 0, [], 2),
      p('massage_chair', 10, 0, ['room_massage'], 0, 'Massage chair'),
      p('minibar', 11, 1, ['room_minibar'], 1, 'Minibar'),
      // Lounge
      p('rug', 9, 3),
      p('sofa', 8, 2, ['room_tv'], 3, 'Lounge sofa'),
      p('tv', 11, 3, ['room_tv'], 1, 'TV'),
      p('floor_lamp', 8, 5),
      p('dining', 4, 5, ['room_service'], 0, 'Dining table'),
      p('desk', 0, 5, ['room_read'], 3, 'Work desk'),
      p('wardrobe', 1, 7, [], 2),
      p('plant', 11, 7),
      p('room_door', 8, 7, ['leave_room'], 0, 'Door'),
    ],
  },
  hamdala_presidential: {
    w: 15, h: 10, room: true, dense: true, floor: ['#5b3a29', '#533424'], wall: '#f6ecd6', doorX: 8,
    tiles: [{ x: 0, z: 0, w: 4, d: 4, colour: '#f1f5f9' }],
    props: [
      p('jacuzzi', 0, 0, ['room_jacuzzi'], 0, 'Jacuzzi'),
      p('gold_toilet', 3, 0, ['room_toilet'], 0, 'Gold toilet'),
      p('sink', 0, 3, [], 3),
      p('hot_shower', 3, 3, ['room_shower'], 0, 'Rain shower'),
      p('nightstand', 5, 0),
      p('golden_bed', 6, 0, ['room_sleep', 'room_nap'], 0, 'Emperor bed'),
      p('nightstand', 8, 0),
      p('wall_window', 9, 0, ['room_view'], 2, 'Window'),
      p('wall_art', 4, 0, [], 2),
      p('ming_vase', 11, 0),
      p('wine_cellar', 12, 0),
      p('marble_bar', 13, 1, ['room_bar'], 0, 'Private bar'),
      // Lounge and cinema
      p('velvet_rug', 11, 4),
      p('leather_sectional', 9, 3, ['room_tv'], 3, 'Leather sectional'),
      p('home_cinema', 14, 3, ['room_tv'], 1, 'Home cinema'),
      p('chandelier_lamp', 8, 7),
      p('aquarium', 0, 4, [], 3),
      p('grand_piano', 1, 6, ['room_piano'], 0, 'Grand piano'),
      p('dining', 5, 6, ['room_service'], 0, 'Dining table'),
      p('cigar_lounge', 11, 7, ['room_lounge'], 0, 'Cigar lounge'),
      p('massage_chair', 14, 8, ['room_massage'], 1, 'Massage chair'),
      p('plant', 0, 9),
      p('plant', 14, 9),
      p('room_door', 8, 9, ['leave_room'], 0, 'Door'),
    ],
  },
  camp: {
    w: 16, h: 11, outdoor: true, jungle: true, floor: ['#3f6b2f', '#385f2a'], doorX: 8,
    props: [
      ...[1, 3, 5].map((x) => p('prison_mat', x, 1, ['camp_sleep'], 0, 'Straw mat')),
      p('pot_counter', 12, 1, ['camp_eat'], 0, 'Pot on the fire'),
      p('bench', 3, 6, ['camp_gist'], 0, 'Log'),
      p('bench', 11, 6, ['camp_gist'], 0, 'Log'),
      p('neem', 0, 4), p('neem', 15, 4), p('neem', 0, 8), p('neem', 15, 8), p('neem', 6, 9), p('neem', 10, 9),
      p('bamboo_gate', 8, 10, [], 0, 'Guarded gap'),
    ],
  },
  club: {
    w: 18, h: 14, floor: ['#0f172a', '#020617'], wall: '#1e1b4b', doorX: 9,
    props: [
      p('dj_booth', 7, 1, ['dj_hype', 'dorime', 'work'], 0, 'DJ Booth & Sound Deck'),
      p('dance_floor', 6, 4, ['dance', 'spray_money', 'spray_heavy', 'dorime'], 0, 'Illuminated Dance Floor'),
      p('vip_booth', 1, 2, ['bottle_service', 'champagne_tower', 'spray_money', 'spray_heavy', 'dorime'], 0, 'VIP Diamond Section'),
      p('vip_booth', 1, 5, ['bottle_service', 'spray_money'], 0, 'VIP Platinum Lounge'),
      p('vip_booth', 14, 2, ['bottle_service', 'spray_money', 'spray_heavy'], 2, 'VIP Gold Section'),
      p('vip_booth', 14, 5, ['bottle_service', 'champagne_tower', 'spray_money', 'dorime', 'club_takeover'], 2, 'VVIP Billionaire Lounge'),
      p('club_bar', 1, 9, ['cocktail', 'bottle_service'], 0, 'Cocktail & Champagne Bar'),
      p('bar_stool', 1, 11, ['cocktail'], 0, 'Bar Stool'),
      p('bar_stool', 3, 11, ['cocktail'], 0, 'Bar Stool'),
      p('money_pile', 15, 9, ['spray_money', 'spray_heavy'], 0, 'Crisp Naira Cash Dispenser'),
      exit(9, 13),
    ],
  },
  // The rest are grouped by kind of place.
  ...CIVIC,
  ...CULTURE,
  ...TRADE,
  ...OUTDOOR,
  ...VILLA,
};

// Keep venue interiors readable while retaining every activity on a representative prop.
for (const interior of Object.values(INTERIORS)) {
  if (interior.dense) continue;
  const byType = new Map<string, Prop[]>();
  const props: Prop[] = [];
  for (const prop of interior.props) {
    const sameType = byType.get(prop.type) ?? [];
    if (sameType.length < 2) {
      sameType.push(prop);
      byType.set(prop.type, sameType);
      props.push(prop);
      continue;
    }
    sameType[0].actions = [...new Set([...sameType[0].actions, ...prop.actions])];
  }
  interior.props = props;
}

/* ---------- Grid helpers ---------- */

export function propSize(prop: { type: string; rot: number }) {
  const d = propDef(prop.type);
  return prop.rot % 2 ? { w: d.d, d: d.w } : { w: d.w, d: d.d };
}

export function propCells(prop: Prop): Cell[] {
  const { w, d } = propSize(prop);
  const cells: Cell[] = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) cells.push({ x: prop.x + i, z: prop.z + j });
  return cells;
}

export function propTransform(prop: Prop) {
  const { w, d } = propSize(prop);
  return { cx: prop.x + w / 2, cz: prop.z + d / 2, yaw: -prop.rot * (Math.PI / 2) };
}

export const exitCell = (it: Interior): Cell => ({ x: it.doorX, z: it.h - 1 });

/** Where you stand to use a prop from its front (the lift you step out of, coming down from a room). */
export function frontCell(it: Interior, type: string): Cell {
  const prop = it.props.find((q) => q.type === type);
  if (!prop) return exitCell(it);
  const { w, d } = propSize(prop);
  return { x: prop.x + Math.floor((w - 1) / 2), z: prop.z + d };
}

const k = (x: number, z: number) => `${x},${z}`;

function blockedSet(it: Interior) {
  const set = new Set<string>();
  for (const r of it.blocked ?? []) for (let x = r.x; x < r.x + r.w; x++) for (let z = r.z; z < r.z + r.d; z++) set.add(k(x, z));
  for (const prop of it.props) if (!propDef(prop.type).floor) for (const c of propCells(prop)) set.add(k(c.x, c.z));
  return set;
}

const cache = new Map<Interior, Set<string>>();
const blockedOf = (it: Interior) => {
  if (!cache.has(it)) cache.set(it, blockedSet(it));
  return cache.get(it)!;
};

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function bfs(it: Interior, start: Cell, isGoal: (c: Cell) => boolean): Cell[] | null {
  if (isGoal(start)) return [];
  const blocked = blockedOf(it);
  const prev = new Map<string, Cell>([[k(start.x, start.z), start]]);
  const queue: Cell[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const [dx, dz] of DIRS) {
      const nx = cur.x + dx;
      const nz = cur.z + dz;
      const key = k(nx, nz);
      if (nx < 0 || nz < 0 || nx >= it.w || nz >= it.h || prev.has(key) || blocked.has(key)) continue;
      prev.set(key, cur);
      const next = { x: nx, z: nz };
      if (isGoal(next)) {
        const path: Cell[] = [next];
        let c = cur;
        while (c.x !== start.x || c.z !== start.z) {
          path.unshift(c);
          c = prev.get(k(c.x, c.z))!;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

export function interiorPathToCell(it: Interior, start: Cell, goal: Cell) {
  if (blockedOf(it).has(k(goal.x, goal.z))) return null;
  return bfs(it, start, (c) => c.x === goal.x && c.z === goal.z);
}

export function interiorPathToProp(it: Interior, start: Cell, prop: Prop) {
  const cells = propCells(prop);
  if (propDef(prop.type).floor) {
    const ks = new Set(cells.map((c) => k(c.x, c.z)));
    return bfs(it, start, (c) => ks.has(k(c.x, c.z)));
  }
  const blocked = blockedOf(it);
  return bfs(it, start, (c) => !blocked.has(k(c.x, c.z)) && cells.some((f) => Math.abs(f.x - c.x) + Math.abs(f.z - c.z) === 1));
}

// import.meta.env only exists under Vite; the Worker bundle imports this file too.
if (import.meta.env?.DEV) {
  for (const [id, it] of Object.entries(INTERIORS))
    for (const prop of it.props) {
      // What is inside a cell is reached from inside it.
      const cell = it.cells?.find((r) => prop.x >= r.x && prop.x < r.x + r.w && prop.z >= r.z && prop.z < r.z + r.d);
      const from = cell ? { x: cell.x + Math.floor(cell.w / 2), z: cell.z + cell.d - 1 } : exitCell(it);
      if (prop.actions.length && !interiorPathToProp(it, from, prop)) console.warn(`[interior] ${id}: can't reach ${prop.name ?? prop.type}`);
    }
}

/** A place's props as they are in the city the player is in: some are left out of one city's version. */
export const propsHere = (it: Interior): Prop[] => {
  const city = activeMap().id;
  return it.props.some((prop) => prop.notIn) ? it.props.filter((prop) => !prop.notIn?.includes(city)) : it.props;
};
