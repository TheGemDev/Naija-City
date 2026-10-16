// VDM's phrase bank: the parts his posts are assembled from (src/game/vdm.ts puts them together). Every slot has many
// interchangeable lines so no two posts in a row sound the same. He insults conduct in office (or a thief's crime),
// never who anybody is: no slurs, nothing about ethnicity, religion or gender, no real people.
//
// A line is a string with {placeholders} from the facts: {who} {n} {amount} {other} {what} {victim} {did} {loot} {area}.
// {n|pothole} is "3 potholes" ("1 pothole"); {n|family|families} gives the plural. A line whose placeholder has no fact
// is skipped. An optional [tags] prefix: a digit is its heat (1 mild, 2 hot, 3 furious; 2 when absent), g = only about
// government, c = only about a crime, ?key = only when that fact is set, !key = only when it is not.

/** What a post is about: the official as the gazette names them ("President @musa"), and whatever the matter needs. */
export interface VdmFacts {
  who?: string;
  n?: number;
  amount?: string;
  /** A city, or the other person in the story. */
  other?: string;
  /** The law, in words: "income tax from 5% to 10%", or a road, an asset, a disaster's name. */
  what?: string;
  victim?: string;
  /** What the thief did, as a phrase: "broke into @x's house and carried ₦50,000". */
  did?: string;
  loot?: string;
  area?: string;
  /** The money at stake, for how loud he gets. Read from `amount` when absent. */
  money?: number;
  pocket?: boolean;
  empty?: boolean;
}

export interface VdmTopicDef {
  tone: 'drag' | 'praise';
  /** A crime exposé: he talks to a thief, not a government. */
  crime?: boolean;
  /** The statement of the facts. Each is a full sentence or two. */
  core: string[];
  /** Reactions for this topic: jabs on a drag, commendations on a praise. Mixed in with the generic ones. */
  jab?: string[];
  q?: string[];
  /** Praise only: the backhanded bit. */
  tail?: string[];
  emoji: string[];
  /** How loud: 0 shrug .. 3 furious (or, on a praise, delighted). `money` is the naira at stake (0 when none). */
  sev?: (f: VdmFacts, money: number) => number;
}

const tiers = (x: number, steps: [number, number, number]) => (x >= steps[2] ? 3 : x >= steps[1] ? 2 : x >= steps[0] ? 1 : 0);

/* ---------- Generic slots ---------- */

