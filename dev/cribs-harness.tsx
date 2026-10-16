// TEMP harness (delete after): the real phone with the Cribs app, against the local test API. ?as=amaka&view=phone|visit
import { createRoot } from 'react-dom/client';
import '../src/game/theme';
import '../src/theme.css';
import '../src/styles.css';
import '../src/ui/phone-ui.css';
import '../src/ui/safe-area.css';
import { useGame } from '../src/game/store';
import { hydrate, type SaveData } from '../src/game/save';
import { useSession, api } from '../src/net/session';
import { initWallet, startWallet } from '../src/net/wallet';
import { useVisit } from '../src/game/visits';
import { Phone } from '../src/ui/Phone';
import { HouseVisitBar } from '../src/ui/HouseVisitBar';
import { ProfileSheet } from '../src/ui/ProfileSheet';

const q = new URLSearchParams(location.search);
const as = q.get('as') ?? 'amaka';
const view = q.get('view') ?? 'phone';

async function boot() {
  useSession.setState({ status: 'ready', user: { uid: as, email: null, name: as, username: as } });
  startWallet();
  await initWallet();
  const save = (await (await api('/api/save')).json()) as SaveData;
  hydrate(save);
  useGame.setState({ started: true, view: 'home' });
  if (view === 'visit') {
    const owner = q.get('owner') ?? 'zainab';
    await fetch(`/__test/access?guest=${as}&owner=${owner}&pid=${q.get('pid') ?? 'z1'}`);
    const home = await (await api(`/api/cribs/house?uid=${owner}`)).json();
    useVisit.setState({ current: { ownerUid: owner, ownerUsername: owner, ownerName: owner, propertyId: home.house.pid, city: home.house.city, save: { origin: 'normal', items: [] } }, returnSave: null });
  }
  if (view === 'phone') useGame.setState({ panel: 'phone', openApp: 'cribs' });
  if (view === 'profile') useGame.setState({ panel: 'profile' });
  Object.assign(window, { ready: true, useGame, useVisit });
}

/** The game's toasts, drawn plainly at the top (the real ones live in the HUD). */
function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return <div style={{ position: 'fixed', top: 8, left: 8, right: 8, zIndex: 99, display: 'flex', flexDirection: 'column', gap: 6 }}>{toasts.filter((t) => !t.text.startsWith('📱')).slice(-2).map((t) => <div key={t.id} style={{ background: '#0f172a', color: '#fff', padding: '10px 14px', borderRadius: 14, fontSize: 14, boxShadow: '0 6px 16px rgba(0,0,0,.3)' }}>{t.text}</div>)}</div>;
}

createRoot(document.getElementById('root')!).render(
  <>
    <Toasts />
    <Phone />
    {view === 'visit' && <HouseVisitBar />}
    {view === 'profile' && <ProfileSheet />}
  </>,
);
void boot().catch((e) => { document.body.insertAdjacentHTML('beforeend', `<pre style="color:red">${e?.stack ?? e}</pre>`); });
