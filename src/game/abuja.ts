// Abuja: the second city, a short flight from Kaduna International Airport.
// Same cell convention as Kaduna (city.ts): cell (x, z) covers world [x, x+1] × [z, z+1], north is -z.
//
// Rough real-world layout, turned so the city's long axis runs west → east:
//   East:   Aso Rock stands over the Three Arms Zone (Aso Villa, the National Assembly, the Supreme Court).
//   Centre: the two great avenues, Constitution and Independence, run west from there with Eagle Square, the
//           National Mosque and the National Christian Centre between and beside them.
//   North:  Maitama (Hilton, Millennium Park) and Wuse (the market, Wuse II nightlife), with Kubwa and Zuma Rock
//           out past the expressway on the road to Kaduna.
//   West:   Jabi Lake and its mall, Utako motor park, Idu station and Gwarinpa.
//   South:  Garki and Asokoro, then Airport Road past the City Gate and the stadium, out through Lugbe to the airport.
//   Campuses: Baze and Nile in the west, the University of Abuja and AUST down Airport Road, Veritas and the
//           Law School up in Bwari past the expressway.
//
// Places keep Kaduna's ids (the mosque is still 'mosque', the hotel still 'hamdala'), so their interiors, jobs and
// shops all work here: only the name, the building and where it stands change. A Kaduna place with no entry
// here does not exist in Abuja.

import type { ActionDef } from './catalog';
import { JET_TRIP } from './cars';
import { addCityMap, addCityPotholes, FLIGHT_FARE, FLIGHT_PERHOUR, flightMinutes, jetFlight, KANO_FARE, LAGOS_FARE, PLACE_BY_ID, PRISON_PLACE, smoothClosed, type Landmark, type P2, type Place, type Pothole, type Road } from './city';
import { roomPlaceId } from './hotel';
import { SUITE_ID, VILLA_ID } from './villa';

export const ABUJA_W = 78;
export const ABUJA_H = 60;

/** City boundary: a broad fan spreading west from Aso Rock, with a tail running south-west to the airport. */
const OUTLINE: P2[] = smoothClosed(
  [
    [8, 0.5], [20, -1.5], [34, 1.5], [48, 0], [62, 1], [72, 4.5], [78.5, 13], [79.5, 24], [78, 35], [73.5, 45], [66, 51.5],
    [56, 55.5], [46, 58], [36, 56.5], [28, 59], [16, 60], [5, 58], [-1.5, 52], [-1, 43.5], [5, 39], [8.5, 34.5], [4, 29], [-1, 21.5], [-1.5, 12], [1, 4],
  ],
  8,
);

const ROADS: Road[] = [
  { x: 4, z: 7, w: 68, d: 2, main: true, name: 'Kubwa Expressway' },
  { x: 14, z: 7, w: 2, d: 39, main: true, name: 'Ring Road II' },
  { x: 30, z: 7, w: 2, d: 44, main: true, name: 'Nnamdi Azikiwe Expressway' },
  { x: 46, z: 7, w: 2, d: 46, main: true, name: 'Ahmadu Bello Way' },
  { x: 62, z: 7, w: 2, d: 39, main: true, name: 'Shehu Shagari Way' },
  { x: 2, z: 20, w: 30, d: 2, main: true, name: 'Obafemi Awolowo Way' },
  { x: 30, z: 16, w: 34, d: 2, main: true, name: 'Herbert Macaulay Way' },
  { x: 30, z: 24, w: 43, d: 2, main: true, name: 'Constitution Avenue' },
  { x: 30, z: 32, w: 43, d: 2, main: true, name: 'Independence Avenue' },
  { x: 2, z: 44, w: 30, d: 2, main: true, name: 'Airport Road' },
  { x: 32, z: 44, w: 39, d: 2, main: true, name: 'Goodluck Jonathan Expressway' },
  // Streets
  { x: 22, z: 9, w: 1, d: 11, name: '1st Avenue, Gwarinpa' },
  { x: 38, z: 9, w: 1, d: 15, name: 'Aminu Kano Crescent' },
  { x: 54, z: 9, w: 1, d: 7, name: 'Gana Street' },
  { x: 32, z: 38, w: 30, d: 1, name: 'Moshood Abiola Way' },
  { x: 38, z: 34, w: 1, d: 10, name: 'Tafawa Balewa Way' },
  { x: 70, z: 34, w: 1, d: 10, name: 'Yakubu Gowon Crescent' },
  { x: 22, z: 46, w: 1, d: 9, name: 'Lugbe Road' },
];

