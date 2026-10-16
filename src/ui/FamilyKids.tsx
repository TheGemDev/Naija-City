// The Family app's children tab: a family tree with you (and your spouse, if you are married) over the children you
// adopted (Phone → Adopt), the ones at home and the ones who grew up, were placed elsewhere or belong to a past life.

import { useEffect } from 'react';
import { useGame } from '../game/store';
import { MOOD_FACE, ageLabel, ageYears, moodOfKid, stageDef, stageOf } from '../game/kids';
import { useHangouts } from '../net/hangout';
import { liveSnap, loadKids, serverNow, useKids } from '../net/kids';
import { useSession } from '../net/session';
import { Face } from './Face';
import { Emoji } from './Icons';
import './adopt.css';

export function KidsTab() {
  const user = useSession((s) => s.user);
  const look = useGame((s) => s.look);
  const { kids, past } = useKids();
  const spouse = useHangouts((s) => s.lovers.find((l) => l.status === 'married'));
  useEffect(() => { void loadKids(false); }, []);
  const now = serverNow();
  const open = () => useGame.setState({ openApp: 'adopt' });
  const live = kids.filter((k) => k.status !== 'pending');
  return (
    <>
      <div className="hero hero-rose fam-hero">
        <span className="fam-hero-icon"><Emoji char="👨🏾‍👩🏾‍👧🏾" size={34} /></span>
        <div>
          <small>Family tree</small>
          <b>{live.length ? `${live.length} child${live.length > 1 ? 'ren' : ''}` : 'No children yet'}</b>
          <div className="fam-stats">
            {kids.some((k) => k.status === 'pending') && <span><Emoji char="📝" size={12} /> Papers in progress</span>}
            {past.length > 0 && <span><Emoji char="🕊️" size={12} /> {past.length} grown or gone</span>}
          </div>
        </div>
      </div>
      <div className="fam-tree">
        <div className="fam-tree-parents">
          <div className="fam-tree-node">
            <Face uid={user?.uid} username={user?.username} look={look} size="lg" />
            <span>{user?.username ? `@${user.username}` : 'You'}</span>
          </div>
          {spouse && (
            <div className="fam-tree-node">
              <Face uid={spouse.uid} username={spouse.username} size="lg" />
              <span>@{spouse.username}</span>
              <small>💍 Spouse</small>
            </div>
          )}
        </div>
        {(kids.length > 0 || past.length > 0) && <><div className="fam-tree-stem" /><div className="fam-tree-bar" /></>}
        <div className="fam-tree-kids">
          {kids.map((k) => {
            const stage = stageOf(k.bornAt, now);
            const label = k.status === 'pending' ? 'Coming home' : k.status === 'taken' ? 'With Social Welfare' : `${stageDef(stage).label} · ${ageLabel(ageYears(k.bornAt, now))}`;
            return (
              <button key={k.id} className={`fam-tree-node ${k.status !== 'home' ? 'faded' : ''}`} onClick={open}>
                <Face look={k.look} size="lg" />
                <span>{k.name} {k.status === 'home' && <Emoji char={MOOD_FACE[moodOfKid(liveSnap(k, now))]} size={12} />}</span>
                <small>{label}</small>
              </button>
            );
          })}
          {past.map((p) => (
            <div key={p.id} className="fam-tree-node faded">
              <Face look={p.look} size="lg" />
              <span>{p.name}</span>
              <small>{p.status === 'grown' ? 'Grown up 🎓' : p.status === 'legacy' ? 'Past life 🕊️' : 'Rehomed'}</small>
            </div>
          ))}
        </div>
      </div>
      <button className="fam-propose" onClick={open}><Emoji char="👶🏾" size={18} /> {kids.length ? 'Care for the children' : 'Adopt a child'}</button>
      <small className="fam-note">Children you adopt live in your house and grow a year every real day. Born again? This life's children stay on the tree as a past life.</small>
    </>
  );
}
