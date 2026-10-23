import { useEffect, useState, type ReactNode } from 'react';
import { FORMATS, FORMAT_BY_ID, LIGHTS, POSES, shotsFor, usePhoto } from '../game/photo';
import { useDrive } from '../game/drive';
import { flightOf, useGame, type GameState } from '../game/store';
import { useVisit } from '../game/visits';
import { useNet } from '../net/multiplayer';
import { sfx } from '../game/sfx';
import { Emoji } from './Icons';
import { PhotoEditor, snapInfo } from './PhotoEditor';
import { LENSES, LENS_BY_ID, lensFilter, lensVeil } from './photoCompose';
import { useSnaps } from '../net/snaps';
import './photo.css';
import './snap.css';

/** Free to stand and pose: not locked up, not rearranging furniture, and nothing on the street demanding an answer. */
const freeToPose = (s: GameState) => s.mode === 'live' && !s.jailedUntil && !s.heldUntil && !s.streetStory && !s.lifeSummary;

/** The camera works anywhere you can stand still: at home, on a visit, in town, inside a place. Not at the wheel. */
export function usePhotoAllowed() {
  const free = useGame(freeToPose);
  const driving = useDrive((s) => !!s.vehicle);
  // The connection notice is part of what photo mode hides, so it only runs while connected.
  const connected = useNet((s) => s.connected);
  return free && !driving && connected;
}

/** Puts the phone away and raises the camera, or says why it can't come out right now. */
export function openCamera(forSnap = false) {
  const g = useGame.getState();
  if (useDrive.getState().vehicle) return g.toast('📷 Park first. No selfies at the wheel.');
  if (!freeToPose(g) || !useNet.getState().connected) return g.toast("📷 You can't take pictures right now.");
  g.select(null);
  g.setPanel(null);
  sfx.play('open');
  usePhoto.getState().open(forSnap);
}

/** The Snap app's capture button: the same camera, but the picture taken is posted to Snap. `to`: friends it is for. */
export const openSnapCamera = (to: string[] = []) => {
  openCamera(true);
  if (to.length) usePhoto.setState({ sendTo: to });
};

/** From the Snap camera to the app on the phone (its ✕ button). */
function goSnap() {
  usePhoto.getState().close();
  useSnaps.setState({ tab: 'spotlight' });
  useGame.setState({ openApp: 'flex' });
  useGame.getState().setPanel('phone');
}

type Tab = 'shot' | 'pose' | 'light' | 'format' | 'lens';
const TABS: { id: Tab; label: string }[] = [
  { id: 'shot', label: 'Angle' },
  { id: 'pose', label: 'Pose' },
  { id: 'light', label: 'Light' },
  { id: 'format', label: 'Size' },
  { id: 'lens', label: 'Filter' },
];
/** The Snap camera's tool rail down the right edge (the lenses have their own carousel by the shutter). */
const TOOL_ICONS: Record<Exclude<Tab, 'lens'>, ReactNode> = {
  shot: <><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /></>,
  pose: <><circle cx="12" cy="5" r="2" /><path d="M12 7v6M7 10l5 1 5-1M9 21l3-8 3 8" /></>,
  light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  format: <><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></>,
};

