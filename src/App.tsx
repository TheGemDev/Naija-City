import { lazy, Suspense, useEffect, useState } from 'react';
import { useMarquee } from './ui/useMarquee';
import { Scene } from './three/Scene';
import { Hud } from './ui/Hud';
import { ActionSheet, BuyPanel, OwnedSheet, PlaceBar, PlaceSheet, StreetStorySheet } from './ui/Sheets';
import { Welcome } from './ui/Welcome';
import { Guide } from './ui/Guide';
import { Closet } from './ui/Closet';
import { ProfileSheet } from './ui/ProfileSheet';
import { PhoneShop } from './ui/PhoneShop';
import { Auth } from './ui/Auth';
import { Landing } from './ui/Landing';
import { ConnectionGate } from './ui/ConnectionGate';
import { startSession, useSession } from './net/session';
import { startMultiplayer, useNet } from './net/multiplayer';
import { startSocial } from './net/social';
import { startWallet } from './net/wallet';
import { startEstate } from './net/estate';
import { EstateBar } from './ui/EstateBar';
import { TravelPicker } from './ui/TravelPicker';
import { TripSheet } from './ui/TripSheet';
import { startAutosave } from './game/save';
import { useGame } from './game/store';
import { Jail, WantedBanner } from './ui/Police';
import { CaughtScene } from './ui/CaughtScene';
import { Fainted } from './ui/Fainted';
import { startPolice } from './net/crime';
import { PlayerInteractions } from './ui/PlayerInteractions';
import { HouseVisitBar } from './ui/HouseVisitBar';
import { HouseCard } from './ui/HouseCard';
import { IntruderAlert } from './ui/IntruderAlert';
import { PlaceHubDrawer } from './ui/PlaceHub';
import { startLive } from './net/live';
import { startCareer } from './net/career';
import { startMarket } from './net/market';
import { startShop } from './net/shop';
import { watchMarket } from './net/stocks';
import { AdsSheet } from './ui/AdsApp';
import { startParty } from './net/owambe';
import { DriveHud } from './ui/DriveHud';
import { ViceOverlays } from './ui/Vice';
import { ElectionLauncher, ElectionSheet } from './ui/Election';
import { startVice } from './net/vice';
import { startSfx } from './game/sfx';
import { startJuice } from './game/juice';
import { startMishaps } from './game/mishaps';
import { startBreakdowns } from './game/breakdowns';
import { Juice } from './ui/Juice';
import { ShiftGame } from './ui/ShiftGame';
import { RobbedCard } from './ui/RobbedCard';
import { RepairSheet } from './ui/RepairSheet';
import { Owambe } from './ui/Owambe';
import { LifeSummary, PlaceEvents } from './ui/LiveApps';
import { clearLocal } from './game/save';
import { resetWallet } from './net/wallet';
import { VenueBetLauncher, VenueBetting } from './ui/VenueBetting';
import { TitleScreen, useTitle } from './ui/TitleScreen';
import { audio } from './game/audio';
import { UpdateNotice } from './ui/UpdateNotice';
import { PhotoMode } from './ui/PhotoMode';
import { useSocial } from './net/social';
import { followDeepLink, takeDeepLink, type DeepLink } from './net/deeplink';
import { freshPage, isMissingFile } from './net/freshPage';

// The phone and its apps are a large share of the game's code and nobody needs them on the first frame, so they
// load on their own, right after the game is on screen.
const loadPhone = () => import('./ui/Phone');
const Phone = lazy(() => loadPhone().then((m) => ({ default: m.Phone })));

