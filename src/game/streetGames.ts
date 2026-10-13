// Street Games: the phone app where players sit at a table and play each other for naira.
// This file is the shared part: the game list, the limits, and what a player is allowed to see of a match.
// The rules themselves run on the server (worker/gameRules.ts); routes and money are in worker/games.ts.

export type GameId = 'belt' | 'tenten' | 'dice' | 'ayo' | 'whot' | 'ludo' | 'chess' | 'draughts' | 'pool' | 'dara' | 'snakes' | 'scrabble' | 'caps';

export interface StreetGame {
  id: GameId;
  name: string;
  icon: string;
  /** One line on the game card. */
  blurb: string;
  /** How to play, shown before you sit down. */
  how: string[];
  minSeats: number;
  maxSeats: number;
  /** How long a player has to move before they forfeit. */
  turnMs: number;
  bg: [string, string];
}

export const STREET_GAMES: Record<GameId, StreetGame> = {
  belt: {
    id: 'belt',
    name: 'Belt',
    icon: '🪢',
    blurb: 'Motor park classic. Fold the belt, hide the true loop. Will the stick catch?',
    how: [
      'The folder coils the belt and secretly chooses which loop is the true one.',
      'The other player pushes a stick into loop A or loop B.',
      'The belt is pulled: if it catches the stick, the picker scores. If it slips free, the folder scores.',
      'You swap roles every round. First to 3 takes the money.',
    ],
    minSeats: 2,
    maxSeats: 2,
    turnMs: 40_000,
    bg: ['#fbbf24', '#92400e'],
  },
  tenten: {
    id: 'tenten',
    name: 'Ten-Ten',
    icon: '🦵🏾',
    blurb: 'Clap, clap, kick! One of you needs the legs to match, the other needs them to cross.',
    how: [
      'Both players choose a leg at the same time: left or right.',
      'The MATCH player scores when both kick the same leg. The CROSS player scores when they differ.',
      'First to 5 wins.',
    ],
    minSeats: 2,
    maxSeats: 2,
    turnMs: 30_000,
    bg: ['#f9a8d4', '#be185d'],
  },
  dice: {
    id: 'dice',
    name: 'Street Dice',
    icon: '🎲',
    blurb: 'Everybody drops money, everybody shakes. Highest roll carries the whole pot.',
    how: [
      'Up to 6 players. Everyone shakes two dice.',
      'The highest total takes the pot.',
      'If the top players tie, only they shake again until one person wins.',
    ],
    minSeats: 2,
    maxSeats: 6,
    turnMs: 30_000,
    bg: ['#f87171', '#7f1d1d'],
  },
  ayo: {
    id: 'ayo',
    name: 'Ayo (Awale)',
    icon: '🥜',
    blurb: 'The seed game from under the mango tree: Ayo, Awale, Ncho, Oware. Capture 25 seeds to win.',
    how: [
      'The six pits on your side are yours. Tap one to pick up all its seeds and sow them one by one, anticlockwise.',
      'If your last seed makes an opponent pit hold 2 or 3 seeds, you capture them, and any 2s and 3s directly behind it.',
      'If your opponent has no seeds, you must play a move that gives them some.',
      'First to capture 25 of the 48 seeds wins.',
    ],
    minSeats: 2,
    maxSeats: 2,
    turnMs: 60_000,
    bg: ['#d6a15f', '#713f12'],
  },
  whot: {
    id: 'whot',
    name: 'Whot!',
    icon: '🃏',
    blurb: 'Pick two! Hold on! General market! First person to finish their cards wins.',
    how: [
      'Play a card with the same shape or the same number as the card on the table. No card? Go to market (draw one).',
      '1 Hold on: you play again. 8 Suspension: the next player misses a turn.',
      '2 Pick two and 5 Pick three: the next player draws and misses their turn.',
      '14 General market: everybody else draws one and you play again.',
      '20 Whot: play it on anything and call the shape you want.',
      'First to empty their hand wins the pot.',
    ],
    minSeats: 2,
    maxSeats: 4,
    turnMs: 45_000,
    bg: ['#b91c1c', '#450a0a'],
  },
  ludo: {
    id: 'ludo',
    name: 'Ludo',
    icon: '🎯',
    blurb: 'Roll six to come out, chop their seed back to base, race all four home.',
    how: [
      'Roll two dice. A 6 brings a seed out of your base.',
      'Play each die on its own: both on one seed, or one each on two seeds.',
      'Land on an opponent to send their seed back to base. Seeds on a starred or starting square are safe.',
      'Double six rolls again. You need the exact number to get home; first to bring all four seeds home wins.',
    ],
    minSeats: 2,
    maxSeats: 4,
    turnMs: 30_000,
    bg: ['#60a5fa', '#1e3a8a'],
  },
  chess: {
    id: 'chess',
    name: 'Chess',
    icon: '♟️',
    blurb: 'The full game. Checkmate takes the pot; a draw shares it.',
    how: [
      'Standard chess: castling, en passant and promotion all work.',
      'Tap a piece to see where it can go, then tap the square.',
      'Checkmate wins. Stalemate, three repeats, 50 quiet moves or bare kings is a draw and the pot is shared.',
      'You have 90 seconds for each move.',
    ],
    minSeats: 2,
    maxSeats: 2,
    turnMs: 90_000,
    bg: ['#e2e8f0', '#334155'],
  },
  draughts: {
    id: 'draughts',
    name: 'Draughts',
    icon: '⚫',
    blurb: 'Naija draft (checkers) on the big 10 by 10 board. If you fit chop, you must chop.',
    how: [
      'Seeds move one step forward on the dark squares. They capture by jumping, forwards or backwards.',
      'Capturing is compulsory, and a seed that can keep jumping must finish the whole run.',
      'Reach the far row to crown a king. A king flies any distance along a diagonal.',
      'You win when your opponent has no seeds left or cannot move.',
    ],
    minSeats: 2,
    maxSeats: 2,
    turnMs: 60_000,
    bg: ['#fca5a5', '#1c1917'],
  },
  pool: {
    id: 'pool',
    name: 'Pool',
    icon: '🎱',
    blurb: 'Eight-ball like at the joint. Clear your balls, then sink the black.',
    how: [
      'Drag on the table to aim, set your power and shoot.',
      'The first ball you sink decides it: plain balls or striped ones. Sink one of yours and you shoot again.',
      'Sinking the white, hitting nothing, or hitting their ball first is a foul and the turn passes.',
      'Sink the black after all of yours to win. Sink it early and you lose.',
    ],
    minSeats: 2,
    maxSeats: 2,
    turnMs: 45_000,
    bg: ['#34d399', '#064e3b'],
  },
  dara: {
    id: 'dara',
    name: 'Dara',
    icon: '🪨',
    blurb: 'The Hausa game played in the sand. Line up three stones and chop one of theirs.',
    how: [
      'First you take turns putting your 12 stones on the board. You may not make a line of three yet.',
      'Then you take turns sliding one stone one step, up, down or sideways.',
      'Make a line of exactly three and you remove one of your opponent\'s stones. Lines of four are not allowed.',
      'You win when your opponent has fewer than three stones left, or cannot move.',
    ],
    minSeats: 2,
    maxSeats: 2,
    turnMs: 45_000,
    bg: ['#fde68a', '#b45309'],
  },
  snakes: {
    id: 'snakes',
    name: 'Snakes & Ladders',
    icon: '🐍',
    blurb: 'Pure luck. Climb the ladders, dodge the snakes, first to 100 takes the pot.',
    how: [
      'Roll the die and move. Land at the foot of a ladder and you climb it; land on a snake\'s head and you slide down.',
      'A six gives you another roll.',
      'You need the exact number to land on 100. First there wins.',
    ],
    minSeats: 2,
    maxSeats: 4,
    turnMs: 30_000,
    bg: ['#86efac', '#166534'],
  },
  scrabble: {
    id: 'scrabble',
    name: 'Scrabble',
    icon: '🔠',
    blurb: 'Big grammar pays. Build words on the board; Naija words like JOLLOF and WAHALA count.',
    how: [
      'Tap a tile on your rack, then a square on the board. The first word must cross the star in the middle.',
      'All your tiles go in one row or column and must join the words already there. Every word formed must be real.',
      'Coloured squares double or triple a letter or the whole word. Using all seven tiles earns 50 extra.',
      'No good move? Swap tiles or pass. When the bag and a rack are empty, the highest score wins.',
    ],
    minSeats: 2,
    maxSeats: 4,
    turnMs: 120_000,
    bg: ['#fcd34d', '#92400e'],
  },
  caps: {
    id: 'caps',
    name: 'Cover Soccer',
    icon: '⚽',
    blurb: 'Bottle-cover football on the table. Flick your covers, knock the ball in. First to 3.',
    how: [
      'You each have four bottle covers. On your turn you flick one of them.',
      'Tap one of your covers, drag to aim, set the power and flick.',
      'Knock the ball into the other goal to score. After a goal the side that conceded kicks off.',
      'First to 3 goals wins.',
    ],
    minSeats: 2,
    maxSeats: 2,
    turnMs: 40_000,
    bg: ['#4ade80', '#14532d'],
  },
};

