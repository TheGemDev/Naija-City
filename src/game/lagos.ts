// Lagos: the third city, a flight from Kaduna or Abuja.
// Same cell convention as Kaduna (city.ts): cell (x, z) covers world [x, x+1] × [z, z+1], north is -z.
//
// Rough real-world layout: the Lagos Lagoon runs west → east across the middle and splits the city in two.
//   Mainland (north): Ikeja (the airport, Alausa, Computer Village, Allen Avenue, the Shrine), Oshodi, Mushin, Surulere
//           (the National Stadium, the National Theatre at Iganmu), Yaba (UNILAG, the tech hub, Makoko on the
//           water), Ebute Metta (the train station) and Magodo out east.
//   Islands (south): Lagos Island (Balogun Market, Marina, Tafawa Balewa Square), Ikoyi (the polo club),
//           Victoria Island (Eko Hotel, the towers, Eko Atlantic), then Lekki past the toll gate. The Atlantic
//           is all along the bottom.
// The only ways across are the three bridges: Carter Bridge, Eko Bridge and Third Mainland Bridge.
//
// Places keep Kaduna's ids (the mosque is still 'mosque', the hotel still 'hamdala'), so their interiors, jobs and
// shops all work here: only the name, the building and where it stands change. A Kaduna place with no entry
// here does not exist in Lagos.

import type { ActionDef } from './catalog';
import { addCityMap, addCityPotholes, FLIGHT_PERHOUR, flightFare, flightMinutes, jetFare, jetFlight, PLACE_BY_ID, PRISON_PLACE, smoothClosed, smoothOpen, type Landmark, type P2, type Place, type Pothole, type Road } from './city';
import { trainActions } from './transport';

export const LAGOS_W = 84;
export const LAGOS_H = 62;

/** City boundary: a wide slab of mainland over a long strip of islands, the coast running straight along the bottom. */
const OUTLINE: P2[] = smoothClosed(
  [
    [6, 0.5], [20, -1.5], [36, 1], [50, -0.5], [64, 1.5], [76, 4], [84, 11], [85.5, 22], [84.5, 34], [85.5, 46], [82, 55],
    [72, 60.5], [58, 62.5], [44, 61], [30, 62.5], [16, 61], [5, 57.5], [-1, 50], [-1.5, 40], [0.5, 31], [-1.5, 22], [-1, 11], [1.5, 4],
  ],
  8,
);

/** The Lagos Lagoon's centre line, west → east. Wider than a river: the bridges over it are long. */
const LAGOON: P2[] = smoothOpen([[-4, 33], [8, 33.5], [18, 32.5], [30, 33.5], [42, 32.5], [54, 33.5], [66, 32.5], [78, 33.5], [90, 33]], 10);

