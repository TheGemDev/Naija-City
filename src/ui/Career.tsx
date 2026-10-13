// Career app: skills to train, job rank and promotions. Businesses live in their own app (Business.tsx).
// Rules in src/game/career.ts, server side in worker/career.ts.

import { useEffect, useState } from 'react';
import { naira, useGame } from '../game/store';
import { placeHere } from '../game/city';
import { JOB_RANKS, SKILL_BY_ID, SKILL_LEVELS, type SkillId } from '../game/career';
import { JOBS } from '../game/catalog';
import { useSession } from '../net/session';
import { loadCareer, useCareer, type JobInfo } from '../net/career';
import { Emoji } from './Icons';
import './career.css';

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export const left = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

const SKILL_TINT: Record<SkillId, string> = { cooking: '#ea580c', mechanic: '#0284c7', tailoring: '#c026d3', trading: '#16a34a' };

const tint = (c: string) => ({ '--c': c }) as React.CSSProperties;

/** How far through the current rank a job is, 0..1 (1 at the top of the ladder). */
function rankProgress(j: Pick<JobInfo, 'shifts' | 'rank' | 'nextAt'>) {
  if (!j.nextAt) return 1;
  const base = JOB_RANKS[j.rank]?.shifts ?? 0;
  return Math.min(1, Math.max(0, (j.shifts - base) / (j.nextAt - base)));
}

function Hero() {
  const skills = useCareer((s) => s.skills);
  const jobs = useCareer((s) => s.jobs);
  const jobId = useGame((s) => s.jobId);
  const def = JOBS.find((x) => x.id === jobId);
  // A job with no shifts yet is not in the server list: it starts as a Trainee.
  const job = def && (jobs.find((j) => j.id === def.id)
    ?? { id: def.id, shifts: 0, rank: 0, title: JOB_RANKS[0].title, mult: JOB_RANKS[0].pay, nextAt: JOB_RANKS[1]?.shifts ?? null });
  const levels = skills.reduce((n, s) => n + s.level, 0);
  const shifts = jobs.reduce((n, j) => n + j.shifts, 0);
  return (
    <div className="hero cr-hero">
      <span className="cr-hero-icon"><Emoji char={def?.icon ?? '🎓'} size={32} /></span>
      <div>
        <small>{def ? def.title : 'No job yet'}</small>
        <b>{job ? job.title : 'Start your career'}</b>
        {job ? (
          <div className="hero-meter">
            <div className="bar light"><i style={{ width: `${rankProgress(job) * 100}%` }} /></div>
            <b>{job.nextAt ? `${job.shifts}/${job.nextAt}` : 'Top'}</b>
          </div>
        ) : <small>Pick a job in the Jobs app and work shifts to rank up.</small>}
        <div className="cr-stats">
          {job && <span>Pay ×{job.mult.toFixed(2)}</span>}
          <span>{shifts} {shifts === 1 ? 'shift' : 'shifts'}</span>
          <span>Skill Lv {levels}</span>
        </div>
      </div>
    </div>
  );
}

function SkillsTab() {
  const skills = useCareer((s) => s.skills);
  const now = useNow(5000);
  return (
    <>
      <div className="cr-list">
        {skills.map((s) => {
          const def = SKILL_BY_ID[s.id];
          const base = SKILL_LEVELS[s.level - 1] ?? 0;
          const pct = s.next ? ((s.xp - base) / (s.next - base)) * 100 : 100;
          const wait = s.readyAt - now;
          return (
            <div className="cr-card" key={s.id} style={tint(SKILL_TINT[s.id])}>
              <div className="cr-head">
                <span className="cr-icon"><Emoji char={def.icon} size={24} /></span>
                <span className="tile-info">
                  <b>{def.label}</b>
                  <small>{def.blurb}</small>
                </span>
                <span className="cr-level"><small>Lv</small><b>{s.level}</b></span>
              </div>
              <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              <div className="cr-foot">
                <span>{s.next ? `${s.xp} / ${s.next} xp` : `${s.xp} xp`}</span>
                {!s.next ? <span className="cr-chip max">Max level</span>
                  : wait > 0 ? <span className="cr-chip"><Emoji char="⏳" size={12} /> Next course in {left(wait)}</span>
                  : <span className="cr-chip ready">Course {naira(s.fee)}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="cr-note">
        <Emoji char="🏫" size={20} />
        <span>Courses run at {placeHere('poly')?.name ?? 'the polytechnic'}. Finish one there and your progress shows here.</span>
      </div>
    </>
  );
}

function JobsTab() {
  const jobs = useCareer((s) => s.jobs);
  const current = useGame((s) => s.jobId);
  if (!jobs.length) {
    return (
      <div className="cr-empty">
        <Emoji char="💼" size={34} />
        <b>No shifts worked yet</b>
        <small>Get a job in the Jobs app. Every shift moves you up the ladder and raises your pay.</small>
      </div>
    );
  }
  const sorted = [...jobs].sort((a, b) => Number(b.id === current) - Number(a.id === current) || b.shifts - a.shifts);
  return (
    <div className="cr-list">
      {sorted.map((j) => {
        const def = JOBS.find((x) => x.id === j.id);
        const next = JOB_RANKS[j.rank + 1];
        const progress = rankProgress(j);
        return (
          <div className={`cr-card ${current === j.id ? 'mine' : ''}`} key={j.id}>
            <div className="cr-head">
              <span className="cr-icon"><Emoji char={def?.icon ?? '💼'} size={24} /></span>
              <span className="tile-info">
                <b>{def?.title ?? j.id}</b>
                <small>{j.shifts} {j.shifts === 1 ? 'shift' : 'shifts'} · pay ×{j.mult.toFixed(2)}</small>
              </span>
              {current === j.id && <span className="pill-tag on">Current</span>}
            </div>
            <div className="cr-ladder" role="img" aria-label={`Rank ${j.rank + 1} of ${JOB_RANKS.length}: ${j.title}`}>
              {JOB_RANKS.slice(1).map((r, i) => (
                <div className="bar" key={r.title}><i style={{ width: `${i < j.rank ? 100 : i === j.rank ? progress * 100 : 0}%` }} /></div>
              ))}
            </div>
            <div className="cr-ranks">
              <b>{j.title}</b>
              <span>{next && j.nextAt ? `${j.nextAt - j.shifts} more to ${next.title} · ×${next.pay.toFixed(2)}` : 'Top of the ladder'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CareerApp() {
  const ok = !!useSession((s) => s.user?.username);
  const loaded = useCareer((s) => s.loaded);
  const [tab, setTab] = useState<'skills' | 'jobs'>('skills');
  useEffect(() => { if (ok) void loadCareer(); }, [ok]);
  if (!ok) {
    return (
      <div className="cr-empty">
        <Emoji char="🎓" size={34} />
        <b>Sign in to build a career</b>
        <small>Skills and promotions are saved on your account.</small>
      </div>
    );
  }
  return (
    <>
      <Hero />
      <div className="tabs">
        <button className={tab === 'skills' ? 'on' : ''} onClick={() => setTab('skills')}>📚 Skills</button>
        <button className={tab === 'jobs' ? 'on' : ''} onClick={() => setTab('jobs')}>📈 Jobs</button>
      </div>
      {!loaded ? <div className="cr-list"><div className="cr-skel" /><div className="cr-skel" /><div className="cr-skel" /></div>
        : tab === 'skills' ? <SkillsTab /> : <JobsTab />}
    </>
  );
}
