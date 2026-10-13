// Aso Villa (game/villa.ts): the President's office, and the suite behind it.

import { exit, p, sign, type Interior } from '../interiorKit';

export const VILLA: Record<string, Interior> = {
  // The desk between the flags at the back, chairs for whoever has an audience, and a lounge for everybody still waiting.
  villa: {
    w: 16, h: 12, dense: true, floor: ['#7a4b32', '#70432c'], wall: '#f6efe0', doorX: 8,
    tiles: [{ x: 5, z: 0, w: 6, d: 7, colour: '#14532d' }],
    staff: [
      { x: 12.5, z: 3.5, yaw: 0, look: 'office' },
      { x: 15.5, z: 2.5, yaw: 0, look: 'security' },
      { x: 6.5, z: 10.6, yaw: 0, look: 'security' },
      { x: 11.5, z: 10.6, yaw: 0, look: 'security' },
    ],
    props: [
      p('archive_shelf', 0, 0, [], 0, 'State papers'),
      p('wall_window', 3, 0, [], 2),
      p('flag_stand', 6, 0),
      p('wall_portrait', 7, 0, [], 2),
      p('wall_portrait', 8, 0, [], 2),
      p('flag_stand', 9, 0),
      p('wall_window', 11, 0, [], 2),
      // The President's desk, and the two chairs across it
      p('office_desk', 7, 2, ['villa_desk', 'villa_address', 'villa_selfie'], 2, 'The President’s desk'),
      p('chandelier_lamp', 5, 2),
      p('floor_lamp', 10, 2),
      p('velvet_rug', 7, 4),
      p('armchair', 6, 4, ['villa_audience'], 2, 'Visitor’s chair'),
      p('armchair', 10, 4, ['villa_audience'], 2, 'Visitor’s chair'),
      // Through to the suite: the President only
      sign('post_sign', 13, 1, 'PRIVATE\nRESIDENCE'),
      p('room_door', 14, 1, ['villa_suite'], 0, 'Presidential Suite'),
      // Where everybody else waits
      p('sofa', 1, 4, ['villa_wait'], 3, 'Waiting lounge'),
      p('coffee_table', 3, 5, [], 1),
      p('armchair', 5, 8, ['villa_wait'], 2, 'Waiting lounge'),
      p('plant', 0, 8),
      // State gifts
      p('statue', 14, 5, ['villa_tour'], 0, 'Bust of Nnamdi Azikiwe'),
      p('exhibit', 13, 8, ['villa_tour'], 0, 'Gifts of state'),
      p('ming_vase', 15, 7),
      p('red_carpet', 8, 7),
      p('plant', 0, 11),
      p('plant', 15, 11),
      exit(8, 11),
    ],
  },
  // The suite. The door mat at the front takes you back out to the office.
  villa_suite: {
    w: 15, h: 10, room: true, dense: true, floor: ['#4a3324', '#422d1f'], wall: '#f3ecd9', doorX: 8,
    tiles: [{ x: 0, z: 0, w: 4, d: 4, colour: '#f1f5f9' }],
    staff: [{ x: 14, z: 0.55, yaw: 0, look: 'butler' }],
    props: [
      p('jacuzzi', 0, 0, ['room_jacuzzi'], 0, 'Jacuzzi'),
      p('gold_toilet', 3, 0, ['room_toilet'], 0, 'Gold toilet'),
      p('sink', 0, 3, [], 3),
      p('hot_shower', 3, 3, ['room_shower'], 0, 'Rain shower'),
      p('flag_stand', 5, 0),
      p('golden_bed', 6, 0, ['room_sleep', 'room_nap'], 0, 'The President’s bed'),
      p('nightstand', 8, 0),
      p('wall_window', 9, 0, ['room_view'], 2, 'Window'),
      p('wall_portrait', 4, 0, [], 2),
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
      p('dining', 5, 6, ['room_service'], 0, 'State dining table'),
      p('cigar_lounge', 11, 7, ['room_lounge'], 0, 'Cigar lounge'),
      p('massage_chair', 14, 8, ['room_massage'], 1, 'Massage chair'),
      p('plant', 0, 9),
      p('plant', 14, 9),
      p('room_door', 8, 9, ['leave_room'], 0, 'Door'),
    ],
  },
};
