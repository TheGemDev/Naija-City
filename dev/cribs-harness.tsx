// TEMP harness (delete after): the real phone with the Cribs app, against the local test API. ?as=amaka&view=phone|visit
import { createRoot } from 'react-dom/client';
import '../src/game/theme';
import '../src/styles.css';
import { useGame } from '../src/game/store';
import { hydrate, type SaveData } from '../src/game/save';
import { useSession, api } from '../src/net/session';
import { initWallet } from '../src/net/wallet';
import { useVisit } from '../src/game/visits';
import { Phone } from '../src/ui/Phone';
import { HouseVisitBar } from '../src/ui/HouseVisitBar';
import { ProfileSheet } from '../src/ui/ProfileSheet';

const q = new URLSearchParams(location.search);
const as = q.get('as') ?? 'amaka';
const view = q.get('view') ?? 'phone';

async function boot() {
  useSession.setState({ status: 'ready', user: { uid: as, email: null, name: as, username: as } });
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
  (window as unknown as { ready: boolean }).ready = true;
}

createRoot(document.getElementById('root')!).render(
  <>
    <Phone />
    {view === 'visit' && <HouseVisitBar />}
    {view === 'profile' && <ProfileSheet />}
  </>,
);
void boot().catch((e) => { document.body.insertAdjacentHTML('beforeend', `<pre style="color:red">${e?.stack ?? e}</pre>`); });
