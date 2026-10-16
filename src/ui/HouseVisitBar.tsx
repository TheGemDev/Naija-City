import { withPark } from '../game/exterior';
import { useEffect, useRef, useState } from 'react';
import { startCaughtScene, useCaught } from '../game/caughtScenes';
import { useVisit } from '../game/visits';
import { cancelStealing, reportSpotted, startStealing, stealHouseFurniture } from '../net/visit';
import { avatar } from '../game/avatar';
import { bfs, blockedCells, houseLayout, itemTransform, type PlacedItem } from '../game/grid';
import { cameraSpotting } from '../game/security';
import { litHere, naira, taskDurationSeconds, useGame } from '../game/store';
import { ITEMS, stealSeconds } from '../game/catalog';
import { saveLocal } from '../game/save';
import { api, pushSave } from '../net/session';
import { sfx } from '../game/sfx';
import { Icon } from './Icons';
import { ActionRow } from './Sheets';
import { HouseFacts } from './HouseCard';
import { CribRate } from './CribRate';

/** While burgling, keep checking the house cameras; walking into a view cone gets the thief caught. */
function useCameraWatch(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let asking = false;
    const id = setInterval(() => {
      const visit = useVisit.getState().current;
      if (!visit?.burglary || asking || useCaught.getState().active) return;
      const layout = houseLayout(withPark(visit.save.design, visit.save.ownedCars?.length ?? 0), visit.save.walls);
      if (!cameraSpotting(visit.save.items, layout, avatar.x, avatar.z)) return;
      sfx.play('beep');
      asking = true;
      reportSpotted()
        .then((caught) => {
          if (caught) startCaughtScene('camera');
        })
        .catch(() => {})
        .finally(() => { asking = false; });
    }, 400);
    return () => clearInterval(id);
  }, [on]);
}

const REACH = 2;

/** Walk the thief to a free cell beside the item. Resolves false if there's no way or the walk is interrupted. */
function walkNextTo(item: PlacedItem): Promise<boolean> {
  const visit = useVisit.getState().current;
  if (!visit) return Promise.resolve(false);
  const { cx, cz } = itemTransform(item);
  if (Math.hypot(avatar.x - cx, avatar.z - cz) <= REACH) return Promise.resolve(true);
  const layout = houseLayout(withPark(visit.save.design, visit.save.ownedCars?.length ?? 0), visit.save.walls);
  const path = bfs(
    { x: Math.floor(avatar.x), z: Math.floor(avatar.z) },
    blockedCells(visit.save.items),
    (c) => Math.hypot(c.x + 0.5 - cx, c.z + 0.5 - cz) <= REACH,
    layout,
  );
  if (!path) {
    useGame.getState().toast('Can’t find a way to that item');
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    avatar.path = path;
    const id = setInterval(() => {
      if (useVisit.getState().current && avatar.path.length) return;
      clearInterval(id);
      resolve(!!useVisit.getState().current && Math.hypot(avatar.x - cx, avatar.z - cz) <= REACH + 0.3);
    }, 100);
  });
}

interface Carrying {
  item: PlacedItem;
  seconds: number;
  startedAt: number;
}

