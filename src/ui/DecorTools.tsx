// Buy mode's editing controls (game/decor.ts): the bar while placing or moving a piece (turns, height, place),
// the top bar (undo / redo, pick several and act on them), extra buttons on a picked piece, and the keyboard.
// Thumb-sized on phones; keys on desktop.

import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ITEMS } from '../game/catalog';
import { naira, useGame } from '../game/store';
import { ROT_STEP, degOf, mountOf, wallSpan } from '../game/mount';
import { duplicate, moveSel, nudgeHeight, nudgeItem, redo, setSelectMode, storeItems, storeSel, turnItems, turnPlacing, turnSel, undo, useDecor } from '../game/decor';
import { useVisit } from '../game/visits';

const touchScreen = () => !!window.matchMedia?.('(pointer: coarse)').matches;

/** Shown while placing a new piece or moving one (or a group). */
export function DecorPlaceBar() {
  const placing = useGame((s) => s.placing);
  const money = useGame((s) => s.money);
  const cancel = useGame((s) => s.cancelPlacing);
  const placeAt = useGame((s) => s.placeAt);
  const rotate = useGame((s) => s.rotatePlacing);
  const { pose, err, smooth, dragging } = useDecor(useShallow((s) => ({ pose: s.pose, err: s.err, smooth: s.smooth, dragging: s.dragging })));
  if (!placing) return null;
  const def = ITEMS[placing.type];
  if (!def) return null;
  const touch = touchScreen();
  const wall = def.mount === 'wall';
  const group = placing.group?.length ?? 0;
  const deg = Math.round(degOf(placing));
  const step = smooth ? 5 : ROT_STEP;
  const status = !pose
    ? touch ? 'Tap where it should go' : 'Point where it should go'
    : err
      ? `⚠️ ${err}`
      : wall ? 'On the wall ✓' : pose.mount === 'surface' ? `On the ${ITEMS[useGame.getState().items.find((i) => i.id === pose.on)?.type ?? '']?.name ?? 'top'} ✓` : 'Fits ✓';
  const title = group > 1 ? `${group} pieces` : def.name;
  const height = wall && pose ? wallSpan({ type: placing.type, y: pose.y }) : null;
  return (
    <div className={`placebar decor-bar ${err ? 'bad' : pose ? 'good' : ''} ${dragging ? 'dragging' : ''}`}>
      <div className="decor-head">
        <span className="decor-title">
          {def.icon} <b>{title}</b>
          {!placing.moveId && !placing.inventoryItemId && <span className={money < def.price ? 'decor-price short' : 'decor-price'}> · {naira(def.price)}</span>}
        </span>
        <span className={`decor-status ${err ? 'bad' : pose ? 'good' : ''}`}>{status}</span>
      </div>
      {!dragging && (
        <>
          <div className="decor-row">
            {wall ? (
              <>
                <button onClick={() => nudgeHeight(0.1)} aria-label="Hang it higher">▲ Higher</button>
                <span className="decor-angle">{height ? `${Math.round(((height[0] + height[1]) / 2) * 100)} cm` : '—'}</span>
                <button onClick={() => nudgeHeight(-0.1)} aria-label="Hang it lower">▼ Lower</button>
                <small className="decor-hint">{touch ? 'Drag it along the walls' : 'Point at a wall'}</small>
              </>
            ) : group > 1 ? (
              <small className="decor-hint">{touch ? 'Drag or tap to move the group' : 'Click where the group goes'}</small>
            ) : (
              <>
                <button onClick={() => turnPlacing(-step)} aria-label={`Turn left ${step}°`}>⟲ {step}°</button>
                <span className="decor-angle">{deg}°</span>
                <button onClick={() => turnPlacing(step)} aria-label={`Turn right ${step}°`}>⟳ {step}°</button>
                <button onClick={rotate} aria-label="Quarter turn">⤾ 90°</button>
                <label className="decor-toggle" title="Turn by the degree">
                  <input type="checkbox" checked={smooth} onChange={(e) => useDecor.setState({ smooth: e.target.checked })} /> Smooth
                </label>
              </>
            )}
          </div>
          {smooth && !wall && group <= 1 && (
            <input className="decor-slider" type="range" min={0} max={359} step={1} value={deg} aria-label="Angle" onChange={(e) => turnPlacing(0, Number(e.target.value))} />
          )}
          <div className="decor-row">
            {touch || pose ? (
              <button className="go" disabled={!pose || !!err} title={err ?? undefined} onClick={() => pose && placeAt({ x: pose.x, z: pose.z })}>
                ✓ {placing.moveId ? 'Move here' : 'Place'}
              </button>
            ) : null}
            <button onClick={cancel}>{placing.moveId ? 'Cancel' : 'Done'}</button>
            {!touch && group <= 1 && <small className="decor-hint">{wall ? 'Click to hang' : 'Click to place · R 90° · Q/E turn'}</small>}
          </div>
        </>
      )}
    </div>
  );
}

