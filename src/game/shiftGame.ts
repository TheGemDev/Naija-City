// What you do at your post while a shift runs (ui/ShiftGame.tsx). Every so often a job turns up: a customer at
// the counter, a file to check, a question only somebody who does this work would get right. Which jobs turn up
// depends on what you do for a living. Each one done right adds to a bonus paid on top of the wage when you
// clock out. Missing one, or letting it walk away, costs nothing but the bonus: you still get the wage.
//
// The bonus is a gig payout ('shift_bonus' in game/gigs.ts). The server (worker/wallet.ts) only accepts it
// straight after the wage for that shift, and never for more than a perfect shift is worth.

import { create } from 'zustand';
import { maxShiftBonus, SHIFT_BONUS_PCT } from './gigs';

export const SHIFT = {
  /** Jobs a full shift brings, evenly spread. Come late and the ones you missed are gone. */
  rounds: 10,
  /** A perfect shift pays this share of the job's daily wage on top. */
  bonusPct: SHIFT_BONUS_PCT,
  /** Hungry or tired (a need under this): rounds run faster and the target is smaller. */
  weakBelow: 20,
  weakFactor: 0.75,
  /** Real seconds a job waits for you before it walks away. */
  patience: 10,
};

export interface Question {
  prompt: string;
  /** A second line, shown in monospace (a plate, a file number, a line of code). */
  detail?: string;
  options: string[];
  answer: number;
}

/**
 * One job at your post. `call` is what you see when it turns up.
 * `timing`: stop the marker in the zone. `quiz`: pick the right answer before the clock runs out.
 * `sort`: tap the tiles from the smallest to the biggest.
 */
export type WorkTask =
  | { kind: 'timing'; call: string; how: string; tap: string }
  | { kind: 'quiz'; call: string; question: Question }
  | { kind: 'sort'; call: string; how: string; tiles: string[]; /** Tile indexes in the order they must be tapped. */ order: number[] };

const int = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const shuffled = <T,>(list: readonly T[]): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const money = (n: number) => `₦${n.toLocaleString('en-NG')}`;

/** The right answer and two wrong ones that look close, shuffled. */
function choices(right: number, step: number, fmt: (n: number) => string): Pick<Question, 'options' | 'answer'> {
  const wrong = new Set<number>();
  while (wrong.size < 2) {
    const off = pick([-2, -1, 1, 2]) * step;
    if (right + off > 0) wrong.add(right + off);
  }
  const all = shuffled([right, ...wrong]);
  return { options: all.map(fmt), answer: all.indexOf(right) };
}

const yesNo = (yes: boolean, labels: [string, string] = ['✓ Yes', '✗ No']): Pick<Question, 'options' | 'answer'> => ({ options: labels, answer: yes ? 0 : 1 });

const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const letters = (n: number) => Array.from({ length: n }, () => pick([...LETTERS])).join('');
const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join('');
/** Swap two neighbouring characters that differ, so the copy is wrong but looks right at a glance. */
function scramble(text: string) {
  const spots = [...text].map((_, i) => i).filter((i) => i < text.length - 1 && text[i] !== text[i + 1] && /\w/.test(text[i]) && /\w/.test(text[i + 1]));
  if (!spots.length) return `${text}1`;
  const i = pick(spots);
  return text.slice(0, i) + text[i + 1] + text[i] + text.slice(i + 2);
}

const GOODS = ['a mudu of rice', 'a tuber of yam', 'a paint of garri', 'a crate of eggs', 'a wrapper', 'a bag of pure water', 'a basket of tomatoes', 'a keg of palm oil'];
const CODE = ['if (light) { pumpWater(); }', 'pay(fare * (1 - levy));', 'for (const k of keke) { k.fuel(); }', 'return jollof.filter((r) => r.hot);', 'const total = price * (qty + 1);', 'while (nepa.off()) { gen.run(); }'];
/** What a government file number starts with in each city. */
const FILE_PREFIX: Record<string, string> = { kaduna: 'KDSG', abuja: 'FCTA', lagos: 'LASG', kano: 'KNSG' };
/** Number plates you see most on each city's roads. */
const PLATES: Record<string, string[]> = { kaduna: ['KAD', 'ZAR', 'KAF', 'KAN', 'ABJ'], abuja: ['ABJ', 'KWL', 'GWA', 'KAD', 'NSR'], lagos: ['LAG', 'EKY', 'IKJ', 'APP', 'OGN'], kano: ['KAN', 'DAL', 'FGE', 'NSR', 'KAD'] };