export const GAME_IDS = Object.keys(STREET_GAMES) as GameId[];
export const isGameId = (v: unknown): v is GameId => typeof v === 'string' && v in STREET_GAMES;

/** Stakes offered when opening a table. 0 is a friendly game. */
export const STAKES = [0, 500, 2_000, 10_000, 50_000, 250_000, 1_000_000];
export const MAX_STAKE = 1_000_000;
/** An open table that nobody fills closes after this long and everyone gets their stake back. */
export const OPEN_MS = 10 * 60_000;
/** Tables (open or playing) one player can sit at together. */
export const MAX_TABLES = 3;

export const BELT_TARGET = 3;
export const TENTEN_TARGET = 5;
export const AYO_TARGET = 25;
export const CAPS_TARGET = 3;

export type Side = 'L' | 'R';

/* ---------- What a player sees of each game ---------- */

export interface BeltView {
  score: [number, number];
  /** Seat that folds the belt this round; the other seat picks. */
  folder: number;
  /** The belt is folded and waiting for the picker. */
  folded: boolean;
  /** Only the folder is told which loop is true. */
  hold: Side | null;
  round: number;
  last: { round: number; folder: number; hold: Side; pick: Side; caught: boolean } | null;
}

export interface TenTenView {
  score: [number, number];
  /** Seat 0 needs the legs to match, seat 1 needs them to cross. */
  ready: boolean[];
  mine: Side | null;
  round: number;
  last: { round: number; picks: [Side, Side]; point: number } | null;
}

