// Phone → Adopt: the state's child adoption desk. Browse the children waiting in your state's homes, pass the home
// check, pay the fee, wait out the paperwork and bring them home; then feed, change, bathe, play, put to bed, take to
// the clinic, pay school fees and book a nanny. Rules in src/game/kids.ts, server in worker/kids.ts.

import { useEffect, useState } from 'react';
import { naira, useGame } from '../game/store';
import {
  CARE, CARE_IDS, GROWN_AGE, KIDS, KID_NEEDS, KID_YEAR_MS, MOOD_FACE, STAGE_AGES, ageLabel, ageYears, careLabel, kidAlert, milestoneText, moodOfKid,
  nextStageIn, stageDef, stageOf, type CareId, type KidOffer,
} from '../game/kids';
import { applyFor, bookNanny, careTarget, collectKid, liveSnap, loadKids, paySchool, reclaimKid, seeMilestone, serverNow, startCare, useKids, type Kid } from '../net/kids';
import { useSession } from '../net/session';
import { Face } from './Face';
import { Emoji } from './Icons';
import './adopt.css';

const left = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};
const sexLabel = (sex: 'm' | 'f', years: number) => (years < 13 ? (sex === 'f' ? 'Girl' : 'Boy') : sex === 'f' ? 'Young lady' : 'Young man');

