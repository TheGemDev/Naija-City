import { useEffect, useState } from 'react';
import { FORMATS, FORMAT_BY_ID, LIGHTS, POSES, shotsFor, usePhoto } from '../game/photo';
import { useDrive } from '../game/drive';
import { flightOf, useGame, type GameState } from '../game/store';
import { useVisit } from '../game/visits';
import { useNet } from '../net/multiplayer';
import { sfx } from '../game/sfx';
import { Emoji } from './Icons';
import { PhotoEditor } from './PhotoEditor';
import './photo.css';

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

/** The Snap app's capture button: the same camera, but the picture taken is posted to Snap. */
export const openSnapCamera = () => openCamera(true);

/** The HUD button that opens the camera: the same pill as the low power switch it sits beside. */
export function PhotoButton() {
  const allowed = usePhotoAllowed();
  if (!allowed) return null;
  return (
    <button className="stack-collapse" type="button" title="Camera" aria-label="Camera" onClick={() => openCamera()}>
      <Emoji char="📷" size={16} />
    </button>
  );
}

type Tab = 'shot' | 'pose' | 'light' | 'format';
const TABS: { id: Tab; label: string }[] = [
  { id: 'shot', label: 'Angle' },
  { id: 'pose', label: 'Pose' },
  { id: 'light', label: 'Light' },
  { id: 'format', label: 'Size' },
];

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
  const [tab, setTab] = useState<Tab>('shot');

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
  }, [active]);
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
          <div className="photo-guide" aria-hidden>
            <i style={{ ['--shape' as string]: FORMAT_BY_ID[format].w / FORMAT_BY_ID[format].h }} />
          </div>
          <div className="photo-top">
            <button type="button" className="photo-round" aria-label="Close photo mode" onClick={() => usePhoto.getState().close()}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <span className="photo-hint">Drag to turn · pinch to zoom</span>
            <button type="button" className={`photo-pill ${hideMe ? 'on' : ''}`} aria-pressed={hideMe} onClick={() => set({ hideMe: !hideMe })}>
              {hideMe ? 'Just the view' : 'With me'}
            </button>
          </div>
          <div className="photo-bottom">
            <div className="photo-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="photo-chips">
              {tab === 'shot' && shots.map((s) => (
                <button key={s.id} type="button" className={shot === s.id ? 'on' : ''} onClick={() => set({ shot: s.id })}>{s.label}</button>
              ))}
              {tab === 'pose' && POSES.map((p) => (
                <button key={p.id} type="button" className={pose === p.id ? 'on' : ''} onClick={() => set({ pose: p.id, hideMe: false })}>{p.label}</button>
              ))}
              {tab === 'light' && LIGHTS.map((l) => (
                <button key={l.id} type="button" className={light === l.id ? 'on' : ''} onClick={() => set({ light: l.id })}>{l.label}</button>
              ))}
              {tab === 'format' && FORMATS.map((f) => (
                <button key={f.id} type="button" className={format === f.id ? 'on' : ''} onClick={() => set({ format: f.id })}>{f.label}</button>
              ))}
            </div>
            <button type="button" className="photo-shutter" aria-label="Take photo" onClick={() => usePhoto.getState().snap()}>
              <i />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
