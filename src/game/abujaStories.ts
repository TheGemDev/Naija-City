import type { StreetStory } from './stories';

// Street stories that only happen in Abuja (game/stories.ts picks from these when you are there): convoys,
// VIO, agents, contracts, the Villa, and all the things the capital says happened to the money.

const ABJ = { city: 'abuja' } as const;

export const ABUJA_STORIES: StreetStory[] = [
  {
    id: 'abj-convoy', icon: '🚨', title: 'Minister’s convoy', weight: 16,
    scene: 'Eleven black Prados and a pickup of mobile police are coming down the wrong side of Shehu Shagari Way. A man is hanging out of the window with a horsewhip, pointing at YOU.',
    requires: { ...ABJ, driving: true },
    choices: [
      { id: 'park', label: 'Climb the kerb and park', result: 'The convoy passed at 140. The last Hilux still knocked your side mirror off, as a matter of principle.', outcome: { money: -6_000, needs: { fun: -6 } } },
      {
        id: 'join', label: 'Tuck in behind and join the convoy', result: 'You rode behind them through four red lights and two checkpoints. Nobody stops a convoy. You reached in six minutes.',
        outcome: { notoriety: 1, needs: { fun: 22, energy: 4 } },
        rare: { chance: 0.12, result: '🚨 The escort noticed a twelfth car. They parked you, flogged your bonnet and collected “security levy”.', outcome: { money: -20_000, needs: { fun: -15, energy: -8 } } },
      },
    ],
  },
  {
    id: 'abj-vio', icon: '🦺', title: 'VIO on the bonnet', weight: 14,
    scene: 'A VIO officer has jumped onto your bonnet at Berger roundabout and is holding the wiper like a handbrake. “Park! Your fire extinguisher is expired, your C-caution is small, and your face is not smiling.”',
    requires: { ...ABJ, driving: true },
    choices: [
      { id: 'settle', label: 'Settle him · ₦8k', result: '“Ehen. Now you are talking like a responsible road user.” He came down and saluted you.', outcome: { money: -8_000 } },
      {
        id: 'argue', label: '“Show me that law”', result: 'He brought out a booklet from 1994 and read it for forty minutes. You paid the official fine, which was somehow more.', outcome: { money: -15_000, needs: { energy: -8, fun: -8 } },
        rare: { chance: 0.15, result: '📱 You started a Facebook Live. Twelve thousand people were watching in two minutes. He climbed down and said “my brother, safe journey”.', outcome: { needs: { fun: 20, social: 15 }, flag: 'viral' } },
      },
    ],
  },
  {
    id: 'abj-cows', icon: '🐄', title: 'Cattle on the expressway', weight: 14,
    scene: 'Two hundred cows are crossing Airport Road at their own speed. A boy of about nine, with one stick, is in charge of all of them and all of you.',
    requires: { ...ABJ, driving: true },
    choices: [
      { id: 'wait', label: 'Switch off the engine and wait', result: 'It took twenty-five minutes. One cow looked into your window, judged you, and moved on.', outcome: { needs: { energy: -4, fun: 4 } } },
      { id: 'horn', label: 'Press horn', result: 'A bull took it personally and sat on your bonnet. The boy laughed until he cried.', outcome: { money: -12_000, needs: { fun: -8 } } },
    ],
  },
  {
    id: 'abj-hawker', icon: '🏃🏾', title: 'Gala and change', weight: 13,
    scene: 'You bought Gala and La Casera in the AYA hold-up with a ₦1,000 note. The traffic has just cleared and the hawker is sprinting behind your car with your change in his fist.',
    requires: { ...ABJ, driving: true },
    choices: [
      { id: 'slow', label: 'Slow down for him', result: 'He caught you at 40 km/h, not even breathing hard, and gave you every kobo. That man should be at the Olympics.', outcome: { needs: { hunger: 14, fun: 10 } } },
      { id: 'keep', label: '“Keep the change!”', result: 'He stopped, raised both hands and prayed for you in three languages. All the other hawkers ran to your window.', outcome: { money: -600, goodDeeds: 1, needs: { hunger: 14, social: 8 } } },
    ],
  },
  {
    id: 'abj-one-chance', icon: '🚕', title: 'One chance', weight: 12,
    scene: 'A green cab stops at Area 1. “Wuse, Berger, one chance!” There are already three quiet men inside, and the one in front is wearing sunglasses at night.',
    requires: { ...ABJ, onFoot: true, night: true, noOffice: true },
    choices: [
      { id: 'enter', label: 'Enter, it is late', result: 'They drove you round Abuja for an hour, emptied your pockets and dropped you at Lugbe with ₦200 “for transport”. Honest thieves.', outcome: { money: -25_000, needs: { energy: -15, fun: -18 } } },
      { id: 'wait', label: 'Wait for a painted taxi', result: 'You waited twenty minutes and paid double, but you got home with your kidneys.', outcome: { money: -2_500, needs: { energy: -5 } } },
    ],
  },
  {
    id: 'abj-agent', icon: '🏚️', title: 'Self-con in Maitama', weight: 14,
    scene: 'An agent swears he has a “tastefully finished self-contained in the heart of Maitama” for ₦2.8 million a year. It is a boys’ quarters toilet with a mattress in it. He wants ₦10k inspection fee before you can even look at the second one.',
    requires: { ...ABJ, onFoot: true },
    choices: [
      { id: 'pay', label: 'Pay the inspection fee · ₦10k', result: 'The second one was the same toilet, from the other door. He has blocked your number.', outcome: { money: -10_000, flag: 'scammed', needs: { fun: -10 } } },
      { id: 'laugh', label: '“I will manage Lugbe”', result: 'He called you “unserious tenant”. You called him “toilet landlord”. Both of you felt better.', outcome: { needs: { fun: 10 } } },
    ],
  },
  {
    id: 'abj-landlord', icon: '🧾', title: 'Abuja landlord', weight: 11,
    scene: 'A landlord in Gwarinpa is reading you his terms: two years’ rent, agency, agreement, caution, “legal”, estate levy, and no visitors after 8pm. He also wants to know your tribe and if you are married.',
    requires: ABJ,
    choices: [
      { id: 'ask', label: 'Ask what “legal” is for', result: '“Legal is legal.” He has added ₦50k “question fee” to the total.', outcome: { needs: { fun: -6 } } },
      { id: 'tip', label: 'Greet him properly · ₦3k', result: 'You knelt small and dropped something for kola. Suddenly it is one year’s rent and your visitors can sleep over.', outcome: { money: -3_000, needs: { social: 12 } } },
    ],
  },
  {
    id: 'abj-ghana-must-go', icon: '🧳', title: 'Carry this for Oga', weight: 13,
    scene: 'A sweating man in a senator’s cap mistakes you for his new PA outside the National Assembly. He pushes a heavy Ghana-must-go bag into your arms. “Take this to the white Land Cruiser. Do NOT open it.”',
    requires: { ...ABJ, day: true },
    choices: [
      {
        id: 'carry', label: 'Carry it to the car', result: 'The driver counted the bundles twice, then gave you ₦5,000 “for your loyalty”. Your arms smell like new notes.',
        outcome: { money: 5_000, notoriety: 1 },
        rare: { chance: 0.06, result: '🧳 EFCC were waiting by the Land Cruiser. Everybody ran. In the confusion, one bundle followed you home. You know nothing.', outcome: { money: 50_000, notoriety: 3, flag: 'jackpot' } },
      },
      { id: 'refuse', label: '“Sir, I am not your PA”', result: 'He looked at you properly, collected his bag and said “you people don’t like progress”.', outcome: { goodDeeds: 1 } },
    ],
  },
  {
    id: 'abj-monkeys', icon: '🐒', title: 'The monkeys and the ₦70 million', weight: 12,
    scene: 'A monkey has just run across the road in Asokoro with a bundle of ₦1,000 notes in its mouth. Three more are behind it. A senator’s gateman is chasing them in bathroom slippers, shouting “I TOLD them! Nobody believed!”',
    requires: ABJ,
    choices: [
      {
        id: 'chase', label: 'Chase the monkeys', result: 'You cornered one on a fence. It threw ₦4,000 at your face to distract you and escaped. It worked.',
        outcome: { money: 4_000, needs: { energy: -10, fun: 18 } },
        rare: { chance: 0.08, result: '🐒 The monkey dropped the whole bundle to climb faster. ₦30,000, slightly chewed. The gateman is still running.', outcome: { money: 30_000, needs: { fun: 25 }, flag: 'jackpot' } },
      },
      { id: 'film', label: 'Film it as evidence', result: 'Your video is now Exhibit A at a Senate committee. They have adjourned to investigate the monkeys.', outcome: { needs: { fun: 14, social: 12 } } },
    ],
  },
  {
    id: 'abj-termites', icon: '🐜', title: 'Termites ate the vouchers', weight: 11,
    scene: 'A civil servant outside the Federal Secretariat is holding an empty file jacket. “Termites ate ₦17 billion worth of vouchers. I just need one member of the public to sign that you saw the termites.”',
    requires: { ...ABJ, day: true },
    choices: [
      { id: 'sign', label: 'Sign as witness · ₦5k for you', result: 'You signed “I saw them, they were many.” Your name is now on a federal audit report.', outcome: { money: 5_000, notoriety: 2 } },
      { id: 'ask', label: '“Show me one termite”', result: 'He searched the file for a long time and produced a dead ant. You both stood there in silence.', outcome: { goodDeeds: 1, needs: { fun: 12 } } },
    ],
  },
  {
    id: 'abj-off-mic', icon: '🎙️', title: '“Off your mic!”', weight: 12,
    scene: 'You wandered into a probe hearing. The committee asked an MD where ₦40 billion went and he has fainted flat on the table. An honourable member is shouting “It’s okay! Off your mic! OFF YOUR MIC!”',
    requires: { ...ABJ, day: true, onFoot: true },
    choices: [
      { id: 'fan', label: 'Fan him with a file', result: 'He opened one eye, saw the cameras were still on, and fainted again, more deeply.', outcome: { goodDeeds: 1, needs: { fun: 16, social: 8 } } },
      { id: 'mic', label: 'Help them off the mic', result: 'You switched off the wrong microphone. The whole country heard an honourable say “have we shared that thing?”', outcome: { notoriety: 1, needs: { fun: 22 }, flag: 'viral' } },
    ],
  },
  {
    id: 'abj-budget-flash', icon: '💾', title: 'BUDGET_FINAL_FINAL(2)', weight: 9,
    scene: 'There is a flash drive on the pavement at the Three Arms Zone. The label says “BUDGET – PADDED – FINAL FINAL (2) – DO NOT SHARE”.',
    requires: ABJ,
    choices: [
      {
        id: 'blog', label: 'Sell it to a blog', result: 'The blog paid ₦8,000 and ran “EXCLUSIVE: ₦2 billion for boreholes in a village that is a river”. Nobody resigned.',
        outcome: { money: 8_000, notoriety: 1, needs: { fun: 10 } },
        rare: { chance: 0.08, result: '💾 Before the blog could post, a man in a kaftan paid you ₦45,000 to “forget this road”. You have forgotten it.', outcome: { money: 45_000, notoriety: 2 } },
      },
      { id: 'return', label: 'Hand it in at the gate', result: 'The sergeant thanked you, then asked very quietly if you had opened it. You said no. He did not blink for a full minute.', outcome: { goodDeeds: 2, needs: { fun: -4 } } },
    ],
  },
  {
    id: 'abj-contract', icon: '📄', title: 'Award letter', weight: 11,
    scene: 'A man in a tight suit at the Secretariat car park shows you a “LETTER OF AWARD: supply of 4,000 customised umbrellas to the Ministry”. He only needs ₦20k “mobilisation for the file to move” and you will split ₦60 million.',
    requires: { ...ABJ, minMoney: 20_000 },
    choices: [
      {
        id: 'pay', label: 'Move the file · ₦20k', result: 'The file moved. So did he. The letterhead says “Federal Ministry of Umbrellar”.', outcome: { money: -20_000, flag: 'scammed', needs: { fun: -12 } },
        rare: { chance: 0.03, result: '📄 Ehn?! The contract was REAL. Nobody supplied any umbrella, but ₦50,000 “first tranche” landed. Welcome to Abuja.', outcome: { money: 50_000, notoriety: 2, flag: 'jackpot' } },
      },
      { id: 'no', label: '“Let me call my lawyer”', result: 'He remembered an urgent meeting and walked very fast into a bush.', outcome: { needs: { fun: 6 } } },
    ],
  },
  {
    id: 'abj-know-who', icon: '😤', title: '“Do you know who I am?”', weight: 13,
    scene: 'A man has jumped the whole queue and is shouting at the cashier, “Do you KNOW who I am?!” Nobody knows who he is. He is now looking around for support and his eyes have landed on you.',
    requires: { ...ABJ, onFoot: true },
    choices: [
      { id: 'answer', label: '“No. Who are you?”', result: 'He opened his mouth. Nothing came out. He is the SA to an SA on Inter-Party Matters. The queue clapped for you.', outcome: { needs: { fun: 18, social: 14 } } },
      { id: 'hail', label: '“Ah! Distinguished!”', result: 'He straightened his cap and gave you ₦2,000 for recognising quality. You still don’t know who he is.', outcome: { money: 2_000, needs: { social: 6 } } },
    ],
  },
  {
    id: 'abj-pos', icon: '🏧', title: 'Abuja POS', weight: 12,
    scene: 'Every ATM in Wuse says “Temporarily unable to dispense”. The POS woman under the umbrella says the charge is ₦500 on ₦5,000. “This is Abuja, not your village.”',
    requires: ABJ,
    choices: [
      { id: 'pay', label: 'Pay the charge · ₦500', result: 'Debited twice. She says the second one will “reverse in 24 working days”.', outcome: { money: -1_000, needs: { fun: -5 } } },
      { id: 'walk', label: 'Trek to the next ATM', result: 'Four ATMs, three kilometres. The last one paid, in ₦200 notes held together with sellotape.', outcome: { needs: { energy: -10, fun: -3 } } },
    ],
  },
  {
    id: 'abj-hilton-bill', icon: '🍽️', title: 'Small chops, big bill', weight: 11,
    scene: 'You sat down in a Maitama lounge “just to charge your phone”. A waiter has placed a bottle of water, a serviette folded like a swan, and a bill for ₦18,500 in front of you.',
    requires: { ...ABJ, onFoot: true },
    choices: [
      { id: 'pay', label: 'Pay like a big boy', result: 'You paid, tipped, and walked out slowly. Outside, you sat on the kerb for a while.', outcome: { money: -18_500, needs: { social: 10, fun: -6 } } },
      { id: 'toilet', label: '“Where is the restroom?”', result: 'You left through the kitchen, past a chef who did not ask questions. Your phone was at 4%.', outcome: { notoriety: 1, needs: { fun: 14, energy: -6 } } },
    ],
  },
  {
    id: 'abj-big-girl', icon: '💅🏾', title: 'Abuja big girl', weight: 10,
    scene: 'A lady with a Dubai accent and an iPhone with three cameras and no airtime sits at your table in Wuse II. “Order anything, my uncle is a senator.” Six cocktails later the waiter brings the bill to YOU.',
    requires: { ...ABJ, night: true, onFoot: true },
    choices: [
      { id: 'pay', label: 'Pay · ₦30k', result: 'She said “thanks boo” and left in a Venza that also belonged to somebody else.', outcome: { money: -30_000, needs: { social: 14, fun: -8 } } },
      {
        id: 'uncle', label: '“Call your uncle”', result: 'She dialled a number saved as “Uncle Senator ❤️”. A vulcaniser in Nyanya picked up. She has left through the window.', outcome: { needs: { fun: 20 } },
        rare: { chance: 0.07, result: '📞 Her uncle really IS a senator. He paid the bill by transfer and sent you ₦20,000 for “taking care of my daughter”.', outcome: { money: 20_000, needs: { social: 20 }, flag: 'blessed' } },
      },
    ],
  },
  {
    id: 'abj-efcc-lounge', icon: '⚖️', title: 'Sting operation', weight: 9,
    scene: 'Men in red jackets have just entered the lounge. Forty boys with dreadlocks and two phones each are going over the back fence. One of them throws a laptop into your lap. “Bros, hold this, I’m coming.”',
    requires: { ...ABJ, night: true },
    choices: [
      { id: 'drop', label: 'Drop it and raise your hands', result: 'They checked your phone, found only betting slips and your mother’s voice notes, and let you go with a lecture.', outcome: { needs: { fun: -8, energy: -6 } } },
      { id: 'run', label: 'Run with the laptop', result: 'You scaled the fence into a gutter. The laptop had no battery, no charger and a cracked screen. You have its problems now.', outcome: { notoriety: 3, needs: { hygiene: -25, energy: -14, fun: 8 } } },
    ],
  },
  {
    id: 'abj-dss', icon: '🕶️', title: 'Black Hilux', weight: 8,
    scene: 'A black Hilux with no plate number is parked across the road. A man in dark glasses and a very small earpiece crosses over. “Good evening. Are you the one that has been tweeting?”',
    requires: { ...ABJ, notoriety: 2 },
    choices: [
      { id: 'deny', label: '“I don’t even have data”', result: 'He scrolled your phone, laughed at one of your tweets, then remembered himself. “Be careful.” The Hilux reversed for two kilometres.', outcome: { needs: { fun: -10, energy: -5 } } },
      { id: 'own', label: '“Yes. And I will tweet this too”', result: 'You spent six hours in a room with a very cold AC and no chair. They released you “on self-recognition”. You are now trending.', outcome: { notoriety: 2, needs: { energy: -20, fun: -10, social: 25 }, flag: 'viral' } },
    ],
  },
  {
    id: 'abj-corper', icon: '🪖', title: 'Corper wee!', weight: 12,
    scene: 'A corper in full khaki and white canvas is stranded at the Kubwa junction with a Ghana-must-go and a mattress. Her PPA rejected her and “allawee” has not dropped for two months.',
    requires: ABJ,
    choices: [
      {
        id: 'help', label: 'Give her transport · ₦3k', result: '“Wa! God bless you, uncle/aunty!” She saluted you with the wrong hand and entered the bus.', outcome: { money: -3_000, goodDeeds: 2, needs: { social: 8 } },
        rare: { chance: 0.05, result: '🪖 Her father is a Permanent Secretary. He called to thank you and sent ₦25,000. “Come and see me in the office.”', outcome: { money: 22_000, goodDeeds: 2, flag: 'blessed' } },
      },
      { id: 'advice', label: 'Advise her to “hustle”', result: 'She said “thank you sir” in the voice of somebody adding you to a prayer point.', outcome: { needs: { social: -6 } } },
    ],
  },
  {
    id: 'abj-apo-mechanic', icon: '🔧', title: 'Apo mechanic village', weight: 12,
    scene: 'You only came to Apo to change oil. Six mechanics have opened your bonnet. The oldest one is shaking his head slowly. “Oga… who has been touching this engine? Your top cylinder has entered your brain box.”',
    requires: { ...ABJ, car: true },
    choices: [
      { id: 'fix', label: 'Let them “work on it” · ₦25k', result: 'They removed four things and returned three. The car now makes a new sound and your original battery is in somebody else’s Camry.', outcome: { money: -25_000, needs: { fun: -12 } } },
      { id: 'oil', label: '“Just the oil. Close the bonnet.”', result: 'They closed it with great sadness. The oil was changed. One apprentice whispered “this one get sense”.', outcome: { money: -6_000, needs: { fun: 6 } } },
    ],
  },
  {
    id: 'abj-demolition', icon: '🚜', title: 'Red X', weight: 11,
    scene: 'A bulldozer is idling outside a duplex with a red “X – FCDA” on the gate. The owner is on three phones. “Hello? Honourable? They are HERE.” He sees you. “You! You look like somebody that knows somebody!”',
    requires: { ...ABJ, day: true },
    choices: [
      { id: 'pretend', label: 'Pretend to call the Minister', result: 'You said “Yes Your Excellency” into a dead phone for two minutes. The bulldozer driver went on break. The owner dashed you ₦10,000.', outcome: { money: 10_000, notoriety: 1, needs: { fun: 16 } } },
      { id: 'carry', label: 'Help him carry his things out', result: 'You saved a fridge, a goat and his certificates. The bulldozer took the fence and went for lunch.', outcome: { goodDeeds: 2, needs: { energy: -14, social: 10 } } },
    ],
  },
  {
    id: 'abj-okada-raid', icon: '🏍️', title: 'Okada raid', weight: 11,
    scene: 'Task force! Okada is banned in the city centre and forty riders are scattering down the street. One has ridden straight into the compound you are standing in. “Abeg, say the bike is your own.”',
    requires: { ...ABJ, onFoot: true },
    choices: [
      { id: 'cover', label: '“This is my power bike”', result: 'The officer looked at the bike, at you, at the bike. “With Bajaj?” But he left. The rider carried you free for the rest of the day.', outcome: { goodDeeds: 1, needs: { fun: 12, energy: 6 } } },
      { id: 'point', label: 'Point at him', result: 'They crushed the bike that evening with two hundred others. He looked at you once. You will remember that look.', outcome: { notoriety: 1, needs: { social: -12, fun: -8 } } },
    ],
  },
  {
    id: 'abj-zuma-face', icon: '🪨', title: 'The face on Zuma Rock', weight: 10,
    scene: 'The bus has stopped on the Kaduna road. The driver is pointing at Zuma Rock. “The face has winked. I am not moving.” Half the passengers are praying, the other half are doing TikTok.',
    requires: ABJ,
    choices: [
      { id: 'look', label: 'Look at the face', result: 'You looked for a long time. It did look like it was looking back. You have decided not to tell anybody.', outcome: { needs: { fun: 14, energy: -3 } } },
      { id: 'pray', label: 'Lead the prayer', result: 'You prayed with authority you did not know you had. The driver started the engine. Somebody asked for your church’s address.', outcome: { goodDeeds: 1, needs: { social: 16 } } },
    ],
  },
  {
    id: 'abj-mpape', icon: '🫨', title: 'Mpape tremor', weight: 8,
    scene: 'The ground is shaking. Not “trailer passing” shaking: Abuja is actually trembling. People are running out of the houses in towels. One man has brought only his plasma TV.',
    requires: ABJ,
    choices: [
      { id: 'run', label: 'Run outside', result: 'You stood in the road with the whole street for an hour. Somebody started selling pure water and tremor T-shirts.', outcome: { needs: { energy: -6, social: 14, fun: 6 } } },
      { id: 'help', label: 'Help the old woman next door', result: 'You carried Mama out with her radio. The agency said it was “not an earthquake, just earth movement”. Mama said “it is the same”.', outcome: { goodDeeds: 2, needs: { energy: -8, social: 10 } } },
    ],
  },
  {
    id: 'abj-embassy', icon: '🛂', title: 'Embassy queue', weight: 9,
    scene: 'The queue outside the embassy in the Diplomatic Zone started at 4am. A man in a short tie walks down the line whispering. “Japa package. Canada, guaranteed, I know the consul’s driver. ₦15k to start.”',
    requires: { ...ABJ, day: true, onFoot: true },
    choices: [
      {
        id: 'pay', label: 'Start the package · ₦15k', result: 'He gave you a form for “Canadia Immigration” and a passport photo of somebody else. He is no longer on this street.', outcome: { money: -15_000, flag: 'scammed', needs: { fun: -10 } },
        rare: { chance: 0.02, result: '🛂 God of wonders! He really knew the driver. Your visa came out in a week. The whole queue wants his number.', outcome: { flag: 'visa', needs: { fun: 40, social: 20 } } },
      },
      { id: 'queue', label: 'Stay on the queue', result: 'You reached the window at 3:58pm. They close at 4. “Come back tomorrow with two more photocopies.”', outcome: { needs: { energy: -14, fun: -6 } } },
    ],
  },
  {
    id: 'abj-airport-touts', icon: '🧳', title: 'Airport protocol', weight: 9,
    scene: 'Six men in fake lanyards have surrounded you. “Protocol! VIP! No queue!” One is already pushing your bag on a trolley you did not ask for, in a direction that is not the terminal.',
    requires: { ...ABJ, onFoot: true },
    choices: [
      { id: 'pay', label: 'Pay for “protocol” · ₦5k', result: 'They walked you to the same queue as everybody else and stood beside it proudly.', outcome: { money: -5_000, needs: { fun: -5 } } },
      { id: 'grab', label: 'Collect your bag back', result: 'Tug of war. You won the bag but the trolley man wants ₦1,000 “for trolley”. You paid. It was not his trolley.', outcome: { money: -1_000, needs: { energy: -5, fun: 5 } } },
    ],
  },
  {
    id: 'abj-glory-dome', icon: '⛪', title: 'Sunday on Airport Road', weight: 10,
    scene: 'Service has just closed at the Glory Dome and a hundred thousand people are entering Airport Road at once. An usher in a sash has taken over traffic control from the police, and is doing it better.',
    requires: { ...ABJ, driving: true, day: true },
    choices: [
      { id: 'obey', label: 'Obey the usher', result: 'She cleared four lanes with one hand and a whistle. You moved. Somebody pushed a sticker through your window: “I AM A WONDER”.', outcome: { needs: { fun: 8, social: 6 } } },
      { id: 'shortcut', label: 'Take the bush shortcut', result: 'The shortcut ended at a river. You reversed for one kilometre with forty other clever people behind you.', outcome: { needs: { energy: -12, fun: -8 } } },
    ],
  },
  {
    id: 'abj-gbagyi-potter', icon: '🏺', title: 'Ushafa pots', weight: 9,
    scene: 'A Gbagyi woman is walking down from Ushafa with six clay pots stacked on her shoulder, not her head, the way her people have always carried. She says the big one keeps water colder than your fridge, and needs no NEPA.',
    requires: { ...ABJ, day: true },
    choices: [
      { id: 'buy', label: 'Buy the big pot · ₦4k', result: 'She was right. The water is cold, tastes of rain, and has never once tripped off.', outcome: { money: -4_000, goodDeeds: 1, needs: { fun: 10, energy: 6 } } },
      { id: 'learn', label: 'Ask how it is made', result: 'She sat you down and showed you the coil and the fire. Your own pot looked like a mistake, but she praised it anyway.', outcome: { knowledge: 0.2, needs: { fun: 14, social: 12, hygiene: -6 } } },
    ],
  },
  {
    id: 'abj-senate-nap', icon: '😴', title: 'Distinguished sleeper', weight: 10,
    scene: 'You are in the public gallery. On the floor, a senator has been asleep since the opening prayer, mouth open, cap on the desk. The camera is slowly panning towards him. He is your senator.',
    requires: { ...ABJ, day: true, onFoot: true },
    choices: [
      { id: 'cough', label: 'Cough loudly to wake him', result: 'He jumped up and shouted “I SECOND THE MOTION!” There was no motion. It has been passed anyway.', outcome: { needs: { fun: 20, social: 8 } } },
      { id: 'photo', label: 'Snap him', result: 'Your photo is the new “Me in Monday meeting” meme. His media aide has offered you ₦7,000 to delete the original.', outcome: { money: 7_000, notoriety: 1, flag: 'viral' } },
    ],
  },
  {
    id: 'abj-lotto', icon: '🎰', title: '“CBN has approved your fund”', weight: 8,
    scene: 'An email from “Dr. Godwin, Director of Foreign Remittance, CBN Abuja” says your $4.5 million inheritance is ready. A man in a CBN lanyard is conveniently standing at the gate of the headquarters to collect the ₦15k “clearance”.',
    requires: ABJ,
    choices: [
      {
        id: 'claim', label: 'Pay the clearance · ₦15k', result: 'The lanyard said “CBN: Christ Bible Network”. He and your ₦15k have ascended.', outcome: { money: -15_000, flag: 'scammed', needs: { fun: -12 } },
        rare: { chance: 0.02, result: '🎰 Wonders! It was a real unclaimed dividend from a company your grandfather bought shares in. ₦50,000, with a receipt.', outcome: { money: 50_000, flag: 'jackpot', needs: { fun: 30 } } },
      },
      { id: 'reply', label: 'Reply “I am also a prince”', result: 'You and the scammer have been emailing for a week. He has started asking YOU for money.', outcome: { needs: { fun: 12 } } },
    ],
  },
  {
    id: 'abj-rain', icon: '🌧️', title: 'Abuja rain', weight: 12,
    scene: 'The sky over Aso Rock has gone black in four minutes. The wind has taken a canopy, two umbrellas and one man’s wig. The first drops are the size of sachet water.',
    requires: ABJ,
    choices: [
      { id: 'shelter', label: 'Shelter at the filling station', result: 'Sixty strangers under one roof. Somebody shared groundnut. An okada man gave a full analysis of the Super Eagles.', outcome: { needs: { social: 10, energy: 4 } } },
      { id: 'run', label: 'Run for it', result: 'A Prado went through a puddle and repainted you brown from the neck down. The driver waved.', outcome: { needs: { hygiene: -18, fun: -4, energy: -4 } } },
    ],
  },

  /* ---- While an Abuja live event is on (game/live.ts) ---- */
  {
    id: 'abj-ev-inauguration', icon: '🇳🇬', title: 'Road closed for swearing-in', weight: 22,
    scene: 'Every road to Eagle Square is blocked by soldiers. A man beside you is selling “ACCESS ALL AREA” tags printed at a business centre this morning.',
    requires: { ...ABJ, event: 'inauguration' },
    choices: [
      { id: 'tag', label: 'Buy a tag · ₦2k', result: 'The soldier read it. “Access All Aera.” He let you through anyway because the queue behind you was long.', outcome: { money: -2_000, needs: { fun: 16, social: 14 } } },
      { id: 'tv', label: 'Watch from a shop TV', result: 'The new man promised light, roads and jobs. The shop’s generator went off halfway through “light”.', outcome: { needs: { fun: 10, social: 8 } } },
    ],
  },
  {
    id: 'abj-ev-delegates', icon: '💵', title: 'A delegate has lost his envelope', weight: 22,
    scene: 'A delegate in a brand-new kaftan is turning his pockets inside out by the gutter. “Three aspirants! Three envelopes! I have only two!” There is a fat brown envelope by your left foot.',
    requires: { ...ABJ, event: 'delegates' },
    choices: [
      { id: 'return', label: 'Give it to him', result: 'He hugged you, peeled off one $100 note and said “for your conscience”. The bureau de change gave you something for it.', outcome: { money: 12_000, goodDeeds: 2, needs: { social: 10 } } },
      { id: 'step', label: 'Stand on it until he leaves', result: 'Dollars. Real ones. He voted for all three aspirants and still lost.', outcome: { money: 40_000, notoriety: 3 } },
    ],
  },
  {
    id: 'abj-ev-carnival', icon: '🎭', title: 'Masquerade on the loose', weight: 22,
    scene: 'A carnival masquerade twice your height has left the parade and is chasing people down Independence Avenue with a cane. It has seen you. It has stopped. It is tilting its head.',
    requires: { ...ABJ, event: 'carnival' },
    choices: [
      { id: 'dance', label: 'Dance for it', result: 'You gave it legwork. It gave you legwork back. The crowd sprayed you both and the masquerade took 70%.', outcome: { money: 3_000, needs: { fun: 26, social: 18, energy: -8 } } },
      { id: 'run', label: 'Run', result: 'It chased you for three streets in full costume and still caught you. Six strokes. Everybody says it is a blessing.', outcome: { needs: { energy: -14, fun: 8 } } },
    ],
  },
  {
    id: 'abj-ev-mace', icon: '🏃🏾', title: 'Man with a mace', weight: 22,
    scene: 'A man in a torn agbada is sprinting towards you from the National Assembly, carrying something long and golden wrapped in a wrapper. Behind him: the Sergeant-at-Arms, eleven policemen and one senator who is surprisingly fast.',
    requires: { ...ABJ, event: 'mace' },
    choices: [
      { id: 'trip', label: 'Stick your leg out', result: 'He flew. The mace flew further. You caught it. The Senate has passed a vote of thanks and ₦20,000 “from the Senate President’s pocket”.', outcome: { money: 20_000, goodDeeds: 2, needs: { fun: 20 } } },
      { id: 'hide', label: '“Enter here, quick!”', result: 'You hid him behind a suya stand. He gave you ₦10,000 and let you hold the mace. It is heavier than democracy looks.', outcome: { money: 10_000, notoriety: 3, needs: { fun: 24 } } },
    ],
  },
  {
    id: 'abj-ev-snake', icon: '🐍', title: 'The accused', weight: 22,
    scene: 'Outside the Secretariat, a snake charmer from Kano has been hired by the Ministry. He is holding up a small, confused python. “This is the one. It has confessed.” The snake does not look like it has ₦36 million.',
    requires: { ...ABJ, event: 'snake' },
    choices: [
      { id: 'hold', label: 'Hold the snake for a photo · ₦1k', result: 'It wrapped round your neck gently. You both looked at the camera like people who have been blamed for things.', outcome: { money: -1_000, needs: { fun: 22, social: 14 } } },
      { id: 'ask', label: 'Ask the clerk where she was', result: 'The accounts clerk said she is “not at liberty”, entered a brand-new Lexus, and drove off. The python watched her go.', outcome: { goodDeeds: 1, needs: { fun: 16 } } },
    ],
  },
  {
    id: 'abj-ev-taskforce', icon: '🚜', title: 'Everything must go', weight: 22,
    scene: 'A trader is running from Wuse Market with forty pairs of jeans on her head and the task force behind her. “Customer! Customer! Three for ₦5,000! Buy am now before they seize am!”',
    requires: { ...ABJ, event: 'taskforce' },
    choices: [
      { id: 'buy', label: 'Buy three · ₦5k', result: 'Original “Levi’s Strauss & Sons & Brothers”. You sold two to your neighbours before you even got home.', outcome: { money: 4_000, needs: { fun: 10 } } },
      { id: 'help', label: 'Carry half and run with her', result: 'You ran to Zone 4 with twenty jeans on your head. She blessed you, your children and your unborn grandchildren.', outcome: { goodDeeds: 2, needs: { energy: -14, social: 12 } } },
    ],
  },
  {
    id: 'abj-ev-jubril', icon: '🕴🏾', title: 'Ear inspection', weight: 22,
    scene: 'A man with a megaphone at the Villa gate is holding up two photographs. “Look at the EAR. This ear is from 2015. THIS ear is from Sudan.” A crowd is nodding. A DSS man is also nodding, slowly.',
    requires: { ...ABJ, event: 'jubril' },
    choices: [
      { id: 'argue', label: '“It is the same ear”', result: 'You are now “part of them”. Somebody demanded to see YOUR old photographs. Your ears did not match either.', outcome: { needs: { fun: 18, social: -6 } } },
      { id: 'join', label: 'Collect a photocopy · ₦200', result: 'You studied the ears on the bus home. You are no longer sure about anybody. Your landlord looks different lately.', outcome: { money: -200, needs: { fun: 22 } } },
    ],
  },
  {
    id: 'abj-ev-regatta', icon: '🚤', title: 'Jet ski in the car park', weight: 22,
    scene: 'A senator’s son has missed the turn at the Jabi regatta and beached his jet ski in the mall car park, between a Corolla and a suya stand. He is still revving it.',
    requires: { ...ABJ, event: 'regatta' },
    choices: [
      { id: 'push', label: 'Help push it back in', result: 'Four of you carried it back to the lake. He paid each of you ₦5,000 and immediately crashed into a fisherman.', outcome: { money: 5_000, needs: { energy: -10, hygiene: -8, fun: 12 } } },
      { id: 'bet', label: 'Bet ₦2k on the fishermen', result: 'The fishermen’s canoe beat three speedboats that ran out of fuel. Double your money.', outcome: { money: 2_000, needs: { fun: 18 } } },
    ],
  },
  {
    id: 'abj-ev-eagles', icon: '🦅', title: 'Team bus', weight: 22,
    scene: 'The Super Eagles bus is stuck in traffic right beside you. A window slides open. The striker who missed That Penalty is looking down at you, waiting to see what you will say.',
    requires: { ...ABJ, event: 'eagles' },
    choices: [
      { id: 'forgive', label: '“We have forgiven you”', result: 'He nearly cried. He threw his training bib out of the window. It is on your wall forever.', outcome: { goodDeeds: 1, needs: { fun: 26, social: 16 } } },
      { id: 'coach', label: 'Explain 4-4-2 to him', result: 'You coached the national team through a bus window for six minutes. The actual coach wrote something down.', outcome: { needs: { fun: 22, social: 8 } } },
    ],
  },
  {
    id: 'abj-ev-palliative', icon: '🍚', title: 'Rice on the move', weight: 22,
    scene: 'A man is jogging past with a 50kg bag of rice on his head, two cartons of Indomie under each arm and a sachet of salt in his teeth. The bag is leaking. There is a line of rice all the way back to Garki.',
    requires: { ...ABJ, event: 'palliative' },
    choices: [
      { id: 'tell', label: 'Tell him it is leaking', result: 'He turned to look, and lost the Indomie. You helped him pack it. He gave you one carton “for your honesty”.', outcome: { goodDeeds: 1, needs: { hunger: 30, social: 8 } } },
      { id: 'sweep', label: 'Follow behind with a nylon', result: 'You harvested four derica of federal rice from the road. Stones included, free of charge.', outcome: { notoriety: 1, needs: { hunger: 22, hygiene: -6 } } },
    ],
  },
  {
    id: 'abj-ev-protest', icon: '✊🏾', title: 'Solidarity forever', weight: 22,
    scene: 'The NLC march has filled the road from Unity Fountain. A comrade in a red beret hands you a placard: “EVEN THE POOR ARE TIRED”. Further up, the water cannon is warming its engine.',
    requires: { ...ABJ, event: 'protest' },
    choices: [
      { id: 'march', label: 'March and sing', result: 'You sang “Solidarity Forever” without knowing verse two. Nobody knows verse two. The water cannon had no water.', outcome: { goodDeeds: 1, needs: { social: 22, fun: 14, energy: -10 } } },
      { id: 'sell', label: 'Sell them pure water', result: 'Comrades are thirsty people. You cleared two bags at protest price.', outcome: { money: 3_000, needs: { energy: -6 } } },
    ],
  },
  {
    id: 'abj-ev-final', icon: '⚽', title: 'Viewing centre is full', weight: 16,
    scene: 'Every viewing centre in Kubwa is full to the gutter for the cup final. A man has put a small TV on a wheelbarrow and is charging ₦200 a head. Forty people are watching a screen the size of a slice of bread.',
    requires: { ...ABJ, event: 'final' },
    choices: [
      { id: 'pay', label: 'Pay ₦200', result: 'You saw nothing, but you heard everything. When the goal came, the wheelbarrow tipped over and that became the replay.', outcome: { money: -200, needs: { fun: 22, social: 22 } } },
      { id: 'commentate', label: 'Commentate for the back row', result: 'You described a match you could not see. The back row say it was the best final they have ever watched.', outcome: { needs: { fun: 18, social: 26 } } },
    ],
  },
];