const ROADS: Road[] = [
  // Mainland
  { x: 3, z: 7, w: 39, d: 2, main: true, name: 'Obafemi Awolowo Way' },
  { x: 42, z: 7, w: 39, d: 2, main: true, name: 'Lagos–Ibadan Expressway' },
  { x: 2, z: 17, w: 40, d: 2, main: true, name: 'Oshodi–Apapa Expressway' },
  { x: 42, z: 17, w: 40, d: 2, main: true, name: 'Gbagada Expressway' },
  { x: 4, z: 26, w: 38, d: 2, main: true, name: 'Western Avenue' },
  { x: 42, z: 26, w: 36, d: 2, main: true, name: 'Herbert Macaulay Way' },
  { x: 10, z: 7, w: 2, d: 21, main: true, name: 'Agege Motor Road' },
  { x: 24, z: 7, w: 2, d: 21, main: true, name: 'Mobolaji Bank Anthony Way' },
  { x: 42, z: 7, w: 2, d: 21, main: true, name: 'Ikorodu Road' },
  { x: 74, z: 7, w: 2, d: 21, main: true, name: 'Ogudu Road' },
  // The bridges
  { x: 10, z: 28, w: 2, d: 13, main: true, name: 'Carter Bridge' },
  { x: 24, z: 28, w: 2, d: 13, main: true, name: 'Eko Bridge' },
  { x: 58, z: 19, w: 2, d: 22, main: true, name: 'Third Mainland Bridge' },
  // The islands
  { x: 6, z: 41, w: 36, d: 2, main: true, name: 'Marina' },
  { x: 42, z: 41, w: 40, d: 2, main: true, name: 'Lekki–Epe Expressway' },
  { x: 8, z: 51, w: 52, d: 2, main: true, name: 'Ahmadu Bello Way' },
  { x: 24, z: 43, w: 2, d: 8, main: true, name: 'Awolowo Road' },
  { x: 42, z: 43, w: 2, d: 8, main: true, name: 'Akin Adesola Street' },
  { x: 58, z: 43, w: 2, d: 8, main: true, name: 'Ozumba Mbadiwe Avenue' },
  { x: 72, z: 43, w: 2, d: 12, main: true, name: 'Admiralty Way' },
  // Streets
  { x: 17, z: 9, w: 1, d: 8, name: 'Allen Avenue' },
  { x: 33, z: 9, w: 1, d: 8, name: 'Toyin Street' },
  { x: 50, z: 9, w: 1, d: 8, name: 'Ogunnusi Road' },
  { x: 66, z: 9, w: 1, d: 8, name: 'CMD Road' },
  { x: 17, z: 19, w: 1, d: 7, name: 'Ojuelegba Road' },
  { x: 33, z: 19, w: 1, d: 7, name: 'Adeniran Ogunsanya Street' },
  { x: 50, z: 19, w: 1, d: 7, name: 'University Road' },
  { x: 17, z: 43, w: 1, d: 8, name: 'Broad Street' },
  { x: 33, z: 43, w: 1, d: 8, name: 'Bourdillon Road' },
  { x: 50, z: 43, w: 1, d: 8, name: 'Adeola Odeku Street' },
  { x: 60, z: 47, w: 12, d: 1, name: 'Freedom Way' },
  { x: 74, z: 49, w: 8, d: 1, name: 'Ajah Road' },
];

type Spot = Pick<Place, 'name' | 'area' | 'blurb' | 'x' | 'z' | 'w' | 'd' | 'door'> & Partial<Pick<Place, 'model' | 'icon'>>;

/** Kaduna's place of the same id, moved and renamed, with any Kaduna-only wording in its activities swapped out. */
function lagos(id: string, spot: Spot, relabel: Record<string, Partial<ActionDef>> = {}, extra: ActionDef[] = []): Place {
  const base = PLACE_BY_ID[id];
  const actions = base.actions
    .filter((a) => a.effect !== 'travel')
    .map((a) => (relabel[a.id] ? { ...a, ...relabel[a.id] } : a));
  return { ...base, ...spot, actions: [...extra, ...actions] };
}

const flight = (to: 'kaduna' | 'abuja' | 'kano', name: string, tagline: string): ActionDef[] => [
  { id: `fly_${to}`, label: `Fly to ${name}`, icon: '🛫', category: 'spend', cost: flightFare('lagos', to), minutes: flightMinutes('lagos', to), pose: 'hidden', effect: 'travel', destination: to, perHour: FLIGHT_PERHOUR, tagline },
  { id: `fly_${to}_jet`, label: `Fly your private jet to ${name}`, icon: '🛩️', category: 'spend', cost: jetFare('lagos', to), ...jetFlight('lagos', to), pose: 'hidden', effect: 'travel', destination: to, jet: true, tagline: 'Private terminal, no queue. Chef, bed and shower on board: land with every bar full' },
];

