import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSession } from '../net/session';
import { searchPlayers, type PlayerRef } from '../net/social';
import { PlayerName } from './PlayerName';
import { Face } from './Face';
import { Emoji } from './Icons';
import { ReactionOr, ReactionToggle, ReactionTray, useReactions } from './Reactions';
import {
  addGroupMember,
  createGroup,
  leaveGroup,
  loadGroup,
  loadOlderGroupMessages,
  sendGroupText,
  type GroupMessage,
  useGroups,
} from '../net/groups';

const POLL_MS = 5_000;

// A reply travels as plain text ("↪ @who: snippet", newline, reply) so no server change is needed.
const QUOTE = '↪ ';
const QUOTE_MAX = 70;
const quoteOf = (m: GroupMessage, myUid?: string | null) => {
  const body = (m.text.startsWith(QUOTE) ? m.text.slice(m.text.indexOf('\n') + 1) : m.text).replace(/\s+/g, ' ');
  return `${QUOTE}@${m.from === myUid ? 'me' : m.username ?? 'player'}: ${body.slice(0, QUOTE_MAX - 1)}${body.length >= QUOTE_MAX ? '…' : ''}\n`;
};

function MessageText({ text, me }: { text: string; me?: string | null }) {
  const nl = text.startsWith(QUOTE) ? text.indexOf('\n') : -1;
  if (nl < 0) return <ReactionOr text={text}><MentionText text={text} me={me} /></ReactionOr>;
  const body = text.slice(nl + 1);
  return (
    <>
      <i className="group-quote">{text.slice(QUOTE.length, nl)}</i>
      <ReactionOr text={body}><MentionText text={body} me={me} /></ReactionOr>
    </>
  );
}

