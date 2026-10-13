import { useRef, useState } from 'react';
import { create } from 'zustand';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { activeDesignOf, dayOf, moodOf, naira, netWorthOf, useGame } from '../game/store';
import { JOBS, NEEDS } from '../game/catalog';
import { homeTransform, originOf } from '../game/origins';
import { houseLayoutForDesign } from '../game/grid';
import { useSession } from '../net/session';
import { unreadCount, useSocial } from '../net/social';
import { Emoji } from './Icons';
import { World } from '../three/World';
import { Items } from '../three/Items';
import { needColor, ProfilePortrait } from './Hud';
import { audio } from '../game/audio';

/** Shown once each time the game opens, before dropping into the world. */
export const useTitle = create<{ open: boolean; close(): void }>((set) => ({
  open: true,
  close: () => set({ open: false }),
}));

/** Which build this is, written into the page by the build (see vite.config.ts). */
const buildVersion = document.querySelector<HTMLMetaElement>('meta[name="kaduna-version"]')?.content;

function SpinningHouse() {
  const spin = useRef<Group>(null!);
  const origin = useGame((s) => s.origin);
  const items = useGame((s) => s.items);
  const design = useGame(activeDesignOf);
  const t = homeTransform(origin, design);
  // Centre of this house's own grid, the point it spins around.
  const layout = houseLayoutForDesign(design);
  useFrame((_, dt) => {
    spin.current.rotation.y += dt * 0.25;
  });
  return (
    <group ref={spin}>
      <group position={[t.x - (layout.gridW * t.scale) / 2, 0, t.z - (layout.gridH * t.scale) / 2]} scale={[t.scale, 1, t.scale]}>
        <World readOnly origin={origin} design={design} />
        <Items items={items} readOnly />
      </group>
    </group>
  );
}

/** The spinning house on the sky, shared by the title screen and the signed-out landing. */
export function HouseStage({ scale }: { scale: number }) {
  return (
    <div className="title-house">
      <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 20 * scale, 28 * scale], fov: 35 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0)}>
        <hemisphereLight args={['#fff8ec', '#6b5a3a', 1.1]} />
        <directionalLight position={[10, 18, 12]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} />
        <SpinningHouse />
      </Canvas>
    </div>
  );
}

export function TitleScreen() {
  const open = useTitle((s) => s.open);
  const close = useTitle((s) => s.close);
  const user = useSession((s) => s.user);
  const logOut = useSession((s) => s.logOut);
  const started = useGame((s) => s.started);
  const name = useGame((s) => s.name);
  const look = useGame((s) => s.look);
  const origin = useGame((s) => s.origin);
  const worth = useGame((s) => netWorthOf(s));
  const minutes = useGame((s) => s.minutes);
  const needs = useGame((s) => s.needs);
  const jobId = useGame((s) => s.jobId);
  const [confirming, setConfirming] = useState(false);
  if (!open) return null;

  const o = started ? originOf(origin) : null;
  const design = useGame(activeDesignOf);
  // Camera distance follows the size of the house on screen, so a bigger build still fits.
  const starter = houseLayoutForDesign(null);
  const layout = houseLayoutForDesign(design);
  const scale = (homeTransform(origin, design).scale * Math.max(layout.gridW, layout.gridH)) / Math.max(starter.gridW, starter.gridH);
  const job = JOBS.find((j) => j.id === jobId);
  const mood = moodOf(needs);
  // Same colour as the ring round the avatar in the game: the state of your lowest need.
  const stateColor = needColor(Math.min(...NEEDS.map((n) => needs[n.key])));
  const display = name || user?.name || 'Player';
  const unread = useSocial(unreadCount);

  const newLife = () => {
    audio.enterGame();
    close();
    // A life in progress ends properly (hall of fame + summary); the summary then starts the new one.
    if (started) useGame.getState().endLife();
  };

  return (
    <div className="title-screen">
      <div className="title-top">
        <div className="logo">
          Naija<span>City</span>
        </div>
        {started && (
          <div className="title-meta">
            <span className="title-day">Day {dayOf(minutes)}</span>
            {/* Messages waiting for you: tapping goes straight in with the phone out. */}
            <button
              type="button"
              className="title-day title-msgs"
              aria-label={unread ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'Messages'}
              title={unread ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'Messages'}
              onClick={() => {
                audio.enterGame();
                close();
                useGame.getState().setPanel('phone');
              }}
            >
              <Emoji char="💬" size={15} />
              {unread > 0 && <i>{unread > 99 ? '99+' : unread}</i>}
            </button>
          </div>
        )}
      </div>

      <HouseStage scale={scale} />

      <div className="title-sheet">
        {started ? (
          <div className="title-card" style={{ ['--accent' as string]: stateColor }}>
            <div className="title-card-head">
              <span className="title-avatar">
                <ProfilePortrait look={look} />
              </span>
              <div>
                <b>
                  <span className="title-name">{display}</span>
                  {o && <span className="title-origin">{o.label}</span>}
                </b>
                {user?.username && <small>@{user.username}</small>}
              </div>
            </div>
            <div className="title-stats">
              <div><small>Net worth</small><b>{naira(worth)}</b></div>
              <div><small>{job ? 'Working as' : 'Mood'}</small><b>{job ? `${job.icon} ${job.title}` : `${mood.emoji} ${mood.label}`}</b></div>
            </div>
          </div>
        ) : (
          <div className="title-card title-welcome">
            <b>Ready when you are{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.</b>
            <small>Pick where your story starts. Your house and money are waiting for you.</small>
          </div>
        )}

        {confirming ? (
          <div className="title-confirm">
            <p>End {display}’s life and start again? Your hall of fame stays.</p>
            <div className="row-btns">
              <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn danger" onClick={newLife}>Yes, born again</button>
            </div>
          </div>
        ) : (
          <div className="title-btns">
            {started && (
              <button className="btn big go" onClick={() => { audio.enterGame(); close(); }}>
                Continue
              </button>
            )}
            <button className={`btn big ${started ? 'alt' : 'go'}`} onClick={() => (started ? setConfirming(true) : newLife())}>
              {started ? 'Born again' : 'Begin your life'}
            </button>
          </div>
        )}

        <div className="title-who">
          <span>{user?.email ?? user?.name ?? 'Signed in'}</span>
          <button type="button" onClick={() => void logOut()}>Sign out</button>
        </div>
        {buildVersion && <small className="title-version">{buildVersion}</small>}
      </div>
    </div>
  );
}