const PLACES: Place[] = [
  /* ---- Ikeja ---- */
  lagos('airport', {
    name: 'Murtala Muhammed International Airport', area: 'Ikeja', blurb: 'MMIA, the busiest airport in the country. Touts, trolleys and “anything for the boys?” at every door.',
    x: 13, z: 1, w: 16, d: 5, door: { x: 21, z: 6 },
  }, {
    runway_dash: { tagline: 'FAAN security screaming into radios while you snap the coolest flick!' },
  }, [
    ...flight('kaduna', 'Kaduna', 'Half an hour north to Kaduna International. Meat pie and a nap'),
    ...flight('abuja', 'Abuja', 'The Lagos – Abuja shuttle: every seat is a contractor or a senator’s aide'),
    ...flight('kano', 'Kano', 'The long haul north to Mallam Aminu Kano International. Traders flying home with empty Ghana-must-go'),
    { id: 'trolley_boys', label: 'Let the trolley boys “help” with one small bag', icon: '🧳', category: 'wild', minutes: 20, cost: 2_000, pose: 'stand', perHour: { fun: 150, social: 120 }, tagline: 'Six men, one handbag, and a bill for “loading, escort and prayers”' },
  ]),
  lagos('buka', {
    name: 'Iya Basira Amala Joint', area: 'Agege', blurb: 'Amala hot from the pot, gbegiri, ewedu and the latest street gist. The queue starts at 7am.',
    x: 32, z: 3, w: 3, d: 3, door: { x: 33, z: 6 },
  }, {
    tuwo: { label: 'Eat amala, gbegiri & ewedu', icon: '🍲', tagline: 'Abula with assorted. “Iya Basira, add one more ponmo”' },
    masa: { label: 'Ewa agoyin with Agege bread', icon: '🍞', tagline: 'Soft bread, mashed beans and pepper that sees your ancestors' },
    danwake: { label: 'Ofada rice & ayamase', icon: '🍛', tagline: 'Served in a leaf. The stew is green and it is not joking' },
    fura: { label: 'Cold zobo & puff-puff', icon: '🥤', tagline: 'Ten puff-puff, one bottle, zero regrets' },
    shayi: { label: 'Tea & Agege bread with fried egg', tagline: 'The mai shayi followed the customers down to Lagos' },
    politics_tea: { label: 'Heated election debate over amala', tagline: '“Who built Lagos?” Three tables are now shouting' },
  }),
  lagos('suya', {
    name: 'University of Suya', area: 'Allen Avenue', blurb: 'Allen Avenue’s most famous grill. Smoke, onions and every big boy’s car double-parked outside.',
    x: 13, z: 12, w: 3, d: 3, door: { x: 14, z: 15 },
  }),
  lagos('secretariat', {
    name: 'Lagos State Secretariat', area: 'Alausa', blurb: 'Alausa: the seat of Lagos State Government. Ministries, levies, files and ‘come back tomorrow’.',
    x: 18, z: 10, w: 6, d: 4, door: { x: 20, z: 14 },
  }, {
    express_speed: { tagline: 'Skip the 3-month queue. In Lagos even the bribe has a fast lane' },
  }),
  lagos('lugard', {
    name: 'Lagos State House of Assembly', area: 'Alausa', blurb: 'Where the forty honourable members sit. Bills, budgets and very long “executive sessions”.',
    x: 26, z: 10, w: 6, d: 5, door: { x: 28, z: 15 },
  }, {
    tour: { tagline: 'Walk through the chamber and the Speaker’s gallery' },
    lugard_chair: { label: 'Sneak selfie on the Speaker’s chair', tagline: 'Hop the velvet rope and bang the gavel!' },
  }, [
    { id: 'budget_padding', label: 'Shout “Point of order!” from the public gallery', icon: '📣', category: 'wild', minutes: 15, pose: 'stand', perHour: { fun: 180, social: 140 }, tagline: 'The Sergeant-at-Arms is already climbing the stairs' },
  ]),
  lagos('mall', {
    name: 'Ikeja City Mall', area: 'Alausa', blurb: 'ICM: cinema, shawarma and half of the mainland taking pictures by the fountain.',
    x: 35, z: 10, w: 5, d: 5, door: { x: 37, z: 15 },
  }, {
    escalator_stunt: { tagline: 'Strike movie star poses while Lagos shoppers stop and stare!' },
  }),
  lagos('police', {
    name: 'Lagos State Police Command', area: 'Ikeja', blurb: 'The state command on Oduduwa Way. Bail is free. Everybody says so.',
    x: 44, z: 10, w: 5, d: 5, door: { x: 46, z: 15 },
  }),
  lagos('nda', {
    name: 'Ikeja Cantonment', area: 'Ikeja', blurb: 'The army barracks beside the airport. Parades, mammy market and very shiny boots.',
    x: 3, z: 9, w: 6, d: 6, door: { x: 5, z: 15 },
  }, {
    parade: { label: 'Watch the regimental parade', tagline: 'Crisp salutes and a brass band on the cantonment square' },
    mess_lunch: { label: 'Pepper soup at the mammy market', tagline: 'Catfish pepper soup and cold malt behind the barracks' },
  }),
  lagos('club', {
    name: 'New Afrika Shrine', area: 'Agidingbi', blurb: 'Fela’s house. Afrobeat till morning, a twenty-piece band, and smoke that is definitely just from the suya.',
    x: 52, z: 10, w: 6, d: 5, door: { x: 55, z: 15 },
  }, {
    hijack_mic: { tagline: '"LAGOS ARE YOU READY?!" Blast the Shrine with wild hype' },
    club_takeover: { label: 'Take over the Shrine for the night', tagline: 'Band, lights and every drink on you. By morning all of Lagos knows your name' },
    dj_hype: { tagline: 'DJ drops beat: "Clear way for the highest spender on the mainland!"' },
  }, [
    { id: 'yabis', label: 'Climb on stage and yab the government', icon: '🎷', category: 'wild', minutes: 25, pose: 'stand', perHour: { fun: 190, social: 180 }, tagline: '“Everybody say yeah yeah!” The horn section is backing you. So is a plain-clothes man by the door' },
  ]),
  lagos('pitch', {
    name: 'Evans Square', area: 'Ebute Metta', blurb: 'The famous sand pitch. Set-piece legends, loud touchlines and scouts who are “from Belgium”.',
    x: 59, z: 11, w: 6, d: 4, door: { x: 61, z: 15 },
  }, {
    play: { label: 'Play a gritty Ebute Metta street match' },
  }),
  lagos('textile', {
    name: 'Ikorodu Road Garment Factory', area: 'Ojota', blurb: 'Rows of sewing machines turning out aso-ebi by the trailer load. Overtime every Thursday before owambe.',
    x: 68, z: 10, w: 6, d: 4, door: { x: 70, z: 14 },
  }, {
    custom_ankara: { label: 'Cut a custom aso-ebi design', tagline: 'Loud lace for 400 guests, ready by Saturday' },
  }),

  /* ---- Oshodi, Mushin & Surulere ---- */
  lagos('motorpark', {
    name: 'Oshodi Transport Interchange', area: 'Oshodi', blurb: 'Three terminals of danfo, BRT and luxury buses. Agbero calling CMS, Mile 2, Ojuelegba all at once.',
    x: 26, z: 20, w: 7, d: 4, door: { x: 29, z: 19 },
  }, {
    conductor_shout: { label: 'Conductor hype: "OSHODI OSHODI! CMS! ENTER WITH YOUR CHANGE O!"', tagline: 'Hang one leg out of the danfo door and pack 4 on a seat for 3!' },
    corn: { label: 'Boli & groundnut by the roadside', icon: '🍌', tagline: 'Roasted plantain off the coals, groundnut wrapped in old newspaper' },
    zaria: { label: 'Road trip bus to Ibadan', tagline: 'Down the Lagos–Ibadan expressway with a preacher and a drug seller on board' },
  }, [
    { id: 'danfo_race', label: 'Race a danfo down the BRT lane', icon: '🚐', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 190, social: 130, energy: -15 }, tagline: 'LASTMA is behind you. The conductor says “no shaking”' },
  ]),
  lagos('viewing', {
    name: 'Mushin Football Viewing Centre', area: 'Mushin', blurb: 'A noisy generator, wooden benches, heated arguments and match-day banters. Olosha, hold your seat.',
    x: 12, z: 21, w: 4, d: 3, door: { x: 14, z: 24 },
  }),
  lagos('hospital', {
    name: 'Lagos University Teaching Hospital', area: 'Idi-Araba', blurb: 'LUTH: emergency care, maternity ward, pharmacy, and house officers who have not slept since Tuesday.',
    x: 18, z: 20, w: 6, d: 4, door: { x: 20, z: 24 },
  }),
  lagos('stadium', {
    name: 'National Stadium, Surulere', area: 'Surulere', blurb: 'The old national stadium. Legends played here: now it is fitness clubs at dawn and suya at night.',
    x: 34, z: 19, w: 8, d: 6, door: { x: 37, z: 25 },
  }, {
    match: { label: 'Watch a Lagos derby', tagline: 'Cheer from the terraces where Nigeria won the 1980 Nations Cup' },
    sprint_challenge: { tagline: 'Dust Surulere’s fastest sprinters on the old national track!' },
    stadium_wave: { tagline: 'Get the whole of Surulere singing in harmony' },
  }),

  /* ---- Yaba & Ebute Metta ---- */
  lagos('poly', {
    name: 'University of Lagos', area: 'Akoka', blurb: 'UNILAG, the university of first choice. Lagoon front, fine boys, fine girls and no light in Moremi.',
    x: 44, z: 20, w: 6, d: 5, door: { x: 46, z: 19 },
  }, {
    lecture: { label: 'Attend a mass communication lecture', tagline: '600 students, one projector, and half the class is already a content creator' },
    protest_cancel: { tagline: 'Lead Akokites out to block University Road!' },
  }, [
    { id: 'lagoon_front', label: 'Toast somebody at the Lagoon Front', icon: '🌊', category: 'social', minutes: 40, pose: 'sit', perHour: { fun: 110, social: 170 }, tagline: 'Breeze, benches and Third Mainland Bridge in the background' },
  ]),
  lagos('techhub', {
    name: 'Yaba Tech Hub', area: 'Yaba', blurb: 'Yabacon Valley. Fast Wi-Fi, founders pitching, and somebody raising a seed round on the stairs.',
    x: 52, z: 20, w: 4, d: 4, door: { x: 53, z: 24 },
  }),
  lagos('station', {
    name: 'Mobolaji Johnson Train Station', area: 'Ebute Metta', blurb: 'The Lagos end of the Lagos – Ibadan line. Glass, escalators and coaches that leave on time.',
    x: 61, z: 20, w: 5, d: 4, door: { x: 63, z: 24 },
  }, {
    abuja: { label: 'Day trip to Ibadan', tagline: 'Morning express to Moniya. Amala at Skye Lo and back by evening' },
  }, trainActions('lagos')),
  lagos('school', {
    name: 'Yaba College of Technology', area: 'Yaba', icon: '🎓', blurb: 'YabaTech, the oldest higher institution in the country. Art students, engineers and the best fashion show nobody paid for.',
    x: 67, z: 20, w: 6, d: 4, door: { x: 69, z: 24 },
  }, {
    volunteer: { label: 'Tutor an ND1 evening class', tagline: 'Explain technical drawing to sixty tired part-time students' },
    bell_prank: { label: 'Announce a fake “lecture free day” on the PA', tagline: 'Two thousand students are already at the gate before anyone checks' },
  }),
  lagos('home', {
    name: 'Your House', area: 'Ogudu', blurb: 'Home sweet home.',
    x: 77, z: 20, w: 4, d: 4, door: { x: 78, z: 24 },
  }),
  lagos('river', {
    name: 'Makoko Waterfront', area: 'Makoko', blurb: 'Canoes, smoked fish and a whole town on stilts over the lagoon.',
    x: 46, z: 30, w: 4, d: 2, door: { x: 47, z: 30 },
  }, {
    croc_dare: { label: 'Stand up in a moving canoe', tagline: '"Oga sit down!" The whole canoe is shouting at you' },
    stone_skip: { label: 'Paddle a canoe with the fishermen', tagline: 'Thread between the stilt houses without hitting a single one' },
    sunset: { label: 'Watch the sun set behind Third Mainland Bridge', tagline: 'Golden lagoon, headlights crawling across eleven kilometres of bridge' },
  }, [
    { id: 'smoked_fish', label: 'Buy smoked fish straight off the racks', icon: '🐟', category: 'spend', cost: 2_500, minutes: 20, pose: 'stand', perHour: { hunger: 90, fun: 30, hygiene: -10 }, tagline: 'Still warm. You will smell of it till Friday' },
  ]),

  /* ---- Lagos Island ---- */
  lagos('market', {
    name: 'Balogun Market', area: 'Lagos Island', blurb: 'The biggest market in West Africa. Lace, gold, shoes, and prices that start at triple.',
    x: 6, z: 44, w: 7, d: 5, door: { x: 9, z: 43 },
  }, {
    buy_ram: { label: 'Buy a ram from the Idumota ram sellers' },
    dambu: { label: 'Eat ewa agoyin at Balogun', icon: '🍛', tagline: 'From a bowl on a woman’s head. The best ones always are' },
    kilishi: { label: 'Buy hot dodo ikire', icon: '🍌', tagline: 'Black, peppery plantain balls wrapped in nylon' },
    market_porter: { label: 'Carry lace bales as an alabaru' },
    hawk_water: { label: 'Hawk ice-cold pure water in the Idumota hold-up' },
  }, [
    { id: 'gbera', label: 'Shout “GBERA!” and run through the crowd', icon: '🏃🏾', category: 'wild', minutes: 15, pose: 'stand', perHour: { fun: 180, social: 110, energy: -15 }, tagline: 'Forty traders start running too. Nobody knows why' },
  ]),
  lagos('church', {
    name: 'Cathedral Church of Christ', area: 'Marina', blurb: 'The old cathedral on the Marina. Pipe organ, big choir, and plenty of friends after service.',
    x: 14, z: 37, w: 4, d: 3, door: { x: 15, z: 40 },
  }),
  lagos('mosque', {
    name: 'Lagos Central Mosque', area: 'Lagos Island', blurb: 'Four minarets over Nnamdi Azikiwe Street. Free public wash area.',
    x: 18, z: 44, w: 5, d: 4, door: { x: 20, z: 48 },
  }),
  lagos('arewa', {
    name: 'JK Randle Centre', area: 'Onikan', blurb: 'The centre for Yoruba culture and history. Talking drums, Eyo hats and old Lagos in photographs.',
    x: 27, z: 37, w: 5, d: 3, door: { x: 29, z: 40 },
  }, {
    sardauna_recite: { label: 'Recite Herbert Macaulay’s fieriest speech', tagline: 'Command the courtyard with vintage orator energy' },
  }),
  lagos('museum', {
    name: 'National Museum, Onikan', area: 'Onikan', blurb: 'Benin bronzes, Ife heads and the car a head of state was shot in.',
    x: 34, z: 37, w: 4, d: 3, door: { x: 35, z: 40 },
  }, {
    nok: { label: 'See the Benin bronzes', tagline: 'Four hundred years old and still better dressed than you' },
  }),
  lagos('murtala', {
    name: 'Tafawa Balewa Square', area: 'Lagos Island', blurb: 'TBS: the four white horses and the eagles at the gate. Independence was declared here; now it is concerts and owambe.',
    x: 26, z: 44, w: 7, d: 5, door: { x: 29, z: 46 },
  }, {
    durbar: { label: 'Watch the Eyo masquerades process', icon: '🎭', tagline: 'White robes, wide hats and long staffs. Remove your shoes and your cap' },
  }, [
    { id: 'owambe_gatecrash', label: 'Gate-crash an owambe in full aso-ebi', icon: '💃🏾', category: 'wild', minutes: 30, pose: 'stand', perHour: { fun: 180, social: 170, hunger: 60 }, tagline: 'You know neither the bride nor the groom. You are on the high table' },
  ]),

  /* ---- Ikoyi & Victoria Island ---- */
  lagos('polo', {
    name: 'Lagos Polo Club', area: 'Ikoyi', blurb: 'The oldest polo club in the country. Ponies, hats, and Bentleys parked on the grass.',
    x: 35, z: 44, w: 5, d: 6, door: { x: 37, z: 46 },
  }, {
    horse_sprint: { tagline: 'Gallop past the members’ stand like an Ikoyi old boy!' },
    polo_champagne: { tagline: 'Sip bubbly on manicured green lawn with old Lagos money' },
  }),
  lagos('hamdala', {
    name: 'Eko Hotel & Suites', area: 'Victoria Island', blurb: 'The grand hotel on the Atlantic. Pool, buffet, award shows and every big concert in December.',
    x: 44, z: 44, w: 5, d: 5, door: { x: 46, z: 49 },
  }, {
    pool_cannonball: { label: 'Cannonball into the Eko Hotel pool in full agbada', tagline: 'Two Nollywood stars and an influencer get soaked. Security is running' },
  }, [
    { id: 'red_carpet', label: 'Walk an award-show red carpet uninvited', icon: '📸', category: 'wild', minutes: 25, pose: 'stand', perHour: { fun: 170, social: 190 }, tagline: '“Who are you wearing?” You say “my tailor in Mushin”' },
  ]),
  /* ---- Lekki ---- */
  lagos('boutique', {
    name: 'Lekki Phase 1 Boutique', area: 'Lekki Phase 1', blurb: 'Designer agbada, lace and gold. If you ask for price, you no fit afford am.',
    x: 61, z: 43, w: 4, d: 3, door: { x: 62, z: 46 },
  }),
  lagos('bank', {
    name: 'Lekki Community Bank', area: 'Lekki Phase 1', blurb: 'A local branch for secure savings, everyday banking, and high-drama queues.',
    x: 66, z: 48, w: 4, d: 3, door: { x: 67, z: 51 },
  }, {
    queue_water: { tagline: 'Cool down 20 angry people waiting under Lagos sun!' },
  }),
  lagos('gamji', {
    name: 'Lekki Conservation Centre', area: 'Lekki', blurb: 'Monkeys, peacocks, mangroves and the longest canopy walkway in Africa. Public benches under the trees.',
    x: 75, z: 43, w: 6, d: 5, door: { x: 77, z: 45 },
  }, {}, [
    { id: 'canopy_walk', label: 'Run across the canopy walkway', icon: '🌉', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 180, social: 110, energy: -10 }, tagline: '401 metres of swinging bridge, 22 metres up, and a monkey holding your phone' },
  ]),
];