/** Re-render every few seconds so the bars and countdowns move. */
function useTick(ms = 5_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function AdoptApp() {
  const user = useSession((s) => s.user);
  const { kids, loaded } = useKids();
  const [tab, setTab] = useState<'family' | 'waiting'>('family');
  const [picked, setPicked] = useState<KidOffer | null>(null);
  useEffect(() => { void loadKids(false); }, []);
  useEffect(() => { if (loaded && !kids.length) setTab('waiting'); }, [loaded, kids.length]);
  useTick();
  if (!user) {
    return (
      <div className="adopt-empty">
        <Emoji char="👶🏾" size={40} />
        <b>Sign in to adopt</b>
        <small>Children need a parent the government can find. Sign in from Settings → Account.</small>
      </div>
    );
  }
  if (picked) return <OfferDetail offer={picked} onBack={() => setPicked(null)} onDone={() => { setPicked(null); setTab('family'); }} />;
  return (
    <>
      <Hero />
      <div className="tabs" role="group" aria-label="Adopt">
        <button className={tab === 'family' ? 'on' : ''} onClick={() => setTab('family')}><Emoji char="🏠" size={15} /> My family{kids.length ? ` (${kids.length})` : ''}</button>
        <button className={tab === 'waiting' ? 'on' : ''} onClick={() => setTab('waiting')}><Emoji char="🧸" size={15} /> Waiting</button>
      </div>
      {tab === 'waiting' ? <Waiting onPick={setPicked} /> : <Family onBrowse={() => setTab('waiting')} />}
    </>
  );
}

function Hero() {
  return (
    <div className="adopt-hero">
      <div className="adopt-flag" aria-hidden><i /><i /><i /></div>
      <div className="adopt-hero-row">
        <span className="adopt-seal"><Emoji char="👶🏾" size={30} /></span>
        <div>
          <small>State Social Welfare · Child Adoption Desk</small>
          <b>Every child deserves a home</b>
          <small>Approved children's homes in your state. Home check, fee, a little paperwork, then love.</small>
        </div>
      </div>
    </div>
  );
}

/* ---------- Waiting ---------- */

function Waiting({ onPick }: { onPick: (o: KidOffer) => void }) {
  const { offers, eligibility } = useKids();
  return (
    <>
      {eligibility && !eligibility.ok && (
        <div className="adopt-notice">
          <Emoji char="📋" size={18} />
          <span>Before you can apply: {[eligibility.home, eligibility.arrest, eligibility.savings, eligibility.slots].filter((c) => !c.ok).map((c) => c.label).join(' · ')}</span>
        </div>
      )}
      <div className="adopt-grid">
        {offers.map((o) => (
          <button key={o.key} className="adopt-offer" onClick={() => onPick(o)}>
            <Face look={o.look} size="lg" />
            <span className="adopt-offer-info">
              <b>{o.name}</b>
              <small>{sexLabel(o.sex, o.age)} · {ageLabel(o.age)}</small>
              <small className="adopt-home-name">{o.home}</small>
            </span>
            <span className={`adopt-stage s-${stageOf(0, o.age * KID_YEAR_MS)}`}>{stageDef(stageOf(0, o.age * KID_YEAR_MS)).label}</span>
          </button>
        ))}
      </div>
      {!offers.length && <div className="adopt-empty"><Emoji char="🕊️" size={34} /><b>Nobody waiting today</b><small>New children are listed every day.</small></div>}
      <small className="adopt-note">The list changes every day. Fee {naira(KIDS.fee)}, paid to the state's Social Welfare.</small>
    </>
  );
}

function OfferDetail({ offer, onBack, onDone }: { offer: KidOffer; onBack: () => void; onDone: () => void }) {
  const eligibility = useKids((s) => s.eligibility);
  const money = useGame((s) => s.money);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const stage = stageOf(0, offer.age * KID_YEAR_MS);
  const checks = eligibility ? [eligibility.home, eligibility.arrest, eligibility.savings, eligibility.slots] : [];
  const apply = async () => {
    const as = name.trim() || offer.name;
    if (!window.confirm(`Adopt ${as}? The fee is ${naira(KIDS.fee)}, paid now. ${as} will need feeding, nappies, baths, play and sleep, every day.`)) return;
    setBusy(true);
    try { if (await applyFor(offer.key, name.trim() || undefined)) onDone(); } finally { setBusy(false); }
  };
  return (
    <div className="adopt-detail">
      <button className="adopt-back" onClick={onBack}>‹ Back to the list</button>
      <div className="adopt-file">
        <div className="adopt-file-head">
          <Face look={offer.look} size="lg" className="adopt-face-xl" />
          <div>
            <small>Case file · {offer.key.replace(':', '/')}</small>
            <b>{offer.name}</b>
            <span>{sexLabel(offer.sex, offer.age)} · {ageLabel(offer.age)} · {stageDef(stage).label}</span>
          </div>
        </div>
        <p className="adopt-story">“{offer.story}”</p>
        <div className="adopt-row"><Emoji char="🏚️" size={15} /> {offer.home}</div>
      </div>
      <h4>Home check</h4>
      <div className="list-card">
        {checks.map((c, i) => (
          <div key={i} className={`adopt-check ${c.ok ? 'ok' : 'bad'}`}>
            <Emoji char={c.ok ? '✅' : '❌'} size={16} />
            <span>{c.label}</span>
          </div>
        ))}
      </div>
      <h4>Name</h4>
      <input className="text-input" placeholder={`Keep "${offer.name}" or give a new name`} maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="adopt-fees">
        <span>Adoption fee <b>{naira(KIDS.fee)}</b></span>
        <span>Paperwork <b>{Math.round(KIDS.paperworkMs / 60_000)} min</b></span>
      </div>
      <button className="btn go adopt-apply" disabled={busy || !eligibility?.ok || money < KIDS.fee} onClick={() => void apply()}>
        <Emoji char="📝" size={16} /> Apply to adopt · {naira(KIDS.fee)}
      </button>
      <small className="adopt-note">They grow a year every real day: {STAGE_AGES.map((s) => `${s.label.toLowerCase()} from ${s.from < 1 ? `${Math.round(s.from * 12)} mo` : `${s.from} y`}`).join(', ')}. At {GROWN_AGE} they move out.</small>
    </div>
  );
}

/* ---------- My family ---------- */

function Family({ onBrowse }: { onBrowse: () => void }) {
  const { kids, nannyUntil, past } = useKids();
  const now = serverNow();
  return (
    <>
      {kids.map((k) => <KidCard key={k.id} k={k} now={now} />)}
      {!kids.length && (
        <div className="adopt-empty">
          <Emoji char="🏡" size={38} />
          <b>No children yet</b>
          <small>A house is not a home until somebody small is running around it.</small>
          <button className="btn go" onClick={onBrowse}>See who is waiting</button>
        </div>
      )}
      {kids.some((k) => k.status === 'home' || k.status === 'pending') && <Nanny until={nannyUntil} now={now} />}
      {past.length > 0 && (
        <>
          <h4>Grown and gone</h4>
          <div className="list-card">
            {past.map((p) => (
              <div key={p.id} className="tile">
                <Face look={p.look} />
                <span className="tile-info"><b>{p.name}</b><small>{p.status === 'grown' ? 'Grown up and moved out 🎓' : p.status === 'legacy' ? 'Raised in a past life 🕊️' : 'Placed with another family'}</small></span>
              </div>
            ))}
          </div>
        </>
      )}
      <Rules />
    </>
  );
}

function KidCard({ k, now }: { k: Kid; now: number }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const years = ageYears(k.bornAt, now);
  const stage = stageOf(k.bornAt, now);
  if (k.status === 'pending') {
    const ready = k.readyAt <= now;
    return (
      <div className="adopt-card pending">
        <div className="adopt-card-head">
          <Face look={k.look} size="lg" />
          <span className="tile-info"><b>{k.name}</b><small>{ready ? 'Papers signed and stamped' : `Paperwork: ${left(k.readyAt - now)} to go`}</small></span>
          <span className="adopt-stamp">{ready ? 'APPROVED' : 'PROCESSING'}</span>
        </div>
        {ready
          ? <button className="btn go adopt-apply" disabled={busy} onClick={() => run(() => collectKid(k.id))}><Emoji char="🏠" size={16} /> Bring {k.name} home</button>
          : <div className="adopt-progress"><i style={{ width: `${Math.min(100, 100 - ((k.readyAt - now) / KIDS.paperworkMs) * 100)}%` }} /></div>}
      </div>
    );
  }
  if (k.status === 'taken') {
    const until = (k.takenAt ?? now) + KIDS.reclaimMs;
    return (
      <div className="adopt-card taken">
        <div className="adopt-card-head">
          <Face look={k.look} size="lg" />
          <span className="tile-info"><b>{k.name}</b><small>With Social Welfare · {left(until - now)} left to get {k.sex === 'f' ? 'her' : 'him'} back</small></span>
          <Emoji char="🏛️" size={24} />
        </div>
        <p className="adopt-warn">An officer found {k.name} neglected and took {k.sex === 'f' ? 'her' : 'him'} into care. Pay the fine and you are on probation: one warning stands.</p>
        <button className="btn danger adopt-apply" disabled={busy} onClick={() => run(() => reclaimKid(k.id))}><Emoji char="💔" size={16} /> Get {k.name} back · {naira(KIDS.reclaimFine)}</button>
      </div>
    );
  }
  const s = liveSnap(k, now);
  const mood = moodOfKid(s);
  const alert = kidAlert(k.name, k.sex, stage, s);
  const asleep = k.asleepUntil > now;
  const inSchool = k.schoolUntil > now;
  const next = nextStageIn(k.bornAt, now);
  const fresh = k.milestones.filter((m) => !m.seen);
  const recent = [...k.milestones].sort((a, b) => b.at - a.at).slice(0, 3);
  return (
    <div className={`adopt-card ${alert?.urgent || s.sick ? 'urgent' : ''}`}>
      <div className="adopt-card-head">
        <Face look={k.look} size="lg" />
        <span className="tile-info">
          <b>{k.name} <Emoji char={MOOD_FACE[mood]} size={16} /></b>
          <small>{stageDef(stage).label} · {ageLabel(years)} · {next.stage === 'grown' ? 'moves out' : stageDef(next.stage).label.toLowerCase()} in {left(next.ms)}</small>
        </span>
        <span className="adopt-chips">
          {asleep && <span className="adopt-chip">😴 Asleep</span>}
          {inSchool && <span className="adopt-chip">🎒 School</span>}
          {k.strikes > 0 && <span className="adopt-chip bad">⚠️ {k.strikes}/{KIDS.strikesToTake}</span>}
        </span>
      </div>
      {alert && <div className={`adopt-alert ${alert.urgent ? 'urgent' : ''}`}><b>{alert.title}</b><span>{alert.body}</span></div>}
      <div className="adopt-needs">
        {KID_NEEDS.map((n) => (
          <div key={n.key} className="adopt-need">
            <span><Emoji char={n.icon} size={13} /> {n.label}</span>
            <div className={`bar ${s[n.key] < KIDS.alertAt ? 'low' : ''}`}><i style={{ width: `${s[n.key]}%` }} /></div>
          </div>
        ))}
        <div className="adopt-need">
          <span><Emoji char={s.sick ? '🤒' : '❤️'} size={13} /> Health</span>
          <div className={`bar health ${s.health < KIDS.sickAt ? 'low' : ''}`}><i style={{ width: `${s.health}%` }} /></div>
        </div>
      </div>
      <div className="adopt-care">
        {CARE_IDS.filter((c) => CARE[c].stages.includes(stage)).map((c) => <CareButton key={c} care={c} k={k} stage={stage} />)}
      </div>
      {years >= KIDS.schoolAge && !inSchool && (
        <button className="adopt-school" disabled={busy} onClick={() => run(() => paySchool(k.id))}><Emoji char="🎒" size={15} /> Pay school fees · {naira(KIDS.schoolFee)} a term</button>
      )}
      {fresh.map((m) => {
        const t = milestoneText(m.id, k.name, k.sex);
        return (
          <div key={m.id} className="adopt-milestone">
            <Emoji char={t.icon} size={22} />
            <span>{t.text}</span>
            <div className="adopt-milestone-btns">
              <button className="btn sm go" onClick={() => void seeMilestone(k.id, m.id, true)}>🐦 Share</button>
              <button className="btn sm" onClick={() => void seeMilestone(k.id, m.id, false)}>Aww 🥹</button>
            </div>
          </div>
        );
      })}
      {!fresh.length && recent.length > 0 && (
        <div className="adopt-memories">
          {recent.map((m) => { const t = milestoneText(m.id, k.name, k.sex); return <span key={m.id}><Emoji char={t.icon} size={12} /> {t.text.replace(/ \(.*\)/, '')}</span>; })}
        </div>
      )}
      <details className="adopt-more">
        <summary>{k.name}'s file</summary>
        <p>“{k.story}”</p>
        <small>From {k.home}{k.adoptedAt ? ` · home since ${new Date(k.adoptedAt).toLocaleDateString()}` : ''}</small>
      </details>
    </div>
  );
}

function CareButton({ care, k, stage }: { care: CareId; k: Kid; stage: ReturnType<typeof stageOf> }) {
  const money = useGame((s) => s.money);
  const cost = CARE[care].cost(stage);
  const target = careTarget(care);
  const forMe = target?.id === k.id;
  const go = () => {
    startCare(care);
    useGame.getState().setPanel(null);
  };
  return (
    <button className={`adopt-care-btn ${forMe ? 'needed' : ''}`} disabled={!forMe || money < cost} onClick={go} title={forMe ? '' : 'Not needed right now'}>
      <Emoji char={care === 'feed' && (stage === 'newborn' || stage === 'baby') ? '🍼' : care === 'feed' ? '🍲' : CARE[care].icon} size={20} />
      <b>{careLabel(care, stage)}</b>
      <small>{cost ? naira(cost) : 'Free'}</small>
    </button>
  );
}

function Nanny({ until, now }: { until: number; now: number }) {
  const [busy, setBusy] = useState(false);
  const money = useGame((s) => s.money);
  const on = until > now;
  const room = Math.floor((now + KIDS.nannyMaxDays * 86_400_000 - Math.max(now, until)) / 86_400_000);
  return (
    <div className={`adopt-nanny ${on ? 'on' : ''}`}>
      <div className="adopt-card-head">
        <span className="adopt-nanny-face"><Emoji char="👩🏾‍🍼" size={28} /></span>
        <span className="tile-info">
          <b>Nanny {on ? '· on duty' : ''}</b>
          <small>{on ? `Looking after them for ${left(until - now)} more. No need drops under ${KIDS.nannyFloor}.` : `${naira(KIDS.nannyPerDay)} a day. Feeds, changes, settles and plays with them while you hustle.`}</small>
        </span>
      </div>
      <div className="adopt-nanny-btns">
        {[1, 3, 7].map((d) => (
          <button key={d} className="btn sm" disabled={busy || d > room || money < d * KIDS.nannyPerDay} onClick={async () => { setBusy(true); try { await bookNanny(d); } finally { setBusy(false); } }}>
            {d} day{d > 1 ? 's' : ''} · {naira(d * KIDS.nannyPerDay)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Rules() {
  return (
    <details className="adopt-rules">
      <summary><Emoji char="📜" size={14} /> How it works</summary>
      <ul>
        <li>A child grows a year every real day: baby at 3 months, toddler at 15 months, child at 4, teen at 13. At {GROWN_AGE} they move out.</li>
        <li>Hunger, sleep, cleanliness and play fall in real time, even when you are offline. Care at home: tap a button here or use the cot, high chair, baby bath, play mat or toy box.</li>
        <li>When a need runs out, health starts to fall. Under {KIDS.sickAt}% they are sick until the clinic. Under {KIDS.warnAt}% Social Welfare writes a warning; {KIDS.strikesToTake} warnings (one is forgiven every {KIDS.strikeForgiveMs / 86_400_000} days), or health at zero, and they take the child. You then have {KIDS.reclaimMs / 86_400_000} days to pay {naira(KIDS.reclaimFine)} and bring them back.</li>
        <li>Going away? Book the nanny. Turn on Family notifications in your profile to hear when they need you.</li>
      </ul>
    </details>
  );
}