export interface DiceView {
  alive: boolean[];
  rolls: ([number, number] | null)[];
  round: number;
  /** The round before this one, when it ended in a tie. */
  last: { round: number; rolls: ([number, number] | null)[]; tied: number[] } | null;
}

export interface AyoView {
  /** 12 pits: seat 0 owns 0-5, seat 1 owns 6-11. Seeds are sown towards higher numbers, wrapping round. */
  pits: number[];
  store: [number, number];
  turn: number;
  /** Pits (0-5 on your own side) you may play now. */
  legal: number[];
  last: { seat: number; pit: number; captured: number } | null;
}

export type WhotShape = 'c' | 't' | 'x' | 's' | 'r';
/** A card is its shape letter and number: 'c5', 't14', 'w20' (Whot). */
export type WhotCard = string;

export interface WhotView {
  hand: WhotCard[];
  counts: number[];
  out: boolean[];
  top: WhotCard;
  /** The shape called by whoever played the Whot on top. */
  call: WhotShape | null;
  market: number;
  turn: number;
  last: { seat: number; card?: WhotCard; call?: WhotShape; market?: boolean; picked?: { seats: number[]; n: number }; again?: boolean; skipped?: number } | null;
}

export const WHOT_SHAPES: Record<WhotShape, { name: string; glyph: string }> = {
  c: { name: 'Circle', glyph: '●' },
  t: { name: 'Triangle', glyph: '▲' },
  x: { name: 'Cross', glyph: '✚' },
  s: { name: 'Square', glyph: '■' },
  r: { name: 'Star', glyph: '★' },
};

