// The governor's desk: now and then a crazy matter lands on the desk of whoever runs a state (worker/desk.ts), with a
// few ways to handle it and a clock. Each choice moves the state's money, its property, how its people feel (and so how
// they vote, src/game/npcs.ts), or starts a craze; some carry a twist nobody is told about, revealed a little later.
// Ignoring the desk is a choice too, and usually the worst one.

import type { CivicCity } from './civic';
import { NPC_CRAZES, type NpcCrazeId } from './npcs';
import { ASSET_INFO, CITY_SCALE, type StateAsset } from './treasury';

export const DESK = {
  /** At least this long between one matter and the next in a state. */
  gapMs: 3 * 3_600_000,
  /** Chance a cron tick (every 5 minutes) that a state past its gap gets a new one: about an hour, on average. */
  chance: 0.08,
  /** How long the governor has to decide before it is decided for them. */
  windowMs: 90 * 60_000,
  /** A twist comes out between these many minutes after the choice. */
  twistMin: [10, 40] as const,
  /** A matter is not repeated in a state until this many others have come and gone. */
  noRepeat: 8,
};

/** What a choice does. Money and pocket are for Kaduna; bigger states scale them (CITY_SCALE). */
export interface DeskEffect {
  /** Into the state's treasury (negative: out of it). */
  money?: number;
  /** Added to the mood of every citizen in the state. */
  mood?: number;
  /** Added to the condition of the state's property. */
  assets?: Partial<Record<StateAsset, number>>;
  /** A craze the state catches. */
  craze?: NpcCrazeId;
  /** Into the governor's own pocket, from outside the treasury. */
  pocket?: number;
  /** Chance the EFCC catches it: a strike against the governor (and the pocket money goes nowhere). */
  efcc?: number;
}

export interface DeskTwist {
  chance: number;
  effect: DeskEffect;
  news: string;
}

export interface DeskOption {
  id: string;
  icon: string;
  label: string;
  effect: DeskEffect;
  /** The headline when it is chosen. {gov} is the governor, {city} the state. */
  news: string;
  /** What VDM says about it, if he does. */
  vdm?: string;
  twist?: DeskTwist;
}

export interface Dilemma {
  id: string;
  icon: string;
  title: string;
  body: string;
  options: DeskOption[];
  /** What happens when nobody decides in time. */
  ignored: { effect: DeskEffect; news: string };
}

const M = 1_000_000;