export default function App() {
  useMarquee();
  const panel = useGame((s) => s.panel);
  // Online-only: none of the game UI shows until the player is signed in.
  const ready = useSession((s) => s.status === 'ready');
  // Account opened in another tab/device: unmount the whole game so this tab renders and polls nothing.
  const replaced = useNet((s) => s.replaced);
  const title = useTitle((s) => s.open);
  const [pendingChatUid, setPendingChatUid] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<DeepLink | null>(() => takeDeepLink());
  // Every sign-in starts at the title screen.
  useEffect(() => {
    if (!ready) {
      useTitle.setState({ open: true });
      audio.leaveGame();
    }
  }, [ready]);
  useEffect(() => {
    // Loaded ahead of its first use. A page from before the last update asks for a file that is gone: get today's page.
    if (ready) loadPhone().catch((error) => void (isMissingFile(error) && freshPage()));
  }, [ready]);
  useEffect(() => startAutosave(), []);
  useEffect(() => startSession(), []);
  useEffect(() => startMultiplayer(), []);
  useEffect(() => startSocial(), []);
  useEffect(() => startWallet(), []);
  useEffect(() => startEstate(), []);
  useEffect(() => startPolice(), []);
  useEffect(() => startLive(), []);
  useEffect(() => startCareer(), []);
  useEffect(() => startMarket(), []);
  useEffect(() => { startShop(); }, []);
  useEffect(() => watchMarket(120_000), []);
  useEffect(() => startParty(), []);
  useEffect(() => startVice(), []);
  useEffect(() => startSfx(), []);
  useEffect(() => startJuice(), []);
  useEffect(() => startMishaps(), []);
  useEffect(() => startBreakdowns(), []);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; uid?: unknown } | null;
      if (data?.type === 'open-chat' && typeof data.uid === 'string' && data.uid.length > 0 && data.uid.length <= 128) {
        setPendingChatUid(data.uid);
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    const url = new URL(window.location.href);
    const uid = url.searchParams.get('chat');
    if (uid && uid.length <= 128) setPendingChatUid(uid);
    if (url.searchParams.has('chat')) {
      url.searchParams.delete('chat');
      window.history.replaceState({}, '', url);
    }
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    if (!pendingChatUid || !ready || title) return;
    useSocial.setState({ openWith: pendingChatUid });
    useGame.setState({ panel: 'phone' });
    setPendingChatUid(null);
  }, [pendingChatUid, ready, title]);

  useEffect(() => {
    if (!pendingLink || !ready || title) return;
    setPendingLink(null);
    void followDeepLink(pendingLink);
  }, [pendingLink, ready, title]);

  // Keyboard shortcuts for desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const s = useGame.getState();
      if (e.key === 'r' || e.key === 'R') s.rotatePlacing();
      if (e.key === 'Escape') {
        if (s.placing) s.cancelPlacing();
        else if (s.selectedId) s.select(null);
        else if (s.placeHubOpen) s.setPlaceHubOpen(false);
        else if (s.placeId) s.selectPlace(null);
        else s.setPanel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app-root">
      <div className="scene-wrap">
        {!replaced && <Scene />}
      </div>
      <div className={`ui ${panel === 'phone' ? 'phone-open' : ''}`}>
        {ready && title && !replaced && <TitleScreen />}
        {ready && !title && !replaced && (
          <>
            <Hud />
            <ActionSheet />
            <BuyPanel />
            <OwnedSheet />
            <RepairSheet />
            <PlaceBar />
            <EstateBar />
            <PlaceSheet />
            <TravelPicker />
            <TripSheet />
            <PlaceHubDrawer />
            <Suspense fallback={null}>
              <Phone />
            </Suspense>
            <AdsSheet />
            <PlayerInteractions />
            <HouseVisitBar />
            <HouseCard />
            <IntruderAlert />
            <RobbedCard />
            <ShiftGame />
            <VenueBetLauncher />
            <VenueBetting />
            <PlaceEvents />
            <DriveHud />
            <ViceOverlays />
            <ElectionLauncher />
            <ElectionSheet />
            <StreetStorySheet />
            <Owambe />
            <Closet />
            <ProfileSheet />
            <PhoneShop />
            <Welcome />
            <Guide />
            <CaughtScene />
            <Fainted />
            <Jail />
            <WantedBanner />
            <Juice />
            <PhotoMode />
            <LifeSummary
              onNewLife={() => {
                clearLocal();
                useGame.getState().newLife();
                void resetWallet();
              }}
            />
          </>
        )}
        <Landing />
        <Auth />
        <ConnectionGate />
        <UpdateNotice />
      </div>
    </div>
  );
}