type QuizId = 'change' | 'fare' | 'balance' | 'bill' | 'baggage' | 'sums' | 'plates' | 'files' | 'code' | 'yards' | 'reps' | 'barrels' | 'spray';

/** Sums and checks made up fresh each time. `city` is where the workplace is. */
const QUIZZES: Record<QuizId, (city: string) => Question> = {
  change() {
    const price = int(3, 18) * 50;
    const paid = pick([500, 1000, 2000].filter((n) => n > price));
    const goods = pick(GOODS);
    return { prompt: `${goods[0].toUpperCase()}${goods.slice(1)} costs ${money(price)}. Customer gives ${money(paid)}. Change?`, ...choices(paid - price, 50, money) };
  },
  fare() {
    const riders = int(2, 4);
    const fare = pick([100, 150, 200]);
    const paid = pick([1000, 2000].filter((n) => n > riders * fare));
    return { prompt: `${riders} passengers at ${money(fare)} each. One pays ${money(paid)} for everybody. Change?`, ...choices(paid - riders * fare, 50, money) };
  },
  balance() {
    const balance = int(20, 90) * 1000;
    const out = int(3, 18) * 500;
    const deposit = Math.random() < 0.4;
    return { prompt: `Balance ${money(balance)}. Customer ${deposit ? 'deposits' : 'withdraws'} ${money(out)}. New balance?`, ...choices(deposit ? balance + out : balance - out, 500, money) };
  },
  bill() {
    const rate = int(3, 9) * 5000;
    const nights = int(2, 4);
    const extras = int(1, 6) * 1000;
    return { prompt: `${nights} nights at ${money(rate)} plus ${money(extras)} room service. Total?`, ...choices(rate * nights + extras, 5000, money) };
  },
  baggage() {
    const over = int(2, 9);
    const fee = pick([500, 1000]);
    return { prompt: `Bag weighs ${23 + over}kg. Limit is 23kg, ${money(fee)} per extra kilo. Charge?`, ...choices(over * fee, fee, money) };
  },
  sums() {
    const a = int(3, 12);
    const b = int(3, 12);
    const times = Math.random() < 0.6;
    const right = times ? a * b : a * 10 + b + (b * 10 + a);
    const ok = Math.random() < 0.5;
    const shown = ok ? right : right + pick([-10, -2, -1, 1, 2, 10]);
    return { prompt: 'The pupil wrote:', detail: `${times ? `${a} × ${b}` : `${a * 10 + b} + ${b * 10 + a}`} = ${shown}`, ...yesNo(ok, ['✓ Correct', '✗ Wrong']) };
  },
  plates(city) {
    const plate = `${pick(PLATES[city] ?? PLATES.kaduna)}-${digits(3)}-${letters(2)}`;
    const ok = Math.random() < 0.5;
    return { prompt: 'Wanted list vs the car in front of you:', detail: `${plate}\n${ok ? plate : scramble(plate)}`, ...yesNo(ok, ['🚨 Same car', '👋🏾 Wave on']) };
  },
  files(city) {
    const file = `${FILE_PREFIX[city] ?? FILE_PREFIX.kaduna}/${letters(3)}/${digits(4)}/${int(19, 26)}`;
    const ok = Math.random() < 0.5;
    return { prompt: 'Form vs the register:', detail: `${file}\n${ok ? file : scramble(file)}`, ...yesNo(ok, ['✓ Stamp it', '✗ Send back']) };
  },
  code() {
    const line = pick(CODE);
    const ok = Math.random() < 0.5;
    // Drop one closing bracket to break it.
    const closers = [...line].map((c, i) => (')}'.includes(c) ? i : -1)).filter((i) => i >= 0);
    const cut = pick(closers);
    return { prompt: 'Will this compile?', detail: ok ? line : line.slice(0, cut) + line.slice(cut + 1), ...yesNo(ok, ['✓ Ship it', '✗ Broken']) };
  },
  yards() {
    const pieces = int(3, 9);
    const each = pick([2, 4, 6]);
    return { prompt: `An order for ${pieces} wrappers of ${each} yards each. How much cloth?`, ...choices(pieces * each, each, (n) => `${n} yards`) };
  },
  reps() {
    const sets = int(3, 5);
    const each = pick([8, 10, 12, 15]);
    return { prompt: `${sets} sets of ${each} squats. How many squats altogether?`, ...choices(sets * each, sets, (n) => `${n}`) };
  },
  barrels() {
    const tank = int(8, 18) * 50;
    const out = int(2, 5) * 50;
    return { prompt: `The tank holds ${tank} barrels. ${out} have been pumped out. How many are left?`, ...choices(tank - out, 50, (n) => `${n} barrels`) };
  },
  spray() {
    const notes = int(4, 12);
    const note = pick([200, 500, 1000]);
    return { prompt: `The celebrant sprays you ${notes} notes of ${money(note)}. How much is that?`, ...choices(notes * note, note, money) };
  },
};

