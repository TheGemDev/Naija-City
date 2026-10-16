import { useEffect, useRef, useState, type FormEvent } from 'react';
import { naira, useGame } from '../game/store';
import { useSession } from '../net/session';
import {
  declineRequest,
  declineHomeInvite,
  acceptHomeInvite,
  answerVisitRequest,
  enterAcceptedVisit,
  requestHomeVisit,
  sendHomeInvite,
  deleteMessage,
  reactMessage,
  loadInbox,
  loadThread,
  requestMoney,
  searchPlayers,
  sendMoney,
  sendText,
  useSocial,
  type Message,
  type PlayerRef,
  lastOnline,
} from '../net/social';
import { askOut, loadLove, loveAction, useHangouts } from '../net/hangout';
import { loadGroups, useGroups } from '../net/groups';
import { GroupThread, NewGroup } from './GroupChat';
import { inviteSpot, useVisit } from '../game/visits';
import { planVisit } from './visitTrip';
import { REGION_BY_ID } from '../game/property';
import { placeToShare, sharedPlace, type SharedPlace } from '../game/placeShare';
import { cityMap } from '../game/city';
import { regionOf } from '../game/regions';
import { roomParent } from '../game/villa';
import { copyAndShare, followDeepLink, inviteLink, placeLink, shopIdOf, shopLink } from '../net/deeplink';
import { loadCareer, useCareer, type BizInfo } from '../net/career';
import type { SharedShop } from '../net/market';
import { FriendsTab } from './Community';
import { LootCases } from './LootCases';
import { Emoji } from './Icons';
import { ReactionOr, ReactionToggle, ReactionTray, useReactions } from './Reactions';
import { REACTIONS } from '../game/reactions';
import { useNet } from '../net/multiplayer';
import { PlayerLabel, PlayerName } from './PlayerName';
import { Face } from './Face';
import './chat-money.css';

/** Where an invited house is, for the card: its estate and state. */
const spotName = (spot: { city: string; region: string | null }) => {
  const city = regionOf(spot.city).name;
  const estate = spot.region ? REGION_BY_ID[spot.region]?.name : null;
  return estate ? `${estate}, ${city}` : city;
};

type InboxTab = 'chats' | 'friends' | 'groups';

/** Phone app: chat with other players, send money and ask for money. */
export function Messages() {
  const user = useSession((s) => s.user);
  const openWith = useSocial((s) => s.openWith);
  const [view, setView] = useState<string | 'new' | null>(null);
  const [tab, setTab] = useState<InboxTab>('chats');
  const groupUnread = useGroups((s) => s.list.reduce((n, g) => n + g.unread, 0));

  // Opened from a name tag or the bank app.
  useEffect(() => {
    if (openWith) {
      setView(openWith);
      useSocial.setState({ openWith: null });
    }
  }, [openWith]);

  if (!user?.username) {
    return (
      <div className="msg-empty">
        <span><Emoji char="💬" size={40} /></span>
        <b>Sign in to chat</b>
        <p className="muted small">Sign in to message and send money.</p>
        {!user && (
          <button className="btn" onClick={() => useSession.setState({ status: 'signedOut' })}>
            Sign in
          </button>
        )}
      </div>
    );
  }
  if (view === 'new') return <NewChat onPick={setView} onBack={() => setView(null)} />;
  if (view === 'newgroup') return <NewGroup onDone={(id) => setView(`g:${id}`)} onBack={() => setView(null)} />;
  if (view?.startsWith('g:')) return <GroupThread id={Number(view.slice(2))} onBack={() => setView(null)} />;
  if (view) return <Thread uid={view} onBack={() => setView(null)} />;
  return (
    <>
      <div className="tabs">
        <button className={tab === 'chats' ? 'on' : ''} onClick={() => setTab('chats')}><Emoji char="💬" size={16} /> Chats</button>
        <button className={tab === 'groups' ? 'on' : ''} onClick={() => setTab('groups')}><Emoji char="👥" size={16} /> Groups{groupUnread > 0 && <i className="unread" style={{ display: 'inline-grid', marginLeft: 5, verticalAlign: 'middle' }}>{groupUnread}</i>}</button>
        <button className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}><Emoji char="🤝" size={16} /> Friends</button>
      </div>
      {tab === 'friends' ? <FriendsTab /> : tab === 'groups' ? <GroupsTab onOpen={setView} /> : <Inbox me={user.username} onOpen={setView} />}
    </>
  );
}

