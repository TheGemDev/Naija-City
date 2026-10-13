// "Yahoo" scams between players. A scam is a payment request dressed up as something else; if the
// target pays it, the scammer gets the money. The EFCC can catch the scammer when they send it, or later
// if the victim reports it (worker/fun.ts). Fiction only: these are jokes about well-known scam types.

export interface ScamTemplate {
  id: string;
  icon: string;
  title: string;
  /** What the target sees as the request note. */
  text: string;
  amount: number;
  /** Paid scams needed before this script unlocks. */
  minPaid?: number;
}

export const SCAMS: ScamTemplate[] = [
  { id: 'promo', icon: '🎁', title: 'Network promo', amount: 15_000, text: '🎉 CONGRATULATIONS! You have won ₦2,500,000 in the KD-Tel Mega Promo. Pay ₦15,000 processing fee to claim your prize today.' },
  { id: 'prince', icon: '🤴🏾', title: 'Prince inheritance', amount: 25_000, text: 'Dear friend, I am Prince Abubakar. My late father left $40M. I need ₦25,000 for transfer charges and I will share 30% with you. God bless.' },
  { id: 'hospital', icon: '🏥', title: 'Fake emergency', amount: 10_000, text: 'Please it’s me, your cousin. I am in hospital and they won’t treat me without ₦10,000 deposit. Please send now, I will explain later 🙏🏾' },
  { id: 'job', icon: '💼', title: 'Job registration', amount: 8_000, text: 'Your CV has been shortlisted for a ₦450k/month NNPC job! Pay ₦8,000 for your medical test form before 5pm.' },
  { id: 'crypto', icon: '🪙', title: 'Crypto doubler', amount: 30_000, text: 'Invest ₦30,000 in KadunaCoin today and receive ₦90,000 in 48 hours. Guaranteed. 1000+ testimonies. Don’t miss out!' },
  { id: 'romance', icon: '💘', title: 'Romance', amount: 20_000, text: 'Hi dear 😘 I saw your profile and fell in love. I am a doctor in the US army. Please send ₦20,000 for my leave form so I can come and see you.' },
  { id: 'bvn', icon: '🏦', title: 'BVN update', amount: 40_000, minPaid: 3, text: 'URGENT: Your bank account will be blocked in 2 hours. Pay ₦40,000 BVN re-validation fee at once to keep your money safe.' },
  { id: 'visa', icon: '🛂', title: 'Visa lottery', amount: 60_000, minPaid: 8, text: 'Your Canada work visa is APPROVED. Pay ₦60,000 for the embassy courier and you fly Monday. No stories.' },
  { id: 'forex', icon: '📈', title: 'Forex mentor', amount: 100_000, minPaid: 15, text: 'Join my VIP forex signals. Pay ₦100,000 once and I will 10x it by Friday. Screenshot of my Lambo attached.' },
];

export const SCAM_BY_ID: Record<string, ScamTemplate> = Object.fromEntries(SCAMS.map((s) => [s.id, s]));

export const SCAM_RULES = {
  /** One scam message every this long. */
  cooldownMs: 5 * 60_000,
  /** The same target can only be tried once in this long. */
  sameTargetMs: 6 * 3600_000,
  /** Chance the EFCC catches you on sending (plus the EFCC chair's fine % / 1000). */
  catchChance: 0.12,
  /** Chance a reported scam is traced back to you. */
  reportCatchChance: 0.7,
  /** With Baba’s fog. */
  fogCatchChance: 0.15,
  /** How long a mugu takes to reply. */
  replyMinMs: 20_000,
  replyMaxMs: 90_000,
  /** Same mugu can be tried again after this. */
  muguCooldownMs: 10 * 60_000,
  /** Attempts on the same mugu inside this window make them wise up. */
  wiseWindowMs: 3 * 3600_000,
  /** Fine when caught, on top of paying back. */
  fine: 20_000,
};

/* ---------- Mugus: the NPCs who can actually fall for it ---------- */

export interface Mugu {
  id: string;
  name: string;
  icon: string;
  bio: string;
  /** Base chance they pay, before the script and Baba. */
  gullible: number;
  /** The most they'll ever send. */
  wallet: number;
  /** Scripts that work especially well on them (+) and ones that make them laugh (-). */
  weak: string[];
  wise: string[];
  /** Their replies when they pay / refuse. */
  paid: string;
  refused: string;
}

