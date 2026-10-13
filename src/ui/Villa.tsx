// Aso Villa (game/villa.ts): the pill that takes the President from the office through to the suite behind it.

import { useGame } from '../game/store';
import { VILLA_ID } from '../game/villa';
import { useHeldOffice } from '../net/office';
import { Emoji } from './Icons';

/** Floating pill shown to the President while in the office at Aso Villa: straight through to the suite. */
export function SuiteLauncher() {
  const here = useGame((s) => s.view === 'place' && s.insideId === VILLA_ID);
  // The action sheet and the phone use this strip of screen.
  const busy = useGame((s) => !!s.selectedId || !!s.panel);
  const president = useHeldOffice() === 'president';
  if (!here || busy || !president) return null;
  return (
    <button type="button" className="venue-bet-launch hotel" onClick={() => useGame.getState().startPlaceAction(VILLA_ID, 'villa_suite')}>
      <span className="vbl-icon"><Emoji char="👑" size={18} /></span> Presidential Suite
    </button>
  );
}
