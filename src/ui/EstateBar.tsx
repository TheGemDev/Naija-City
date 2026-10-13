// On-screen bars while walking round an estate: a card at the top saying which estate you're in (Kachia 1,
// Kachia 2, ...) with a switcher, and a card at the bottom for the plot you tapped and the way out.

import { useCallback, useEffect, useRef } from 'react';
import { naira, useGame } from '../game/store';
import { CAP, sectionOf } from '../game/estate';
import { builtOn, DESIGN_BY_ID, landPrice, PLOTS, REGION_BY_ID, REGIONS, STAGES } from '../game/property';
import { loadEstate, useEstate } from '../net/estate';
import { useLots } from '../three/Estate';
import { openHouse } from './Gida';
import { Chevron, Icon } from './Icons';
import { usePolice } from '../net/crime';
import { useNet } from '../net/multiplayer';
import { enterHouseVisit, startBreakIn } from '../net/visit';
import { useVisit } from '../game/visits';
import { plotLink, shareLink } from '../net/deeplink';
import { requestHomeVisit } from '../net/social';

/** Enter a neighbour's house directly; the server checks the plot and estate. */
function breakIn(lot: { slot: number; uid: string | null; owner: string }, region: string) {
  if (!lot.uid) return;
  const g = useGame.getState();
  if (!useNet.getState().connected) return g.toast('Go online to break into other players’ houses.');
  usePolice.setState({ busy: true });
  void startBreakIn(lot.uid, lot.slot, region)
    .then((home) => enterHouseVisit(home))
    .catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Could not break in';
      // Security caught me at the gate: the server sends an 'arrested' WS event that handles the
      // arrest + toast, so don't also toast the HTTP error (it would show twice).
      if (!msg.includes('security caught')) g.toast(msg);
    })
    .finally(() => usePolice.setState({ busy: false }));
}

/** Knock: ask the owner to let you in. They get a visit request and can open the door from Messages. */
function knock(lot: { uid: string | null; owner: string }) {
  if (!lot.uid) return;
  const g = useGame.getState();
  if (!useNet.getState().connected) return g.toast('Go online to knock on other players’ doors.');
  void requestHomeVisit(lot.uid)
    .then(() => g.toast(`🚪 You knocked on ${lot.owner}'s door. Waiting for them to open`))
    .catch((error: unknown) => g.toast(error instanceof Error ? error.message : 'Could not knock'));
}

/** Auto-scrolling text when it overflows its container. */
function ScrollName({ text }: { text: string }) {
  const ref = useRef<HTMLElement>(null);
  const measure = useCallback((el: HTMLElement | null) => {
    (ref as React.MutableRefObject<HTMLElement | null>).current = el;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth) {
      el.classList.add('scrolling');
      el.style.setProperty('--scroll-dist', `${el.clientWidth - el.scrollWidth}px`);
    } else {
      el.classList.remove('scrolling');
    }
  }, [text]);
  return <b ref={measure}><span>{text}</span></b>;
}

