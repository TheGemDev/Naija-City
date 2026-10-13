// The Games phone app: sit at a table and play other players at street games, for naira or for nothing.
// Lobby (your tables, open tables, start a game, champions) and the table screen. Boards are in GameBoards.tsx.

import { useEffect, useState, type ReactNode } from 'react';
import { naira, useGame } from '../game/store';
import { GAME_IDS, STAKES, STREET_GAMES, type GameId, type MatchCard, type MatchView } from '../game/streetGames';
import { useSession } from '../net/session';
import { searchPlayers, type PlayerRef } from '../net/social';
import { closeMatch, createTable, joinTable, leaveTable, loadChampions, loadLobby, openMatch, playMove, refreshMatch, startTable, useGames } from '../net/games';
import { AyoBoard, BeltBoard, DiceBoard, TenTenBoard, WhotBoard, seatName, type BoardProps } from './GameBoards';
import { ChessBoard, DraughtsBoard, LudoBoard } from './BoardGames';
import { PoolBoard } from './PoolBoard';
import { DaraBoard, ScrabbleBoard, SnakesBoard } from './MoreBoards';
import { CapsBoard } from './CapsBoard';
import './games.css';
import { Face } from './Face';

const BOARDS: Record<GameId, (p: BoardProps) => ReactNode> = { belt: BeltBoard, tenten: TenTenBoard, dice: DiceBoard, ayo: AyoBoard, whot: WhotBoard, ludo: LudoBoard, chess: ChessBoard, draughts: DraughtsBoard, pool: PoolBoard, dara: DaraBoard, snakes: SnakesBoard, scrabble: ScrabbleBoard, caps: CapsBoard };

const LOBBY_POLL_MS = 6_000;
const TABLE_POLL_MS = 2_500;

const stakeLabel = (stake: number) => (stake ? naira(stake) : 'Free');
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function GameIcon({ game, size = 40 }: { game: GameId; size?: number }) {
  const g = STREET_GAMES[game];
  return (
    <span className="sg-icon" style={{ width: size, height: size, fontSize: size * 0.5, background: `linear-gradient(160deg, ${g.bg[0]}, ${g.bg[1]})` }}>
      {g.icon}
    </span>
  );
}

/* ---------- Lobby ---------- */

function TableRow({ card, myUid }: { card: MatchCard; myUid: string | undefined }) {
  const busy = useGames((s) => s.busy);
  const g = STREET_GAMES[card.game];
  const seated = card.players.some((p) => p.uid === myUid);
  const names = card.players.map((p) => (p.uid === myUid ? 'you' : `@${p.username}`)).join(', ');
  let tag: string;
  if (card.status === 'open') tag = card.invited ? 'Challenged you' : `${card.players.length}/${card.seats} seated`;
  else if (card.status === 'live') tag = card.yourTurn ? 'Your move' : 'Playing';
  else if (card.status === 'void') tag = 'Closed';
  else tag = !myUid || !card.winners.length ? 'Ended' : card.winners.includes(myUid) ? (card.winners.length > 1 ? 'Draw' : 'Won') : 'Lost';
  const hot = card.yourTurn || card.invited || tag === 'Won';
  return (
    <div className="sg-row">
      <GameIcon game={card.game} size={36} />
      <div className="sg-row-main">
        <b>{g.name} · {stakeLabel(card.stake)}</b>
        <small>{names}</small>
      </div>
      <span className={`sg-tag ${hot ? 'hot' : ''} ${tag === 'Lost' ? 'cold' : ''}`}>{tag}</span>
      {seated || card.status !== 'open' ? (
        <button className="btn sm" disabled={busy} onClick={() => void openMatch(card.id)}>{card.status === 'done' || card.status === 'void' ? 'View' : 'Open'}</button>
      ) : (
        <button className="btn sm go" disabled={busy} onClick={() => void joinTable(card.id)}>Join</button>
      )}
    </div>
  );
}

