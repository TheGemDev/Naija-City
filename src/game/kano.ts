// Kano: the fourth city, a short flight north of Kaduna.
// Same cell convention as Kaduna (city.ts): cell (x, z) covers world [x, x+1] × [z, z+1], north is -z.
//
// Rough real-world layout:
//   West:   the old walled city (Birni). Dala Hill and Kurmi Market in its north, the Emir's Palace, the durbar ground
//           at Kofar Kudu and the Central Mosque in its south, the dye pits and the stadium at Kofar Mata on its east
//           side. What is left of the wall stands along Aminu Kano Way, with Kofar Kabuga, Kofar Mata and Kofar
//           Nassarawa over the roads. Bayero University is out past Kofar Kabuga.
//   Centre: Fagge (Kantin Kwari, the railway station), then Bank Road and the House of Assembly.
//   East:   Sabon Gari, the one quarter with churches and a nightclub, and Bompai beyond it. South of that is
//           Nassarawa GRA: Government House, the Secretariat, the polo and golf clubs.
//   North:  the airport, and the groundnut pyramids out on the Katsina road.
//   South:  Zoo Road (the zoo, the mall, the trade fair), the teaching hospital and Naibawa motor park on Zaria Road, Hotoro,
//           and Sharada's mills in the south-west, where the River Challawa cuts the corner.
//
// Places keep Kaduna's ids (the mosque is still 'mosque', the hotel still 'hamdala'), so their interiors, jobs and
// shops all work here: only the name, the building and where it stands change. A Kaduna place with no entry
// here does not exist in Kano.

import type { ActionDef } from './catalog';
import { JET_TRIP } from './cars';
import { addCityMap, addCityPotholes, FLIGHT_PERHOUR, flightFare, flightMinutes, jetFlight, PLACE_BY_ID, PRISON_PLACE, smoothClosed, smoothOpen, type Landmark, type P2, type Place, type Pothole, type Road } from './city';

export const KANO_W = 82;
export const KANO_H = 60;

/** City boundary: a broad, flat sprawl on the plain, with the river taking a bite out of the south-west corner. */
const OUTLINE: P2[] = smoothClosed(
  [
    [7, 0.5], [20, -1.5], [34, 1], [48, -1], [62, 0.5], [75, 3], [82.5, 10], [84, 21], [82.5, 32], [84, 43], [80.5, 52],
    [70, 57.5], [56, 59.5], [42, 58], [30, 59.5], [21, 57], [13, 53.5], [5, 50.5], [-0.5, 46], [-1.5, 37], [0.5, 28], [-1.5, 19], [-0.5, 10], [2, 4],
  ],
  8,
);

/** The River Challawa's centre line: it comes in from the west and leaves by the south, round Sharada. */
const CHALLAWA: P2[] = smoothOpen([[-5, 43.5], [3, 46], [9, 48.8], [15, 52.2], [20, 56], [23, 62]], 10);

