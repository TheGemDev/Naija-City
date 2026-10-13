// What you can do inside a place while one of Abuja's live events is on there (game/live.ts). Kaduna's are in
// LiveApps.tsx (PlaceEvents), which calls this with its own helpers so both read the same.

import { startDrive } from '../game/drive';
import type { LiveEventId } from '../game/live';
import { naira, useGame } from '../game/store';

type NeedDelta = Partial<Record<'hunger' | 'energy' | 'fun' | 'social' | 'hygiene', number>>;

export interface EventButton {
  icon: string;
  label: string;
  sub?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface Helpers {
  g: ReturnType<typeof useGame.getState>;
  /** Adds a button that works once per event. */
  once(b: { icon: string; label: string; sub: string; done: string; run: () => void | false }): void;
  needs(d: NeedDelta): void;
  pick<T>(xs: T[]): T;
}

const rand = (min: number, span: number) => min + Math.floor(Math.random() * span);
/** A little heat for the shadier outcomes. */
const heat = (by: number) => useGame.setState((s) => ({ notoriety: s.notoriety + by }));

/** One-off buttons are added through `once`; anything returned is an ordinary button. */
export function abujaEventButtons(insideId: string, event: LiveEventId, { g, once, needs, pick }: Helpers): EventButton[] {
  const more: EventButton[] = [];

  if (insideId === 'murtala' && event === 'inauguration') {
    once({
      icon: '🇳🇬', label: 'Slip into the VIP stand', sub: 'Walk like you own a ministry', done: 'You already tried your luck',
      run: () => {
        const r = Math.random();
        if (r < 0.3) {
          needs({ energy: -15, fun: -10 });
          g.toast('🪖 A Brigade of Guards soldier lifted you by the collar and placed you outside the gate like a flower pot.');
        } else if (r < 0.75) {
          needs({ hunger: 45, social: 30, fun: 20 });
          g.toast('🥂 Nobody asked a question. You ate small chops beside two governors and clapped at the wrong time.');
        } else {
          needs({ social: 35, fun: 25 });
          const got = g.earn('luck', rand(15_000, 20_000), 'Transport money at the swearing-in');
          g.toast(`🧧 A protocol officer thought you were a traditional ruler’s son and handed you “transport”: ${naira(got)}.`);
        }
      },
    });
  }

  if (insideId === 'murtala' && event === 'delegates') {
    once({
      icon: '💵', label: 'Tie a delegate tag and queue', sub: 'Three aspirants. Three envelopes. Maybe', done: 'You have already been “mobilised”',
      run: () => {
        const r = Math.random();
        if (r < 0.2) {
          const fine = g.charge(Math.min(10_000, Math.max(0, Math.floor(g.money))), '“Fake delegate” settlement');
          needs({ fun: -10 });
          g.toast(`🕵🏾 The real delegate from your ward arrived. Party thugs collected ${naira(fine)} and your tag.`);
        } else if (r < 0.7) {
          const got = g.earn('luck', rand(8_000, 12_000), 'Delegate envelope');
          g.toast(`✉️ One envelope: ${naira(got)}. You promised your vote to the aspirant with all your chest.`);
        } else {
          const got = g.earn('luck', rand(30_000, 20_000), 'Three delegate envelopes');
          heat(1);
          g.toast(`💵 You collected from ALL THREE aspirants and voted for none of them. ${naira(got)}. This is what they call a statesman.`);
        }
      },
    });
  }

  if (insideId === 'murtala' && event === 'carnival') {
    once({
      icon: '🎭', label: 'Join a carnival float', sub: 'Feathers, drums and one angry masquerade', done: 'You already paraded',
      run: () => {
        if (Math.random() < 0.25) {
          needs({ energy: -20, fun: 10 });
          g.toast('🎭 The masquerade did not like your dancing. It flogged you from Eagle Square to the Secretariat gate.');
        } else {
          needs({ fun: 40, social: 30, energy: -15, hygiene: -10 });
          const got = g.earn('luck', rand(2_000, 6_000), 'Sprayed on a carnival float');
          g.toast(`🪶 ${pick(['Calabar feathers', 'Tiv black-and-white', 'An Eyo hat', 'Atilogwu drummers'])} and you on top of a trailer. The crowd sprayed ${naira(got)}.`);
        }
      },
    });
  }

  if (insideId === 'lugard' && event === 'mace') {
    once({
      icon: '🏃🏾', label: 'Chase the mace thief', sub: 'The Senate cannot sit without it', done: 'You already ran',
      run: () => {
        const r = Math.random();
        if (r < 0.4) {
          needs({ energy: -25, fun: 10 });
          g.toast('🏃🏾 He jumped the fence into a waiting Hilux. You jumped the fence into a flower bed.');
        } else if (r < 0.85) {
          needs({ energy: -20, fun: 30, social: 20 });
          const got = g.earn('luck', rand(15_000, 15_000), 'Reward for returning the mace');
          g.toast(`🏆 You tackled him by the fountain and carried the mace back into plenary. Standing ovation and ${naira(got)}.`);
        } else {
          needs({ fun: 35 });
          heat(2);
          const got = g.earn('luck', 40_000, 'A senator paid you to keep the mace missing');
          g.toast(`🤫 You caught him. Then a senator whispered: “Let it be missing till Thursday.” ${naira(got)}. The bill did not pass.`);
        }
      },
    });
  }

  if (insideId === 'secretariat' && event === 'snake') {
    once({
      icon: '🐍', label: 'Hunt the money-swallowing snake', sub: 'Check under the cabinets. Carefully', done: 'You already searched',
      run: () => {
        const r = Math.random();
        if (r < 0.25) {
          needs({ energy: -20, fun: -10 });
          g.toast('🐍 You found A snake. Not THE snake. It had no money and it bit your shoe. You left by the window.');
        } else if (r < 0.75) {
          needs({ fun: 20 });
          const got = g.earn('luck', rand(3_000, 9_000), 'Loose notes behind the filing cabinet');
          g.toast(`🗄️ No snake. But behind the cabinet: ${naira(got)} in old notes and a receipt for a Lexus. You took only the notes.`);
        } else {
          needs({ fun: 30, social: 20 });
          const got = g.earn('luck', rand(25_000, 20_000), 'Hush money from the accounts department');
          heat(1);
          g.toast(`🤐 You opened the wrong drawer and found the ₦36 million sitting quietly. The clerk paid you ${naira(got)} to agree it was a snake.`);
        }
      },
    });
  }

  if (insideId === 'market' && event === 'taskforce') {
    once({
      icon: '🚜', label: 'Buy panic-sale goods and flip them', sub: 'Pay ₦15k now. Task force may seize it', done: 'You already traded',
      run: () => {
        if (g.money < 15_000) { g.toast('🧺 You need ₦15,000 to buy from the running traders.'); return false; }
        g.charge(15_000, 'Panic-sale goods at Wuse Market');
        if (Math.random() < 0.65) {
          const got = g.earn('luck', rand(24_000, 14_000), 'Flipped Wuse Market goods');
          g.toast(`🧺 Six lace materials for the price of one. You sold them in Garki before evening. ${naira(got - 15_000)} profit.`);
        } else {
          needs({ fun: -12, energy: -10 });
          g.toast('🚜 The task force caught you at the gate and threw everything into the lorry. “Come to Area 10 with receipt.” There is no receipt.');
        }
      },
    });
    more.push({
      icon: '🧕🏾', label: 'Help a trader carry her shop', sub: 'She will remember you',
      onClick: () => {
        needs({ energy: -12, social: 15 });
        g.toast(pick(['🧺 You ran with a tray of tomatoes on your head. You lost four. She forgave you.', '🧵 You saved a whole sewing machine. She has promised you free amendment for life.', '📱 You carried a showcase of phones to safety. All of them were dummy phones.']));
      },
    });
  }

  if (insideId === 'villa' && event === 'jubril') {
    once({
      icon: '🕴🏾', label: 'Check the President’s ears', sub: 'Get close enough to compare', done: 'You have seen what you have seen',
      run: () => {
        const r = Math.random();
        if (r < 0.3) {
          needs({ energy: -20, fun: -5 });
          g.toast('🕶️ The DSS asked what you were measuring. You said “nothing”. You did frog jump from the gate to the roundabout.');
        } else if (r < 0.7) {
          needs({ fun: 30, social: 20 });
          g.toast('👂🏾 He waved. You looked at the ears. Left one: correct. Right one: …you are not sure. You will never be sure again.');
        } else {
          needs({ fun: 25, social: 25 });
          const got = g.earn('luck', rand(8_000, 12_000), 'Sold “the ear photo” to a blog');
          g.toast(`📸 Your zoomed photo of the ear is on every blog as “PROOF”. Of what, nobody agrees. They paid ${naira(got)}.`);
        }
      },
    });
  }

  if (insideId === 'river' && event === 'regatta') {
    once({
      icon: '🚤', label: 'Bet ₦5k on a canoe', sub: 'Fishermen vs senators’ sons', done: 'Your bet is already settled',
      run: () => {
        if (g.money < 5_000) { g.toast('🚤 You need ₦5,000 to bet at the lakeside.'); return false; }
        g.charge(5_000, 'Regatta bet at Jabi Lake');
        if (Math.random() < 0.5) {
          const got = g.earn('luck', 11_000, 'Won a regatta bet');
          needs({ fun: 25 });
          g.toast(`🛶 The fishermen’s canoe won by a full boat. The speedboats forgot to buy fuel. You collected ${naira(got)}.`);
        } else {
          needs({ fun: -8 });
          g.toast('🛶 Your canoe was leading until the paddler stopped to answer his phone. “Hello? I’m in a race.”');
        }
      },
    });
    more.push({
      icon: '🌊', label: 'Paddle in the open race', sub: 'Wet, tiring, glorious',
      onClick: () => {
        needs({ fun: 22, social: 12, energy: -18, hygiene: -12 });
        g.toast(pick(['🛶 You came ninth of ten. The tenth canoe sank.', '🛶 You paddled in a perfect circle for six minutes. The crowd loved it.', '🛶 Third place! A fisherman gave you a live catfish as your medal.']));
      },
    });
  }

  if (insideId === 'stadium' && event === 'eagles') {
    once({
      icon: '🦅', label: 'Get on the pitch for a selfie', sub: 'Stewards are slow. Probably', done: 'You already invaded',
      run: () => {
        const r = Math.random();
        if (r < 0.3) {
          needs({ energy: -18, fun: 8 });
          g.toast('🦺 Four stewards carried you off by the arms and legs. The whole stand sang “Oleeee!” for you.');
        } else if (r < 0.8) {
          needs({ fun: 40, social: 30 });
          g.toast('🤳 Selfie with the captain! He signed your shirt, your arm and, by mistake, your NIN slip.');
        } else {
          needs({ fun: 35, social: 20 });
          const got = g.earn('luck', rand(10_000, 10_000), 'Sold a match-worn Super Eagles jersey');
          g.toast(`👕 The goalkeeper threw his jersey into the stand and you caught it with your face. A collector paid ${naira(got)} at the gate.`);
        }
      },
    });
  }

  if (insideId === 'pitch' && event === 'palliative') {
    once({
      icon: '🍚', label: 'Carry your own bag of rice', sub: 'Everybody is carrying. Stampede risk', done: 'You have carried your share',
      run: () => {
        const r = Math.random();
        if (r < 0.25) {
          needs({ energy: -25, hygiene: -20, fun: -8 });
          g.toast('🥴 The crowd surged. You came out with one slipper, no rice, and somebody else’s cap.');
        } else if (r < 0.8) {
          needs({ hunger: 60, fun: 15, energy: -12 });
          g.toast('🍚 A 10kg bag stamped “NOT FOR SALE – COVID 2020”. It is still good. Probably. You have eaten.');
        } else {
          needs({ energy: -15 });
          const got = g.earn('luck', rand(12_000, 10_000), 'Sold palliative Indomie by the roadside');
          heat(1);
          g.toast(`🍜 You came out with six cartons of Indomie and sold five at the junction for ${naira(got)}.`);
        }
      },
    });
  }

  if (insideId === 'polo' && event === 'polocup') more.push({ icon: '🎩', label: 'Admire the convoys outside', sub: 'Count the generals', onClick: () => { needs({ fun: 8, social: 8 }); g.toast('🚙 Forty-one black SUVs, engines running, ACs on, nobody inside. Fuel scarcity is for other people.'); } });
  if (insideId === 'murtala' && event === 'carnival') more.push({ icon: '🐎', label: 'Ride in the carnival durbar', sub: 'Borrow a horse from the Kano contingent', onClick: () => startDrive('horse') });

  return more;
}
