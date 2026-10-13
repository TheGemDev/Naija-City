// The live city on the client: the server-wide event and cup-final bets, the Kaduna Gist feed, Yahoo
// scams, the underworld, and achievements (unlocked here, headline ones announced on the feed).
// The server side is worker/fun.ts.

import { create } from 'zustand';
import { api, serial, useSession } from './session';
import { flushWalletNow, refreshBalance, setServerBalance } from './wallet';
import { loadPolice } from './crime';
import { loadEfcc } from './efcc';
import { useCivic } from './civic';
import { OFFICES, type CivicCity } from '../game/civic';
import { dayOf, lifeHooks, naira, netWorthOf, useGame } from '../game/store';
import { liveEvent, FINAL_TEAMS, type FinalPick, type LiveEventId } from '../game/live';
import { ACHIEVEMENTS, type LegacyInput } from '../game/legacy';
import { STAGES } from '../game/property';
import { driveHooks } from '../game/driveState';
import { type CrimeTier } from '../game/underworld';
import { type PhoneSearchResult } from '../game/phoneSearch';
import { useApps } from '../game/apps';
import { type CrewResult } from '../game/heist';
import { loadParty, onSprayed } from './owambe';
import { squareName } from '../game/owambe';
import { onCrewResult, refreshBank } from './bank';

export interface FeedPost {
  id: number;
  uid: string | null;
  username: string | null;
  kind: string;
  icon: string;
  text: string;
  at: number;
  likes: number;
  liked: number | boolean;
  replies?: number;
}

/** The feed only ever shows this many top-level posts (server enforces it too). */
export const FEED_WINDOW = 200;

export interface MyBet {
  slot: number;
  pick: FinalPick;
  stake: number;
  payout: number | null;
}

export interface ParkInfo {
  id: string;
  boss: { uid: string; username: string | null } | null;
  since: number | null;
  shieldUntil: number | null;
  dues: number | null;
}

export interface ScamRecord {
  id: number;
  template: string;
  amount: number;
  status: 'sent' | 'caught' | 'paid' | 'reported' | 'cleared';
  at: number;
  victim: string | null;
  victimUid?: string;
  payout?: number;
  replyAt?: number | null;
  note?: string | null;
}

export interface MyPerk { perk: string; charges: number }

interface LiveState {
  feed: FeedPost[];
  /** The tweet a share link pointed at, shown at the top of Twitter until it is closed. */
  sharedPost: FeedPost | null;
  /** The state the News tab is showing (null: all of them). */
  feedCity: CivicCity | null;
  feedLoading: boolean;
  feedEnd: boolean;
  /** Twitter's VDM tab. */
  vdmFeed: FeedPost[];
  /** Twitter's Friends tab. */
  friendsFeed: FeedPost[];
  friendsEnd: boolean;
  replies: Record<number, FeedPost[]>;
  bets: MyBet[];
  results: { slot: number; result: FinalPick; score: string }[];
  underworld: { score: number; tier: CrimeTier['id']; turfWins: number; escapes: number; parks: ParkInfo[] } | null;
  scams: ScamRecord[];
  perks: MyPerk[];
  /** The last time the police or EFCC went through your phone (shown in the cell). */
  phoneSearch: PhoneSearchResult | null;
  busy: boolean;
}

export const useLive = create<LiveState>(() => ({ feed: [], sharedPost: null, feedCity: null, feedLoading: false, feedEnd: false, vdmFeed: [], friendsFeed: [], friendsEnd: false, replies: {}, bets: [], results: [], underworld: null, scams: [], perks: [], phoneSearch: null, busy: false }));

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await api(path, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}
const post = <T,>(path: string, body?: object) => call<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

/** Runs an action with the busy flag, reporting errors as a toast. */
async function act<T>(fn: () => Promise<T>): Promise<T | null> {
  if (useLive.getState().busy) return null;
  useLive.setState({ busy: true });
  try {
    return await serial(fn);
  } catch (e) {
    useGame.getState().toast(e instanceof Error ? e.message : 'Could not do that now');
    return null;
  } finally {
    useLive.setState({ busy: false });
  }
}

/* ---------- Live event + bets ---------- */

export async function loadLive() {
  if (!useSession.getState().user) return;
  const d = await call<{ bets: MyBet[]; results: LiveState['results'] }>('/api/live').catch(() => null);
  if (d) useLive.setState({ bets: d.bets, results: d.results });
}