export const whotShape = (c: WhotCard) => c[0];
export const whotNum = (c: WhotCard) => Number(c.slice(1));
export const isWhot = (c: WhotCard) => c[0] === 'w';

/** Can `card` go on `top`? A Whot goes on anything; on a Whot you must follow the called shape. */
export function whotCanPlay(top: WhotCard, call: WhotShape | null, card: WhotCard) {
  if (isWhot(card)) return true;
  if (isWhot(top)) return whotShape(card) === call;
  return whotShape(card) === whotShape(top) || whotNum(card) === whotNum(top);
}

/** What a special Whot number does, for the card's caption. */
export const WHOT_POWERS: Record<number, string> = { 1: 'Hold on', 2: 'Pick two', 5: 'Pick three', 8: 'Suspension', 14: 'General market', 20: 'Whot' };

export interface LudoView {
  /** Colour of each seat: 0 red, 1 green, 2 yellow, 3 blue (see src/game/ludo.ts). */
  colors: number[];
  /** Every seat's four seeds: -1 in base, 0-50 round the track, 51-55 on the home stretch, 56 home. */
  tok: number[][];
  turn: number;
  /** Dice from the current roll still to be played; empty when the player has to roll. */
  dice: number[];
  /** What you may play now, as [die, seed]. */
  options: [number, number][];
  out: boolean[];
  /** The latest roll and what it did. */
  last: { seat: number; roll: [number, number]; captured: number; home: number } | null;
}

export interface ChessView {
  /** 64 squares from a8 to h1: upper case is white, lower case black, '.' empty. */
  board: string;
  /** Seat playing white. */
  white: number;
  turn: number;
  /** Your moves as "from-to" square numbers, with the new piece's letter on a promotion ("12-4q"). */
  legal: string[];
  last: [number, number] | null;
  check: boolean;
  /** How it ended, once it has. */
  ending: 'checkmate' | 'stalemate' | 'repetition' | 'fifty' | 'material' | null;
}

export interface DraughtsView {
  /** 100 squares, top-left first: 'w'/'b' seeds, 'W'/'B' kings, '.' empty. White starts at the bottom and moves up. */
  board: string;
  white: number;
  turn: number;
  /** Your moves: each is the squares the seed visits, starting with where it stands. */
  legal: number[][];
  /** A capture is open, so you have to take it. */
  mustTake: boolean;
  last: number[] | null;
}

export interface PoolBall {
  /** 0 is the white, 8 the black, 1-7 plain, 9-15 striped. */
  id: number;
  x: number;
  y: number;
}
export type PoolGroup = 'plain' | 'stripe';

export interface PoolView {
  balls: PoolBall[];
  potted: number[];
  turn: number;
  group: (PoolGroup | null)[];
  /** The last shot, so both players can watch it: where the balls were and how the white was hit. */
  shot: { n: number; by: number; from: PoolBall[]; dx: number; dy: number; power: number } | null;
  last: { seat: number; potted: number[]; foul: string | null } | null;
}