/** A question about the work itself: the first answer is the right one (they are shuffled when asked). */
type Sense = [prompt: string, right: string, wrong1: string, wrong2: string];

interface SortDef {
  call: string;
  how: string;
  /** The values to pick four from. */
  pool: () => number[];
  fmt: (n: number) => string;
}

interface Desk {
  /** What your post is called on the work card. */
  title: string;
  timing: { call: string; how: string; tap: string };
  quiz: { call: string; id: QuizId };
  sort: SortDef;
  /** What a question about the work is announced as. */
  senseCall: string;
  sense: Sense[];
}

const range = (min: number, max: number, step = 1) => () => Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => min + i * step);
const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

/** Each job's post: what turns up there. Keyed by job id (game/catalog.ts JOBS). */
export const DESKS: Record<string, Desk> = {
  keke: {
    title: 'On the route',
    timing: { call: '🚏 Passenger at the bus stop!', how: 'Brake right at the bus stop to pick the passenger.', tap: '🛺 Brake' },
    quiz: { call: '💵 Passengers are paying', id: 'fare' },
    sort: { call: '🧭 Four drops ahead', how: 'Drop the nearest passenger first.', pool: range(1, 15), fmt: (n) => `${n} km` },
    senseCall: '🤔 Wahala on the road',
    sense: [
      ['The fuel light is on and a passenger wants a long trip.', 'Buy fuel first', 'Pray and go', 'Cover the dashboard'],
      ['Road safety flags you down.', 'Park and show your papers', 'Speed off', 'Pretend the keke has spoiled'],
      ['A passenger gives ₦1,000 for a ₦200 trip and you have no change.', 'Find change before you move', 'Keep it all', 'Drop them halfway'],
      ['Rain has flooded your usual road.', 'Take the longer dry road', 'Drive through and hope', 'Offload the passengers in the water'],
    ],
  },
  airport: {
    title: 'On the apron',
    timing: { call: '🛬 A plane is taxiing in', how: 'Wave it to a stop right on the mark.', tap: '🏓 Stop' },
    quiz: { call: '🧳 A bag on the scale', id: 'baggage' },
    sort: { call: '🛄 The trolley is full', how: 'Load the lightest bag first.', pool: range(8, 32), fmt: (n) => `${n} kg` },
    senseCall: '🤔 A passenger needs you',
    sense: [
      ['A bag comes down the belt with no name tag.', 'Tag it before it goes on', 'Throw it on any flight', 'Take it home'],
      ['A box is marked FRAGILE.', 'Load it last, on top', 'Put it under the heavy bags', 'Throw it to save time'],
      ['Boarding has been called and a passenger is still at the counter.', 'Rush them to the gate', 'Tell them to come tomorrow', 'Ask for something for the boys'],
      ['You find a phone left on a seat in the lounge.', 'Hand it to lost and found', 'Switch it off and pocket it', 'Leave it there'],
    ],
  },
  trader: {
    title: 'At the stall',
    timing: { call: '⚖️ Measuring out garri', how: 'Stop pouring right at the top of the mudu.', tap: '✋🏾 Stop' },
    quiz: { call: '🧺 Customer dey wait', id: 'change' },
    sort: { call: '🏷️ New goods have come', how: 'Lay them out cheapest first.', pool: range(200, 3000, 50), fmt: money },
    senseCall: '🤔 Market palaver',
    sense: [
      ['A customer says the next stall sells it cheaper.', 'Bargain a little and keep them', 'Insult the next stall', 'Double your price'],
      ['Your tomatoes will spoil by tomorrow.', 'Drop the price and sell today', 'Hide them under the fresh ones', 'Wait for next week'],
      ['A customer wants to pay at month end.', 'Write it in the book', 'Trust your memory', 'Give out the whole stall'],
      ['Your scale reads a little over.', 'Fix it before you sell', 'Enjoy the extra profit', 'Cover it with a cloth'],
    ],
  },
  textile: {
    title: 'On the loom',
    timing: { call: '✂️ Cloth on the table', how: 'Cut the cloth on the chalk mark.', tap: '✂️ Cut' },
    quiz: { call: '📋 An order has come in', id: 'yards' },
    sort: { call: '🧵 Rolls off the line', how: 'Stack the shortest roll first.', pool: range(5, 60), fmt: (n) => `${n} yards` },
    senseCall: '🤔 Trouble on the floor',
    sense: [
      ['The loom starts making a strange noise.', 'Stop it and call the technician', 'Turn up the radio', 'Hit it with a spanner'],
      ['A thread snaps in the middle of a run.', 'Stop, tie it and carry on', 'Keep running, nobody will see', 'Go on break'],
      ['Your sleeve is hanging loose near the rollers.', 'Roll it up before you start', 'Work faster', 'Hold it in your teeth'],
      ['The dye does not match the sample.', 'Tell the supervisor before the full run', 'Run the whole batch', 'Call it a new design'],
    ],
  },
  hotel: {
    title: 'At reception',
    timing: { call: '🚪 A guest is at the door', how: 'Swing the door open just as they reach it.', tap: '🚪 Open' },
    quiz: { call: '🛎️ A guest is checking out', id: 'bill' },
    sort: { call: '🔑 Keys back on the board', how: 'Hang the lowest room number first.', pool: range(101, 420), fmt: (n) => `Room ${n}` },
    senseCall: '🤔 A guest has a problem',
    sense: [
      ['A guest says the AC in their room has stopped.', 'Send maintenance or move them', 'Tell them to open the window', 'Say it is NEPA'],
      ['A stranger asks which room a guest is staying in.', 'Call the guest to confirm first', 'Give the room number', 'Hand over the spare key'],
      ['Two guests have been booked into the same room.', 'Upgrade one and apologise', 'Let them settle it', 'Hide in the back office'],
      ['A guest wants to check out at 3am.', 'Prepare the bill and receipt', 'Tell them to wait till morning', 'Pretend to be asleep'],
    ],
  },
  banker: {
    title: 'At the counter',
    timing: { call: '💵 The counting machine is running', how: 'Stop the count right on the mark.', tap: '✋🏾 Stop' },
    quiz: { call: '🏦 Customer at your window', id: 'balance' },
    sort: { call: '💰 Mixed notes in the till', how: 'Arrange the notes smallest first.', pool: () => [5, 10, 20, 50, 100, 200, 500, 1000], fmt: money },
    senseCall: '🤔 A tricky customer',
    sense: [
      ['A customer wants to withdraw without any ID.', 'No ID, no withdrawal', 'Pay if they look honest', 'Ask a colleague to guess'],
      ['Your till is ₦500 short at closing.', 'Report it and recount', 'Add your own money quietly', 'Blame the last customer'],
      ['A caller asks for a customer’s balance.', 'Refuse: that is confidential', 'Read it out', 'Send it by text'],
      ['A note feels wrong and has no security thread.', 'Hold it and call the supervisor', 'Pay it out to the next customer', 'Put it in your pocket'],
    ],
  },
  police: {
    title: 'On duty',
    timing: { call: '🚧 A car at the checkpoint', how: 'Drop the barrier just as the car reaches it.', tap: '🚧 Stop' },
    quiz: { call: '🚓 Stop and check', id: 'plates' },
    sort: { call: '📻 Radio calls stacking up', how: 'Answer the earliest call first.', pool: range(6 * 60, 22 * 60, 5), fmt: clock },
    senseCall: '🤔 Judgement call',
    sense: [
      ['A driver offers you ₦500 to look away.', 'Refuse and write the ticket', 'Collect and wave him on', 'Ask for ₦1,000'],
      ['A crowd has caught a suspected thief.', 'Take the suspect to the station', 'Join the crowd', 'Walk away'],
      ['A victim comes in to report a burglary.', 'Take a statement and open a case', 'Ask for fuel money first', 'Say it is a family matter'],
      ['You have just arrested a suspect.', 'Tell them why they are held', 'Keep their phone for yourself', 'Lock them up with no record'],
    ],
  },
  fitness: {
    title: 'On the training ground',
    timing: { call: '🏋🏾 Client under the bar', how: 'Shout “UP!” at the top of the rep.', tap: '🏋🏾 Up!' },
    quiz: { call: '📋 A client wants a plan', id: 'reps' },
    sort: { call: '🏋🏾 Weights all over the floor', how: 'Rack the lightest first.', pool: range(5, 60, 5), fmt: (n) => `${n} kg` },
    senseCall: '🤔 A client needs you',
    sense: [
      ['A client feels a sharp pain in the knee mid-squat.', 'Stop the exercise at once', 'Add more weight', 'Say pain is weakness leaving'],
      ['A new member wants the heaviest bar on day one.', 'Start light and build up', 'Load it up', 'Film it for Snap'],
      ['What comes first in a hard session?', 'Warm-up', 'The heaviest lift', 'Pepper soup'],
      ['A client is dizzy under the sun.', 'Sit them in the shade with water', 'Ten more laps', 'Shout motivation'],
    ],
  },
  teacher: {
    title: 'In class',
    timing: { call: '🔔 Nearly break time', how: 'Ring the bell right on the hour.', tap: '🔔 Ring' },
    quiz: { call: '📝 Scripts to mark', id: 'sums' },
    sort: { call: '📊 Test scores are in', how: 'Line them up lowest first.', pool: range(12, 98), fmt: (n) => `${n}%` },
    senseCall: '🙋🏾 A hand is up',
    sense: [
      ['A pupil keeps failing the same sums.', 'Explain it another way', 'Punish the whole class', 'Mark it right to save time'],
      ['Two pupils are fighting at break.', 'Separate them and hear both sides', 'Pick a winner', 'Lock the classroom and go'],
      ['“Teacher, how many states are in Nigeria?”', '36', '30', '42'],
      ['“Teacher, what is the capital of Nigeria?”', 'Abuja', 'Lagos', 'Kaduna'],
    ],
  },
  civil: {
    title: 'In the registry',
    timing: { call: '🖋️ A memo for Oga', how: 'Bring the stamp down square in the box.', tap: '🖋️ Stamp' },
    quiz: { call: '🗂️ A form on your desk', id: 'files' },
    sort: { call: '📁 Files off the trolley', how: 'Shelve the lowest number first.', pool: range(1000, 9999), fmt: (n) => `No. ${n}` },
    senseCall: '🤔 Office matter',
    sense: [
      ['A file has sat on your desk for three weeks.', 'Treat it and move it on today', 'Put it under the pile', 'Say it is missing'],
      ['A visitor offers “something” to rush an approval.', 'Decline and follow the process', 'Collect and stamp', 'Ask him to double it'],
      ['Oga wants a memo by noon.', 'Write it, check it, send it', 'Go on break first', 'Say the printer has spoiled'],
      ['What does FCT stand for?', 'Federal Capital Territory', 'Federal Central Town', 'First Capital Township'],
    ],
  },
  refinery: {
    title: 'In the control room',
    timing: { call: '🛢️ Pressure is rising', how: 'Close the valve inside the safe band.', tap: '🛢️ Close valve' },
    quiz: { call: '📟 Reading from the tank farm', id: 'barrels' },
    sort: { call: '🌡️ Four gauges to log', how: 'Log the lowest reading first.', pool: range(40, 480, 5), fmt: (n) => `${n} psi` },
    senseCall: '🦺 Safety check',
    sense: [
      ['You smell gas near a pipe joint.', 'Raise the alarm and clear the area', 'Light a match to check', 'Carry on working'],
      ['Before you open a pressurised line, you…', 'Isolate it and bleed the pressure', 'Stand back and open it fast', 'Send the new boy'],
      ['Your hard hat is in the office and the job takes two minutes.', 'Go and get the hat', 'Do it quickly', 'Wear a bucket'],
      ['A gauge is far above the red line.', 'Shut down and report it', 'Tap the glass till it drops', 'Cover it with tape'],
    ],
  },
  dev: {
    title: 'At your desk',
    timing: { call: '🚀 The deploy window is open', how: 'Ship it inside the quiet window.', tap: '🚀 Deploy' },
    quiz: { call: '💻 A pull request is waiting', id: 'code' },
    sort: { call: '🎫 Tickets piling up', how: 'Take the oldest ticket (the lowest number) first.', pool: range(100, 999), fmt: (n) => `#${n}` },
    senseCall: '🤔 Stand-up question',
    sense: [
      ['The tests fail on your branch just before the release.', 'Fix them before you merge', 'Delete the tests', 'Merge and go home'],
      ['The site goes down right after your deploy.', 'Roll back, then find the bug', 'Blame the intern', 'Switch off your phone'],
      ['Where do users’ passwords belong?', 'Hashed in the database', 'Plain text in a spreadsheet', 'In the README'],
      ['What does HTML stand for?', 'HyperText Markup Language', 'High Tech Modern Language', 'Home Tool Markup Language'],
    ],
  },
  dj: {
    title: 'In the booth',
    timing: { call: '🎧 The crowd is building', how: 'Drop it when the crowd is at the peak.', tap: '🎧 Drop' },
    quiz: { call: '💸 They are spraying you', id: 'spray' },
    sort: { call: '💿 Four tracks cued', how: 'Queue the slowest BPM first.', pool: range(90, 140), fmt: (n) => `${n} BPM` },
    senseCall: '🤔 Trouble in the club',
    sense: [
      ['The dance floor empties during your new track.', 'Mix into a known banger', 'Play it again, louder', 'Go for a break'],
      ['The celebrant hands you a request.', 'Work it into the next mix', 'Tear it up', 'Ask for ₦50,000 first'],
      ['The speakers start to crackle.', 'Bring the gain down', 'Turn everything up', 'Pour water on the mixer'],
      ['NEPA takes light in the middle of your set.', 'Hype the crowd till the gen comes on', 'Pack up and leave', 'Blame the MC'],
    ],
  },
};