export function EstateBar() {
  const region = useGame((s) => (s.view === 'estate' ? s.estateId : null));
  const no = useGame((s) => s.estateNo);
  const properties = useGame((s) => s.properties);
  const lots = useLots(region ?? '');
  const picked = useEstate((s) => s.picked);
  const loading = useEstate((s) => s.loading === region);
  const busy = usePolice((s) => s.busy);
  const visiting = useVisit((s) => !!s.current);
  useEffect(() => {
    if (!region) return;
    const refresh = () => void loadEstate(region, no);
    const timer = setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [region, no]);
  if (!region || visiting) return null;
  const r = REGION_BY_ID[region];
  const lot = lots.find((l) => l.slot === picked);
  const pickedEmpty = picked !== null && !lot && picked >= 0 && picked < CAP;
  // Only your own houses carry a build date; the estate list from the server doesn't.
  const built = lot?.mine ? builtOn(useGame.getState().properties.find((p) => p.region === region && p.slot === lot.slot)) : null;
  const design = lot?.design ? DESIGN_BY_ID[lot.design] : null;
  const mine = lots.filter((l) => l.mine).length;
  const neighbours = lots.length - mine;
  const stops = [...new Map(properties.filter((p) => p.stage >= STAGES.length).map((p) => [`${p.region}:${sectionOf(p.slot ?? 0)}`, { region: p.region, no: sectionOf(p.slot ?? 0) }])).values()]
    .sort((a, b) => REGIONS.findIndex((r) => r.id === a.region) - REGIONS.findIndex((r) => r.id === b.region) || a.no - b.no);
  const activeStop = stops.findIndex((s) => s.region === region && s.no === no);
  const go = (direction: -1 | 1) => {
    if (!stops.length) return;
    const nextIndex = activeStop < 0
      ? direction === 1 ? 0 : stops.length - 1
      : (activeStop + direction + stops.length) % stops.length;
    const target = stops[nextIndex];
    if (target.region === region && target.no === no) return;
    useEstate.setState({ picked: null });
    if (target.region === region) useGame.getState().gotoEstate(target.no);
    else useGame.getState().visitEstate(target.region, target.no);
  };
  return (
    <>
      <div className="estate-top">
        <button aria-label="Previous owned estate" disabled={!stops.length || (stops.length === 1 && activeStop === 0)} onClick={() => go(-1)}><Chevron dir="left" size={18} /></button>
        <div className="estate-title">
          <b><Icon name="plot" size={14} /> {r.name} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({no + 1})</span></b>
          <small>
            {activeStop >= 0 ? `Your estate ${activeStop + 1} of ${stops.length} · ` : stops.length ? 'Not one of your estates · ' : 'No owned properties · '}
            {loading && !neighbours ? 'finding neighbours…' : `${mine} yours · ${neighbours} neighbour${neighbours === 1 ? '' : 's'}`}
          </small>
        </div>
        <button aria-label="Next owned estate" disabled={!stops.length || (stops.length === 1 && activeStop === 0)} onClick={() => go(1)}><Chevron dir="right" size={18} /></button>
      </div>
      {(lot || pickedEmpty) && (
        <div className="lotcard">
          <div className="lotcard-head">
            <span className={`lotcard-av ${lot ? (lot.mine ? 'mine' : '') : 'empty'}`} aria-hidden>
              {lot ? (lot.mine ? <Icon name="star" size={20} /> : lot.owner.slice(0, 1).toUpperCase()) : <Icon name="plot" size={20} />}
            </span>
            <div className="lotcard-title">
              <ScrollName text={lot ? (lot.mine ? 'Your house' : `${lot.owner}'s house`) : 'Empty plot'} />
              <small>
                {lot
                  ? [design ? design.name : 'Bare land', PLOTS[lot.plot].label, lot.stage >= STAGES.length ? built && `Built ${built}` : lot.building ? `Building: ${STAGES[lot.stage].name.toLowerCase()}` : `${lot.stage}/${STAGES.length} stages`].filter(Boolean).join(' · ')
                  : `${r.name} · ${PLOTS.full.label}`}
              </small>
            </div>
            {picked !== null && picked >= 0 && (
              <button
                type="button"
                className="lotcard-share"
                aria-label="Share this plot"
                title="Share"
                onClick={() => void shareLink(plotLink(region, picked), `${lot ? `${lot.mine ? 'My' : `${lot.owner}'s`} plot` : 'A plot'} in ${r.name}`)}
              >
                <Icon name="share" size={16} />
              </button>
            )}
          </div>
          <div className="lotcard-actions">
            {lot?.mine && lot.stage >= STAGES.length && <button className="primary" onClick={() => useGame.getState().enterOwnHouse(lot.key)}><Icon name="enter" size={16} /> Go inside</button>}
            {lot?.mine && lot.stage >= STAGES.length && <button onClick={() => openHouse(lot.key)}><Icon name="upgrade" size={16} /> Upgrade</button>}
            {lot?.mine && lot.stage < STAGES.length && !lot.building && <button className="primary" onClick={() => openHouse(lot.key)}><Icon name="build" size={16} /> Build</button>}
            {lot?.mine && lot.building && <button className="primary" onClick={() => openHouse(lot.key)}><Icon name="build" size={16} /> View build</button>}
            {lot && !lot.mine && lot.uid && lot.design && lot.stage >= STAGES.length && (
              <>
                <button disabled={busy} onClick={() => knock(lot)}><Icon name="knock" size={16} /> Knock</button>
                <button className="danger" disabled={busy} onClick={() => breakIn(lot, region)}><Icon name="break-in" size={16} /> Break in</button>
              </>
            )}
            {pickedEmpty && (
              <button
                className="primary"
                disabled={useGame.getState().money < landPrice(r, 'full')}
                onClick={() => {
                  const before = useGame.getState().properties.length;
                  useGame.getState().buyLand(region, 'full', picked);
                  const bought = useGame.getState().properties[before];
                  if (bought) useEstate.setState({ picked: bought.slot ?? picked });
                }}
              >
                Buy plot · {naira(landPrice(r, 'full'))}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