export const MUGUS: Mugu[] = [
  { id: 'aunty', name: 'Aunty Ngozi', icon: '👩🏾‍🦳', bio: 'Retired teacher in Barnawa. Prays on every message.', gullible: 0.3, wallet: 30_000, weak: ['promo', 'prince', 'hospital'], wise: ['crypto', 'forex'], paid: 'Ah ah, God don answer! I don send am, my son. Bless you 🙏🏾', refused: 'This one smell like 419. I am calling my pastor.' },
  { id: 'corper', name: 'Corper Tunde', icon: '🧑🏾‍🎓', bio: 'NYSC in Kaduna, ₦33k allowee, thirsty for japa.', gullible: 0.35, wallet: 70_000, weak: ['job', 'visa', 'crypto'], wise: ['hospital', 'prince'], paid: 'Visa don land! Sending now, abeg don’t scatter my dream 😭', refused: 'Bro I read “Scams 101” on Twitter. Blocked.' },
  { id: 'bigman', name: 'Alhaji Danladi', icon: '🧔🏾', bio: 'Rich contractor. Busy, never reads, always pays.', gullible: 0.2, wallet: 150_000, weak: ['bvn', 'forex', 'promo'], wise: ['romance', 'job'], paid: 'My PA will transfer. Let it not happen again.', refused: 'Do you know who I am? EFCC is my neighbour.' },
  { id: 'student', name: 'Fatima (ABU 300L)', icon: '👩🏾‍🎓', bio: 'Lonely in the hostel, scrolls all night.', gullible: 0.3, wallet: 40_000, weak: ['romance', 'promo', 'job'], wise: ['bvn', 'prince'], paid: 'Omo, he dey real! Sending from my school fees, don’t disappoint me 💕', refused: 'Nice try, I dey school. I know all these tricks.' },
  { id: 'trader', name: 'Mama Put', icon: '👩🏾‍🍳', bio: 'Sells jollof at Kawo. Cash-rich, phone-poor.', gullible: 0.4, wallet: 50_000, weak: ['bvn', 'hospital', 'promo'], wise: ['crypto', 'visa'], paid: 'Sebi na bank. Okay I don pay o, my money dey safe abi?', refused: 'Customer, buy food or go! No time for phone wahala.' },
  { id: 'techbro', name: 'Techbro Kelvin', icon: '🧑🏾‍💻', bio: 'Crypto evangelist. Has been rugged 6 times and counting.', gullible: 0.45, wallet: 120_000, weak: ['crypto', 'forex', 'visa'], wise: ['hospital', 'job'], paid: 'LFG!! 🚀 Aped in. WAGMI.', refused: 'DYOR bro. This is clearly a honeypot.' },
];
export const MUGU_BY_ID: Record<string, Mugu> = Object.fromEntries(MUGUS.map((m) => [m.id, m]));
export const MUGU_PREFIX = 'npc:';

/** Odds a mugu pays: base, the script fit, wised-up by recent attempts, then Baba's spell. */
export function muguChance(m: Mugu, template: string, recentTries: number, spell: boolean) {
  let p = m.gullible + (m.weak.includes(template) ? 0.3 : 0) - (m.wise.includes(template) ? 0.2 : 0) - recentTries * 0.12;
  if (spell) p += 0.35;
  return Math.max(0.03, Math.min(0.92, p));
}

/* ---------- Baba Online perks ---------- */

export interface BabaPerk {
  id: 'soap' | 'spell' | 'fog' | 'blessing';
  icon: string;
  label: string;
  price: number;
  charges: number;
  blurb: string;
}

export const BABA_PERKS: BabaPerk[] = [
  { id: 'soap', icon: '🧼', label: 'Invisibility soap', price: 25_000, charges: 3, blurb: 'Bathe with it and the guards, the gateman and the police see only wind. Your next 3 thefts and Yahoo sends cannot get you caught or reported. (Baba is not liable if the soap is fake.)' },
  { id: 'spell', icon: '🔮', label: 'Mugu spell', price: 12_000, charges: 3, blurb: 'Your next 3 scams hit the “client” in the head: +35% chance they pay.' },
  { id: 'fog', icon: '🌫️', label: 'Fog of the ancestors', price: 8_000, charges: 2, blurb: 'The EFCC trace on your next 2 reported scams comes back blurry (trace chance down to 15%).' },
  { id: 'blessing', icon: '🙌🏾', label: 'Prosperity blessing', price: 15_000, charges: 2, blurb: 'The next 2 scams that pay, pay 50% more.' },
];
export const PERK_BY_ID: Record<string, BabaPerk> = Object.fromEntries(BABA_PERKS.map((p) => [p.id, p]));
export const FAKE_PERK_CHANCE = 0.12;