function Setup({ game, onClose }: { game: GameId; onClose: () => void }) {
  const g = STREET_GAMES[game];
  const money = useGame((s) => s.money);
  const busy = useGames((s) => s.busy);
  const [stake, setStake] = useState(STAKES[1]);
  const [seats, setSeats] = useState(g.minSeats);
  const [invite, setInvite] = useState('');
  const challenge = invite.trim().length > 0;
  // Searches as you type, like New chat in Messages: tap a result to pick it.
  const [found, setFound] = useState<PlayerRef[]>([]);
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    const term = invite.trim().replace(/^@/, '');
    if (!term || picked) return setFound([]);
    let live = true;
    const id = setTimeout(() => searchPlayers(term).then((r) => live && setFound(r)).catch(() => live && setFound([])), 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [invite, picked]);
  return (
    <div className="list-card sg-setup">
      <div className="sg-setup-head">
        <GameIcon game={game} />
        <div>
          <b>{g.name}</b>
          <small>{g.minSeats === g.maxSeats ? `${g.minSeats} players` : `${g.minSeats} to ${g.maxSeats} players`}</small>
        </div>
        <button className="btn sm ghost" onClick={onClose}>Close</button>
      </div>
      <ol className="sg-how">
        {g.how.map((line) => <li key={line}>{line}</li>)}
      </ol>
      <div className="sg-setup-body">
        <small className="muted">Everybody drops this much. The winner takes all.</small>
        <div className="sg-chips">
          {STAKES.map((n) => (
            <button key={n} className={stake === n ? 'on' : ''} disabled={n > money} onClick={() => setStake(n)}>{stakeLabel(n)}</button>
          ))}
        </div>
        {g.maxSeats > g.minSeats && !challenge && (
          <>
            <small className="muted">Seats at the table</small>
            <div className="sg-chips">
              {Array.from({ length: g.maxSeats - g.minSeats + 1 }, (_, i) => g.minSeats + i).map((n) => (
                <button key={n} className={seats === n ? 'on' : ''} onClick={() => setSeats(n)}>{n}</button>
              ))}
            </div>
          </>
        )}
        <input className="text-input" value={invite} onChange={(e) => { setPicked(false); setInvite(e.target.value.replace(/\s/g, '')); }} placeholder="Challenge one person: @username (optional)" aria-label="Challenge a username" autoCapitalize="none" autoCorrect="off" />
        {found.length > 0 && (
          <div className="list-card">
            {found.map((p) => (
              <button key={p.uid} className="convo" onClick={() => { setPicked(true); setFound([]); setInvite(`@${p.username ?? ''}`); }}>
                <Face uid={p.uid} username={p.username} look={p.look} />
                <span className="convo-body">
                  <b>@{p.username}</b>
                  {p.name && <small>{p.name}</small>}
                </span>
              </button>
            ))}
          </div>
        )}
        <button className="btn go wide" disabled={busy || stake > money} onClick={() => void createTable(game, stake, seats, invite.trim())}>
          {challenge ? 'Send challenge' : 'Open table'} · {stakeLabel(stake)}
        </button>
        <small className="muted">In-game naira only. If nobody sits down in 10 minutes the table closes and your stake comes back.</small>
      </div>
    </div>
  );
}