export const DILEMMAS: Dilemma[] = [
  {
    id: 'monkeys', icon: '🐒', title: 'Monkeys in Government House',
    body: 'A troop of monkeys escaped from the zoo and moved into Government House. One of them is sitting in your chair.',
    options: [
      { id: 'babalawo', icon: '🧙🏾', label: 'Pay a babalawo to talk to them', effect: { money: -2 * M },
        news: '{gov} has hired a babalawo to negotiate with the monkeys in Government House, {city}. 🐒🧙🏾',
        twist: { chance: 0.5, effect: { assets: { govhouse: -20 }, mood: -2 }, news: 'UPDATE: The babalawo’s talks with the monkeys failed. They brought their cousins. Government House in {city} is in a state. 🐒🐒🐒' } },
      { id: 'army', icon: '🪖', label: 'Send in the army', effect: { money: -6 * M, assets: { govhouse: -10 }, mood: -3 },
        news: 'Soldiers stormed Government House in {city} to chase out the monkeys. The monkeys escaped. The generator did not. 🪖🐒' },
      { id: 'mascot', icon: '🎉', label: 'Make them the state mascot', effect: { mood: 5, assets: { culture: 10 } },
        news: '{gov} has declared the Government House monkeys the official mascot of {city}. The T-shirts are selling fast. 🐒👕',
        twist: { chance: 0.35, effect: { money: -3 * M, mood: -3 }, news: 'UPDATE: The state mascot stole {gov}’s phone and posted from the official account. The cleanup is costing millions. 🐒📱' } },
    ],
    ignored: { effect: { assets: { govhouse: -15 }, mood: -2 }, news: 'Nobody in {city} government did anything about the monkeys. They now chair the Tuesday cabinet meeting. 🐒' },
  },
  {
    id: 'rapture', icon: '⛪', title: 'The Second Coming is booked',
    body: 'A famous pastor says Jesus returns to {city} this Friday, and he wants the stadium free of charge to receive Him.',
    options: [
      { id: 'free', icon: '🙏🏾', label: 'Give him the stadium free', effect: { craze: 'crusade', assets: { stadium: -15 }, mood: 3 },
        news: '{gov} has handed the {city} stadium to the “Second Coming Crusade” for free. Thieves are already returning stolen phones. ⛪' },
      { id: 'rent', icon: '🧾', label: 'Charge him full rent', effect: { money: 12 * M },
        news: '{gov} charged the Second Coming Crusade full rent for the {city} stadium. The pastor paid, then preached about it. 🧾',
        twist: { chance: 0.4, effect: { mood: -8 }, news: 'UPDATE: The pastor has placed a curse on {gov} live on TV. Half of {city} is now fasting against the government. 😳' } },
      { id: 'ban', icon: '🚫', label: 'Ban the crusade', effect: { mood: -6 },
        news: '{gov} has banned the Second Coming Crusade in {city}, citing “crowd control”. The churches are not happy. 🚫',
        twist: { chance: 0.3, effect: { craze: 'crimeWave' }, news: 'UPDATE: With the crusade cancelled, the thieves of {city} have nobody to repent to. Crime is up. 🚨' } },
    ],
    ignored: { effect: { craze: 'crusade', assets: { stadium: -25 } }, news: 'Nobody answered the pastor, so his church took the {city} stadium anyway. 300,000 people came. The pitch did not survive. ⛪' },
  },
  {
    id: 'okada', icon: '🏍️', title: 'Okada riders blocked the expressway',
    body: 'Thousands of okada riders have blocked the main road to protest police “levies”. Nothing is moving in {city}.',
    options: [
      { id: 'ride', icon: '🏍️', label: 'Ride an okada to the protest yourself', effect: { mood: 7 },
        news: '{gov} arrived at the okada protest on the back of an okada, no helmet, and promised an end to illegal levies. The crowd went wild. 🏍️',
        twist: { chance: 0.35, effect: { mood: -4, assets: { roads: -5 } }, news: 'UPDATE: {gov}’s okada hit a pothole on live TV. The governor is fine. The video is not. 🕳️😂' },
        vdm: 'VDM: So {gov} entered okada with no helmet to “connect with the masses”. Na the masses go carry you go hospital when you fall o. Fix the roads first! 🎤🏍️' },
      { id: 'pay', icon: '💵', label: 'Pay the union leaders to call it off', effect: { money: -8 * M, mood: 2 },
        news: 'The okada protest in {city} ended suddenly after a “meeting” with union leaders at Government House. 💵',
        twist: { chance: 0.5, effect: { money: -8 * M }, news: 'UPDATE: The okada union is back on the same road. New leaders, same protest, another “meeting”. 💵💵' } },
      { id: 'police', icon: '🚔', label: 'Send the police', effect: { mood: -8, assets: { police: -10 } },
        news: 'Police fired tear gas at okada riders in {city}. The road is open. The riders are furious. 🚔' },
    ],
    ignored: { effect: { mood: -6, assets: { roads: -10 } }, news: 'The okada blockade in {city} went on all day and nobody from government came. The traffic reached the next state. 🚗🚗🚗' },
  },
  {
    id: 'bingo', icon: '🐕', title: 'A hospital named after a dog',
    body: 'A billionaire will build {city} a brand new hospital, on one condition: it is named after his dog, Bingo.',
    options: [
      { id: 'accept', icon: '🐕', label: 'Accept: Bingo Memorial Hospital', effect: { assets: { hospital: 35 }, mood: -2 },
        news: '{city} is getting the Bingo Memorial Hospital, named after a billionaire’s dog. Free, beautiful, and a little embarrassing. 🐕🏥',
        twist: { chance: 0.3, effect: { mood: 6 }, news: 'UPDATE: Bingo came to see his hospital and {city} fell in love. People are naming their babies Bingo now. 🐕❤️' } },
      { id: 'mother', icon: '👵🏾', label: 'Build it with state money, name it after your mother', effect: { money: -25 * M, assets: { hospital: 35 }, mood: 2 },
        news: '{gov} has built the Mama Memorial Hospital from state funds. Mama cut the ribbon herself. 👵🏾🏥' },
      { id: 'refuse', icon: '🙅🏾', label: 'Refuse: we have dignity', effect: { mood: 1 },
        news: '{gov} turned down a free hospital over the dog’s name. Dignity: intact. Hospital: not built. 🙅🏾' },
    ],
    ignored: { effect: { mood: -3, assets: { hospital: -5 } }, news: 'The billionaire took his hospital to another state when {city} never replied. Bingo is famous somewhere else now. 🐕' },
  },
  {
    id: 'rainmaker', icon: '🌧️', title: 'The rainmaker’s offer',
    body: 'A rainmaker offers to hold back the rain for the whole of owambe season. For a fee, of course.',
    options: [
      { id: 'pay', icon: '🪄', label: 'Pay him', effect: { money: -5 * M, craze: 'owambeSeason', mood: 3 },
        news: '{gov} has paid a rainmaker to keep {city} dry for owambe season. The aso-ebi sellers are celebrating. 🪄💃🏾',
        twist: { chance: 0.5, effect: { assets: { roads: -15 }, mood: -6 }, news: 'UPDATE: It rained. Hard. The rainmaker has switched off his phone and half of {city} is flooded in aso-ebi. 🌧️😩' } },
      { id: 'arrest', icon: '🚔', label: 'Arrest him for fraud', effect: { mood: -1 },
        news: 'The rainmaker who offered {gov} his services is in a cell in {city}. He says it will rain until he is released. 🌧️',
        twist: { chance: 0.5, effect: { assets: { roads: -10, markets: -5 } }, news: 'UPDATE: It has rained for two days straight in {city} since the rainmaker was arrested. Nobody is saying anything. 🌧️👀' } },
      { id: 'hire', icon: '📋', label: 'Make him Commissioner for Weather', effect: { money: -2 * M, mood: 2, assets: { culture: 5 } },
        news: '{city} now has a Commissioner for Weather. He wears a red cap to cabinet meetings. 🌦️' },
    ],
    ignored: { effect: { assets: { roads: -10 }, mood: -2 }, news: 'The rainmaker was ignored by {city} government. It rained on every wedding this weekend. Coincidence? 🌧️' },
  },
  {
    id: 'oil', icon: '🛢️', title: 'Oil in a farmer’s backyard',
    body: 'A farmer in {city} struck oil while digging a well. Everybody wants a piece of it.',
    options: [
      { id: 'take', icon: '🏛️', label: 'Take it for the state', effect: { money: 30 * M, mood: -7 },
        news: '{gov} has taken over the oil well from the farmer who found it. The farmer is on every radio station in {city}. 🛢️',
        twist: { chance: 0.3, effect: { money: -40 * M }, news: 'UPDATE: Engineers have confirmed the “oil” in {city} was a leaking generator tank. The state paid for the drilling anyway. 🤦🏾' } },
      { id: 'farmer', icon: '👨🏾‍🌾', label: 'Let the farmer keep it', effect: { mood: 5, craze: 'landRush' },
        news: '{gov} says the oil belongs to the farmer who found it. Everybody in {city} is now digging up their backyard. ⛏️' },
      { id: 'partner', icon: '🤝🏾', label: 'Sell the rights to a “foreign partner”', effect: { pocket: 15 * M, efcc: 0.35, mood: -2 },
        news: 'The oil rights in {city} have been sold to a company nobody has heard of, registered last Tuesday. 🤝🏾' },
    ],
    ignored: { effect: { mood: -3, craze: 'crimeWave' }, news: 'Nobody in government answered about the oil in {city}. Militants took over the well overnight. 🛢️' },
  },
  {
    id: 'bbn', icon: '📺', title: 'Big Brother wants Government House',
    body: 'Big Brother Naija wants to film its next season inside Government House, {city}. They are paying well.',
    options: [
      { id: 'allow', icon: '✅', label: 'Allow it', effect: { money: 15 * M, mood: 4, assets: { govhouse: -10 } },
        news: 'Big Brother Naija: Government House Edition is coming from {city}! {gov} has handed over the keys to the diary room. 📺',
        twist: { chance: 0.4, effect: { assets: { govhouse: -25 } }, news: 'UPDATE: Two housemates fought in the Government House banquet hall in {city}. Every chandelier is gone. 📺💥' } },
      { id: 'refuse', icon: '🙅🏾', label: 'Refuse', effect: { mood: -4 },
        news: '{gov} refused to let Big Brother Naija film in Government House. Young people in {city} are trending the governor’s name, and not kindly. 📱' },
      { id: 'join', icon: '🕶️', label: 'Agree, if you can be a housemate', effect: { money: 8 * M, mood: -2 },
        news: '{gov} is joining Big Brother Naija as a housemate. {city} will be governed from the diary room. 🕶️',
        twist: { chance: 0.5, effect: { mood: 9 }, news: 'UPDATE: {gov} is the most popular housemate in Big Brother history. {city} is voting like never before. 🗳️🕶️' },
        vdm: 'VDM: {gov} don enter Big Brother house. Who dey run {city}? The diary room? Una no dey shame?! 🎤📺' },
    ],
    ignored: { effect: { mood: -2 }, news: 'Big Brother Naija took its show to another state after {city} government never answered. 📺' },
  },
  {
    id: 'flyover', icon: '🌉', title: 'The flyover to nowhere',
    body: 'The contractor says the new flyover is finished. It stops in mid-air, about 30 metres short of the other side.',
    options: [
      { id: 'pay', icon: '💸', label: 'Pay him the balance anyway', effect: { money: -10 * M, mood: -3 },
        news: '{gov} has paid the contractor in full for the flyover that ends in the air. Drivers in {city} are advised not to use it. 🌉' },
      { id: 'commission', icon: '✂️', label: 'Commission it with a big ceremony', effect: { money: -3 * M, mood: -6 },
        news: '{gov} cut the ribbon on {city}’s new flyover today. It goes nowhere. There was jollof. 🌉✂️',
        vdm: 'VDM: {gov} commission flyover wey no reach the other side. Una wan make we fly? This na the definition of “stomach infrastructure”! 🎤🌉' },
      { id: 'redo', icon: '🏗️', label: 'Sack him and finish it properly', effect: { money: -25 * M, assets: { roads: 25 }, mood: 4 },
        news: '{gov} sacked the flyover contractor and finished the job. {city} has a flyover that actually lands. 🏗️' },
    ],
    ignored: { effect: { assets: { roads: -10 }, mood: -3 }, news: 'The half-flyover in {city} is now a tourist attraction. Somebody fell off it. Government says no comment. 🌉' },
  },
  {
    id: 'arrears', icon: '💼', title: 'Eight months without pay',
    body: 'Civil servants say they have not been paid since the last administration. Schools and hospitals are threatening to shut.',
    options: [
      { id: 'pay', icon: '💰', label: 'Pay every naira they are owed', effect: { money: -30 * M, mood: 10 },
        news: '{gov} has paid every civil servant in {city} their back pay. Teachers were seen dancing in the staff room. 💰' },
      { id: 'promise', icon: '🗓️', label: 'Promise “next month”', effect: { mood: -4 },
        news: '{gov} has promised the civil servants of {city} their salaries “next month”. Again. 🗓️',
        twist: { chance: 0.5, effect: { assets: { schools: -20, hospital: -20 }, mood: -5 }, news: 'UPDATE: The civil servants of {city} have gone on indefinite strike. Schools and hospitals are shut. 🪧' } },
      { id: 'rice', icon: '🍚', label: 'Pay them in bags of rice', effect: { money: -8 * M, mood: 2 },
        news: 'Civil servants in {city} will be paid in bags of rice this month, {gov} announced. 🍚',
        twist: { chance: 0.45, effect: { mood: -8 }, news: 'UPDATE: The salary rice in {city} was full of weevils. Civil servants have carried it back to Government House. 🍚🐛' } },
    ],
    ignored: { effect: { assets: { schools: -15, hospital: -15 }, mood: -6 }, news: 'Civil servants in {city} downed tools after the government ignored them. 🪧' },
  },
  {
    id: 'goat', icon: '🐐', title: 'A goat ate the budget',
    body: 'The only printed copy of the {city} budget was eaten by a goat on its way to the House of Assembly.',
    options: [
      { id: 'arrest', icon: '⛓️', label: 'Arrest the goat', effect: { money: -1 * M, mood: 4 },
        news: 'The goat that ate the {city} budget has been arrested and will stand trial. {gov} says nobody is above the law. 🐐⛓️',
        vdm: 'VDM: Na goat una arrest for {city}? The goat chop budget, but who chop the money wey dey inside the budget? Answer me! 🎤🐐' },
      { id: 'reprint', icon: '🖨️', label: 'Reprint it', effect: { money: -2 * M },
        news: 'The {city} budget has been reprinted after the goat incident. The new copy lives in a safe. 🖨️' },
      { id: 'blame', icon: '👉🏾', label: 'Blame the opposition', effect: { mood: -3 },
        news: '{gov} says the goat that ate the {city} budget was sent by the opposition. 🐐',
        twist: { chance: 0.4, effect: { mood: -5 }, news: 'UPDATE: CCTV shows the budget goat belongs to one of {gov}’s own commissioners. 🐐📹' } },
    ],
    ignored: { effect: { money: -5 * M }, news: 'With no budget, the ministries in {city} spent whatever they liked this week. 🐐💸' },
  },
  {
    id: 'rail', icon: '🚄', title: 'A free rail line, but…',
    body: 'A foreign company will build {city} a rail line for free. In exchange, they want the land under the main market.',
    options: [
      { id: 'accept', icon: '🤝🏾', label: 'Take the deal', effect: { assets: { transport: 40, markets: -35 }, mood: -4 },
        news: '{gov} has traded the main market’s land for a free rail line. The traders of {city} are moving, loudly. 🚄',
        twist: { chance: 0.3, effect: { assets: { transport: -30 } }, news: 'UPDATE: The free rail line in {city} is free because it has no trains. They are “on the way”. 🚄❓' } },
      { id: 'refuse', icon: '🛍️', label: 'Refuse: the market stays', effect: { mood: 3 },
        news: '{gov} turned down a free rail line to protect the main market. The market women of {city} are singing the governor’s name. 🛍️' },
      { id: 'counter', icon: '🃏', label: 'Ask for a stadium too, and keep the market', effect: { mood: 1 },
        news: '{gov} told the rail company: a rail line AND a stadium, and the market stays, or nothing. Bold. 🃏',
        twist: { chance: 0.5, effect: { assets: { transport: 30, stadium: 30 }, mood: 5 }, news: 'UPDATE: They agreed! {city} gets a free rail line and a new stadium, and keeps its market. 🚄🏟️' } },
    ],
    ignored: { effect: { mood: -1 }, news: 'The rail company gave up waiting on {city} and went next door. 🚄' },
  },
  {
    id: 'fuel', icon: '⛽', title: 'No fuel anywhere',
    body: 'Every filling station in {city} is dry. The queues are four hours long and black-market jerrycans cost triple.',
    options: [
      { id: 'reserve', icon: '⛽', label: 'Open the state reserve at the old price', effect: { money: -20 * M, mood: 7 },
        news: '{gov} has opened the state fuel reserve at the old price. The queues in {city} are moving. ⛽' },
      { id: 'market', icon: '📈', label: 'Let the market sort it out', effect: { craze: 'fuelScarcity', mood: -3 },
        news: '{gov} says fuel prices in {city} will “find their level”. They are finding it upwards. 📈' },
      { id: 'bicycle', icon: '🚲', label: 'Ride a bicycle to work in solidarity', effect: { mood: 3 },
        news: '{gov} rode a bicycle to Government House today in solidarity with the motorists of {city}. 🚲',
        twist: { chance: 0.45, effect: { mood: -3, craze: 'fuelScarcity' }, news: 'UPDATE: {gov}’s bicycle was stolen outside Government House. There is still no fuel in {city}. 🚲😭' },
        vdm: 'VDM: {gov} dey ride bicycle for camera while people sleep for filling station. Abeg, open the reserve and stop the drama! 🎤⛽' },
    ],
    ignored: { effect: { craze: 'fuelScarcity', mood: -5 }, news: 'The fuel queues in {city} are now a day long. The government has said nothing. ⛽😤' },
  },
  {
    id: 'wedding', icon: '💍', title: 'Your daughter’s wedding',
    body: 'Your daughter is getting married, and the family wants the biggest owambe {city} has ever seen.',
    options: [
      { id: 'road', icon: '🚧', label: 'Close the main road for three days', effect: { mood: -7, craze: 'owambeSeason', assets: { roads: -5 } },
        news: 'The main road in {city} is closed for three days for {gov}’s daughter’s wedding. Ten trailers of small chops are expected. 💍🚧',
        vdm: 'VDM: {gov} close road for three days because of wedding. Ambulance no fit pass. Una dey enjoy our money for party! 🎤💍' },
      { id: 'state', icon: '🏛️', label: 'Let the state pay for “security”', effect: { money: -15 * M, mood: -3, efcc: 0.3 },
        news: '{city} government spent millions on “security” for a wedding this weekend. Whose wedding? 🤔' },
      { id: 'village', icon: '🏡', label: 'A small wedding in the village', effect: { mood: 4 },
        news: '{gov}’s daughter married quietly in the village: forty guests and one cow. {city} is impressed. 🏡' },
    ],
    ignored: { effect: { mood: -5, craze: 'owambeSeason' }, news: '{gov} never decided, so the family did: the wedding shut down half of {city} for the weekend. 💍' },
  },
  {
    id: 'yahoo', icon: '💻', title: 'Very rich young investors',
    body: 'Some very rich young men with no visible jobs want to “invest” in the {city} tech hub. Cash only.',
    options: [
      { id: 'take', icon: '💵', label: 'Take the money', effect: { money: 20 * M, assets: { techhub: 25 } },
        news: 'The {city} tech hub has new investors. They paid cash, in sacks. 💻💵',
        twist: { chance: 0.4, effect: { assets: { techhub: -40 }, mood: -4 }, news: 'UPDATE: The EFCC raided the {city} tech hub at dawn. The laptops, the investors and the Wi-Fi router are all gone. 🚨💻' } },
      { id: 'refuse', icon: '🙅🏾', label: 'Refuse', effect: { mood: 1 },
        news: '{gov} turned down a “cash investment” in the {city} tech hub. 🙅🏾' },
      { id: 'report', icon: '🕵🏾', label: 'Report them to the EFCC', effect: { mood: 3 },
        news: '{gov} reported the would-be tech hub investors to the EFCC. 🕵🏾',
        twist: { chance: 0.3, effect: { craze: 'crimeWave' }, news: 'UPDATE: The young men {gov} reported are out on bail, and very angry. Crime is up in {city}. 🚨' } },
    ],
    ignored: { effect: { assets: { techhub: -10 } }, news: 'The young investors opened their own “tech hub” across the road in {city}. It has better Wi-Fi. 💻' },
  },
  {
    id: 'lion', icon: '🦁', title: 'A lion in the market',
    body: 'A lion escaped from a travelling circus and is sitting in the middle of the main market in {city}.',
    options: [
      { id: 'close', icon: '🔒', label: 'Shut the market until it leaves', effect: { assets: { markets: -10 }, mood: 1 },
        news: '{gov} has shut the main market in {city} until the lion leaves. The lion is in no hurry. 🦁🔒' },
      { id: 'hunters', icon: '🏹', label: 'Send the local hunters', effect: { money: -2 * M },
        news: '{gov} has sent the local hunters after the market lion in {city}. 🏹',
        twist: { chance: 0.5, effect: { mood: 6 }, news: 'UPDATE: The hunters caught the lion alive and paraded it round {city}. They are celebrities now. 🏹🦁' } },
      { id: 'cat', icon: '🐈', label: 'Say it is just a big cat', effect: {},
        news: '{gov} says the “lion” in the {city} market is “a big cat that has been eating well”. 🐈',
        twist: { chance: 0.6, effect: { assets: { markets: -25 }, mood: -6 }, news: 'UPDATE: It was not a cat. The main market in {city} is empty and the traders refuse to go back. 🦁' } },
    ],
    ignored: { effect: { assets: { markets: -20 }, mood: -4 }, news: 'The lion has been in the {city} market for a day now. Government has not said a word. The lion has a stall. 🦁' },
  },
  {
    id: 'asleep', icon: '😴', title: 'Caught asleep on camera',
    body: 'A video of you fast asleep at the Independence Day parade is going viral all over {city}.',
    options: [
      { id: 'sorry', icon: '🙏🏾', label: 'Apologise', effect: { mood: 2 },
        news: '{gov} has apologised for falling asleep at the parade. “The speeches were long,” the governor said. 🙏🏾' },
      { id: 'thinking', icon: '🧠', label: 'Say you were “thinking deeply”', effect: { mood: -3 },
        news: '{gov} says the viral video shows the governor “thinking deeply about {city}”, not sleeping. 🧠',
        vdm: 'VDM: “Thinking deeply”? With mouth open and saliva on agbada? {gov}, na sleep you sleep! Wake up and work! 🎤😴' },
      { id: 'arrest', icon: '⛓️', label: 'Arrest whoever filmed it', effect: { mood: -9 },
        news: 'The man who filmed {gov} asleep at the parade has been arrested in {city}. 📹⛓️',
        twist: { chance: 0.5, effect: { mood: -5 }, news: 'UPDATE: #FreeTheCameraman is trending worldwide. Protesters are at the gates of Government House in {city}. 📱🪧' } },
    ],
    ignored: { effect: { mood: -3 }, news: 'The video of {gov} asleep at the parade has been seen by everybody in {city}. The governor has said nothing. Still asleep? 😴' },
  },
  {
    id: 'canal', icon: '🌊', title: 'Mansions on the drainage canal',
    body: 'Rich people have built mansions right on top of the main drainage canal in {city}. Rainy season is coming.',
    options: [
      { id: 'demolish', icon: '🚜', label: 'Bring the bulldozers', effect: { money: -5 * M, mood: 5, assets: { roads: 10 } },
        news: '{gov} sent the bulldozers to the canal mansions of {city}. The drains are flowing again. 🚜',
        twist: { chance: 0.3, effect: { mood: -4 }, news: 'UPDATE: One of the bulldozed mansions in {city} belonged to the Senate President’s in-law. Abuja is not happy. 😬' } },
      { id: 'settle', icon: '💼', label: 'Collect a “settlement” to look away', effect: { pocket: 12 * M, efcc: 0.3 },
        news: 'The canal mansions of {city} are staying. Nobody knows why. 💼',
        twist: { chance: 0.5, effect: { assets: { roads: -25 }, mood: -6 }, news: 'UPDATE: The canal overflowed. Half of {city} is under water. The mansions are fine. 🌊' } },
      { id: 'leave', icon: '🤷🏾', label: 'Leave it for the next governor', effect: {},
        news: '{gov} says the canal mansions of {city} are a matter for “the next administration”. 🤷🏾',
        twist: { chance: 0.5, effect: { assets: { roads: -20 }, mood: -5 }, news: 'UPDATE: The canal overflowed and flooded {city}. The next administration has not arrived yet. 🌊' } },
    ],
    ignored: { effect: { assets: { roads: -15 }, mood: -4 }, news: 'The rains came, the canal under the mansions overflowed, and {city} flooded. Government was not available for comment. 🌊' },
  },
];

