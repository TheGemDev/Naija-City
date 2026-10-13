// Banks, hospitals, police stations, offices and classrooms.

import { exit, p, sign, type Interior, type PropDef } from '../interiorKit';

/** Sizes of the props only these places use (their models are in three/props/civic.tsx). */
export const CIVIC_SIZES: Record<string, PropDef> = {
  // Bank
  bank_teller: { w: 2, d: 1, counter: true },
  bank_vault: { w: 2, d: 1 },
  bank_slip_desk: { w: 1, d: 1 },
  // Hospital
  hosp_bed: { w: 1, d: 2, bed: { y: 0.645, z: 0.86 } },
  hosp_bedside: { w: 1, d: 2 },
  hosp_pharmacy: { w: 3, d: 2, counter: true },
  hosp_reception: { w: 3, d: 1, counter: true },
  hosp_exam: { w: 2, d: 1, seat: { y: 0.76, z: 0 } },
  hosp_donor: { w: 1, d: 2, seat: { y: 0.5, z: -0.1 } },
  hosp_fridge: { w: 1, d: 1 },
  hosp_gurney: { w: 1, d: 2 },
  hosp_wheelchair: { w: 1, d: 1, seat: { y: 0.5, z: 0 } },
  // Police station
  police_bars: { w: 3, d: 1 },
  police_cell_door: { w: 3, d: 1 },
  police_counter: { w: 4, d: 1 },
  police_wanted: { w: 2, d: 1, floor: true },
  police_lockers: { w: 2, d: 1 },
  // Secretariat
  sec_registry: { w: 3, d: 1 },
  sec_files: { w: 1, d: 1 },
  // Tech hub
  tech_desk: { w: 2, d: 2, seat: { y: 0.48, z: -0.45 } },
  tech_stage: { w: 4, d: 1 },
  tech_whiteboard: { w: 2, d: 1, floor: true },
  tech_server: { w: 1, d: 1 },
  tech_coffee: { w: 2, d: 1, counter: true },
  // Polytechnic
  poly_bench: { w: 3, d: 1, seat: { y: 0.45, z: -0.25 } },
  poly_lectern: { w: 1, d: 1 },
  poly_study: { w: 2, d: 2, seat: { y: 0.45, z: -0.45 } },
  // Primary school
  school_bench: { w: 2, d: 1, seat: { y: 0.42, z: -0.22 } },
  school_bell: { w: 1, d: 1 },
  school_chart: { w: 2, d: 1, floor: true },
  school_map: { w: 2, d: 1, floor: true },
  // Prison
  prison_window: { w: 2, d: 1, floor: true },
  prison_tally: { w: 1, d: 1, floor: true },
};

const COURSES = ['course_cooking', 'course_mechanic', 'course_tailoring', 'course_trading'];

