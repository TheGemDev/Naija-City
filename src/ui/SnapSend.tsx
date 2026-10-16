// A friend's snap streak mark, shown on snaps sent straight to me.

import { useSnaps } from '../net/snaps';
import { Emoji } from './Icons';

/** A friend's 🔥 streak with me, and ⏳ when it runs out at midnight unless we both send one today. */
export function Streak({ uid }: { uid: string }) {
  const s = useSnaps((st) => st.chats?.streaks.find((x) => x.uid === uid));
  if (!s?.count) return null;
  return (
    <span className="snap-streak" title={s.ending ? 'Send a snap today or the streak ends at midnight' : `${s.count}-day streak`}>
      {s.count}
      <Emoji char="🔥" size={13} />
      {s.ending && <Emoji char="⏳" size={13} />}
    </span>
  );
}
