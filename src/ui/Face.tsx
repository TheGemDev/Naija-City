import { useEffect, useMemo } from 'react';
import { avatarSvg } from '../game/face';
import { useGame } from '../game/store';
import { lookKey, useLooks, wantLook } from '../net/looks';
import { useNet } from '../net/multiplayer';
import { useSession } from '../net/session';
import { useSocial } from '../net/social';

interface Props {
  uid?: string | null;
  username?: string | null;
  look?: string | null;
  /** `xs` sits inline in a line of text; `fill` takes the size of the box it is in. Default is a chat row's 36px. */
  size?: 'xs' | 'sm' | 'lg' | 'fill';
  className?: string;
}

/** A player's look from wherever we already have it (me, the room, the friends list), asking the server if nobody does. */
export function usePlayerLook(uid?: string | null, username?: string | null, look?: string | null): string | null {
  const mine = useGame((s) => {
    const me = useSession.getState().user;
    return me && (uid ? me.uid === uid : !!username && me.username === username) ? s.look : null;
  });
  const live = useNet((s) => (uid ? s.players[uid]?.look : null));
  const known = useSocial((s) => (uid ? s.players[uid]?.look : null));
  const key = lookKey(uid, username);
  const fetched = useLooks((s) => s[key]);
  const l = mine || live || look || known || fetched;
  // Nobody handed us their look: ask the server (once per player, batched with the rest of the list).
  useEffect(() => {
    if (!l) wantLook(key);
  }, [l, key]);
  return l || null;
}

/** A player's face next to their name: drawn from their look, or their initial until we know it. */
export function Face({ uid, username, look, size, className }: Props) {
  const l = usePlayerLook(uid, username, look);
  const src = useMemo(() => (l ? `data:image/svg+xml,${encodeURIComponent(avatarSvg(l, '#e0f2fe'))}` : null), [l]);
  return (
    <span className={`convo-avatar${size ? ` ${size}` : ''}${className ? ` ${className}` : ''}`}>
      {src ? <img src={src} alt="" draggable={false} /> : (username ?? '?').slice(0, 1).toUpperCase()}
    </span>
  );
}
