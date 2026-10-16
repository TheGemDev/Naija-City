import { CribBadge } from './CribsApp';
import { PerfSettings } from './PerfSettings';
import { GuideSettings } from './Guide';
import { startGuide } from '../game/guide';
import { ThemeSettings } from './ThemeSettings';
import { useRef, useState } from 'react';
import { NEEDS } from '../game/catalog';
import { JOBS } from '../game/catalog';
import { ACHIEVEMENTS, legacyOf, nextRepTier, repScore, repTier } from '../game/legacy';
import { originOf } from '../game/origins';
import { sfx } from '../game/sfx';
import { hapticsEnabled, hapticsSupported, setHaptics } from '../game/juice';
import { audio } from '../game/audio';
import { dayOf, moodOf, naira, netWorthOf, useGame, useNeeds } from '../game/store';
import { legacyInput } from '../net/live';
import { shareLink, userLink } from '../net/deeplink';
import { useSession } from '../net/session';
import { Emoji } from './Icons';
import { PersonPreview } from './Closet';
import { PushNotifications, needColor } from './Hud';
import { OpenSourceSettings } from './OpenSource';
import { LinkAccount } from './Auth';
import { useKids } from '../net/kids';

type Tab = 'profile' | 'stats' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: '✏️ Profile' },
  { id: 'stats', label: '📊 Stats' },
  { id: 'settings', label: '⚙️ Settings' },
];