const ROADS: Road[] = [
  // East – west
  { x: 3, z: 7, w: 38, d: 2, main: true, name: 'Katsina Road' },
  { x: 41, z: 7, w: 38, d: 2, main: true, name: 'Hadejia Road' },
  { x: 2, z: 18, w: 39, d: 2, main: true, name: 'Emir’s Palace Road' },
  { x: 41, z: 18, w: 40, d: 2, main: true, name: 'Murtala Mohammed Way' },
  { x: 2, z: 29, w: 39, d: 2, main: true, name: 'BUK Road' },
  { x: 41, z: 29, w: 40, d: 2, main: true, name: 'State Road' },
  { x: 4, z: 40, w: 37, d: 2, main: true, name: 'Sharada Road' },
  { x: 41, z: 40, w: 38, d: 2, main: true, name: 'Maiduguri Road' },
  { x: 26, z: 51, w: 50, d: 2, main: true, name: 'Naibawa Road' },
  // North – south
  { x: 10, z: 7, w: 2, d: 35, main: true, name: 'Aminu Kano Way' },
  { x: 26, z: 7, w: 2, d: 22, main: true, name: 'Jakara Road' },
  { x: 26, z: 29, w: 2, d: 24, main: true, name: 'Zoo Road' },
  { x: 41, z: 7, w: 2, d: 22, main: true, name: 'Ibrahim Taiwo Road' },
  { x: 41, z: 29, w: 2, d: 24, main: true, name: 'Zaria Road' },
  { x: 58, z: 7, w: 2, d: 11, main: true, name: 'Airport Road' },
  { x: 58, z: 18, w: 2, d: 22, main: true, name: 'Audu Bako Way' },
  { x: 58, z: 40, w: 2, d: 13, main: true, name: 'Hotoro Road' },
  { x: 74, z: 7, w: 2, d: 46, main: true, name: 'Eastern Bypass' },
  // Streets
  { x: 18, z: 9, w: 1, d: 9, name: 'Dala Road' },
  { x: 34, z: 9, w: 1, d: 9, name: 'Kofar Mata Road' },
  { x: 50, z: 9, w: 1, d: 9, name: 'Bello Road' },
  { x: 66, z: 9, w: 1, d: 9, name: 'France Road' },
  { x: 18, z: 20, w: 1, d: 9, name: 'Kofar Kudu Road' },
  { x: 34, z: 20, w: 1, d: 9, name: 'Kofar Nassarawa Road' },
  { x: 50, z: 20, w: 1, d: 9, name: 'Bank Road' },
  { x: 66, z: 20, w: 1, d: 9, name: 'Lamido Crescent' },
  { x: 18, z: 31, w: 1, d: 9, name: 'Challawa Road' },
  { x: 34, z: 31, w: 1, d: 9, name: 'Gyadi-Gyadi Road' },
  { x: 50, z: 31, w: 1, d: 9, name: 'Race Course Road' },
  { x: 66, z: 31, w: 1, d: 9, name: 'Club Road' },
  { x: 50, z: 42, w: 1, d: 9, name: 'Tarauni Road' },
  { x: 66, z: 42, w: 1, d: 9, name: 'Hotoro GRA Road' },
];

type Spot = Pick<Place, 'name' | 'area' | 'blurb' | 'x' | 'z' | 'w' | 'd' | 'door'> & Partial<Pick<Place, 'model' | 'icon'>>;

/** Kaduna's place of the same id, moved and renamed, with any Kaduna-only wording in its activities swapped out. */
function kano(id: string, spot: Spot, relabel: Record<string, Partial<ActionDef>> = {}, extra: ActionDef[] = []): Place {
  const base = PLACE_BY_ID[id];
  const actions = base.actions
    .filter((a) => a.effect !== 'travel')
    .map((a) => (relabel[a.id] ? { ...a, ...relabel[a.id] } : a));
  return { ...base, ...spot, actions: [...extra, ...actions] };
}

const flight = (to: 'kaduna' | 'abuja' | 'lagos', name: string, tagline: string): ActionDef[] => [
  { id: `fly_${to}`, label: `Fly to ${name}`, icon: '🛫', category: 'spend', cost: flightFare('kano', to), minutes: flightMinutes('kano', to), pose: 'hidden', effect: 'travel', destination: to, perHour: FLIGHT_PERHOUR, tagline },
  { id: `fly_${to}_jet`, label: `Fly your private jet to ${name}`, icon: '🛩️', category: 'spend', cost: JET_TRIP.cost, ...jetFlight('kano', to), pose: 'hidden', effect: 'travel', destination: to, jet: true, tagline: 'Private terminal, no queue. Chef, bed and shower on board: land with every bar full' },
];