export function placeBet(pick: FinalPick, stake: number) {
  return act(async () => {
    const r = await post<{ balance: number }>('/api/bet', { pick, stake });
    setServerBalance(r.balance);
    useGame.getState().bump('bets');
    useGame.getState().toast(`🎟️ Bet placed: ${naira(stake)} on ${pick === 'draw' ? 'a draw' : FINAL_TEAMS[pick]}. Full time in a few minutes!`);
    await loadLive();
  });
}

/* ---------- Feed ---------- */

export async function loadFeed(more = false) {
  if (!useSession.getState().user) return;
  const { feed: cur, feedCity: city } = useLive.getState();
  const before = more && cur.length ? cur[cur.length - 1].id : undefined;
  useLive.setState({ feedLoading: true });
  try {
    const query = new URLSearchParams({ ...(city && { city }), ...(before && { before: String(before) }) }).toString();
    const { posts } = await call<{ posts: FeedPost[] }>(`/api/feed${query ? `?${query}` : ''}`);
    // The pill moved on while this was loading: these are another state's posts.
    if (useLive.getState().feedCity !== city) return;
    useLive.setState({ feed: more ? [...cur, ...posts] : posts, feedEnd: posts.length < 30 || (more ? cur.length : 0) + posts.length >= FEED_WINDOW });
  } catch {
    /* offline: keep what we have */
  } finally {
    useLive.setState({ feedLoading: false });
  }
}

/** Show one state's news on the News tab (null: all of them). */
export function setFeedCity(city: CivicCity | null) {
  if (useLive.getState().feedCity === city) return;
  useLive.setState({ feedCity: city, feed: [], feedEnd: false });
  void loadFeed();
}

/** Tweets by my friends (and me), and news about them. */
export async function loadFriendsFeed(more = false) {
  if (!useSession.getState().user) return;
  const cur = useLive.getState().friendsFeed;
  const before = more && cur.length ? cur[cur.length - 1].id : undefined;
  useLive.setState({ feedLoading: true });
  try {
    const { posts } = await call<{ posts: FeedPost[] }>(`/api/feed?scope=friends${before ? `&before=${before}` : ''}`);
    useLive.setState({ friendsFeed: more ? [...cur, ...posts] : posts, friendsEnd: posts.length < 30 });
  } catch {
    /* offline: keep what we have */
  } finally {
    useLive.setState({ feedLoading: false });
  }
}

/** VDM's exposés only. */
export async function loadVdmFeed() {
  if (!useSession.getState().user) return;
  useLive.setState({ feedLoading: true });
  try {
    const { posts } = await call<{ posts: FeedPost[] }>('/api/feed/vdm');
    useLive.setState({ vdmFeed: posts });
  } catch {
    /* offline: keep what we have */
  } finally {
    useLive.setState({ feedLoading: false });
  }
}

export function postGist(text: string, parent?: number) {
  return act(async () => {
    await post('/api/feed', { text, parent });
    useGame.getState().bump('posts');
    if (parent) await loadReplies(parent);
    else await Promise.all([loadFeed(), loadFriendsFeed()]);
  });
}

export async function loadReplies(id: number) {
  try {
    const { replies } = await call<{ replies: FeedPost[] }>(`/api/feed/${id}/replies`);
    useLive.setState((s) => ({ replies: { ...s.replies, [id]: replies } }));
    useLive.setState((s) => ({ feed: s.feed.map((p) => (p.id === id ? { ...p, replies: replies.length } : p)) }));
  } catch {
    /* offline */
  }
}

export async function deletePost(id: number, parent?: number) {
  await call(`/api/feed/${id}`, { method: 'DELETE' });
  if (parent) await loadReplies(parent);
  else useLive.setState((s) => ({ feed: s.feed.filter((p) => p.id !== id), friendsFeed: s.friendsFeed.filter((p) => p.id !== id), sharedPost: s.sharedPost?.id === id ? null : s.sharedPost }));
}

/** Fetches the tweet a share link points at and pins it to the top of Twitter. False if it is gone. */
export async function openSharedPost(id: number) {
  const r = await call<{ post: FeedPost }>(`/api/feed/${id}`).catch(() => null);
  if (!r) return false;
  useLive.setState({ sharedPost: r.post });
  return true;
}

