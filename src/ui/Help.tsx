import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { TIPS, useHelp, type Tip, type TopicId } from '../game/tips';
import { Chevron } from './Icons';

interface Topic {
  id: TopicId;
  icon: string;
  title: string;
  /** One line shown under the title while the topic is closed. */
  hint: string;
  /** Phone apps this topic is about: shown as shortcuts under it. */
  apps?: string[];
  body: string[];
}

/** Shortcut labels for the apps a topic links to (ids as in ui/Phone.tsx). */
const APP_LINKS: Record<string, string> = {
  goals: '🎯 Goals', settings: '⚙️ Settings', mall: '🛍️ Jumia', jobs: '💼 Jobs', hustle: '🛺 Hustle', career: '🎓 Career',
  business: '🏪 Business', invest: '📈 Invest', bank: '🏦 Bank', gida: '🏠 House', light: '💡 NEPA', hire: '🤝 Hire',
  ride: '🚕 Bolt', cars: '🚗 Autos', messages: '💬 Messages', family: '💞 Family', games: '🎲 Games', civic: '🏛️ Civic',
  police: '🚔 Police', efcc: '🕵🏾 EFCC', inec: '🗳️ INEC', store: '🛍️ App Store', closet: '👗 Closet', radio: '📻 Radio', camera: '📷 Camera',
};