const PLACES: Place[] = [
  /* ---- The airport & the Katsina road ---- */
  kano('airport', {
    name: 'Mallam Aminu Kano International Airport', area: 'Airport Road', blurb: 'MAKIA, the oldest airport in the country. Hajj flights, cargo planes and harmattan dust on every windscreen.',
    x: 46, z: 1, w: 16, d: 5, door: { x: 54, z: 6 },
  }, {
    runway_dash: { tagline: 'FAAN security screaming into radios while you snap the coolest flick!' },
  }, [
    ...flight('kaduna', 'Kaduna', 'Twenty minutes south to Kaduna International. You will not finish the meat pie'),
    ...flight('abuja', 'Abuja', 'The morning shuttle to Nnamdi Azikiwe: contractors, emirs’ sons and one very tall basket of kola'),
    ...flight('lagos', 'Lagos', 'The long haul south to Murtala Muhammed International. Every overhead locker is full of kilishi'),
    { id: 'hajj_sendoff', label: 'Join a Hajj send-off at departures', icon: '🕋', category: 'social', minutes: 30, pose: 'stand', perHour: { fun: 90, social: 170 }, tagline: 'Forty relatives, one pilgrim, and prayers that reach the car park' },
  ]),
  kano('nda', {
    name: 'Bukavu Barracks', area: 'Katsina Road', blurb: 'The army barracks on the Katsina road. Parades, mammy market and very shiny boots.',
    x: 3, z: 10, w: 6, d: 6, door: { x: 5, z: 16 },
  }, {
    parade: { label: 'Watch the regimental parade', tagline: 'Crisp salutes and a brass band on the barracks square' },
    mess_lunch: { label: 'Suya and cold malt at the mammy market', tagline: 'The best suya in Kano is behind a barracks fence. Everybody knows' },
  }),

  /* ---- The old city (Birni) ---- */
  kano('market', {
    name: 'Kurmi Market', area: 'Old City', blurb: 'Five hundred years of trading in one maze of alleys. Leather, brass, calabashes, kola and prices that begin with “for you, my friend”.',
    x: 19, z: 11, w: 6, d: 5, door: { x: 22, z: 16 },
  }, {
    buy_ram: { label: 'Buy a ram at Kasuwar Rago' },
    dambu: { label: 'Eat dambun nama at Kurmi', tagline: 'Shredded, fried and spiced. Sold by the mudu, finished by the handful' },
    kilishi: { label: 'Buy kilishi by the sheet', tagline: 'Kano kilishi: thin as paper, hot as the sun that dried it' },
    market_porter: { label: 'Push a loaded barrow as a dan dako' },
    hawk_water: { label: 'Hawk ice-cold pure water in the alleys' },
    ankara: { label: 'Buy atamfa & haggle', tagline: 'Six yards, three prices, and one that is “last”' },
  }, [
    { id: 'kurmi_lost', label: 'Take a “shortcut” through the alleys', icon: '🧭', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 170, social: 110, energy: -12 }, tagline: 'You came out forty minutes later at the same calabash seller. He waved' },
  ]),
  kano('stadium', {
    name: 'Sani Abacha Stadium', area: 'Kofar Mata', blurb: 'Home of Kano Pillars. Sai Masu Gida: sixteen thousand voices and drums that never stop.',
    x: 35, z: 10, w: 6, d: 6, door: { x: 37, z: 16 },
  }, {
    match: { label: 'Watch Kano Pillars at home', tagline: 'Sai Masu Gida! Nobody leaves Kofar Mata with three points' },
    sprint_challenge: { tagline: 'Dust Kofar Mata’s fastest sprinters on the stadium track!' },
    stadium_wave: { tagline: 'Get the whole of Kofar Mata chanting “Sai Masu Gida!”' },
  }),
  kano('murtala', {
    name: 'Kofar Kudu Durbar Ground', area: 'Old City', blurb: 'The open ground before the Emir’s Palace. Hawan Daushe gallops here at Sallah; weddings and rallies fill it the rest of the year.',
    x: 19, z: 21, w: 6, d: 5, door: { x: 22, z: 23 },
  }, {
    durbar: { label: 'Watch the Hawan Daushe Durbar', tagline: 'A thousand horses charge the palace gate and stop in a wall of dust. The kakaki has not paused for breath' },
  }, [
    { id: 'jahi_salute', label: 'Practise the jahi charge on foot', icon: '🏇🏾', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 180, social: 130, energy: -12 }, tagline: 'Run at the palace gate with your fist up and stop dead. The dogarai are not amused' },
  ]),
  kano('mosque', {
    name: 'Kano Central Mosque', area: 'Old City', blurb: 'The great mosque beside the palace. On Friday the rows run out of the gate and down the road. Free public wash area.',
    x: 28, z: 21, w: 5, d: 4, door: { x: 30, z: 25 },
  }),
  kano('museum', {
    name: 'Gidan Makama Museum', area: 'Old City', blurb: 'A fifteenth-century mud palace. Chain mail, royal drums and the gates the old city wall used to hang.',
    x: 35, z: 21, w: 4, d: 3, door: { x: 36, z: 24 },
  }, {
    nok: { label: 'See the old city gates and the cavalry armour', tagline: 'Quilted horse armour and a door the height of two men' },
  }),
  kano('arewa', {
    name: 'Gidan Dan Hausa', area: 'Old City', blurb: 'The old mud house where the first western school in the north began. Books, photographs and very thick walls.',
    x: 35, z: 25, w: 5, d: 3, door: { x: 37, z: 28 },
  }, {
    sardauna_recite: { label: 'Recite Mallam Aminu Kano’s fieriest speech', tagline: 'Talakawa! The courtyard is with you before the second line' },
  }),

  /* ---- Bayero University & Kabuga ---- */
  kano('poly', {
    name: 'Bayero University Kano', area: 'Kabuga', blurb: 'BUK. Old site, new site, and a shuttle bus that carries one whole faculty at a time.',
    x: 3, z: 22, w: 6, d: 5, door: { x: 5, z: 27 },
  }, {
    lecture: { label: 'Attend a mass communication lecture', tagline: 'Seven hundred students, one microphone, and the back row is listening by faith' },
    protest_cancel: { tagline: 'Lead BUK students out to block BUK Road!' },
  }),
  kano('school', {
    name: 'Rumfa College', area: 'Kabuga', icon: '🎓', blurb: 'The old Kano Middle School, 1927. Half the emirate’s big men sat on these benches.',
    x: 3, z: 32, w: 6, d: 4, door: { x: 5, z: 31 },
  }),

  /* ---- Fagge ---- */
  kano('buka', {
    name: 'Hajiya Ladi Tuwo & Mai Shayi', area: 'Fagge', blurb: 'Tuwo with every soup, danwake, fura, and a mai shayi who has not turned his stove off since 1998.',
    x: 44, z: 14, w: 3, d: 3, door: { x: 45, z: 17 },
  }, {
    politics_tea: { tagline: '“Who tarred this road, and with whose money?” Three benches are now shouting' },
  }),
  kano('station', {
    name: 'Kano Railway Station', area: 'Fagge', blurb: 'The end of the line from Lagos since 1911. The groundnuts left from here; now it is cattle, cement and patient passengers.',
    x: 52, z: 10, w: 5, d: 4, door: { x: 54, z: 14 },
  }, {
    abuja: { label: 'Day trip to Zaria', tagline: 'The morning train down the old line. Back by evening with a sack of sugar cane' },
  }),

  /* ---- Sabon Gari & Bompai ---- */
  kano('club', {
    name: 'Sabon Gari Lounge & Nightclub', area: 'Sabon Gari', blurb: 'The one quarter of Kano where the music is loud after midnight. Hisbah know the address.',
    x: 60, z: 10, w: 6, d: 5, door: { x: 63, z: 15 },
  }, {
    hijack_mic: { tagline: '"KANO ARE YOU READY?!" Blast Sabon Gari with wild hype' },
    club_takeover: { label: 'Take over the lounge for the night', tagline: 'Band, lights and every drink on you. By morning all of Sabon Gari knows your name' },
    dj_hype: { tagline: 'DJ drops beat: "Clear way for the highest spender in Kano!"' },
  }),
  kano('church', {
    name: 'Our Lady of Fatima Cathedral', area: 'Sabon Gari', blurb: 'The cathedral in Sabon Gari. Morning mass, a big choir, and harvest thanksgiving that lasts all day.',
    x: 67, z: 10, w: 4, d: 3, door: { x: 68, z: 13 },
  }),
  kano('viewing', {
    name: 'Sabon Gari Football Viewing Centre', area: 'Sabon Gari', blurb: 'A noisy generator, wooden benches, heated arguments and match-day banters. Hold your seat.',
    x: 68, z: 14, w: 4, d: 3, door: { x: 70, z: 17 },
  }),
  kano('police', {
    name: 'Kano State Police Command', area: 'Bompai', blurb: 'The state command at Bompai. Bail is free. Everybody says so.',
    x: 76, z: 10, w: 4, d: 5, door: { x: 77, z: 15 },
  }),

  /* ---- Bank Road & the Assembly ---- */
  kano('bank', {
    name: 'Kano Community Bank', area: 'Bank Road', blurb: 'A local branch for secure savings, everyday banking, and high-drama queues.',
    x: 44, z: 21, w: 4, d: 3, door: { x: 45, z: 24 },
  }, {
    queue_water: { tagline: 'Cool down 20 angry people waiting under Kano sun!' },
  }),
  kano('techhub', {
    name: 'Kano Digital Hub', area: 'Bank Road', blurb: 'Fast Wi-Fi, founders pitching in Hausa and English, and an agritech start-up on every desk.',
    x: 44, z: 25, w: 4, d: 3, door: { x: 45, z: 28 },
  }),
  kano('lugard', {
    name: 'Kano State House of Assembly', area: 'Bank Road', blurb: 'Where the forty honourable members sit. Bills, budgets and very long “executive sessions”.',
    x: 51, z: 21, w: 6, d: 5, door: { x: 53, z: 26 },
  }, {
    tour: { tagline: 'Walk through the chamber and the Speaker’s gallery' },
    lugard_chair: { label: 'Sneak selfie on the Speaker’s chair', tagline: 'Hop the velvet rope and bang the gavel!' },
  }),

  /* ---- Nassarawa GRA ---- */
  kano('secretariat', {
    name: 'Audu Bako Secretariat', area: 'Nassarawa', blurb: 'The seat of Kano State Government. Ministries, files and ‘ka dawo gobe’: come back tomorrow.',
    x: 60, z: 21, w: 5, d: 4, door: { x: 62, z: 25 },
  }, {
    express_speed: { tagline: 'Skip the 3-month queue. The messenger knows a messenger' },
  }),
  kano('hamdala', {
    name: 'Tahir Guest Palace', area: 'Nassarawa GRA', blurb: 'Kano’s grand hotel. Pool, buffet, governors’ convoys in the car park and wedding dinners every weekend.',
    x: 76, z: 21, w: 4, d: 5, door: { x: 77, z: 26 },
  }, {
    pool_cannonball: { label: 'Cannonball into the Tahir pool in full babban riga', tagline: 'Two commissioners and a bride’s mother get soaked. Security is running' },
  }),
  kano('polo', {
    name: 'Kano Polo Club', area: 'Race Course', blurb: 'Ponies, turbans and Range Rovers on the grass. The emirate has been riding here for a hundred years.',
    x: 43, z: 32, w: 6, d: 6, door: { x: 45, z: 34 },
  }, {
    horse_sprint: { tagline: 'Gallop past the members’ stand like a prince of the emirate!' },
    polo_champagne: { label: 'Polo lawn zobo flex in shades', tagline: 'Chilled zobo in a champagne flute. Nobody can tell from the stand' },
  }),
  kano('boutique', {
    name: 'Nassarawa GRA Boutique', area: 'Nassarawa GRA', blurb: 'Hand-embroidered babban riga, Swiss voile and caps that cost a cow. If you ask for price, you no fit afford am.',
    x: 60, z: 32, w: 4, d: 3, door: { x: 61, z: 35 },
  }, {
    try_agbada: { label: 'Try on a ₦350k babban riga and pose', tagline: 'Three months of hand embroidery. Do not sweat in it' },
  }),

  /* ---- Zoo Road ---- */
  kano('gamji', {
    name: 'Kano Zoological Garden', area: 'Zoo Road', blurb: 'Gandun Daji: lions, ostriches, a very old elephant and every primary school in Kano on excursion. Public benches under the trees.',
    x: 19, z: 32, w: 6, d: 5, door: { x: 22, z: 34 },
  }, {}, [
    { id: 'ostrich_race', label: 'Race the ostrich along its fence', icon: '🦤', category: 'wild', minutes: 15, pose: 'stand', perHour: { fun: 180, social: 110, energy: -12 }, tagline: 'It let you lead for ten metres out of pity' },
  ]),
  kano('mall', {
    name: 'Ado Bayero Mall', area: 'Zoo Road', blurb: 'The biggest mall in the north. Cinema, shawarma and half of Kano taking pictures on the escalator.',
    x: 28, z: 32, w: 5, d: 5, door: { x: 30, z: 37 },
  }, {
    escalator_stunt: { tagline: 'Strike movie star poses while Kano shoppers stop and stare!' },
  }),
  kano('suya', {
    name: 'Zoo Road Suya & Balangu Spot', area: 'Zoo Road', blurb: 'Balangu off the fire, suya by the stick and yaji the mai nama mixes himself. The smoke is the signboard.',
    x: 36, z: 32, w: 3, d: 3, door: { x: 37, z: 35 },
  }, {
    eat: { label: 'Eat hot balangu with yaji', tagline: 'Chopped on paper with onion and cabbage. Eat it standing, like everybody else' },
  }),
  kano('pitch', {
    name: 'Gyadi-Gyadi Football Pitch', area: 'Gyadi-Gyadi', blurb: 'Red dust, bare feet and a touchline of scouts who are “from Pillars”.',
    x: 35, z: 36, w: 5, d: 3, door: { x: 37, z: 39 },
  }, {
    play: { label: 'Play a gritty Gyadi-Gyadi street match' },
  }),

  /* ---- Sharada & the river ---- */
  kano('textile', {
    name: 'Sharada Textile Mill', area: 'Sharada', blurb: 'One of the last looms running in Sharada. Shadda, atamfa and overtime before every Sallah.',
    x: 12, z: 43, w: 6, d: 4, door: { x: 14, z: 42 },
  }, {
    custom_ankara: { label: 'Weave a custom shadda pattern', tagline: 'Starched, shining and loud enough for a governor’s wedding' },
  }),
  kano('river', {
    name: 'River Challawa', area: 'Challawa', blurb: 'The river that waters Kano. Fishermen, dry-season farms on the bank and donkeys carrying sand.',
    x: 5, z: 46, w: 4, d: 2, door: { x: 7, z: 45 },
  }, {
    croc_dare: { label: 'Wade out to the sandbank', tagline: '"Something just touched my leg!" Run back splashing' },
    sunset: { label: 'Watch the sun set over the Challawa', tagline: 'Red harmattan sun, herons on the sandbank, donkeys going home' },
  }, [
    { id: 'onion_farm', label: 'Help water a dry-season onion farm', icon: '🧅', category: 'social', minutes: 40, pose: 'stand', perHour: { fun: 40, social: 120, energy: -20 }, tagline: 'Calabash by calabash. The farmer sends you home with a sack' },
  ]),

  /* ---- Zaria Road & Hotoro ---- */
  kano('hospital', {
    name: 'Aminu Kano Teaching Hospital', area: 'Zaria Road', blurb: 'AKTH: emergency care, maternity ward, pharmacy, and house officers who have not slept since Tuesday.',
    x: 33, z: 43, w: 6, d: 4, door: { x: 35, z: 42 },
  }),
  kano('motorpark', {
    name: 'Naibawa Motor Park', area: 'Naibawa', blurb: 'Buses to Kaduna, Abuja, Jos and Lagos. Agbero calling every destination at once, and kosai frying at the gate.',
    x: 43, z: 44, w: 7, d: 4, door: { x: 46, z: 43 },
  }, {
    conductor_shout: { label: 'Conductor hype: "KADUNA KADUNA! ZARIA! SAURA MUTUM DAYA!"', tagline: '“One more person” for the last forty minutes. Pack 4 on a seat for 3!' },
    corn: { label: 'Kosai & koko at the gate', icon: '🥣', tagline: 'Hot bean cakes off the oil and millet pap in a rubber bowl' },
    zaria: { label: 'Road trip bus to Zaria', tagline: 'Two hours down the Zaria road with a preacher and a drug seller on board' },
  }, [
    { id: 'adaidaita_race', label: 'Race an adaidaita sahu out of the park', icon: '🛺', category: 'wild', minutes: 20, pose: 'stand', perHour: { fun: 190, social: 130, energy: -15 }, tagline: 'Yellow keke, three wheels, no fear. KAROTA is behind you with a whistle' },
  ]),
  kano('home', {
    name: 'Your House', area: 'Hotoro', blurb: 'Home sweet home.',
    x: 61, z: 43, w: 4, d: 4, door: { x: 62, z: 47 },
  }),
];