type Spot = Pick<Place, 'name' | 'area' | 'blurb' | 'x' | 'z' | 'w' | 'd' | 'door'> & Partial<Pick<Place, 'model' | 'icon'>>;

/** Kaduna's place of the same id, moved and renamed, with any Kaduna-only wording in its activities swapped out. */
function abuja(id: string, spot: Spot, relabel: Record<string, Partial<ActionDef>> = {}, extra: ActionDef[] = []): Place {
  const base = PLACE_BY_ID[id];
  const actions = base.actions
    .filter((a) => a.effect !== 'travel')
    .map((a) => (relabel[a.id] ? { ...a, ...relabel[a.id] } : a));
  return { ...base, ...spot, actions: [...extra, ...actions] };
}

/** Aso Villa (game/villa.ts): only Abuja has one. Open to everybody; the desk and the suite behind it are the President's. */
const VILLA: Place = {
  id: VILLA_ID, name: 'Aso Villa', area: 'Three Arms Zone', icon: '🏛️', model: 'govhouse', blurb: 'The State House under Aso Rock. The President’s office: walk in and wait your turn.',
  x: 66, z: 18, w: 6, d: 5, door: { x: 68, z: 23 },
  actions: [
    { id: 'villa_tour', label: 'Tour the State House', icon: '🏛️', category: 'social', minutes: 40, pose: 'stand', knowledgePerHour: 0.3, perHour: { fun: 45, social: 20 }, tagline: 'Gifts of state, old portraits, and a guide who knows every coup by its date' },
    { id: 'villa_wait', label: 'Wait for an audience with the President', icon: '🛋️', category: 'social', minutes: 60, pose: 'sit', perHour: { social: 60, energy: 10, fun: 10 }, tagline: '“His Excellency will see you shortly.” Shortly is a long time here' },
    { id: 'villa_audience', label: 'Sit down across the President’s desk', icon: '🤝', category: 'social', minutes: 30, pose: 'sit', animation: 'talk', perHour: { social: 150, fun: 60 }, tagline: 'State your case. Keep it short' },
    { id: 'villa_selfie', label: 'Sneak a selfie behind the President’s desk', icon: '🤳', category: 'wild', minutes: 15, pose: 'stand', perHour: { fun: 190, social: 120 }, tagline: 'The DSS men are already walking over' },
    { id: 'villa_desk', label: 'Sign bills at your desk', icon: '🖋️', category: 'social', minutes: 60, pose: 'stand', animation: 'type', office: 'president', knowledgePerHour: 0.3, perHour: { fun: 20, social: 30, energy: -4 }, tagline: 'A tower of files, and every one of them is “urgent”' },
    { id: 'villa_address', label: 'Address the nation', icon: '🎙️', category: 'social', minutes: 30, pose: 'stand', animation: 'talk', office: 'president', perHour: { social: 220, fun: 90 }, tagline: '“Fellow Nigerians…” Every TV in the country is on you' },
    { id: 'villa_suite', label: 'Go through to the Presidential Suite', icon: '👑', category: 'social', minutes: 0, effect: 'villaSuite', office: 'president', tagline: 'Your private rooms behind the office, for as long as you hold it' },
  ],
};

/** The President's suite: the hotel's Presidential Suite, behind the office instead of up a lift. Not on the map. */
const TOP_ROOM = PLACE_BY_ID[roomPlaceId('presidential')];
const SUITE_LABELS: Record<string, string> = { room_view: 'Look out at Aso Rock', leave_room: 'Go back out to the office' };
PLACE_BY_ID[VILLA_ID] = VILLA;
PLACE_BY_ID[SUITE_ID] = {
  ...TOP_ROOM, id: SUITE_ID, name: 'Presidential Suite', area: VILLA.name, door: VILLA.door, model: VILLA.model,
  blurb: 'The President’s private rooms at Aso Villa. A butler stands by the bar.',
  actions: TOP_ROOM.actions.map((a) => (SUITE_LABELS[a.id] ? { ...a, label: SUITE_LABELS[a.id], icon: a.id === 'leave_room' ? '🚪' : a.icon } : a)),
};