const TOPICS: Topic[] = [
  {
    icon: '🚀',
    id: 'start',
    title: 'Getting started',
    hint: 'Move around, use things, read the screen',
    apps: ['goals', 'settings'],
    body: [
      'The bar at the bottom has Home (your place), Buy (furniture), Map (travel the city) and Phone.',
      'Tap a spot to walk there. Tap furniture to see what you can do with it: eat, sleep, wash, relax and more. Tap your avatar (top left) to see your mood and which need is lowest.',
      'Your game is auto-saved. Sign in so your money, house and friends follow you to any device.',
      'Tips pop up while you play. Tap one to land here on its topic. You can switch them off at the bottom of this page.',
    ],
  },
  {
    icon: '🍛',
    id: 'needs',
    title: 'Needs and mood',
    hint: 'Hunger, Energy, Fun, Social, Hygiene',
    apps: ['mall'],
    body: [
      '🍛 Hunger: cook at home, order food on Jumia, or grab Mai Shayi and market snacks. Food gives a little Energy too.',
      '🚑 If Hunger runs out you faint and wake up in hospital with a ₦15,000 bill. You get a warning when it is low and a last call just before.',
      '⚡ Energy: sleep in a bed. A short nap helps, but only a full sleep fills the bar.',
      '🎉 Fun: TV, games, football, music, parties. 💬 Social: hang out with people, host guests, message friends.',
      '🫧 Hygiene: shower or bucket bath (needs water). A toilet stop tops it up a little: on a Sapa / Gbese start you can use mosque and motor-park toilets.',
      'When bars run low your mood drops, and a bad mood hurts everything you do. Keep them out of the red.',
    ],
  },
  {
    icon: '💼',
    id: 'money',
    title: 'Making money',
    hint: 'Jobs, Hustle, your own business',
    apps: ['jobs', 'hustle', 'career', 'business', 'invest', 'bank'],
    body: [
      'Jobs app: apply for a job in any city. With enough 📚 Knowledge it is yours (you raise Knowledge by reading, practising and learning). When your shift is on, a “Time for work” chip takes you to your workplace: by road in your own city, by air to another. Stay to the end and clock out for the full day’s pay, and do the work that turns up at your post for a bonus. Leave early and you are paid for the time you put in. Each day worked adds +2% pay, up to +40%.',
      'Hustle (on your phone): side gigs like keke, POS and okada. Payouts are capped per hour so nobody farms them.',
      'Career: train cooking, mechanic, tailoring or trading and rank up from Trainee to Manager for higher pay.',
      'Business: once your skills are up, open a Suya Spot, Provision Store, Fashion Stall, Drinks Bar, Gadget Kiosk or Keke Fleet, buy stock at wholesale and set your prices. Stock only runs out when players buy it, and each sale is paid into your wallet.',
      'Player shops: every business is a stall at a place on the map (a bar at the club, a kiosk in the market). Walk in to buy at the shelf price, or order from the Business app and pay delivery. Stalls are limited, and a shop is open for as long as it has something on the shelf.',
      'Income tax goes to the shared treasury, set by the elected president (0 to 20%).',
      'Drivers pass the tax on: every keke, okada, cab and helicopter fare rises by the tax percentage.',
    ],
  },
  {
    icon: '🏠',
    id: 'home',
    title: 'Your home',
    hint: 'Build, furnish, power and water',
    apps: ['gida', 'light', 'hire'],
    body: [
      'Buy: put furniture in your house. Each piece unlocks actions, like a bed, cooker, shower or TV. Tap a placed item to move or sell it.',
      'House: build walls and extend your home. A Sapa / Gbese start has nothing and can build up from the ground.',
      'NEPA (light): many items need power. Light follows you: it runs (and bills) only while you are in your house, and goes off by itself when you step out. Blackouts hit the whole server at once, so buy a generator (keep it fuelled) or a solar panel, and watch fuel prices. A small generator cannot carry everything: heavy things like the oven, hot shower or standing AC need a bigger set (3.5kVA, 10kVA or the 30kVA soundproof one), which also runs longer on a tank. A voltage stabilizer stops NEPA’s high voltage from blowing your appliances.',
      'Water: the compound tank empties with use. Call Mai Ruwa from Phone → NEPA when it runs low, or pump it when you have power.',
      'Staff, visitors and house invites are in your phone. Guests make Social go up fast.',
    ],
  },
  {
    icon: '🗺️',
    id: 'travel',
    title: 'Getting around',
    hint: 'Map, rides, driving',
    apps: ['ride', 'cars'],
    body: [
      'Map: jump to places in the city like the market, mosque, park, motor park and mall.',
      'Bolt: call a taxi. Autos: buy or rent a car, then drive it yourself (WASD or arrow keys, or the on-screen pads).',
      'Flying: inside an airport, tap “Book a flight” for the flight desk. Buy a ticket to another city, or fly your own private jet (sold in Autos): faster, and no search. NDLEA searches every ticketed passenger, so anything from the Plug in your bag gets you arrested at the gate.',
      'In the air: the bar at the bottom changes. On your own jet, “Service” brings champagne, the chef’s plate, a bed and a shower, all free. On a ticketed flight, “Trolley” gives one free meat pie and sells the rest. Each thing is served once a flight.',
      'Police checkpoints on main roads will ask for "something for the boys". You can pay, argue or speed off, and each choice has a risk.',
    ],
  },
  {
    icon: '🎪',
    id: 'events',
    title: 'Live events',
    hint: 'Things that hit the whole server',
    body: [
      'Every two real hours a 40-minute event starts for everyone: fuel scarcity, a protest, Durbar, a cup final, a mega owambe or a grid collapse.',
      'Durbar: ride the parade for a prize. Cup final: bet in the phone before kickoff and the server settles it at full time.',
      'Owambe: weddings at the city square (Murtala Square in Kaduna, Eagle Square in Abuja, Tafawa Balewa Square in Lagos, Kofar Kudu in Kano) on Saturdays or when you get an invite. Spray money, eat and dance in the rhythm game for tips.',
      'Hawan Sallah brings a ram you can feed and share.',
    ],
  },
  {
    icon: '👥',
    id: 'social',
    title: 'Friends and family',
    hint: 'Circle, love, goals',
    apps: ['messages', 'family', 'goals', 'games'],
    body: [
      'You need a signed-in account with a username for social apps. Search a player, add them, message them and send or request money.',
      'Date night with your babe pays you both and grows your bond. Host it from the Love app.',
      'Love: ask a friend out, build a bond on date nights, propose with a ring, marry. Divorce costs ₦100k.',
      'Goals: 4 daily and 3 weekly quests, plus two-week seasons with prizes for the top 10. Check them daily.',
    ],
  },
  {
    icon: '🏛️',
    id: 'politics',
    title: 'Politics',
    hint: 'Elections, taxes, corruption',
    apps: ['civic', 'inec'],
    body: [
      'Civic: players vote for president, Governor of Kaduna, FCT Minister (Abuja), Governor of Lagos, Governor of Kano, IGP and EFCC chair. File to run for any post in the Civic app on your phone, or at a secretariat. There is an election every 3 days: voting is open for 1 hour, from 8 pm to 9 pm Nigerian time, and the winner holds office for 3 days, until the next result. If nobody runs for a post, whoever held it is out and the seat stays empty until the next election.',
      'The president sets the tax, shares the treasury between Kaduna State, FCT Abuja, Lagos State, Kano State, police, EFCC and federal palliatives, and signs the pay list: what every office is paid a game day, the president’s own included (Civic → Treasury → Pay). Everybody can read it, and VDM calls out a greedy one. The governor (Kaduna), the FCT Minister (Abuja), the Governor of Lagos and the Governor of Kano each spend their own city’s share on road projects and palliatives, can ban okada in their city, grant pardons and fix their city’s potholes. The IGP sets patrols and jail terms. The EFCC chair sets fines.',
      'The president, the three governors and the FCT Minister travel on the state: the helicopter, the convoy (in place of a cab) and the jet at the airport cost them nothing. The treasury pays the usual fare, the president out of the whole treasury and a city’s government out of its own budget.',
      'Campaign with rallies, billboards and crowds; each event costs millions. Until the polls open you can withdraw from a race for a fee (a quarter of the filing fee, which is not refunded). You can buy votes, but if the EFCC catches you, you are disqualified from that race, fined and jailed. You can run again in the next election.',
      'Seen a candidate winning on fake votes? Report them in the INEC app. Every election case is public there: the candidate, the race, and the accounts accused of voting as their clones. Who reported it is not shown.',
      'Office holders can let "a snake swallow" some treasury money. It pays well and they may get caught. With an EFCC chair in office the loot is frozen for a few hours while the chair decides, and the looter can offer them a share.',
      'Other ways into the treasury, each with its own risk: a front company (EFCC raid), Mallam’s BDC (he may vanish with it), Ghana Must Go bags on the state jet (customs search), ghost workers on a state payroll (the audit odds rise every hour), and diverting palliatives (VDM may get the video).',
      'Everyone in office shares the Government Forum, a group chat in Messages. You are added when you win an office and removed when you leave it.',
    ],
  },
  {
    icon: '🥷',
    id: 'crime',
    title: 'Crime and the law',
    hint: 'Steal, scam, get caught',
    apps: ['police', 'efcc'],
    body: [
      'Steal: stand next to someone in a building and tap Steal on their nametag. Break in: walk to a neighbour\'s house in an estate. Both take a share of their cash, up to a limit. Carrying furniture out takes time (a bed takes far longer than a chair); walk away or tap Cancel to drop it. Get caught at a house (CCTV, security or the owner) and you can\'t break in there again for 30 minutes; go back to a house that has you on film and the police are waiting.',
      'The server checks you are really there and rolls whether you escape. A bigger police share of the treasury means more arrests.',
      'If you are robbed, open Police and file a report. The thief is arrested, pays you back plus a fine, and does jail time.',
      'Guns: illegal. The only place to get one is the Fixer\'s dealer (Fixer → Guns). Get arrested for anything with a gun on you and the police seize it and fine you hard: ₦1m for a Dane gun up to ₦8m for an AK-47. Tap a player standing near you to rob them at gunpoint or shoot them; the dealer also has stick-ups of passers-by and shops. Someone shot wakes up in hospital with a bill and stays hurt for a while. Gunshots bring the police. Protect yourself with a bulletproof vest or an armed bodyguard (also from the dealer), or carry a gun yourself: an armed victim may draw first.',
      'Yahoo: send a payment request to another player. The EFCC may catch you, and victims can report you.',
      'Area: build your street reputation from small-time thief up to Godfather, and take over a motor park: Kawo in Kaduna, Utako in Abuja, Oshodi in Lagos, Naibawa in Kano.',
      'Crime is risky. It can end with a fine, a cell and a ruined reputation.',
    ],
  },
  {
    icon: '📱',
    id: 'phone',
    title: 'Your phone',
    hint: 'Apps, the App Store, camera, radio',
    apps: ['store', 'camera', 'closet', 'radio'],
    body: [
      'Almost everything runs from the phone: work, money, rides, shopping, friends, politics and the police. Tap Phone on the bottom bar.',
      'App Store: download extra apps like Legacy (your hall of fame), Pidgin AI and Baba Online. The shady ones (Yahoo, Area, Black Market, Plug, Fixer, Dirty Work) are there too, and the police do check phones.',
      'Tap a notification to go straight to the app, place or chat it is about.',
      'Camera and Snap: take a photo, edit it and post it. Closet changes your look. Radio tunes live stations. With a Hi-Fi Speaker at home, the station you pick there plays whenever you are in.',
      'Settings: your account, Low Power Mode for slow phones, and Born again (starting a new life).',
    ],
  },
  {
    icon: '🏆',
    id: 'legacy',
    title: 'Legacy and new lives',
    hint: 'Achievements and starting over',
    apps: ['store', 'settings'],
    body: [
      'There are 35 achievements and a street-reputation ladder. When a life ends you get a legacy score in your hall of fame.',
      'Settings → Account → Born again. Everyone starts the same: ₦300,000 (₦50,000 on day one, then ₦50,000 more each day you play) and a small one-room house. No loans, no rich parents. Where you end up is on you.',
    ],
  },
];