/** Extra controls on a picked piece: buy another, fine turns, hang higher or lower. */
export function OwnedDecorTools({ id }: { id: string }) {
  const item = useGame((s) => s.items.find((i) => i.id === id));
  const money = useGame((s) => s.money);
  if (!item) return null;
  const def = ITEMS[item.type];
  if (!def || def.fixed) return null;
  const m = mountOf(item);
  const on = m === 'surface' ? useGame.getState().items.find((i) => i.id === item.on) : null;
  return (
    <div className="decor-owned">
      {on && <small className="muted">On the {ITEMS[on.type]?.name}</small>}
      <div className="decor-row">
        {m === 'wall' ? (
          <>
            <button onClick={() => nudgeItem(id, 0.1)}>▲ Higher</button>
            <button onClick={() => nudgeItem(id, -0.1)}>▼ Lower</button>
          </>
        ) : (
          <>
            <button onClick={() => turnItems([id], -ROT_STEP)} aria-label="Turn left 15°">⟲ 15°</button>
            <span className="decor-angle">{Math.round(degOf(item))}°</span>
            <button onClick={() => turnItems([id], ROT_STEP)} aria-label="Turn right 15°">⟳ 15°</button>
          </>
        )}
        <button className={money < def.price ? 'dim' : ''} onClick={() => duplicate(id)} title={`Buy another for ${naira(def.price)}`}>
          ⧉ Duplicate <small>{naira(def.price)}</small>
        </button>
      </div>
    </div>
  );
}

/** Undo / redo as a bold drawn arrow: the ↶ ↷ characters come out hairline-thin at any size. */
function TurnArrow({ redo }: { redo?: boolean }) {
  return (
    <svg className="decor-arrow" viewBox="0 0 24 24" aria-hidden="true" style={redo ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Buy mode's top bar: undo / redo, and picking several pieces to move, turn or store together. */
export function DecorBar() {
  const mode = useGame((s) => s.mode);
  const view = useGame((s) => s.view);
  const placing = useGame((s) => !!s.placing);
  const wallMode = useGame((s) => s.wallMode);
  const visiting = useVisit((s) => !!s.current);
  const { selectMode, sel, undo: canUndo, redo: canRedo } = useDecor(useShallow((s) => ({ selectMode: s.selectMode, sel: s.sel, undo: s.undo, redo: s.redo })));
  const on = mode === 'buy' && view === 'home' && !visiting;

  // Keys: undo / redo, turning, putting away.
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        redo();
      } else if (!mod && (k === 'q' || k === 'e')) {
        const step = useDecor.getState().smooth ? 5 : ROT_STEP;
        const delta = k === 'q' ? -step : step;
        const s = useGame.getState();
        if (s.placing) turnPlacing(delta);
        else if (useDecor.getState().sel.length) turnSel(delta);
        else if (s.selectedId) turnItems([s.selectedId], delta);
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        const s = useGame.getState();
        if (s.placing) return;
        if (useDecor.getState().sel.length) storeSel();
        else if (s.selectedId) storeItems([s.selectedId]);
      } else if (e.key === 'Escape' && !useGame.getState().placing && useDecor.getState().sel.length) {
        setSelectMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on]);

  if (!on || wallMode || placing) return null;
  return (
    <div className="decor-top" role="toolbar" aria-label="Decorating tools">
      <button disabled={!canUndo} onClick={undo} aria-label="Undo" title="Undo (Ctrl+Z)"><TurnArrow /><span>Undo</span></button>
      <button disabled={!canRedo} onClick={redo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><TurnArrow redo /><span>Redo</span></button>
      <button className={selectMode ? 'on' : ''} aria-pressed={selectMode} onClick={() => setSelectMode(!selectMode)} title="Pick several (or hold a piece, or shift-click)">
        ☑<span>{selectMode ? 'Picking' : 'Select'}</span>
      </button>
      {sel.length > 0 && (
        <>
          <span className="decor-count">{sel.length} picked</span>
          <button onClick={moveSel} title="Move them together">✋<span>Move</span></button>
          <button onClick={() => turnSel(90)} title="Turn them together">⟳<span>Turn</span></button>
          <button onClick={storeSel} title="Put them in storage">📦<span>Store</span></button>
          <button onClick={() => setSelectMode(false)} aria-label="Clear picks">✕</button>
        </>
      )}
      {selectMode && !sel.length && <span className="decor-count">Tap pieces to pick them</span>}
    </div>
  );
}