/** Render message text with @mentions highlighted (mine stronger). */
function MentionText({ text, me }: { text: string; me?: string | null }) {
  return (
    <>
      {text.split(/(@[a-z0-9_]+)/gi).map((part, i) =>
        /^@[a-z0-9_]+$/i.test(part) ? (
          <b key={i} className={`mention ${me && part.slice(1).toLowerCase() === me.toLowerCase() ? 'me' : ''}`}>{part}</b>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Pick people and a name to start a group chat. */
export function NewGroup({ onDone, onBack }: { onDone: (id: number) => void; onBack: () => void }) {
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlayerRef[]>([]);
  const [picked, setPicked] = useState<PlayerRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const term = q.trim().replace(/^@/, '');
    if (!term) return setResults([]);
    const id = setTimeout(() => searchPlayers(term).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(id);
  }, [q]);
  const create = async () => {
    setBusy(true);
    try {
      onDone(await createGroup(name, picked.map((p) => p.uid)));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <button className="msg-back" onClick={onBack}>‹ Messages</button>
      <div className="at-input msg-search">
        <span><Emoji char="👥" size={18} /></span>
        <input autoFocus value={name} maxLength={30} placeholder="Group name" onChange={(e) => setName(e.target.value)} />
      </div>
      {picked.length > 0 && (
        <div className="group-pick">
          {picked.map((p) => (
            <i key={p.uid} onClick={() => setPicked(picked.filter((x) => x.uid !== p.uid))}>@{p.username} ✕</i>
          ))}
        </div>
      )}
      <div className="at-input msg-search">
        <span>@</span>
        <input value={q} placeholder="Add people by username" autoCapitalize="none" onChange={(e) => setQ(e.target.value.toLowerCase())} />
      </div>
      {results.length > 0 && (
        <div className="list-card">
          {results.filter((p) => !picked.some((x) => x.uid === p.uid)).map((p) => (
            <button key={p.uid} className="convo" onClick={() => { setPicked([...picked, p]); setQ(''); }}>
              <Face uid={p.uid} username={p.username} look={p.look} />
              <span className="convo-body"><b>@{p.username}</b></span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="auth-msg">{error}</p>}
      <button className="btn go wide" disabled={busy || name.trim().length < 2 || !picked.length} onClick={create}>
        Create group ({picked.length + 1})
      </button>
    </>
  );
}

/** Clock time for today's messages, with the date in front for older ones. */
function clock(at: number) {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

export function GroupThread({ id, onBack }: { id: number; onBack: () => void }) {
  const messages = useGroups((s) => s.threads[id]);
  const detail = useGroups((s) => s.details[id]);
  const myUid = useSession((s) => s.user?.uid);
  const myName = detail?.members.find((m) => m.uid === myUid)?.username;
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [more, setMore] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  const lastId = messages?.at(-1)?.id ?? 0;

  useEffect(() => {
    const load = () => loadGroup(id).catch((e) => setError(e.message));
    void load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [id]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lastId]);

  const mentionQ = /(?:^|\s)@([a-z0-9_]*)$/i.exec(text)?.[1]?.toLowerCase();
  const suggestions =
    mentionQ === undefined
      ? []
      : (detail?.members ?? [])
          .filter((m) => m.uid !== myUid && m.username && m.username.toLowerCase().startsWith(mentionQ))
          .slice(0, 5);
  const pickMention = (name: string) => setText(text.replace(/@[a-z0-9_]*$/i, `@${name} `));

  // A reaction goes at once, quoting the message you are replying to if there is one. What you were typing stays.
  const reactions = useReactions((char) => {
    const quoted = replyTo;
    setReplyTo(null);
    sendGroupText(id, quoted ? quoteOf(quoted, myUid) + char : char).then(() => setError(null), (err) => setError((err as Error).message));
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const quoted = replyTo;
    setText('');
    setReplyTo(null);
    try {
      await sendGroupText(id, quoted ? quoteOf(quoted, myUid) + t : t);
      setError(null);
    } catch (err) {
      setText(t);
      setReplyTo(quoted);
      setError((err as Error).message);
    }
  };

  return (
    <div className="thread">
      <div className="thread-head">
        <button className="msg-back" onClick={onBack}>‹</button>
        <span className="convo-avatar"><Emoji char={detail?.official ? '🏛️' : '👥'} size={18} /></span>
        <b style={{ flex: 1 }}>{detail?.name ?? '…'}</b>
        <button className="thread-action-pill" onClick={() => setInfo(!info)}>{detail?.members.length ?? ''} <Emoji char="👤" size={14} /></button>
      </div>
      {info && detail && <GroupInfo id={id} owner={detail.owner_uid === myUid} onLeft={onBack} />}
      <div className="thread-list">
        {messages && messages.length >= 50 && more && (
          <button className="ghost-btn" onClick={() => loadOlderGroupMessages(id).then((n) => n < 50 && setMore(false)).catch(() => setMore(false))}>
            Older messages
          </button>
        )}
        {messages?.map((m) => m.system ? (
          <p key={m.id} className="group-note"><MentionText text={m.text} me={myName} /></p>
        ) : (
          <div key={m.id} className={`group-msg ${m.from === myUid ? 'mine' : ''}`}>
            {m.from !== myUid && <small><PlayerName uid={m.from} username={m.username} /></small>}
            <span className="group-bub" role="button" tabIndex={0} title="Tap to reply" onClick={() => !window.getSelection()?.toString() && setReplyTo(m)}
              onKeyDown={(e) => e.key === 'Enter' && setReplyTo(m)}><MessageText text={m.text} me={myName} /></span>
            <time className="group-time" dateTime={new Date(m.at).toISOString()}>{clock(m.at)}</time>
          </div>
        ))}
        {messages && messages.length === 0 && <p className="muted small center">Say hi to the group <Emoji char="👋🏾" size={16} /></p>}
        <div ref={end} />
      </div>
      {error && <p className="auth-msg">{error}</p>}
      <form className="composer-wrap" onSubmit={submit}>
        {suggestions.length > 0 && (
          <div className="mention-list">
            {suggestions.map((m) => (
              <button key={m.uid} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(m.username!)}>
                <Face uid={m.uid} username={m.username} look={m.look} />@{m.username}
              </button>
            ))}
          </div>
        )}
        {replyTo && (
          <div className="reply-bar">
            <span>Replying to <b>{replyTo.from === myUid ? 'yourself' : `@${replyTo.username ?? 'player'}`}</b>: {replyTo.text.startsWith(QUOTE) ? replyTo.text.slice(replyTo.text.indexOf('\n') + 1) : replyTo.text}</span>
            <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        {reactions.open && <ReactionTray onPick={reactions.pick} />}
        <div className="composer">
          <ReactionToggle open={reactions.open} onToggle={reactions.toggle} />
          <input value={text} maxLength={replyTo ? 400 : 500} placeholder="Message the group · @ to mention" onChange={(e) => setText(e.target.value)} />
          <button className="btn sm go" disabled={!text.trim()}>Send</button>
        </div>
      </form>
    </div>
  );
}

function GroupInfo({ id, owner, onLeft }: { id: number; owner: boolean; onLeft: () => void }) {
  const detail = useGroups((s) => s.details[id]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlayerRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const term = q.trim().replace(/^@/, '');
    if (!owner || !term) return setResults([]);
    const t = setTimeout(() => searchPlayers(term).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [q, owner]);
  return (
    <div className="list-card group-info">
      {detail?.members.map((m) => (
        <div key={m.uid} className="convo">
          <Face uid={m.uid} username={m.username} look={m.look} />
          <span className="convo-body"><b><PlayerName uid={m.uid} username={m.username} /></b>{m.office ? <small>{m.office}</small> : m.uid === detail.owner_uid && <small>owner</small>}</span>
        </div>
      ))}
      {owner && (
        <div className="at-input msg-search">
          <span>＋</span>
          <input value={q} placeholder="Add by username" autoCapitalize="none" onChange={(e) => setQ(e.target.value.toLowerCase())} />
        </div>
      )}
      {results.filter((p) => !detail?.members.some((m) => m.uid === p.uid)).map((p) => (
        <button key={p.uid} className="convo" onClick={() => addGroupMember(id, p.uid).then(() => setQ('')).catch((e) => setError(e.message))}>
          <Face uid={p.uid} username={p.username} look={p.look} />
          <span className="convo-body"><b>@{p.username}</b><small>Tap to add</small></span>
        </button>
      ))}
      {error && <p className="auth-msg">{error}</p>}
      {detail?.official ? (
        <p className="muted small center">Only office holders are here. Win an office and you are added; leave office and you are out.</p>
      ) : (
        <button className="btn sm" onClick={() => window.confirm('Leave this group?') && leaveGroup(id).then(onLeft).catch((e) => setError(e.message))}>
          Leave group
        </button>
      )}
    </div>
  );
}