const LANDMARKS: Landmark[] = [
  { name: 'Groundnut Pyramids', icon: '🥜', model: 'pyramids', x: 14, z: 2, w: 6, d: 4 },
  { name: 'Dala Hill', icon: '⛰️', model: 'dala', x: 13, z: 10, w: 5, d: 6 },
  { name: 'Kofar Mata Dye Pits', icon: '🧵', model: 'dyepits', x: 28, z: 11, w: 5, d: 4 },
  { name: 'Kantin Kwari Market', icon: '🧶', model: 'compvillage', x: 43, z: 9, w: 6, d: 4 },
  { name: 'Emir’s Palace (Gidan Rumfa)', icon: '👑', model: 'emirpalace', x: 13, z: 21, w: 5, d: 5 },
  { name: 'Government House, Kano', icon: '🏛️', model: 'govhouse', x: 67, z: 21, w: 6, d: 4 },
  { name: 'Yusuf Maitama Sule University', icon: '🎓', model: 'campus', x: 12, z: 32, w: 5, d: 3 },
  { name: 'Kano Golf Club', icon: '⛳', model: 'golf', x: 51, z: 32, w: 6, d: 5, walkable: true },
  { name: 'Silver Jubilee Roundabout', icon: '⛲', model: 'fountain', x: 68, z: 34, w: 2, d: 2 },
  { name: 'Farm Centre GSM Market', icon: '📱', model: 'compvillage', x: 52, z: 43, w: 5, d: 4 },
  { name: 'Kano Trade Fair Complex', icon: '🎡', model: 'tradefair', x: 30, z: 54, w: 6, d: 4 },
  // The gates stand over the road: you walk and drive through them.
  { name: 'Kofar Kabuga', icon: '🚪', model: 'kofar', x: 12, z: 17, w: 1, d: 4, walkable: true },
  { name: 'Kofar Mata', icon: '🚪', model: 'kofar', x: 39, z: 17, w: 1, d: 4, walkable: true },
  { name: 'Kofar Nassarawa', icon: '🚪', model: 'kofar', x: 39, z: 28, w: 1, d: 4, walkable: true },
  // What is left of the wall (Ganuwa): stretches of mud rampart round the old city's west and south. One label does for all.
  { name: 'Ancient City Wall', icon: '🧱', model: 'citywall', x: 12, z: 9, w: 1, d: 8 },
  { name: 'City Wall at Kabuga', icon: '🧱', model: 'citywall', x: 12, z: 21, w: 1, d: 7, quiet: true },
  { name: 'City Wall at Kofar Kudu', icon: '🧱', model: 'citywall', x: 13, z: 28, w: 5, d: 1, quiet: true },
  { name: 'City Wall at Kofar Na’isa', icon: '🧱', model: 'citywall', x: 19, z: 28, w: 7, d: 1, quiet: true },
];