/** A job with no post of its own works this one. */
const DEFAULT_DESK: Desk = {
  title: 'At your post',
  timing: { call: '👊🏾 Stay sharp', how: 'Hit the mark.', tap: '👊🏾 Now' },
  quiz: { call: '🧮 Quick sum', id: 'change' },
  sort: { call: '🗃️ Things to put in order', how: 'Tap the smallest first.', pool: range(1, 99), fmt: (n) => `${n}` },
  senseCall: '🤔 Quick one',
  sense: [['Oga asks who can stay back to help.', 'Offer to help', 'Hide in the toilet', 'Point at a colleague']],
};

export const deskFor = (jobId: string | null | undefined): Desk => (jobId && DESKS[jobId]) || DEFAULT_DESK;

export const SORT_TILES = 4;
const KINDS = ['timing', 'quiz', 'sort', 'sense'] as const;
type Kind = (typeof KINDS)[number];

/** The next job at your post: never the same kind twice running. `city` is where the workplace is. */
export function nextTask(jobId: string, city: string, last?: string): WorkTask & { id: Kind } {
  const desk = deskFor(jobId);
  const id = pick(KINDS.filter((k) => k !== last));
  if (id === 'timing') return { id, kind: 'timing', ...desk.timing };
  if (id === 'quiz') return { id, kind: 'quiz', call: desk.quiz.call, question: QUIZZES[desk.quiz.id](city) };
  if (id === 'sort') {
    const values = shuffled(desk.sort.pool()).slice(0, SORT_TILES);
    const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
    return { id, kind: 'sort', call: desk.sort.call, how: desk.sort.how, tiles: values.map(desk.sort.fmt), order };
  }
  const [prompt, right, ...wrong] = pick(desk.sense);
  const options = shuffled([right, ...wrong]);
  return { id, kind: 'quiz', call: desk.senseCall, question: { prompt, options, answer: options.indexOf(right) } };
}

