import type { StreetStory } from './stories';

// Street stories that only happen in Lagos (game/stories.ts picks from these when you are there): danfo,
// LASTMA, agbero, omo onile, Third Mainland Bridge, and everything the Island does to your account balance.

const LAG = { city: 'lagos' } as const;

export const LAGOS_STORIES: StreetStory[] = [
  {
    id: 'lag-lastma', icon: '🚦', title: 'LASTMA has entered your car', weight: 16,
    scene: 'You stopped half a tyre over the zebra crossing at Ojuelegba. A LASTMA officer has opened your passenger door, sat down, put on the seat belt and said “Drive to the yard.”',
    requires: { ...LAG, driving: true },
    choices: [
      { id: 'settle', label: 'Settle him · ₦10k', result: '“You are a reasonable man.” He came down at the next bus stop and took your pure water too.', outcome: { money: -10_000 } },
      {
        id: 'yard', label: 'Drive to the yard', result: 'Official fine, towing fee for a car that was not towed, and a “psychiatric evaluation”. You passed the evaluation. Barely.', outcome: { money: -25_000, needs: { energy: -10, fun: -12 } },
        rare: { chance: 0.15, result: '📱 You started an Instagram Live. Nine thousand people joined. He removed the seat belt, said “my brother, safe journey” and walked into traffic.', outcome: { needs: { fun: 20, social: 15 }, flag: 'viral' } },
      },
    ],
  },
  {
    id: 'lag-danfo-scratch', icon: '🚐', title: 'Danfo has kissed your car', weight: 15,
    scene: 'A yellow danfo has dragged its whole side along yours on Ikorodu Road. The driver has come down, shirtless, to tell you that it is YOU who hit HIM. The conductor is already collecting witnesses.',
    requires: { ...LAG, driving: true },
    choices: [
      { id: 'shout', label: 'Shout back', result: 'You shouted for fifteen minutes. He shouted better. The passengers voted and you lost. You drove away with the scratch and a headache.', outcome: { needs: { fun: -8, energy: -6 } } },
      { id: 'drive', label: 'Wind up and drive off', result: 'He slapped your boot twice as you left. The panel beater in Mushin says ₦9,000 and “e go be like new”. It will not be like new.', outcome: { money: -9_000 } },
    ],
  },
  {
    id: 'lag-third-mainland', icon: '🌉', title: 'Stuck on Third Mainland', weight: 15,
    scene: 'The bridge has not moved for forty minutes. A man is walking between the cars selling plantain chips, phone chargers, a standing fan and one live puppy.',
    requires: { ...LAG, driving: true },
    choices: [
      { id: 'chips', label: 'Buy chips and Gala · ₦1,200', result: 'You ate in peace and watched the sun go down over Makoko. For three minutes, Lagos was beautiful.', outcome: { money: -1_200, needs: { hunger: 22, fun: 8 } } },
      {
        id: 'puppy', label: 'Price the puppy', result: 'He started at ₦150,000. You said ₦5,000 as a joke. He said “bring ₦7,000”. The traffic moved before either of you had to mean it.', outcome: { needs: { fun: 14 } },
        rare: { chance: 0.1, result: '🐶 He threw the puppy through your window and ran after your car for the ₦7,000. It has slept on your chest every night since.', outcome: { money: -7_000, needs: { fun: 25, social: 20 }, flag: 'blessed' } },
      },
    ],
  },
  {
    id: 'lag-agbero', icon: '🎫', title: 'Owo da?', weight: 15,
    scene: 'A man in a green-and-white vest has stepped in front of your bumper at Oshodi and slapped the bonnet. “Owo da? Morning ticket, loading ticket, security.” You are not a bus. He does not mind.',
    requires: { ...LAG, driving: true, noOffice: true },
    choices: [
      { id: 'pay', label: 'Pay ₦1,500', result: 'He tore a ticket from a booklet with nothing printed on it and waved you on like a man who built the road himself.', outcome: { money: -1_500 } },
      { id: 'refuse', label: '“I am private car”', result: 'He removed your wiper and held it like a hostage. It cost more to get it back.', outcome: { money: -4_000, needs: { fun: -8 } } },
    ],
  },
  {
    id: 'lag-brt-lane', icon: '🚌', title: 'The BRT lane is empty', weight: 12,
    scene: 'Ikorodu Road is a car park. The BRT lane beside you is completely, beautifully empty. A danfo has just swung into it. Then a Prado. Then a keke.',
    requires: { ...LAG, driving: true },
    choices: [
      {
        id: 'enter', label: 'Enter the BRT lane', result: 'Twelve kilometres in four minutes. You have never felt so alive, or so guilty.', outcome: { notoriety: 1, needs: { fun: 20 } },
        rare: { chance: 0.25, result: '🚔 The task force was waiting at the end with a tow truck and a camera crew. Fine, towing, and your face on the evening news.', outcome: { money: -35_000, notoriety: 1, needs: { fun: -18 } } },
      },
      { id: 'stay', label: 'Stay in your lane', result: 'You reached two hours later, upright and law-abiding. Nobody clapped.', outcome: { goodDeeds: 1, needs: { energy: -8, fun: -4 } } },
    ],
  },
  {
    id: 'lag-traffic-robber', icon: '🔨', title: 'Hold-up in the hold-up', weight: 12,
    scene: 'Traffic is dead under the bridge at Mile 2 and it is getting dark. A boy with a hammer is tapping gently on the window of the car in front. He is looking at your phone on the dashboard.',
    requires: { ...LAG, driving: true, night: true, noOffice: true },
    choices: [
      { id: 'hide', label: 'Throw the phone under the seat', result: 'He looked in, saw only your Bible and a bottle of water, and moved on to a Lexus.', outcome: { needs: { fun: -6 } } },
      { id: 'give', label: 'Wind down and hand it over', result: 'He took the phone, your wallet and, after thinking about it, your Gala. “No vex, country hard.”', outcome: { money: -18_000, needs: { fun: -15 } } },
    ],
  },
  {
    id: 'lag-wrong-bus', icon: '🚐', title: 'Enter with your change', weight: 14,
    scene: 'The conductor is hanging from the door shouting “CMS! CMS!” You enter. The bus turns towards Ikorodu. “I said CMS?” he asks, surprised. “I said Ketu Mile Twelve.”',
    requires: { ...LAG, onFoot: true },
    choices: [
      { id: 'drop', label: 'Come down at once', result: 'He stopped in the middle lane for you to jump. You paid for the distance you did not want to travel.', outcome: { money: -500, needs: { energy: -6, fun: -4 } } },
      { id: 'fight', label: 'Demand your money back', result: 'You, the conductor and one aunty argued till Mile 12. He gave you ₦200 change out of ₦1,000 and called it charity.', outcome: { money: -800, needs: { fun: 8, energy: -8 } } },
    ],
  },
  {
    id: 'lag-bus-preacher', icon: '📖', title: 'Bus preacher', weight: 12,
    scene: 'The moment the danfo moved, a man in a brown suit stood up. Twenty minutes of sermon, then: “Now, this same God has given me a herbal mixture for typhoid, staphylococcus and pile. Only ₦1,000.”',
    requires: { ...LAG, onFoot: true },
    choices: [
      { id: 'buy', label: 'Buy one · ₦1,000', result: 'It tastes of bitter leaf and kerosene. You slept for eleven hours. You do feel better, which worries you.', outcome: { money: -1_000, needs: { energy: 14, fun: -4 } } },
      { id: 'amen', label: 'Say Amen and look outside', result: 'He prayed for your destiny anyway and collected “seed” from the whole back row.', outcome: { needs: { social: 6 } } },
    ],
  },
  {
    id: 'lag-one-chance', icon: '🚕', title: 'One chance', weight: 11,
    scene: 'A danfo with no route written on it slows beside you at Ojota. “Yaba, one chance!” Four men inside. None of them is holding a bag. The conductor is smiling too much.',
    requires: { ...LAG, onFoot: true, night: true, noOffice: true },
    choices: [
      { id: 'enter', label: 'Enter, it is late', result: 'They took your phone, your ATM card and your PIN, and dropped you at Berger with ₦500 and “sorry for the stress”.', outcome: { money: -28_000, needs: { energy: -15, fun: -18 } } },
      { id: 'wait', label: 'Wait for a bus with passengers', result: 'You stood for half an hour and squeezed in beside a woman with a live chicken. You have never loved a chicken more.', outcome: { money: -700, needs: { energy: -5 } } },
    ],
  },
  {
    id: 'lag-omo-onile', icon: '🪧', title: 'Omo onile', weight: 13,
    scene: 'Four young men are sitting on a heap of sand that somebody has just paid for. “Before you offload, you will see the family. Foundation fee, roofing fee, and something for the Baale.” The house is not yours. They think it is.',
    requires: { ...LAG, onFoot: true },
    choices: [
      { id: 'explain', label: '“I am only passing”', result: '“Passing is ₦500.” You paid ₦500 to walk down a public street.', outcome: { money: -500, needs: { fun: -4 } } },
      {
        id: 'join', label: 'Sit down with them', result: 'You sat on the sand and collected “fencing fee” from the next two trucks. Easy money has a smell and it smells like sharp sand.', outcome: { money: 6_000, notoriety: 2 },
        rare: { chance: 0.2, result: '🚔 The task force came for all of you. You tried to say you were only passing. Nobody believed the man holding the receipt book.', outcome: { money: -15_000, notoriety: 2, needs: { fun: -15 } } },
      },
    ],
  },
  {
    id: 'lag-agent', icon: '🏚️', title: 'Mini-flat in Yaba', weight: 13,
    scene: 'An agent swears he has a “newly built mini-flat, all rooms en-suite” in Yaba for ₦1.5 million. Plus agreement, commission, caution and two years upfront. You have not seen it. He wants ₦5,000 “form fee” to show you the gate.',
    requires: { ...LAG, onFoot: true },
    choices: [
      { id: 'pay', label: 'Buy the form · ₦5k', result: 'The house exists. Nine other people were also at the gate with forms. The landlord says he never heard of this agent.', outcome: { money: -5_000, flag: 'scammed', needs: { fun: -10 } } },
      { id: 'laugh', label: '“I will stay in Ikorodu”', result: 'He said “with that your budget, try Mowe”. You have never been so insulted by a man in rubber slippers.', outcome: { needs: { fun: 8 } } },
    ],
  },
  {
    id: 'lag-area-boys', icon: '😎', title: 'Anything for the boys', weight: 13,
    scene: 'Under the bridge at Obalende, six boys are sitting on a broken BRT bench. “Chairman! Fine boy! Your people are loyal o. Anything for the weekend?” It is Tuesday.',
    requires: { ...LAG, onFoot: true, noOffice: true },
    choices: [
      { id: 'dash', label: 'Dash them ₦1,000', result: 'They hailed you all the way to the bus stop. “Baba for the boys!” An old woman thought you were a politician.', outcome: { money: -1_000, needs: { social: 12, fun: 8 } } },
      { id: 'walk', label: 'Walk fast', result: 'One followed you for two streets describing your shoes to you. You still have the shoes. You are no longer proud of them.', outcome: { needs: { fun: -8, energy: -4 } } },
    ],
  },
  {
    id: 'lag-island-bill', icon: '🍸', title: 'Island bill', weight: 12,
    scene: 'You sat down in a VI lounge “just to charge your phone”. A waiter has brought water you did not order, in a bottle shaped like perfume. The bill for sitting is on the table.',
    requires: { ...LAG, onFoot: true, minMoney: 20_000 },
    choices: [
      { id: 'pay', label: 'Pay it · ₦18k', result: 'Service charge, consumption tax, VAT and “ambience”. The phone charged to 11%.', outcome: { money: -18_000, needs: { social: 10, fun: -6 } } },
      {
        id: 'run', label: 'Go to “the toilet”', result: 'You left through the kitchen, past a chef who nodded like he has seen many of you.', outcome: { notoriety: 1, needs: { fun: 14, energy: -6 } },
        rare: { chance: 0.2, result: '🧍🏾 The bouncer was waiting at the kitchen door. You paid the bill, washed forty glasses and were photographed for the wall.', outcome: { money: -18_000, needs: { fun: -18, energy: -10 } } },
      },
    ],
  },
  {
    id: 'lag-ijgb', icon: '🧳', title: 'IJGB', weight: 11,
    scene: 'A cousin who landed from London last night wants to “see the real Lagos”. He is wearing a tracksuit in this heat, changing pounds on the street and saying “mandem” to a suya seller.',
    requires: { ...LAG, onFoot: true },
    choices: [
      { id: 'guide', label: 'Be his tour guide', result: 'You took him to Balogun, where he paid ₦40,000 for a ₦6,000 ankara and thanked the woman. He gave you £20 for your time.', outcome: { money: 22_000, needs: { social: 14, fun: 12 } } },
      { id: 'protect', label: 'Teach him to price things', result: 'By evening he was offering traders one quarter and walking away. You have created a monster. He bought you dinner.', outcome: { goodDeeds: 1, needs: { hunger: 40, social: 18 } } },
    ],
  },
  {
    id: 'lag-nollywood', icon: '🎬', title: 'Waka pass', weight: 10,
    scene: 'A film crew has blocked a street in Surulere. The director is pointing at you. “You! Oga! We need a wicked uncle for one scene. Can you slap somebody and look like you have land dispute?”',
    requires: { ...LAG, onFoot: true, day: true },
    choices: [
      {
        id: 'act', label: 'Play the wicked uncle', result: 'One take. You slapped the hero and shouted “You will not inherit this house!” The whole street clapped. ₦8,000 and a meat pie.', outcome: { money: 8_000, needs: { fun: 26, social: 18 }, flag: 'nollywood' },
        rare: { chance: 0.08, result: '🌟 The clip went everywhere. You are now “that wicked uncle” on four million phones. A producer wants you for Part 2, 3 and 4.', outcome: { money: 45_000, needs: { fun: 30, social: 30 }, flag: 'viral' } },
      },
      { id: 'watch', label: 'Just watch', result: 'You watched them shoot a whole film before lunch. The title is “Tears of My Landlord 2”.', outcome: { needs: { fun: 14 } } },
    ],
  },
  {
    id: 'lag-computer-village', icon: '📱', title: 'Uncle, what are you looking for?', weight: 13,
    scene: 'You have not even entered Computer Village and three boys are holding your elbow. “iPhone? Screen guard? Uncle follow me.” One of them is offering a sealed latest iPhone for ₦90,000.',
    requires: { ...LAG, onFoot: true, minMoney: 90_000 },
    choices: [
      { id: 'buy', label: 'Buy it · ₦90k', result: 'You opened the box at home. A bar of Key soap, cut very neatly to size, with a charger. The charger works.', outcome: { money: -90_000, flag: 'scammed', needs: { fun: -22 } } },
      { id: 'shop', label: 'Go to a shop with a signboard', result: 'The shop owner laughed. “Soap?” He sold you a screen guard at the correct wrong price.', outcome: { money: -2_000, needs: { fun: 6 } } },
    ],
  },
  {
    id: 'lag-beach-horse', icon: '🐎', title: 'Beach horse', weight: 10,
    scene: 'A boy has led a thin horse up to you on the sand. “Ride, ₦500.” You climb on. He walks you ten metres. “To come down, ₦5,000.”',
    requires: { ...LAG, onFoot: true, day: true },
    choices: [
      { id: 'pay', label: 'Pay to come down', result: 'You paid. He helped you down like a prince and went to find the next tourist. The horse looked sorry for you.', outcome: { money: -5_000, needs: { fun: 10 } } },
      { id: 'jump', label: 'Jump', result: 'You landed on your side in the wet sand. Dignity gone, wallet intact. The beach clapped.', outcome: { needs: { hygiene: -15, energy: -6, fun: 14 } } },
    ],
  },
  {
    id: 'lag-lagoon-coins', icon: '🪙', title: 'Marina fishermen', weight: 9,
    scene: 'At the Marina wall a fisherman is pulling up a net from the lagoon. Half fish, half plastic, and one black nylon that is very heavy and tied three times.',
    requires: { ...LAG, onFoot: true },
    choices: [
      {
        id: 'open', label: 'Help him open it', result: 'Somebody’s wet laundry and one left shoe. He gave you two tilapia for your trouble.', outcome: { needs: { hunger: 28, hygiene: -6 } },
        rare: { chance: 0.05, result: '💰 Bundles. Wet, old, but real. He looked at you. You looked at him. You split it and neither of you has ever been back to the Marina.', outcome: { money: 80_000, notoriety: 2, flag: 'jackpot' } },
      },
      { id: 'leave', label: '“I did not see anything”', result: 'In Lagos, a tied nylon from the lagoon is not your business. You walked on and slept well.', outcome: { needs: { fun: 4 } } },
    ],
  },
  {
    id: 'lag-nepa-island', icon: '💡', title: 'Light on the Island', weight: 9,
    scene: 'You are charging your phone at a kiosk in Ikoyi and the woman tells you they have had light for nine days straight. You look at her. She looks at you. Neither of you wants to say it out loud in case it hears.',
    requires: { ...LAG, onFoot: true },
    choices: [
      { id: 'stay', label: 'Sit and charge everything', result: 'Phone, power bank, torch, and a neighbour’s rechargeable fan you offered to help with. 100% on all four.', outcome: { money: -300, needs: { fun: 12, social: 8 } } },
      { id: 'say', label: 'Say “NEPA has tried”', result: 'The light went off before you finished the sentence. The whole street came out to look for who said it.', outcome: { needs: { fun: 10, social: -6 } } },
    ],
  },
  {
    id: 'lag-rain', icon: '🌧️', title: 'Lagos rain', weight: 12,
    scene: 'It rained for fifteen minutes. The road is now the lagoon. A man with a wheelbarrow is charging ₦300 to push people across the junction, and business is very good.',
    requires: LAG,
    choices: [
      { id: 'barrow', label: 'Enter the wheelbarrow · ₦300', result: 'You sat in it like cement, in your work clothes, and crossed dry. Three people filmed you.', outcome: { money: -300, needs: { fun: 10 } } },
      { id: 'wade', label: 'Fold your trousers and wade', result: 'Something brushed your leg. You did not look. You will never know and you prefer it that way.', outcome: { needs: { hygiene: -20, fun: -4, energy: -4 } } },
    ],
  },
  {
    id: 'lag-okada-ban', icon: '🏍️', title: 'Okada on the expressway', weight: 10,
    scene: 'An okada man has stopped beside you. “Island? ₦3,000. I know road that task force no dey.” He is already facing oncoming traffic.',
    requires: { ...LAG, onFoot: true, noOffice: true },
    choices: [
      {
        id: 'ride', label: 'Climb on', result: 'One-way, pavement, a filling station and somebody’s compound. You reached in eleven minutes with your soul slightly behind you.', outcome: { money: -3_000, needs: { fun: 16, energy: -6 } },
        rare: { chance: 0.2, result: '🚔 Task force. He jumped off and ran, leaving you sitting on a seized motorcycle. They crushed it. You paid “passenger fine”.', outcome: { money: -12_000, needs: { fun: -14 } } },
      },
      { id: 'bus', label: 'Wait for BRT', result: 'The queue was long and orderly and nobody pushed. You were so shocked you took a picture.', outcome: { money: -700, needs: { energy: -6 } } },
    ],
  },
  {
    id: 'lag-efcc-club', icon: '🕵🏾', title: 'Raid on the Island', weight: 9,
    scene: 'Men in red jackets have just walked into the lounge and the music has stopped. Every boy with a laptop bag is suddenly a student of Mass Communication. One of them slides his iPhone across the table to you. “Bro, hold this. It is yours.”',
    requires: { ...LAG, onFoot: true, night: true },
    choices: [
      { id: 'refuse', label: 'Slide it back', result: 'It went back and forth four times like table tennis until an officer picked it up himself. You went home. He did not.', outcome: { needs: { fun: 10 } } },
      { id: 'hold', label: 'Hold it for him', result: 'They checked it. They checked you. Six hours at the office in Ikoyi explaining who “Client Michael, Texas” is.', outcome: { money: -20_000, notoriety: 2, needs: { energy: -18, fun: -15 } } },
    ],
  },

  /* ---- While a Lagos live event is on (game/live.ts) ---- */
  {
    id: 'lag-ev-eyo', icon: '🎭', title: 'Agogoro Eyo', weight: 22,
    scene: 'An Eyo in flowing white, hat as wide as an umbrella, has stopped in front of you on Broad Street and lowered his staff across your path. You are wearing a cap. And sandals. And you are holding an umbrella.',
    requires: { ...LAG, event: 'eyo' },
    choices: [
      { id: 'remove', label: 'Remove everything, fast', result: 'Cap off, sandals in hand, umbrella closed. He raised the staff and blessed you in a deep voice. You walked the rest of the Island barefoot and grateful.', outcome: { goodDeeds: 1, needs: { fun: 18, social: 14, hygiene: -6 } } },
      { id: 'argue', label: '“It is hot now”', result: 'The opambata does not debate. Three taps. The crowd said “e pele” and laughed at the same time.', outcome: { needs: { energy: -12, fun: 8 } } },
    ],
  },
  {
    id: 'lag-ev-detty', icon: '🎤', title: 'Table for ten million', weight: 22,
    scene: 'Outside the concert a boy in dark glasses is shouting into two phones. His table for ten has only six people and the show starts in five minutes. He sees you. “You. You look like somebody. Come and sit.”',
    requires: { ...LAG, event: 'detty' },
    choices: [
      { id: 'sit', label: 'Sit down', result: 'You drank things with sparklers in them and waved at cameras all night. Nobody asked your name. You are in four people’s December recap.', outcome: { needs: { fun: 30, social: 28, hunger: 20 } } },
      { id: 'sell', label: 'Sell your seat to an IJGB', result: 'A girl with a Peckham accent paid you in pounds to be at that table. The boy never noticed the swap.', outcome: { money: 25_000, notoriety: 1 } },
    ],
  },
  {
    id: 'lag-ev-felabration', icon: '🎷', title: 'Shrine queue', weight: 22,
    scene: 'The queue for the Shrine goes round Agidingbi twice. A man beside you is selling “VIP wristbands” he is cutting from a roll of green cellotape while you watch.',
    requires: { ...LAG, event: 'felabration' },
    choices: [
      { id: 'buy', label: 'Buy a wristband · ₦1,500', result: 'The bouncer looked at the cellotape, looked at you, and let you in because the song was too good to stand outside for.', outcome: { money: -1_500, needs: { fun: 26, social: 16 } } },
      { id: 'dance', label: 'Dance in the queue', result: 'The band is loud enough from the road. The queue became its own party and nobody went in.', outcome: { needs: { fun: 22, social: 20, energy: -8 } } },
    ],
  },
  {
    id: 'lag-ev-tanker', icon: '🛢️', title: 'Free fuel', weight: 22,
    scene: 'Petrol is running down the gutter from the fallen tanker like a small river. A woman has brought a baby bath. A man has brought a wheelbarrow. Somebody behind you has just lit a cigarette.',
    requires: { ...LAG, event: 'tanker' },
    choices: [
      { id: 'slap', label: 'Slap the cigarette out of his mouth', result: 'It landed in a puddle of plain water by the grace of God. The crowd beat him small and then thanked you.', outcome: { goodDeeds: 3, needs: { social: 18, fun: 8 } } },
      { id: 'run', label: 'Run. Do not look back', result: 'You ran to the next bus stop without your left slipper. Nothing happened. You are still running a little, inside.', outcome: { needs: { energy: -16, fun: -4 } } },
    ],
  },
  {
    id: 'lag-ev-lekkiflood', icon: '🌊', title: 'Uber by water', weight: 22,
    scene: 'Your ride has arrived on Admiralty Way. It is a Corolla with water up to the door handles. The driver has wound down the window. “Oga, enter through here. Fare is times four.”',
    requires: { ...LAG, event: 'lekkiflood' },
    choices: [
      { id: 'enter', label: 'Climb in through the window', result: 'You sat with your feet on the dashboard and a catfish swam past the gear lever. He still asked for five stars.', outcome: { money: -6_000, needs: { hygiene: -18, fun: 14 } } },
      { id: 'canoe', label: 'Flag down a canoe', result: 'The canoe man took you straight to your gate and did not complain about the route. Best ride of the year.', outcome: { money: -2_000, needs: { fun: 18, hygiene: -6 } } },
    ],
  },
  {
    id: 'lag-ev-marathon', icon: '🏃🏾', title: 'Road closed for running', weight: 22,
    scene: 'The marathon has closed the road and a runner in full kit has collapsed dramatically at your feet, in front of a suya stand. He is not tired. He is pointing at the suya.',
    requires: { ...LAG, event: 'marathon' },
    choices: [
      { id: 'buy', label: 'Buy him one stick · ₦500', result: 'He ate it lying down, stood up, thanked you and ran off in the wrong direction.', outcome: { money: -500, goodDeeds: 1, needs: { fun: 16 } } },
      { id: 'pace', label: 'Run with him to the next bus stop', result: 'You lasted four hundred metres in jeans. The crowd cheered you as an elite athlete. A child gave you water.', outcome: { needs: { energy: -14, hygiene: -10, fun: 20, social: 12 } } },
    ],
  },
  {
    id: 'lag-ev-techweek', icon: '🦄', title: 'Founder mode', weight: 22,
    scene: 'A white man in a fleece vest is lost on Herbert Macaulay Way, holding a phone with 3% battery. “Excuse me, are you a founder? Everyone here is a founder. I have a fund.”',
    requires: { ...LAG, event: 'techweek' },
    choices: [
      { id: 'pitch', label: '“Yes. I am building…”', result: 'You invented a company between the gutter and the kerb. He wrote “AI for danfo” in his notes and gave you his card and ₦15,000 “for a deck”.', outcome: { money: 15_000, needs: { fun: 20, social: 16 } } },
      { id: 'help', label: 'Walk him to the hub', result: 'You took him there, lent him your charger and refused his money. He told a hall of two hundred people about “the kindest man in Lagos”.', outcome: { goodDeeds: 2, needs: { social: 22 } } },
    ],
  },
  {
    id: 'lag-ev-aluta', icon: '✊🏾', title: 'Aluta continua', weight: 22,
    scene: 'Students have blocked the road with a mattress, a reading table and one very old fridge. A girl with a megaphone points at you. “You! Are you with the oppressed or with the oppressor?”',
    requires: { ...LAG, event: 'aluta' },
    choices: [
      { id: 'with', label: '“The oppressed!”', result: 'They gave you a leaf to hold and a verse to sing. You do not attend this school. You are now on its union’s WhatsApp group.', outcome: { needs: { social: 24, fun: 16, energy: -6 } } },
      { id: 'water', label: 'Sell them pure water', result: 'Revolution is thirsty work. Two bags at struggle price. One comrade paid with a meal ticket.', outcome: { money: 2_500, needs: { energy: -6 } } },
    ],
  },
  {
    id: 'lag-ev-landgrab', icon: '🪧', title: 'This house is not for sale', weight: 22,
    scene: 'A boy with a brush and a tin of red paint is writing “THIS LAND IS NOT FOR SALE. BEWARE OF 419” on a wall. Then on a kiosk. Then on a parked car. He is walking towards a traffic warden.',
    requires: { ...LAG, event: 'landgrab' },
    choices: [
      { id: 'laugh', label: 'Stand and watch', result: 'He painted it on the warden’s booth while the warden was inside. The family now owns the junction, on paper, in red.', outcome: { needs: { fun: 22 } } },
      { id: 'hire', label: 'Pay him to write it on your gate · ₦1k', result: 'Nobody has tried to sell your house since. Two people have tried to buy it.', outcome: { money: -1_000, needs: { fun: 12, social: 6 } } },
    ],
  },
  {
    id: 'lag-ev-japa', icon: '🧳', title: 'Send-forth at arrivals', weight: 22,
    scene: 'A whole family in matching ankara is praying over a young man with a rucksack on the road to the airport. The pastor is anointing his passport. The mother has seen you and is waving you over. “Come and join hands!”',
    requires: { ...LAG, event: 'japa' },
    choices: [
      { id: 'pray', label: 'Join hands', result: 'You prayed for a stranger’s visa for nine minutes. They shared jollof in takeaway packs after, and you were counted.', outcome: { goodDeeds: 1, needs: { hunger: 35, social: 18 } } },
      {
        id: 'ask', label: '“Is there space in the bag?”', result: 'Everybody laughed. The young man did not. He is carrying eleven people’s hopes and thirty-two kilos of crayfish.', outcome: { needs: { fun: 16, social: 8 } },
        rare: { chance: 0.01, result: '🛂 His uncle works “in the embassy”. He looked at you for a long time, took your number, and three weeks later an envelope arrived. It is real.', outcome: { needs: { fun: 30 }, flag: 'visa' } },
      },
    ],
  },
  {
    id: 'lag-ev-owambe', icon: '💃🏾', title: 'Souvenir war', weight: 22,
    scene: 'The owambe is sharing souvenirs: plastic buckets with the couple’s faces on them. There are two hundred buckets and six hundred guests. An aunty in gele the size of a satellite dish has four already and is reaching for yours.',
    requires: { ...LAG, event: 'owambe' },
    choices: [
      { id: 'hold', label: 'Hold your bucket', result: 'You held it with both hands and your teeth. She respected that. You went home with a bucket, a hand fan and a small jotter.', outcome: { needs: { fun: 22, social: 14 } } },
      { id: 'give', label: 'Give it to her', result: '“God bless you my son.” She gave you her table’s whole tray of small chops in a nylon. You won.', outcome: { goodDeeds: 1, needs: { hunger: 45, social: 16 } } },
    ],
  },
  {
    id: 'lag-ev-protest', icon: '✊🏾', title: 'Soro soke', weight: 22,
    scene: 'The road to TBS is full. Somebody has set up a DJ booth on a truck, a woman is sharing free jollof from a cooler, and a man is charging phones from a generator for nothing. A girl hands you a placard: “WE ARE TIRED”.',
    requires: { ...LAG, event: 'protest' },
    choices: [
      { id: 'march', label: 'Carry the placard', result: 'You marched, sang and helped pick up the rubbish after. Nobody paid you. It was the best you have felt about Lagos in a year.', outcome: { goodDeeds: 2, needs: { social: 24, fun: 14, hunger: 20, energy: -10 } } },
      { id: 'sell', label: 'Sell flags at the junction', result: 'Green-white-green at double price. A grandmother bought three and blessed your business.', outcome: { money: 4_000, needs: { energy: -6 } } },
    ],
  },
  {
    id: 'lag-ev-final', icon: '⚽', title: 'Viewing centre is full', weight: 16,
    scene: 'Every viewing centre in Mushin is full to the gutter for the cup final. A barber has turned his mirror to face a small TV so that two rows can watch at once. The back row is watching the match backwards.',
    requires: { ...LAG, event: 'final' },
    choices: [
      { id: 'pay', label: 'Pay ₦300 for the mirror row', result: 'You celebrated a goal at the wrong end. So did everybody behind you. It was still the best atmosphere in Lagos.', outcome: { money: -300, needs: { fun: 22, social: 22 } } },
      { id: 'haircut', label: 'Take a haircut and watch properly', result: 'He cut your hair during a penalty shoot-out. One side is lower than the other. You saw every kick.', outcome: { money: -1_500, needs: { fun: 18, hygiene: 10 } } },
    ],
  },
];
