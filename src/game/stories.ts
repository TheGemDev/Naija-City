import type { Need } from './catalog';
import type { LiveEventId, RoadEventId } from './live';
import type { Vehicle } from './driveState';
import { ABUJA_STORIES } from './abujaStories';
import { LAGOS_STORIES } from './lagosStories';
import { KANO_STORIES } from './kanoStories';

// Street stories: little encounters that pop up when you stroll out of the gate, arrive somewhere in
// town, or drive around. Choices change needs, money, good deeds and notoriety. Some choices hide a
// rare twist (`rare`), rolled when you pick them: a 1-in-100 visa, a lottery win that is really a scam.

/** Things a story can leave you with, which achievements and the legacy score look at. */
export type StoryFlag = 'visa' | 'viral' | 'nollywood' | 'scammed' | 'blessed' | 'mentor' | 'jackpot';

export interface StoryOutcome {
  /** Negative: you pay. Positive: a windfall (the server caps these, see src/game/gigs.ts 'luck'). */
  money?: number;
  goodDeeds?: number;
  notoriety?: number;
  knowledge?: number;
  needs?: Partial<Record<Need, number>>;
  flag?: StoryFlag;
}

export interface StoryChoice {
  id: string;
  label: string;
  result: string;
  outcome: StoryOutcome;
  /** A rare twist: with this chance, `result`/`outcome` are replaced. */
  rare?: { chance: number; result: string; outcome: StoryOutcome };
}

export interface StoryRequirement {
  /** At least this much notoriety. */
  notoriety?: number;
  /** At least this many good deeds. */
  goodDeeds?: number;
  night?: boolean;
  day?: boolean;
  car?: boolean;
  minMoney?: number;
  /** Only while this live event is on (src/game/live.ts). */
  event?: LiveEventId;
  /** Only in this city (src/game/regions.ts). */
  city?: string;
  /** Never to somebody holding public office: nobody snatches a governor out of a convoy. */
  noOffice?: boolean;
  /** Only while driving (src/game/drive.ts). */
  driving?: boolean;
  /** Never while driving. */
  onFoot?: boolean;
  /** Only while driving one of these. */
  vehicle?: Vehicle[];
  /** Only while this road condition holds (src/game/live.ts). */
  roadEvent?: RoadEventId;
  /** Only while high (src/game/vice.ts). */
  high?: boolean;
}

export interface StreetStory {
  id: string;
  icon: string;
  title: string;
  scene: string;
  weight: number;
  requires?: StoryRequirement;
  choices: StoryChoice[];
}