/** Rounds get quicker as the shift goes on. `t` runs 0..1 across the shift. */
export const ROUND = {
  /** Seconds to answer a quiz round. */
  quizSeconds: (t: number) => 7 - 2 * t,
  /** Seconds to put the tiles in order. */
  sortSeconds: (t: number) => 8 - 2.5 * t,
  /** Seconds the marker takes to cross the bar. */
  sweepSeconds: (t: number) => 1.3 - 0.55 * t,
  /** Width of the target zone, as a share of the bar. */
  zone: (t: number) => 0.24 - 0.09 * t,
  /** The marker crosses this many times before the round counts as missed. */
  sweeps: 4,
};

interface ShiftState {
  /** The work task this score belongs to (its startedAt), so a new shift starts from zero. */
  shift: number | null;
  hits: number;
  /** Jobs done or let go. */
  played: number;
  /** Jobs that have turned up so far, the one on the desk included. */
  issued: number;
  /** The job on the desk, and whether you have picked it up yet. */
  task: (WorkTask & { id: string }) | null;
  stage: 'call' | 'play';
  /** The kind of job that turned up last, so the next is a different one. */
  last?: string;
  /** Asked to leave early (the footer's button): the card is asking if you are sure. */
  leaving: boolean;
}

const EMPTY: ShiftState = { shift: null, hits: 0, played: 0, issued: 0, task: null, stage: 'call', last: undefined, leaving: false };
export const useShift = create<ShiftState>(() => ({ ...EMPTY }));

