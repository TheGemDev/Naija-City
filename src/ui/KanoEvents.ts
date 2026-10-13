// What you can do inside a place while one of Kano's live events is on there (game/live.ts). Kaduna's are in
// LiveApps.tsx (PlaceEvents), Abuja's in AbujaEvents.ts and Lagos's in LagosEvents.ts; PlaceEvents calls this with
// the same helpers. The events Kano shares with Kaduna (the Durbar, dambe, the ram fair) use Kaduna's buttons.

import type { LiveEventId } from '../game/live';
import { naira, useGame } from '../game/store';
import type { abujaEventButtons, EventButton } from './AbujaEvents';

type Helpers = Parameters<typeof abujaEventButtons>[2];

const rand = (min: number, span: number) => min + Math.floor(Math.random() * span);
/** A little heat for the shadier outcomes. */
const heat = (by: number) => useGame.setState((s) => ({ notoriety: s.notoriety + by }));

/** One-off buttons are added through `once`; anything returned is an ordinary button. */
export function kanoEventButtons(insideId: string, event: LiveEventId, { g, once, needs, pick }: Helpers): EventButton[] {
  const more: EventButton[] = [];

  if (insideId === 'club' && event === 'hisbah') {
    once({
      icon: '🚜', label: 'Watch the bulldozer crush the bottles', sub: 'Forty thousand of them, in rows', done: 'You have seen enough broken glass',
      run: () => {
        const r = Math.random();
        if (r < 0.2) {
          needs({ hygiene: -25, fun: 8 });
          g.toast('🍺 You stood too close. The first row burst and now you smell like the thing they are destroying. Three Hisbah men are looking at you.');
        } else if (r < 0.8) {
          needs({ fun: 34, social: 28 });
          g.toast(pick(['🚜 The bulldozer went over them like a man walking on groundnut shells. A whole street of Sabon Gari sighed at once.', '📣 The commander gave a speech. The bulldozer driver gave a thumbs-up. A bar owner at the back gave up.', '🫧 A river of foam ran down to the gutter. Somebody’s goat is drinking from it and nobody has the heart to stop it.']));
        } else {
          needs({ fun: 30, social: 22 });
          const got = g.earn('luck', rand(6_000, 9_000), 'Sold footage of the Hisbah bulldozer');
          g.toast(`📱 Your video of the bulldozer went everywhere. A blog paid ${naira(got)} and spelt your name wrong.`);
        }
      },
    });
    once({
      icon: '📦', label: 'Help the bar owner hide a crate', sub: 'Under the bench, behind the gen', done: 'You have done your smuggling for today',
      run: () => {
        if (Math.random() < 0.35) {
          heat(2);
          const fine = g.charge(Math.min(12_000, Math.max(0, Math.floor(g.money))), 'Fine for hiding alcohol from Hisbah');
          needs({ fun: -12 });
          g.toast(`🧕🏾 A Hisbah officer lifted the bench with one hand. ${naira(fine)} fine and a forty-minute lecture you will remember all your life.`);
        } else {
          heat(1);
          const got = g.earn('luck', rand(10_000, 12_000), 'Thank-you money from a Sabon Gari bar owner');
          g.toast(`🤫 The crate survived inside a drum of palm oil. The owner pressed ${naira(got)} into your hand and said your name will never pay for a drink here.`);
        }
      },
    });
    more.push({
      icon: '🧃', label: 'Sell cold zobo to the crowd', sub: 'The only drink nobody is confiscating',
      onClick: () => {
        needs({ energy: -8, social: 12 });
        const got = g.earn('luck', rand(1_500, 3_000), 'Sold zobo outside a Hisbah raid');
        g.toast(`🧃 Thirsty work, watching destruction. ${naira(got)}, and one officer bought two.`);
      },
    });
  }

  if (insideId === 'murtala' && event === 'aure') {
    once({
      icon: '💍', label: 'Stand as wakili for a groom', sub: 'His uncle did not come. You have a clean cap', done: 'You have already given somebody away',
      run: () => {
        const r = Math.random();
        if (r < 0.2) {
          needs({ fun: -8, social: 10 });
          g.toast('😳 They read the names and you answered for the wrong groom. For four minutes a woman from Gwale was nearly your in-law.');
        } else if (r < 0.75) {
          needs({ social: 38, fun: 24 });
          g.toast(pick(['🤲🏾 You said “na karba” on behalf of a man you met eleven minutes ago. His mother has added you to the family WhatsApp group.', '💍 Fatiha read, kola shared. One thousand eight hundred couples and you personally shook hands with sixty of them.']));
        } else {
          needs({ social: 34, fun: 20 });
          const got = g.earn('luck', rand(8_000, 10_000), 'Goro money from a grateful groom');
          g.toast(`🥜 The groom’s people thanked you with a bag of kola and ${naira(got)} “for your transport”.`);
        }
      },
    });
    once({
      icon: '🛏️', label: 'Carry mattresses for the new brides', sub: 'The state gave each couple a bed. Somebody must move them', done: 'Your back says no more mattresses',
      run: () => {
        needs({ energy: -20, social: 14 });
        const got = g.earn('luck', rand(5_000, 6_000), 'Carried wedding furniture at the mass wedding');
        g.toast(`🛏️ Forty mattresses from the trailer to the ground. A commissioner counted them twice, then paid you ${naira(got)}.`);
      },
    });
    more.push({
      icon: '🍚', label: 'Join the wedding feast', sub: 'Jollof, fried meat and zobo for six thousand',
      onClick: () => {
        needs({ hunger: 45, social: 18, fun: 10 });
        g.toast(pick(['🍚 You sat on a mat with eleven strangers round one tray. Nobody asked whose side you were on.', '🍗 The meat reached your tray last and still there was enough. Kano does not joke with walima.']));
      },
    });
  }

  if (insideId === 'mall' && event === 'kannywood') {
    once({
      icon: '🎬', label: 'Walk the red carpet like a star', sub: 'Dark glasses. Slow steps. Wave at nobody', done: 'The carpet has seen you already',
      run: () => {
        const r = Math.random();
        if (r < 0.3) {
          needs({ fun: -10, energy: -6 });
          g.toast('🚫 A bouncer asked which film you were in. You said “the next one”. He escorted you to the popcorn queue.');
        } else if (r < 0.8) {
          needs({ fun: 40, social: 36 });
          g.toast(pick(['📸 Four photographers shouted “Yaya! Yaya! Look here!” You looked. You are in tomorrow’s paper as “and a guest”.', '🤳🏾 Nine people took selfies with you before anybody asked your name. You signed an autograph as “Ali”.']));
        } else {
          needs({ fun: 36, social: 40 });
          const got = g.earn('luck', rand(15_000, 15_000), 'Paid as an extra in a Kannywood film');
          g.toast(`🎥 A director liked your walk. Two days as “Rich Man’s Driver No. 2” in his next film: ${naira(got)} and a line. The line is “Yes, sir.”`);
        }
      },
    });
    more.push({
      icon: '💿', label: 'Sell film posters outside', sub: 'Signed. By you, but signed',
      onClick: () => {
        needs({ energy: -8, social: 10 });
        heat(1);
        const got = g.earn('luck', rand(2_000, 3_500), 'Sold “signed” film posters');
        g.toast(`🖊️ You signed twenty posters with a star’s name and a steady hand. ${naira(got)}.`);
      },
    });
  }

  if (insideId === 'airport' && event === 'harmattan') {
    once({
      icon: '🧴', label: 'Sell Vaseline and face masks at arrivals', sub: 'Every lip in this hall is cracked', done: 'You have sold out',
      run: () => {
        needs({ energy: -8, hygiene: -8 });
        const got = g.earn('luck', rand(5_000, 7_000), 'Sold Vaseline in the harmattan');
        g.toast(`🧴 A man from Port Harcourt bought four tubs and asked if the sky is always this colour. ${naira(got)}.`);
      },
    });
    once({
      icon: '🛬', label: 'Guide a lost taxi to the terminal', sub: 'You cannot see the terminal either', done: 'You have done enough guiding',
      run: () => {
        if (Math.random() < 0.3) {
          needs({ energy: -15, hygiene: -20, fun: -6 });
          g.toast('🌫️ You walked ahead of the taxi for ten minutes and delivered both of you to the cargo shed. Your eyebrows are now white.');
        } else {
          needs({ energy: -10, hygiene: -12, social: 12 });
          const got = g.earn('luck', rand(3_000, 4_000), 'Guided a taxi through the haze');
          g.toast(`🚕 You found the terminal by the smell of suya at the gate. The passenger made his flight, which was delayed anyway. ${naira(got)}.`);
        }
      },
    });
  }

  if (insideId === 'station' && event === 'pyramids') {
    once({
      icon: '🥜', label: 'Load groundnut sacks onto the train', sub: 'Paid by the sack. The sacks are 100 kilos', done: 'Your shoulders have closed for the day',
      run: () => {
        const r = Math.random();
        if (r < 0.2) {
          needs({ energy: -35, hygiene: -15 });
          g.toast('🥵 You carried two sacks, sat on the third and were found asleep on it by the foreman. He paid you in groundnuts.');
        } else {
          needs({ energy: -28, hygiene: -15, social: 10 });
          const got = g.earn('luck', rand(9_000, 9_000), 'Loaded the groundnut train');
          g.toast(`🚂 Thirty sacks up the plank. The old loaders sang the whole time and never once breathed hard. ${naira(got)}.`);
        }
      },
    });
    once({
      icon: '🧺', label: 'Buy kuli-kuli by the basin and resell · pay ₦8k', sub: 'Fresh off the oil at the mill gate', done: 'You have finished your kuli-kuli business',
      run: () => {
        if (g.money < 8_000) { g.toast('🧺 You need ₦8,000 for a basin of kuli-kuli.'); return false; }
        g.charge(8_000, 'A basin of kuli-kuli');
        if (Math.random() < 0.7) {
          const got = g.earn('luck', rand(12_000, 6_000), 'Resold kuli-kuli on the platform');
          g.toast(`🥜 The whole platform bought for the journey. ${naira(got - 8_000)} profit and your fingers will smell of groundnut oil till Friday.`);
        } else {
          needs({ hunger: 30, fun: -6 });
          g.toast('🐐 You put the basin down to count change and a goat ate half of it. You ate the rest out of anger.');
        }
      },
    });
  }

  if (insideId === 'market' && event === 'kwari') {
    once({
      icon: '🧵', label: 'Flip a bale of shadda · pay ₦25k', sub: 'Buy from the wholesaler, sell to a tailor in a hurry', done: 'You have done your cloth business',
      run: () => {
        if (g.money < 25_000) { g.toast('🧵 You need ₦25,000 for a bale of shadda.'); return false; }
        g.charge(25_000, 'A bale of shadda at Kurmi');
        if (Math.random() < 0.65) {
          const got = g.earn('luck', rand(36_000, 14_000), 'Sold shadda at Sallah prices');
          g.toast(`✂️ A tailor with sixty unfinished kaftans bought the whole bale without unrolling it. ${naira(got - 25_000)} profit.`);
        } else {
          const got = g.earn('luck', rand(14_000, 6_000), 'Sold a bad bale at a loss');
          g.toast(`😩 The bale was Swiss voile on the outside and something else from the second yard. You sold it to a man in more hurry than you. Lost ${naira(25_000 - got)}.`);
        }
      },
    });
    more.push({
      icon: '🧳', label: 'Carry bales as a dan dako', sub: 'Head, neck and a lot of faith',
      onClick: () => {
        needs({ energy: -14, social: 8 });
        const got = g.earn('luck', rand(1_800, 2_600), 'Carried cloth at Kurmi Market');
        g.toast(pick([`🧳 Six bales from the lorry to the stall. ${naira(got)}.`, `🧳 The alley was one bale wide and you were carrying two. ${naira(got)}.`]));
      },
    });
  }

  return more;
}