export const GEN = {
  openDrag: [
    '[1]Hold am there.', 'Make una come see something.', 'I no fit keep quiet on this one.', '[1]Wahala dey o.', 'Una don hear the latest?',
    '[1]Make I talk my own.', '[1]Gather here, my people.', 'Breaking from my end:', '[1]Another day, another wahala.', 'Wonders no dey finish for this country.',
    '[3]ABEG!', '[3]HOLD ON. HOLD ON.', 'E don happen again.', '[1]Today I get gist for una.', 'I just wake up see this.',
    'My DM full this morning, and see wetin dey inside.', '[1]Na so I dey my lane, then this one land.', 'My blood pressure don rise again.', 'Una see this nonsense?', '[3]I swear, this country go finish me.',
    'Somebody explain this one give me.', '[1]I been dey wait for this one.', 'Receipts dey here:', 'No be audio, na fact:', '[3]I DON VEX!',
    '[1]Make una hear this one.', 'I talk am before, I go talk am again.', '[1]Tori don land.', '[1]I don see am.', 'Let me be very clear.',
    'Good morning to everybody except the person wey do this.', '[1]Before una sleep, read this.', '[3]Nawa! Nawa! Nawa!', '[1]Make I no waste time.', '[1]Small gist.',
    'I hate to talk this kind thing, but I must.', '[1]As I dey drink my tea, see wetin I read.', '[3]Enough is enough!',
  ],
  openPraise: [
    'Credit where e due.', 'Make I give jack im jacket.', 'Wonders shall never end!', 'Finally!', 'I no dey praise politician o, but today I must.',
    'Hold your heart, I wan praise somebody.', 'Una go shock.', 'Something good happen for this country today.', 'No be every time na wahala.', 'Today I go do something wey I no dey do.',
    'Make una no faint.', 'Sun don rise from west today.', 'I don see am, and I go talk am.', 'Good news, for once.', 'Pinch me, I wan confirm say I no dey dream.',
    'Today no be drag day.', 'I dey talk the truth even when e sweet.', 'Make we celebrate small.', 'E don do, make I praise.', 'Breaking: good news!',
    'Let me do something rare.', 'Una know say I no dey hail anybody anyhow.', 'Abeg give me chair, I wan clap.', 'Who get eye, make e see this.', 'Make I balance my page today.',
  ],
  jab: [
    '[1]Na wa.', '[1]This one no make sense at all.', '[1]E no good.', '[1 g]Una dey whine us.', '[1]Na joke be this?', '[1 g]We no go forget.', '[1 g]Very unserious.', '[1 g]Leadership no be like this.',
    'Shameless!', 'Na wickedness be this.', '[g]Clueless!', '[g]Una no get conscience at all.', '[g]Greedy, careless lot.', 'Na disgrace.', '[g]Una dey treat us like toy.',
    '[g]Heartless people!', '[g]Na so una dey do.', '[g]This na abuse of office.', '[g]Na pure insult to the people.', '[g]Useless leadership!', '[g]Na only una pocket una dey see.',
    '[g]Bad governance, full stop.', 'Total nonsense.', 'Na carelessness reach this level.', '[g]This one na pure laziness.', '[g]Unserious people!', '[g]Na the people dey always pay for una mistake.',
    '[3 g]Thief with biro!', '[3 g]Wicked, greedy people!', '[3 g]Disgrace to the office!', '[3 g]Agbada no fit cover this shame!', '[3 g]Una go answer for this!', '[3 g]Una dey run this place like una papa shop!',
    '[3 g]Na pure looting with pen!', '[3 g]Power don enter una head!', '[3 g]Na this kind leadership dey kill country!', '[3 g]Mumu government!', '[3 g]Pickpocket in suit!', '[3]Na criminal behaviour, plain and simple!',
    '[1 c]Na wa for some people.', '[c]Thief!', '[c]Ole! Barawo!', '[c]Fine face, bad character.', '[c]Shame no dey catch you?', '[3 c]Your days are numbered!',
  ],
  qDrag: [
    '[g]Una think say we be mumu?', '[g]Na country una dey rule or na una papa shop?', '[g]Who una dey help?', '[g]Wetin una take us for?', '[g]If shame dey sell for market, una no go fit buy?',
    '[g]How una dey sleep for night?', '[g]Na so una go dey do till election?', '[g]Who go ask una question?', '[g]Una no get mirror for house?', '[g]Where una keep conscience?',
    '[g]Na we vote una enter, abi?', '[g]Na wetin una campaign with be this?', '[g]This one na leadership or na comedy?', '[g]Who advise una?', '[g]Una no fear the people?',
    '[g]When una go learn?', '[g]Na today una start?', '[g]Is this how una treat the people wey vote una?', '[g]Una dey hear yourself?', 'Which kind wahala be this?',
    '[g]We go dey manage una till when?', '[g]Who dey check una?', 'Abeg, who fit defend this?', '[g]Una no tire?', '[g]Una go still come beg for vote?',
    'Na so e suppose be?', 'Una dey see wetin I dey see?', '[g]Una really think say nobody dey look?', '[g]Where una go hide when people ask?', '[g]Na because una get convoy?',
    '[g]Una go like make dem do una like this?', '[c]You think say nobody see you?', '[c]Na this one you go tell your pikin say na work?', '[c]Who raise you?',
  ],
  qPraise: [
    '[g]Other politicians, una dey see am?', 'So e possible all this time?', 'Who say Naija no go better?', 'Na who wake up on the right side of bed today?', 'Wetin happen? Una don get sense?',
    'So una fit do am when una want?', '[g]If this one fit do am, wetin the rest dey wait for?', 'Na today una remember say people dey?', 'Una see say e no hard?', 'Why e take so long?',
    'Na this one una dey hide since?', '[g]Who talk say leadership hard?', 'Make I dey expect this every week?', '[g]Una dey see wetin good governance look like?', 'Na pressure or na good heart?',
    'E go last?',
  ],
  ratDrag: [
    'Ratels, mark this face.', 'Ratels, over to una.', 'Ratels, una dey see am?', 'Ratels, make una help me ask.', 'Ratels, screenshot everything.',
    'Ratels, no let this one die.', 'Ratels, tag am make e see.', 'Ratels, make we keep the receipt.', 'Ratels, rise up!', 'Ratels, carry am go every timeline.',
    'Ratels, this one na una assignment.', 'Ratels, we no dey forget.', 'Ratels, make dem hear our voice.', 'Ratels, retweet until e reach am.', 'Ratels, keep the date, we go need am.',
    'Ratels, ginger una selves.', 'Ratels, no sleep on this one.', 'Ratels, the matter don enter una hand.', 'Ratels, make we trend am.', 'Ratels, record everything.',
  ],
  ratPraise: [
    'Ratels, give am small clap.', 'Ratels, una fit hail am small.', 'Ratels, make we encourage am.', 'Ratels, see wetin pressure dey do.', 'Ratels, our noise dey work.',
    'Ratels, na una voice cause this.', 'Ratels, take note: e possible.', 'Ratels, we go keep score fairly.', 'Ratels, one clap, no more.', 'Ratels, make we hold am to this standard.',
    'Ratels, remember this day.', 'Ratels, no be only drag we sabi.', 'Ratels, today na clap, tomorrow na assessment.', 'Ratels, share am make others learn.', 'Ratels, see as e sweet when dem do work.',
  ],
  signDrag: [
    'I dey watch una.', 'I don talk my own.', 'We move.', 'Na me talk am.', 'Time go tell.', '[g]Election dey come.', 'Make una no say I no talk.',
    'No retreat, no surrender.', 'I no go stop.', 'Una never see anything yet.', '[g]The people go remember.', '[g]History go judge una.', 'I still get more receipts.',
    'Part 2 dey come.', 'I rest my case.', 'Sue me if you like.', 'I dey here, I no dey go anywhere.', 'Nobody go silence me.', 'Make una sha continue.',
    'I go come back to this matter.', 'Watch this space.', '[g]E go better, but no be with una.', '[g]Oya, explain yourselves.', 'We dey count.',
  ],
  signPraise: [
    'Keep it up.', 'More of this, abeg.', 'Na so e suppose be.', 'We dey observe.', 'One good turn deserve another.', 'Make e continue.', 'Credit given, receipts kept.',
    'We move.', 'Good job. No excuses next time.', 'Na this we want every day.', 'Small small, we go reach.', 'Today we clap.', 'Make others copy.', 'Na so.',
  ],
  commend: [
    'Well done.', '[g]This na leadership.', 'See as e easy?', '[g]Na so governance suppose be.', 'I hail you for this one.', 'Respect.', 'Na work be this, no be noise.',
    'E sweet my belle.', 'This one dey clean.', 'No be small thing.', 'Thumbs up.', 'Na the kind news we want.', 'I respect this move.', 'Good decision, no long talk.',
    'This one deserve hand clap.', 'The people feel am.', 'Correct move.', 'Na so we want am.', '[g]Sensible leadership for once.', 'Proper work.', 'I no fit lie, this one good.',
    '[g]This one na real dividend of democracy.', 'Honest work, honest praise.', 'Na beta thing.', 'Brilliant.', 'E get as people dey happy today.',
  ],
  tail: [
    'I go still dey watch una.', 'One swallow no make summer.', '[g]Make e no be election stunt.', 'Na una job anyway, no be favour.', '[g]Make una no carry am go billboard.',
    'We go see if e go last.', 'Make una no spoil am tomorrow.', 'Na small thing, but e count.', 'I dey wait for the catch.', '[g]Abeg no turn am to campaign jingle.',
    'Na the minimum we expect sha.', 'E for don happen since.', 'Late, but e reach.', 'Make the next one no take one year.', 'I never forget the other wahala o.',
    'This one no clear the old records.', 'Na first step, plenty dey remain.', 'Make e no be photo-op.', 'Na so una suppose dey do every time.', 'I no go praise twice sha.',
    'We go still check the receipts.', 'Credit no mean say I don forget.', 'Na pressure work this one.', 'Make una no relax.',
  ],
  pivotDrag: [
    'But make I no lie.', 'But wait first.', 'Before una start to clap, hear this.', 'Now the other side of the coin.', 'But no be everything dey sweet.', 'Small wahala though.',
    'But see the other gist.', 'Now, the part wey pain me.', 'But e get one thing.', 'Before I forget.', 'But na here wahala start.', 'Clap don do. Now wahala.',
    'No celebrate yet.', 'But I still dey vex.', 'But this one no cancel the other.', 'Meanwhile, look am.', 'Abeg, small thing.', 'But my own wahala na this.',
  ],
  pivotPraise: [
    'Still, credit where e due.', 'But make I be fair.', 'That said, one thing dey good.', 'Now the small good news.', 'In the midst of everything, see this.', 'Abeg, one good thing sha.',
    'But I no go lie.', 'To be fair, see this one.', 'There is a bright side sha.', 'But one thing I go give them.', 'Even as e be, see this one.', 'E no all bad sha.',
  ],
  /** His memory of the person: {rwho} is them, {times} how often before this week, {ord}/{Ord} this one's count. */
  recDragAgain: [
    'This na the {ord} time I dey call {rwho} out this week.', '{rwho} don become my regular customer. {times} times this week!', 'I don drag {rwho} {times} times this week and nothing change.',
    'Na {rwho} again. My keyboard don know the name by heart.', 'My page don tire to write {rwho} name.', '{rwho}, na you be my best customer this week.',
    'Every week, na the same {rwho}.', 'I warn {rwho} before. E no hear.',
  ],
  recDragAfterPraise: [
    'Last time I praise {rwho}. I for no rush.', 'Just the other day I hail {rwho}. See as e take pay me back.', 'I give {rwho} credit last time. I don collect am back.',
    'Remember when I praise {rwho}? I don regret am.', '{rwho} collect my praise last time, today e collect my vex.',
  ],
  recPraiseAfterDrag: [
    'Me wey don drag {rwho} {times} times this week, today I go praise.', 'I don yab {rwho} plenty, so when e do well, I go talk am too.', 'Na the same {rwho} wey I drag the other day. Today e try.',
    '{rwho} don hear my voice. E dey work.', 'I been dey vex for {rwho}. Today make I calm small.',
  ],
  recPraiseAgain: [
    '{Ord} time I dey hail {rwho} this week. E be like say person dey learn.', '{rwho} dey enter my good book small small.', '{rwho} again! Two praise for one week no dey happen anyhow.',
    '{rwho} dey try. I don notice since.',
  ],
  emojiDrag: ['🤬', '😤', '😡', '👀', '🙄', '🤦🏾‍♂️', '😒', '🧐', '🔦', '🎤', '🗣️', '📢'],
  emojiPraise: ['👏🏾', '🙌🏾', '✅', '👍🏾', '💯', '🫡', '😌', '🎉', '👌🏾'],
  emojiMixed: ['🤷🏾‍♂️', '😐', '🤔', '⚖️', '🙂'],
  /** When he won't carry a caller's matter (the Police app's "Call VDM"). */
  passWhy: [
    'I don hear you.', 'My hand full today.', 'Hmm. Bring evidence first.', 'This one small.', 'I dey court today.', 'I go think about am.',
    'My lawyer say make I calm down this week.', 'Na so una go dey call me for everything?', 'I dey live video now.', 'Let the police try first.',
    'Too many people dey call me.', 'This matter never sweet reach to post.', 'I no dey post wetin I no fit defend.', 'People dey lose houses and you dey call me for this?',
    'My data don finish.',
  ],
  passThen: [
    'Maybe later.', 'Try me another time.', 'Come back later.', 'Call back.', 'No promise.', 'I don write am down sha.', 'If dem fail, come back.',
    'Give me small time.', 'We go see.', 'Make I first finish this one.',
  ],
};

