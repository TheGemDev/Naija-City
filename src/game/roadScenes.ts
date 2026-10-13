// Roadside encounters for drivers. A checkpoint (or a random stop between them) picks one of these at
// random, so the same six roadblocks stop being the same conversation. game/drive.ts runs the choices.

export interface SceneCtx {
  /** What the encounter would "normally" cost, already scaled for the vehicle and road conditions. */
  ask: number;
  /** Luck in [0, 1), rolled fresh for each call. */
  roll(): number;
  toast(text: string): void;
  /** Charge up to `amount` (never more than you have). Returns what was taken. */
  spend(amount: number, label: string): number;
  /** Pay the player a windfall (server-capped like other lucky breaks). */
  win(amount: number, label: string): void;
  /** Lose game minutes, with an optional hit to energy and fun. */
  delay(minutes: number, energy?: number, fun?: number): void;
  fun(by: number): void;
  notoriety(by: number): void;
  /** Freeze the vehicle for a few seconds. */
  stall(seconds: number): void;
  /** Take the vehicle off you for the day and end the drive. */
  impound(): void;
  /** The original three checkpoint outcomes. */
  classic(kind: 'pay' | 'argue' | 'flee'): void;
}

export interface SceneChoice {
  label: (ask: number) => string;
  /** Needs this much cash to be tappable. */
  cost?: (ask: number) => number;
  run(c: SceneCtx): void;
}

export interface Scene {
  id: string;
  icon: string;
  tag: string;
  /** How often this one comes up compared with the others. */
  weight: number;
  /** Opening lines, one is chosen. */
  lines: string[];
  body: string;
  choices: SceneChoice[];
}

