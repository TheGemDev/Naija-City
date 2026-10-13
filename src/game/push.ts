// Push notification categories (worker/push.ts sends them, the profile sheet has a switch for each).

export const PUSH_CATEGORIES = [
  { id: 'money', name: 'Money', blurb: 'Payments, shop sales and rent' },
  { id: 'messages', name: 'Messages', blurb: 'Chats and new friends' },
  { id: 'invites', name: 'Invitations', blurb: 'Parties, house visits, dates and game challenges' },
  { id: 'crime', name: 'Crime & police', blurb: 'Break-ins, CCTV and EFCC cases' },
  { id: 'news', name: 'Government news', blurb: 'Elections and gazette notices' },
] as const;

export type PushCategory = (typeof PUSH_CATEGORIES)[number]['id'];
export const isPushCategory = (value: unknown): value is PushCategory => PUSH_CATEGORIES.some((c) => c.id === value);