export interface DaraView {
  /** 30 holes, 5 rows of 6, top-left first: '0' and '1' are the two seats' stones, '.' is empty. */
  board: string;
  /** Stones each seat still has to put down. */
  hand: [number, number];
  turn: number;
  /** drop: put a stone down. move: slide one. take: you made three, remove one of theirs. */
  phase: 'drop' | 'move' | 'take';
  /** Holes you may tap now (to drop into, or the stones you may remove). */
  spots: number[];
  /** Slides you may make now, as [from, to]. */
  moves: [number, number][];
  last: { seat: number; from?: number; to?: number; took?: number } | null;
}

export interface SnakesView {
  /** Square each seat stands on: 0 before the board, 100 home. */
  pos: number[];
  turn: number;
  out: boolean[];
  last: { seat: number; die: number; from: number; to: number; jump: 'ladder' | 'snake' | null } | null;
}

export interface ScrabbleView {
  /** 225 squares, top-left first: a letter, lower case when it is a blank tile standing for that letter, '.' empty. */
  board: string;
  /** Your tiles; '?' is a blank. */
  rack: string[];
  counts: number[];
  bag: number;
  scores: number[];
  turn: number;
  out: boolean[];
  last: { seat: number; kind: 'play' | 'swap' | 'pass'; words?: string[]; score?: number; squares?: number[] } | null;
}

/** A tile being put down: the square, the tile from the rack, and for a blank the letter it stands for. */
export interface ScrabblePlacement {
  sq: number;
  tile: string;
  as?: string;
}

export interface CapsDisc {
  /** 0 is the ball; 1-4 are seat 0's covers, 5-8 seat 1's. */
  id: number;
  x: number;
  y: number;
}

export interface CapsView {
  discs: CapsDisc[];
  score: [number, number];
  turn: number;
  /** The last flick, so both players can watch it. */
  shot: { n: number; by: number; from: CapsDisc[]; id: number; dx: number; dy: number; power: number } | null;
  last: { seat: number; goal: number | null } | null;
}

/* ---------- Matches ---------- */

export type MatchStatus = 'open' | 'live' | 'done' | 'void';

export interface MatchPlayer {
  uid: string;
  username: string;
}

/** A table in a list. */
export interface MatchCard {
  id: string;
  game: GameId;
  stake: number;
  seats: number;
  status: MatchStatus;
  host: string;
  players: MatchPlayer[];
  /** Somebody challenged you to this one. */
  invited: boolean;
  /** It is waiting for your move. */
  yourTurn: boolean;
  /** Finished matches: uids that won (empty: nobody, stakes returned). */
  winners: string[];
  at: number;
}

export interface MatchView extends MatchCard {
  pot: number;
  /** Your seat, or -1 if you are only watching. */
  you: number;
  /** Seats that must act now. */
  pending: number[];
  deadline: number;
  /** Server time when this was sent, so countdowns survive a wrong phone clock. */
  now: number;
  version: number;
  view: BeltView | TenTenView | DiceView | AyoView | WhotView | LudoView | ChessView | DraughtsView | PoolView | DaraView | SnakesView | ScrabbleView | CapsView | null;
}

export interface GamesLobby {
  balance: number;
  mine: MatchCard[];
  open: MatchCard[];
  recent: MatchCard[];
}

export interface Champion {
  uid: string;
  username: string;
  played: number;
  won: number;
  net: number;
}

/** Live events pushed to players (see worker/games.ts). */
export type GameEvent =
  | { t: 'game'; kind: 'update'; id: string }
  | { t: 'game'; kind: 'invite'; id: string; game: GameId; by: string; stake: number }
  | { t: 'game'; kind: 'joined'; id: string; game: GameId; by: string }
  | { t: 'game'; kind: 'start'; id: string; game: GameId }
  /** amount: what was won, lost, or handed back (draw, or a table that closed). */
  | { t: 'game'; kind: 'over'; id: string; game: GameId; result: 'won' | 'lost' | 'draw' | 'closed'; amount: number };