function timeAgo(at: number) {
  const s = (Date.now() - at) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function preview(m: Message, mine: boolean) {
  if (m.kind === 'pay') return `${mine ? 'You sent' : 'Sent you'} ${naira(m.amount!)}`;
  if (m.kind === 'request') return `${mine ? 'You asked for' : 'Asked you for'} ${naira(m.amount!)}`;
  if (m.kind === 'invite') return mine ? 'You invited them over' : 'Invited you over';
  if (m.kind === 'visit') return mine ? 'You asked to visit' : 'Asked to visit you';
  if (m.kind === 'love') return m.text === 'marry' ? (mine ? 'You proposed 💍' : 'Proposed to you 💍') : (mine ? 'You asked them out 💌' : 'Asked you out 💌');
  const shared = sharedPlace(m.text);
  if (shared) return `${mine ? 'You shared' : 'Shared'} 📍 ${shared.place.name}`;
  if (shopIdOf(m.text)) return `${mine ? 'You shared' : 'Shared'} 🏪 a business`;
  return (mine ? 'You: ' : '') + m.text;
}

/** Out to the map with the shared place picked, so you choose how to get there. */
/** Shops already looked up for chat cards, so a thread doesn't ask again for each render. */
const shopCache = new Map<number, Promise<SharedShop | null>>();
const lookUpShop = (id: number) => {
  let found = shopCache.get(id);
  if (!found) {
    found = fetch(`/api/shop/${id}`).then((r) => (r.ok ? (r.json() as Promise<SharedShop>) : null)).catch(() => null);
    shopCache.set(id, found);
  }
  return found;
};

/** A business someone shared in the chat: its badge and name, and a button that opens its shelf. */
function ShopCard({ id, mine, who, at }: { id: number; mine: boolean; who: string; at: number }) {
  const [shop, setShop] = useState<SharedShop | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void lookUpShop(id).then((s) => live && setShop(s));
    return () => { live = false; };
  }, [id]);
  return (
    <div className={`bub-wrap ${mine ? 'mine' : ''}`}>
      <div className={`money-card ${mine ? 'mine' : ''} invite-card place-card`} onClick={() => void followDeepLink({ kind: 'shop', id })}>
        <small><Emoji char="🏪" size={14} /> {mine ? `You shared a business with @${who}` : `@${who} shared a business`}</small>
        {shop === undefined && <p className="muted">Loading…</p>}
        {shop === null && <p className="muted">This shop is gone.</p>}
        {shop && (
          <>
            <p><Emoji char={shop.icon} size={18} /> <b>{shop.name}</b></p>
            <small>{shop.where}{shop.owner ? ` · @${shop.owner}` : ''}{shop.open ? ' · Open' : ''}</small>
          </>
        )}
        <div className="row-btns">
          <button className="btn sm go">See the shop</button>
        </div>
        <small>{timeAgo(at)}</small>
      </div>
    </div>
  );
}

function goToShared({ city, place }: SharedPlace) {
  const g = useGame.getState();
  if (g.view === 'place' && cityMap(g.destinationId).id === city && roomParent(g.insideId) === place.id) return g.toast(`${place.icon} You are already at ${place.name}`);
  void followDeepLink({ kind: 'place', placeId: place.id, city });
}