/** Kano's pothole sites are numbered from here on the server (city.ts, worker/roads.ts). Only ever add to the end. */
export const KANO_POTHOLE_BASE = 3000;

/** The trailers come down Katsina Road and round the bypass; Nassarawa's roads are patched before every visit. */
const POTHOLES: Pothole[] = [
  // Katsina Road & Hadejia Road
  { x: 7.4, z: 7.6, w: 0.85, d: 0.65, yaw: 0.2, severity: 3 },
  { x: 19.5, z: 8.3, w: 0.7, d: 0.5, yaw: -0.3, severity: 2 },
  { x: 33.4, z: 7.7, w: 0.9, d: 0.7, yaw: 0.4, severity: 3 },
  { x: 49.6, z: 8.4, w: 0.65, d: 0.5, yaw: 0.1, severity: 2 },
  { x: 67.3, z: 7.6, w: 0.85, d: 0.65, yaw: -0.2, severity: 3 },
  // Eastern Bypass
  { x: 74.6, z: 13.5, w: 0.85, d: 0.65, yaw: 0.3, severity: 3 },
  { x: 75.3, z: 24.4, w: 0.7, d: 0.5, yaw: -0.4, severity: 2 },
  { x: 74.7, z: 36.5, w: 0.9, d: 0.7, yaw: 0.2, severity: 3 },
  { x: 75.4, z: 47.4, w: 0.7, d: 0.5, yaw: 0.5, severity: 2 },
  // Emir’s Palace Road & Murtala Mohammed Way
  { x: 6.5, z: 18.7, w: 0.6, d: 0.45, yaw: 0.2, severity: 1 },
  { x: 22.4, z: 19.3, w: 0.7, d: 0.5, yaw: -0.2, severity: 2 },
  { x: 47.5, z: 18.6, w: 0.85, d: 0.65, yaw: 0.3, severity: 3 },
  { x: 63.4, z: 19.4, w: 0.7, d: 0.5, yaw: -0.3, severity: 2 },
  // Aminu Kano Way & Jakara Road
  { x: 10.6, z: 13.4, w: 0.7, d: 0.5, yaw: 0.1, severity: 2 },
  { x: 11.3, z: 35.5, w: 0.85, d: 0.65, yaw: 0.4, severity: 3 },
  { x: 26.7, z: 13.6, w: 0.75, d: 0.55, yaw: -0.2, severity: 2 },
  // Ibrahim Taiwo Road & Zaria Road
  { x: 41.6, z: 12.5, w: 0.7, d: 0.5, yaw: 0.3, severity: 2 },
  { x: 42.3, z: 35.4, w: 0.85, d: 0.65, yaw: -0.4, severity: 3 },
  { x: 41.7, z: 47.6, w: 0.75, d: 0.55, yaw: 0.2, severity: 2 },
  // BUK Road & State Road (the Governor drives State Road, so it is small)
  { x: 16.5, z: 29.7, w: 0.7, d: 0.5, yaw: 0.5, severity: 2 },
  { x: 33.4, z: 30.3, w: 0.6, d: 0.45, yaw: -0.1, severity: 1 },
  { x: 54.5, z: 29.6, w: 0.5, d: 0.4, yaw: 0.2, severity: 1 },
  // Sharada Road & Maiduguri Road
  { x: 8.5, z: 40.7, w: 0.85, d: 0.65, yaw: 0.3, severity: 3 },
  { x: 21.4, z: 41.3, w: 0.7, d: 0.5, yaw: -0.3, severity: 2 },
  { x: 48.6, z: 40.6, w: 0.7, d: 0.5, yaw: 0.4, severity: 2 },
  { x: 68.4, z: 41.4, w: 0.6, d: 0.45, yaw: 0.1, severity: 1 },
  // Zoo Road, Audu Bako Way & Naibawa Road
  { x: 26.6, z: 45.5, w: 0.7, d: 0.5, yaw: -0.2, severity: 2 },
  { x: 59.3, z: 24.5, w: 0.5, d: 0.4, yaw: 0.3, severity: 1 },
  { x: 36.5, z: 51.7, w: 0.75, d: 0.55, yaw: 0.2, severity: 2 },
  { x: 64.4, z: 52.3, w: 0.7, d: 0.5, yaw: -0.4, severity: 2 },
];
addCityPotholes('kano', KANO_POTHOLE_BASE, POTHOLES);

export const KANO = addCityMap({
  id: 'kano', w: KANO_W, h: KANO_H, outline: OUTLINE,
  river: { path: CHALLAWA, half: 1.5, name: 'River Challawa' },
  roads: ROADS, places: PLACES, landmarks: LANDMARKS, billboards: true,
  // Nassarawa GRA and Hotoro GRA: big compounds.
  gra: [{ x: 60, z: 20, w: 20, d: 9 }, { x: 67, z: 42, w: 7, d: 9 }],
  seed: 3_14_159,
  // The edge of the Sahel: far fewer trees than Kaduna.
  green: 0.55,
  // Mud-brown, ochre and whitewash under flat roofs and rusted zinc.
  walls: ['#d9b48a', '#c9a074', '#e6cfa5', '#bf9566', '#efe2c6', '#d4a373', '#e8d9b8'],
  roofs: ['#8a5a44', '#9c6b4a', '#7a6652', '#a47551', '#6b7280', '#b08d6a', '#8f5d3b'],
});
// Arrested in Kano, you are held at Kurmawa, the old prison inside the city wall. Like Kaduna's it is not on the map.
KANO.placeById.prison = { ...PRISON_PLACE, name: 'Kurmawa Central Prison', area: 'Kurmawa' };