const PLACES: Place[] = [
  /* ---- Airport Road & Lugbe ---- */
  abuja('airport', {
    name: 'Nnamdi Azikiwe International Airport', area: 'Airport Road', blurb: 'Abuja’s airport, out past Lugbe. Flights home to Kaduna leave from here.',
    x: 3, z: 48, w: 16, d: 5, door: { x: 12, z: 46 },
  }, {}, [
    { id: 'fly_kaduna', label: 'Fly back to Kaduna', icon: '🛫', category: 'spend', cost: FLIGHT_FARE, minutes: flightMinutes('abuja', 'kaduna'), pose: 'hidden', effect: 'travel', destination: 'kaduna', perHour: FLIGHT_PERHOUR, tagline: 'A short hop home to Kaduna International. Meat pie and a nap' },
    { id: 'fly_kaduna_jet', label: 'Fly your private jet to Kaduna', icon: '🛩️', category: 'spend', cost: JET_TRIP.cost, ...jetFlight('abuja', 'kaduna'), pose: 'hidden', effect: 'travel', destination: 'kaduna', jet: true, tagline: 'Private terminal, no queue. Chef, bed and shower on board: land with every bar full' },
    { id: 'fly_lagos', label: 'Fly to Lagos', icon: '🛫', category: 'spend', cost: LAGOS_FARE, minutes: flightMinutes('abuja', 'lagos'), pose: 'hidden', effect: 'travel', destination: 'lagos', perHour: FLIGHT_PERHOUR, tagline: 'The Abuja – Lagos shuttle. Every seat is a contractor or a senator’s aide' },
    { id: 'fly_lagos_jet', label: 'Fly your private jet to Lagos', icon: '🛩️', category: 'spend', cost: JET_TRIP.cost, ...jetFlight('abuja', 'lagos'), pose: 'hidden', effect: 'travel', destination: 'lagos', jet: true, tagline: 'Private terminal, no queue. Chef, bed and shower on board: land with every bar full' },
    { id: 'fly_kano', label: 'Fly to Kano', icon: '🛫', category: 'spend', cost: KANO_FARE, minutes: flightMinutes('abuja', 'kano'), pose: 'hidden', effect: 'travel', destination: 'kano', perHour: FLIGHT_PERHOUR, tagline: 'The Abuja – Kano shuttle: senators going home for the weekend and one man with a ram in cargo' },
    { id: 'fly_kano_jet', label: 'Fly your private jet to Kano', icon: '🛩️', category: 'spend', cost: JET_TRIP.cost, ...jetFlight('abuja', 'kano'), pose: 'hidden', effect: 'travel', destination: 'kano', jet: true, tagline: 'Private terminal, no queue. Chef, bed and shower on board: land with every bar full' },
  ]),
  abuja('home', {
    name: 'Your House', area: 'Lugbe', blurb: 'Home sweet home.',
    x: 24, z: 52, w: 4, d: 4, door: { x: 25, z: 56 },
  }),
  abuja('stadium', {
    name: 'Moshood Abiola National Stadium', area: 'Kukwaba', blurb: 'The 60,000-seat national stadium on Airport Road. Super Eagles nights and loud terraces.',
    x: 18, z: 35, w: 8, d: 7, door: { x: 21, z: 42 },
  }, {
    match: { label: 'Watch the Super Eagles play', tagline: 'Cheer the Super Eagles from the packed terraces' },
    sprint_challenge: { tagline: 'Dust Abuja’s fastest sprinters on the national track!' },
    stadium_wave: { tagline: 'Get 60,000 Super Eagles fans singing in harmony' },
  }),

  abuja('poly', {
    name: 'University of Abuja', area: 'Airport Road', blurb: 'UniAbuja, the capital’s federal university. Packed lecture halls, strike rumours and the best campus jollof.',
    x: 23, z: 47, w: 6, d: 5, door: { x: 25, z: 46 },
  }, {
    lecture: { label: 'Attend a political science lecture', tagline: '400 students, one microphone, and a lecturer who knows three ministers' },
    protest_cancel: { tagline: 'Lead UniAbuja students out to block Airport Road!' },
  }, [
    { id: 'matric_convoy', label: 'Gate-crash matriculation with a convoy and a live band', icon: '🎓', category: 'wild', minutes: 30, pose: 'stand', perHour: { fun: 170, social: 150 }, tagline: 'Canopies, coolers and a brass band for a 100-level student' },
  ]),
  abuja('museum', {
    name: 'Nike Art Gallery', area: 'Piwoyi', blurb: 'Four floors of paintings, adire and beadwork off Airport Road. Mama Nike may greet you herself.',
    x: 33, z: 47, w: 4, d: 4, door: { x: 35, z: 46 },
  }, {
    nok: { label: 'Walk four floors of Nigerian art', tagline: 'Adire, bronze and canvases stacked to the ceiling' },
  }),

  /* ---- Jabi, Utako & Gwarinpa ---- */
  abuja('river', {
    name: 'Jabi Lake', area: 'Jabi', blurb: 'Boats, fishermen and a cool breeze off the water. Abuja comes here to breathe.',
    x: 6, z: 9, w: 4, d: 2, door: { x: 7, z: 9 },
  }, {
    croc_dare: { label: 'Lean off the jetty over the deep water', tagline: '"Something big just moved under there!" Jump back and scream' },
    stone_skip: { label: 'Skip flat stones with the fishermen', tagline: 'Count 7 skips across the calm lake' },
    sunset: { label: 'Watch the sun set over Jabi Lake', tagline: 'Golden water, kayaks drifting home, the mall lights coming on' },
  }, [
    { id: 'jetski_race', label: 'Race jet skis across Jabi Lake', icon: '🌊', category: 'spend', cost: 20_000, minutes: 25, pose: 'stand', perHour: { fun: 190, social: 90, hygiene: -20 }, tagline: 'Full throttle past the boat club while the fishermen curse you' },
    { id: 'boat_party', label: 'Crash a yacht party at the boat club', icon: '🛥️', category: 'wild', minutes: 45, pose: 'stand', perHour: { fun: 170, social: 170 }, tagline: 'Nobody knows who invited you. Nobody asks' },
  ]),
  abuja('mall', {
    name: 'Jabi Lake Mall', area: 'Jabi', blurb: 'Abuja’s lakeside mall. Air-con, cinema, and windows you only look through.',
    x: 9, z: 16, w: 5, d: 4, door: { x: 11, z: 20 },
  }, {
    escalator_stunt: { tagline: 'Strike movie star poses while Abuja shoppers stop and stare!' },
  }),
  abuja('motorpark', {
    name: 'Utako Motor Park', area: 'Utako', blurb: 'Luxury buses to everywhere, agbero calling Kaduna, Lagos, Jos, and roasted plantain.',
    x: 5, z: 22, w: 7, d: 4, door: { x: 8, z: 21 },
  }, {
    conductor_shout: { label: 'Conductor hype: "BERGER WUSE AREA ONE, ENTER WITH YOUR CHANGE!"' },
    zaria: { label: 'Road trip bus to Lokoja', tagline: 'Down the Abuja–Lokoja expressway with radio tunes' },
  }),
  abuja('station', {
    name: 'Idu Train Station', area: 'Idu', blurb: 'Abuja end of the Abuja – Kaduna line. Shiny platforms and VIP coaches.',
    x: 8, z: 28, w: 5, d: 4, door: { x: 13, z: 30 },
  }, {
    abuja: { label: 'Day trip to Kaduna', tagline: 'First-class morning express to Rigasa Station' },
  }),
  abuja('techhub', {
    name: 'Abuja Tech Village', area: 'Gwarinpa', blurb: 'Fast Wi-Fi, founders pitching, and free coffee.',
    x: 24, z: 10, w: 4, d: 4, door: { x: 25, z: 14 },
  }),
  abuja('police', {
    name: 'Force Headquarters', area: 'Area 11', blurb: 'Louis Edet House, the top of the Nigeria Police. Bail, statements and big files.',
    x: 17, z: 23, w: 6, d: 5, door: { x: 19, z: 22 },
  }),
  abuja('school', {
    name: 'Baze University', area: 'Jabi', icon: '🎓', blurb: 'Abuja’s priciest private university. Law students in suits and a car park full of Benzes.',
    x: 16, z: 10, w: 6, d: 4, door: { x: 18, z: 14 },
  }, {
    volunteer: { label: 'Tutor a first-year law class', tagline: 'Explain the Constitution to forty students in designer shoes' },
    bell_prank: { label: 'Set off the lecture hall fire alarm mid-exam', tagline: 'Three hundred students and one furious invigilator pour onto the lawn' },
  }, [
    { id: 'carpark_flex', label: 'Rev a borrowed G-Wagon round the student car park', icon: '🚙', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 160, social: 140 }, tagline: 'Every Baze student stops to check whose daddy this one is' },
  ]),
  abuja('textile', {
    name: 'Idu Garment Factory', area: 'Idu Industrial', blurb: 'Rows of looms and sewing machines in the industrial estate. Uniforms, ankara and overtime.',
    x: 17, z: 30, w: 6, d: 4, door: { x: 19, z: 34 },
  }),
  abuja('polo', {
    name: 'Guards Polo Club', area: 'Mabushi', blurb: 'Abuja’s polo ground. Horses, hats, and convoys parked outside.',
    x: 24, z: 23, w: 5, d: 7, door: { x: 26, z: 26 },
  }, {
    horse_sprint: { tagline: 'Gallop past the VIP grandstand like a Brigade of Guards officer!' },
    polo_champagne: { tagline: 'Sip bubbly on manicured green lawn with Abuja big men' },
  }),

  /* ---- Kubwa, past the expressway ---- */
  abuja('viewing', {
    name: 'Kubwa Football Viewing Centre', area: 'Kubwa', blurb: 'A noisy generator, wooden benches, heated arguments and match-day banters.',
    x: 25, z: 3, w: 4, d: 3, door: { x: 27, z: 6 },
  }),
  abuja('buka', {
    name: 'Mama Ngozi Buka & Mai Shayi', area: 'Kubwa', blurb: 'Late-night Indomie, spicy tea, abacha and the latest satellite-town gist.',
    x: 33, z: 3, w: 3, d: 3, door: { x: 34, z: 6 },
  }),

  /* ---- Wuse ---- */
  abuja('suya', {
    name: 'Wuse II Suya Spot', area: 'Wuse II', blurb: 'Smoky suya, cold drinks and loud gist till late.',
    x: 33, z: 12, w: 3, d: 3, door: { x: 34, z: 15 },
  }),
  abuja('market', {
    name: 'Wuse Market', area: 'Wuse', blurb: 'Abuja’s biggest market. Fabrics, phones, foodstuff, and prices that start at double.',
    x: 39, z: 10, w: 7, d: 5, door: { x: 42, z: 15 },
  }),
  abuja('club', {
    name: 'The Castle Abuja', area: 'Wuse II', blurb: 'Wuse II’s loudest night out. VIP bottle service, top DJs, and heavy money spraying.',
    x: 32, z: 18, w: 6, d: 5, door: { x: 35, z: 23 },
  }, {
    hijack_mic: { tagline: '"ABUJA ARE YOU READY?!" Blast the club with wild hype' },
    club_takeover: { tagline: 'Lights, DJ and every drink on you. By morning all of Abuja knows your name' },
    dj_hype: { tagline: 'DJ drops beat: "Clear way for the highest spender in Abuja!"' },
  }, [
    { id: 'senator_table', label: 'Take over a senator’s reserved table', icon: '🍾', category: 'wild', minutes: 30, pose: 'stand', perHour: { fun: 180, social: 160 }, tagline: 'His aides are on the phone. Order another bottle before he arrives' },
  ]),
  abuja('boutique', {
    name: 'Wuse II Boutique', area: 'Wuse II', blurb: 'Agbada, lace and gold. If you ask for price, you no fit afford am.',
    x: 40, z: 19, w: 4, d: 3, door: { x: 41, z: 22 },
  }),

  /* ---- Maitama ---- */
  abuja('gamji', {
    name: 'Millennium Park', area: 'Maitama', blurb: 'Abuja’s biggest park. Fountains, long lawns, public benches and weekend picnics.',
    x: 48, z: 10, w: 5, d: 5, door: { x: 50, z: 12 },
  }, {}, [
    { id: 'fountain_dive', label: 'Dive into the park fountain for a TikTok', icon: '⛲', category: 'wild', minutes: 15, pose: 'stand', perHour: { fun: 170, social: 120, hygiene: -10 }, tagline: 'Aso Rock in the background, park wardens in the foreground' },
  ]),
  abuja('hamdala', {
    name: 'Transcorp Hilton', area: 'Maitama', blurb: 'The grand hotel of the capital. Pool, buffet, and ministers in the lobby.',
    x: 55, z: 10, w: 5, d: 5, door: { x: 57, z: 15 },
  }, {}, [
    { id: 'pool_cannonball', label: 'Cannonball into the Hilton pool in full agbada', icon: '💦', category: 'wild', minutes: 15, pose: 'stand', perHour: { fun: 180, social: 130, hygiene: 20 }, tagline: 'Three ministers and a diplomat get soaked. Security is running' },
    { id: 'lobby_lobbying', label: 'Corner a minister in the lobby for a contract', icon: '🤝', category: 'social', minutes: 40, pose: 'stand', perHour: { fun: 90, social: 180 }, tagline: '“Honourable, just two minutes.” It becomes forty' },
  ]),

  /* ---- Central Area ---- */
  abuja('mosque', {
    name: 'Abuja National Mosque', area: 'Central Area', model: 'nationalmosque', blurb: 'The golden dome and four minarets on Independence Avenue. Free public wash area.',
    x: 49, z: 18, w: 6, d: 5, door: { x: 51, z: 23 },
  }),
  abuja('secretariat', {
    name: 'Federal Secretariat', area: 'Central Area', blurb: 'Ministries, files, stamps and ‘come back tomorrow’.',
    x: 56, z: 19, w: 6, d: 4, door: { x: 58, z: 23 },
  }),
  abuja('arewa', {
    name: 'Shehu Musa Yar’Adua Centre', area: 'Central Area', blurb: 'Museum, library and archive of the nation’s history.',
    x: 32, z: 26, w: 5, d: 4, door: { x: 34, z: 30 },
  }, {
    sardauna_recite: { label: 'Recite a famous Independence Day speech', tagline: 'Command the courtyard with vintage orator energy' },
  }),
  abuja('church', {
    name: 'National Christian Centre', area: 'Central Area', blurb: 'The national church, all arches and spires. Big choir, long sermon, plenty of friends after service.',
    x: 49, z: 26, w: 4, d: 5, door: { x: 50, z: 31 },
  }),
  abuja('murtala', {
    name: 'Eagle Square', area: 'Central Area', blurb: 'The national parade ground. Inaugurations, Durbar, rallies and evening hangouts.',
    x: 54, z: 26, w: 7, d: 5, door: { x: 57, z: 28 },
  }, {}, [
    { id: 'rally_mic', label: 'Storm a rally stage and grab the microphone', icon: '🎤', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 180, social: 170 }, tagline: '“My people!” Ten thousand supporters cheer before anyone checks who you are' },
  ]),
  abuja('lugard', {
    name: 'National Assembly', area: 'Three Arms Zone', model: 'nass', blurb: 'The green dome under Aso Rock, where the Senate and the House sit.',
    x: 65, z: 26, w: 6, d: 5, door: { x: 67, z: 31 },
  }, {
    tour: { tagline: 'Walk through the Senate and House chambers' },
    lugard_chair: { label: 'Sneak selfie on the Senate President’s chair', tagline: 'Hop the velvet rope and bang the gavel!' },
  }, [
    { id: 'mace_snatch', label: 'Snatch the mace and run through plenary', icon: '🏃🏾', category: 'wild', minutes: 15, pose: 'stand', perHour: { fun: 200, social: 150, energy: -20 }, tagline: 'The Sergeant-at-Arms is fast. You are faster. Probably' },
    { id: 'rowdy_session', label: 'Join a rowdy session and throw a chair', icon: '🪑', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 180, social: 140 }, tagline: '“Point of order!” Nobody is listening to points of order' },
  ]),
  VILLA,

  /* ---- Garki & Asokoro ---- */
  abuja('pitch', {
    name: 'Old Parade Ground', area: 'Garki', blurb: 'Area 10’s big open field. Five-a-side, fairs, crusades and fitness clubs at dawn.',
    x: 53, z: 34, w: 6, d: 4, door: { x: 55, z: 38 },
  }, {
    play: { label: 'Play a gritty Area 10 community match' },
  }),
  abuja('nda', {
    name: 'National Defence College', area: 'Asokoro', blurb: 'Where generals go back to school. Parades, strategy lectures and very shiny boots.',
    x: 64, z: 40, w: 5, d: 4, door: { x: 66, z: 39 },
  }, {
    parade: { label: 'Watch the Brigade of Guards parade', tagline: 'Crisp salutes and a brass band under Aso Rock' },
  }),
  abuja('bank', {
    name: 'Garki Community Bank', area: 'Garki', blurb: 'A local branch for secure savings, everyday banking, and high-drama queues.',
    x: 33, z: 34, w: 4, d: 4, door: { x: 35, z: 38 },
  }, {
    queue_water: { tagline: 'Cool down 20 angry people waiting under Abuja sun!' },
  }),
  abuja('hospital', {
    name: 'National Hospital Abuja', area: 'Garki', blurb: 'Emergency care, maternity ward, pharmacy, and compassionate nurses.',
    x: 39, z: 39, w: 7, d: 4, door: { x: 42, z: 43 },
  }),
];

