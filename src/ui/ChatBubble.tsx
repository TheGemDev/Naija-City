import { isReaction } from '../game/reactions';
import { Emoji } from './Icons';

/** The speech bubble over a player's head. A reaction shows as one big emoji instead of a line of text. */
export function ChatBubble({ text }: { text: string }) {
  if (isReaction(text)) return <div className="bubble reaction"><Emoji char={text} size={34} /></div>;
  return <div className="bubble">{text}</div>;
}