export function HouseVisitBar() {
  const visit = useVisit((s) => s.current);
  const lit = useGame(litHere);
  const [busy, setBusy] = useState(false);
  const [using, setUsing] = useState(false);
  const [carrying, setCarrying] = useState<Carrying | null>(null);
  const [progress, setProgress] = useState(0);
  const carryRef = useRef<Carrying | null>(null);
  carryRef.current = carrying;
  const burglary = !!visit?.burglary;
  useCameraWatch(burglary);

  const cancel = (message?: string) => {
    if (!carryRef.current) return;
    carryRef.current = null;
    setCarrying(null);
    setProgress(0);
    void cancelStealing().catch(() => {});
    if (message) useGame.getState().toast(message);
  };

  const finish = async (item: PlacedItem) => {
    setBusy(true);
    try {
      const result = await stealHouseFurniture(item.id);
      if (result.caught) {
        startCaughtScene(result.camera ? 'camera' : 'guard');
      } else if (result.stolen && result.item) {
        useVisit.setState((s) => s.current ? {
          current: {
            ...s.current,
            save: { ...s.current.save, items: s.current.save.items.filter((placed) => placed.id !== item.id) },
            selectedItemId: null,
          },
        } : {});
        useGame.setState((s) => ({ furnitureInventory: [...s.furnitureInventory, { ...result.item!, stolen: true }] }));
        saveLocal();
        void pushSave();
        useGame.getState().toast(`🥷 Stole ${ITEMS[item.type]?.name ?? 'an item'}; it’s in your furniture inventory.`);
      }
    } catch (error) {
      useGame.getState().toast(error instanceof Error ? error.message : 'Could not steal that item');
    } finally {
      setBusy(false);
    }
  };

  // Tick the carry timer; walking away from the item drops it.
  useEffect(() => {
    if (!carrying) return;
    const { cx, cz } = itemTransform(carrying.item);
    sfx.play('rustle');
    let lastRustle = Date.now();
    const id = setInterval(() => {
      if (carryRef.current !== carrying) return;
      if (Date.now() - lastRustle > 1300) {
        lastRustle = Date.now();
        sfx.play('rustle');
      }
      if (Math.hypot(avatar.x - cx, avatar.z - cz) > 2.5) {
        cancel(`You walked away and dropped the ${ITEMS[carrying.item.type]?.name ?? 'item'}.`);
        return;
      }
      const p = Math.min(1, (Date.now() - carrying.startedAt) / (carrying.seconds * 1000));
      setProgress(p);
      if (p >= 1) {
        carryRef.current = null;
        setCarrying(null);
        setProgress(0);
        void finish(carrying.item);
      }
    }, 100);
    return () => clearInterval(id);
  }, [carrying]);

  // Picking another piece of furniture closes the list.
  const pickedId = visit?.selectedItemId;
  useEffect(() => setUsing(false), [pickedId]);

  // Leaving the house (or being thrown out) ends any carry in progress.
  useEffect(() => {
    if (!visit && carryRef.current) {
      carryRef.current = null;
      setCarrying(null);
      setProgress(0);
      void cancelStealing().catch(() => {});
    }
  }, [visit]);

  if (!visit) return null;
  const selected = visit.save.items.find((item) => item.id === visit.selectedItemId && !ITEMS[item.type]?.fixed);
  const uses = visit.save.items.find((item) => item.id === visit.selectedItemId)?.type;
  const useActions = uses ? ITEMS[uses]?.actions ?? [] : [];
  const begin = async () => {
    if (!selected || busy || carrying) return;
    setBusy(true);
    try {
      if (!(await walkNextTo(selected))) return;
      const seconds = await startStealing(selected.id);
      setCarrying({ item: selected, seconds, startedAt: Date.now() });
    } catch (error) {
      useGame.getState().toast(error instanceof Error ? error.message : 'Could not steal that item');
    } finally {
      setBusy(false);
    }
  };
  const reportMeter = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api('/api/blackmarket/report-meter', { method: 'POST', body: JSON.stringify({ uid: visit.ownerUid }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not report');
      useGame.getState().toast(`📞 You called NEPA on @${visit.ownerUsername}. Inspectors are on the way.`);
    } catch (error) {
      useGame.getState().toast(error instanceof Error ? error.message : 'Could not report');
    } finally {
      setBusy(false);
    }
  };
  const name = (item: PlacedItem) => ITEMS[item.type]?.name ?? 'item';
  const left = carrying ? Math.max(0, Math.ceil(carrying.seconds * (1 - progress))) : 0;
  if (using && selected && !carrying) {
    return (
      <div className="sheet small">
        <div className="sheet-head">
          <h3>{ITEMS[selected.type]?.icon} {name(selected)}</h3>
          <button className="x" onClick={() => setUsing(false)}>✕</button>
        </div>
        <div className="actions">
          {useActions.map((a) => {
            const dark = !!a.needsPower && !lit;
            const sub = [a.minutes ? `${taskDurationSeconds(a.minutes, a.minutes, !!(a.cookingPerHour || a.fast))} sec` : null, a.cost ? naira(a.cost) : null, dark ? 'no light' : null].filter(Boolean).join(' · ');
            return <ActionRow key={a.id} action={a} sub={sub} dim={dark} onClick={() => { setUsing(false); useGame.getState().startAction(selected.id, a.id); }} />;
          })}
        </div>
      </div>
    );
  }
  return (
    <div className={`house-visit-bar${visit.burglary ? ' burglary' : ''}`}>
      <span className="visit-name"><Icon name={visit.burglary ? 'break-in' : 'home'} size={15} /> <HouseFacts title={`@${visit.ownerUsername}'s house`} address={visit} /></span>
      <div className="visit-buttons">
      {!carrying && !selected && <CribRate visit={visit} />}
      {visit.meterBypassed && !carrying && !visit.burglary && (
        <button className="danger" disabled={busy} title="You notice a dodgy wire from the pole to their meter" onClick={() => void reportMeter()}>
          🔌 Report meter
        </button>
      )}
      {carrying ? (
        <>
          <span className="steal-progress" title={`Taking ${name(carrying.item)}`}>
            <i style={{ width: `${progress * 100}%` }} />
            <em>Taking {name(carrying.item)}… {left}s</em>
          </span>
          <button className="danger" onClick={() => cancel()}>Cancel</button>
        </>
      ) : selected && (
        <>
          {useActions.length > 0 && (
            <button className="use" aria-expanded={using} onClick={() => setUsing(!using)}>Activities</button>
          )}
          <button className="danger" disabled={busy} onClick={() => void begin()}>
            {busy ? 'Taking…' : `Steal (${stealSeconds(selected.type)}s)`}
          </button>
        </>
      )}
      </div>
    </div>
  );
}