export const STREET_STORIES: StreetStory[] = [
  {
    id: 'area-boys',
    icon: '🛺',
    title: 'Street toll',
    scene: 'A group of area boys block the shortcut and demand “something for the boys.”',
    weight: 16,
    choices: [
      { id: 'pay', label: 'Pay ₦5k', result: 'You paid and got through without a scene.', outcome: { money: -5_000 } },
      { id: 'refuse', label: 'Refuse', result: 'They grab your spare cash before you get away.', outcome: { money: -12_000, needs: { energy: -8 } } },
    ],
  },
  {
    id: 'street-pastor',
    icon: '🙏',
    title: 'Street pastor',
    scene: 'A friendly street pastor asks if you can spare a little for a community meal.',
    weight: 15,
    choices: [
      { id: 'donate', label: 'Donate ₦2k', result: 'Your small donation helps feed someone today.', outcome: { money: -2_000, goodDeeds: 1 } },
      { id: 'decline', label: 'Wish them well', result: 'You wished them well and carried on.', outcome: {} },
    ],
  },
  {
    id: 'lost-wallet',
    icon: '👛',
    title: 'Wallet on the road',
    scene: 'You spot a wallet near a danfo stop. Nobody seems to have noticed it.',
    weight: 16,
    choices: [
      { id: 'return', label: 'Find its owner', result: 'The grateful owner thanks you. Good people still dey.', outcome: { goodDeeds: 2, needs: { social: 8, fun: 4 } } },
      { id: 'keep', label: 'Keep the wallet', result: 'You kept the wallet instead of returning it. That choice may follow you around.', outcome: { notoriety: 2 } },
    ],
  },
  {
    id: 'kidnap-scare',
    icon: '🚨',
    title: 'Kidnapping scare',
    scene: 'You are taken to a hideout and allowed to send one message asking for help. Your family is trying to get you home safely.',
    weight: 3,
    requires: { noOffice: true },
    choices: [
      { id: 'police', label: 'Call for help', result: 'People nearby help you reach safety. You report the car.', outcome: { goodDeeds: 1, needs: { energy: -12, fun: -8 } } },
      { id: 'ransom', label: 'Pay for safe passage · ₦40k', result: 'You paid to get away quickly and made it home safe.', outcome: { money: -40_000, needs: { energy: -8, fun: -12 } } },
    ],
  },
  {
    id: 'efcc-hotel',
    icon: '⚖️',
    title: 'EFCC at the hotel',
    scene: 'In this fictional story, EFCC officers arrive at a nearby hotel and take several guests for questioning. The street is tense.',
    weight: 5,
    choices: [
      { id: 'witness', label: 'Give a witness statement', result: 'You shared what you saw and let the officers handle it.', outcome: { goodDeeds: 1, needs: { energy: -4 } } },
      { id: 'leave', label: 'Keep your distance', result: 'You stayed out of it and took another route.', outcome: {} },
    ],
  },
  {
    id: 'danfo-help',
    icon: '🚌',
    title: 'Danfo trouble',
    scene: 'A danfo driver has a flat tyre, and passengers are stranded in the heat.',
    weight: 12,
    choices: [
      { id: 'help', label: 'Help the passengers', result: 'You helped organise another ride. People appreciated it.', outcome: { goodDeeds: 2, needs: { social: 6, energy: -4 } } },
      { id: 'move-on', label: 'Keep moving', result: 'You continued on your way.', outcome: {} },
    ],
  },
  {
    id: 'street-football',
    icon: '⚽',
    title: 'Street football',
    scene: 'A group invites you into a quick football match in the neighbourhood.',
    weight: 14,
    choices: [
      { id: 'play', label: 'Join the match', result: 'You scored a beauty and made new friends!', outcome: { needs: { fun: 18, social: 12, energy: -8, hygiene: -5 } } },
      { id: 'watch', label: 'Cheer from the side', result: 'You enjoyed the match and the banter.', outcome: { needs: { fun: 8, social: 5 } } },
    ],
  },
  {
    id: 'rain',
    icon: '🌧️',
    title: 'Kaduna rain',
    scene: 'A sudden downpour turns the road into a splashy mess. A nearby kiosk has room under its awning.',
    weight: 12,
    requires: { city: 'kaduna' },
    choices: [
      { id: 'shelter', label: 'Wait it out', result: 'You shared the shelter and swapped stories until the rain eased.', outcome: { needs: { social: 5, energy: 4 } } },
      { id: 'run', label: 'Run through it', result: 'You made it through, soaked but laughing.', outcome: { needs: { fun: 5, hygiene: -8, energy: -3 } } },
    ],
  },
  {
    id: 'police-checkpoint',
    icon: '👮',
    title: 'Police checkpoint',
    scene: 'Officers wave you over at a checkpoint. They check your details and ask about the cash in your pocket.',
    weight: 7,
    requires: { notoriety: 1 },
    choices: [
      { id: 'cooperate', label: 'Cooperate', result: 'The check takes a while, then you are free to go.', outcome: { needs: { energy: -4 } } },
      { id: 'fine', label: 'Pay an admin fine · ₦10k', result: 'You paid the stated fine and continued on your way.', outcome: { money: -10_000 } },
    ],
  },
  {
    id: 'visa-lottery',
    icon: '🛂',
    title: 'Visa lottery agent',
    scene: 'A man in a shiny suit outside the photocopy shop swears he has “direct link” to the embassy. ₦10k to submit your form.',
    weight: 7,
    choices: [
      {
        id: 'apply', label: 'Try your luck · ₦10k', result: 'He took the money, stamped your form with a biro cap and vanished into a keke. Lesson learnt.',
        outcome: { money: -10_000, needs: { fun: -6 } },
        rare: { chance: 0.01, result: '🛂 Wonders! The embassy actually called. You got a visa! Japa is now an option. Your WhatsApp status has never been this hot.', outcome: { money: -10_000, flag: 'visa', needs: { fun: 40, social: 30 } } },
      },
      { id: 'laugh', label: 'Laugh and walk on', result: 'You told him to try Abuja people. He did not find it funny.', outcome: { needs: { fun: 4 } } },
    ],
  },
  {
    id: 'lotto-winner',
    icon: '🎰',
    title: '“You have won!”',
    scene: 'An SMS says you won ₦2,500,000 in the Kaduna Mega Lotto. A “claims officer” is waiting by the bank with a form and a POS machine.',
    weight: 8,
    requires: { city: 'kaduna' },
    choices: [
      {
        id: 'claim', label: 'Pay the ₦15k “processing fee”', result: 'The claims officer, the form, and your ₦15k disappeared together. The lotto never existed. 🤡',
        outcome: { money: -15_000, flag: 'scammed', needs: { fun: -12 } },
        rare: { chance: 0.02, result: '🎰 Ehn?! It was real! A small lotto kiosk actually paid out. ₦50,000 in your hand. Nobody will believe you.', outcome: { money: 50_000, flag: 'jackpot', needs: { fun: 30 } } },
      },
      { id: 'block', label: 'Block the number', result: 'Blocked and reported. The scammers will try your neighbour next.', outcome: { needs: { fun: 3 } } },
    ],
  },
  {
    id: 'nollywood-extra',
    icon: '🎬',
    title: 'Kannywood shoot',
    scene: 'A film crew is shooting on the street and the director points at you: “You! You get face. Just walk past and look shocked.”',
    weight: 8,
    choices: [
      {
        id: 'act', label: 'Give them your best shocked face', result: 'They paid you ₦3,000 and said you over-acted. Classic Kannywood.',
        outcome: { money: 3_000, needs: { fun: 18, social: 10 } },
        rare: { chance: 0.04, result: '🎬 The director loved you! You got a real speaking role: “Haba!”. ₦25,000 and your first fan.', outcome: { money: 25_000, flag: 'nollywood', needs: { fun: 35, social: 25 } } },
      },
      { id: 'shy', label: 'Hide your face', result: 'You ducked behind a keke. Your one shot at fame, gone.', outcome: {} },
    ],
  },
  {
    id: 'viral-video',
    icon: '📱',
    title: 'Caught on camera',
    scene: 'A woman is filming a TikTok and you are accidentally in it, mid-sneeze. She asks if she can post it.',
    weight: 7,
    choices: [
      {
        id: 'yes', label: 'Post am!', result: 'It got 300 views. Mostly her aunties.',
        outcome: { needs: { fun: 8, social: 6 } },
        rare: { chance: 0.05, result: '🔥 The sneeze went VIRAL. 2 million views. People are calling you “Sneeze Papa” at the market.', outcome: { flag: 'viral', needs: { fun: 30, social: 40 } } },
      },
      { id: 'no', label: 'Delete it, abeg', result: 'She deleted it. Your dignity is intact.', outcome: {} },
    ],
  },
  {
    id: 'mallam-blessing',
    icon: '📿',
    title: 'Old Mallam',
    scene: 'An old Mallam resting under a neem tree asks you to help him carry his kettle and mat to the mosque.',
    weight: 10,
    choices: [
      {
        id: 'help', label: 'Help him', result: 'He prayed for you so well you felt it in your bones.',
        outcome: { goodDeeds: 2, needs: { social: 8, energy: -3 } },
        rare: { chance: 0.05, result: '📿 His son runs a big business in Kano. Next morning ₦20,000 “for your kindness” arrived. Blessings!', outcome: { goodDeeds: 2, money: 20_000, flag: 'blessed' } },
      },
      { id: 'busy', label: 'Say you are in a hurry', result: 'He waved you on with a smile. You still feel a little bad.', outcome: { needs: { fun: -3 } } },
    ],
  },
  {
    id: 'pure-water',
    icon: '💧',
    title: 'Pure water hawker',
    scene: 'A small boy selling sachet water drops his whole bag on the road. The sachets are bouncing everywhere.',
    weight: 11,
    choices: [
      { id: 'help', label: 'Help him pick them up', result: 'You chased sachets across two lanes. He gave you one free. Cold one, too.', outcome: { goodDeeds: 1, needs: { hunger: 4, social: 6, energy: -2 } } },
      { id: 'buy', label: 'Buy the whole bag · ₦1k', result: 'You bought the lot and shared it at the bus stop. Instant hero.', outcome: { money: -1_000, goodDeeds: 2, needs: { social: 12 } } },
      { id: 'step', label: 'Step over them', result: 'You stepped on one. It burst on your trousers.', outcome: { needs: { hygiene: -6 } } },
    ],
  },
  {
    id: 'yahoo-cousin',
    icon: '💻',
    title: 'Cousin with a laptop',
    scene: 'Your cousin Bashir, who has “no job”, just bought a Benz. He offers to teach you “online business”.',
    weight: 6,
    choices: [
      { id: 'learn', label: 'Learn the “business”', result: 'He showed you how to write love letters to Americans. You now know some dark arts. (Phone → Yahoo)', outcome: { notoriety: 2, needs: { fun: 6 } } },
      { id: 'refuse', label: 'No thanks', result: 'You told him EFCC dey. He laughed and revved the Benz.', outcome: { goodDeeds: 1 } },
    ],
  },
  {
    id: 'agbero-ticket',
    icon: '🎫',
    title: 'Agbero ticket',
    scene: 'An agbero with a fistful of tickets jumps in front of you: “Oga, your ticket! Ticket for the park!” You are on foot.',
    weight: 10,
    requires: { onFoot: true },
    choices: [
      { id: 'pay', label: 'Pay ₦500 to avoid wahala', result: 'He gave you a ticket for a vehicle you do not have.', outcome: { money: -500 } },
      { id: 'argue', label: '“I be pedestrian!”', result: 'After 10 minutes of shouting, he gave up. Your throat is sore.', outcome: { needs: { energy: -6, fun: 4 } } },
      {
        id: 'befriend', label: 'Greet him like an old friend', result: 'He laughed and let you pass. “You get mouth!”',
        outcome: { needs: { social: 8 }, notoriety: 1 },
        rare: { chance: 0.1, result: 'He liked you so much he introduced you to the park chairman. You now have connections in the motor park.', outcome: { notoriety: 3, needs: { social: 20 } } },
      },
    ],
  },
  {
    id: 'generator-fumes',
    icon: '🔌',
    title: 'Generator symphony',
    scene: 'Every shop on the street has its “I better pass my neighbour” generator roaring. You cannot hear yourself think.',
    weight: 8,
    choices: [
      { id: 'endure', label: 'Endure it', result: 'You walked through the noise with your ears ringing.', outcome: { needs: { fun: -5 } } },
      { id: 'dance', label: 'Dance to the rhythm', result: 'You found a beat in the noise. A small crowd cheered.', outcome: { needs: { fun: 12, social: 6 } } },
    ],
  },
  {
    id: 'suya-debt',
    icon: '🍢',
    title: 'Mai suya remembers',
    scene: 'The mai suya calls you over: “You still owe me ₦2,000 from last Sallah!” You don’t remember this at all.',
    weight: 8,
    choices: [
      { id: 'pay', label: 'Pay to keep the peace', result: 'You paid. He added extra yaji as thanks.', outcome: { money: -2_000, needs: { hunger: 15, fun: 6 } } },
      { id: 'deny', label: 'Insist it wasn’t you', result: 'Turns out it was your twin-looking neighbour. He apologised with free suya.', outcome: { needs: { hunger: 20, fun: 10 } } },
    ],
  },
  {
    id: 'wedding-invite',
    icon: '💌',
    title: 'Aso-ebi drama',
    scene: 'A friend says you MUST buy the aso-ebi for her sister’s wedding this Saturday. ₦15,000. “Everybody is buying.”',
    weight: 7,
    choices: [
      { id: 'buy', label: 'Buy the aso-ebi', result: 'You look sharp. You are now on the guest list for the next owambe.', outcome: { money: -15_000, needs: { social: 18, fun: 10 } } },
      { id: 'skip', label: '“My account is on maintenance”', result: 'She has added you to the list of “unserious people”.', outcome: { needs: { social: -8 } } },
    ],
  },
  {
    id: 'pothole-car',
    icon: '🕳️',
    title: 'Car in a pothole',
    scene: 'A Corolla is stuck in a pothole so deep it has its own ecosystem. The driver is begging for a push.',
    weight: 10,
    choices: [
      { id: 'push', label: 'Push', result: 'Muddy but victorious. The driver drops you ₦1,000 “for pure water”.', outcome: { money: 1_000, goodDeeds: 1, needs: { hygiene: -15, energy: -6, social: 6 } } },
      { id: 'film', label: 'Film it for Twitter', result: 'You tagged the governor. Somebody replied “this is Nigeria?”', outcome: { needs: { fun: 8 } } },
    ],
  },
  {
    id: 'mama-call',
    icon: '👵🏾',
    title: 'Mama is calling',
    scene: 'Mama calls. Your cousin told her you have “big money now”. She needs ₦10,000 for “something small”.',
    weight: 9,
    choices: [
      { id: 'send', label: 'Send it', result: 'Mama prayed for you for seven minutes straight. You feel unstoppable.', outcome: { money: -10_000, goodDeeds: 2, needs: { social: 15, fun: 6 } } },
      { id: 'network', label: '“Mama, network is bad…”', result: 'She called back on your second line. She knows.', outcome: { needs: { social: -6, fun: -4 } } },
    ],
  },
  {
    id: 'phone-snatch',
    icon: '🏍️',
    title: 'One-chance okada',
    scene: 'An okada slows next to you. The passenger is eyeing your phone very seriously.',
    weight: 5,
    requires: { onFoot: true },
    choices: [
      { id: 'pocket', label: 'Pocket the phone fast', result: 'You slipped it away. The okada sped off disappointed.', outcome: { needs: { energy: -2 } } },
      { id: 'shout', label: 'Shout “THIEF!”', result: 'The whole street came out. The okada vanished in seconds. Everyone bought you a drink.', outcome: { needs: { social: 14, fun: 8 } } },
    ],
  },
  {
    id: 'fake-pastor',
    icon: '⛪',
    title: 'Miracle crusade',
    scene: 'A loudspeaker announces a miracle crusade: “Sow a seed of ₦5,000 and your enemies will scatter!”',
    weight: 7,
    choices: [
      { id: 'sow', label: 'Sow the seed', result: 'Your enemies did not scatter, but your ₦5,000 did.', outcome: { money: -5_000, needs: { social: 5 } } },
      { id: 'pass', label: 'Keep walking', result: 'You kept your seed for buying actual seeds. Wise.', outcome: { needs: { fun: 3 } } },
    ],
  },
  {
    id: 'traffic-warden',
    icon: '🚦',
    title: 'Traffic light is dead',
    scene: 'The traffic light is off again and the junction is chaos. Nobody is moving.',
    weight: 8,
    choices: [
      { id: 'direct', label: 'Direct traffic yourself', result: 'You became a hero for 20 minutes. A danfo driver saluted you.', outcome: { goodDeeds: 2, needs: { social: 12, energy: -8 } } },
      { id: 'wait', label: 'Wait like everyone else', result: 'Forty minutes later, it cleared by itself.', outcome: { needs: { fun: -6, energy: -3 } } },
    ],
  },
  {
    id: 'flood',
    icon: '🌊',
    title: 'Flash flood',
    scene: 'The gutter overflowed and the road is a river. A woman’s goods are floating away.',
    weight: 6,
    choices: [
      { id: 'rescue', label: 'Wade in and save her goods', result: 'You saved most of her tomatoes. She will never forget your face.', outcome: { goodDeeds: 3, needs: { hygiene: -25, energy: -10, social: 10 } } },
      { id: 'highground', label: 'Find higher ground', result: 'You stayed dry on a kiosk roof until it passed.', outcome: { needs: { energy: -3 } } },
    ],
  },
  {
    id: 'shayi-debate',
    icon: '☕',
    title: 'Mai shayi parliament',
    scene: 'At the tea spot, old men are arguing about who should be the next governor. They want your opinion.',
    weight: 9,
    choices: [
      { id: 'speak', label: 'Give a passionate speech', result: 'They clapped. One of them said you should run for office yourself.', outcome: { needs: { social: 20, fun: 10 } } },
      { id: 'sip', label: 'Sip your tea quietly', result: 'You learnt more about politics in 20 minutes than in school.', outcome: { knowledge: 0.2, needs: { social: 8 } } },
    ],
  },
  {
    id: 'lost-child',
    icon: '🧒🏾',
    title: 'Lost child',
    scene: 'A little girl is crying at the market entrance. She has lost her mother in the crowd.',
    weight: 7,
    choices: [
      { id: 'help', label: 'Help find her mother', result: 'After an hour, you found her mother. She hugged you and the whole market clapped.', outcome: { goodDeeds: 3, needs: { social: 15, energy: -5 } } },
      { id: 'security', label: 'Take her to the market office', result: 'They announced it on the loudspeaker. Mother found in 10 minutes.', outcome: { goodDeeds: 1 } },
    ],
  },
  {
    id: 'pos-agent',
    icon: '💳',
    title: 'POS agent error',
    scene: 'The POS agent accidentally gave you ₦10,000 extra when you withdrew. She hasn’t noticed.',
    weight: 6,
    choices: [
      { id: 'return', label: 'Give it back', result: 'She almost cried. “God will bless you.” You believe her.', outcome: { goodDeeds: 3, needs: { social: 10 } } },
      { id: 'keep', label: 'Walk away fast', result: 'You have ₦10,000 extra and a strange feeling she will remember your face.', outcome: { money: 10_000, notoriety: 2 } },
    ],
  },
  {
    id: 'mentor',
    icon: '🧑🏾‍🏫',
    title: 'Retired professor',
    scene: 'A retired ABU professor at the bus stop starts telling you about economics. He is surprisingly interesting.',
    weight: 7,
    choices: [
      {
        id: 'listen', label: 'Listen properly', result: 'You learnt more than one semester at Poly. Knowledge +0.3.',
        outcome: { knowledge: 0.3, needs: { social: 10 } },
        rare: { chance: 0.08, result: 'He gave you his card. “Come to my house on Sundays.” You have a mentor now. Knowledge +1!', outcome: { knowledge: 1, flag: 'mentor', needs: { social: 15 } } },
      },
      { id: 'earphones', label: 'Put in your earphones', result: 'He switched to lecturing the man next to you.', outcome: {} },
    ],
  },
  {
    id: 'night-guard',
    icon: '🔦',
    title: 'Mai gadi at night',
    scene: 'A night watchman with a bow and arrow stops you. “Who goes there?! Identify yourself!”',
    weight: 8,
    requires: { night: true, onFoot: true },
    choices: [
      { id: 'greet', label: 'Greet him in Hausa', result: '“Sannu da aiki!” He relaxed and shared his kola nut.', outcome: { needs: { social: 10 } } },
      { id: 'run', label: 'Run', result: 'He chased you three streets. Your energy is gone.', outcome: { needs: { energy: -12, fun: 5 } } },
    ],
  },
  {
    id: 'night-party',
    icon: '🎶',
    title: 'Street party',
    scene: 'Somebody closed the whole street with canopies and a DJ for their birthday. The bass is shaking the gutters.',
    weight: 9,
    requires: { night: true },
    choices: [
      { id: 'join', label: 'Join the party', result: 'You danced until your legs were shaking. Unforgettable night.', outcome: { needs: { fun: 30, social: 25, energy: -15, hygiene: -10 } } },
      { id: 'detour', label: 'Take another route', result: 'The detour added 30 minutes. You can still hear the bass.', outcome: { needs: { energy: -5 } } },
    ],
  },
  {
    id: 'hisbah-patrol',
    icon: '🚓',
    title: 'Late-night patrol',
    scene: 'A patrol van slows down. “Where are you going this late? Come and explain.”',
    weight: 6,
    requires: { night: true, notoriety: 2 },
    choices: [
      { id: 'explain', label: 'Explain calmly', result: 'After a long talk they let you go with a warning.', outcome: { needs: { energy: -6 } } },
      { id: 'tip', label: 'Offer ₦3k “for fuel”', result: 'Fuel money accepted. They drove away humming.', outcome: { money: -3_000, notoriety: 1 } },
    ],
  },
  {
    id: 'rich-uncle',
    icon: '🤵🏾',
    title: 'Big man’s convoy',
    scene: 'A senator’s convoy stops. His aide jumps out and starts sharing ₦1,000 notes to the crowd.',
    weight: 6,
    choices: [
      { id: 'grab', label: 'Join the scramble', result: 'You got ₦2,000 and an elbow in the ribs.', outcome: { money: 2_000, needs: { energy: -5, fun: 8 } } },
      { id: 'refuse', label: 'Refuse the money', result: 'A man nearby called you a fool. Another called you a hero.', outcome: { goodDeeds: 1 } },
    ],
  },
  {
    id: 'dog-chase',
    icon: '🐕',
    title: 'Angry dog',
    scene: 'A dog in a compound sees you and decides you are the enemy. The gate is open.',
    weight: 8,
    requires: { onFoot: true },
    choices: [
      { id: 'run', label: 'RUN', result: 'You discovered speed you never knew you had.', outcome: { needs: { energy: -10, fun: 10 } } },
      { id: 'stand', label: 'Stand still and pray', result: 'The dog sniffed you and walked away. Your heart is still racing.', outcome: { needs: { fun: -3 } } },
    ],
  },
  {
    id: 'sallah-visit',
    icon: '🍖',
    title: 'Neighbour’s food',
    scene: 'Your neighbour’s wife sends a plate of jollof rice and chicken. “For your house.”',
    weight: 8,
    choices: [
      { id: 'eat', label: 'Eat it all now', result: 'It was the best jollof of your life. You need to return the plate with something in it.', outcome: { needs: { hunger: 35, fun: 10 } } },
      { id: 'share', label: 'Share with the street boys', result: 'The boys will defend you with their lives now.', outcome: { goodDeeds: 2, needs: { hunger: 10, social: 15 } } },
    ],
  },
  {
    id: 'mechanic',
    icon: '🔧',
    title: 'Roadside mechanic',
    scene: 'A mechanic waves you down: “Oga, your car is making noise! Let me check am. Small fee.”',
    weight: 9,
    requires: { car: true },
    choices: [
      { id: 'check', label: 'Let him check · ₦5k', result: 'He “fixed” something and you heard a new noise on the way home.', outcome: { money: -5_000, needs: { fun: -4 } } },
      {
        id: 'ignore', label: 'Ignore him', result: 'The car was fine. He was just hungry.',
        outcome: {},
        rare: { chance: 0.1, result: 'The car broke down 2km later. A different mechanic charged ₦8,000.', outcome: { money: -8_000, needs: { fun: -10 } } },
      },
    ],
  },
  {
    id: 'hitchhiker',
    icon: '🙋🏾',
    title: 'Corper on the road',
    scene: 'A youth corper in khaki is stranded by the roadside, waving for a lift to the NYSC office.',
    weight: 8,
    requires: { car: true },
    choices: [
      { id: 'lift', label: 'Give a lift', result: 'She told you her whole life story and gave you her LinkedIn.', outcome: { goodDeeds: 1, needs: { social: 15 } } },
      { id: 'drive', label: 'Drive past', result: 'You saw her in your mirror, sighing.', outcome: {} },
    ],
  },
  {
    id: 'road-goat',
    icon: '🐐',
    title: 'Goat on the road',
    scene: 'A goat is standing in the middle of the road like it owns the place. It refuses to move.',
    weight: 10,
    requires: { driving: true },
    choices: [
      { id: 'horn', label: 'Horn at it', result: 'It looked at you, unbothered, and slowly walked off.', outcome: { needs: { fun: 6 } } },
      { id: 'wait', label: 'Wait respectfully', result: 'The goat finished its business and left. You lost 5 minutes and gained patience.', outcome: { needs: { fun: 2 } } },
    ],
  },
  {
    id: 'road-preacher',
    icon: '📢',
    title: 'Passenger preacher',
    scene: 'A passenger starts preaching loudly. Another one starts arguing. Your vehicle is now a debate hall.',
    weight: 8,
    requires: { driving: true },
    choices: [
      { id: 'radio', label: 'Turn up the radio', result: 'Afrobeats won. Everyone started vibing.', outcome: { needs: { fun: 10, social: 6 } } },
      { id: 'join', label: 'Join the debate', result: 'You converted nobody but had a great time.', outcome: { needs: { social: 14, fun: 8 } } },
    ],
  },
  {
    id: 'fuel-queue',
    icon: '⛽',
    title: 'Fuel queue drama',
    scene: 'The fuel queue is two kilometres long. A man in front offers to sell you his position for ₦5,000.',
    weight: 14,
    requires: { event: 'fuel' },
    choices: [
      { id: 'buy', label: 'Buy his spot', result: 'You jumped ahead and filled your jerrycan. Everyone behind hates you.', outcome: { money: -5_000, needs: { fun: 6 } } },
      { id: 'wait', label: 'Wait like a citizen', result: 'Three hours later the station ran dry. You go home empty.', outcome: { needs: { energy: -15, fun: -12 } } },
      { id: 'sell', label: 'Sell your own spot · +₦4k', result: 'You sold your spot to a desperate man in a Prado.', outcome: { money: 4_000, notoriety: 1 } },
    ],
  },
  {
    id: 'protest-teargas',
    icon: '😷',
    title: 'Teargas!',
    scene: 'Near the protest, police fire teargas. Your eyes are burning and people are running everywhere.',
    weight: 14,
    requires: { event: 'protest' },
    choices: [
      { id: 'help', label: 'Help an old woman out of the smoke', result: 'You both made it out coughing. Hero of the day.', outcome: { goodDeeds: 3, needs: { energy: -12, hygiene: -10 } } },
      { id: 'run', label: 'Run for it', result: 'You ran into a kiosk. The owner gave you water and onions for your eyes.', outcome: { needs: { energy: -10, fun: -6 } } },
    ],
  },
  {
    id: 'durbar-horse',
    icon: '🐎',
    title: 'Runaway horse',
    scene: 'A Durbar horse has slipped its rider and is galloping down the street, decorations flying.',
    weight: 14,
    requires: { event: 'durbar' },
    choices: [
      { id: 'catch', label: 'Grab the reins', result: 'You caught it! The horseman gave you his blessing and ₦5,000.', outcome: { money: 5_000, goodDeeds: 2, needs: { fun: 20, energy: -8 } } },
      { id: 'dive', label: 'Dive into a gutter', result: 'Safe, but very, very dirty.', outcome: { needs: { hygiene: -25, fun: 4 } } },
    ],
  },
  {
    id: 'final-fans',
    icon: '⚽',
    title: 'Match-day fans',
    scene: 'Kaduna United fans in full red are marching to the viewing centre, drums and vuvuzelas. They want you to join.',
    weight: 14,
    requires: { event: 'final', city: 'kaduna' },
    choices: [
      { id: 'join', label: 'March with them', result: 'You sang every song. You are a United fan now, whether you like it or not.', outcome: { needs: { fun: 22, social: 25, energy: -8 } } },
      { id: 'pillars', label: 'Shout “Up Pillars!”', result: 'Bad idea. You escaped with your life and one shoe.', outcome: { needs: { energy: -12, fun: 10 }, notoriety: 1 } },
    ],
  },
  {
    id: 'owambe-gate',
    icon: '💃🏾',
    title: 'Owambe overflow',
    scene: 'The mega owambe has overflowed into the street. Somebody hands you a plate of jollof without asking questions.',
    weight: 14,
    requires: { event: 'owambe' },
    choices: [
      { id: 'eat', label: 'Eat and dance', result: 'Free food AND you got sprayed ₦1,000 by a drunk uncle.', outcome: { money: 1_000, needs: { hunger: 30, fun: 20, social: 15 } } },
      { id: 'pack', label: 'Pack takeaway', result: 'You filled two nylon bags. Mekunu energy. 🍗', outcome: { needs: { hunger: 15, fun: 8 }, notoriety: 1 } },
    ],
  },
  {
    id: 'blackout-candle',
    icon: '🕯️',
    title: 'Grid collapse',
    scene: 'The whole city is dark. The only light is from a candle seller who has tripled his prices.',
    weight: 14,
    requires: { event: 'blackout' },
    choices: [
      { id: 'buy', label: 'Buy candles · ₦2k', result: 'Expensive light, but light is light.', outcome: { money: -2_000, needs: { fun: 4 } } },
      { id: 'stars', label: 'Look at the stars', result: 'Without NEPA, the city has the most beautiful night sky.', outcome: { needs: { fun: 14, energy: 4 } } },
    ],
  },
  {
    id: 'area-boss',
    icon: '😎',
    title: 'The area boss',
    scene: 'The local area boss notices you. “I hear say you get liver. I fit use person like you.”',
    weight: 6,
    requires: { notoriety: 4 },
    choices: [
      { id: 'join', label: 'Join his crew', result: 'You are now “one of the boys”. Notoriety rising. Phone → Underworld.', outcome: { notoriety: 3, needs: { social: 15 } } },
      { id: 'decline', label: 'Politely decline', result: 'He respected it. Barely.', outcome: { needs: { fun: -4 } } },
    ],
  },
  {
    id: 'reformed',
    icon: '🕊️',
    title: 'Second chance',
    scene: 'A youth pastor and an imam are running a skills workshop for “boys wey wan change”. They saw your name on the wanted list.',
    weight: 5,
    requires: { notoriety: 5 },
    choices: [
      { id: 'attend', label: 'Attend the workshop', result: 'You learnt tailoring and a little about yourself. Notoriety down.', outcome: { notoriety: -3, goodDeeds: 2, knowledge: 0.3 } },
      { id: 'skip', label: '“Na una dey need am”', result: 'You laughed it off. They will be there next week.', outcome: {} },
    ],
  },
  {
    id: 'rich-beggar',
    icon: '🤲🏾',
    title: 'Suspiciously rich beggar',
    scene: 'A beggar with a brand new iPhone asks you for ₦500. His phone just rang.',
    weight: 6,
    choices: [
      { id: 'give', label: 'Give anyway', result: 'He said “thank you” and went back to his call. In English. With an accent.', outcome: { money: -500, goodDeeds: 1 } },
      { id: 'ask', label: '“Abeg, borrow me your phone?”', result: 'He laughed so hard he gave YOU ₦200.', outcome: { money: 200, needs: { fun: 15 } } },
    ],
  },
  {
    id: 'power-bank',
    icon: '🔋',
    title: 'Phone at 2%',
    scene: 'Your phone is dying and a kiosk sells “phone charging” for ₦200. There is a long line of phones charging.',
    weight: 8,
    choices: [
      { id: 'charge', label: 'Charge and gist while waiting', result: 'You made three new friends and one enemy (he took your charger).', outcome: { money: -200, needs: { social: 15 } } },
      { id: 'die', label: 'Let it die', result: 'You enjoyed an hour of peace. Nobody could reach you.', outcome: { needs: { fun: 6, energy: 4 } } },
    ],
  },
  {
    id: 'akara-lady',
    icon: '🫓',
    title: 'Akara at dawn',
    scene: 'The akara lady is frying fresh balls and the smell is pulling you like magic.',
    weight: 10,
    requires: { day: true },
    choices: [
      { id: 'buy', label: 'Buy akara and pap · ₦600', result: 'Hot akara, cold morning. Perfection.', outcome: { money: -600, needs: { hunger: 30, fun: 8 } } },
      { id: 'resist', label: 'Resist', result: 'You resisted. Your stomach will not forgive you.', outcome: { needs: { fun: -4 } } },
    ],
  },
  {
    id: 'wrong-transfer',
    icon: '📲',
    title: '“Wrong transfer”',
    scene: 'An SMS: “Credit alert ₦25,000”. Then a call: “Bros, I sent it by mistake, please send it back!” Your bank app shows nothing.',
    weight: 7,
    choices: [
      { id: 'send', label: 'Send “back” ₦25k', result: 'There was never any credit. The SMS was fake. You just sent ₦25,000 to a scammer.', outcome: { money: -25_000, flag: 'scammed', needs: { fun: -15 } } },
      { id: 'check', label: 'Check your real balance', result: 'No credit. You told him to go and do proper work.', outcome: { needs: { fun: 8 } } },
    ],
  },
  {
    id: 'herbal',
    icon: '🌿',
    title: 'Agbo seller',
    scene: 'A herbal seller promises his agbo cures malaria, heartbreak and bad luck. ₦1,500 a bottle.',
    weight: 7,
    choices: [
      {
        id: 'drink', label: 'Drink it', result: 'It tasted like punishment. You feel… strangely energetic.',
        outcome: { money: -1_500, needs: { energy: 15, bladder: -25 } },
        rare: { chance: 0.05, result: 'It worked TOO well. You could not stop running to the toilet for an hour.', outcome: { money: -1_500, needs: { bladder: -60, fun: -10 } } },
      },
      { id: 'pass', label: 'No thanks', result: 'He said your bad luck will follow you. Rude.', outcome: {} },
    ],
  },
  {
    id: 'job-offer',
    icon: '📄',
    title: 'Too-good job offer',
    scene: 'A flyer: “Earn ₦500,000 monthly from home! No experience! Pay ₦20,000 registration.”',
    weight: 6,
    choices: [
      { id: 'pay', label: 'Register · ₦20k', result: 'You joined a pyramid scheme. Your “upline” has blocked you.', outcome: { money: -20_000, flag: 'scammed', needs: { fun: -12 } } },
      { id: 'tear', label: 'Tear the flyer', result: 'A small act of public service.', outcome: { goodDeeds: 1 } },
    ],
  },
  {
    id: 'kidnap-rumour',
    icon: '🗣️',
    title: 'Rumour on the street',
    scene: 'Everyone is whispering that “they” are kidnapping people with handkerchiefs. A man offers you a protective charm for ₦3,000.',
    weight: 5,
    choices: [
      { id: 'buy', label: 'Buy the charm', result: 'You feel safer. The charm is a bottle cap on a string.', outcome: { money: -3_000, needs: { fun: 4 } } },
      { id: 'facts', label: 'Ask for facts', result: 'Nobody had facts. Just vibes. You went home calm.', outcome: { knowledge: 0.1 } },
    ],
  },
  {
    id: 'birthday-surprise',
    icon: '🎂',
    title: 'Surprise!',
    scene: 'Your friends ambush you with a cake and a bucket of water. Apparently it is your “birthday” (it is not).',
    weight: 5,
    choices: [
      { id: 'accept', label: 'Accept the drenching', result: 'Soaked, laughed, ate cake. Best fake birthday ever.', outcome: { needs: { fun: 25, social: 25, hygiene: -15 } } },
      { id: 'flee', label: 'Run away', result: 'They caught you anyway. Wet AND tired.', outcome: { needs: { energy: -10, hygiene: -15, social: 10 } } },
    ],
  },

  /* ----- Keke ----- */
  {
    id: 'keke-big-note', icon: '💵', title: 'No change', weight: 14,
    scene: 'Your passenger hands you a ₦10,000 note for a ₦600 ride. “I no get change,” they say, already half out of the keke.',
    requires: { driving: true, vehicle: ['keke', 'okada'] },
    choices: [
      { id: 'change', label: 'Find change from your own pocket', result: 'You dug out ₦9,400. They thanked you and vanished into the market.', outcome: { money: -3_000, goodDeeds: 1 } },
      { id: 'wait', label: 'Make them go and break it', result: 'They fumed, queued at a POS, and tipped you ₦500 for the wait.', outcome: { money: 500, needs: { energy: -4 } }, rare: { chance: 0.25, result: 'They never came back. Your keke, your loss.', outcome: { money: -600, notoriety: 0 } } },
    ],
  },
  {
    id: 'keke-race', icon: '🏁', title: 'Keke race', weight: 10,
    scene: 'A rival keke driver pulls alongside, honks twice and nods at the road ahead. “Winner takes ₦5,000.”',
    requires: { driving: true, vehicle: ['keke', 'okada'], onFoot: false },
    choices: [
      { id: 'race', label: 'Race him · ₦5k on the line', result: 'You lost by a wheel. He laughed so hard he nearly crashed.', outcome: { money: -5_000, needs: { fun: 12 } }, rare: { chance: 0.5, result: 'You cut through the market lane and won! The park boys chanted your name.', outcome: { money: 5_000, needs: { fun: 25, social: 10 } } } },
      { id: 'pass', label: 'Let him go', result: 'You kept to your lane. The passengers behind you sighed in relief.', outcome: {} },
    ],
  },
  {
    id: 'keke-lastma', icon: '🚦', title: 'Traffic warden', weight: 12,
    scene: 'A warden in a yellow vest steps into the road and points at your plate number. “You are on a restricted lane.” There is no sign.',
    requires: { driving: true, vehicle: ['keke', 'okada'] },
    choices: [
      { id: 'pay', label: 'Pay ₦2k and move', result: 'He folded the notes into his sleeve like a magician.', outcome: { money: -2_000 } },
      { id: 'argue', label: 'Ask to see the sign', result: 'He couldn’t find it. You were fined ₦4,000 for “obstruction”.', outcome: { money: -4_000, needs: { energy: -4 } }, rare: { chance: 0.35, result: 'He realised you were right and waved you on, muttering.', outcome: { goodDeeds: 0, needs: { fun: 8 } } } },
    ],
  },
  {
    id: 'keke-goat', icon: '🐐', title: 'Goat on board', weight: 8,
    scene: 'A man flags you down with a live goat under his arm. “It will not disturb you. Promise.” The goat looks at you with contempt.',
    requires: { driving: true, vehicle: ['keke'] },
    choices: [
      { id: 'carry', label: 'Carry them both · ₦1,500', result: 'The goat sat like royalty. Your seat will never be the same.', outcome: { money: 1_500, needs: { hygiene: -12, fun: 12 } } },
      { id: 'refuse', label: 'Decline politely', result: 'The goat bleated something rude as you drove off.', outcome: {} },
    ],
  },
  /* ----- Okada ----- */
  {
    id: 'okada-three', icon: '🏍️', title: 'Three on one bike', weight: 10,
    scene: 'A man, his wife and their toddler want to ride on your okada. “Na just short distance.” A police van is two streets away.',
    requires: { driving: true, vehicle: ['okada'] },
    choices: [
      { id: 'carry', label: 'Carry all three · ₦2k', result: 'You made it with every hand gripping every other hand. Barely.', outcome: { money: 2_000, notoriety: 1 }, rare: { chance: 0.25, result: 'The van spotted you. ₦8,000 “fine” and a lecture.', outcome: { money: -8_000, notoriety: 1 } } },
      { id: 'refuse', label: 'Only two, sorry', result: 'They found another rider. You were not popular.', outcome: {} },
    ],
  },
  /* ----- Own car ----- */
  {
    id: 'car-hijack', icon: '🚗', title: 'Red light robbers', weight: 8,
    scene: 'You stop at a red light. Two men approach your windows and tap on the glass. One has a cap pulled very low.',
    requires: { driving: true, vehicle: ['car'], night: true },
    choices: [
      { id: 'run', label: 'Run the red light', result: 'They fell behind you in the mirror. Your heart did not.', outcome: { needs: { energy: -8, fun: -6 } }, rare: { chance: 0.4, result: 'A truck clipped your bumper as you ran the light. ₦30,000 and a very long night.', outcome: { money: -30_000, needs: { energy: -14 } } } },
      { id: 'pay', label: 'Hand over ₦25k', result: 'They vanished the second the notes left your hand.', outcome: { money: -25_000, needs: { fun: -10 } } },
    ],
  },
  {
    id: 'car-stranger', icon: '🆘', title: 'Stranded motorist', weight: 12,
    scene: 'A man waves you down beside a car with a flat tyre. “Boss, abeg, I no get jack.” The sun is setting.',
    requires: { driving: true, vehicle: ['car'] },
    choices: [
      { id: 'help', label: 'Stop and help', result: 'Twenty minutes later he thanked you and pressed ₦2,000 into your hand.', outcome: { money: 2_000, goodDeeds: 2, needs: { energy: -8, social: 8 } }, rare: { chance: 0.1, result: 'His “friends” appeared from the bushes. They left you with your tyres, but nothing else.', outcome: { money: -40_000, notoriety: 0, needs: { fun: -12 } } } },
      { id: 'drive', label: 'Wave and drive on', result: 'You promised yourself you’d call the road safety line. You didn’t.', outcome: {} },
    ],
  },
  {
    id: 'car-fuel-queue', icon: '⛽', title: 'Petrol queue', weight: 10,
    scene: 'The petrol station ahead has a queue to the roundabout. A boy in a reflective vest offers to “arrange” a spot for ₦3,000.',
    requires: { driving: true, vehicle: ['car'] },
    choices: [
      { id: 'wait', label: 'Join the queue', result: 'Two hours of radio phone-ins. You now have strong opinions on tomatoes.', outcome: { needs: { energy: -10, fun: -8 } } },
      { id: 'cut', label: 'Pay to cut the line', result: 'The boy waved the whole queue aside. People stared. You looked straight ahead.', outcome: { money: -3_000, notoriety: 1 } },
    ],
  },
  {
    id: 'car-wedding-convoy', icon: '💍', title: 'Wedding convoy', weight: 9,
    scene: 'A wedding convoy takes over the road, horns blaring, bride waving from a sunroof. They want everyone to join in.',
    requires: { driving: true, vehicle: ['car'], day: true },
    choices: [
      { id: 'join', label: 'Honk along', result: 'Someone threw you a pack of jollof rice through the window. A good day.', outcome: { needs: { fun: 20, social: 15, hunger: 25 } } },
      { id: 'squeeze', label: 'Squeeze past', result: 'You scraped a pastor’s mirror. ₦3,000 to say sorry.', outcome: { money: -3_000, needs: { energy: -4 } } },
    ],
  },
  {
    id: 'car-dashcam', icon: '📹', title: 'Viral dashcam', weight: 4,
    scene: 'A passing driver pulls up and shows you his phone: a video of YOU narrowly missing a goat is trending on Twitter.',
    requires: { driving: true, vehicle: ['car'] },
    choices: [
      { id: 'laugh', label: 'Laugh it off', result: 'You got fifty new followers who all call you “goat dodger”.', outcome: { needs: { fun: 14, social: 14 } }, rare: { chance: 0.1, result: 'A brand slid into your DMs. You were “goat dodger” for a month. Paid.', outcome: { money: 30_000, flag: 'viral' } } },
      { id: 'hide', label: 'Pretend it wasn’t you', result: 'You drove away with sunglasses on at night.', outcome: {} },
    ],
  },
  /* ----- Road conditions ----- */
  {
    id: 'road-flood', icon: '🌧️', title: 'Flooded road', weight: 20,
    scene: 'The road ahead is a brown river. A few cars have stalled mid-way. Boys with sticks offer to guide you for a fee.',
    requires: { driving: true, roadEvent: 'flood' },
    choices: [
      { id: 'guide', label: 'Pay the boys ₦3k', result: 'They walked you through the shallow bits like a sacred procession.', outcome: { money: -3_000 } },
      { id: 'brave', label: 'Drive straight through', result: 'The water stopped at the doors. Your engine did not stop.', outcome: { needs: { fun: 8 } }, rare: { chance: 0.4, result: 'The engine drowned mid-puddle. A tow cost ₦20,000.', outcome: { money: -20_000, needs: { energy: -10 } } } },
    ],
  },
  {
    id: 'road-convoy', icon: '🚨', title: 'Convoy, give way!', weight: 22,
    scene: 'Sirens behind you. A Hilux full of men with horsewhips roars down the lane. “Commot for road! Commot!”',
    requires: { driving: true, roadEvent: 'convoy' },
    choices: [
      { id: 'pull', label: 'Pull over fast', result: 'They roared past in a cloud of dust. Everyone around you exhaled.', outcome: { needs: { energy: -3 } } },
      { id: 'hold', label: 'Hold your lane', result: 'A whip cracked across your windscreen. They had a good laugh. You paid ₦15,000 for glass.', outcome: { money: -15_000, notoriety: 1, needs: { fun: -10 } } },
    ],
  },
  {
    id: 'road-strike', icon: '✊🏾', title: 'Union boys', weight: 24,
    scene: 'During the NURTW strike, men in union vests step into the road and stare at your wheels. “You dey work? Today?”',
    requires: { driving: true, roadEvent: 'strike' },
    choices: [
      { id: 'pay', label: 'Pay ₦5k “solidarity”', result: 'They stood aside and let you make your double fares.', outcome: { money: -5_000 } },
      { id: 'stand', label: 'Park and join the strike', result: 'You sat with the boys, ate roasted corn and lost a day’s money.', outcome: { needs: { fun: 14, social: 18 } } },
    ],
  },
  {
    id: 'road-gridlock-hawkers', icon: '🥤', title: 'Hawkers in the jam', weight: 22,
    scene: 'Stuck in gridlock, you are surrounded: pure water, gala, phone chargers and a man selling a single shoe.',
    requires: { driving: true, roadEvent: 'gridlock' },
    choices: [
      { id: 'snack', label: 'Buy gala and cold water · ₦700', result: 'You were calm for the first time in an hour.', outcome: { money: -700, needs: { hunger: 18, fun: 6 } } },
      { id: 'shoe', label: 'Buy the single shoe', result: 'You now own a left shoe. Nobody knows why.', outcome: { money: -1_500, needs: { fun: 14 } } },
    ],
  },
  {
    id: 'road-dust', icon: '🌫️', title: 'Harmattan haze', weight: 16,
    scene: 'The dust is so thick the checkpoint appears out of nowhere. The officer is wearing a scarf over his entire face.',
    requires: { driving: true, roadEvent: 'harmattan' },
    choices: [
      { id: 'slow', label: 'Crawl along', result: 'A slow, quiet drive. Hajiya Binta’s boiled eggs kept you company on the radio.', outcome: { needs: { fun: 4, energy: -5 } } },
      { id: 'honk', label: 'Honk and hope', result: 'You nearly clipped a cart. The cart man blessed your family tree.', outcome: { needs: { energy: -6 }, notoriety: 1 } },
    ],
  },
  /* ----- High ----- */
  {
    id: 'high-dragon', icon: '🐉', title: 'Dragon on the road', weight: 40,
    scene: 'A huge dragon is blocking the road ahead. Its eyes glow red. Its brake lights, specifically. It is a trailer.',
    requires: { driving: true, high: true },
    choices: [
      { id: 'swerve', label: 'Swerve into the dragon’s lane', result: 'You missed it by a hair. Your mirrors did not survive.', outcome: { money: -8_000, needs: { energy: -10, fun: 10 } } },
      { id: 'brake', label: 'Brake hard and pray', result: 'Your passenger seat belt saved you. You laughed for five minutes.', outcome: { needs: { fun: 16, energy: -6 } } },
    ],
  },
  {
    id: 'high-munchies', icon: '🍛', title: 'The munchies', weight: 40,
    scene: 'You are hit by a hunger so deep it feels spiritual. A mama put is selling jollof, fried plantain and two pieces of chicken.',
    requires: { high: true },
    choices: [
      { id: 'feast', label: 'Order everything · ₦4k', result: 'You ate like a king and apologised to the plate afterwards.', outcome: { money: -4_000, needs: { hunger: 55, fun: 20 } } },
      { id: 'resist', label: 'Walk past', result: 'You resisted for four steps and then bought plantain anyway.', outcome: { money: -800, needs: { hunger: 15 } } },
    ],
  },
  {
    id: 'high-paranoia', icon: '👀', title: 'Everybody is police', weight: 30,
    scene: 'Every man in a blue shirt is an undercover officer. The woman selling oranges is clearly an informant. You can hear a drone.',
    requires: { high: true, onFoot: true },
    choices: [
      { id: 'hide', label: 'Hide behind a kiosk', result: 'You hid for twenty minutes. The kiosk owner charged you ₦500 for shelter.', outcome: { money: -500, needs: { energy: -6, fun: -4 } } },
      { id: 'chill', label: 'Breathe and keep walking', result: 'Nobody was police. The orange seller waved at you kindly.', outcome: { needs: { fun: 6 } } },
    ],
  },
  ...ABUJA_STORIES,
  ...LAGOS_STORIES,
  ...KANO_STORIES,
];

