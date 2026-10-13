// What your needs do to you in public. Walk into a place hungry, bursting or half asleep and something
// happens: sometimes it costs you, sometimes a stranger helps. Turn up in a great mood and people are
// good to you. It makes the bars matter between "fine" and the hospital (the hard limits are in store.ts).
//
// startMishaps() listens to the game like startSfx() does.

import type { Place } from './city';
import { regionPlaces } from './regions';
import { moodOf, useGame, type GameState } from './store';
import { fed, type Need } from './catalog';
import { isPrivateRoom } from './villa';

type Outcome = {
  text: (place: string) => string;
  needs?: Partial<Record<Need, number>>;
  /** Small cash cost (skipped if you can't pay). */
  cost?: number;
  costLabel?: string;
  /** Small windfall, paid as a 'luck' gig. */
  gift?: number;
};

interface Mishap {
  id: string;
  when: (s: GameState) => boolean;
  chance: number;
  outcomes: Outcome[];
}

const MISHAPS: Mishap[] = [
  {
    id: 'hunger',
    when: (s) => s.needs.hunger < 18,
    chance: 0.5,
    outcomes: [
      { text: (p) => `😳 Your belle rumbled so loud at ${p} that everybody turned to look.`, needs: { fun: -8, social: -6 } },
      { text: () => '🥹 A mama selling puff-puff looked at your face and dashed you three. “Chop, my pikin.”', needs: { hunger: 14, social: 6 } },
      { text: (p) => `😵‍💫 You went dizzy from hunger at ${p} and had to sit on the floor till it passed.`, needs: { energy: -8, fun: -5 } },
    ],
  },
  {
    id: 'energy',
    when: (s) => s.needs.energy < 15,
    chance: 0.5,
    outcomes: [
      { text: (p) => `😴 You dozed off standing up at ${p}. Somebody snapped you. You are a meme on Naija Twitter now.`, needs: { fun: -10, energy: 6, social: 4 } },
      { text: (p) => `🥱 You yawned in an elder’s face at ${p}. “This generation!”`, needs: { social: -8 } },
    ],
  },
  {
    id: 'glow',
    when: (s) => moodOf(s.needs).score >= 80,
    chance: 0.2,
    outcomes: [
      { text: (p) => `😄 You walked into ${p} glowing. A stranger hailed you and squeezed ₦500 into your hand.`, gift: 500, needs: { social: 6 } },
      { text: (p) => `✨ Fresh, fed and rested: heads turned at ${p}. Somebody asked for your number.`, needs: { social: 12, fun: 6 } },
      { text: () => '🤝🏾 An old classmate spotted you looking sharp and insisted on buying you a cold malt.', needs: { hunger: 6, fun: 8, social: 8 } },
    ],
  },
];

/** The same kind of thing doesn't happen again for this long (real time). */
const COOLDOWN_MS = 12 * 60_000;
/** Nothing happens in these: you didn't walk in by choice, or you came to be looked after. */
const QUIET = new Set(['home', 'prison', 'camp', 'hospital']);

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

const lastAt = new Map<string, number>();

function arrive(place: Place) {
  const s = useGame.getState();
  const now = Date.now();
  const hit = MISHAPS.find((m) => m.when(s) && now - (lastAt.get(m.id) ?? 0) > COOLDOWN_MS && Math.random() < m.chance);
  if (!hit) return;
  lastAt.set(hit.id, now);
  let outcome = pick(hit.outcomes);
  // Broke: take an outcome that costs nothing, if there is one.
  if (outcome.cost && s.money < outcome.cost) {
    const free = hit.outcomes.filter((o) => !o.cost);
    if (!free.length) return;
    outcome = pick(free);
  }
  if (outcome.cost) s.charge(outcome.cost, outcome.costLabel ?? 'Small wahala');
  if (outcome.gift) s.earn('luck', outcome.gift, 'A stranger’s kindness');
  if (outcome.needs) {
    const delta = fed(outcome.needs);
    useGame.setState((g) => ({
      needs: Object.fromEntries(Object.entries(g.needs).map(([k, v]) => [k, clamp(v + (delta[k as Need] ?? 0))])) as Record<Need, number>,
    }));
  }
  s.toast(outcome.text(place.name));
}

/** Wire it to the game. Returns a cleanup. */
export function startMishaps() {
  let prev = useGame.getState();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = useGame.subscribe((s) => {
    const p = prev;
    prev = s;
    // Only on walking in: not on loading a save that was already inside.
    if (!s.started || !p.started) return;
    if (s.view !== 'place' || !s.insideId || (p.view === 'place' && p.insideId === s.insideId)) return;
    // Coming down from your hotel room, or out of your suite, is not walking in off the street.
    if (p.view === 'place' && isPrivateRoom(p.insideId)) return;
    if (QUIET.has(s.insideId) || s.jailedUntil || s.heldUntil) return;
    const inside = s.insideId;
    const place = regionPlaces(s.destinationId).find((x) => x.id === inside);
    if (!place) return;
    // A beat after the door, so it doesn't land on top of the arrival itself.
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const now = useGame.getState();
      if (now.view === 'place' && now.insideId === place.id && !now.streetStory) arrive(place);
    }, 1800);
  });
  return () => {
    unsub();
    if (timer) clearTimeout(timer);
  };
}
