// Worship, history, shopping and football on a screen: the mosque, the cathedral, the old legislative chamber,
// the archive, the museum, the viewing centre, the boutique and the mall.

import { exit, p, sign, type Interior, type PropDef } from '../interiorKit';

/** Sizes of the props only these places use (their models are in three/props/culture.tsx). */
export const CULTURE_SIZES: Record<string, PropDef> = {
  // Mosque
  mosque_mihrab: { w: 2, d: 1 },
  mosque_minbar: { w: 1, d: 2 },
  mosque_window: { w: 2, d: 1, floor: true },
  mosque_shelf: { w: 1, d: 1 },
  mosque_ablution: { w: 2, d: 1 },
  mosque_toilet: { w: 1, d: 1 },
  mosque_shoes: { w: 2, d: 1 },
  mosque_sadaqah: { w: 1, d: 1 },
  // Church
  church_altar: { w: 2, d: 1 },
  church_pulpit: { w: 1, d: 1 },
  church_choir: { w: 3, d: 1, seat: { y: 0.45, z: 0 } },
  church_organ: { w: 2, d: 1 },
  church_window: { w: 1, d: 1, floor: true },
  church_offering: { w: 1, d: 1 },
  // Legislative chamber
  lugard_chair: { w: 2, d: 2 },
  lugard_table: { w: 2, d: 1 },
  lugard_bench: { w: 3, d: 1, seat: { y: 0.45, z: 0 } },
  lugard_medallion: { w: 2, d: 2, floor: true },
  // Archive
  arewa_desk: { w: 2, d: 1 },
  arewa_lectern: { w: 1, d: 1 },
  arewa_regalia: { w: 1, d: 1 },
  // Museum
  museum_case: { w: 1, d: 1 },
  museum_wallcase: { w: 2, d: 1 },
  museum_centerpiece: { w: 2, d: 2 },
  museum_panel: { w: 1, d: 1, floor: true },
  museum_desk: { w: 2, d: 1 },
  // Viewing centre
  viewing_screen: { w: 4, d: 1 },
  viewing_board: { w: 2, d: 1, floor: true },
  viewing_crates: { w: 1, d: 1 },
  viewing_fans: { w: 1, d: 1 },
  // Boutique
  boutique_mannequin: { w: 1, d: 1 },
  boutique_fitting: { w: 2, d: 1 },
  boutique_mirror: { w: 1, d: 1 },
  boutique_counter: { w: 2, d: 1 },
  boutique_shelf: { w: 2, d: 1 },
  // Mall
  mall_shopfront: { w: 3, d: 1 },
  mall_escalator: { w: 4, d: 2 },
  mall_perfume: { w: 2, d: 1 },
  mall_popcorn: { w: 1, d: 1 },
};

const PRAYER = ['pray', 'jumat'];
const MATCH = ['watch', 'friendly_bet', 'cr7_messi'];