const LANDMARKS: Landmark[] = [
  { name: 'Lagos State University', icon: '🎓', model: 'campus', x: 5, z: 2, w: 5, d: 3 },
  { name: 'Computer Village', icon: '📱', model: 'compvillage', x: 37, z: 2, w: 5, d: 4 },
  { name: 'Ikeja Golf Club', icon: '⛳', model: 'golf', x: 46, z: 1, w: 6, d: 5, walkable: true },
  { name: 'Redemption City Auditorium', icon: '⛪', model: 'glorydome', x: 62, z: 2, w: 6, d: 4 },
  { name: 'National Theatre, Iganmu', icon: '🎭', model: 'nationaltheatre', x: 3, z: 20, w: 5, d: 5 },
  { name: 'Apapa Port', icon: '🚢', model: 'port', x: 13, z: 28, w: 10, d: 2 },
  { name: 'NECOM House', icon: '🏙️', model: 'cbn', x: 20, z: 37, w: 4, d: 3 },
  { name: 'Tinubu Square', icon: '⛲', model: 'fountain', x: 14, z: 44, w: 2, d: 2 },
  { name: 'Lagos House, Marina', icon: '🏛️', model: 'govhouse', x: 10, z: 54, w: 6, d: 4 },
  { name: 'Landmark Beach', icon: '🏖️', model: 'beach', x: 20, z: 57, w: 10, d: 3, walkable: true },
  { name: 'Ikoyi Club Golf Course', icon: '⛳', model: 'golf', x: 33, z: 54, w: 6, d: 4, walkable: true },
  { name: 'Eko Atlantic City', icon: '🏙️', model: 'wtc', x: 44, z: 54, w: 3, d: 4 },
  { name: 'Civic Towers', icon: '🏢', model: 'nnpc', x: 52, z: 44, w: 4, d: 4 },
  { name: 'Lekki Toll Gate', icon: '🚧', model: 'citygate', x: 68, z: 40, w: 2, d: 4, walkable: true },
];