export interface StoryContext {
  notoriety: number;
  goodDeeds: number;
  /** Game hour, 0–24. */
  hour: number;
  hasCar: boolean;
  money: number;
  event: LiveEventId | null;
  /** The city you are in. */
  city: string;
  /** Holding public office (president, governor, minister, IGP, EFCC chair). */
  inOffice: boolean;
  driving: boolean;
  vehicle: Vehicle | null;
  roadEvent: RoadEventId | null;
  high: boolean;
  /** Ids seen recently: skipped while there is anything else to tell. */
  recent: string[];
}

export function storyFits(story: StreetStory, c: StoryContext) {
  const r = story.requires;
  if (!r) return true;
  const night = c.hour < 6 || c.hour >= 20;
  if (r.notoriety !== undefined && c.notoriety < r.notoriety) return false;
  if (r.goodDeeds !== undefined && c.goodDeeds < r.goodDeeds) return false;
  if (r.night && !night) return false;
  if (r.day && night) return false;
  if (r.car && !c.hasCar) return false;
  if (r.minMoney !== undefined && c.money < r.minMoney) return false;
  if (r.event && c.event !== r.event) return false;
  if (r.city && c.city !== r.city) return false;
  if (r.noOffice && c.inOffice) return false;
  if (r.driving && !c.driving) return false;
  if (r.onFoot && c.driving) return false;
  if (r.vehicle && (!c.vehicle || !r.vehicle.includes(c.vehicle))) return false;
  if (r.roadEvent && c.roadEvent !== r.roadEvent) return false;
  if (r.high && !c.high) return false;
  return true;
}

export function pickStreetStory(roll: number, c: StoryContext): StreetStory {
  const fits = STREET_STORIES.filter((s) => storyFits(s, c));
  const fresh = fits.filter((s) => !c.recent.includes(s.id));
  const pool = fresh.length ? fresh : fits.length ? fits : STREET_STORIES;
  const total = pool.reduce((sum, story) => sum + story.weight, 0);
  let cursor = Math.max(0, Math.min(0.999_999, roll)) * total;
  for (const story of pool) {
    cursor -= story.weight;
    if (cursor < 0) return story;
  }
  return pool[pool.length - 1];
}

/** What actually happens when you pick a choice: usually its outcome, sometimes the rare twist. */
export function rollChoice(choice: StoryChoice, roll: number): { result: string; outcome: StoryOutcome; rare: boolean } {
  if (choice.rare && roll < choice.rare.chance) return { result: choice.rare.result, outcome: choice.rare.outcome, rare: true };
  return { result: choice.result, outcome: choice.outcome, rare: false };
}

/** How many stories remember not to repeat. */
export const RECENT_STORIES = 20;
