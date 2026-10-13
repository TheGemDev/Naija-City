import type { StreetStory } from './stories';

// Street stories that only happen in Kano (game/stories.ts picks from these when you are there): adaidaita sahu,
// KAROTA, Hisbah, the old city's alleys, harmattan dust, and traders who have never lost a negotiation.

const KAN = { city: 'kano' } as const;

export const KANO_STORIES: StreetStory[] = [
  {
    id: 'kan-karota', icon: '🚦', title: 'KAROTA has blown the whistle', weight: 16,
    scene: 'You stopped one metre past the line at Kofar Nassarawa. A KAROTA marshal in a green cap has blown his whistle so hard that two other drivers have stopped too. He is walking over with a ticket booklet and a very calm face.',
    requires: { ...KAN, driving: true },
    choices: [
      { id: 'beg', label: '“Yallabai, a yi hakuri”', result: 'You apologised in three languages. He lectured you for six minutes on road discipline, saluted and let you go. Cheaper than you deserved.', outcome: { needs: { fun: -4, energy: -3 } } },
      {
        id: 'ticket', label: 'Take the ticket', result: 'An official fine, paid at an official desk, with an official receipt. You are still surprised.', outcome: { money: -5_000, needs: { fun: -6 } },
        rare: { chance: 0.12, result: '🎖️ The marshal looked at your papers, found everything complete, and shook your hand in the middle of the junction. “The first one today.” The traffic clapped.', outcome: { goodDeeds: 1, needs: { fun: 18, social: 12 } } },
      },
    ],
  },
  {
    id: 'kan-adaidaita', icon: '🛺', title: 'Adaidaita has kissed your bumper', weight: 15,
    scene: 'A yellow adaidaita sahu carrying five people and a sack of onions has run gently into the back of your car at Ibrahim Taiwo Road. The driver has come down, looked at his own tricycle first, and found nothing wrong with it.',
    requires: { ...KAN, driving: true },
    choices: [
      { id: 'forgive', label: '“Allah ya kiyaye”', result: 'He thanked you, the passengers thanked you, and the woman with the onions gave you four. Nobody mentioned the dent.', outcome: { goodDeeds: 1, needs: { hunger: 6, social: 10 } } },
      { id: 'argue', label: 'Demand he pays', result: 'He has ₦700, a tricycle on hire purchase and nine children. After fifteen minutes you paid for his broken headlamp.', outcome: { money: -2_500, needs: { fun: -8 } } },
    ],
  },
  {
    id: 'kan-hisbah', icon: '🧕🏾', title: 'Hisbah checkpoint', weight: 14,
    scene: 'A Hisbah patrol has stopped the road into Sabon Gari and is looking into every boot. The car in front of you has just been asked to open a cooler. The driver is saying it is zobo. It is a very large cooler.',
    requires: { ...KAN, driving: true, night: true, noOffice: true },
    choices: [
      { id: 'open', label: 'Open your boot', result: 'A spare tyre, a jack and a Bible somebody left there in 2019. The officer greeted you politely and waved you on.', outcome: { needs: { fun: -2 } } },
      {
        id: 'turn', label: 'Turn round quietly', result: 'You reversed like a guilty man, which is how an innocent man gets followed. They searched the car twice as long. Still nothing. You were late.', outcome: { needs: { energy: -8, fun: -8 } },
        rare: { chance: 0.15, result: '🧃 The man in front really was carrying zobo: two hundred bottles for a naming ceremony. Hisbah helped him offload and you were all given one each.', outcome: { needs: { fun: 16, hunger: 8, social: 10 } } },
      },
    ],
  },
  {
    id: 'kan-trailer', icon: '🚛', title: 'Trailer on the bypass', weight: 13,
    scene: 'A trailer loaded twice its own height with sacks of maize is leaning into your lane on the Eastern Bypass. On top of the sacks, eleven men are asleep. On top of the men, a goat.',
    requires: { ...KAN, driving: true },
    choices: [
      { id: 'overtake', label: 'Overtake now', result: 'You passed with a hand’s width to spare. One of the sleeping men waved without opening his eyes.', outcome: { needs: { fun: 12, energy: -4 } } },
      { id: 'wait', label: 'Stay well behind', result: 'Eleven kilometres at the speed of a bicycle. You arrived late, alive and full of dust.', outcome: { needs: { energy: -6, hygiene: -6 } } },
    ],
  },
  {
    id: 'kan-kurmi-maze', icon: '🧭', title: 'Lost in the old city', weight: 14,
    scene: 'You took one turn off the road near Kurmi and the alley has become three alleys. The walls are mud, every door is the same blue, and a small boy on a wall has been watching you pass for the third time.',
    requires: { ...KAN, onFoot: true },
    choices: [
      { id: 'boy', label: 'Pay the boy to lead you · ₦200', result: 'He took you out in ninety seconds through somebody’s compound, a dyer’s yard and a mosque veranda, greeting everybody by name.', outcome: { money: -200, needs: { fun: 12, social: 8 } } },
      {
        id: 'alone', label: 'You can find it yourself', result: 'You found a blacksmith, a Qur’anic school and the same boy again. He led you out for free and told all his friends.', outcome: { needs: { energy: -10, fun: 6 } },
        rare: { chance: 0.08, result: '🏺 You came out into a courtyard where an old man was dyeing cloth in a pit his family has used for five hundred years. He let you dip one. It is the best thing you own.', outcome: { needs: { fun: 28, social: 16 }, flag: 'blessed' } },
      },
    ],
  },
  {
    id: 'kan-trader', icon: '🧮', title: 'Last price', weight: 15,
    scene: 'You only asked how much the cap was. The trader has now sat you on a stool, sent a boy for tea, and is showing you the same cap in nine colours. “For you, my brother, special price. But first, drink.”',
    requires: { ...KAN, onFoot: true, day: true },
    choices: [
      { id: 'buy', label: 'Buy the cap · ₦6,000', result: 'You paid six. The man after you paid two. It is a very fine cap, and the tea was free.', outcome: { money: -6_000, needs: { fun: 10, social: 12 } } },
      { id: 'haggle', label: 'Start at ₦500', result: 'Forty minutes, three cups of tea and the story of his late father. You paid ₦2,500 and he said you have finished him. You were both smiling.', outcome: { money: -2_500, needs: { fun: 16, social: 18, energy: -5 } } },
      { id: 'leave', label: 'Thank him and stand up', result: 'He followed you for two stalls dropping the price by half each time, then blessed you anyway.', outcome: { needs: { social: 6 } } },
    ],
  },
  {
    id: 'kan-almajiri', icon: '🥣', title: 'Bowls at the junction', weight: 13,
    scene: 'Six almajirai with plastic bowls are standing where you are buying masa. The smallest one is not looking at your money. He is looking at the masa.',
    requires: { ...KAN, onFoot: true },
    choices: [
      { id: 'feed', label: 'Buy masa for all six · ₦1,800', result: 'The woman added four for free when she saw what you were doing. They ate sitting in a row on the kerb and recited something for you. You do not know the words. You know what it meant.', outcome: { money: -1_800, goodDeeds: 2, needs: { social: 18, fun: 8 } } },
      { id: 'coins', label: 'Drop ₦200 in a bowl', result: 'The big one took charge of it. You hope it reaches the small one.', outcome: { money: -200, goodDeeds: 1 } },
      { id: 'walk', label: 'Carry your masa and go', result: 'You ate it round the corner. It did not taste the way it smelled.', outcome: { needs: { hunger: 20, fun: -6 } } },
    ],
  },
  {
    id: 'kan-one-chance', icon: '🛺', title: 'Shared keke', weight: 11,
    scene: 'An adaidaita with no number on its back slows beside you near the railway line. Three men are already inside, sitting very straight. The driver says “Zoo Road, hundred naira” without asking where you are going.',
    requires: { ...KAN, onFoot: true, night: true, noOffice: true },
    choices: [
      { id: 'enter', label: 'Enter, it is late', result: 'They went through your pockets between two junctions and put you down at Kofar Ruwa with your shoes and your sim card. One of them said sorry.', outcome: { money: -22_000, needs: { energy: -15, fun: -18 } } },
      { id: 'wait', label: 'Wait for one with a number', result: 'You stood for twenty minutes and shared a keke with a man carrying a ram. The ram sat in the middle.', outcome: { money: -300, needs: { energy: -5 } } },
    ],
  },
  {
    id: 'kan-kannywood', icon: '🎥', title: 'They are shooting a film', weight: 12,
    scene: 'A film crew has blocked the street outside the dye pits. A director in a baseball cap is shouting “Action!” at a man who must cry on a motorbike. The man cannot cry. The director has seen you.',
    requires: { ...KAN, onFoot: true, day: true },
    choices: [
      {
        id: 'act', label: '“I can cry”', result: 'You cried on the motorbike in one take by thinking about your account balance. They gave you lunch and ₦4,000.', outcome: { money: 4_000, needs: { hunger: 25, fun: 16 } },
        rare: { chance: 0.06, result: '🎬 The producer watched the take three times. You are now the second lead in a film called “Hawaye” and your face is on a poster at Zoo Road.', outcome: { money: 30_000, needs: { fun: 30, social: 25 }, flag: 'nollywood' } },
      },
      { id: 'watch', label: 'Stand and watch', result: 'Eleven takes. On the twelfth a goat walked through the shot and that is the one they kept.', outcome: { needs: { fun: 14 } } },
    ],
  },
  {
    id: 'kan-ev-hisbah', icon: '🍺', title: 'The beer is coming out', weight: 22,
    scene: 'A Hisbah lorry stacked with crates is crawling through Sabon Gari with a crowd walking behind it like a funeral. A bar owner is walking beside the cab, pleading with the window. Somebody has started selling groundnuts to the mourners.',
    requires: { ...KAN, event: 'hisbah' },
    choices: [
      { id: 'follow', label: 'Follow the lorry', result: 'You walked with them to the ground and watched the bulldozer do it. Nobody cheered. Nobody left either.', outcome: { needs: { fun: 18, social: 14, energy: -6 } } },
      { id: 'groundnut', label: 'Buy groundnuts and watch from here', result: 'Hot, salted and wrapped in a page of somebody’s chemistry notes.', outcome: { money: -200, needs: { hunger: 10, fun: 10 } } },
    ],
  },
  {
    id: 'kan-ev-aure', icon: '💍', title: 'Brides everywhere', weight: 22,
    scene: 'Every road to the palace is full of buses carrying brides in the same lace, and pick-ups carrying the same mattress, the same sewing machine and the same set of pots. A groom on foot is checking a number on his hand against the buses.',
    requires: { ...KAN, event: 'aure' },
    choices: [
      { id: 'help', label: 'Help him find bus 417', result: 'You found it parked behind 471. He thanked you, then remembered he was meant to be nervous and started to shake.', outcome: { goodDeeds: 1, needs: { social: 20, fun: 12 } } },
      { id: 'sell', label: 'Sell handkerchiefs to the mothers', result: 'Every mother of a bride bought two. Some were crying before the buses stopped.', outcome: { money: 3_500, needs: { energy: -5 } } },
    ],
  },
  {
    id: 'kan-ev-harmattan', icon: '🌫️', title: 'You cannot see your hand', weight: 22,
    scene: 'The haze has come down so thick that the adaidaita in front of you is only a sound. A man has appeared out of the dust selling torchlights, face caps and something he calls “anti-harmattan cream”.',
    requires: { ...KAN, event: 'harmattan' },
    choices: [
      { id: 'cream', label: 'Buy the cream · ₦800', result: 'It is shea butter in a sardine tin. It works better than anything with a label.', outcome: { money: -800, needs: { hygiene: 12, fun: 4 } } },
      { id: 'push', label: 'Keep going without it', result: 'You arrived the colour of the road. Your own mother would have greeted you as a stranger.', outcome: { needs: { hygiene: -22, energy: -6 } } },
    ],
  },
  {
    id: 'kan-ev-pyramids', icon: '🥜', title: 'Groundnut on the road', weight: 22,
    scene: 'A sack has split on a lorry bound for the station and groundnuts are pouring onto Murtala Mohammed Way in a long brown line. Children, goats and two very respectable women are following the lorry with bowls.',
    requires: { ...KAN, event: 'pyramids' },
    choices: [
      { id: 'shout', label: 'Run and tell the driver', result: 'He stopped, tied the sack with his own belt and gave you a bowlful for your honesty. The children looked at you like a traitor.', outcome: { goodDeeds: 1, needs: { hunger: 14, social: 8 } } },
      { id: 'bowl', label: 'Find a bowl', result: 'You followed for three hundred metres. Tonight there is kuli-kuli in your house.', outcome: { needs: { hunger: 22, fun: 12, energy: -5 } } },
    ],
  },
  {
    id: 'kan-ev-kwari', icon: '🧵', title: 'The tailor is not picking', weight: 22,
    scene: 'A man in a singlet is standing outside a locked tailor’s shop two days before Sallah, phone to his ear. Through the window you can both see his kaftan: cut, not sewn, under forty others. “He said tomorrow since last week.”',
    requires: { ...KAN, event: 'kwari' },
    choices: [
      { id: 'wait', label: 'Wait with him', result: 'The tailor came at midnight with bread and Bournvita and sewed till dawn. The man wore his kaftan to the prayer ground still warm from the iron.', outcome: { goodDeeds: 1, needs: { social: 18, energy: -8 } } },
      { id: 'advise', label: '“Buy ready-made”', result: 'He looked at you as if you had insulted his father. In Kano a man does not wear ready-made on Sallah day.', outcome: { needs: { fun: 10 } } },
    ],
  },
  {
    id: 'kan-ev-durbar', icon: '🐎', title: 'Horses have the road', weight: 20,
    scene: 'A district head’s whole household is riding to the palace: forty horses in quilted armour, trumpeters, a man with a spear taller than a lamp post. They are not going to move for a keke. They are not going to move for you.',
    requires: { ...KAN, event: 'durbar' },
    choices: [
      { id: 'salute', label: 'Raise your fist and salute', result: 'The district head raised his own back at you from under three turbans. Your whole week has improved.', outcome: { needs: { fun: 24, social: 16 } } },
      { id: 'squeeze', label: 'Try to squeeze past', result: 'A horse looked at you. Just looked. You waited for all forty.', outcome: { needs: { fun: 8, energy: -4 } } },
    ],
  },
  {
    id: 'kan-ev-final', icon: '⚽', title: 'Sai Masu Gida', weight: 16,
    scene: 'Every viewing centre in Fagge is full for the cup final and a man has put a television on top of a water tank so the whole street can see. Three hundred people are looking up. Pillars have a corner.',
    requires: { ...KAN, event: 'final' },
    choices: [
      { id: 'join', label: 'Stand and look up', result: 'Your neck will hurt tomorrow. Tonight you sang “Sai Masu Gida” with three hundred people who all think they are the coach.', outcome: { needs: { fun: 24, social: 24, energy: -4 } } },
      { id: 'kosai', label: 'Sell kosai to the crowd', result: 'Nobody looks down to count their change during a corner. You did well.', outcome: { money: 3_000, needs: { energy: -6 } } },
    ],
  },
];