export const DILEMMA_BY_ID: Record<string, Dilemma> = Object.fromEntries(DILEMMAS.map((d) => [d.id, d]));

/** A naira amount for this state: bigger states deal in bigger money. */
export const deskAmount = (n: number, city: CivicCity) => Math.round((n * CITY_SCALE[city]) / 100_000) * 100_000;

/** Fills a line in for a state and its governor. */
export const deskText = (line: string, city: string, gov: string) => line.replace(/\{city\}/g, city).replace(/\{gov\}/g, gov);

/** What a choice visibly does, as chips for the desk card. The twist is never on it, only that something could happen. */
export function deskChips(option: Pick<DeskOption, 'effect' | 'twist'>, city: CivicCity): { icon: string; text: string; tone: 'good' | 'bad' | 'risk' }[] {
  const e = option.effect;
  const out: { icon: string; text: string; tone: 'good' | 'bad' | 'risk' }[] = [];
  const short = (n: number) => `₦${n >= M ? `${+(n / M).toFixed(1)}M` : `${Math.round(n / 1000)}k`}`;
  if (e.money) out.push(e.money > 0 ? { icon: '🏦', text: `+${short(deskAmount(e.money, city))}`, tone: 'good' } : { icon: '🏦', text: `−${short(deskAmount(-e.money, city))}`, tone: 'bad' });
  if (e.mood) out.push(e.mood > 0 ? { icon: '😊', text: 'People like it', tone: 'good' } : { icon: '😠', text: 'People hate it', tone: 'bad' });
  for (const [asset, d] of Object.entries(e.assets ?? {}) as [StateAsset, number][]) out.push({ icon: ASSET_INFO[asset].icon, text: `${ASSET_INFO[asset].label} ${d > 0 ? '↑' : '↓'}`, tone: d > 0 ? 'good' : 'bad' });
  if (e.craze) out.push({ icon: NPC_CRAZES[e.craze].icon, text: NPC_CRAZES[e.craze].label, tone: 'risk' });
  if (e.pocket) out.push({ icon: '💰', text: `${short(deskAmount(e.pocket, city))} for you`, tone: 'good' });
  if (e.efcc) out.push({ icon: '🕵🏾', text: 'EFCC could find out', tone: 'risk' });
  if (option.twist) out.push({ icon: '🎲', text: 'Anything can happen', tone: 'risk' });
  return out;
}