export async function likePost(id: number) {
  const r = await post<{ liked: boolean; likes: number }>(`/api/feed/${id}/like`).catch(() => null);
  if (!r) return;
  const upd = (p: FeedPost) => (p.id === id ? { ...p, liked: r.liked, likes: r.likes } : p);
  useLive.setState((s) => ({ sharedPost: s.sharedPost && upd(s.sharedPost), feed: s.feed.map(upd), vdmFeed: s.vdmFeed.map(upd), friendsFeed: s.friendsFeed.map(upd), replies: Object.fromEntries(Object.entries(s.replies).map(([k, v]) => [k, v.map(upd)])) }));
}

/* ---------- Scams ---------- */

export async function loadScams() {
  const d = await call<{ scams: ScamRecord[]; perks: MyPerk[] }>('/api/scams').catch(() => null);
  if (!d) return;
  const before = useLive.getState().scams;
  useLive.setState({ scams: d.scams, perks: d.perks });
  // Tell them when a mugu replied.
  for (const s of d.scams) {
    const was = before.find((b) => b.id === s.id);
    if (was?.status === 'sent' && s.status !== 'sent' && s.victimUid?.startsWith('npc:')) {
      if (s.status === 'paid') {
        useGame.getState().toast(`🤑 ${s.victim} paid ${naira(s.payout ?? 0)}! “${s.note ?? ''}”`);
        void refreshBalance();
      } else useGame.getState().toast(`🙄 ${s.victim}: “${s.note ?? 'No.'}”`);
    }
  }
}

export function sendScam(to: string, template: string) {
  return act(async () => {
    const r = await post<{ caught: boolean; fine?: number; balance?: number; mugu?: string; soap?: boolean; spell?: boolean }>('/api/scam', { to, template });
    useGame.getState().bump('scams');
    useGame.setState((s) => ({ notoriety: s.notoriety + 1 }));
    if (r.caught) {
      if (r.balance !== undefined) setServerBalance(r.balance);
      useGame.getState().toast(`🚨 EFCC was monitoring your IP address! ${naira(r.fine ?? 0)} fine and straight to the cell.`);
      void loadPolice();
    } else {
      useGame.getState().toast(`${r.soap ? '🧼 ' : ''}${r.spell ? '🔮 ' : ''}📨 Message delivered${r.mugu ? ` to ${r.mugu}. Watch your phone… 👀` : '. Now we wait for the “client” to pay… 👀'}`);
      if (r.mugu) {
        // Poll for the mugu's reply (they take 20 to 90 seconds).
        for (const ms of [25_000, 55_000, 95_000]) setTimeout(() => void loadScams(), ms);
      }
    }
    await loadScams();
    return r;
  });
}

export function buyPerk(perk: string) {
  return act(async () => {
    await flushWalletNow();
    const r = await post<{ fake: boolean; perks: MyPerk[]; balance: number }>('/api/baba/buy', { perk });
    setServerBalance(r.balance);
    useLive.setState({ perks: r.perks });
    return r;
  });
}

export function reportScam(messageId: number) {
  return act(async () => {
    const r = await post<{ verdict: 'caught' | 'escaped' | 'legit' | 'already'; refund?: number; balance?: number }>(`/api/scam/report/${messageId}`);
    if (r.balance !== undefined) setServerBalance(r.balance);
    const g = useGame.getState();
    if (r.verdict === 'caught') g.toast(`🕵🏾 EFCC traced the scammer and arrested them!${r.refund ? ` ${naira(r.refund)} returned to you.` : ''}`);
    else if (r.verdict === 'escaped') g.toast('🕵🏾 EFCC tried, but the scammer covered their tracks. Stay woke.');
    else if (r.verdict === 'legit') g.toast('🕵🏾 EFCC checked: this request looks genuine.');
    else g.toast('🕵🏾 This one was already handled.');
    return r;
  });
}

/* ---------- Underworld ---------- */

export async function loadUnderworld() {
  const d = await call<NonNullable<LiveState['underworld']>>('/api/underworld').catch(() => null);
  if (d) useLive.setState({ underworld: d });
}

export function claimPark(park: string) {
  return act(async () => {
    const r = await post<{ result: 'claimed' | 'won' | 'lost'; balance: number; until?: number | null }>('/api/underworld/claim', { park });
    setServerBalance(r.balance);
    const g = useGame.getState();
    if (r.result === 'claimed') g.toast('🕴🏾 The elders accepted your “settlement”. The park is yours. Collect your dues!');
    else if (r.result === 'won') g.toast('⚔️ You won the turf war! The old boss has run. You are the godfather now.');
    else {
      g.toast(r.until ? '🩹 You lost the turf war and the police scooped you up.' : '🩹 You lost the turf war. Lick your wounds.');
      if (r.until) void loadPolice();
    }
    useGame.setState((s) => ({ notoriety: s.notoriety + 1 }));
    await loadUnderworld();
  });
}

