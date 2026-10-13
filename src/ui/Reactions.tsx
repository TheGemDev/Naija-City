// Quick reactions beside a chat box (the street chat, a private chat, a group): a smiley that opens a row of emoji,
// and one tap sends one. The emoji are game/reactions.ts.

import { useRef, useState } from 'react';
import { isReaction, REACTIONS } from '../game/reactions';
import { Emoji } from './Icons';

/** Whether the row is open, and a `pick` that sends with a short gap between taps, so a mashed row is not a flood. */
export function useReactions(send: (char: string) => void) {
  const [open, setOpen] = useState(false);
  const last = useRef(0);
  const pick = (char: string) => {
    if (Date.now() - last.current < 700) return;
    last.current = Date.now();
    send(char);
  };
  return { open, toggle: () => setOpen((o) => !o), pick };
}

/** The smiley that sits left of the box. */
export function ReactionToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`chat-emoji ${open ? 'on' : ''}`} aria-label="Reactions" aria-expanded={open} onClick={onToggle}>
      <Emoji char="😄" size={22} />
    </button>
  );
}

/** The row of emoji above the box. */
export function ReactionTray({ onPick }: { onPick: (char: string) => void }) {
  return (
    <div className="chat-reactions" role="group" aria-label="Reactions">
      {REACTIONS.map((r) => (
        <button key={r.char} type="button" aria-label={r.label} title={r.label} onClick={() => onPick(r.char)}>
          <Emoji char={r.char} size={26} />
        </button>
      ))}
    </div>
  );
}

/** A message's text: a reaction sent on its own is drawn as one big emoji, anything else as it was typed. */
export function ReactionOr({ text, children }: { text: string; children: React.ReactNode }) {
  return isReaction(text) ? <span className="msg-reaction"><Emoji char={text} size={38} /></span> : <>{children}</>;
}
