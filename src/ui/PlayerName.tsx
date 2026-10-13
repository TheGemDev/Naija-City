import { useSession } from '../net/session';
import { Face } from './Face';
import { openPlayerProfile, usePlayerLabel } from '../net/social';

interface Props { uid: string; username?: string | null; name?: string | null }

/** A player as I know them: my nickname for them, else their @username. */
export function PlayerLabel({ uid, username }: Props) {
  return <>{usePlayerLabel(uid, username)}</>;
}

/** A player's name you can tap to open their profile. */
export function PlayerName({ uid, username, name }: Props) {
  const label = usePlayerLabel(uid, username);
  const mine = useSession((s) => s.user?.uid === uid);
  if (mine) return <>{label}</>;
  return (
    <button
      type="button"
      className="name-link"
      title="View profile"
      onClick={(event) => {
        event.stopPropagation();
        openPlayerProfile({ uid, username: username ?? null, name });
      }}
    >
      {label}
    </button>
  );
}

/** Whoever posted something (a tweet, a snap, a comment): their face and @username, which you can tap to open their profile. */
export function Poster({ uid, username }: Props) {
  const mine = useSession((s) => s.user?.uid === uid);
  const who = (
    <>
      <Face uid={uid} username={username} size="sm" />
      <b>@{username ?? 'someone'}</b>
    </>
  );
  if (mine) return who;
  return (
    <button type="button" className="name-link poster" title="View profile" onClick={() => openPlayerProfile({ uid, username: username ?? null })}>
      {who}
    </button>
  );
}
