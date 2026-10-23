// Gameplay tips: shown as toasts while you play (ui/GameTips.tsx) and listed under their topic in the
// Help app (ui/Help.tsx). Tapping a tip toast opens Help on that tip's topic.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Help topics, in the order the Help app lists them. */
export type TopicId = 'start' | 'needs' | 'money' | 'home' | 'travel' | 'events' | 'social' | 'politics' | 'crime' | 'phone' | 'legacy';

export interface Tip {
  topic: TopicId;
  text: string;
}

const group = (topic: TopicId, texts: string[]): Tip[] => texts.map((text) => ({ topic, text }));

export const TIPS: Tip[] = [
  ...group('start', [
    '🗺️ The Map shows all the places in the city. Tap a spot to travel there.',
    '🎯 Not sure what to do? Open Goals and pick a daily quest to follow.',
    '🚶🏾 Walk the streets for random encounters. Your choices change your needs, your reputation and sometimes your luck.',
    '👆🏾 Tap your avatar (top left) to see your mood and which need is lowest.',
    '🔔 Tap a notification to jump straight to what it is about.',
    '📚 Tap any tip to read more about it in the Help app.',
    '💾 Your game saves itself. Sign in so your money, house and friends follow you to any device.',
    '🪫 Game running slow? Tap the battery icon for Low Power Mode: fewer shadows, smoother play.',
    '🔋 Low Power Mode reduces visual quality but makes the game run faster on older phones.',
  ]),

  ...group('needs', [
    '🍛 Eat and sleep before your shift, not after. Low bars kill your performance.',
    '😴 A short nap helps, but only a full sleep fills the Energy bar completely.',
    '🫧 A shower or bucket bath keeps Hygiene up, but you need water in the tank.',
    '🚽 No bath nearby? A toilet stop freshens you up a little. On a Sapa / Gbese start you can use mosque and motor-park toilets.',
    '😊 When your mood is high, everything you do works better. Keep your needs out of the red.',
    '🎉 Fun goes up from TV, games, football, music and parties. Don\'t just grind, enjoy life.',
    '💬 Social goes up when you hang out with people, host guests or message friends.',
    '🛋️ Stand idle at home with a bar running low and you go and sort it out yourself: bed, shower or cooker. Any tap takes over again.',
    '🛍️ Hungry with no cooker? Order food on Jumia.',
    '🚑 Never let Hunger hit zero: you faint, wake up in hospital and pay ₦15,000. Eating also gives you a little Energy.',
    '☕ Out and hungry? Mai Shayi and market snacks fill you up without going home.',
    '🤝 Invite friends to your house. Guests make your Social need go up fast.',
    '🎵 The nightclub is great for Fun and Social, and for spraying money to flex on everyone.',
  ]),

  ...group('money', [
    '💼 Check the Jobs app daily. Better jobs need more Knowledge, so read books and study to level up.',
    '⏰ A job pays for the time you put in at the workplace. Clock in when the shift starts and stay to the end for the full day’s pay.',
    '💵 Each day you work adds +2% pay, up to +40%. Show up consistently.',
    '💰 Side hustles like Keke, POS and Okada pay quick cash between shifts.',
    '🛺 Hustle payouts are capped per hour. Mix gigs with a proper job.',
    '🍳 Train cooking, mechanic, tailoring or trading to rank up from Trainee to Manager.',
    '🏪 Open your own Suya Spot, Provision Store or Keke Fleet once your career rank is high enough.',
    '🛒 Open a business at a place on the map and sell to players who walk in. Busy places bring more trade, so pick your spot well.',
    '📦 A shop is only open while something is on the shelf. Restock before you travel.',
    '🏷️ Stalls at each place are limited. Grab a good spot before someone else does.',
    '📈 The Invest app lets you grow savings. Check each venture\'s risk tag before you put money in.',
    '🏦 The Bank app keeps your money safe. Interest adds up over time.',
    '🏦 Need capital? The Bank lends against what you own: cash, savings, houses, cars and jets. Interest is added every day and a loan falls due after 7 days. Miss it by a day and the bank takes your things.',
    '🧾 Income tax goes to the treasury and the president sets the rate. When tax goes up, every fare goes up with it.',
    '👛 Keep a little cash on hand for rides and food. Don\'t invest everything.',
    '👑 Made it big? The Hustlers app ranks the richest players, and who made the most money this week.',
  ]),

  ...group('home', [
    '🏠 Each piece of furniture unlocks actions: bed, cooker, shower, TV and more.',
    '🪑 Tap placed furniture to move or sell it. Rearrange your space anytime.',
    '🎨 You can recolour furniture and walls. There are eight colours to pick from.',
    '⚡ Many items need power. Buy a generator and keep it fuelled, or get solar panels.',
    '🔋 Save for a generator before you buy a TV. No light means no TV.',
    '🧾 NEPA light is dear. A generator or solar is cheaper to run.',
    '🔌 A small gen cannot carry the oven or the standing AC. A bigger set carries more and runs longer on a tank.',
    '⚡ A voltage stabilizer stops NEPA’s high voltage from blowing your appliances.',
    '🌩️ Blackouts hit the whole server at once. Have a backup before the next one.',
    '🔧 Appliances can spoil. Tap the one with a spanner over it and pay the repairer.',
    '⚠️ When NEPA brings light back with high voltage it can blow an appliance.',
    '💧 Your water tank empties with use. Call Mai Ruwa from Phone → NEPA when it runs low, or pump it when you have power.',
    '🏗️ A Sapa / Gbese start has nothing but can build up from the ground. One wall at a time.',
    '🏘️ Buy land and build houses in estates around Kaduna, Abuja, Lagos and Kano. Rent them out for passive income.',
    '📹 A CCTV camera watches a cone in front of it. Point cameras at your doors and valuables.',
    '🔌 Cameras need light too. No power, no CCTV.',
    '🧹 Hire a cook, cleaner or security guard from your property page in the House app.',
    '🕴🏾 The Hire app gets you a driver, a nanny or a bodyguard.',
    '🏨 Book a hotel room at reception and it is yours until the stay runs out. Come and go as you like.',
  ]),

  ...group('travel', [
    '🚕 Call a taxi from the Map if you\'re in a hurry. Or buy a car and drive yourself.',
    '🚔 Police checkpoints on main roads: you can pay, argue or speed off. Each choice has a risk.',
    '🚗 Own a car? Keep it fuelled and maintained. Check its condition in Autos.',
    '🔩 Car parts wear with every trip. See the mechanic in Autos before one spoils.',
    '🛑 A spoilt engine, battery or tyre means the car will not move at all.',
    '🏷️ A car in bad condition sells for less. Fix it before you sell it.',
    '⛽ Tank low? Pour in a jerrycan from Phone → Hustle.',
    '⛽ During fuel scarcity, prices spike. Stock up on jerrycans when fuel is cheap.',
    '✈️ To reach another city, go inside the airport and tap “Book a flight”.',
    '🛩️ A private jet from Autos flies faster and skips the search at the gate.',
    '🧳 NDLEA searches every ticketed passenger. Do not fly with anything from the Plug in your bag.',
    '🌙 Night time is dangerous. Stay home or stick to safe areas after dark.',
  ]),

  ...group('events', [
    '🎪 Every two real hours a server-wide event starts: fuel scarcity, protests, Durbar and more. Each one lasts 40 minutes.',
    '🏇 Durbar is on? Ride the parade for a prize.',
    '⚽ Cup final: place your bet in the phone before kickoff. The server settles it at full time.',
    '💃🏾 Owambe at the city square on Saturdays. Dance well in the rhythm game and the guests spray you.',
    '🐏 Hawan Sallah brings a ram. Feed it at home, then share the meat with the neighbours.',
  ]),

  ...group('social', [
    '🔐 Sign in and pick a username to use Messages, friends and money transfers.',
    '👥 Search and add players as friends. Message them, send money, or invite them over.',
    '👥 Start a group in Messages to chat with all your people at once.',
    '💸 Short on cash? Request money from a friend in Messages.',
    '💍 Build a bond through date nights. Propose with a ring and get married. Divorce costs ₦100k.',
    '💞 Date night pays you both and grows your bond.',
    '🏆 Check Goals daily: 4 daily and 3 weekly quests, each with a cash reward.',
    '🥇 Seasons last two weeks and the top 10 win prizes.',
    '🎲 The Games app has board games against other players, free or for a stake.',
    '🕌 Visit the mosque for prayers and good deeds. Your reputation matters.',
  ]),

  ...group('politics', [
    '🏛️ Vote in elections for president, Kaduna governor, FCT Minister, Lagos governor, Kano governor, IGP and EFCC chair. Your vote shapes the server.',
    '🗳️ Elections come every evening. Voting stays open for 1 hour and the winner holds office for a day. Don\'t miss it.',
    '📝 Want a post? File to run in the Politics app on your phone.',
    '🪧 Running for office? Campaign with rallies, posters and crowds.',
    '🚨 Buying votes works until the EFCC catches you. Then you are disqualified, fined and jailed.',
    '📢 The president sets the tax rate and shares the treasury between Kaduna, Abuja, Lagos, Kano, police, EFCC and palliatives. Each city’s government spends its own share.',
    '🐍 Office holders can \'let a snake swallow\' treasury money. It pays well but you might get caught.',
    '🚁 In office you ride free: the helicopter, the convoy and the jet are on the treasury.',
    '🛵 A governor can ban okada in their city. Check who is in office before you plan your hustle.',
    '📰 The Politics app\'s News tab keeps the week\'s government notices.',
  ]),

  ...group('crime', [
    '🥷 Stealing is risky. A bigger police budget means more arrests. Think before you thief.',
    '👀 To steal, stand next to someone inside a building and tap Steal on their nametag.',
    '🛏️ Big furniture takes long to carry out of a house. A chair is much quicker than a bed.',
    '⏳ Caught breaking in? That house is closed to you for 30 minutes.',
    '📹 A house that has you on film is a trap. Go back and the police are waiting.',
    '⚠️ Yahoo pays well but the EFCC is always watching. Victims can report you too.',
    '🔒 Crime can end with fines, jail and a ruined reputation. Choose wisely.',
    '⛓️ In a cell? Wait out your time or pay bail.',
    '🗡️ Build street rep from small-time thief up to Godfather and take over your city\'s motor park.',
    '💸 If someone robs you, open the Police app and file a report. They pay you back plus a fine.',
    '🔌 A meter bypass from the Black Market makes light cheap, but NEPA, the police, a neighbour or a visitor can catch the wire.',
    '👮🏾 The IGP sets patrols and jail terms and the EFCC chair sets fines. Know who is in office before you move.',
  ]),

  ...group('phone', [
    '📱 Your phone has everything: Jobs, Bank, Hustle, Messages, Invest and more. Explore the apps.',
    '🛍️ The App Store has extra apps to download: Legacy, Pidgin AI, Baba Online and a few shady ones.',
    '🕶️ Shady apps are in the App Store too. Remember the police do check phones.',
    '🗣️ Pidgin AI turns your grammar into pure Naija pidgin.',
    '🔮 Baba Online is a native doctor on call, day and night. No refunds.',
    '📻 Put a Hi-Fi Speaker in your house and tap it to pick a station. It plays whenever you are home and there is light.',
    '📷 Take a photo with the Camera and post it on Snap.',
    '👗 Change your look in the Closet.',
    '📲 A better phone changes how your in-game phone looks, and it is worth more.',
  ]),

  ...group('legacy', [
    '🏅 There are 35 achievements to chase, and a street-reputation ladder to climb.',
    '🏆 Download Legacy from the App Store to see your hall of fame and how your past lives ended.',
    '🔄 Tired of this life? Settings → Account → Born again, and you draw a fresh start.',
  ]),
];

/** Tip toasts carry this in front, which is how a tapped toast is known to be a tip. */
export const TIP_PREFIX = '💡 ';

export const tipToast = (tip: Tip) => `${TIP_PREFIX}${tip.text}`;

export const isTipToast = (text: string) => text.startsWith(TIP_PREFIX);

const BY_TEXT = new Map(TIPS.map((t) => [t.text, t]));

/** The tip a toast is showing, if it is one. */
export const tipOfToast = (text: string): Tip | null => (isTipToast(text) ? BY_TEXT.get(text.slice(TIP_PREFIX.length)) ?? null : null);

interface HelpState {
  /** Tips pop up while you play. Switched off from the Help app. */
  tipsOn: boolean;
  /** One-shot: the tip the Help app should open on (set by tapping a tip toast). */
  focus: Tip | null;
  setTipsOn(on: boolean): void;
  setFocus(tip: Tip | null): void;
}

export const useHelp = create<HelpState>()(
  persist(
    (set) => ({
      tipsOn: true,
      focus: null,
      setTipsOn: (tipsOn) => set({ tipsOn }),
      setFocus: (focus) => set({ focus }),
    }),
    { name: 'kaduna-life-help', partialize: (s) => ({ tipsOn: s.tipsOn }) },
  ),
);
