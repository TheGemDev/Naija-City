// While you drive: speed, passenger and fare, the Durbar timer, controls (keyboard and touch), and the
// police checkpoint showdown (game/drive.ts).

import { useEffect, useState, type PointerEvent } from 'react';
import { DURBAR_SECONDS, durbarGates, enterNearby, resolveCheckpoint, stopDrive, useDrive, vehicleSpec } from '../game/drive';
import { driveState } from '../game/driveState';
import { sceneById } from '../game/roadScenes';
import { placeHere } from '../game/city';
import { naira, useGame } from '../game/store';
import { usePolice } from '../net/crime';
import { roadEvent } from '../game/live';
import { isHighNow } from '../game/vice';

const KEYS: Record<string, keyof typeof driveState.keys> = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};

function useDriveKeys(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const typing = (e: KeyboardEvent) => ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName);
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const k = KEYS[e.key];
      if (k) {
        driveState.keys[k] = true;
        e.preventDefault();
      } else if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') enterNearby();
      else if (e.key === ' ') {
        driveState.keys.down = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.key];
      if (k) driveState.keys[k] = false;
      if (e.key === ' ') driveState.keys.down = false;
    };
    const blur = () => (driveState.keys = { up: false, down: false, left: false, right: false });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      blur();
    };
  }, [on]);
}

const ARROWS: Record<keyof typeof driveState.keys, string> = {
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
};

/** A press-and-hold touch button for one control. */
function Pad({ k, caption, className }: { k: keyof typeof driveState.keys; caption?: string; className?: string }) {
  const set = (v: boolean) => (e: PointerEvent) => {
    e.preventDefault();
    driveState.keys[k] = v;
  };
  return (
    <button
      className={`drive-pad ${className ?? ''}`}
      onPointerDown={set(true)}
      onPointerUp={set(false)}
      onPointerLeave={set(false)}
      onPointerCancel={set(false)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={k}
    >
      <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ARROWS[k]} />
      </svg>
      {caption && <small>{caption}</small>}
    </button>
  );
}

function useNow(ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function Checkpoint() {
  const stop = useDrive((s) => s.checkpoint);
  const money = useGame((s) => s.money);
  const funding = usePolice((s) => s.laws.policeFunding);
  if (!stop) return null;
  const scene = sceneById(stop.scene);
  return (
    <div className="story-overlay">
      <section className="story-card checkpoint-card" role="dialog" aria-modal="true" aria-labelledby="checkpoint-title">
        <span className="story-icon">{scene.icon}</span>
        <small>{scene.tag} · {stop.road.toUpperCase()}</small>
        <h2 id="checkpoint-title">“{stop.line}”</h2>
        <p>{scene.body}</p>
        <div className="story-choices">
          {scene.choices.map((c, i) => (
            <button key={i} disabled={!!c.cost && money < c.cost(stop.ask)} onClick={() => resolveCheckpoint(i, funding)}>{c.label(stop.ask)}</button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function DriveHud() {
  const vehicle = useDrive((s) => s.vehicle);
  const gig = useDrive((s) => s.gig);
  const passenger = useDrive((s) => s.passenger);
  const trips = useDrive((s) => s.trips);
  const earned = useDrive((s) => s.earned);
  const near = useDrive((s) => s.near);
  const speed = useDrive((s) => s.speed);
  const durbar = useDrive((s) => s.durbar);
  const blocked = useGame((s) => !!s.roadBlockUntil && s.roadBlockUntil > Date.now());
  const now = useNow();
  useDriveKeys(!!vehicle);
  // Driving owns the screen: the bottom nav and need bars step aside (styles.css, body.driving).
  useEffect(() => {
    if (!vehicle) return;
    document.body.classList.add('driving');
    return () => document.body.classList.remove('driving');
  }, [vehicle]);
  if (!vehicle) return null;
  const spec = vehicleSpec(vehicle);
  const left = passenger?.deadline ? Math.ceil((passenger.deadline - now) / 1000) : null;
  const durbarLeft = durbar ? Math.max(0, Math.ceil(DURBAR_SECONDS - (now - durbar.startedAt) / 1000)) : 0;
  return (
    <>
      <div className="drive-hud">
        <div className="drive-top">
          <span className="drive-icon">{spec.icon}</span>
          <span className="drive-speed"><b>{speed}</b><small>km/h</small></span>
          {gig && (
            <span className="drive-stats">
              <b>{trips} {gig === 'dispatch' ? 'drops' : 'trips'}</b>
              <small>{naira(earned)} today</small>
            </span>
          )}
          <button className="btn sm danger" onClick={() => stopDrive()}>✕ Exit</button>
        </div>
        {gig && (
          <div className={`drive-job ${left !== null && left < 0 ? 'late' : ''}`}>
            {!passenger
              ? gig === 'dispatch' ? '📲 Waiting for the next order…' : '🔎 Cruise around: a passenger will flag you down…'
              : !passenger.boarded
                ? passenger.order
                  ? `🥡 Collect ${passenger.order.item} at ${passenger.order.fromName} (yellow beam) · ${naira(passenger.fare)}`
                  : `🙋🏾 ${passenger.name} is waving (yellow beam). Pull up next to them.`
                : `${passenger.order ? '📦' : '📍'} ${passenger.toName} · ${naira(passenger.fare)}${left !== null ? ` · ${left > 0 ? `${left}s` : passenger.order ? 'LATE: half pay' : 'LATE: half fare'}` : ''}`}
          </div>
        )}
        {durbar && (
          <div className="drive-job">
            🐎 Durbar gate {Math.min(durbar.gate + 1, durbarGates().length)}/{durbarGates().length} · {durbarLeft}s left. Ride through the glowing rings!
          </div>
        )}
        {(() => {
          const road = roadEvent(now);
          return road.active ? <div className="drive-job">{road.def.icon} {road.def.title}: {road.def.blurb}</div> : null;
        })()}
        {driveState.stall > 0 && <div className="drive-job late">🛞 Stuck at the roadside… {Math.ceil(driveState.stall)}s</div>}
        {isHighNow(now) && <div className="drive-job late">😵‍💫 You are high. The road is swaying and the police can smell it. Park up!</div>}
        {blocked && <div className="drive-job late">🚧 The governor’s “road project” is on your street. Everything is slow.</div>}
        {near && (
          <button className="btn go drive-enter" onClick={enterNearby}>
            🚪 Go into {placeHere(near)?.name ?? 'here'} <small>(E)</small>
          </button>
        )}
      </div>
      <div className="drive-controls">
        <div className="drive-steer">
          <Pad k="left" className="steer" />
          <Pad k="right" className="steer" />
        </div>
        <div className="drive-pedals">
          <Pad k="down" caption="BRAKE" className="brake" />
          <Pad k="up" caption="GO" className="gas" />
        </div>
      </div>
      <Checkpoint />
    </>
  );
}