/** Tap your avatar badge: who you are, how you are doing, and the game settings. */
export function ProfileSheet() {
  const open = useGame((s) => s.panel === 'profile');
  const tab = useGame((s) => s.profileTab);
  const setTab = (t: Tab) => useGame.setState({ profileTab: t });
  if (!open) return null;
  return (
    <div className="sheet profile-sheet" role="dialog" aria-label="Your profile">
      <div className="sheet-sticky">
        <div className="sheet-head">
          <h3>{tab === 'profile' ? 'Your profile' : tab === 'stats' ? 'Your stats' : 'Settings'}</h3>
          <button className="ghost-btn" onClick={() => useGame.getState().setPanel(null)}>
            Done
          </button>
        </div>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'profile' && <ProfileTab />}
      {tab === 'stats' && <StatsTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

function ProfileTab() {
  const name = useGame((s) => s.name);
  const look = useGame((s) => s.look);
  const origin = useGame((s) => originOf(s.origin));
  const user = useSession((s) => s.user);
  const mood = moodOf(useNeeds());
  // Children you adopted (Phone → Adopt) who are at home: they show on your profile for everyone.
  const kids = useKids((s) => s.kids).filter((k) => k.status === 'home');
  return (
    <div className="profile-tab">
      <div className="profile-stage">
        <PersonPreview look={look} height={280} camZ={3.2} y={-0.95} />
        <button className="btn sm profile-outfit" onClick={() => useGame.getState().setPanel('closet')}>
          👗 Change outfit
        </button>
      </div>
      <div className="profile-id">
        <b>{name || 'You'}</b>
        <span style={{ color: mood.color }}>
          <Emoji char={mood.emoji} size={14} /> {mood.label}
        </span>
        <span>
          {origin.emoji} {origin.label}
        </span>
      </div>
      <div className="list-card">
        <div className="profile-row">
          <span>
            <small>Username</small>
            <b>{user?.username ? `@${user.username}` : 'Not set'}</b>
          </span>
        </div>
        <div className="profile-row">
          <span>
            <small>Email</small>
            <b>{maskEmail(user?.email)}</b>
          </span>
        </div>
        {kids.length > 0 && (
          <div className="profile-row">
            <span>
              <small>Children</small>
              <b>👶🏾 {kids.map((k) => k.name).join(', ')}</b>
            </span>
          </div>
        )}
      </div>
      {user?.username && (
        <div className="profile-invite">
          <span>
            <b>🔗 Share my profile</b>
            <small>Anyone with your link can find you and visit your house.</small>
          </span>
          <button className="btn sm" onClick={() => void shareLink(userLink(user.username!), `@${user.username} on Naija City`)}>
            Share link
          </button>
        </div>
      )}
    </div>
  );
}

function maskEmail(email?: string | null) {
  if (!email) return 'Not set';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain ?? ''}`;
}

function StatsTab() {
  const needs = useNeeds();
  const s = useGame();
  const input = legacyInput();
  const rep = repScore(input);
  const tier = repTier(rep);
  const next = nextRepTier(rep);
  const legacy = legacyOf(input);
  const job = JOBS.find((j) => j.id === s.jobId);
  const houses = s.properties.filter((p) => p.stage >= 1).length;
  const unlocked = ACHIEVEMENTS.filter((a) => s.achievements.includes(a.id));
  const rows: [string, string, string][] = [
    ['💰', 'Cash', naira(s.money)],
    ['🏦', 'Net worth', naira(netWorthOf(s))],
    ['📅', 'Day', String(dayOf(s.minutes))],
    ['💼', 'Job', job ? job.title : 'Jobless'],
    ['🛠️', 'Days worked', String(s.workDays)],
    ['📚', 'Knowledge', s.knowledge.toFixed(1)],
    ['🏠', 'Properties', String(houses)],
    ['🚗', 'Cars', String(s.ownedCars.length)],
    ['😇', 'Good deeds', String(s.goodDeeds)],
    ['😈', 'Notoriety', String(s.notoriety)],
  ];
  return (
    <div className="profile-tab">
      <h4>Needs</h4>
      <div className="list-card">
        {NEEDS.map((n) => {
          const v = Math.max(0, Math.min(100, needs[n.key]));
          return (
            <div key={n.key} className={`need-row ${v < 20 ? 'low' : ''}`}>
              <Emoji char={n.icon} size={18} />
              <span>{n.label}</span>
              <div className="need-bar">
                <i style={{ width: `${v}%`, background: needColor(v) }} />
              </div>
              <em>{Math.round(v)}</em>
            </div>
          );
        })}
      </div>
      <h4>Reputation</h4>
      <div className="list-card profile-rep">
        <span className="profile-rep-ico">
          <Emoji char={tier.icon} size={28} />
        </span>
        <span>
          <b>{tier.title}</b>
          <small>
            {rep} rep{next ? ` · ${next.min - rep} to ${next.title}` : ' · top tier'}
          </small>
        </span>
        <span className="profile-rep-legacy">
          <b>{legacy.total.toLocaleString()}</b>
          <small>
            {legacy.icon} {legacy.title}
          </small>
        </span>
      </div>
      <CribBadge />
      <h4>Life</h4>
      <div className="list-card">
        {rows.map(([ico, label, value]) => (
          <div key={label} className="profile-row">
            <span>
              <Emoji char={ico} size={16} /> {label}
            </span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <h4>
        Achievements · {unlocked.length}/{ACHIEVEMENTS.length}
      </h4>
      <div className="profile-badges">
        {ACHIEVEMENTS.map((a) => {
          const got = s.achievements.includes(a.id);
          return (
            <span key={a.id} className={got ? 'got' : ''} title={`${a.title}: ${a.desc}`}>
              <Emoji char={got ? a.icon : '🔒'} size={22} />
              <small>{a.title}</small>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({ title, sub, checked, onChange }: { title: string; sub: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="settings-option">
      <span>
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <input type="checkbox" role="switch" aria-label={title} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function SettingsTab() {
  const signedIn = useSession((s) => !!s.user);
  const [music, setMusic] = useState(() => audio.musicOn);
  const [fx, setFx] = useState(() => sfx.enabled);
  const [buzz, setBuzz] = useState(() => hapticsEnabled());
  const [sure, setSure] = useState(false);
  const enableRef = useRef<(() => void) | null>(null);
  return (
    <div className="profile-tab">
      <h4>Sound</h4>
      <div className="list-card">
        <Toggle title="Music" sub={music ? 'On' : 'Off'} checked={music} onChange={() => setMusic(audio.toggleMusic())} />
        <Toggle title="Sound effects" sub={fx ? 'On' : 'Off'} checked={fx} onChange={(v) => (setFx(v), sfx.setEnabled(v))} />
        {hapticsSupported() && <Toggle title="Vibration" sub={buzz ? 'On' : 'Off'} checked={buzz} onChange={(v) => (setBuzz(v), setHaptics(v))} />}
      </div>
      <h4>Visuals</h4>
      <div className="list-card">
        <ThemeSettings />
        <PerfSettings />
      </div>
      <h4>Help</h4>
      <div className="list-card">
        <GuideSettings onPlay={() => (useGame.getState().setPanel(null), startGuide())} />
      </div>
      <OpenSourceSettings />
      <h4>Notifications</h4>
      <PushNotifications onPermissionChange={() => {}} enableRef={enableRef} />
      <LinkAccount />
      <h4>Account</h4>
      <div className="row-btns">
        {signedIn && (
          <button className="btn" onClick={() => void useSession.getState().logOut()}>
            Log out
          </button>
        )}
        {sure ? (
          <>
            <button className="btn danger" onClick={() => useGame.getState().endLife()}>
              Yes, start over
            </button>
            <button className="btn" onClick={() => setSure(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn danger" onClick={() => setSure(true)}>
            Born again
          </button>
        )}
      </div>
    </div>
  );
}