/** A new shift starts from zero. */
export function openShift(shift: number) {
  if (useShift.getState().shift !== shift) useShift.setState({ ...EMPTY, shift });
}

/**
 * How many jobs should have turned up after `worked` game minutes of a shift `length` minutes long:
 * the first half a gap in, then one every gap.
 */
export const jobsDue = (worked: number, length: number) => Math.max(0, Math.min(SHIFT.rounds, Math.floor((worked / length) * SHIFT.rounds + 0.5)));

/** Put the next job on the desk if one is due and the desk is clear. */
export function callNext(jobId: string, city: string, due: number) {
  const s = useShift.getState();
  if (s.task || s.issued >= due) return;
  const task = nextTask(jobId, city, s.last);
  useShift.setState({ task, last: task.id, stage: 'call', issued: s.issued + 1 });
}

/** The job on the desk is over: done right, done wrong, or it walked away. */
export function settleTask(hit: boolean) {
  const s = useShift.getState();
  if (!s.task) return;
  useShift.setState({ task: null, stage: 'call', hits: s.hits + (hit ? 1 : 0), played: s.played + 1 });
}

/** What a score is worth for a job paying `pay` a day, before tax. */
export function shiftBonus(pay: number, hits: number) {
  const raw = pay * SHIFT.bonusPct * Math.min(1, hits / SHIFT.rounds);
  return Math.min(maxShiftBonus(pay), Math.round(raw / 50) * 50);
}

/** The shift is over: hand back the score and clear it, so it's paid once. */
export function takeShiftScore() {
  const { hits, played } = useShift.getState();
  useShift.setState({ ...EMPTY });
  return { hits, played };
}