/* ---------- Topics ---------- */

const money3 = (_f: VdmFacts, m: number) => tiers(m, [50_000, 500_000, 5_000_000]);

export const VDM_TOPICS = {
  /* --- Government, on what an official just did (worker/news.ts vdmGov) --- */
  trips: {
    tone: 'drag', emoji: ['✈️', '🚁', '🧳'], sev: (f) => tiers(f.n ?? 0, [5, 15, 25]),
    core: [
      '{who}, you dey craze? {n} trips for one day, {amount} of our money don burn for fuel.',
      '{n} trips today. {amount} from treasury. {who} dey waka upandan like person wey dey find missing goat.',
      'I don talk am, I go talk am again: {who} na tourist, no be leader. {n} trips, {amount} gone, nothing to show.',
      '{who} don enter jet, helicopter and convoy {n} times today. Bill: {amount}. Office dey empty.',
      '{amount} for {n} trips inside one day. {who}, na sightseeing we elect you for?',
      'If you wan find {who} today, check the sky. {n} trips, {amount} from our pocket.',
      'Siren here, siren there. {who} don move {n} times today and the treasury don pay {amount} for the jolly.',
      '{who} don clock {n} official trips today. {amount}. Na frequent flyer miles we dey sponsor?',
    ],
    jab: ['Sit down for office do the work wey dem vote you for.', 'Frequent flyer, zero result.', '[3]Tourist in agbada!'],
    q: ['Na government jet or na danfo?', 'Who dey mind the office?', 'Na meeting or na holiday?'],
  },
  levy: {
    tone: 'drag', emoji: ['🧾', '💸'],
    core: [
      '{who} don raise {what}. Road never fix, light no dey, but to collect money from poor man na im una sabi.',
      'So na {what} be the achievement of {who} this week? People dey manage garri, you dey add more billing.',
      '{who}, you no get conscience? For this economy, you dey raise {what}?',
      'Una hear am? {who} just raise {what}. Na our pocket dem dey use balance their own book.',
      'New law from {who}: {what}. Salary no increase, but the cut don increase.',
      '{who} wake up, check our pocket, see say small money remain, raise {what} to collect am.',
    ],
    jab: ['Come outside make we see whether your own salary reduce.', 'Una go hear from the people on election day.', '[3]You dey chop the people wey vote you!'],
    q: ['Who this one dey help?', 'Wetin una dey use the money do?'],
  },
  snake: {
    tone: 'drag', emoji: ['🐍', '🔦'], sev: money3,
    core: [
      '{amount} miss from treasury and dem say na snake swallow am. SNAKE!',
      'Another {amount} don vanish. Nobody see anything, nobody know anything.',
      'Snake don chop {amount} from treasury again. That snake dey wear agbada and e get office.',
      '{amount} gone. No suspect, no arrest, only snake story.',
      'Treasury don lose {amount} and the official answer na snake. Na zoo we dey run?',
      'Na the same snake o. Last time na small money, today na {amount}.',
    ],
    jab: ['Bunch of ole wey wear suit!', 'EFCC, wake up or resign.', 'I dey find that snake, and when I find am I go call im name with full chest.', '[3]Thieves, all of una!'],
    q: ['Na snake dey sign cheque now?'],
  },
  looter: {
    tone: 'drag', emoji: ['⛓️', '🐍'], sev: money3,
    core: [
      '{who} carry {amount} of public money dey run and EFCC grab am.',
      'See {who} for EFCC net with {amount}.',
      '{who} swear oath, still put hand for {amount} of our money.',
      '{amount}! {who} think say nobody dey count.',
      'Na {who} be the latest: {amount} from treasury, now na cell.',
      '{who} don lose office over {amount}. Na so greed dey end.',
      'Caught: {who}, with {amount} wey no be im own.',
    ],
    jab: ['Barawo! Ole!', 'Make dem lock am throw key away.', 'No pardon for this one!', 'Shameless thief wey dem dey call “Your Excellency”.', 'The rest of una wey still dey office, I dey watch una hand.'],
    q: ['You swear oath, you still thief?'],
  },
  contract: {
    tone: 'drag', emoji: ['📝', '🎥'], sev: money3,
    core: [
      '{who} don give {amount} contract to {other}. One company apply, one company win.',
      '{amount} contract for {other}, signed by {who}. Na your padi abi na your in-law?',
      '{who} dey share our money like birthday cake: {amount} for {other}.',
      'Tender board? Which tender board? {who} just hand {other} {amount}.',
      '{other} wake up {amount} richer, courtesy of {who}. Wetin dem build?',
      'Contract of {amount} to {other}. I never see the site, I never see the work. {who}, show us.',
    ],
    jab: ['Fraud!', 'If that job no finish, I go carry camera come that site.', 'Ratels, make we go inspect the work o.', 'Corrupt, greedy lot.'],
    q: ['Where the work dey?'],
  },
  pardon: {
    tone: 'drag', emoji: ['🕊️', '⚖️'],
    core: [
      '{who} just pardon {other}. The person wey dem rob never recover, but criminal don waka free enter convoy.',
      'Pardon for {other}, courtesy of {who}. Criminals dey protect criminals.',
      '{other} dey cell yesterday. Today {other} dey free, thanks to {who}.',
      '{who} sign pardon for {other} like say na birthday card.',
      'Victims still dey cry, {who} don open cell for {other}.',
    ],
    jab: ['The victims go remember this one on election day.', 'Useless, wicked decision!', 'Una no get shame at all.'],
    q: ['Justice na only for poor man for this country?', 'Who pardon the victims?'],
  },
  palliative: {
    tone: 'drag', emoji: ['🍚', '📸'], sev: (_f, m) => (m <= 5_000 ? 3 : m <= 25_000 ? 2 : 1),
    core: [
      '{who} share {amount} each and call am palliative. {amount}! E no reach buy one paint of garri.',
      'After all the tax wey una collect, na {amount} per head {who} fit share?',
      '{amount} palliative from {who}, and dem carry camera snap am join.',
      '{who} dey share {amount} like say na lottery jackpot.',
      '{amount} each. {who}, that one na transport money, no be palliative.',
      'Na {amount} {who} dey share for this economy? Pure water money.',
    ],
    jab: ['Keep your crumbs, fix the economy.', 'You dey insult hungry people!', 'Stingy government!'],
    q: ['Wetin {amount} go buy for market today?'],
  },
  divert: {
    tone: 'drag', emoji: ['📹', '🍚'], sev: () => 3,
    core: [
      '{who} share palliatives, then pack {amount} go private warehouse. Video dey.',
      'The rice wey suppose reach hungry people? {who} keep {amount} worth for warehouse. We catch am.',
      '{amount} of palliatives for {who} warehouse “for safekeeping”. Safe from who? From the hungry?',
      'Camera don catch {who}: {amount} of food wey belong to the people, locked away.',
      '{who} dey share with one hand, dey hide with the other. {amount} of palliatives dey warehouse.',
    ],
    jab: ['Food thief!', 'Hungry people dey wait, you dey stock warehouse.'],
  },
  roadProject: {
    tone: 'drag', emoji: ['🚧', '🚜'],
    core: [
      '{who} wake up, carry excavator go dig the street of {other}. No be road project, na vendetta with our money!',
      '“Urgent road project” for only the street of {other}? {who}, we no be fools.',
      '{who} don send excavator to {other} street. Of all the bad roads for this state, na that one?',
      'Na personal beef {who} dey fight with public money. Ask {other}.',
      'Street of {other} dey dig now, courtesy of {who}. Potholes for main road dey wait.',
    ],
    jab: ['Abuse of office!', 'Petty, childish leader.', 'Go fix the real potholes.'],
  },
  okadaBan: {
    tone: 'drag', emoji: ['🏍️'],
    core: [
      '{who} don ban okada for {other}. You get convoy and helicopter, so wetin concern you how poor man go reach work?',
      'Okada ban for {other}. The riders go chop wetin? {who} no care.',
      '{who} just tell every okada man for {other} to park. No bus, no plan, just ban.',
      '{other} people go trek from today, thanks to {who} and im okada ban.',
      'Okada don disappear for {other}. {who} sign am inside AC office.',
    ],
    jab: ['Provide bus first before you ban anything.', 'Heartless, out-of-touch leader!'],
  },
  potholes: {
    tone: 'drag', emoji: ['🕳️', '🚗'], sev: (f) => tiers(f.n ?? 0, [1, 5, 8]),
    core: [
      '{n|pothole} dey open for {other} as I dey talk, and {who} dey sleep for office.',
      '{other} road don turn fish pond. {n|pothole}!',
      '[?what]I just drive pass {what} for {other}. Pothole wey fit swallow keke!',
      '[?what]{what} don turn swimming pool. {n|pothole} for {other} and {who} still dey smile.',
      '[?what]{who}, come follow me waka for {what}. Just come. {n|pothole} dey {other}.',
      '[?what]Na pothole for {what} break my shock absorber this morning. {who}, I go send you the bill.',
      '{n|pothole} for {other}. Mechanic dey thank {who}, the rest of us dey suffer.',
      '{who}, you dey see the roads for {other} or you dey fly pass am for helicopter? {n|pothole}!',
    ],
    jab: ['Fix the road or comot for that seat.', 'Incompetent!', 'People motor dey spoil every day!'],
    q: ['Wetin be your job if no be this?'],
  },
  potholesStill: {
    tone: 'drag', emoji: ['🕳️'], sev: (f) => tiers(f.n ?? 0, [1, 5, 8]),
    core: [
      '{n|pothole} still dey open for {other}.',
      'One road no be achievement. {n|other pothole} still dey wait for {other}.',
      'The rest of {other}? {n|pothole} still dey swallow tyre.',
      'Meanwhile {n|pothole} dey {other} wey nobody touch.',
      '{n|pothole} still dey for {other}, so make we no carry this one go party.',
    ],
  },
  ownPay: {
    tone: 'drag', emoji: ['🧾', '💰'], sev: (_f, m) => tiers(m, [1, 250_000, 1_000_000]),
    core: [
      '{who} don raise im own salary to {amount} a day. Your own salary, with your own biro!',
      'So na so e easy? {who} wake up, sign paper, begin collect {amount} every day from our tax.',
      '{amount} a day for {who}, approved by the same person wey go collect am.',
      '{who} don review im own pay to {amount} daily. People dey manage ₦5k work.',
      'Pay rise for {who}: {amount} a day. The roads no rise, the light no rise, only salary.',
    ],
    jab: ['Thief with payslip!', 'If greed be work, you for don win award.', 'I dey count every kobo.'],
  },
  payCut: {
    tone: 'drag', emoji: ['✂️', '🧾'],
    core: [
      '{who} don cut the pay of {other} from {what} to {amount}. But your own salary dey intact o!',
      '{other} go now collect {amount} a day because {who} talk so.',
      'From {what} to {amount}. {who} dey use salary fight {other}.',
      '{who} slash the pay of {other} to {amount}. Starve the worker, then ask why work no dey go.',
    ],
    jab: ['Petty, heartless leader.', 'Tomorrow you go shout say nothing dey work. Na you cause am.'],
  },
  fatPay: {
    tone: 'drag', emoji: ['💰', '🧐'], sev: (_f, m) => tiers(m, [1, 250_000, 1_000_000]),
    core: [
      '{who} don raise the pay of {other} to {amount} a day. Na your padi abi na your in-law?',
      '{amount} a day for {other}, courtesy of {who}. Settlement dey sweet o.',
      '{who} dey share treasury like suya: {other} don land {amount} a day.',
      'Pay for {other} don jump to {amount} daily. Teacher dey collect ₦4,500. {who}, explain.',
    ],
    q: ['Wetin the person do to deserve am?'],
  },
  unpaid: {
    tone: 'drag', emoji: ['🧾', '💸'],
    core: [
      'Salary day reach, treasury dry. Wage bill na {amount} and the money no dey.',
      'Government workers no collect salary today because treasury no reach {amount}.',
      '{who} sign pay list wey e no fit pay. {amount} owed, nobody collect.',
      'No salary today. {amount} wage bill, empty treasury, and {who} dey quiet.',
      'Workers dey check phone for alert. Nothing. {who}, where the {amount}?',
    ],
    jab: ['Cut your coat according to your cloth.'],
    q: ['Where the tax money go?'],
  },
  impeach: {
    tone: 'drag', emoji: ['⚖️'], sev: (f) => tiers(f.n ?? 0, [1, 12, 24]),
    core: [
      '{who} don impeach {other} for {n} hours, carry {what} put for im own pocket.',
      'So {who} wake up one morning, sack {other} say na “national interest”. Which nation?',
      '{n} hours suspension for {other}, signed by {who}. Na political vendetta.',
      '{what} people vote {other}. {who} cancel their vote with biro for {n} hours.',
      '{who} don lock Government House for {what} and pocket the key. {other} dey outside.',
    ],
    jab: ['Dictator in suit!', 'Power drunk!', 'Shameless abuse of power.'],
    q: ['Na democracy be this or na military rule wey wear agbada?'],
  },
  noRelief: {
    tone: 'drag', emoji: ['🌊', '🔥', '🏚️'], sev: money3,
    core: [
      '{other} don suffer {what}. {n|family|families} dey count loss, {amount} for repairs. {who}, where SEMA dey?',
      '[!empty]After {what}, people dey sleep for school hall. {who} never show face. Treasury dey there but relief no dey.',
      '[?empty]After {what}, the {other} treasury is empty. Empty! {who}, who chop the money wey for be emergency fund?',
      '{n|family|families}. {amount} damage. Zero relief. {who} dey wait make water dry before e come snap picture?',
      '[?area]Na only campaign season {who} dey find road to {area}? {what} don scatter people.',
      '{what} come and go. {other} victims dey on their own again. Not one mattress, not one bag of rice.',
    ],
    jab: ['Victims dey on their own again.'],
  },

  /* --- Government, unprovoked: the state of things (worker/news.ts vdmGrumbles) --- */
  president: {
    tone: 'drag', emoji: ['🏛️'],
    core: [
      '{who}, wetin you don do since you enter that office? Na only convoy and siren we dey see.',
      'I dey look {who} with one eye. Promise full mouth for campaign, now na silence.',
      'Make una help me ask {who}: where the dividend of democracy? Na we vote, na we still dey suffer.',
      '{who} dey chop rice and chicken, the people dey drink garri without sugar.',
      '{who}, this country no be your papa parlour.',
      'Since {who} enter office, the only thing wey don increase na the number of siren.',
    ],
    jab: ['Wake up or pack your load.', 'If you no fit do the work, talk make another person collect am.'],
  },
  tax: {
    tone: 'drag', emoji: ['🧾'], sev: (f) => tiers(f.n ?? 0, [1, 20, 30]),
    core: [
      'Income tax na {n}% and {who} still dey sleep well.',
      '{n}% tax! {who}, na we be your ATM?',
      '{who} dey collect {n}% from okada man sweat. Wetin you use am do?',
      '{n}% income tax for this economy. {who}, show us the receipt.',
      'Every payday, {who} chop {n}% first before we see our own.',
    ],
    jab: ['Reduce am or we go talk for election.'],
  },
  idle: {
    tone: 'drag', emoji: ['🍚', '🏦'],
    core: [
      '{amount} dey treasury dey sleep and {who} never share one kobo palliative today.',
      'Treasury full, {amount}. Hunger full pass am.',
      '{who} dey sit on {amount} like hen wey dey sit on egg. People dey hungry.',
      '{amount} for vault, zero for the people. {who}, you dey keep am for who?',
    ],
    jab: ['Share palliative or explain yourself.'],
  },
  loans: {
    tone: 'drag', emoji: ['🏦', '📉'],
    core: [
      '{n}% interest for bank loan. {who}, you want make poor man borrow money come die?',
      'Loan rate {n}%. Small trader no fit breathe.',
      '{who} don make loan {n}%. Na only una friends fit collect loan for this country.',
      'Who fit borrow for {n}%? {who} dey do economics with our life.',
    ],
    jab: ['Shylock government!', 'Bring that rate down.'],
  },
  fee: {
    tone: 'drag', emoji: ['💸', '📲'],
    core: [
      '{who} dey collect {n}% for every transfer. I send my mama money, government chop inside.',
      '{n}% transfer fee. To send money for this country don turn punishment.',
      'Every alert, {who} chop {n}%. Na pickpocket government be this.',
    ],
  },
  head: {
    tone: 'drag', emoji: ['🪑', '📸'],
    core: [
      '{who}, {other} people dey ask of you. Since you enter office na only billboard with your face we see.',
      'I waka round {other} today. Nothing dey work. {who} dey office dey press phone.',
      '{who} think say to rule {other} na to wear agbada dey wave hand. Wetin you don build? Mention one.',
      '{other} dey wait for {who} to start work. Still waiting.',
      'Ask anybody for {other} wetin {who} don do. Silence.',
    ],
    jab: ['Governance no be photoshoot.', 'If the seat too big for you, stand up.'],
  },
  lamps: {
    tone: 'drag', emoji: ['💡', '🔦'], sev: (f) => tiers(f.n ?? 0, [1, 4, 8]),
    core: [
      'Night don reach, {what} dark like inside pot. {n|street light} don die for {other}.',
      '{who}, you dey see road for night? {n|light} off for {other}, {what} join.',
      '{n|street light} dey off for {other}. Na so thieves dey get work.',
      '{what} for {other} dark like cave. {who}, na torch we go dey carry?',
      '{n|bulb} don die for {other} and {who} no send.',
    ],
    jab: ['Fix am, lazy people.'],
  },
  okada: {
    tone: 'drag', emoji: ['🏍️'],
    core: [
      'Okada still dey ban for {other}. People dey trek like say na marathon, {who} dey inside convoy with AC.',
      '{who}, the okada ban for {other} don do. Riders dey hungry, workers dey late.',
      '{other} people still dey trek because of {who} and im okada ban.',
    ],
    jab: ['Lift that ban or provide bus.'],
  },
  funding: {
    tone: 'drag', emoji: ['🛣️'],
    core: [
      'Road funding for {other} na {n}%. {n}%! {who}, you want make we dey fly?',
      '{who} put {n}% for {other} road and still dey smile for camera.',
      '{n}% road budget for {other}. Then {who} go act surprise when pothole open.',
    ],
    jab: ['Unserious government.', 'Wicked planning.'],
  },
  igp: {
    tone: 'drag', emoji: ['👮🏾', '🚓'],
    core: [
      'Thieves dey operate like say dem get license, and {who} dey office dey drink tea.',
      '{who}, ordinary phone person no fit hold for road again.',
      'Checkpoint dey every corner, criminals still dey pass. {who}, explain.',
      '{who}, your men dey collect ₦50 for checkpoint, the real thieves dey waka free.',
    ],
    jab: ['Secure the people or drop that uniform.'],
  },
  patrols: {
    tone: 'drag', emoji: ['🚓'],
    core: [
      'Street patrol na {n}%. {who}, na so you wan take catch thief? By magic?',
      '{n}% patrols. Thieves don notice, {who} never notice.',
      '{who} put patrol for {n}%. Na torchlight una go use chase thief?',
    ],
    jab: ['Put your men for road.'],
  },
  efcc: {
    tone: 'drag', emoji: ['🕵🏾', '🐕'],
    core: [
      '{who}, treasury money dey miss and you dey find yahoo boys for hotel.',
      'I dey ask {who}: how many politician you don arrest? Zero.',
      '{who} dey sleep while snake dey chop treasury.',
    ],
    jab: ['Toothless bulldog!', 'Go catch the big thieves wey dey office!'],
    q: ['Or dem don settle you?'],
  },
  fatPayList: {
    tone: 'drag', emoji: ['💰', '🧾'], sev: (_f, m) => tiers(m, [1, 250_000, 1_000_000]),
    core: [
      '{who} dey collect {amount} every single day as salary. Every day!',
      'I check the pay list today. {who}: {amount} a day. Okada man no dey see that money for one month.',
      '{amount} daily for {who}, and na the same person approve am.',
      'Na {amount} a day {who} dey pay imself.',
    ],
    jab: ['Cut that salary or show us the work.'],
  },
  chopAlone: {
    tone: 'drag', emoji: ['🍽️'],
    core: [
      '{who} dey pay imself {amount} a day, but {other} dey collect zero. ZERO!',
      '{other} never see one kobo salary under this government, while {who} dey smile go bank with {amount} daily.',
      'Chop-alone government: {who} on {amount} a day, {other} on nothing.',
    ],
    jab: ['Pay people their money!'],
  },
  wageBill: {
    tone: 'drag', emoji: ['🧮'],
    core: [
      'Wage bill for these politicians na {amount} every day, and treasury na {what}. Do the maths!',
      '{amount} a day just to pay politicians, from a treasury of {what}. {who}, when the money finish, na who go suffer?',
      'Treasury: {what}. Daily wage bill: {amount}. {who} dey drive this motor enter gutter.',
    ],
    jab: ['Cut that pay list!'],
  },
  vacant: {
    tone: 'drag', emoji: ['🪑', '😂'], sev: () => 0,
    core: [
      'Nobody dey rule {other} now, the seat empty, and honestly we no see difference.',
      '{other} no get leader as I dey talk. Road still bad, nothing change.',
      'Government House for {other} empty. The potholes no even notice.',
    ],
    q: ['Who wan run?', 'So wetin the last one dey do there since?'],
  },
  noPresident: {
    tone: 'drag', emoji: ['🤣', '🪑'], sev: () => 0,
    core: [
      'No president for Aso Rock and the country still dey move. So na we dey rule ourselves since?',
      'Aso Rock empty. Nobody notice. Make that sink in.',
      'Seat of power dey vacant and nothing scatter.',
    ],
    q: ['Politicians, una dey see una usefulness?'],
  },

  /* --- Crime exposés (worker/crime.ts): `who` is the thief, `victim` who they hit --- */
  exposeUnsolved: {
    tone: 'drag', crime: true, emoji: ['🔦', '🕵🏾', '👀'], sev: (f, m) => tiers(m, [1, 100_000, 500_000]) || (f.loot ? 1 : 0),
    core: [
      "Somebody broke into {victim}'s house and carried {loot}. I don't know who you are YET, but I will find you.",
      "Breaking: thief entered {victim}'s house and comot with {loot}.",
      '{victim} came back home and {loot} don disappear. No face, no name.',
      "Somebody enter {victim}'s house, pack {loot} and waka comot like say na im papa house.",
      "To the person wey carry {loot} from {victim}'s house: I dey come for you. Return am before I find your name.",
      '{victim} was robbed of {loot} and the thief vanished.',
      "Police never talk anything about {victim}'s house wey dem burgle. So na me go do investigation again?",
    ],
    jab: [
      'If you know who do am, my DM is open.', 'Send me information, I go protect your identity.', 'I no dey sleep.', 'You have 24 hours.',
      'Anybody selling something suspicious this week, tag me.', 'Naija, shine your eye!', 'I am on this matter.', 'Your days are numbered.',
    ],
    q: ['My people, una dey sleep?', 'Who see something?'],
  },
  exposeNamed: {
    tone: 'drag', crime: true, emoji: ['🚨', '🔦', '👀'], sev: (_f, m) => tiers(m, [1, 100_000, 500_000]) || 1,
    core: [
      'This one na {who}. {who} {did}. Look at this face well.',
      'Na {who} be this o! {who} {did}.',
      'Una see this {who}? Yesterday na “bro bro”, today {who} {did}.',
      '{who}, I greet you o. So na you {did}?',
      'I have the full gist. {who} {did}.',
      'Naija, mark this name: {who}. {who} {did}.',
      'Them say make I no talk. I go talk! {who} {did}.',
      "Part 1 of {who}'s matter: {who} {did}.",
      '{victim} cry come meet me. Why? Because {who} {did}.',
      'Dear police, I don do una work for una. Suspect: {who}. Offence: {who} {did}.',
      'See as {who} fine for profile picture, meanwhile {who} {did}.',
      '🚨 EXPOSÉ 🚨 {who} {did}.',
    ],
    jab: [
      'If you see am, run!', 'Tell your people make dem lock their doors.', 'Come online and explain yourself.', 'I no dey fear anybody, sue me if you like.',
      'If {who} greet you for road, hold your pocket with two hands.', 'Person wey dey form big boy for Twitter.', 'Part 2 dey come if {who} no settle {victim} today today.',
      'Wherever you dey hide, this country small. We go jam.', 'Oya police, go and arrest.', 'I am calling on the police to do their work.', 'I get receipts.',
    ],
    q: ['Your mama know say na this work you dey do?', 'Shame no dey catch you?'],
  },

  /* --- Praise --- */
  salaryPaid: {
    tone: 'praise', emoji: ['💼', '💵'],
    core: [
      'Salary don land for everybody for office. {amount}, paid on time, no story.',
      'Alert don enter! {who} pay the {amount} wage bill on time.',
      'No arrears this round. {who} settle {amount} of salaries sharp sharp.',
      'Pay day come and pay day no fail. {amount} out, {n|official} paid.',
      '{who} pay salary on time. For this country, that one na breaking news.',
      '{n|person|people} for office collect their money today without begging. {who}, I see am.',
    ],
    tail: ['Make e no be only government people dey collect on time.'],
  },
  taxCut: {
    tone: 'praise', emoji: ['🧾', '💃🏾'],
    core: [
      '{who} don cut {what}. Our pocket go breathe small.',
      'You hear am? {who} reduce {what}. The money go stay for people pocket.',
      'New law from {who}: {what}. And this time na good news.',
      '{who} finally listen: {what}. Traders go feel am.',
      'Cut, not raise! {who} bring {what} down.',
      '{who} reduce {what}. I been dey shout am since, e don hear.',
    ],
    tail: ['Make una no raise am back next week.'],
  },
  subsidy: {
    tone: 'praise', emoji: ['✈️', '🚆'],
    core: [
      '{who} don raise {what}. Ordinary people fit travel now.',
      'Cheaper tickets! {who} put money for {what}.',
      '{who} increase {what}. Na this kind spending we want, no be convoy.',
      'Transport don cheap small: {what}, courtesy of {who}.',
      '{who} dey pay part of our fare: {what}. Make e reach the people wey need am.',
    ],
  },
  palliativeBig: {
    tone: 'praise', emoji: ['🍚', '🛍️'], sev: (_f, m) => tiers(m, [1, 500_000, 1_000_000]),
    core: [
      '{who} share {amount} each to {n|person|people}. That one na real palliative, no be pure water money.',
      '{amount} per head! {who} don do am this time.',
      '{n|person|people} get {amount} each from {who}. For this economy, e go help.',
      '{who} no share crumbs today: {amount} each.',
      'Palliative wey get weight: {amount} each, courtesy of {who}.',
      '{amount} each for {n|person|people}. {who}, this one reach person pocket.',
    ],
    tail: ['Make the rice no find road go warehouse.'],
  },
  potholeFixed: {
    tone: 'praise', emoji: ['🚧', '🛣️'], sev: () => 0,
    core: [
      'I dey watch o. {who} don fix pothole for {what} with {amount} of public money.',
      'Road update: {who} don patch {what}. {amount} comot from treasury.',
      'Dem say {who} fix pothole for {what} for {amount}. Okay, I see am.',
      '{who} don remember say road dey. {what} get repair today, {amount} from our money.',
      '{what} smooth again. {who} spend {amount} of public money and the work show.',
      'Pothole for {what} don close. {who}, I go drive pass there myself to confirm.',
    ],
    tail: ['One road no be achievement.', 'If e open again next week, we go talk.', 'Na your job, no be favour.', 'Plenty still dey spoil people motor.'],
  },
  potholeFixedPocket: {
    tone: 'praise', emoji: ['🚧', '👏🏾'], sev: () => 2,
    core: [
      '{who} use {amount} from own pocket fix pothole for {what}.',
      '{who} carry own money, {amount}, go fix {what}. Election dey come or na good heart?',
      'So {who} fit bring {amount} from own pocket fix {what}?',
      'Own money, not treasury: {who} spend {amount} on {what}.',
      '{what} don smooth, and na {who} pocket pay {amount} for am.',
    ],
    jab: ['I no dey praise politician, but this one I see.', 'No excuse again.', 'Either way the road smooth.'],
  },
  lampFixed: {
    tone: 'praise', emoji: ['💡'], sev: () => 0,
    core: [
      'Light don return for {what}. {who} fix am.',
      '[?pocket]{who} pay {amount} from own pocket put light back for {what}.',
      '[!pocket]{who} spend {amount} from treasury fix street light for {what}. Night go safe small.',
      '{what} no dark again. {who}, I see the bulb.',
      'One street light at a time: {who} don fix the one for {what}.',
    ],
    tail: ['Now do the rest.', 'One bulb no be power project.'],
  },
  roadRepair: {
    tone: 'praise', emoji: ['🛣️', '🚜'], sev: () => 2,
    core: [
      '{who} don put serious money for {other} roads. The roads been dey collapse; now dem dey come back.',
      'Emergency road repair for {other}! {who} no wait make everything fall apart.',
      '{other} roads been dey for ICU. {who} don carry am go theatre.',
      '{who} spend {amount} on {other} roads wey don spoil finish. Na the correct road this time.',
      'Na real bad road {who} fix this time, no be vendetta street. {other}, una go feel am.',
    ],
  },
  assetRepair: {
    tone: 'praise', emoji: ['🏗️'], sev: () => 1,
    core: [
      '{who} don pay {amount} to repair the {what} for {other}. E been dey fall apart.',
      'The {what} for {other} been dey bad shape. {who} don fix am.',
      '{who} no allow the {what} for {other} collapse. {amount} well spent.',
      'Repair work on the {what} for {other}, {amount}, courtesy of {who}. This one na real project.',
    ],
  },
  relief: {
    tone: 'praise', emoji: ['🏛️', '🤝🏾'], sev: (_f, m) => tiers(m, [1, 200_000, 1_000_000]),
    core: [
      'After {what}, {who} don pay {amount} relief to {n|family|families}.',
      'SEMA show face this time! {amount} relief for {n|family|families} wey {what} hit.',
      '{who} no wait make water dry. {amount} relief don reach the victims for {other}.',
      'Victims of {what} for {other} get {amount} back from government. {who}, I see am.',
      'Relief money: {amount}. Paid. {who}, na so emergency management suppose be.',
    ],
    tail: ['Now fix the drainage so e no happen again.'],
  },
  ownPayCut: {
    tone: 'praise', emoji: ['✂️', '🫡'], sev: () => 2,
    core: [
      '{who} cut im own salary from {what} to {amount} a day.',
      'Una go believe? {who} reduce im own pay to {amount}.',
      '{who} don drop im own pay from {what} to {amount}. Make others copy.',
      'Politician wey reduce im own salary? {who} just do am: {what} to {amount}.',
    ],
  },
  efccCatch: {
    tone: 'praise', emoji: ['🕵🏾', '⚖️'], sev: (_f, m) => tiers(m, [1, 500_000, 5_000_000]),
    core: [
      '{who} no collect bribe. Case don close the correct way.',
      '{who} refuse the settlement. {amount} don go back to treasury.',
      'EFCC don do work today! {who} catch looter with {amount}.',
      '{who} look the bribe for face and say no.',
      'Respect to {who}. {amount} looting no pass.',
    ],
    tail: ['Now go catch the big ones.', 'Na so una suppose dey do every time.'],
  },
  fullTreasury: {
    tone: 'praise', emoji: ['🏦', '📈'], sev: () => 1,
    core: [
      'The {other} treasury get {amount}, no arrears, and the roads and hospital dey in shape. {who}, you dey try.',
      'I check {other} today. Money dey, things dey stand. {who} dey run am well.',
      '{who} dey keep the {other} books clean: {amount} for treasury and things dey work.',
      'No arrears for {other}, everything dey around {n}%. {who}, this one na management.',
      'Make I be fair: {other} under {who} dey stand well. {amount} for treasury.',
    ],
  },
} satisfies Record<string, VdmTopicDef>;

export type VdmTopic = keyof typeof VDM_TOPICS;
