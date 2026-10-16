// The HUD's word from your children (Phone → Adopt): a chip while one of them needs something, which starts the right
// care when you are at home and opens the Adopt app when you are not; and a little card when one of them does
// something new (first word, first steps, a birthday). Mounting this also starts watching the children (src/net/kids.ts).

import { useEffect, useState } from 'react';
import { inOwnHouse, useGame } from '../game/store';
import { kidAlert, milestoneText, stageOf } from '../game/kids';
import { atHome, liveSnap, seeMilestone, serverNow, startCare, useKids, watchKids } from '../net/kids';
import { useSession } from '../net/session';
import { Emoji } from './Icons';
import './adopt.css';

export function KidChip() {
  const signedIn = !!useSession((s) => s.user?.uid);
  useEffect(() => (signedIn ? watchKids() : undefined), [signedIn]);
  const kids = useKids((s) => s.kids);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!kids.length) return;
    const id = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, [kids.length]);
  const busy = useGame((s) => !!s.task && s.task.actionId.startsWith('kid_'));
  if (!kids.length) return null;
  const now = serverNow();
  const taken = kids.find((k) => k.status === 'taken');
  const alerts = atHome(useKids.getState())
    .map((k) => ({ k, a: kidAlert(k.name, k.sex, stageOf(k.bornAt, now), liveSnap(k, now)) }))
    .filter((x): x is { k: (typeof kids)[number]; a: NonNullable<typeof x.a> } => !!x.a)
    .sort((x, y) => Number(y.a.urgent) - Number(x.a.urgent));
  const moment = kids.flatMap((k) => k.milestones.filter((m) => !m.seen).map((m) => ({ k, m })))[0];
  const ready = kids.find((k) => k.status === 'pending' && k.readyAt <= now);
  const open = () => useGame.setState({ panel: 'phone', openApp: 'adopt' });
  return (
    <>
      {taken ? (
        <div className="kid-chip urgent">
          <button className="kid-chip-go" onClick={open}>
            <span className="kid-chip-ico"><Emoji char="🏛️" size={20} /></span>
            <span><b>Social Welfare has {taken.name}</b><small>Tap to get {taken.sex === 'f' ? 'her' : 'him'} back</small></span>
          </button>
        </div>
      ) : ready ? (
        <div className="kid-chip">
          <button className="kid-chip-go" onClick={open}>
            <span className="kid-chip-ico"><Emoji char="📝" size={20} /></span>
            <span><b>{ready.name}'s papers are ready</b><small>Tap to bring {ready.sex === 'f' ? 'her' : 'him'} home</small></span>
          </button>
        </div>
      ) : alerts.length > 0 && !busy ? (
        <div className={`kid-chip ${alerts[0].a.urgent ? 'urgent' : ''}`}>
          <button
            className="kid-chip-go"
            onClick={() => (inOwnHouse(useGame.getState()) ? startCare(alerts[0].a.care) : open())}
            aria-label={`${alerts[0].a.title}. ${alerts[0].a.body}`}
          >
            <span className="kid-chip-ico">
              <Emoji char={alerts[0].a.care === 'feed' ? '🍼' : alerts[0].a.care === 'clinic' ? '🤒' : alerts[0].a.care === 'sleep' ? '😴' : alerts[0].a.care === 'play' ? '🧸' : '🧷'} size={20} />
              {alerts.length > 1 && <i>{alerts.length}</i>}
            </span>
            <span>
              <b>{alerts[0].a.title.replace(/^👶🏾 /, '')}</b>
              <small>{inOwnHouse(useGame.getState()) ? 'Tap to take care of it' : 'You are away · tap to see'}</small>
            </span>
          </button>
        </div>
      ) : null}
      {moment && (
        <div className="kid-moment" role="status">
          <span><Emoji char={milestoneText(moment.m.id, moment.k.name, moment.k.sex).icon} size={18} /> {milestoneText(moment.m.id, moment.k.name, moment.k.sex).text}</span>
          <div>
            <button className="btn sm go" onClick={() => void seeMilestone(moment.k.id, moment.m.id, true)}>🐦 Share</button>
            <button className="btn sm" onClick={() => void seeMilestone(moment.k.id, moment.m.id, false)}>Aww 🥹</button>
          </div>
        </div>
      )}
    </>
  );
}