/** Lagos's pothole sites are numbered from here on the server (city.ts, worker/roads.ts). Only ever add to the end. */
export const LAGOS_POTHOLE_BASE = 2000;

/** The mainland's roads carry the trailers, so they are the worst: the Island's are patched before every election. */
const POTHOLES: Pothole[] = [
  // Oshodi–Apapa Expressway (the port trailers)
  { x: 6.4, z: 17.6, w: 0.9, d: 0.7, yaw: 0.2, severity: 3 },
  { x: 14.5, z: 18.3, w: 0.85, d: 0.65, yaw: -0.3, severity: 3 },
  { x: 21.4, z: 17.7, w: 0.7, d: 0.5, yaw: 0.4, severity: 2 },
  { x: 30.3, z: 18.4, w: 0.9, d: 0.7, yaw: 0.1, severity: 3 },
  { x: 37.6, z: 17.6, w: 0.65, d: 0.5, yaw: -0.2, severity: 2 },
  // Agege Motor Road
  { x: 10.6, z: 11.5, w: 0.7, d: 0.5, yaw: 0.3, severity: 2 },
  { x: 11.3, z: 22.4, w: 0.85, d: 0.65, yaw: -0.4, severity: 3 },
  // Obafemi Awolowo Way & the Lagos–Ibadan Expressway
  { x: 15.4, z: 7.7, w: 0.6, d: 0.45, yaw: 0.2, severity: 1 },
  { x: 30.5, z: 8.3, w: 0.7, d: 0.5, yaw: 0.5, severity: 2 },
  { x: 48.6, z: 7.6, w: 0.85, d: 0.65, yaw: -0.2, severity: 3 },
  { x: 63.3, z: 8.4, w: 0.7, d: 0.5, yaw: 0.3, severity: 2 },
  // Ikorodu Road
  { x: 42.6, z: 12.5, w: 0.75, d: 0.55, yaw: 0.1, severity: 2 },
  { x: 43.3, z: 22.6, w: 0.85, d: 0.65, yaw: -0.3, severity: 3 },
  // Gbagada Expressway & Ogudu Road
  { x: 53.5, z: 17.7, w: 0.6, d: 0.45, yaw: 0.4, severity: 1 },
  { x: 68.4, z: 18.3, w: 0.7, d: 0.5, yaw: -0.1, severity: 2 },
  { x: 74.6, z: 13.4, w: 0.7, d: 0.5, yaw: 0.2, severity: 2 },
  // Western Avenue & Herbert Macaulay Way
  { x: 15.5, z: 26.7, w: 0.7, d: 0.5, yaw: 0.3, severity: 2 },
  { x: 33.4, z: 27.3, w: 0.8, d: 0.6, yaw: -0.4, severity: 2 },
  { x: 49.6, z: 26.6, w: 0.6, d: 0.45, yaw: 0.2, severity: 1 },
  { x: 67.3, z: 27.4, w: 0.7, d: 0.5, yaw: 0.5, severity: 2 },
  // Mobolaji Bank Anthony Way
  { x: 24.6, z: 13.4, w: 0.55, d: 0.45, yaw: -0.2, severity: 1 },
  // Marina & the Lekki–Epe Expressway
  { x: 13.5, z: 41.7, w: 0.6, d: 0.45, yaw: 0.3, severity: 1 },
  { x: 31.4, z: 42.3, w: 0.55, d: 0.45, yaw: -0.3, severity: 1 },
  { x: 53.6, z: 41.6, w: 0.7, d: 0.5, yaw: 0.2, severity: 2 },
  { x: 78.4, z: 42.4, w: 0.85, d: 0.65, yaw: 0.4, severity: 3 },
  // Ahmadu Bello Way (the ocean gets under it every rainy season)
  { x: 18.5, z: 51.7, w: 0.7, d: 0.5, yaw: 0.1, severity: 2 },
  { x: 38.4, z: 52.3, w: 0.6, d: 0.45, yaw: -0.2, severity: 1 },
  // Admiralty Way & the streets
  { x: 72.6, z: 50.5, w: 0.7, d: 0.5, yaw: 0.3, severity: 2 },
  { x: 17.5, z: 13.4, w: 0.55, d: 0.45, yaw: 0.2, severity: 1 },
  { x: 33.5, z: 22.6, w: 0.65, d: 0.5, yaw: -0.3, severity: 2 },
  { x: 66.4, z: 47.5, w: 0.55, d: 0.45, yaw: 0.5, severity: 1 },
];
addCityPotholes('lagos', LAGOS_POTHOLE_BASE, POTHOLES);