function Champions() {
  const board = useGames((s) => s.board);
  const myUid = useSession((s) => s.user?.uid);
  const [game, setGame] = useState<GameId | ''>('');
  useEffect(() => {
    void loadChampions(game);
  }, [game]);
  const ready = board && board.game === game;
  return (
    <>
      <div className="sg-chips">
        <button className={game === '' ? 'on' : ''} onClick={() => setGame('')}>All games</button>
        {GAME_IDS.map((id) => (
          <button key={id} className={game === id ? 'on' : ''} onClick={() => setGame(id)}>{STREET_GAMES[id].icon} {STREET_GAMES[id].name}</button>
        ))}
      </div>
      {!ready && <p className="muted">Counting wins…</p>}
      {ready && board.me && (
        <div className="list-card sg-me">
          <b>You</b>
          <span>{board.me.won} won of {board.me.played}</span>
          <span className={board.me.net < 0 ? 'neg' : 'pos'}>{board.me.net < 0 ? '−' : '+'}{naira(Math.abs(board.me.net))}</span>
        </div>
      )}
      {ready && !board.top.length && <p className="muted">Nobody has won here yet. Be the first name on the board.</p>}
      {ready && board.top.length > 0 && (
        <div className="list-card">
          {board.top.map((c, i) => (
            <div key={c.uid} className={`sg-champ ${c.uid === myUid ? 'mine' : ''}`}>
              <i>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</i>
              <Face uid={c.uid} username={c.username} size="sm" />
              <b>@{c.username}</b>
              <small>{c.won} won · {c.played} played</small>
              <span className={c.net < 0 ? 'neg' : 'pos'}>{c.net < 0 ? '−' : '+'}{naira(Math.abs(c.net))}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Lobby() {
  const lobby = useGames((s) => s.lobby);
  const myUid = useSession((s) => s.user?.uid);
  const [tab, setTab] = useState<'play' | 'champions'>('play');
  const [setup, setSetup] = useState<GameId | null>(null);
  useEffect(() => {
    void loadLobby();
    const t = setInterval(() => void loadLobby(), LOBBY_POLL_MS);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <div className="tabs">
        <button className={tab === 'play' ? 'on' : ''} onClick={() => setTab('play')}>Play</button>
        <button className={tab === 'champions' ? 'on' : ''} onClick={() => setTab('champions')}>Champions</button>
      </div>
      {tab === 'champions' ? <Champions /> : (
        <>
          {!!lobby?.mine.length && (
            <>
              <h4>Your tables</h4>
              <div className="list-card">{lobby.mine.map((c) => <TableRow key={c.id} card={c} myUid={myUid} />)}</div>
            </>
          )}
          <h4>Open tables</h4>
          {!lobby ? <p className="muted">Looking for tables…</p> : lobby.open.length ? (
            <div className="list-card">{lobby.open.map((c) => <TableRow key={c.id} card={c} myUid={myUid} />)}</div>
          ) : (
            <p className="muted">Nobody is waiting right now. Open a table below and people will come.</p>
          )}
          <h4>Start a game</h4>
          {setup ? <Setup key={setup} game={setup} onClose={() => setSetup(null)} /> : (
            <div className="sg-games">
              {GAME_IDS.map((id) => {
                const g = STREET_GAMES[id];
                return (
                  <button key={id} className="sg-game" onClick={() => setSetup(id)}>
                    <GameIcon game={id} />
                    <b>{g.name}</b>
                    <small>{g.blurb}</small>
                  </button>
                );
              })}
            </div>
          )}
          {!!lobby?.recent.length && (
            <>
              <h4>Today</h4>
              <div className="list-card">{lobby.recent.map((c) => <TableRow key={c.id} card={c} myUid={myUid} />)}</div>
            </>
          )}
        </>
      )}
    </>
  );
}

/* ---------- Table ---------- */

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function TurnClock({ m }: { m: MatchView }) {
  const skew = useGames((s) => s.skew);
  const left = m.deadline - (useNow(500) + skew);
  const mine = m.pending.includes(m.you);
  const waiting = m.pending.filter((seat) => seat !== m.you).map((seat) => seatName(m, seat));
  const total = STREET_GAMES[m.game].turnMs;
  return (
    <div className={`sg-clock ${mine ? 'mine' : ''} ${left < 10_000 ? 'low' : ''}`}>
      <span>{mine ? 'Your move' : m.you < 0 ? 'Watching' : `Waiting for ${waiting.join(', ') || 'the table'}`}</span>
      <b>{clock(left)}</b>
      <i style={{ width: `${Math.max(0, Math.min(100, (left / total) * 100))}%` }} />
    </div>
  );
}

function Result({ m }: { m: MatchView }) {
  const myUid = useSession((s) => s.user?.uid);
  const busy = useGames((s) => s.busy);
  const won = !!myUid && m.winners.includes(myUid);
  const draw = m.winners.length > 1;
  const share = m.winners.length ? Math.floor(m.pot / m.winners.length) : 0;
  const names = m.players.filter((p) => m.winners.includes(p.uid)).map((p) => (p.uid === myUid ? 'You' : `@${p.username}`));
  const rival = m.players.length === 2 && m.you >= 0 ? m.players[1 - m.you] : null;
  let icon = '🏁';
  let title: string;
  let sub = '';
  if (m.status === 'void') {
    title = 'Table closed';
    sub = m.stake ? 'Everybody got their stake back.' : '';
  } else if (draw) {
    icon = '🤝';
    title = `Level: ${names.join(' and ')}`;
    sub = m.pot ? `The pot is shared: ${naira(share)} each.` : '';
  } else if (won) {
    icon = '🏆';
    title = m.pot ? `You won ${naira(m.pot)}!` : 'You won!';
    sub = 'Your name is going up on the champions board.';
  } else {
    icon = m.you >= 0 ? '😩' : '🏆';
    title = `${names[0] ?? 'Somebody'} won${m.pot ? ` ${naira(m.pot)}` : ''}`;
    sub = m.you >= 0 && m.stake ? `Your ${naira(m.stake)} is gone. Go again?` : '';
  }
  return (
    <div className={`sg-result ${won && !draw ? 'won' : ''}`}>
      <span>{icon}</span>
      <b>{title}</b>
      {sub && <small>{sub}</small>}
      <div className="row-btns">
        <button className="btn" onClick={closeMatch}>Back to tables</button>
        {rival && m.status === 'done' && (
          <button className="btn go" disabled={busy} onClick={() => void createTable(m.game, m.stake, 2, rival.username)}>Rematch</button>
        )}
      </div>
    </div>
  );
}

function Table({ m }: { m: MatchView }) {
  const busy = useGames((s) => s.busy);
  const skew = useGames((s) => s.skew);
  const now = useNow(1000);
  const [sure, setSure] = useState(false);
  const g = STREET_GAMES[m.game];
  const active = m.status === 'open' || m.status === 'live';
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void refreshMatch(), TABLE_POLL_MS);
    return () => clearInterval(t);
  }, [active, m.id]);
  const Board = BOARDS[m.game];
  const seated = m.you >= 0;
  const hosting = seated && m.players[m.you].username === m.host;
  return (
    <div className="sg-table">
      <div className="sg-table-head">
        <button className="btn sm ghost" onClick={closeMatch}>‹ Tables</button>
        <GameIcon game={m.game} size={28} />
        <b>{g.name}</b>
        <span className="sg-pot">{m.pot ? `Pot ${naira(m.pot)}` : 'Friendly'}</span>
      </div>
      {m.status === 'open' && (
        <div className="list-card sg-wait">
          <b>{m.invited ? `@${m.host} challenges you` : `Waiting for players · ${m.players.length}/${m.seats}`}</b>
          <small className="muted">
            {m.players.map((p, seat) => seatName(m, seat)).join(', ')} at the table. {stakeLabel(m.stake)} each. Closes in {clock(m.deadline - (now + skew))}.
          </small>
          <div className="row-btns">
            {!seated && <button className="btn go" disabled={busy} onClick={() => void joinTable(m.id)}>Sit down · {stakeLabel(m.stake)}</button>}
            {hosting && m.players.length >= g.minSeats && <button className="btn go" disabled={busy} onClick={() => void startTable(m.id)}>Start now</button>}
            {seated && <button className="btn danger" disabled={busy} onClick={() => void leaveTable(m.id)}>{hosting ? 'Close table' : 'Stand up'}</button>}
          </div>
          <ol className="sg-how">
            {g.how.map((line) => <li key={line}>{line}</li>)}
          </ol>
        </div>
      )}
      {m.status === 'live' && <TurnClock m={m} />}
      {!active && <Result m={m} />}
      {m.view && m.status !== 'open' && <Board m={m} busy={busy} play={(move) => void playMove(m.id, move)} />}
      {m.status === 'live' && seated && (
        <button className={`btn sm sg-quit ${sure ? 'danger' : 'ghost'}`} disabled={busy} onClick={() => (sure ? void leaveTable(m.id) : setSure(true))} onBlur={() => setSure(false)}>
          {sure ? (m.stake ? `Sure? You lose your ${naira(m.stake)}` : 'Sure? You lose the game') : 'Give up'}
        </button>
      )}
    </div>
  );
}

export function GamesApp() {
  const signedIn = !!useSession((s) => s.user?.username);
  const match = useGames((s) => s.match);
  if (!signedIn) return <p className="muted">Sign in and pick a username to play other people.</p>;
  return match ? <Table key={match.id} m={match} /> : <Lobby />;
}
