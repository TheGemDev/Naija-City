// Ad plans sold for real naira (server side: worker/ads.ts). Edit prices and lengths here.

export interface AdPlan {
  id: string;
  label: string;
  icon: string;
  /** Price in real naira. */
  price: number;
  days: number;
  tag?: string;
}

/** Plans on sale. Only one-day ads for now. */
export const AD_PLANS: AdPlan[] = [{ id: 'day', label: 'Quick Shout', icon: '📣', price: 1_000, days: 1 }];

/** Plans no longer sold, kept so ads already booked on them still activate and show. */
const RETIRED_PLANS: AdPlan[] = [
  { id: 'week', label: 'Market Week', icon: '🛍️', price: 5_000, days: 7 },
  { id: 'month', label: 'Big Billboard', icon: '🏙️', price: 15_000, days: 30 },
];

export const AD_PLAN_BY_ID = Object.fromEntries([...AD_PLANS, ...RETIRED_PLANS].map((p) => [p.id, p])) as Record<string, AdPlan>;

export const AD_LIMITS = { title: 40, body: 160, link: 200 };
/** Ads one player may have waiting for payment or live at once. */
export const MAX_OPEN_ADS = 5;

export interface Ad {
  id: string;
  title: string;
  body: string;
  link: string | null;
  /** Picture URL (/api/media/...), when the poster added one. */
  image?: string | null;
  /** The picture fills the whole billboard instead of sitting beside the lettering. */
  fill?: boolean;
  /** The one billboard this ad is booked on (src/game/boards.ts); null for older ads with no board. */
  board?: string | null;
  /** The plan paid for. */
  planId?: string;
  /** Poster's username, when they have one. */
  by?: string | null;
  endsAt: number | null;
}

export interface MyAd extends Ad {
  planId: string;
  price: number;
  status: 'awaiting_payment' | 'active' | 'removed';
  createdAt: number;
}

/** Only http(s) links are allowed (stops javascript: and data: URLs); returns the cleaned URL or null. */
export function cleanLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** An ad picture must be one of the poster's own uploads (see worker/media.ts), never an outside URL. */
export function cleanImage(raw: string, uid: string): string | null {
  const m = raw.trim().match(/^\/api\/media\/(u\/([A-Za-z0-9_-]{1,128})\/[0-9a-f-]{36}\.(?:png|jpg|webp|gif))$/);
  return m && m[2] === uid ? `/api/media/${m[1]}` : null;
}