const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));
const TIPS_BY_TOPIC = new Map(TOPICS.map((t) => [t.id, TIPS.filter((tip) => tip.topic === t.id)]));

const randomTip = (not?: Tip): Tip => {
  const pool = TIPS.filter((t) => t !== not);
  return pool[Math.floor(Math.random() * pool.length)];
};

/** `text` with every match of the search query marked. */
function Marked({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, from)) {
    parts.push(text.slice(from, at), <mark key={at}>{text.slice(at, at + query.length)}</mark>);
    from = at + query.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

export function HelpApp() {
  const focus = useHelp((s) => s.focus);
  const tipsOn = useHelp((s) => s.tipsOn);
  const [open, setOpen] = useState<TopicId | null>(focus?.topic ?? 'start');
  const [q, setQ] = useState('');
  /** The tip on the card at the top: the one you tapped to get here, else a random one. */
  const [tip, setTip] = useState<Tip>(() => focus ?? randomTip());
  const [tapped, setTapped] = useState<Tip | null>(focus);
  const topicEls = useRef<Partial<Record<TopicId, HTMLDivElement | null>>>({});

  const jump = (id: TopicId) => {
    setQ('');
    setOpen(id);
    requestAnimationFrame(() => topicEls.current[id]?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  // A tip toast tapped while Help is already open lands here too.
  useEffect(() => {
    if (!focus) return;
    setTip(focus);
    setTapped(focus);
    jump(focus.topic);
    useHelp.getState().setFocus(null);
  }, [focus]);

  const query = q.trim().toLowerCase();
  const has = (text: string) => text.toLowerCase().includes(query);
  const shown = TOPICS.map((t) => {
    const tips = TIPS_BY_TOPIC.get(t.id) ?? [];
    // A match in the heading shows the whole topic; otherwise only the lines that match.
    if (!query || has(`${t.title} ${t.hint}`)) return { t, body: t.body, tips };
    return { t, body: t.body.filter(has), tips: tips.filter((x) => has(x.text)) };
  }).filter(({ body, tips }) => !query || body.length + tips.length > 0);
  const tipTopic = TOPIC_BY_ID.get(tip.topic);

  return (
    <>
      <div className="hero hero-green">
        <small>Help &amp; guide</small>
        <b>💡 How to live Naija life</b>
      </div>
      <input
        className="help-search"
        type="search"
        placeholder="Search help (e.g. generator, steal, taxi)"
        aria-label="Search help"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {!query && (
        <div className="help-tip">
          <small>{tapped === tip ? 'The tip you tapped' : 'Tip'}</small>
          <p>{tip.text}</p>
          <div className="help-tip-row">
            {tipTopic && <button onClick={() => jump(tip.topic)}>More on {tipTopic.title.toLowerCase()}</button>}
            <button className="ghost" onClick={() => setTip(randomTip(tip))}>Another tip</button>
          </div>
        </div>
      )}
      {query && shown.length === 0 && <p className="muted small center">Nothing found. Try another word.</p>}
      {shown.map(({ t, body, tips }) => {
        const isOpen = !!query || open === t.id;
        return (
          <div key={t.id} ref={(el) => { topicEls.current[t.id] = el; }} className={`help-topic ${isOpen ? 'open' : ''}`}>
            <button className="help-head" aria-expanded={isOpen} onClick={() => setOpen(open === t.id ? null : t.id)}>
              <span className="tile-icon">{t.icon}</span>
              <span className="tile-info">
                <b>{t.title}</b>
                <small>{t.hint}</small>
              </span>
              <span className="help-chev"><Chevron dir={isOpen ? 'up' : 'down'} /></span>
            </button>
            {isOpen && (
              <div className="help-body">
                {body.map((line) => (
                  <p key={line}><Marked text={line} query={query} /></p>
                ))}
                {tips.length > 0 && (
                  <>
                    <h4>Tips</h4>
                    <ul className="help-tips">
                      {tips.map((x) => (
                        <li key={x.text} className={x === tapped ? 'on' : ''}><Marked text={x.text} query={query} /></li>
                      ))}
                    </ul>
                  </>
                )}
                {t.apps && (
                  <div className="help-apps">
                    {t.apps.map((id) => (
                      <button key={id} onClick={() => useGame.setState({ openApp: id })}>{APP_LINKS[id]}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <label className="help-toggle">
        <input type="checkbox" checked={tipsOn} onChange={(e) => useHelp.getState().setTipsOn(e.target.checked)} />
        <span>
          <b>Show tips while I play</b>
          <small>A tip pops up every couple of game hours.</small>
        </span>
      </label>
    </>
  );
}
