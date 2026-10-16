import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import './game/theme';
import { CrashScreen } from './ui/CrashScreen';
import { freshPage, isMissingFile } from './net/freshPage';
import { startErrorReporting } from './net/sentry';
import { takeBirthState, takeReferral } from './net/referral';

startErrorReporting();
takeReferral();
takeBirthState();

// Browser translate, extensions and some keyboards rewrite text nodes behind React's back. When React then tries to
// remove or insert next to a node that is no longer where it left it, it throws NotFoundError and the whole tree dies.
// Skip the stale operation instead (https://github.com/facebook/react/issues/11538).
const nodeProto = Node.prototype;
const removeChild = nodeProto.removeChild;
nodeProto.removeChild = function <T extends Node>(this: Node, child: T): T {
  if (child.parentNode !== this) return child;
  return removeChild.call(this, child) as T;
};
const insertBefore = nodeProto.insertBefore;
nodeProto.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
  if (ref && ref.parentNode !== this) return node;
  return insertBefore.call(this, node, ref) as T;
};

// stats.naija.city (and naija.city/stats) is a tiny public page: don't load the game, its 3D engine or its styles for it.
const statsOnly = location.hostname.startsWith('stats.') || location.pathname === '/stats';

function show(Page: ComponentType) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <CrashScreen>
        <Page />
      </CrashScreen>
    </StrictMode>,
  );
}

async function boot() {
  if (statsOnly) return show((await import('./stats/Stats')).default);
  // Asked for all at once: one after the other, each file waits a full round trip, which is seconds on a slow line.
  // Styles still land in the page in the order they are listed here.
  const [game] = await Promise.all([
    import('./App'),
    import('./theme.css'),
    import('./styles.css'),
    // After styles.css so the phone shell wins over the older phone rules in there.
    import('./ui/phone-ui.css'),
    import('./ui/safe-area.css'),
  ]);
  show(game.default);
}
// A page from before the last update asks for game files that are gone: get today's page instead of sitting on the loading text.
boot().catch((error) => {
  if (!isMissingFile(error) || !freshPage()) console.error('Naija City could not start', error);
});