export function PhotoMode() {
  const active = usePhoto((s) => s.active);
  const shot = usePhoto((s) => s.shot);
  const pose = usePhoto((s) => s.pose);
  const light = usePhoto((s) => s.light);
  const format = usePhoto((s) => s.format);
  const hideMe = usePhoto((s) => s.hideMe);
  const shutter = usePhoto((s) => s.shutter);
  const result = usePhoto((s) => s.result);
  const allowed = usePhotoAllowed();
  const panel = useGame((s) => s.panel);
  const teleportId = useGame((s) => s.teleportId);
  const atHouse = useGame((s) => s.view === 'home');
  const visiting = useVisit((s) => !!s.current);
  const flying = useGame((s) => !!flightOf(s));
  const shots = shotsFor(atHouse || visiting, flying);
  const forSnap = usePhoto((s) => s.forSnap);
  const lens = usePhoto((s) => s.lens);
  const [tab, setTab] = useState<Tab>('shot');
  /** The Snap camera's open tool, if any: its choices show above the lenses. */
  const [tool, setTool] = useState<Tab | null>(null);

  // Anything that stops me posing, or opens a screen over the scene, closes the camera. A picture already
  // taken is safe, though: the plane landing while I am still dressing it up must not throw it away.
  useEffect(() => {
    if (active && !result && (!allowed || panel)) usePhoto.getState().close();
  }, [active, allowed, panel, result]);
  // So does going somewhere else: the shot was framed for where I was standing.
  useEffect(() => () => {
    if (!usePhoto.getState().result) usePhoto.getState().close();
  }, [teleportId, visiting]);
  useEffect(() => {
    if (active) setTab('shot');
    if (active) setTool(null);
  }, [active, forSnap]);
  // The lens shows live on the scene itself while framing; the editor bakes it into the picture.
  useEffect(() => {
    const el = document.querySelector<HTMLCanvasElement>('.scene-wrap canvas');
    if (!el || !active || result) return;
    el.style.filter = lensFilter(LENS_BY_ID[lens] ?? LENSES[0]);
    return () => {
      el.style.filter = '';
    };
  }, [active, result, lens]);
  // The rest of the game's interface is hidden while the camera is up (see photo.css).
  useEffect(() => {
    document.body.classList.toggle('photo-mode', active);
    return () => document.body.classList.remove('photo-mode');
  }, [active]);

  if (!active) return null;
  const set = usePhoto.setState;
  return (
    <div className="photo-ui">
      {/* A new key each time replays the flash. */}
      {shutter > 0 && <div key={shutter} className="photo-flash" />}
      {result ? (
        <PhotoEditor result={result} />
      ) : (
        <>
          {/* What will be in the picture: everything outside this box is left out. */}
          <div className={`photo-guide ${format === 'screen' ? 'full' : ''}`} aria-hidden>
            <i style={{ ['--shape' as string]: FORMAT_BY_ID[format].w / FORMAT_BY_ID[format].h, background: lensVeil(LENS_BY_ID[lens] ?? LENSES[0]) }} />
          </div>
          <div className="photo-top">
            {/* In Snap, closing the camera shows the app itself; anywhere else it goes back to the game. */}
            <button type="button" className="photo-round" aria-label={forSnap ? 'Close the camera and open Snap' : 'Close photo mode'} title={forSnap ? 'Close camera' : 'Close'} onClick={() => (forSnap ? goSnap() : usePhoto.getState().close())}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            {forSnap ? <SnapWhere /> : <span className="photo-hint">Drag to turn · pinch to zoom</span>}
            <button type="button" className={`photo-pill ${hideMe ? 'on' : ''}`} aria-pressed={hideMe} onClick={() => set({ hideMe: !hideMe })}>
              {hideMe ? 'Just the view' : 'With me'}
            </button>
          </div>
          {forSnap && (
            <div className="snap-cam-rail" role="group" aria-label="Camera tools">
              {(Object.keys(TOOL_ICONS) as Exclude<Tab, 'lens'>[]).map((id) => (
                <button key={id} type="button" aria-pressed={tool === id} className={tool === id ? 'on' : ''} onClick={() => setTool(tool === id ? null : id)}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{TOOL_ICONS[id]}</svg>
                  <small>{TABS.find((t) => t.id === id)!.label}</small>
                </button>
              ))}
            </div>
          )}
          <div className={`photo-bottom ${forSnap ? 'snap-cam-bottom' : ''}`}>
            {!forSnap && (
              <div className="photo-tabs" role="tablist">
                {TABS.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {(forSnap ? tool : tab) && (
              <div className="photo-chips">
                {(forSnap ? tool : tab) === 'shot' && shots.map((s) => (
                  <button key={s.id} type="button" className={shot === s.id ? 'on' : ''} onClick={() => set({ shot: s.id })}>{s.label}</button>
                ))}
                {(forSnap ? tool : tab) === 'pose' && POSES.map((p) => (
                  <button key={p.id} type="button" className={pose === p.id ? 'on' : ''} onClick={() => set({ pose: p.id, hideMe: false })}>{p.label}</button>
                ))}
                {(forSnap ? tool : tab) === 'light' && LIGHTS.map((l) => (
                  <button key={l.id} type="button" className={light === l.id ? 'on' : ''} onClick={() => set({ light: l.id })}>{l.label}</button>
                ))}
                {(forSnap ? tool : tab) === 'format' && FORMATS.map((f) => (
                  <button key={f.id} type="button" className={format === f.id ? 'on' : ''} onClick={() => set({ format: f.id })}>{f.label}</button>
                ))}
                {!forSnap && tab === 'lens' && LENSES.map((l) => (
                  <button key={l.id} type="button" className={lens === l.id ? 'on' : ''} onClick={() => set({ lens: l.id })}>{l.label}</button>
                ))}
              </div>
            )}
            {forSnap && (
              <>
                <b className="snap-lens-name" key={lens}>{(LENS_BY_ID[lens] ?? LENSES[0]).label}</b>
                <div className="snap-lenses" role="group" aria-label="Filters">
                  {LENSES.map((l) => (
                    <button key={l.id} type="button" aria-label={l.label} aria-pressed={lens === l.id} className={lens === l.id ? 'on' : ''} onClick={() => set({ lens: l.id })}>
                      <i style={{ filter: lensFilter(l) }} />
                      <i style={{ background: lensVeil(l) }} />
                      <Emoji char={l.icon} size={20} />
                    </button>
                  ))}
                </div>
              </>
            )}
            <button type="button" className={`photo-shutter ${forSnap ? 'snap-shutter' : ''}`} aria-label="Take photo" onClick={() => usePhoto.getState().snap()}>
              <i />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Where the snap is being taken and what the sky is doing, in the Snap camera's top bar. */
function SnapWhere() {
  const minutes = useGame((s) => Math.floor(s.minutes / 10));
  const info = snapInfo();
  void minutes;
  return (
    <span className="snap-where">
      <Emoji char="📍" size={13} /> {info.city} · <Emoji char={info.icon} size={13} /> {info.temp}°
    </span>
  );
}
