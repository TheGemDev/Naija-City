// Share links: /u/<username> (a player), /b/<region>/<slot> (a plot), /p/<placeId> (a location in Kaduna) or /p/<city>/<placeId> (one in another city), /s/<id> (a snap),
// /t/<id> (a tweet) and /shop/<id> (a player's business).
// The link is read once on load, parked here until the player is signed in and past the title screen,
// then followed. worker/share.ts serves the same page for these paths with link-preview tags.

import { sectionOf } from '../game/estate';
import { cityMap } from '../game/city';
import { regionOf } from '../game/regions';
import { useGame } from '../game/store';
import { tripFlight, useTrip } from '../game/trip';
import { loadEstate, useEstate } from './estate';
import { useSocial } from './social';
import { openSharedSnap } from './snaps';
import { openSharedPost } from './live';
import { useSharedShop, type SharedShop } from './market';

export type DeepLink =
  | { kind: 'user'; username: string }
  | { kind: 'plot'; region: string; slot: number }
  | { kind: 'place'; placeId: string; /** The city the place is in: the cities share place ids. Kaduna when left out. */ city?: string }
  | { kind: 'snap'; id: number }
  | { kind: 'tweet'; id: number }
  | { kind: 'shop'; id: number };

const SITE = 'https://naija.city';

export const userLink = (username: string) => `${SITE}/u/${username}`;
/** A player's invite link: their username is the referral code (net/referral.ts). */
export const inviteLink = (username: string) => `${SITE}/?ref=${username}`;
/** An invite to a state: whoever signs up from it is born there (net/referral.ts takeBirthState). With the inviter's
 *  username it counts as their referral too. */
export const stateLink = (state: string, username?: string | null) => `${SITE}/?state=${state}${username ? `&ref=${username}` : ''}`;
export const plotLink = (region: string, slot: number) => `${SITE}/b/${region}/${slot}`;
/** Kaduna's links carry no city: they were shared before there was a second one. */
export const placeLink = (placeId: string, city = 'kaduna') => `${SITE}/p/${city === 'kaduna' ? '' : `${city}/`}${placeId}`;
export const snapLink = (id: number) => `${SITE}/s/${id}`;
export const tweetLink = (id: number) => `${SITE}/t/${id}`;
export const shopLink = (id: number) => `${SITE}/shop/${id}`;
/** The shop a chat message points at, when the whole message is one shop link. */
export const shopIdOf = (text: string): number | null => {
  const m = /^https:\/\/naija\.city\/shop\/(\d{1,9})\/?$/.exec(text.trim());
  return m ? Number(m[1]) : null;
};

/** Read a share link off the address bar and tidy the URL back to "/". */
export function takeDeepLink(): DeepLink | null {
  const path = window.location.pathname;
  let link: DeepLink | null = null;
  const u = path.match(/^\/u\/([A-Za-z0-9_]{1,15})\/?$/);
  const b = path.match(/^\/b\/([a-z0-9_]{1,24})\/(\d{1,8})\/?$/);
  const p = path.match(/^\/p\/(?:([a-z]{1,20})\/)?([a-z_]{1,30})\/?$/);
  if (u) link = { kind: 'user', username: u[1].toLowerCase() };
  else if (b) link = { kind: 'plot', region: b[1], slot: Number(b[2]) };
  else if (p) link = { kind: 'place', placeId: p[2], city: p[1] ?? 'kaduna' };
  const post = path.match(/^\/(s|t)\/(\d{1,12})\/?$/);
  if (post) link = { kind: post[1] === 's' ? 'snap' : 'tweet', id: Number(post[2]) };
  const shop = path.match(/^\/shop\/(\d{1,10})\/?$/);
  if (shop) link = { kind: 'shop', id: Number(shop[1]) };
  if (link) window.history.replaceState({}, '', '/' + window.location.search + window.location.hash);
  return link;
}

/** Go where the link points. Returns false if it didn't work out. */
export async function followDeepLink(link: DeepLink): Promise<void> {
  const g = useGame.getState();
  if (link.kind === 'user') {
    const res = await fetch(`/api/profile/${link.username}`).catch(() => null);
    if (!res?.ok) return g.toast('Could not find that player');
    const p = (await res.json()) as { uid: string; username: string };
    g.setPanel('phone');
    useSocial.setState({ openWith: p.uid });
    return;
  }
  // A snap or tweet opens its phone app with that post pinned on top. Both are gone after a day.
  if (link.kind === 'snap') {
    if (!(await openSharedSnap(link.id))) return g.toast('That snap is gone. Snaps only last 24 hours');
    useGame.setState({ panel: 'phone', openApp: 'flex' });
    return;
  }
  if (link.kind === 'tweet') {
    if (!(await openSharedPost(link.id))) return g.toast('That tweet is gone. Tweets only last a day');
    useGame.setState({ panel: 'phone', openApp: 'gist' });
    return;
  }
  // A shop opens the Business app on its shelf.
  if (link.kind === 'shop') {
    const res = await fetch(`/api/shop/${link.id}`).catch(() => null);
    if (!res?.ok) return g.toast('Could not find that shop');
    useSharedShop.setState({ shop: (await res.json()) as SharedShop });
    useGame.setState({ panel: 'phone', openApp: 'business' });
    return;
  }
  if (link.kind === 'place') {
    const city = cityMap(link.city ?? 'kaduna');
    const place = city.id === (link.city ?? 'kaduna') ? city.placeById[link.placeId] : undefined;
    if (!place) return g.toast('Could not find that location');
    // The map shows the city you are in: another city's place is a flight away, booked whole from one sheet (ui/TripSheet.tsx).
    if (cityMap(g.destinationId).id !== city.id) {
      if (!tripFlight(g.destinationId, city.id)) return g.toast(`${place.icon} ${place.name} is in ${regionOf(city.id).name}. Fly there from the airport ✈️`);
      g.setPanel(null);
      if (g.view !== 'city') g.openMap();
      if (useGame.getState().view === 'city') useTrip.setState({ offer: { city: city.id, place } });
      return;
    }
    g.setPanel(null);
    if (g.view !== 'city') g.openMap();
    useGame.getState().selectPlace(place.id);
    return;
  }
  const no = sectionOf(link.slot);
  g.visitEstate(link.region, no);
  if (useGame.getState().estateId !== link.region) return;
  await loadEstate(link.region, no);
  useEstate.setState({ picked: link.slot });
}

/** Hand a link to the phone's share sheet, or copy it. */
export async function shareLink(url: string, title: string) {
  const toast = useGame.getState().toast;
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast('🔗 Link copied');
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    toast('Could not share the link');
  }
}

/** Copy a link. Where the page may not touch the clipboard (some in-app browsers), the share sheet hands it over. */
export async function copyLink(url: string, title: string, copied = '🔗 Link copied') {
  try {
    await navigator.clipboard.writeText(url);
    useGame.getState().toast(copied);
  } catch {
    await shareLink(url, title);
  }
}

/** Copy a link and open the phone's share sheet in the same tap (where there is one: elsewhere the copy is all that happens). */
export async function copyAndShare(url: string, title: string, copied = '🔗 Link copied') {
  // Not awaited: the share sheet must open inside the tap, and some browsers drop the tap if anything waits first.
  void navigator.clipboard?.writeText(url).then(() => useGame.getState().toast(copied)).catch(() => {});
  await shareLink(url, title);
}