function Inbox({ me, onOpen }: { me: string; onOpen: (uid: string) => void }) {
  const conversations = useSocial((s) => s.conversations);
  const myUid = useSession((s) => s.user?.uid);
  const online = useNet((s) => s.players);
  useEffect(() => {
    // Groups load here too, so the Groups tab can show what is unread.
    const load = () => {
      loadInbox().catch(() => {});
      loadGroups().catch(() => {});
    };
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <div className="msg-me">
        <span>
          You are <b>@{me}</b>
        </span>
        <button className="btn sm go" onClick={() => onOpen('new')}>
          <Emoji char="✏️" size={14} /> New
        </button>
      </div>
      {conversations.length === 0 ? (
        <div className="msg-empty">
          <span><Emoji char="👋🏾" size={40} /></span>
          <b>No messages yet</b>
          <p className="muted small">Search an @username to chat or send money.</p>
        </div>
      ) : (
        <div className="list-card">
          {conversations.map((c) => (
            <button key={c.uid} className="convo" onClick={() => onOpen(c.uid)}>
              <Face uid={c.uid} username={c.username} look={c.look} />
              <span className="convo-body">
                <b><PlayerLabel uid={c.uid} username={c.username} />{online[c.uid] && <span className="online-label"> · Online</span>}</b>
                {!online[c.uid] && !!lastOnline(c.lastSeen) && <small className="last-online">{lastOnline(c.lastSeen)}</small>}
                <small>{preview(c.last, c.last.from === myUid)}</small>
              </span>
              <span className="convo-meta">
                <small>{timeAgo(c.last.at)}</small>
                {c.unread > 0 && <i className="unread">{c.unread}</i>}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Your group chats, and the way to start a new one. */
function GroupsTab({ onOpen }: { onOpen: (view: string) => void }) {
  const groups = useGroups((s) => s.list);
  const myUid = useSession((s) => s.user?.uid);
  useEffect(() => {
    const load = () => loadGroups().catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <div className="msg-me">
        <span>Chat with many people at once</span>
        <button className="btn sm go" onClick={() => onOpen('newgroup')}>
          <Emoji char="👥" size={14} /> New group
        </button>
      </div>
      {groups.length === 0 ? (
        <div className="msg-empty">
          <span><Emoji char="👥" size={40} /></span>
          <b>No groups yet</b>
          <p className="muted small">Start one and add your people.</p>
        </div>
      ) : (
        <div className="list-card">
          {groups.map((g) => (
            <button key={g.id} className="convo" onClick={() => onOpen(`g:${g.id}`)}>
              <span className="convo-avatar"><Emoji char={g.official ? '🏛️' : '👥'} size={22} /></span>
              <span className="convo-body">
                <b>{g.name}</b>
                <small>{!g.last ? `${g.members} members` : g.last.system ? g.last.text : `${g.last.from === myUid ? 'You' : `@${g.last.username ?? 'player'}`}: ${g.last.text}`}</small>
              </span>
              <span className="convo-meta">
                {g.last && <small>{timeAgo(g.last.at)}</small>}
                {g.unread > 0 && <i className="unread">{g.unread}</i>}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function NewChat({ onPick, onBack }: { onPick: (uid: string) => void; onBack: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlayerRef[]>([]);
  useEffect(() => {
    const term = q.trim().replace(/^@/, '');
    if (!term) return setResults([]);
    const id = setTimeout(() => searchPlayers(term).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(id);
  }, [q]);
  return (
    <>
      <button className="msg-back" onClick={onBack}>
        ‹ Messages
      </button>
      <div className="at-input msg-search">
        <span>@</span>
        <input autoFocus value={q} placeholder="Search username" autoCapitalize="none" onChange={(e) => setQ(e.target.value.toLowerCase())} />
      </div>
      {results.length > 0 && (
        <div className="list-card">
          {results.map((p) => (
            <button key={p.uid} className="convo" onClick={() => onPick(p.uid)}>
              <Face uid={p.uid} username={p.username} look={p.look} />
              <span className="convo-body">
                <b>@{p.username}</b>
                {p.name && <small>{p.name}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
      {q.trim() && results.length === 0 && <p className="muted small">No player with that username.</p>}
    </>
  );
}

function Thread({ uid, onBack }: { uid: string; onBack: () => void }) {
  const messages = useSocial((s) => s.threads[uid]);
  const player = useSocial((s) => s.players[uid]);
  const myUid = useSession((s) => s.user?.uid);
  const me = useSession((s) => s.user?.username);
  const online = useNet((s) => s.players);
  const [text, setText] = useState('');
  const [money, setMoney] = useState<null | 'pay' | 'request'>(null);
  // Invite them to my house, or ask to visit theirs: one sheet, like the money one.
  const [house, setHouse] = useState<null | 'invite' | 'visit'>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const lover = useHangouts((s) => s.lovers.find((l) => l.uid === uid));
  const [loveBusy, setLoveBusy] = useState(false);
  useEffect(() => {
    void loadLove();
  }, [uid]);

  // Highest incoming message id the server has marked read.
  const seen = useRef(0);
  const lastIncoming = messages?.filter((m) => m.from === uid).at(-1)?.id ?? 0;
  const load = () =>
    loadThread(uid)
      .then(() => (seen.current = useSocial.getState().threads[uid]?.filter((m) => m.from === uid).at(-1)?.id ?? 0))
      .catch((e) => setError(e.message));

  useEffect(() => {
    useSocial.setState({ openWith: null });
    seen.current = Infinity; // wait for the first load
    load();
  }, [uid]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);
  // A message arrived while the thread is open: reload so it is marked read.
  useEffect(() => {
    if (lastIncoming > seen.current) load();
  }, [lastIncoming]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const refId = replyTo?.id ?? null;
    setText('');
    setReplyTo(null);
    try {
      await sendText(uid, t, refId);
      setError(null);
    } catch (err) {
      setText(t);
      setError((err as Error).message);
    }
  };

  const houseAction = async (fn: () => Promise<void>) => {
    try {
      await fn();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // A reaction goes at once, as an answer to the message you are replying to if there is one. What you were typing stays.
  const reactions = useReactions((char) => {
    const refId = replyTo?.id ?? null;
    setReplyTo(null);
    void houseAction(() => sendText(uid, char, refId));
  });

  // Sends where you are as a card they can tap to come and meet you.
  // ...or one of your businesses, as a card that opens its shelf.
  const businesses = useCareer((s) => s.businesses);
  const [pickBiz, setPickBiz] = useState(false);
  const shareBusiness = async () => {
    if (!useCareer.getState().loaded) await loadCareer();
    const mine = useCareer.getState().businesses.filter((b) => b.hasStall);
    if (!mine.length) throw new Error('You have no business to share yet. Open one in the Business app.');
    if (mine.length === 1) return sendBusiness(mine[0]);
    setPickBiz(true);
  };
  const sendBusiness = async (b: BizInfo) => {
    setPickBiz(false);
    await sendText(uid, shopLink(b.id));
  };
  const shareLocation = async () => {
    const here = placeToShare();
    if (!here) throw new Error('Step out to a place in town to share it. At home, 🏠 Invite brings them to you.');
    await sendText(uid, placeLink(here.place.id, here.city));
  };

  const handleReply = (m: Message) => {
    setReplyTo(m);
    setSelectedId(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Tapping the reaction I already gave takes it back.
  const handleReact = (m: Message, emoji: string | null) => {
    setSelectedId(null);
    reactMessage(m, emoji).catch((err) => setError((err as Error).message));
  };

  const handleDelete = async (m: Message) => {
    setDeletingId(m.id);
    try {
      await deleteMessage(m.id);
      setSelectedId(null);
      if (replyTo?.id === m.id) setReplyTo(null);
      useGame.getState().toast('🗑️ Message deleted');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="thread">
      <div className="thread-head">
        <button className="msg-back" onClick={onBack}>
          ‹
        </button>
        <Face uid={uid} username={player?.username} look={player?.look} />
        <b>{player ? <PlayerName uid={uid} username={player.username} name={player.name} /> : '@…'}{online[uid] && <span className="online-label"> · Online</span>}{!online[uid] && !!lastOnline(player?.lastSeen) && <small className="last-online"> · {lastOnline(player?.lastSeen)}</small>}</b>
      </div>
      <div className="thread-actions" aria-label="Chat actions">
        <button className="thread-action-pill send" onClick={() => setMoney('pay')}><i><b>₦</b></i> Money</button>
        <LovePill lover={lover} busy={loveBusy} onAct={async (fn) => {
          setLoveBusy(true);
          // The love card is only pushed to the other person, so fetch our own copy.
          try { await fn(); await load(); } finally { setLoveBusy(false); }
        }} username={player?.username} uid={uid} />
        <button className="thread-action-pill invite" onClick={() => setHouse('invite')}><i><Emoji char="🏠" size={15} /></i> House</button>
        <button className="thread-action-pill place" onClick={() => void houseAction(shareLocation)}><i><Emoji char="📍" size={15} /></i> Location</button>
        <button className="thread-action-pill place" onClick={() => void houseAction(shareBusiness)}><i><Emoji char="🏪" size={15} /></i> Business</button>
      </div>
      {pickBiz && (
        <div className="biz-share-pick" role="group" aria-label="Which business">
          {businesses.filter((b) => b.hasStall).map((b) => (
            <button key={b.id} className="btn sm" onClick={() => void houseAction(() => sendBusiness(b))}><Emoji char={b.icon} size={14} /> {b.name}</button>
          ))}
          <button className="ghost-btn" onClick={() => setPickBiz(false)}>Cancel</button>
        </div>
      )}
      <LootCases uid={myUid ?? ''} only={uid} />
      <div
        className="thread-list"
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelectedId(null);
        }}
      >
        {messages?.map((m) => {
          const refMsg = m.ref ? messages.find((x) => x.id === m.ref) : null;
          return (
            <Bubble
              key={m.id}
              m={m}
              mine={m.from === myUid}
              who={player?.username ?? 'player'}
              refMsg={refMsg}
              selected={selectedId === m.id}
              deleting={deletingId === m.id}
              onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
              onReply={handleReply}
              onReact={handleReact}
              onDelete={handleDelete}
              onError={setError}
            />
          );
        })}
        {messages && messages.length === 0 && <p className="muted small center">Say hi to @{player?.username} <Emoji char="👋🏾" size={16} /></p>}
        <div ref={end} />
      </div>
      {error && <p className="auth-msg">{error}</p>}
      {money ? (
        <MoneyForm uid={uid} who={player?.username ?? 'player'} onDone={() => setMoney(null)} />
      ) : house ? (
        <HouseForm
          kind={house}
          who={player?.username ?? 'player'}
          onDone={() => setHouse(null)}
          onSend={async (kind) => {
            if (kind === 'invite') await sendHomeInvite(uid);
            else await requestHomeVisit(uid);
          }}
        />
      ) : (
        <form className="composer-wrap" onSubmit={submit}>
          {replyTo && (
            <div className="composer-reply">
              <div className="composer-reply-body">
                <small>Replying to {replyTo.from === myUid ? 'yourself' : `@${player?.username ?? 'player'}`}</small>
                <p>{replyTo.text || (replyTo.kind === 'pay' ? `Payment ${naira(replyTo.amount!)}` : `Request ${naira(replyTo.amount!)}`)}</p>
              </div>
              <button
                type="button"
                className="composer-reply-x"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
              >
                ✕
              </button>
            </div>
          )}
          {reactions.open && <ReactionTray onPick={reactions.pick} />}
          <div className="composer-line">
          {me && (
            <button
              type="button"
              className="composer-link-pill"
              title="Share your invite link"
              aria-label="Copy and share your game invite link"
              onClick={() => void copyAndShare(inviteLink(me), 'Play Naija City with me', '🔗 Invite link copied')}
            >
              <Emoji char="🎁" size={20} />
            </button>
          )}
          <div className="composer">
            <ReactionToggle open={reactions.open} onToggle={reactions.toggle} />
            <input
              ref={inputRef}
              value={text}
              maxLength={500}
              placeholder={replyTo ? 'Type your reply…' : 'Message'}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn sm go" disabled={!text.trim()}>
              Send
            </button>
          </div>
          </div>
        </form>
      )}
    </div>
  );
}

/** Ask out / answer / status pill for the person you are chatting with. */
function LovePill({ lover, busy, onAct, username, uid }: {
  lover: ReturnType<typeof useHangouts.getState>['lovers'][number] | undefined;
  busy: boolean;
  onAct: (fn: () => Promise<unknown>) => void;
  username: string | null | undefined;
  uid: string;
}) {
  if (!lover) {
    return (
      <button className="thread-action-pill love" disabled={busy || !username} onClick={() => username && onAct(() => askOut(username))}>
        <i><Emoji char="💌" size={15} /></i> Ask out
      </button>
    );
  }
  const asking = lover.status === 'asked_date' || lover.status === 'asked_marry';
  if (asking && !lover.mine) {
    return (
      <button className="thread-action-pill love" disabled={busy} onClick={() => onAct(() => loveAction('accept', uid))}>
        <i><Emoji char={lover.status === 'asked_marry' ? '💍' : '💕'} size={15} /></i> Say yes
      </button>
    );
  }
  const label = asking ? 'Asked' : lover.status === 'married' ? 'Married' : 'Dating';
  const icon = asking ? '💌' : lover.status === 'married' ? '💍' : '💕';
  return <span className="thread-action-pill love"><i><Emoji char={icon} size={15} /></i> {label}</span>;
}

function Bubble({
  m,
  mine,
  who,
  refMsg,
  selected,
  deleting,
  onSelect,
  onReply,
  onReact,
  onDelete,
  onError,
}: {
  m: Message;
  mine: boolean;
  who: string;
  refMsg?: Message | null;
  selected: boolean;
  deleting: boolean;
  onSelect: (id: number) => void;
  onReply: (m: Message) => void;
  onReact: (m: Message, emoji: string | null) => void;
  onDelete: (m: Message) => void;
  onError: (e: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const visiting = useVisit((s) => !!s.current);
  const balance = useGame((s) => s.money);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onError(null);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const actionMenu = selected && (
    <div className="msg-actions">
      <button
        type="button"
        className="msg-act-btn"
        onClick={(e) => {
          e.stopPropagation();
          onReply(m);
        }}
        title="Reply to message"
      >
        ↩ Reply
      </button>
      <button
        type="button"
        className="msg-act-btn danger"
        disabled={deleting}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(m);
        }}
        title="Delete message"
      >
        {deleting ? '…' : <><Emoji char="🗑️" size={14} /> Delete</>}
      </button>
    </div>
  );

  // The reactions sit above a tapped message, reply and delete below it.
  const myReact = (mine ? m.fromReact : m.toReact) ?? null;
  const reactBar = selected && (
    <div className="msg-react-bar" role="group" aria-label="React to message">
      {REACTIONS.map((r) => (
        <button
          key={r.char}
          type="button"
          className={myReact === r.char ? 'on' : ''}
          aria-label={r.label}
          aria-pressed={myReact === r.char}
          title={r.label}
          onClick={(e) => {
            e.stopPropagation();
            onReact(m, myReact === r.char ? null : r.char);
          }}
        >
          <Emoji char={r.char} size={24} />
        </button>
      ))}
    </div>
  );
  // What both sides reacted with, under the bubble: one chip, counted when both picked the same.
  const given = [m.fromReact, m.toReact].filter((r): r is string => !!r);
  const reacts = given.length > 0 && (
    <button
      type="button"
      className="bub-reacts"
      aria-label={myReact ? 'Take back your reaction' : 'React'}
      onClick={(e) => {
        e.stopPropagation();
        if (myReact) onReact(m, null);
        else onSelect(m.id);
      }}
    >
      {[...new Set(given)].map((r) => <Emoji key={r} char={r} size={15} />)}
      {given.length > 1 && given[0] === given[1] && <small>2</small>}
    </button>
  );

  const quoteBox = refMsg && (
    <div className="bub-quote">
      <small>{refMsg.from === m.from ? (mine ? 'You' : `@${who}`) : (mine ? `@${who}` : 'You')}</small>
      <span>{refMsg.text || (refMsg.kind === 'pay' ? `Payment ${naira(refMsg.amount!)}` : `Request ${naira(refMsg.amount!)}`)}</span>
    </div>
  );

  // A shop link on its own is a shared business.
  const shopId = m.kind === 'text' ? shopIdOf(m.text) : null;
  if (shopId) return <ShopCard id={shopId} mine={mine} who={who} at={m.at} />;

  // A place link on its own is a shared location: a card that opens the place's travel sheet.
  const shared = m.kind === 'text' ? sharedPlace(m.text) : null;
  if (shared) {
    return (
      <div className={`bub-wrap ${mine ? 'mine' : ''}`}>
        <div className={`money-card ${mine ? 'mine' : ''} invite-card place-card`} onClick={() => goToShared(shared)}>
          <small><Emoji char="📍" size={14} /> {mine ? `You shared a location with @${who}` : `@${who} shared a location`}</small>
          <p><Emoji char={shared.place.icon} size={18} /> <b>{shared.place.name}</b></p>
          <small>{shared.place.area} · {regionOf(shared.city).name}</small>
          <div className="row-btns">
            <button className="btn sm go">Go there</button>
          </div>
          <small>{timeAgo(m.at)}</small>
        </div>
      </div>
    );
  }

  if (m.kind === 'text') {
    return (
      <div className={`bub-wrap ${mine ? 'mine' : ''}`}>
        {reactBar}
        <div className={`bub-line ${mine ? 'mine' : ''}`}>
          <div
            className={`bub ${mine ? 'mine' : ''} ${selected ? 'selected' : ''}`}
            onClick={() => onSelect(m.id)}
            title="Click for options"
          >
            {quoteBox}
            <ReactionOr text={m.text}>{m.text}</ReactionOr>
            <small>
              {timeAgo(m.at)}
              {mine && <Ticks seen={!!m.read} />}
            </small>
          </div>
        </div>
        {reacts}
        {actionMenu}
      </div>
    );
  }

  if (m.kind === 'invite') {
    const spot = inviteSpot(m.text);
    const actOnInvite = (fn: () => Promise<void>) => act(fn);
    return (
      <div className={`bub-wrap ${mine ? 'mine' : ''}`}>
        <div className={`money-card ${mine ? 'mine' : ''} invite-card`}>
          <small><Emoji char="🏠" size={14} /> {mine ? `House invite to @${who}` : `@${who} invited you home`}</small>
          {spot && <small className="invite-where"><Emoji char="📍" size={12} /> {spotName(spot)}</small>}
          {!mine && m.status === 'open' && (
            <div className="row-btns">
              <button className="btn sm go" disabled={busy || visiting} onClick={() => actOnInvite(async () => {
                // You travel there like anywhere else; the door opens only when you arrive.
                if (spot) {
                  planVisit({ ...spot, owner: who, finish: async () => (await acceptHomeInvite(m.id)).home });
                } else {
                  const { home } = await acceptHomeInvite(m.id);
                  planVisit({ city: home.city ?? 'kaduna', region: home.region ?? null, slot: home.slot ?? null, owner: who, finish: async () => home });
                }
              })}>{visiting ? 'Already visiting' : 'Go there'}</button>
              <button className="btn sm" disabled={busy} onClick={() => actOnInvite(async () => { await declineHomeInvite(m.id); })}>Decline</button>
            </div>
          )}
          {m.status && m.status !== 'open' && <span className="money-status">{m.status === 'accepted' ? 'Accepted' : 'Declined'}</span>}
          <small>{timeAgo(m.at)}</small>
        </div>
        {actionMenu}
      </div>
    );
  }

  if (m.kind === 'visit') {
    return (
      <div className={`bub-wrap ${mine ? 'mine' : ''}`}>
        <div className={`money-card ${mine ? 'mine' : ''} invite-card`}>
          <small><Emoji char="🚪" size={14} /> {mine ? `You asked to visit @${who}` : `@${who} wants to visit your house`}</small>
          {!mine && m.status === 'open' && (
            <div className="row-btns">
              <button className="btn sm go" disabled={busy} onClick={() => act(() => answerVisitRequest(m.id, true))}>Let them in</button>
              <button className="btn sm" disabled={busy} onClick={() => act(() => answerVisitRequest(m.id, false))}>Decline</button>
            </div>
          )}
          {mine && m.status === 'accepted' && (
            <div className="row-btns">
              <button className="btn sm go" disabled={busy || visiting} onClick={() => act(async () => {
                const { home } = await enterAcceptedVisit(m.id);
                planVisit({ city: home.city ?? 'kaduna', region: home.region ?? null, slot: home.slot ?? null, owner: who, finish: async () => home });
              })}>{visiting ? 'Already visiting' : 'Go there'}</button>
            </div>
          )}
          {m.status === 'open' && mine && <span className="money-status">Waiting</span>}
          {m.status && m.status !== 'open' && !(mine && m.status === 'accepted') && <span className="money-status">{m.status === 'accepted' ? 'Accepted' : 'Declined'}</span>}
          <small>{timeAgo(m.at)}</small>
        </div>
        {actionMenu}
      </div>
    );
  }

  if (m.kind === 'love') {
    const marry = m.text === 'marry';
    return (
      <div className={`bub-wrap ${mine ? 'mine' : ''}`}>
        <div className={`money-card ${mine ? 'mine' : ''} love-card`}>
          <small><Emoji char={marry ? '💍' : '💌'} size={14} /> {marry ? 'Proposal' : 'Date request'}</small>
          <p>{marry
            ? (mine ? `You asked @${who} to marry you` : `@${who} wants to marry you`)
            : (mine ? `You asked @${who} to be your babe` : `@${who} wants to be your babe`)}</p>
          {!mine && m.status === 'open' && (
            <div className="row-btns">
              <button className="btn sm go" disabled={busy} onClick={() => act(async () => { await loveAction('accept', m.from); })}>Say yes</button>
              <button className="btn sm" disabled={busy} onClick={() => act(async () => { await loveAction('end', m.from); })}>Decline</button>
            </div>
          )}
          {m.status === 'open' && mine && <span className="money-status">Waiting</span>}
          {m.status && m.status !== 'open' && <span className="money-status">{m.status === 'accepted' ? (marry ? 'Married 💍' : 'Dating 💕') : 'Declined'}</span>}
          <small>{timeAgo(m.at)}</small>
        </div>
        {actionMenu}
      </div>
    );
  }

  const pay = m.kind === 'pay';
  const amount = m.amount!;
  // Bail and ransom pleas are ordinary requests; the emoji their note starts with (Police.tsx, Vice.tsx) marks them.
  const plea = pay ? null : m.text.startsWith('🚔') ? 'bail' : m.text.startsWith('🪢') ? 'ransom' : null;
  const title = pay
    ? mine ? `You sent @${who}` : `@${who} sent you`
    : plea
      ? mine ? `${plea === 'bail' ? 'Bail' : 'Ransom'} ask to @${who}` : `@${who} needs ${plea}`
      : mine ? `You asked @${who}` : `@${who} asked you`;
  const noteText = plea ? m.text.replace(/^(🚔|🪢)\s*/u, '') : m.text;
  const [status, tone] = pay
    ? m.status === 'claimed'
      ? ['Received', 'ok']
      : ['On the way', 'wait']
    : m.status === 'paid'
      ? ['Paid', 'ok']
      : m.status === 'declined'
        ? ['Declined', 'bad']
        : [mine ? 'Waiting' : 'Unpaid', 'wait'];
  const canAnswer = !pay && !mine && m.status === 'open';
  const short = canAnswer ? Math.max(0, amount - balance) : 0;
  return (
    <div className={`bub-wrap ${mine ? 'mine' : ''}`}>
      <div
        className={`pay-card ${pay ? 'pay' : 'req'} ${plea && m.status === 'open' ? 'urgent' : ''} ${m.status === 'declined' ? 'declined' : ''} ${selected ? 'selected' : ''}`}
        onClick={() => onSelect(m.id)}
        title="Click for options"
      >
        {quoteBox}
        <div className="pay-card-head">
          <span className="pay-card-icon" aria-hidden>{pay ? (mine ? '↗' : '↙') : plea === 'bail' ? <Emoji char="🚔" size={16} /> : plea === 'ransom' ? <Emoji char="🪢" size={16} /> : '₦'}</span>
          <span className="pay-card-title">{title}</span>
          <span className={`pay-chip ${tone}`}>{status}</span>
        </div>
        <strong className="pay-card-amount">{naira(amount)}</strong>
        {noteText && <p className="pay-card-note">{noteText}</p>}
        {canAnswer && (
          <div className="pay-card-actions">
            <button className="btn go" disabled={busy || short > 0} onClick={(e) => { e.stopPropagation(); act(() => sendMoney(m.from, amount, m.text, m.id)); }}>
              {busy ? '…' : `${plea ? 'Send' : 'Pay'} ${naira(amount)}`}
            </button>
            <button className="btn ghost" disabled={busy} onClick={(e) => { e.stopPropagation(); act(() => declineRequest(m.id)); }}>
              Decline
            </button>
          </div>
        )}
        <div className="pay-card-foot">
          {short > 0 ? <span className="pay-card-hint">You need {naira(short)} more</span> : <span />}
          <small>{timeAgo(m.at)}</small>
        </div>
      </div>
      {actionMenu}
    </div>
  );
}

/** One sheet for both house moves: ask them over to yours, or ask to go to theirs. */
function HouseForm({ kind: initialKind, who, onDone, onSend }: { kind: 'invite' | 'visit'; who: string; onDone: () => void; onSend: (kind: 'invite' | 'visit') => Promise<void> }) {
  const [kind, setKind] = useState(initialKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSend(kind);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <form className={`pay-sheet ${kind === 'invite' ? 'pay' : 'request'}`} onSubmit={submit}>
      <div className="pay-sheet-head">
        <div className="pay-seg">
          <button type="button" className={kind === 'invite' ? 'on' : ''} onClick={() => setKind('invite')}>🏠 Invite</button>
          <button type="button" className={kind === 'visit' ? 'on' : ''} onClick={() => setKind('visit')}>🚪 Visit</button>
        </div>
        <button type="button" className="pay-sheet-x" onClick={onDone} aria-label="Cancel">✕</button>
      </div>
      <p className="muted small">{kind === 'invite' ? `Invite @${who} to your house. They travel there to come in.` : `Ask to visit @${who}’s house. They can let you in or decline.`}</p>
      {error && <p className="auth-msg">{error}</p>}
      <button className="btn go pay-submit" disabled={busy}>{busy ? '…' : kind === 'invite' ? `Invite @${who}` : `Ask to visit @${who}`}</button>
    </form>
  );
}

function MoneyForm({ uid, who, onDone }: { uid: string; who: string; onDone: () => void }) {
  const money = useGame((s) => s.money);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = Math.floor(Number(amount.replace(/[^\d]/g, '')) || 0);
  const tooMuch = n > money;

  const go = async (kind: 'pay' | 'request') => {
    if (n < 1 || (kind === 'pay' && tooMuch)) return;
    setBusy(true);
    try {
      if (kind === 'pay') await sendMoney(uid, n, note.trim());
      else await requestMoney(uid, n, note.trim());
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const shown = n ? n.toLocaleString() : '';
  return (
    <form className={`pay-sheet ${tooMuch ? 'over' : ''}`} onSubmit={(e: FormEvent) => { e.preventDefault(); void go('pay'); }}>
      <div className="pay-sheet-head">
        <label className="pay-amount">
          <small>@{who}</small>
          <div className="pay-amount-row">
            <span>₦</span>
            <input
              autoFocus
              inputMode="numeric"
              placeholder="0"
              size={Math.max(1, shown.length)}
              value={shown}
              onChange={(e) => (setAmount(e.target.value), setError(null))}
            />
          </div>
        </label>
        <button type="button" className="pay-sheet-x" onClick={onDone} aria-label="Cancel">
          ✕
        </button>
      </div>
      <input className="note-input" value={note} maxLength={140} placeholder="Note (optional)" onChange={(e) => setNote(e.target.value)} />
      {(error || (tooMuch && n > 0)) && <p className="auth-msg">{error ?? `You are ${naira(n - money)} short to send this`}</p>}
      <div className="pay-actions">
        <button type="button" className="btn go pay-submit" disabled={busy || n < 1 || tooMuch} onClick={() => void go('pay')}>↗ Send</button>
        <button type="button" className="btn pay-submit request" disabled={busy || n < 1} onClick={() => void go('request')}>↙ Request</button>
      </div>
    </form>
  );
}

/** Delivery marks on your own messages: one tick when sent, two blue ones once they have seen it. */
function Ticks({ seen }: { seen: boolean }) {
  return (
    <svg className={`bub-ticks ${seen ? 'seen' : ''}`} viewBox="0 0 18 11" width="16" height="10" role="img" aria-label={seen ? 'Seen' : 'Sent'}>
      <title>{seen ? 'Seen' : 'Sent'}</title>
      <path d="M1 5.8 4.6 9.4 11.6 1.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      {seen && <path d="M7.2 8.2 7.8 9 16.6 1.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