export const LAGOS = addCityMap({
  id: 'lagos', w: LAGOS_W, h: LAGOS_H, outline: OUTLINE,
  river: { path: LAGOON, half: 2.3, name: 'Lagos Lagoon' },
  roads: ROADS, places: PLACES, landmarks: LANDMARKS, billboards: true,
  // Magodo, Ikoyi and Lekki Phase 1: big compounds.
  gra: [{ x: 76, z: 9, w: 8, d: 8 }, { x: 33, z: 43, w: 9, d: 8 }, { x: 60, z: 48, w: 12, d: 6 }],
  seed: 23_40_001,
  // Packed tight: fewer trees than Kaduna, and most of them are palms by the water.
  green: 0.7,
  // Every colour of paint ever sold, under rusty zinc and new long-span.
  walls: ['#f4e1b0', '#e8c98a', '#f1d6c2', '#d9e4ec', '#f6f1e3', '#e3c7a0', '#cfe0c8', '#f0d98c'],
  roofs: ['#8a5a44', '#9a5b3c', '#6b7280', '#7f8c8d', '#a0442c', '#2f6f6a', '#b0553a'],
});
// Arrested in Lagos, you are locked in the cells at the back of the police station (game/cells.ts).
LAGOS.placeById.prison = { ...PRISON_PLACE, area: LAGOS.placeById.police.name, door: LAGOS.placeById.police.door };