export const CIVIC: Record<string, Interior> = {
  // Banking hall: the teller line across the back, the vault in the corner, ATMs down the left wall.
  bank: {
    w: 14, h: 10, dense: true, floor: ['#f1ece2', '#e6dfd2'], wall: '#f8fafc', doorX: 7,
    tiles: [
      { x: 2, z: 0, w: 8, d: 1, colour: '#3f5d4c' },
      { x: 6, z: 2, w: 2, d: 8, colour: '#2f7a57' },
    ],
    staff: [
      { x: 3, z: 0.55, yaw: 0, look: 'teller' },
      { x: 7, z: 0.55, yaw: 0, look: 'teller' },
      { x: 9, z: 0.55, yaw: 0, look: 'banker' },
      { x: 12, z: 0.7, yaw: 0, look: 'banker' },
      { x: 8.6, z: 8.3, look: 'security' },
    ],
    props: [
      p('bank_vault', 0, 0, ['heist'], 0, 'Vault'),
      p('bank_teller', 2, 1, ['bank'], 0, 'Teller 1', '1 · CASH'),
      p('bank_teller', 4, 1, ['bank', 'work'], 0, 'Your teller window', '2 · CASH'),
      p('bank_teller', 6, 1, ['bank'], 0, 'Teller 3', '3 · TRANSFERS'),
      p('bank_teller', 8, 1, ['bank'], 0, 'Teller 4', '4 · ENQUIRIES'),
      p('flag_stand', 10, 0),
      p('filing', 10, 1),
      // Customer service, back right
      p('wall_portrait', 11, 0, [], 2),
      p('office_desk', 11, 1, ['bank'], 2, 'Customer service desk'),
      p('armchair', 12, 2, [], 2),
      p('plant', 13, 0),
      // ATMs on the left wall
      p('atm', 0, 5, ['bank', 'dispense_error'], 3, 'ATM'),
      p('atm', 0, 6, ['bank'], 3, 'ATM'),
      p('atm', 0, 7, [], 3, 'ATM'),
      // The queue
      p('queue_rope', 3, 4, ['flex_balance'], 0, 'The queue'),
      p('queue_rope', 8, 4),
      p('bank_slip_desk', 3, 6, [], 0, 'Deposit slips'),
      p('gate_seat', 13, 4, [], 1),
      p('gate_seat', 9, 8, [], 2),
      p('cooler', 13, 8, ['queue_water'], 1, 'Cold pure water'),
      p('plant', 0, 9),
      p('plant', 13, 9),
      exit(7, 9),
    ],
  },
  // Ward down the left wall with the free shower at its foot, the doctor under the screen, pharmacy and blood bank on the right, reception facing the door.
  hospital: {
    w: 14, h: 10, dense: true, floor: ['#e9f5f3', '#dcedea'], wall: '#f8fafc', doorX: 7,
    tiles: [
      { x: 0, z: 0, w: 3, d: 8, colour: '#cfe6f2' },
      { x: 10, z: 0, w: 4, d: 3, colour: '#d9f0dd' },
      { x: 11, z: 3, w: 3, d: 2, colour: '#f6dada' },
      { x: 0, z: 8, w: 2, d: 1, colour: '#bfe3f5' },
    ],
    staff: [
      { x: 7, z: 0.7, yaw: 0, look: 'doctor' },
      { x: 7.5, z: 4.6, yaw: 0, look: 'nurse' },
      { x: 12.5, z: 1, yaw: 0, look: 'nurse' },
      { x: 2.5, z: 3.5, yaw: -Math.PI / 2, look: 'nurse' },
      { x: 11.5, z: 3.9, yaw: Math.PI / 2, look: 'nurse' },
    ],
    props: [
      // Ward
      p('sink', 0, 0),
      sign('wall_sign', 1, 0, 'WARD', 2),
      p('hosp_bedside', 0, 1, [], 3),
      p('hosp_bed', 0, 2, [], 3, 'Ward bed'),
      p('hosp_bedside', 0, 3, [], 3),
      p('hosp_bed', 0, 4, [], 3, 'Ward bed'),
      p('hosp_bedside', 0, 5, [], 3),
      p('hosp_bed', 0, 6, [], 3, 'Ward bed'),
      p('shower', 0, 8, ['hosp_shower'], 0, 'Free shower'),
      // Consulting
      p('hosp_exam', 3, 0, [], 0, 'Examination couch'),
      p('office_desk', 6, 1, [], 2, 'Doctor’s desk'),
      p('plastic_chair', 6, 2, ['checkup'], 2, 'Consulting chair'),
      p('plant', 9, 0),
      // Pharmacy and blood bank
      p('hosp_pharmacy', 11, 0, [], 0, 'Pharmacy'),
      p('hosp_fridge', 13, 2, [], 1, 'Blood bank'),
      p('hosp_donor', 12, 3, ['donate_blood'], 1, 'Blood donation chair'),
      p('hosp_donor', 12, 4, ['donate_blood'], 1, 'Blood donation chair'),
      // Reception and waiting room
      p('hosp_reception', 6, 5, [], 0, 'Reception'),
      p('plastic_chair', 9, 5, ['volunteer_triage'], 0, 'Records desk'),
      p('filing', 10, 5, [], 0, 'Patient files'),
      p('gate_seat', 3, 6, ['faint_spell'], 0, 'Waiting room'),
      p('gate_seat', 2, 8, ['faint_spell'], 2, 'Waiting room'),
      p('hosp_gurney', 13, 6),
      p('hosp_wheelchair', 12, 8, [], 1),
      p('water_dispenser', 10, 9),
      p('plant', 0, 9),
      p('plant', 13, 9),
      exit(7, 9),
    ],
  },
  // Holding cell in the back corner, the charge-room counter facing the door, desks and case files behind it.
  police: {
    w: 14, h: 10, dense: true, floor: ['#d6d3d1', '#c7c5c4'], wall: '#f5f5f4', doorX: 7,
    tiles: [
      { x: 0, z: 0, w: 3, d: 4, colour: '#8f96a3' },
      { x: 3, z: 0, w: 11, d: 3, colour: '#c9d3e0' },
    ],
    staff: [
      { x: 6.2, z: 3.55, yaw: 0, look: 'police' },
      { x: 7.8, z: 3.55, yaw: 0, look: 'police' },
      { x: 10, z: 1.75, yaw: 0, look: 'police' },
      { x: 3.6, z: 2.5, yaw: -Math.PI / 2, look: 'police' },
    ],
    props: [
      // Holding cell
      p('bench', 0, 0, [], 3, 'Detainees’ bench'),
      p('bucket', 0, 2),
      p('police_cell_door', 2, 0, [], 1, 'Cell door'),
      p('police_bars', 0, 3, [], 0, 'Holding cell', 'CELL'),
      // Offices along the back
      p('flag_stand', 4, 0),
      p('office_desk', 5, 1, ['work'], 2, 'Duty officer’s desk'),
      p('police_wanted', 6, 0, ['snitch_bounty'], 2, 'Wanted board'),
      p('filing', 8, 0, [], 0, 'Case files'),
      p('filing', 9, 0, [], 0, 'Case files'),
      p('wall_portrait', 11, 0, [], 2),
      p('police_lockers', 12, 0, [], 0, 'Exhibit lockers', 'EXHIBITS'),
      p('office_desk', 9, 2, [], 2, 'Statement desk'),
      p('plastic_chair', 9, 3, [], 2),
      // Charge room
      p('police_counter', 5, 4, ['dry_gin_bribe', 'spiritual_report'], 0, 'Charge room counter', 'CHARGE ROOM'),
      p('kettle_table', 13, 4, [], 1, 'Station tea'),
      p('bench', 13, 5, ['station_tea'], 1, 'Public waiting bench'),
      p('notice_board', 0, 5, [], 1),
      p('bench', 0, 7, ['station_tea'], 3, 'Public waiting bench'),
      p('bench', 9, 8, [], 2, 'Public waiting bench'),
      p('bench', 2, 8, [], 2, 'Public waiting bench'),
      p('queue_rope', 3, 6),
      p('fan', 13, 8),
      p('plant', 13, 9),
      exit(7, 9),
    ],
  },
  // Desks under towers of files, shelves of older files behind them, and two counters between you and any of it.
  secretariat: {
    w: 12, h: 9, dense: true, floor: ['#e3dccb', '#d8cfbb'], wall: '#f3ead8', doorX: 6,
    tiles: [{ x: 0, z: 0, w: 12, d: 4, colour: '#cfc4a8' }],
    staff: [
      { x: 2, z: 1.75, yaw: 0, look: 'office' },
      { x: 3, z: 3.6, yaw: 0, look: 'clerk' },
      { x: 8, z: 3.6, yaw: 0, look: 'office' },
    ],
    props: [
      p('archive_shelf', 0, 0, [], 0, 'Files since 1987'),
      p('filing', 2, 0),
      p('wall_clock', 2, 0, [], 2),
      p('wall_portrait', 3, 0, [], 2),
      p('flag_stand', 8, 0),
      p('filing', 9, 0),
      p('archive_shelf', 10, 0, [], 0, 'Pending files'),
      p('louvre_window', 0, 1, [], 1),
      // The office
      p('office_desk', 1, 2, [], 2, 'Colleague’s desk'),
      p('sec_files', 3, 2),
      p('office_desk', 4, 2, ['work'], 2, 'Your desk'),
      p('sec_files', 6, 1),
      p('office_desk', 7, 2, ['hisbah_service'], 2, 'Community service desk'),
      p('sec_files', 9, 2),
      p('kettle_table', 10, 1, [], 0, 'Tea & biscuits'),
      p('plastic_chair', 11, 1, ['stamps_tea'], 1, 'Tea break chair'),
      p('fan', 11, 3),
      // The counters
      p('sec_registry', 2, 4, ['file_missing', 'express_speed'], 0, 'Registry', 'REGISTRY'),
      p('sec_registry', 7, 4, ['express_speed'], 0, 'Cash office', 'CASH OFFICE'),
      // Where the public waits
      p('notice_board', 0, 5, [], 1),
      p('bench', 0, 6, [], 3, 'Waiting bench'),
      sign('post_sign', 10, 5, 'COME BACK\nTOMORROW'),
      p('bench', 11, 5, [], 1, 'Waiting bench'),
      p('plant', 0, 8),
      p('plant', 11, 8),
      exit(6, 8),
    ],
  },
  // Demo stage under the big screen, pods of hot desks, a lounge of beanbags and the coffee that is the real draw.
  techhub: {
    w: 12, h: 9, dense: true, floor: ['#e6ebf2', '#d8dfe9'], wall: '#f1f5f9', doorX: 6,
    tiles: [
      { x: 4, z: 0, w: 4, d: 2, colour: '#334155' },
      { x: 0, z: 4, w: 4, d: 5, colour: '#fde9a8' },
    ],
    staff: [
      { x: 5.5, z: 1.5, yaw: 0, look: 'coder' },
      { x: 10.5, z: 1.4, look: 'attendant' },
    ],
    props: [
      p('tech_server', 0, 0), p('tech_server', 1, 0),
      sign('wall_sign', 2, 0, 'BUILD · SHIP · REPEAT', 2),
      p('tech_stage', 4, 0, ['fake_startup', 'meetup'], 0, 'Demo stage'),
      p('tech_coffee', 9, 0, [], 0, 'Free coffee', 'FREE COFFEE'),
      p('plant', 11, 0),
      // Hot desks, two pods
      p('tech_desk', 1, 2, ['leech_wifi'], 3, 'Hot desk'),
      p('tech_desk', 3, 2, ['leech_wifi'], 1, 'Hot desk'),
      p('tech_desk', 7, 2, ['leech_wifi'], 3, 'Hot desk'),
      p('tech_desk', 9, 2, ['work', 'leech_wifi'], 1, 'Your workstation'),
      // Lounge
      p('tech_whiteboard', 0, 5, [], 1),
      p('rug', 1, 5),
      p('beanbag', 1, 5, ['meetup'], 0, 'Beanbag'),
      p('beanbag', 2, 6, ['meetup'], 0, 'Beanbag'),
      p('beanbag', 1, 7, ['meetup'], 0, 'Beanbag'),
      p('cafe_table', 7, 5),
      p('coffee_table', 9, 5, [], 1),
      p('sofa', 11, 5, ['leech_wifi'], 1, 'Sofa by the router'),
      p('plant', 0, 8),
      p('plant', 11, 8),
      exit(6, 8),
    ],
  },
  // Lecture hall under the projector, the library on the right, the canteen by the door and admissions opposite.
  poly: {
    w: 14, h: 10, dense: true, floor: ['#e7d3b1', '#dcc39a'], wall: '#fef3c7', doorX: 7,
    tiles: [
      { x: 9, z: 0, w: 5, d: 4, colour: '#c9a877' },
      { x: 0, z: 6, w: 5, d: 4, colour: '#f3e8d2' },
    ],
    staff: [
      { x: 3, z: 1.3, yaw: 0, look: 'teacher' },
      { x: 12, z: 4.8, yaw: 0, look: 'clerk' },
      { x: 0.5, z: 8, yaw: Math.PI / 2, look: 'cook' },
      { x: 12.6, z: 1.5, look: 'student' },
    ],
    props: [
      // Lecture hall
      p('blackboard', 1, 0, ['lecture'], 0, 'Lecturer’s board'),
      p('poly_lectern', 5, 1, [], 0, 'Lectern'),
      p('notice_board', 0, 1, ['protest_cancel'], 1, 'Lecture notice board'),
      p('poly_bench', 1, 3, ['lecture'], 2, 'Lecture bench'),
      p('poly_bench', 5, 3, ['lecture'], 2, 'Lecture bench'),
      p('poly_bench', 1, 5, ['lecture'], 2, 'Lecture bench'),
      p('poly_bench', 5, 5, ['lecture'], 2, 'Lecture bench'),
      // Library
      sign('wall_sign', 9, 0, 'LIBRARY', 2),
      p('archive_shelf', 11, 0, [], 0, 'Library shelves'),
      p('bookshelf', 13, 0),
      p('poly_study', 10, 2, ['library_cram'], 0, 'Library table'),
      // Admissions
      p('office_desk', 11, 5, [], 2, 'Admissions desk'),
      p('plastic_chair', 11, 6, COURSES, 2, 'Course registration'),
      p('plastic_chair', 12, 6, COURSES, 2, 'Course registration'),
      sign('post_sign', 13, 6, 'ADMISSIONS'),
      // Canteen
      sign('wall_sign', 0, 7, 'CANTEEN', 1),
      p('pot_counter', 1, 7, [], 3, 'Canteen pots'),
      p('dining', 2, 7, ['canteen_feast'], 0, 'Canteen table'),
      p('plant', 0, 9),
      p('plant', 13, 9),
      exit(7, 9),
    ],
  },
  // One classroom: the blackboard, rows of two-pupil benches, charts on the wall and the bell by the door.
  school: {
    w: 12, h: 10, dense: true, floor: ['#dccfb3', '#d2c4a5'], wall: '#fef9c3', doorX: 6,
    tiles: [{ x: 0, z: 1, w: 2, d: 2, colour: '#86c79a' }],
    staff: [{ x: 5, z: 1.3, yaw: 0, look: 'teacher' }],
    props: [
      p('bookshelf', 0, 0, ['volunteer'], 0, 'Class library'),
      p('bookshelf', 1, 0),
      p('blackboard', 4, 0, ['work', 'volunteer'], 0, 'Blackboard'),
      p('school_map', 10, 0, [], 2),
      sign('school_chart', 0, 1, 'A B C D\nE F G H\nI J K L', 1),
      sign('school_chart', 0, 6, '1 2 3 4\n5 6 7 8\n9 10', 1),
      ...[3, 5].flatMap((z) => [1, 3, 7, 9].map((x) => p('school_bench', x, z, ['volunteer'], 2, 'Pupils’ bench'))),
      p('school_bench', 1, 7, ['volunteer'], 2, 'Pupils’ bench'),
      p('school_bench', 8, 7, ['volunteer'], 2, 'Pupils’ bench'),
      p('school_bell', 8, 9, ['bell_prank'], 0, 'Assembly bell'),
      p('flag_stand', 0, 9),
      p('bucket', 11, 9, [], 0, 'Drinking water'),
      exit(6, 9),
    ],
  },
  // No exit: the barred gate only opens when your time is up or someone pays your bail.
  prison: {
    w: 10, h: 8, dense: true, floor: ['#9ca3af', '#8f96a3'], wall: '#cbd5e1', doorX: 5,
    staff: [{ x: 7.2, z: 8.7, look: 'warder' }],
    props: [
      ...[0, 1, 2, 3].map((x) => p('prison_mat', x, 0, ['cell_sleep'], 0, 'Thin mattress')),
      p('pot_counter', 5, 0, ['cell_eat'], 0, 'Ration pot'),
      p('prison_window', 7, 0, [], 2),
      p('toilet', 9, 0, ['cell_toilet'], 0, 'Cell toilet'),
      p('bucket', 9, 2, ['cell_wash'], 0, 'Bucket bath'),
      p('prison_tally', 0, 3, [], 1),
      p('prison_tally', 0, 4, [], 1),
      p('bench', 1, 5, ['cell_gist'], 0, 'Bench'),
      p('bench', 6, 5, ['cell_gist', 'cell_exercise'], 0, 'Bench'),
      p('cell_door', 5, 7, [], 0, 'Cell gate'),
    ],
  },
};
