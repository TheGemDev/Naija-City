// What you can do inside a place while one of Lagos's live events is on there (game/live.ts). Kaduna's are in
// LiveApps.tsx (PlaceEvents) and Abuja's in AbujaEvents.ts; PlaceEvents calls this with the same helpers.

import type { LiveEventId } from '../game/live';
import { naira, useGame } from '../game/store';
import type { abujaEventButtons, EventButton } from './AbujaEvents';

type Helpers = Parameters<typeof abujaEventButtons>[2];

const rand = (min: number, span: number) => min + Math.floor(Math.random() * span);
/** A little heat for the shadier outcomes. */
const heat = (by: number) => useGame.setState((s) => ({ notoriety: s.notoriety + by }));

/** One-off buttons are added through `once`; anything returned is an ordinary button. */
export function lagosEventButtons(insideId: string, event: LiveEventId, { g, once, needs, pick }: Helpers): EventButton[] {
  const more: EventButton[] = [];

  if (insideId === 'murtala' && event === 'eyo') {
    once({
      icon: '🎭', label: 'Follow the Eyo procession', sub: 'Shoes off. Cap off. Do not test them', done: 'You have already followed the Eyo',
      run: () => {
        const r = Math.random();
        if (r < 0.25) {
          needs({ energy: -18, fun: 6 });
          g.toast('🪄 You forgot your cap was on. An Eyo touched you three times with the opambata. Lagos Island says that is a blessing. Your shoulder disagrees.');
        } else if (r < 0.8) {
          needs({ fun: 38, social: 30, energy: -10 });
          g.toast(pick(['🎭 You walked barefoot behind the Eyo Adimu from Idumota to TBS. You have been prayed for in a voice from another world.', '🎭 White robes as far as you can see. One Eyo bowed to you. You bowed lower, just in case.', '🥁 The drums took you. You do not remember the last twenty minutes but your legs do.']));
        } else {
          needs({ fun: 30, social: 25 });
          const got = g.earn('luck', rand(8_000, 12_000), 'Sold Eyo festival photographs');
          g.toast(`📸 A tourist with a very long lens paid ${naira(got)} for the picture you took with your cracked phone.`);
        }
      },
    });
    more.push({
      icon: '🧢', label: 'Sell “official” Eyo hats', sub: 'They are from Balogun. Nobody needs to know',
      onClick: () => {
        needs({ energy: -8, social: 12 });
        const got = g.earn('luck', rand(1_500, 3_500), 'Sold festival hats at TBS');
        g.toast(`🧢 You sold six hats to IJGBs at tourist price. ${naira(got)}.`);
      },
    });
  }

  if (insideId === 'hamdala' && event === 'detty') {
    once({
      icon: '🎤', label: 'Enter the concert without a ticket', sub: 'Carry a speaker and walk like crew', done: 'You already tried the gate',
      run: () => {
        const r = Math.random();
        if (r < 0.3) {
          needs({ energy: -15, fun: -10 });
          g.toast('🦺 The bouncer lifted you and the speaker together and put both of you outside. The speaker was not even plugged to anything.');
        } else if (r < 0.8) {
          needs({ fun: 45, social: 35, energy: -12 });
          g.toast('🎶 Nobody stops a man carrying a speaker. You watched from beside the stage and the headliner dapped you by mistake.');
        } else {
          needs({ fun: 40, social: 40 });
          const got = g.earn('luck', rand(20_000, 25_000), 'Sprayed on stage at a December concert');
          g.toast(`🕺🏾 They pulled you on stage for the dance challenge. You did legwork until an IJGB uncle sprayed you ${naira(got)}.`);
        }
      },
    });
    once({
      icon: '🎟️', label: 'Resell a ticket outside · pay ₦20k', sub: 'Buy from a tout, sell to an IJGB', done: 'You have done your ticket business',
      run: () => {
        if (g.money < 20_000) { g.toast('🎟️ You need ₦20,000 to buy a ticket off the tout.'); return false; }
        g.charge(20_000, 'Concert ticket from a tout');
        if (Math.random() < 0.6) {
          const got = g.earn('luck', rand(32_000, 18_000), 'Resold a December concert ticket');
          g.toast(`💷 A man who landed from London this morning paid in pounds without asking the rate. ${naira(got - 20_000)} profit.`);
        } else {
          needs({ fun: -12 });
          g.toast('🎟️ The ticket was a photocopy of a photocopy. The scanner laughed. The tout has entered a bike.');
        }
      },
    });
  }

  if (insideId === 'club' && event === 'felabration') {
    once({
      icon: '🎷', label: 'Jump on stage with the band', sub: 'Shekere, sax, or just your waist', done: 'You have had your solo',
      run: () => {
        const r = Math.random();
        if (r < 0.25) {
          needs({ fun: 8, energy: -10 });
          g.toast('🎺 You blew one note on a borrowed trumpet. The whole Shrine turned round. The band leader took it back gently, like from a child.');
        } else if (r < 0.8) {
          needs({ fun: 45, social: 35, energy: -15 });
          g.toast(pick(['🎷 You held the shekere for a full twenty-minute song. Your arm is finished. You are now Afrobeat.', '💃🏾 You danced beside the queens on stage. They were kind enough not to look at you.', '🎶 “Everybody say yeah yeah!” You said it loudest. Abami Eda would be proud.']));
        } else {
          needs({ fun: 40, social: 35 });
          const got = g.earn('luck', rand(10_000, 15_000), 'Sprayed at Felabration');
          g.toast(`🎷 Your yabis about NEPA got the biggest cheer of the night. The crowd sprayed ${naira(got)} on your forehead.`);
        }
      },
    });
  }

  if (insideId === 'motorpark' && event === 'tanker') {
    once({
      icon: '🛢️', label: 'Scoop fuel with a keg', sub: 'Free petrol. Everybody knows how this ends', done: 'You have scooped enough for one lifetime',
      run: () => {
        const r = Math.random();
        if (r < 0.35) {
          needs({ energy: -25, hygiene: -30, fun: -15 });
          g.toast('🔥 Somebody’s phone rang. Everybody ran. You left your keg, one slipper and your eyebrows on the expressway.');
        } else if (r < 0.8) {
          needs({ hygiene: -25, energy: -12 });
          const got = g.earn('luck', rand(9_000, 9_000), 'Sold scooped fuel by the roadside');
          heat(1);
          g.toast(`⛽ Two kegs, sold to a danfo driver before the fire service arrived. ${naira(got)}. You smell like a filling station.`);
        } else {
          const fine = g.charge(Math.min(15_000, Math.max(0, Math.floor(g.money))), 'LASTMA “obstruction” fine');
          needs({ fun: -10, hygiene: -15 });
          heat(1);
          g.toast(`🚔 LASTMA caught you with the keg and charged you for “obstructing an accident”. ${naira(fine)}.`);
        }
      },
    });
    more.push({
      icon: '🚐', label: 'Direct the traffic yourself', sub: 'Nobody asked you. Do it anyway',
      onClick: () => {
        needs({ energy: -12, social: 16, fun: 8 });
        const got = g.earn('luck', rand(500, 2_500), 'Tips for directing traffic at Oshodi');
        g.toast(pick([`🧤 You stood in the junction waving a branch. It worked. Drivers dashed you ${naira(got)}.`, `🧤 Forty danfos obeyed you for ten minutes. A LASTMA man watched, impressed and jealous. ${naira(got)} in tips.`]));
      },
    });
  }

  if (insideId === 'boutique' && event === 'lekkiflood') {
    once({
      icon: '🛶', label: 'Ferry people across in a canoe', sub: '₦2,000 a head. This is Lekki', done: 'Your canoe business has closed',
      run: () => {
        const r = Math.random();
        if (r < 0.2) {
          needs({ hygiene: -30, energy: -15, fun: -8 });
          g.toast('🛶 The canoe turned over outside a lounge. Your passengers swam to a Range Rover roof and are asking for refund.');
        } else {
          needs({ energy: -18, hygiene: -12, social: 15 });
          const got = g.earn('luck', rand(12_000, 16_000), 'Canoe fares on Admiralty Way');
          g.toast(`🛶 Nine trips from the roundabout to the estate gate. A man in a suit paid extra not to be photographed. ${naira(got)}.`);
        }
      },
    });
    more.push({
      icon: '🧍🏾', label: 'Carry a big man on your back', sub: 'His shoes cost more than the car',
      onClick: () => {
        needs({ energy: -15, hygiene: -10 });
        const got = g.earn('luck', rand(1_000, 3_000), 'Carried a man through the Lekki flood');
        g.toast(pick([`👞 You carried him through water up to your waist. He held his loafers above his head the whole way. ${naira(got)}.`, `👞 Halfway across he took a phone call. “I’m in a meeting.” ${naira(got)}.`]));
      },
    });
  }

  if (insideId === 'stadium' && event === 'marathon') {
    once({
      icon: '🏃🏾', label: 'Join the marathon', sub: '42 kilometres. You trained for none of them', done: 'Your legs have retired',
      run: () => {
        const r = Math.random();
        if (r < 0.45) {
          needs({ energy: -30, hygiene: -20, fun: 10 });
          g.toast('🥵 You started fast for the cameras and stopped at kilometre three, by a woman selling pure water. You have a medal for “participation”.');
        } else if (r < 0.9) {
          needs({ energy: -35, hygiene: -25, fun: 30, social: 25 });
          const got = g.earn('luck', rand(5_000, 8_000), 'Finisher’s prize at the Lagos City Marathon');
          g.toast(`🏅 You crossed Third Mainland Bridge on foot and finished. A bank gave every finisher a towel and ${naira(got)}.`);
        } else {
          needs({ energy: -20, fun: 35, social: 30 });
          heat(1);
          const got = g.earn('luck', rand(30_000, 20_000), 'Prize money at the Lagos City Marathon');
          g.toast(`🏍️ You entered an okada at kilometre five and came down at kilometre forty. Third Nigerian home. ${naira(got)}. Nobody has checked the tape yet.`);
        }
      },
    });
    more.push({
      icon: '💧', label: 'Sell pure water to the runners', sub: 'They cannot price it while running',
      onClick: () => {
        needs({ energy: -10, social: 10 });
        const got = g.earn('luck', rand(1_500, 3_000), 'Sold water along the marathon route');
        g.toast(`💧 Two bags gone in ten minutes. One Kenyan took a sachet without slowing down. ${naira(got)}.`);
      },
    });
  }

  if (insideId === 'techhub' && event === 'techweek') {
    once({
      icon: '🦄', label: 'Pitch the investors', sub: '“It is like Uber, but for…”', done: 'You have already pitched',
      run: () => {
        const r = Math.random();
        if (r < 0.35) {
          needs({ fun: -8, social: 6 });
          g.toast('📉 They asked for your “unit economics”. You said “very soon”. They gave you a sticker and a tote bag.');
        } else if (r < 0.85) {
          needs({ fun: 22, social: 30 });
          const got = g.earn('luck', rand(10_000, 15_000), 'Pitch competition runner-up');
          g.toast(`🎤 “Uber for generator fuel.” Second place. A cheque the size of a door, worth ${naira(got)}.`);
        } else {
          needs({ fun: 35, social: 35 });
          const got = g.earn('luck', rand(40_000, 30_000), 'Pre-seed “bridge” from a foreign angel');
          g.toast(`🦄 A man in a fleece vest said “I love the energy” and sent ${naira(got)} before you finished slide two. You do not have a slide three.`);
        }
      },
    });
    more.push({
      icon: '🍕', label: 'Eat the free investor pizza', sub: 'The real reason anyone is here',
      onClick: () => {
        needs({ hunger: 45, social: 12, fun: 8 });
        g.toast(pick(['🍕 Six slices and two “networking” conversations where you only nodded.', '🍕 You ate standing beside a unicorn founder. He was also only there for the pizza.']));
      },
    });
  }

  if (insideId === 'poly' && event === 'aluta') {
    once({
      icon: '✊🏾', label: 'Climb the gate and address the students', sub: '“Greatest Akokites!”', done: 'You have already spoken',
      run: () => {
        const r = Math.random();
        if (r < 0.25) {
          needs({ energy: -20, hygiene: -10, fun: -5 });
          g.toast('💨 Teargas. You came down from the gate faster than you went up and ran as far as Yaba bus stop.');
        } else if (r < 0.85) {
          needs({ social: 38, fun: 25, energy: -10 });
          g.toast('✊🏾 “Greatest Akokites!” “GREAT!” You shouted for ten minutes and said nothing. They have made you PRO of the struggle.');
        } else {
          needs({ social: 30, fun: 20 });
          heat(1);
          const got = g.earn('luck', rand(15_000, 15_000), 'Envelope from the school management');
          g.toast(`✉️ A man from the Senate building called you aside: “Tell them to go to class.” ${naira(got)}. You told them. They did not go.`);
        }
      },
    });
  }

  if (insideId === 'secretariat' && event === 'landgrab') {
    once({
      icon: '🪧', label: 'Negotiate with the omo onile', sub: 'They want foundation money, roofing money and fencing money', done: 'You have already settled them',
      run: () => {
        const r = Math.random();
        if (r < 0.3) {
          const fine = g.charge(Math.min(8_000, Math.max(0, Math.floor(g.money))), 'Omo onile “signing fee”');
          needs({ fun: -8 });
          g.toast(`🧾 You are not buying anything and you still paid ${naira(fine)} “signing fee” to be allowed to leave.`);
        } else if (r < 0.8) {
          needs({ social: 20, fun: 18 });
          const got = g.earn('luck', rand(8_000, 10_000), 'Mediation fee from the Lands Bureau');
          g.toast(`🤝 You spoke Yoruba, shared kola and got them to move the fence back one metre. The Lands Bureau paid you ${naira(got)} “for logistics”.`);
        } else {
          needs({ fun: 25 });
          heat(2);
          const got = g.earn('luck', rand(25_000, 20_000), 'Sold a plot inside the Secretariat car park');
          g.toast(`📜 You joined them. You sold the Commissioner’s parking space to a man from Canada, with receipt and survey plan. ${naira(got)}.`);
        }
      },
    });
  }

  if (insideId === 'airport' && event === 'japa') {
    once({
      icon: '🧳', label: 'Carry Ghana-must-go for a family', sub: 'Six bags, all overweight', done: 'You have carried enough load',
      run: () => {
        const r = Math.random();
        if (r < 0.2) {
          needs({ energy: -20, fun: -8 });
          g.toast('🧳 The bag burst at check-in. Stockfish, ogbono and four tubers of yam on the departure hall floor. Somehow it is your fault.');
        } else {
          needs({ energy: -18, social: 15 });
          const got = g.earn('luck', rand(6_000, 10_000), 'Tips from a relocating family');
          g.toast(`✈️ You pushed three trolleys and prayed with the grandmother. The father tipped you ${naira(got)} in notes he will not need again.`);
        }
      },
    });
    more.push({
      icon: '🧥', label: 'Sell “Canada jackets” at departures', sub: 'It is 33 degrees. They are buying',
      onClick: () => {
        needs({ energy: -8, social: 10 });
        const got = g.earn('luck', rand(2_000, 4_000), 'Sold winter jackets at MMIA');
        g.toast(pick([`🧥 “It is minus twenty in Winnipeg.” You have never been to Winnipeg. ${naira(got)}.`, `🧥 Okrika puffer jackets at boutique price. One man wore his immediately and nearly fainted. ${naira(got)}.`]));
      },
    });
  }

  return more;
}
