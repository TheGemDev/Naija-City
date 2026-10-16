// The Hustle app's money tabs that the server pays (net/hustle.ts, worker/hustles.ts): the daily check-in and invite
// bonuses, freelance gigs done on the phone, and the farm plot outside town. Plus the dispatch-rider tile for the
// Drive tab (the deliveries themselves run on the map, game/drive.ts).

import { useEffect, useMemo, useState } from 'react';
import { naira, useGame } from '../game/store';
import { RENTAL } from '../game/gigs';
import { startDrive } from '../game/drive';
import { NEWCOMER } from '../game/career';
import { CROP_IDS, CROPS, DAILY_REWARDS, FARM, FREELANCE, FREELANCE_KINDS, FREELANCE_RULES, REFERRAL, cropPrice, freelancePay, type CropId } from '../game/hustles';
import {
  claimDaily, claimReferrals, harvestCrop, leasePlot, loadHustles, plantCrop, startFreelance, submitFreelance, useHustle, type FreelanceTask,
} from '../net/hustle';
import { useCareer } from '../net/career';
import { useSession } from '../net/session';
import { inviteLink } from '../net/deeplink';
import './hustles.css';

/** The time now on the server's clock, ticking. */
function useServerNow(ms = 1000) {
  const skew = useHustle((s) => s.skew);
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + useHustle.getState().skew), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s % 60).padStart(2, '0')}`;
};

/** "20 min", "1h 30m", "3h". */
const growLabel = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
};

/** Loads the hustle state once the tab opens, and shows a placeholder until it has. */
function useLoaded() {
  const state = useHustle((s) => s.state);
  useEffect(() => void loadHustles(), []);
  return state;
}

/* ---------- Dispatch (Drive tab) ---------- */

export function DispatchTile({ onGo }: { onGo: () => void }) {
  const money = useGame((s) => s.money);
  return (
    <div className="tile hs-dispatch">
      <span className="tile-icon">📦</span>
      <span className="tile-info">
        <b>Dispatch rider</b>
        <small>Rent a bike with a cool box for {naira(RENTAL.dispatch)} · collect food and parcels, deliver across town · up to ₦8k a drop, no park dues</small>
      </span>
      <button className="btn sm go" disabled={money < RENTAL.dispatch} onClick={() => { onGo(); startDrive('okada', { gig: 'dispatch' }); }}>Start</button>
    </div>
  );
}

/* ---------- Daily ---------- */

export function DailyTab() {
  const state = useLoaded();
  const busy = useHustle((s) => s.busy);
  const now = useServerNow(15_000);
  const username = useSession((s) => s.user?.username);
  const newcomerLeft = useCareer((s) => (s.loaded ? Math.max(0, NEWCOMER.shifts - s.jobs.reduce((a, j) => a + j.shifts, 0)) : 0));
  const [copied, setCopied] = useState(false);
  if (!state) return <p className="muted small">Loading…</p>;
  const { daily, referral } = state;
  // Where today's check-in sits in the week of rewards.
  const at = (daily.streak - 1) % DAILY_REWARDS.length;
  const link = username ? inviteLink(username) : null;
  return (
    <>
      <div className="hs-card">
        <div className="hs-card-head">
          <b>📅 Daily check-in</b>
          <small>{daily.claimed ? `Next one in ${clock(state.dayEnds - now)}` : `Day ${daily.streak} in a row`}</small>
        </div>
        <div className="hs-week" role="list" aria-label="This week's check-in rewards">
          {DAILY_REWARDS.map((r, i) => (
            <div key={i} role="listitem" className={`hs-day ${i < at || (i === at && daily.claimed) ? 'done' : ''} ${i === at && !daily.claimed ? 'today' : ''} ${i === 6 ? 'salary' : ''}`}>
              <small>{i === 6 ? 'Salary' : `Day ${i + 1}`}</small>
              <b>₦{r / 1000}k</b>
            </div>
          ))}
        </div>
        <button className="btn go hs-wide" disabled={daily.claimed || busy} onClick={() => void claimDaily()}>
          {daily.claimed ? '✅ Checked in today' : `Check in · +${naira(daily.reward)}`}
        </button>
        <small className="muted">Miss a day and the run starts again from day 1. Best run: {daily.best} days.</small>
      </div>

      {newcomerLeft > 0 && (
        <div className="hs-card hs-new">
          <b>🌱 New in town</b>
          <small>Your next {newcomerLeft} shift{newcomerLeft === 1 ? '' : 's'} at any job pay ×{NEWCOMER.pay}. Get a job in Phone → Jobs.</small>
        </div>
      )}

      <div className="hs-card">
        <div className="hs-card-head">
          <b>🤝 Invite friends</b>
          <small>{naira(REFERRAL.reward)} each</small>
        </div>
        <small className="muted">
          When a friend joins with your link and works {REFERRAL.shifts} shifts, you get {naira(REFERRAL.reward)} and they get {naira(REFERRAL.welcome)}. Up to {REFERRAL.perWeek} a week.
        </small>
        <div className="flow">
          <div><small>Ready to claim</small><b>{referral.ready.length}</b></div>
          <div><small>Still working</small><b>{referral.waiting}</b></div>
        </div>
        {referral.welcome !== 'none' && referral.welcome !== 'paid' && (
          <small>🎁 You joined through a friend: your {naira(REFERRAL.welcome)} welcome {referral.welcome === 'ready' ? 'is ready' : `comes after ${REFERRAL.shifts} shifts (${Math.min(referral.shifts, REFERRAL.shifts)}/${REFERRAL.shifts})`}.</small>
        )}
        <div className="row-btns">
          {link && (
            <button className="btn" onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => {})}>
              {copied ? '✅ Link copied' : '🔗 Copy my invite link'}
            </button>
          )}
          <button className="btn go" disabled={busy || (!referral.ready.length && referral.welcome !== 'ready')} onClick={() => void claimReferrals()}>Claim</button>
        </div>
      </div>
      <p className="muted small">More daily money: the Goals app has daily quests for shifts, rides, deliveries, freelance and farming.</p>
    </>
  );
}

/* ---------- Freelance ---------- */

export function FreelanceTab() {
  const state = useLoaded();
  const busy = useHustle((s) => s.busy);
  const result = useHustle((s) => s.result);
  if (!state) return <p className="muted small">Loading…</p>;
  const { freelance } = state;
  const left = freelance.perDay - freelance.done;
  return (
    <>
      <div className="flow">
        <div><small>Gigs today</small><b>{freelance.done} / {freelance.perDay}</b></div>
        <div><small>Earned today</small><b>{naira(freelance.earned)}</b></div>
      </div>
      {freelance.active ? (
        <FreelanceJob key={freelance.active.id} task={freelance.active} />
      ) : (
        <>
          {result && <FreelanceResultCard />}
          {FREELANCE_KINDS.map((k) => {
            const def = FREELANCE[k];
            const locked = freelance.knowledge < def.minKnowledge;
            return (
              <div key={k} className={`tile ${locked ? 'locked' : ''}`}>
                <span className="tile-icon">{def.icon}</span>
                <span className="tile-info">
                  <b>{def.label}</b>
                  <small>{def.blurb}</small>
                  <small>Up to <b className="good">{naira(freelancePay(k, freelance.knowledge))}</b>{def.minKnowledge ? ` · 📚${def.minKnowledge}` : ''}</small>
                </span>
                <button className="btn sm go" disabled={locked || busy || left <= 0} onClick={() => void startFreelance(k)}>{locked ? '🔒' : 'Take'}</button>
              </div>
            );
          })}
          <p className="muted small">
            Pay grows with your 📚 knowledge (+{Math.round(FREELANCE_RULES.perKnowledge * 100)}% a point). {left <= 0 ? 'No more clients today. Come back tomorrow.' : `${left} more gig${left === 1 ? '' : 's'} today.`} A gig you take counts even if you drop it.
          </p>
        </>
      )}
    </>
  );
}

function FreelanceResultCard() {
  const result = useHustle((s) => s.result)!;
  return (
    <div className={`hs-card ${result.earned > 0 ? 'hs-paid' : 'hs-unpaid'}`}>
      <b>{result.earned > 0 ? `💸 Paid ${naira(result.earned)}` : result.late ? '⌛ Too late' : '😬 Client not happy'}</b>
      <small>Client satisfaction {Math.round(result.score * 100)}%{result.net !== result.earned ? ` · ${naira(result.earned - result.net)} income tax` : ''}</small>
    </div>
  );
}

function FreelanceJob({ task }: { task: FreelanceTask }) {
  const busy = useHustle((s) => s.busy);
  const now = useServerNow(250);
  const def = FREELANCE[task.kind];
  const brief = task.brief;
  const [text, setText] = useState('');
  const [hues, setHues] = useState<number[]>(() => (brief.hues ?? []).map(() => 180));
  const [lines, setLines] = useState<number[]>(() => (brief.snippets ?? []).map(() => -1));
  const ready = now - task.startedAt >= task.minMs;
  const expired = now > task.expiresAt;
  const answer = task.kind === 'writing' ? text : task.kind === 'design' ? hues : lines;
  const complete = task.kind === 'writing' ? text.trim().length > 0 : task.kind === 'design' ? true : lines.every((l) => l >= 0);
  return (
    <div className="hs-card hs-job">
      <div className="hs-card-head">
        <b>{def.icon} {def.label} · {naira(task.pay)}</b>
        <small className={expired ? 'bad' : ''}>{expired ? 'Expired' : `⏱ ${clock(task.expiresAt - now)}`}</small>
      </div>
      {task.kind === 'writing' && (
        <>
          <small className="muted">Type the client’s advert exactly. Every mistake costs.</small>
          <p className="hs-copy" onCopy={(e) => e.preventDefault()}>{brief.text}</p>
          <textarea
            className="hs-type" rows={3} value={text} autoFocus spellCheck={false} placeholder="Type it here…"
            onPaste={(e) => e.preventDefault()} onChange={(e) => setText(e.target.value)}
          />
        </>
      )}
      {task.kind === 'design' && (
        <>
          <small className="muted">The client’s brand colours are on top. Slide each one below until it matches.</small>
          {(brief.hues ?? []).map((h, i) => (
            <div key={i} className="hs-hue">
              <span className="hs-swatch" style={{ background: `hsl(${h} 75% 50%)` }} aria-label="Target colour" />
              <span className="hs-swatch" style={{ background: `hsl(${hues[i]} 75% 50%)` }} aria-label="Your colour" />
              <input type="range" min={0} max={359} value={hues[i]} aria-label={`Colour ${i + 1}`} onChange={(e) => setHues(hues.map((v, j) => (j === i ? Number(e.target.value) : v)))} />
            </div>
          ))}
        </>
      )}
      {task.kind === 'code' && (
        <>
          <small className="muted">Each bit of code has one broken line. Tap it.</small>
          {(brief.snippets ?? []).map((sn, i) => (
            <div key={i} className="hs-code">
              <small>{i + 1}. {sn.task}</small>
              <pre>
                {sn.lines.map((l, j) => (
                  <button key={j} className={lines[i] === j ? 'on' : ''} onClick={() => setLines(lines.map((v, k) => (k === i ? j : v)))}>{l}</button>
                ))}
              </pre>
            </div>
          ))}
        </>
      )}
      <button className="btn go hs-wide" disabled={busy || !complete || !ready || expired} onClick={() => void submitFreelance(task.id, answer)}>
        {expired ? 'Too late' : ready ? 'Hand it in' : `Hand in from ${clock(task.minMs - (now - task.startedAt))}`}
      </button>
    </div>
  );
}

/* ---------- Farm ---------- */

export function FarmTab() {
  const state = useLoaded();
  const busy = useHustle((s) => s.busy);
  const money = useGame((s) => s.money);
  const now = useServerNow(1000);
  const [picking, setPicking] = useState<number | null>(null);
  const prices = useMemo(() => state?.farm.prices, [state]);
  if (!state) return <p className="muted small">Loading…</p>;
  const plots = state.farm.plots;
  const nextLease = FARM.plots[plots.length];
  return (
    <>
      <div className="hs-card hs-farm-head">
        <b>🌾 Your farm in Kachia</b>
        <small>Plant, wait, harvest and sell at today’s market price. Ripe crops left over {FARM.rotMs / 3_600_000} hours rot.</small>
      </div>
      {plots.map((p) => {
        const crop = p.crop ? CROPS[p.crop] : null;
        const ripeAt = crop && p.plantedAt ? p.plantedAt + crop.growMs : 0;
        const ripe = !!crop && now >= ripeAt;
        const rotten = ripe && now - ripeAt > FARM.rotMs;
        const grown = crop && p.plantedAt ? Math.min(1, (now - p.plantedAt) / crop.growMs) : 0;
        return (
          <div key={p.slot} className={`hs-plot ${ripe ? 'ripe' : ''}`}>
            <div className="hs-plot-row">
              <span className="hs-plot-icon" aria-hidden>{crop ? (ripe ? (rotten ? '🥀' : crop.icon) : '🌱') : '🟫'}</span>
              <span className="tile-info">
                <b>Plot {p.slot + 1}{crop ? ` · ${crop.label}` : ' · empty'}</b>
                <small>
                  {!crop ? 'Ready to plant' : ripe ? (rotten ? 'Rotten: sells for little' : `Ripe! Sells for ${naira(prices?.[p.crop!] ?? crop.sell)} today`) : `Ready in ${clock(ripeAt - now)}`}
                </small>
              </span>
              {crop ? (
                <button className="btn sm go" disabled={!ripe || busy} onClick={() => void harvestCrop(p.slot)}>Harvest</button>
              ) : (
                <button className="btn sm" disabled={busy} onClick={() => setPicking(picking === p.slot ? null : p.slot)}>Plant</button>
              )}
            </div>
            {crop && !ripe && <div className="bar"><i style={{ width: `${grown * 100}%` }} /></div>}
            {picking === p.slot && !crop && (
              <div className="hs-crops">
                {CROP_IDS.map((c: CropId) => {
                  const def = CROPS[c];
                  return (
                    <button key={c} className="hs-crop" disabled={busy || money < def.seed} onClick={() => { setPicking(null); void plantCrop(p.slot, c); }}>
                      <span aria-hidden>{def.icon}</span>
                      <b>{def.label}</b>
                      <small>Seeds {naira(def.seed)} · {growLabel(def.growMs)}</small>
                      <small className="good">Sells ~{naira(cropPrice(c, state.day))}</small>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {nextLease !== undefined ? (
        <div className="tile">
          <span className="tile-icon">🪧</span>
          <span className="tile-info">
            <b>Lease plot {plots.length + 1}</b>
            <small>One-time lease from the village chief: {naira(nextLease)}</small>
          </span>
          <button className="btn sm go" disabled={busy || money < nextLease} onClick={() => void leasePlot()}>Lease</button>
        </div>
      ) : (
        <p className="muted small">You farm every plot the chief will lease you.</p>
      )}
    </>
  );
}

export type HustleTab = 'drive' | 'fuel' | 'daily' | 'freelance' | 'farm';
export const HUSTLE_TABS: { id: HustleTab; label: string }[] = [
  { id: 'daily', label: '📅 Daily' },
  { id: 'drive', label: '🚗 Drive' },
  { id: 'freelance', label: '💻 Freelance' },
  { id: 'farm', label: '🌾 Farm' },
  { id: 'fuel', label: '⛽ Fuel' },
];
