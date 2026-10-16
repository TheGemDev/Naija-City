// Unread badges: the red count on the phone's app icons and on the HUD's Phone button (server: worker/badges.ts).
// Messages count unread chats and group lines, as the Messages app shows them (net/social.ts and net/groups.ts keep
// those live from the socket). Snap and Twitter count what is new since the app was last opened, from the server.

import { create } from 'zustand';
import { useGame } from '../game/store';
import { api, useSession } from './session';
import { loadInbox, unreadCount, useSocial } from './social';
import { groupUnread, loadGroups, useGroups } from './groups';

export type SeenApp = 'snap' | 'twitter';

interface Badges {
  snap: number;
  twitter: number;
  /** Apps on screen right now: their count stays 0 while you look at them. */
  open: SeenApp[];
}

export const useBadges = create<Badges>(() => ({ snap: 0, twitter: 0, open: [] }));

/** How often the counts are fetched while the game is open and in view. */
const POLL_MS = 60_000;

/** The number on a badge: no bubble ever needs more than "9+". */
export const badgeLabel = (n: number) => (n > 9 ? '9+' : String(n));

export const useMessagesBadge = () => useSocial(unreadCount) + useGroups(groupUnread);

/** Everything waiting on the phone: the HUD's Phone button shows it while the phone is put away. */
export const usePhoneBadge = () => useMessagesBadge() + useBadges((s) => s.snap + s.twitter);

const total = () => unreadCount(useSocial.getState()) + groupUnread(useGroups.getState()) + useBadges.getState().snap + useBadges.getState().twitter;

/** Bumped by every "seen", so a poll that left before it cannot bring the old count back. */
let epoch = 0;
let inflight = false;
/** The server's last message counts: the chat lists are reloaded only when those move and disagree with them. */
let last = { dms: -1, groups: -1 };

export async function refreshBadges() {
  if (inflight) return;
  inflight = true;
  const at = epoch;
  try {
    const res = await api('/api/badges');
    if (!res.ok) return;
    const b = (await res.json()) as { dms?: number; groups?: number; snap?: number; twitter?: number };
    if (at === epoch) {
      const open = useBadges.getState().open;
      useBadges.setState({ snap: open.includes('snap') ? 0 : b.snap ?? 0, twitter: open.includes('twitter') ? 0 : b.twitter ?? 0 });
    }
    // A message that came while the socket was down (or a group line, which has no live event): pick up the lists.
    const dms = b.dms ?? 0, groups = b.groups ?? 0;
    if (dms !== last.dms && dms !== unreadCount(useSocial.getState())) loadInbox().catch(() => {});
    if (groups !== last.groups && groups !== groupUnread(useGroups.getState())) loadGroups().catch(() => {});
    last = { dms, groups };
  } catch {
    // Offline or signed out: keep what is shown.
  } finally {
    inflight = false;
  }
}

/** When each app was last marked seen on the server: a tap on the icon and the app opening are one visit. */
const sentAt: Partial<Record<SeenApp, number>> = {};

/** Opened an app: its badge is 0 now and on the server. */
export function markAppSeen(app: SeenApp) {
  epoch++;
  useBadges.setState({ [app]: 0 } as Pick<Badges, SeenApp>);
  if (Date.now() - (sentAt[app] ?? 0) < 2_000) return;
  sentAt[app] = Date.now();
  api('/api/badges/seen', { method: 'POST', body: JSON.stringify({ app }) }).catch(() => {});
}

/** Something new came live (a snap sent to me): count it now, unless the app is open; the next poll confirms it. */
export function bumpBadge(app: SeenApp) {
  if (useBadges.getState().open.includes(app)) return;
  useBadges.setState((s) => ({ [app]: s[app] + 1 }) as Pick<Badges, SeenApp>);
}

/** For an app's screen: seen when it opens and again when it closes, so nothing that came while it was open counts. */
export function openedApp(app: SeenApp) {
  useBadges.setState((s) => ({ open: [...s.open, app] }));
  markAppSeen(app);
  return () => {
    const open = [...useBadges.getState().open];
    open.splice(open.indexOf(app), 1);
    useBadges.setState({ open });
    markAppSeen(app);
  };
}

/** The count in the tab title, "(3) Naija City", and on the installed app's icon where the system allows it. */
function showTotal(base: string) {
  let shown = -1;
  return () => {
    const n = total();
    if (n === shown) return;
    shown = n;
    document.title = n > 0 ? `(${badgeLabel(n)}) ${base}` : base;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      (n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {});
    } catch {
      // Not supported here.
    }
  };
}

/** Polls the counts while a signed-in player is in the game and the tab is in view, and at once on coming back to it. */
export function startBadges() {
  let ready = false;
  let lastPoll = 0;
  const poll = (force = false) => {
    if (!ready || document.visibilityState !== 'visible') return;
    if (!force && Date.now() - lastPoll < 5_000) return;
    lastPoll = Date.now();
    void refreshBadges();
  };
  const check = () => {
    const s = useSession.getState();
    const now = s.status === 'ready' && !!s.user?.username && useGame.getState().started;
    if (!s.user) {
      useBadges.setState({ snap: 0, twitter: 0 });
      last = { dms: -1, groups: -1 };
    }
    const was = ready;
    ready = now;
    if (now && !was) poll(true);
  };
  const a = useSession.subscribe(check);
  const b = useGame.subscribe((s, p) => s.started !== p.started && check());
  check();
  const id = setInterval(() => poll(true), POLL_MS);
  const onFocus = () => poll();
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onFocus);
  const base = document.title.replace(/^\(\d+\+?\) /, '');
  const show = showTotal(base);
  const subs = [useBadges.subscribe(show), useSocial.subscribe(show), useGroups.subscribe(show)];
  show();
  return () => {
    a();
    b();
    clearInterval(id);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onFocus);
    subs.forEach((u) => u());
    document.title = base;
  };
}