export function collectDues(park: string) {
  return act(async () => {
    const r = await post<{ result: 'collected' | 'raided'; dues?: number; fine?: number; balance: number }>('/api/underworld/collect', { park });
    setServerBalance(r.balance);
    const g = useGame.getState();
    if (r.result === 'collected') {
      useGame.setState((s) => ({ txns: [{ at: s.minutes, label: 'Motor park dues collected', amount: r.dues ?? 0 }, ...s.txns].slice(0, 40) }));
      g.toast(`💰 The boys brought your dues: ${naira(r.dues ?? 0)}`);
    } else {
      g.toast(`🚔 POLICE RAID! You were arrested counting dues. ${naira(r.fine ?? 0)} fine, and you've lost the park.`);
      void loadPolice();
    }
    await loadUnderworld();
  });
}

/* ---------- Server pushes ---------- */

export type FunEvent =
  | { t: 'fun'; kind: 'jailed'; until: number; reason: string }
  | { t: 'fun'; kind: 'efccCase'; caseId: string }
  | { t: 'fun'; kind: 'bet'; payout: number; stake: number; score: string; result: FinalPick }
  | { t: 'fun'; kind: 'ousted'; by: string; park: string }
  | { t: 'fun'; kind: 'phoneSearch'; search: PhoneSearchResult }
  | { t: 'fun'; kind: 'sprayed'; by: string; amount: number; party: string | null }
  | { t: 'fun'; kind: 'owambeInvite'; host: string; title: string; endsAt: number; square?: string }
  | { t: 'fun'; kind: 'crew'; text: string }
  | { t: 'fun'; kind: 'crewResult'; result: CrewResult };

export function onFunEvent(e: FunEvent) {
  const g = useGame.getState();
  if (e.kind === 'jailed') {
    g.toast(`🚔 ${e.reason}. You've been taken to the cell.`);
    void loadPolice();
    void refreshBalance();
  } else if (e.kind === 'efccCase') {
    g.toast('🕵🏾 Someone has opened an EFCC investigation on you. Open the EFCC app within 90 seconds to respond, or pay to see who did it.');
    void loadEfcc();
  } else if (e.kind === 'bet') {
    const line = `${FINAL_TEAMS.home} ${e.score} ${FINAL_TEAMS.away}`;
    if (e.payout > 0) {
      g.bump('betsWon');
      g.bump('betWinnings', e.payout);
      useGame.setState((s) => ({ txns: [{ at: s.minutes, label: 'Cup final bet won', amount: e.payout }, ...s.txns].slice(0, 40) }));
      g.toast(`🏆 FULL TIME: ${line}. You won ${naira(e.payout)}! 🤑`);
    } else g.toast(`😩 FULL TIME: ${line}. Your ${naira(e.stake)} bet is gone.`);
    void refreshBalance();
    void loadLive();
  } else if (e.kind === 'phoneSearch') {
    const r = e.search;
    useLive.setState({ phoneSearch: r });
    for (const id of r.seized) useApps.getState().uninstall(id);
    if (r.found.length) {
      g.toast(`📱 ${r.agency === 'efcc' ? 'EFCC' : 'Police'} searched your phone! ${naira(r.fine)} extra fine${r.extraMinutes ? `, +${r.extraMinutes} min in the cell` : ''}.`);
      void refreshBalance();
      void loadPolice();
    }
  } else if (e.kind === 'sprayed') {
    onSprayed(e.by, e.amount, e.party);
  } else if (e.kind === 'owambeInvite') {
    g.toast(`💌 @${e.host} invited you to ${e.title} at ${e.square ?? 'Murtala Square'}! Come and chop before it ends.`);
    void loadParty();
  } else if (e.kind === 'crew') {
    g.toast(e.text);
    void refreshBank();
  } else if (e.kind === 'crewResult') {
    onCrewResult(e.result);
    void loadPolice();
  } else if (e.kind === 'ousted') {
    g.toast(`⚔️ @${e.by} took ${e.park} from you in a turf war!`);
    void loadUnderworld();
  }
}

/* ---------- Achievements ---------- */