export const CULTURE: Record<string, Interior> = {
  // Carpet in rows facing the mihrab in the back wall; shoes and the wash area stay by the door.
  mosque: {
    w: 10, h: 9, dense: true, floor: ['#1b6b3f', '#19653b'], wall: '#fafaf9', doorX: 5,
    tiles: [
      // The rows the congregation lines up on
      ...[3, 4, 5, 6].map((z) => ({ x: z < 4 ? 0.3 : 2.2, z: z - 0.04, w: z < 4 ? 9.4 : 7.5, d: 0.08, colour: '#e9d8a6' })),
      { x: 2, z: 7, w: 8, d: 2, colour: '#d6d3d1' },
      { x: 0, z: 4, w: 2, d: 5, colour: '#bfdbfe' },
    ],
    staff: [{ x: 7.5, z: 1.6, yaw: 0, look: 'imam' }],
    props: [
      p('mosque_shelf', 0, 0, [], 0, 'Qur’an shelf'),
      p('mosque_window', 1, 0, [], 2),
      p('mosque_mihrab', 4, 0, PRAYER, 0, 'Mihrab'),
      p('mosque_minbar', 6, 0, ['jumat'], 0, 'Minbar'),
      p('mosque_window', 7, 0, [], 2),
      p('mosque_shelf', 9, 0, [], 0, 'Qur’an shelf'),
      ...[2, 3, 4, 5, 6, 7].map((x) => p('prayer_mat', x, 2, PRAYER, 0, 'Prayer mat')),
      p('mosque_window', 0, 1, [], 1),
      // Wash area on the tiles, left of the door
      p('mosque_ablution', 0, 4, ['public_bath'], 3, 'Public wash area'),
      // Kaduna's mosque only: the National Mosque in Abuja has no toilet in the prayer hall.
      { ...p('mosque_toilet', 0, 7, ['public_toilet'], 3, 'Public toilet'), notIn: ['abuja'] },
      p('mosque_sadaqah', 7, 7, ['sadaqah'], 0, 'Sadaqah box'),
      p('mosque_shoes', 9, 7, [], 1, 'Shoe rack'),
      exit(5, 8),
    ],
  },
  // Nave with pews either side of the aisle; chancel at the back with the altar, pulpit, choir and organ.
  church: {
    w: 10, h: 12, dense: true, floor: ['#e7e5e4', '#dad6d2'], wall: '#f5f5f4', doorX: 5,
    tiles: [
      { x: 0, z: 0, w: 10, d: 3, colour: '#8b2323' },
      { x: 4, z: 3, w: 2, d: 9, colour: '#9f1239' },
    ],
    staff: [
      { x: 2.5, z: 1.7, yaw: 0, look: 'pastor' },
      { x: 1.5, z: 0.6, yaw: Math.PI / 2, look: 'chorister' },
      { x: 1.5, z: 1.5, yaw: Math.PI / 2, look: 'chorister' },
    ],
    props: [
      p('church_choir', 0, 0, ['choir_lead'], 3, 'Choir stalls'),
      p('church_window', 2, 0, [], 2),
      p('church_altar', 4, 0, ['service'], 0, 'Altar'),
      p('church_window', 7, 0, [], 2),
      p('church_organ', 8, 0, ['choir_lead'], 0, 'Organ'),
      p('church_pulpit', 2, 2, ['service'], 0, 'Pulpit'),
      p('speaker', 9, 2),
      ...[4, 6, 8].flatMap((z) => [p('pew', 1, z, ['service'], 2, 'Pew'), p('pew', 6, z, ['service'], 2, 'Pew')]),
      p('pew', 1, 10, ['service'], 2, 'Pew'),
      ...[4, 6, 8, 10].map((z) => p('church_window', 0, z, [], 1)),
      p('church_offering', 7, 10, ['tithe_envelope'], 0, 'Offering box'),
      p('plant', 9, 11),
      exit(5, 11),
    ],
  },
  // The chamber: the Speaker's chair on its dais, the clerk's table and mace, benches facing across the floor.
  lugard: {
    w: 12, h: 9, dense: true, floor: ['#c9a66b', '#c19d61'], wall: '#f0e6d2', doorX: 6,
    tiles: [{ x: 4, z: 2, w: 4, d: 7, colour: '#1f6b45' }],
    staff: [{ x: 1.5, z: 5.5, yaw: Math.PI / 2, look: 'guide' }],
    props: [
      p('exhibit', 0, 0, ['tour'], 0, 'Northern Region history'),
      p('flag_stand', 4, 0),
      p('lugard_chair', 5, 0, ['lugard_chair', 'tour'], 0, 'The Speaker’s chair'),
      p('flag_stand', 7, 0),
      p('exhibit', 10, 0, ['tour'], 0, 'Old parliament records'),
      p('wall_portrait', 0, 1, ['tour'], 1, 'Sardauna’s portrait'),
      p('lugard_table', 5, 3, ['tour'], 0, 'Clerk’s table & mace'),
      p('lugard_medallion', 5, 4),
      // Government benches on the left, opposition on the right
      p('lugard_bench', 1, 2, [], 3), p('lugard_bench', 3, 2, [], 3),
      p('lugard_bench', 8, 2, [], 1), p('lugard_bench', 10, 2, [], 1),
      p('info_desk', 0, 6, ['tour'], 3, 'Tour guide'),
      p('velvet_rope', 2, 7), p('velvet_rope', 8, 7),
      p('plant', 0, 8), p('plant', 11, 8),
      exit(6, 8),
    ],
  },
  // Archive shelves and reading tables on the left; the Premier's study, kept as he left it, on the right.
  arewa: {
    w: 10, h: 8, dense: true, floor: ['#b98d5f', '#b08556'], wall: '#f7f3ea', doorX: 5,
    tiles: [{ x: 5, z: 0, w: 5, d: 5, colour: '#8a5a3c' }],
    staff: [{ x: 4.5, z: 2.6, yaw: 0, look: 'guide' }],
    props: [
      p('archive_shelf', 0, 0, ['archive'], 0, 'Colonial-era files'),
      p('archive_shelf', 3, 0, ['archive'], 0, 'Sardauna’s letters'),
      p('flag_stand', 5, 0),
      p('wall_portrait', 6, 0, [], 2),
      p('archive_shelf', 8, 0, ['archive'], 0, 'Northern newspapers'),
      p('louvre_window', 0, 1, [], 1),
      p('reading_table', 1, 2, ['archive'], 0, 'Reading table'),
      p('reading_table', 1, 4, ['archive'], 0, 'Reading table'),
      // The study
      p('arewa_desk', 6, 1, [], 0, 'The Premier’s desk'),
      p('rug', 6, 2),
      p('arewa_lectern', 8, 3, ['sardauna_recite'], 0, 'Lectern'),
      p('arewa_regalia', 9, 2, [], 1, 'Robes of office'),
      p('statue', 9, 4, [], 0, 'Bust of the Sardauna'),
      p('floor_lamp', 5, 1),
      p('plant', 0, 7), p('plant', 9, 7),
      exit(5, 7),
    ],
  },
  // Lit cases round the walls, single heads on plinths, and the big terracotta in the middle behind a rope.
  museum: {
    w: 11, h: 8, dense: true, floor: ['#d9c7a8', '#d0bd9c'], wall: '#f4e7d3', doorX: 5,
    tiles: [{ x: 4, z: 1, w: 4, d: 4, colour: '#5b4636' }],
    staff: [{ x: 8, z: 5.6, yaw: 0, look: 'guide' }],
    props: [
      p('museum_wallcase', 0, 0, ['nok'], 0, 'Benin bronzes', 'BRONZES'),
      p('museum_wallcase', 4, 0, ['nok'], 0, 'Nok terracotta heads', 'TERRACOTTA'),
      p('museum_wallcase', 6, 0, ['nok'], 0, 'Hausa crafts', 'CRAFTS'),
      p('museum_wallcase', 9, 0, ['nok'], 0, 'Royal regalia', 'REGALIA'),
      p('museum_panel', 0, 2, [], 1),
      p('museum_centerpiece', 5, 2, ['nok'], 0, 'Nok sculpture'),
      p('velvet_rope', 5, 4),
      p('museum_case', 2, 2, ['nok'], 0, 'Terracotta head'),
      p('museum_case', 8, 2, ['nok'], 0, 'Terracotta head'),
      p('museum_case', 2, 4, ['nok'], 0, 'Bronze head'),
      p('museum_case', 8, 4, ['nok'], 0, 'Ife head'),
      p('museum_wallcase', 0, 5, ['nok'], 3, 'Old Zaria pottery', 'POTTERY'),
      p('museum_desk', 7, 6, [], 0, 'Tickets'),
      p('plant', 0, 7), p('plant', 10, 7),
      exit(5, 7),
    ],
  },
  // A shack with a generator: the match on the big screen, rows of benches, the fixtures chalked up.
  viewing: {
    w: 12, h: 9, dense: true, floor: ['#9c8062', '#92775c'], wall: '#cfc6b4', doorX: 6,
    staff: [{ x: 8.5, z: 7.5, yaw: Math.PI, look: 'attendant' }],
    props: [
      p('viewing_screen', 0, 0, ['watch', 'friendly_bet'], 0, 'Big match screen'),
      p('viewing_board', 8, 0, ['friendly_bet'], 2, 'Fixtures board'),
      p('cooler', 10, 0, ['buy_cokes'], 0, 'Cold drinks fridge'),
      p('generator', 11, 0, ['unplug_gen'], 0, 'Tiger generator'),
      p('viewing_crates', 11, 2, ['buy_cokes'], 1, 'Crates of minerals'),
      // Benches face the screen
      p('bench', 0, 2, MATCH, 2, 'Wooden bench'), p('bench', 2, 2, MATCH, 2, 'Wooden bench'), p('bench', 4, 2, MATCH, 2, 'Wooden bench'),
      p('bench', 0, 4, MATCH, 2, 'Wooden bench'), p('bench', 2, 4, MATCH, 2, 'Wooden bench'), p('bench', 4, 4, MATCH, 2, 'Wooden bench'),
      p('bench', 0, 6, MATCH, 2, 'Wooden bench'),
      p('plastic_chair', 7, 3, ['smash_chair', 'cr7_messi'], 2, 'Plastic chair'),
      p('plastic_chair', 8, 3, ['smash_chair', 'cr7_messi'], 2, 'Plastic chair'),
      p('viewing_fans', 9, 4, ['vuvuzela'], 0, 'Fans’ corner'),
      sign('wall_sign', 0, 7, 'GATE FEE ₦200', 1),
      exit(6, 8),
    ],
  },
  // Rails along the back, fitting rooms, agbada on mannequins, the gold in a glass counter.
  boutique: {
    w: 10, h: 8, dense: true, floor: ['#fafaf9', '#ece8e4'], wall: '#fdf4ff', doorX: 5,
    staff: [{ x: 9.5, z: 3, yaw: -Math.PI / 2, look: 'stylist' }],
    props: [
      p('boutique_fitting', 0, 0, ['try_agbada'], 0, 'Fitting room'),
      p('shop_rack', 3, 0, ['clothes'], 0, 'Agbada & kaftan'),
      p('shop_rack', 5, 0, ['clothes'], 0, 'Lace & owambe gowns'),
      p('shop_rack', 8, 0, ['clothes'], 0, 'Suits'),
      p('boutique_mirror', 0, 2, ['selfie'], 3, 'Big mirror'),
      p('armchair', 1, 3, [], 3),
      p('boutique_shelf', 0, 5, ['clothes'], 3, 'Shoes & bags'),
      p('velvet_rug', 3, 2),
      p('boutique_mannequin', 3, 3, ['try_agbada'], 0, 'Royal blue agbada', '#1e3a8a'),
      p('boutique_mannequin', 5, 3, ['try_agbada'], 0, 'Wine agbada', '#7f1d1d'),
      p('boutique_mannequin', 7, 6, ['try_agbada'], 0, 'Presidential agbada', '#f8fafc'),
      p('boutique_counter', 8, 2, ['gold_cufflinks', 'bargain_war'], 1, 'Jewellery counter & till'),
      p('chandelier_lamp', 9, 5),
      p('plant', 0, 7), p('plant', 9, 7),
      exit(5, 7),
    ],
  },
  // Shopfronts along the back, the fountain in the atrium, the escalator up, and the cinema down the left wall.
  mall: {
    w: 18, h: 12, dense: true, floor: ['#f1f5f9', '#e2e8f0'], wall: '#f8fafc', doorX: 9,
    tiles: [
      { x: 0, z: 6, w: 6, d: 6, colour: '#4a1d2f' },
      { x: 7, z: 1, w: 4, d: 8, colour: '#f3e7cf' },
      { x: 0, z: 0, w: 3, d: 5, colour: '#fde7f0' },
    ],
    staff: [
      { x: 2.5, z: 0.6, yaw: 0, look: 'clerk' },
      { x: 6.4, z: 1.4, yaw: 0, look: 'attendant' },
      { x: 13.4, z: 1.4, yaw: 0, look: 'stylist' },
      { x: 12, z: 5.6, yaw: 0, look: 'stylist' },
      { x: 4.5, z: 5.4, yaw: 0, look: 'cook' },
      { x: 11.5, z: 10.5, yaw: Math.PI, look: 'security' },
    ],
    props: [
      p('icecream', 0, 0, ['icecream'], 0, 'Ice cream bar'),
      p('mall_shopfront', 4, 0, ['phones', 'window'], 0, 'Phone shop', 'PHONES'),
      p('mall_shopfront', 11, 0, ['clothes', 'window'], 0, 'Fashion store', 'FASHION'),
      p('shop_rack', 16, 0, ['clothes', 'window'], 0, 'Shoe rack'),
      p('cafe_table', 1, 2), p('cafe_table', 2, 4),
      // Atrium
      p('fountain', 8, 4, ['mall_flex'], 0, 'Central atrium'),
      p('planter', 7, 4, [], 1), p('planter', 10, 4, [], 1),
      p('bench', 8, 7, [], 0),
      p('kiosk', 10, 8, [], 0, 'Mall directory'),
      p('mall_escalator', 14, 3, ['escalator_stunt'], 0, 'Escalator'),
      p('mall_perfume', 11, 6, ['perfume_sample'], 0, 'Perfume counter'),
      p('shop_rack', 17, 6, ['clothes', 'window'], 1, 'Clothes rack'),
      p('atm', 17, 9, [], 1, 'ATM'),
      p('bench', 14, 10, [], 0),
      // Cinema
      sign('wall_sign', 0, 3, 'CINEMA', 1),
      p('mall_popcorn', 5, 5, ['movie'], 0, 'Popcorn & tickets'),
      p('velvet_rope', 5, 6, [], 1),
      p('screen', 0, 6, ['movie'], 3, 'Cinema screen'),
      p('cinema_seat', 2, 6, ['movie'], 1, 'Cinema seats'), p('cinema_seat', 2, 9, ['movie'], 1, 'Cinema seats'),
      p('cinema_seat', 4, 6, ['movie'], 1, 'Cinema seats'), p('cinema_seat', 4, 9, ['movie'], 1, 'Cinema seats'),
      p('plant', 17, 11), p('plant', 7, 11),
      exit(9, 11),
    ],
  },
};