const LANDMARKS: Landmark[] = [
  { name: 'Aso Rock', icon: '⛰️', model: 'asorock', x: 66, z: 9, w: 10, d: 7 },
  { name: 'Supreme Court', icon: '⚖️', model: 'supremecourt', x: 64, z: 35, w: 5, d: 4 },
  { name: 'Zuma Rock', icon: '🪨', model: 'zumarock', x: 9, z: 2, w: 6, d: 4 },
  { name: 'Abuja City Gate', icon: '🚪', model: 'citygate', x: 26, z: 43, w: 2, d: 4, walkable: true },
  { name: 'CBN Headquarters', icon: '🏦', model: 'cbn', x: 40, z: 26, w: 4, d: 4 },
  { name: 'NNPC Towers', icon: '🏢', model: 'nnpc', x: 40, z: 34, w: 4, d: 3 },
  { name: 'Millennium Tower', icon: '🗼', model: 'milltower', x: 49, z: 34, w: 3, d: 3 },
  { name: 'Nile University of Nigeria', icon: '🎓', model: 'campus', x: 17, z: 16, w: 4, d: 3 },
  { name: 'Veritas University, Bwari', icon: '🎓', model: 'campus', x: 40, z: 2, w: 5, d: 3 },
  { name: 'Nigerian Law School', icon: '⚖️', model: 'campus', x: 47, z: 2, w: 4, d: 3 },
  { name: 'African University of Science & Technology', icon: '🔬', model: 'campus', x: 50, z: 47, w: 5, d: 3 },
  { name: 'IBB International Golf Club', icon: '⛳', model: 'golf', x: 57, z: 1, w: 6, d: 5, walkable: true },
  { name: 'Unity Fountain', icon: '⛲', model: 'fountain', x: 44, z: 19, w: 2, d: 2 },
  { name: 'World Trade Centre', icon: '🏙️', model: 'wtc', x: 49, z: 39, w: 3, d: 4 },
  { name: 'ECOWAS Secretariat', icon: '🌍', model: 'ecowas', x: 72, z: 39, w: 4, d: 3 },
  { name: 'Dunamis Glory Dome', icon: '⛪', model: 'glorydome', x: 39, z: 47, w: 6, d: 5 },
  { name: 'Magicland Amusement Park', icon: '🎡', model: 'tradefair', x: 26, z: 35, w: 4, d: 5 },
];