export function legacyInput(): LegacyInput {
  const s = useGame.getState();
  return {
    stats: s.stats,
    flags: s.storyFlags,
    netWorth: netWorthOf(s),
    goodDeeds: s.goodDeeds,
    notoriety: s.notoriety,
    knowledge: s.knowledge,
    governmentOffice: s.governmentOffice ?? holdsOffice(),
    houses: s.properties.filter((p) => p.stage >= STAGES.length).length,
    cars: s.ownedCars.length,
    workDays: s.workDays,
    days: dayOf(s.minutes),
    achievements: s.achievements.length,
  };
}

/** Shared elections: do I hold an office right now? */
function holdsOffice() {
  const uid = useSession.getState().user?.uid;
  const p = useCivic.getState().data?.policies;
  if (!uid || !p) return null;
  return OFFICES.find((o) => p[o]?.uid === uid) ?? null;
}

function checkAchievements() {
  const s = useGame.getState();
  if (!s.started) return;
  const input = legacyInput();
  const fresh = ACHIEVEMENTS.filter((a) => !s.achievements.includes(a.id) && a.check(input));
  if (!fresh.length) return;
  useGame.setState({ achievements: [...s.achievements, ...fresh.map((a) => a.id)] });
  for (const a of fresh) {
    s.toast(`🏆 Achievement unlocked: ${a.icon} ${a.title}`);
    if (a.rare && useSession.getState().user) void post('/api/feed', { achievement: a.id }).catch(() => {});
  }
}

/* ---------- Start ---------- */

let lastEvent: string | null = null;

function announceEvents() {
  const g = useGame.getState();
  // Keyed by city too: land in Abuja mid-event and you hear what is on there.
  const e = liveEvent(Date.now(), g.destinationId);
  const key = e.active ? `${g.destinationId}:${e.slot}` : null;
  if (key === lastEvent) return;
  const first = lastEvent === null && !e.active;
  lastEvent = key;
  if (!e.active || first) return;
  if (!g.started) return;
  g.toast(`${e.def.icon} LIVE NOW: ${e.def.title}. ${e.def.blurb}`);
  if (e.def.id === 'final') void loadLive();
}

/** A wedding invitation sometimes arrives with a new day. */
function maybeInvite(prevDay: number, day: number) {
  if (day === prevDay) return;
  if (Math.random() < 0.3) {
    // The invitation is to the square of the city you are in.
    useGame.setState({ owambeInvite: day, owambeInviteCity: useGame.getState().destinationId });
    const couple = ['Aisha & Musa', 'Ngozi & Ibrahim', 'Fatima & Yusuf', 'Blessing & Abdul', 'Hauwa & Chinedu'][Math.floor(Math.random() * 5)];
    useGame.getState().toast(`💌 You’re invited to ${couple}’s wedding today at ${squareName(useGame.getState().destinationId)} (12pm–10pm). Bring your dancing shoes and your naira!`);
  }
}

export const isLiveEvent = (id: LiveEventId) => {
  const e = liveEvent(Date.now(), useGame.getState().destinationId);
  return e.active && e.def.id === id;
};

export function startLive() {
  lifeHooks.onEnd = (r) => {
    if (useSession.getState().user) void post('/api/feed', { legacy: { icon: r.icon, name: r.name, days: r.days, title: r.title, score: r.score } }).catch(() => {});
  };
  driveHooks.onEscape = () => {
    if (useSession.getState().user) void post('/api/underworld/escape').catch(() => {});
  };
  const tick = setInterval(() => {
    announceEvents();
    checkAchievements();
  }, 3000);
  const unsub = useGame.subscribe((s, p) => {
    if (s.started && p.started) maybeInvite(dayOf(p.minutes), dayOf(s.minutes));
  });
  // Bets settle when anyone looks, so peek while a final is on or just finished.
  const poll = setInterval(() => {
    const e = liveEvent();
    if (useSession.getState().user && (useLive.getState().bets.some((b) => b.payout === null) || (e.active && e.def.id === 'final'))) void loadLive();
  }, 30_000);
  const onSession = useSession.subscribe((s, p) => {
    if (s.status === 'ready' && p.status !== 'ready') {
      void loadLive();
      void useCivic.getState().refresh();
    }
  });
  return () => {
    clearInterval(tick);
    clearInterval(poll);
    unsub();
    onSession();
    lifeHooks.onEnd = null;
    driveHooks.onEscape = null;
  };
}