const n = (x: number) => '₦' + x.toLocaleString('en-NG');
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export const SCENES: Scene[] = [
  {
    id: 'classic', icon: '👮🏾', tag: 'POLICE CHECKPOINT', weight: 3,
    lines: [
      'Oga, park well! Wetin you carry for back?',
      'Where your particulars? Na today you go know.',
      'My brother, the weather is hot. Something for the boys?',
      'Highness! Anything for your boys this afternoon?',
      'You no see say road dey under construction? Bring your papers.',
    ],
    body: 'The officer leans on your window, rifle strap over his shoulder. Two more are watching from the Hilux.',
    choices: [
      { label: (a) => `💵 Give “something for the boys” · ${n(a)}`, cost: (a) => a, run: (c) => c.classic('pay') },
      { label: () => '⚖️ “Officer, I know my rights!”', run: (c) => c.classic('argue') },
      { label: () => '💨 Floor it and speed off', run: (c) => c.classic('flee') },
    ],
  },
  {
    id: 'extinguisher', icon: '🧯', tag: 'ROAD SAFETY', weight: 2,
    lines: ['Where is your fire extinguisher? Reflective triangle? First aid box? Wheel spanner?!'],
    body: 'A man in a bright vest holds a clipboard and a stern face. A hawker with a pile of extinguishers is standing, suspiciously, right behind him.',
    choices: [
      {
        label: (a) => `🧯 Buy one from the hawker · ${n(a * 2)}`, cost: (a) => a * 2,
        run: (c) => { c.spend(c.ask * 2, 'Roadside fire extinguisher'); c.toast('“Very good, you are a responsible citizen.” The hawker and the officer shared a quiet nod.'); },
      },
      {
        label: () => '🤥 “It is in the boot, officer”',
        run: (c) => {
          if (c.roll() < 0.4) c.toast('He did not check. Pure confidence. 😎');
          else { const f = c.spend(c.ask * 3, 'Fine: “no extinguisher”'); c.toast(`He opened the boot. A bag of yam and a cutlass. ${n(f)} fine.`); }
        },
      },
      { label: () => '🙏🏾 Beg and tell him your life story', run: (c) => { c.delay(25, 4, -4); c.toast('He listened to all of it. Then still wrote you a ticket for “emotional misuse of the road”. 25 minutes gone.'); } },
    ],
  },
  {
    id: 'soldier', icon: '🪖', tag: 'MILITARY ROADBLOCK', weight: 2,
    lines: ['Civilian! You are very lucky. You will carry me to the barracks. Now.'],
    body: 'A soldier steps into the road with a plastic bag of suya in one hand. His boys look on, bored. This is not a request.',
    choices: [
      {
        label: () => '🚖 Give him the lift',
        run: (c) => {
          c.delay(25, 3, 0);
          if (c.roll() < 0.6) { c.win(Math.round(c.ask * 4), 'Soldier’s “appreciation”'); c.toast('He dashed you suya and a crisp note at the gate. “You are a patriot.” 🫡'); }
          else c.toast('He slept in the back, snored the whole way and said nothing at the gate. 25 minutes of your life gone.');
        },
      },
      { label: () => '😬 “Oga, my tyre dey flat”', run: (c) => { if (c.roll() < 0.5) c.toast('He kicked the tyre. It was fine. He still let you go, out of pity. 😮‍💨'); else { c.spend(c.ask * 2, 'Soldier’s “fine”'); c.toast('He did not believe you. Slap-free, but you paid for “wasting military time”.'); } } },
      { label: () => '💨 Floor it', run: (c) => c.classic('flee') },
    ],
  },
  {
    id: 'ram', icon: '🐏', tag: 'RAM ON THE ROAD', weight: 2,
    lines: ['Eh! Your front touched my ram! Do you know how much that ram cost?!'],
    body: 'A man in an agbada is dragging a very angry ram across the road. The ram, you suspect, has done this before.',
    choices: [
      { label: (a) => `💰 Pay for the “damage” · ${n(a * 2)}`, cost: (a) => a * 2, run: (c) => { c.spend(c.ask * 2, 'Ram “damages”'); c.toast('The ram looked completely fine. They both walked off smiling.'); } },
      { label: () => '🗣️ “That ram jumped on me!”', run: (c) => { if (c.roll() < 0.5) c.toast('A crowd gathered and sided with you. The ram lost the argument. 🐏'); else { c.delay(35, 0, -6); c.toast('Half the street came out to testify for the ram. 35 minutes of shouting.'); } } },
      { label: () => '😂 Honk. Ram charges.', run: (c) => { c.stall(8); c.fun(8); c.toast('The ram headbutted your door, then stood on your bonnet. You are stuck for a bit, but that is content.'); } },
    ],
  },
  {
    id: 'owambe', icon: '🥁', tag: 'OWAMBE CONVOY', weight: 2,
    lines: ['Stop! The bride says nobody passes until you dance!'],
    body: 'A wedding procession is blocking the whole road. Drummers, aso-ebi, a man spraying naira at a goat. All eyes are on you.',
    choices: [
      {
        label: () => '💃🏾 Dance for the bride',
        run: (c) => {
          c.delay(20, 0, 0); c.fun(22);
          if (c.roll() < 0.5) { c.win(Math.round(c.ask * 6), 'Owambe spray'); c.toast('They sprayed you! Notes stuck to your forehead. 🤑'); }
          else c.toast('You danced like a man with something to prove. They cheered, you sweated, the road opened.');
        },
      },
      { label: (a) => `💸 Pay the “road levy” · ${n(a)}`, cost: (a) => a, run: (c) => { c.spend(c.ask, 'Owambe road levy'); c.toast('A smiling aunty took it and wrote your name in the souvenir book. 📖'); } },
      { label: () => '📯 Honk and force your way', run: (c) => { c.notoriety(1); c.stall(7); c.toast('Wrong move. Forty guests surrounded the vehicle and gave you a stern lecture on respect.'); } },
    ],
  },
  {
    id: 'agbero', icon: '🧢', tag: 'PARK TOUTS', weight: 3,
    lines: ['Ticket! Ticket! Na park levy! Commot your money!'],
    body: 'Three lads with a rope, a rusted stool and one official-looking receipt book. This is not a recognized park. Nobody has told them.',
    choices: [
      { label: (a) => `🧾 Pay and take the receipt · ${n(Math.round(a / 2))}`, cost: (a) => Math.round(a / 2), run: (c) => { c.spend(Math.round(c.ask / 2), 'Park levy'); c.toast('The receipt says “GOD’S TIME LEVY”. Fair enough.'); } },
      { label: () => '😤 “Which park? I no dey park!”', run: (c) => { if (c.roll() < 0.5) c.toast('They saw your face and decided today was a day of mercy.'); else { const f = c.spend(c.ask, 'Touts “fine”'); c.toast(`They sat on your bonnet until you paid. ${n(f)} lighter.`); } } },
      { label: () => '💨 Drive through the rope', run: (c) => c.classic('flee') },
    ],
  },
  {
    id: 'fake', icon: '🪢', tag: 'SUSPICIOUS ROADBLOCK', weight: 2,
    lines: ['Park! Park! Official checkpoint, my friend!'],
    body: 'The officers are in mismatched uniforms. One has slippers. Their “gun” is a very convincing stick. Something is not right.',
    choices: [
      { label: (a) => `💵 Just pay · ${n(a)}`, cost: (a) => a, run: (c) => c.classic('pay') },
      { label: () => '🔍 “Show me your ID”', run: (c) => { if (c.roll() < 0.55) { c.fun(10); c.toast('They scattered in four directions. One left a slipper. You keep driving, feeling like a detective.'); } else { c.spend(c.ask * 2, 'Fake checkpoint “ID fee”'); c.toast('Their ID looked laminated by hand. You paid double to avoid more questions.'); } } },
      { label: () => '💨 Speed through the rope', run: (c) => { c.fun(6); c.toast('The rope snapped. Somebody fell. Somebody else is now chasing you on foot.'); } },
    ],
  },
  {
    id: 'convoy', icon: '🚨', tag: 'GOVERNOR’S CONVOY', weight: 2,
    lines: ['SIREN! Move! Governor dey pass! Everybody off the road!'],
    body: 'Fourteen black jeeps, two Hilux full of men with whips and a motorbike doing wheelies. The road empties like magic.',
    choices: [
      { label: () => '🙇🏾 Pull over and wait', run: (c) => { c.delay(20, 0, -4); c.toast('You waited 20 minutes. He passed. He did not wave.'); } },
      {
        label: () => '😈 Slip in behind the convoy',
        run: (c) => {
          if (c.roll() < 0.5) { c.fun(18); c.toast('You rode the convoy like a VIP. Every junction cleared itself. Best five minutes of your life. 😎'); }
          else { const f = c.spend(c.ask * 4, 'Convoy escort “fine”'); c.notoriety(1); c.toast(`A whip came through the window. ${n(f)} “for disrespecting the governor”.`); }
        },
      },
      { label: () => '📣 “Oga, I am late!” (shouting)', run: (c) => c.classic('argue') },
    ],
  },
  {
    id: 'mob', icon: '🏃🏾', tag: 'THIEF! THIEF!', weight: 2,
    lines: ['Barawo! Barawo! Oga, carry us chase am!'],
    body: 'A crowd is sprinting down the road after a man holding a bag of garri. The woman at the front points at your vehicle.',
    choices: [
      {
        label: () => '🚗 Help them chase',
        run: (c) => {
          c.delay(25, 4, 0);
          if (c.roll() < 0.55) { c.win(Math.round(c.ask * 5), 'Grateful trader'); c.fun(10); c.toast('You caught him. The trader kissed your hand and pressed some notes on you. Turns out he was her brother. 😅'); }
          else c.toast('He climbed a wall and disappeared into a compound. 25 minutes and a petrol-smell later, nothing.');
        },
      },
      { label: () => '🙅🏾 Stay out of it', run: (c) => c.toast('The crowd thundered past. You looked at your steering wheel for a while, in peace.') },
      { label: () => '😈 Join the mob', run: (c) => { c.notoriety(1); c.fun(8); c.delay(15, 3, 0); c.toast('You ran with the pack. Somebody gave you a stick. You are not sure why you have a stick now.'); } },
    ],
  },
  {
    id: 'prophet', icon: '🙌🏾', tag: 'ROADSIDE DELIVERANCE', weight: 2,
    lines: ['I SEE THE SPIRIT OF POVERTY ON YOUR VEHICLE! Come down and receive!'],
    body: 'A prophet in a white robe with a mic and a speaker the size of a fridge. Four assistants hold out buckets. The sermon is already live.',
    choices: [
      {
        label: (a) => `🌱 Sow a seed · ${n(a)}`, cost: (a) => a,
        run: (c) => {
          c.spend(c.ask, 'Seed offering');
          if (c.roll() < 0.3) { c.win(Math.round(c.ask * 6), 'Divine return'); c.toast('The Lord moved. Your seed multiplied. You are still processing it.'); }
          else c.toast('“Your breakthrough is on the way,” said the prophet. It’s been on the way for years.');
        },
      },
      { label: () => '🙏🏾 Say Amen and keep it moving', run: (c) => { c.delay(10, 0, 0); c.fun(5); c.toast('Seventeen Amens later you are free. Oddly refreshed.'); } },
      { label: () => '😅 Pretend your phone is ringing', run: (c) => { if (c.roll() < 0.6) c.toast('You answered “Hello? Network is bad.” and escaped.'); else { c.delay(15, 0, -3); c.toast('He prayed for your phone. And your network. And your future in-laws.'); } } },
    ],
  },
  {
    id: 'customs', icon: '🍚', tag: 'ANTI-SMUGGLING PATROL', weight: 2,
    lines: ['You dey smuggle rice! I fit smell am!'],
    body: 'Customs officers in camouflage and flip-flops are checking every vehicle. Everything smells suspiciously of ofada and ambition.',
    choices: [
      { label: () => '📦 “Search it, I have nothing”', run: (c) => { c.delay(20, 0, 0); if (c.roll() < 0.35) { const f = c.spend(c.ask * 2, 'Customs “duty”'); c.toast(`They “found” a bag of rice you swear you have never seen. ${n(f)} duty.`); } else c.toast('They found nothing, apologized to nobody and waved you off after 20 minutes.'); } },
      { label: (a) => `💵 Tip the officer · ${n(a)}`, cost: (a) => a, run: (c) => c.classic('pay') },
      { label: () => '🍚 Offer jollof from your lunch', run: (c) => { if (c.roll() < 0.6) { c.fun(12); c.toast('They ate it all. “This one is not smuggled. This one is love.” You’re free.'); } else c.toast('“This jollof has no pepper.” They took the whole pack and still wrote you a warning.'); } },
    ],
  },
  {
    id: 'contractor', icon: '🚧', tag: 'ROAD CONTRACTOR', weight: 2,
    lines: ['Government work in progress! Toll for the pothole we filled!'],
    body: 'A man holds a shovel, a single bucket of sand and an invoice. The “repaired” pothole is… a smaller pothole.',
    choices: [
      { label: (a) => `💵 Pay the toll · ${n(a)}`, cost: (a) => a, run: (c) => { c.spend(c.ask, 'Pothole “toll”'); c.toast('He gave you a receipt signed by “The Ministry”. It has a coffee stain on it.'); } },
      { label: () => '🧐 “Show me the contract”', run: (c) => { if (c.roll() < 0.5) c.toast('He pulled out a 2009 document. You pretended to read it. He pretended not to care. Pass.'); else { c.delay(20, 0, -3); c.toast('He read the whole contract out loud. Slowly. 20 minutes.'); } } },
      { label: () => '🌊 Drive around through the mud', run: (c) => { c.stall(9); c.fun(5); c.toast('Mud. Mud everywhere. A kind child pushes you out for free. He then asks for money.'); } },
    ],
  },
  {
    id: 'tow', icon: '🏗️', tag: 'TRAFFIC WARDEN', weight: 2,
    lines: ['You dey wrong park! We go tow you now now!'],
    body: 'Two wardens and an enormous, rusted tow truck. You are not parked. They have decided that you are.',
    choices: [
      { label: (a) => `💵 Settle quietly · ${n(a * 2)}`, cost: (a) => a * 2, run: (c) => { c.spend(c.ask * 2, 'Warden “settlement”'); c.toast('The tow truck sulked off. It wanted a bigger fish.'); } },
      { label: () => '⚖️ “Not parked, I am moving!”', run: (c) => c.classic('argue') },
      { label: () => '💨 Beat the truck to the junction', run: (c) => c.classic('flee') },
    ],
  },
];

/** A scene by weight, avoiding the last one shown so the same thing doesn't come up twice running. */
export function pickScene(avoid?: string): Scene {
  const pool = SCENES.filter((s) => s.id !== avoid);
  const total = pool.reduce((t, s) => t + s.weight, 0);
  let r = Math.random() * total;
  for (const s of pool) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return pool[0];
}

export const sceneById = (id: string) => SCENES.find((s) => s.id === id) ?? SCENES[0];
export const sceneLine = (s: Scene) => pick(s.lines);
