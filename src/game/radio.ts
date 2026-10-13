// Where the radio plays. Live stations belong to the world: a house plays the station set on its speakers and
// the club plays its DJ. Everywhere else you hear the background music (audio.ts), unless you tune in on the phone.

import { useEffect, useRef } from 'react';
import { audio, LIVE_STATIONS, type LiveStation } from './audio';
import type { PlacedItem } from './grid';
import { litHere, useGame, type GameState } from './store';
import { useVisit, type HouseVisit } from './visits';

const CLUB = 'club';
/** Club music: a random club station plays while you are in the nightclub. */
const CLUB_STATIONS = LIVE_STATIONS.filter((s) => /club|amapiano|afrobeat|dj|r&b/i.test(s.genre));

const stationOf = (id: string | null | undefined) => LIVE_STATIONS.find((s) => s.id === id);
const worksAsSpeaker = (i: PlacedItem) => i.type === 'speaker' && !i.broken;

/** What is on where the player stands: a station id, the club, or nothing. House speakers need light and a station set on them. */
function placeRadio(s: GameState, visit: HouseVisit | null): string | null {
  if (s.insideId === CLUB) return CLUB;
  if (s.view !== 'home') return null;
  // In someone else's house it is their speakers and their station
  if (!(visit?.save.items ?? s.items).some(worksAsSpeaker)) return null;
  if (!litHere(s)) return null;
  return stationOf(visit ? visit.save.houseStation : s.houseStation)?.id ?? null;
}

/** In your own house with a working speaker, the radio is the house's: what you tune there is what the house plays. */
function atOwnSpeakers() {
  const s = useGame.getState();
  return s.view === 'home' && !useVisit.getState().current && s.items.some(worksAsSpeaker);
}

/** Tune a station. At home with speakers it becomes the house station, so it is on again whenever you are in. */
export function tuneRadio(station: LiveStation) {
  if (atOwnSpeakers()) useGame.setState({ houseStation: station.id });
  audio.playLive(station);
}

/** Next / previous station, kept as the house station when it is the house speakers playing. */
export function skipRadio(dir: 1 | -1 = 1) {
  const next = audio.skipLive(dir);
  if (next && atOwnSpeakers()) useGame.setState({ houseStation: next.id });
}

/** Radio off. On your own speakers that switches the house station off too: it stays off until you set one again. */
export function radioOff() {
  if (atOwnSpeakers()) useGame.setState({ houseStation: null });
  audio.stopRadio();
}

/** Keeps the radio in step with where the player is: on when they walk in on one, off when they leave. Mounted by the HUD. */
export function usePlaceRadio() {
  const visit = useVisit((v) => v.current);
  const wanted = useGame((s) => placeRadio(s, visit));
  const last = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const was = last.current;
    if (was === wanted) return;
    last.current = wanted;

    if (!wanted) {
      // Walked out, light went or the speaker did: back to the background music
      if (was) audio.stopRadio();
      return;
    }
    if (wanted === CLUB) {
      // The HUD coming back mid-set keeps the station that is on
      if (was === undefined && audio.radioOn) return;
      const pick = CLUB_STATIONS[Math.floor(Math.random() * CLUB_STATIONS.length)];
      if (pick) audio.playLive(pick, { fallback: true });
      return;
    }
    const station = stationOf(wanted);
    if (station && audio.currentLiveStation?.id !== wanted) audio.playLive(station, { fallback: true });
  }, [wanted]);
}