/** Abuja's pothole sites are numbered from here on the server (city.ts, worker/roads.ts). Only ever add to the end. */
export const ABUJA_POTHOLE_BASE = 1000;

/** The capital's roads are better than Kaduna's, so fewer sites: the worst are out on Airport Road and in Lugbe. */
const POTHOLES: Pothole[] = [
  // Airport Road (trailers to the airport and Lugbe's rain)
  { x: 6.4, z: 44.6, w: 0.85, d: 0.65, yaw: 0.2, severity: 3 },
  { x: 12.5, z: 45.3, w: 0.7, d: 0.5, yaw: -0.3, severity: 2 },
  { x: 17.4, z: 44.7, w: 0.9, d: 0.7, yaw: 0.4, severity: 3 },
  { x: 27.3, z: 45.4, w: 0.65, d: 0.5, yaw: 0.1, severity: 2 },
  // Lugbe Road
  { x: 22.5, z: 50.4, w: 0.7, d: 0.6, yaw: -0.2, severity: 3 },
  { x: 22.4, z: 53.6, w: 0.6, d: 0.5, yaw: 0.5, severity: 2 },
  // Kubwa Expressway
  { x: 11.4, z: 7.7, w: 0.7, d: 0.5, yaw: 0.3, severity: 2 },
  { x: 26.3, z: 8.4, w: 0.85, d: 0.65, yaw: -0.4, severity: 3 },
  { x: 43.6, z: 7.6, w: 0.55, d: 0.45, yaw: 0.2, severity: 1 },
  { x: 57.2, z: 8.3, w: 0.7, d: 0.5, yaw: 0.5, severity: 2 },
  // Ring Road II
  { x: 14.6, z: 13.5, w: 0.7, d: 0.5, yaw: -0.2, severity: 2 },
  { x: 15.3, z: 28.4, w: 0.55, d: 0.45, yaw: 0.3, severity: 1 },
  { x: 14.7, z: 39.2, w: 0.75, d: 0.55, yaw: 0.1, severity: 2 },
  // Nnamdi Azikiwe Expressway
  { x: 30.6, z: 12.4, w: 0.55, d: 0.45, yaw: 0.4, severity: 1 },
  { x: 31.3, z: 21.5, w: 0.7, d: 0.5, yaw: -0.3, severity: 2 },
  { x: 30.7, z: 40.3, w: 0.85, d: 0.65, yaw: 0.2, severity: 3 },
  // Obafemi Awolowo Way
  { x: 8.5, z: 20.7, w: 0.7, d: 0.5, yaw: 0.3, severity: 2 },
  { x: 22.4, z: 21.3, w: 0.65, d: 0.5, yaw: -0.1, severity: 2 },
  // Goodluck Jonathan Expressway
  { x: 38.4, z: 44.7, w: 0.7, d: 0.5, yaw: 0.2, severity: 2 },
  { x: 52.6, z: 45.3, w: 0.55, d: 0.4, yaw: -0.4, severity: 1 },
  { x: 66.4, z: 44.6, w: 0.7, d: 0.5, yaw: 0.3, severity: 2 },
  // Ahmadu Bello Way & Shehu Shagari Way (the Minister drives here, so they are small)
  { x: 46.6, z: 13.3, w: 0.55, d: 0.45, yaw: 0.1, severity: 1 },
  { x: 47.3, z: 41.5, w: 0.7, d: 0.5, yaw: -0.2, severity: 2 },
  { x: 62.7, z: 12.6, w: 0.5, d: 0.4, yaw: 0.4, severity: 1 },
  // Streets
  { x: 22.5, z: 14.6, w: 0.65, d: 0.5, yaw: 0.2, severity: 2 },
  { x: 38.5, z: 13.4, w: 0.55, d: 0.45, yaw: -0.3, severity: 1 },
  { x: 45.3, z: 38.5, w: 0.55, d: 0.45, yaw: 0.5, severity: 1 },
];
addCityPotholes('abuja', ABUJA_POTHOLE_BASE, POTHOLES);

export const ABUJA = addCityMap({
  id: 'abuja', w: ABUJA_W, h: ABUJA_H, outline: OUTLINE,
  lakes: [{ x: 7, z: 13, rx: 4, rz: 2.8, name: 'Jabi Lake' }],
  roads: ROADS, places: PLACES, landmarks: LANDMARKS, billboards: true,
  // Maitama and Asokoro: big compounds.
  gra: [{ x: 48, z: 9, w: 14, d: 7 }, { x: 64, z: 39, w: 14, d: 8 }],
  seed: 9_00_001,
  // A garden city: far more trees than Kaduna.
  green: 2.2,
  // The capital is newer and richer: white and cream walls under red and brown long-span roofs.
  walls: ['#f8f5ee', '#f4efe4', '#efe6d4', '#f1e4c8', '#e8e0cc', '#fafaf9', '#ecdcc0'],
  roofs: ['#a0442c', '#8f3b28', '#9a5b3c', '#7b3f2a', '#5b6b7a', '#3b5f43', '#b0553a'],
});
// Arrested in Abuja, you are held at Kuje. Like Kaduna's prison it is not on the map.
ABUJA.placeById.prison = { ...PRISON_PLACE, name: 'Kuje Prison', area: 'Kuje' };
