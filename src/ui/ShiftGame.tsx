// Your post while a shift runs: how the shift is going, the jobs that turn up at it, and the way out: leave early,
// or clock out once the shift has run its course. The jobs themselves are in game/shiftGame.ts; the store pays the
// wage and the bonus when you clock out (finish() in game/store.ts).

import { useEffect, useMemo, useRef, useState } from 'react';
import { naira, useGame, wageMult, WORK_RATE } from '../game/store';
import { employment, shiftMinutes, wageFor } from '../game/jobs';
import { callNext, deskFor, jobsDue, openShift, ROUND, settleTask, SHIFT, shiftBonus, useShift, type Question } from '../game/shiftGame';
import { celebrate, haptic } from '../game/juice';
import { sfx } from '../game/sfx';
import './shiftgame.css';

/** How long the right/wrong flash stays before the job is cleared from the desk. */
const FLASH_MS = 650;

interface RoundProps {
  /** 0..1 across the shift: later jobs are quicker. */
  t: number;
  /** Hungry or tired: less time, smaller target. */
  weak: boolean;
  /** Called after the right/wrong flash. */
  onResult(hit: boolean): void;
}

/** Sound and buzz land with the flash, not when the next job appears. */
function feedback(hit: boolean) {
  sfx.play(hit ? 'success' : 'error');
  haptic(hit ? 'coin' : 'miss');
}

/** A marker sweeps back and forth; tap while it is inside the zone. */
function TimingRound({ how, tap: label, t, weak, onResult }: RoundProps & { how: string; tap: string }) {
  const marker = useRef<HTMLElement>(null);
  const pos = useRef(0);
  const [result, setResult] = useState<boolean | null>(null);
  const done = useRef(false);
  const zone = useMemo(() => {
    const width = ROUND.zone(t) * (weak ? SHIFT.weakFactor : 1);
    return { start: 0.12 + Math.random() * (0.76 - width), width };
  }, [t, weak]);
  const sweep = ROUND.sweepSeconds(t) * (weak ? SHIFT.weakFactor : 1);

  const end = (hit: boolean) => {
    if (done.current) return;
    done.current = true;
    setResult(hit);
    feedback(hit);
    setTimeout(() => onResult(hit), FLASH_MS);
  };
  const tap = () => end(pos.current >= zone.start && pos.current <= zone.start + zone.width);

  useEffect(() => {
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      if (done.current) return;
      const sweeps = (now - began) / 1000 / sweep;
      if (sweeps >= ROUND.sweeps) return end(false);
      // Triangle wave: across and back.
      const phase = sweeps % 2;
      pos.current = phase < 1 ? phase : 2 - phase;
      if (marker.current) marker.current.style.left = `${pos.current * 100}%`;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      tap();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
    // One round per mount (the parent keys it by job number).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <p className="shift-how">{how}</p>
      <div className={`shift-bar ${result === null ? '' : result ? 'hit' : 'miss'}`}>
        <span className="shift-zone" style={{ left: `${zone.start * 100}%`, width: `${zone.width * 100}%` }} />
        <i ref={marker} className="shift-marker" />
      </div>
      <button className="btn go shift-tap" data-nosound disabled={result !== null} onPointerDown={(e) => { e.preventDefault(); tap(); }}>
        {result === null ? label : result ? '✓ Sharp!' : '✗ Missed'}
      </button>
    </>
  );
}

/** A question with two or three answers and a clock. */
function QuizRound({ question: q, t, weak, onResult }: RoundProps & { question: Question }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const done = useRef(false);
  const seconds = ROUND.quizSeconds(t) * (weak ? SHIFT.weakFactor : 1);
  // Short answers sit side by side; a sentence each gets a row of its own.
  const stacked = q.options.some((o) => o.length > 14);

  const answer = (i: number) => {
    if (done.current) return;
    done.current = true;
    setChosen(i);
    feedback(i === q.answer);
    setTimeout(() => onResult(i === q.answer), FLASH_MS);
  };

  useEffect(() => {
    // Out of time counts as a wrong answer.
    const timer = setTimeout(() => answer(-1), seconds * 1000);
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (Number.isInteger(i) && i >= 0 && i < q.options.length) answer(i);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <p className="shift-how">{q.prompt}</p>
      {q.detail && <pre className="shift-detail">{q.detail}</pre>}
      <div className={`shift-clock ${chosen === null ? '' : 'stopped'}`}>
        <i style={{ animationDuration: `${seconds}s` }} />
      </div>
      <div className={`shift-options ${stacked ? 'stacked' : ''}`}>
        {q.options.map((label, i) => (
          <button
            key={i}
            data-nosound
            className={`btn ${chosen === null ? '' : i === q.answer ? 'right' : i === chosen ? 'wrong' : 'dim'}`}
            disabled={chosen !== null}
            onClick={() => answer(i)}
          >
            {label}
          </button>
        ))}
      </div>
      {chosen === -1 && <small className="shift-late">⏰ Too slow!</small>}
    </>
  );
}

/** Tiles to tap from the smallest to the biggest, against a clock. One wrong tap and it is over. */
function SortRound({ how, tiles, order, t, weak, onResult }: RoundProps & { how: string; tiles: string[]; order: number[] }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number | null>(null);
  const [late, setLate] = useState(false);
  const done = useRef(false);
  const seconds = ROUND.sortSeconds(t) * (weak ? SHIFT.weakFactor : 1);

  const end = (hit: boolean) => {
    if (done.current) return;
    done.current = true;
    feedback(hit);
    setTimeout(() => onResult(hit), FLASH_MS);
  };
  const tap = (i: number) => {
    if (done.current || picked.includes(i)) return;
    if (order[picked.length] !== i) {
      setWrong(i);
      return end(false);
    }
    const next = [...picked, i];
    setPicked(next);
    if (next.length === order.length) end(true);
    else haptic('coin');
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (done.current) return;
      setLate(true);
      end(false);
    }, seconds * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const over = wrong !== null || late || picked.length === order.length;
  return (
    <>
      <p className="shift-how">{how}</p>
      <div className={`shift-clock ${over ? 'stopped' : ''}`}>
        <i style={{ animationDuration: `${seconds}s` }} />
      </div>
      <div className="shift-tiles">
        {tiles.map((label, i) => {
          const at = picked.indexOf(i);
          return (
            <button
              key={i}
              data-nosound
              className={`btn ${at >= 0 ? 'right' : i === wrong ? 'wrong' : over ? 'dim' : ''}`}
              disabled={over || at >= 0}
              onClick={() => tap(i)}
            >
              {at >= 0 && <i>{at + 1}</i>}
              {label}
            </button>
          );
        })}
      </div>
      {late && <small className="shift-late">⏰ Too slow!</small>}
    </>
  );
}

/** A job has turned up: it waits a little for you to pick it up, then walks away. */
function Call({ call, onTake, onGone }: { call: string; onTake(): void; onGone(): void }) {
  useEffect(() => {
    const timer = setTimeout(onGone, SHIFT.patience * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <button className="work-call" data-nosound onClick={onTake}>
      <b>{call}</b>
      <em>Attend</em>
      <span className="shift-clock"><i style={{ animationDuration: `${SHIFT.patience}s` }} /></span>
    </button>
  );
}

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function ShiftGame() {
  // The shift in progress, named by the minute it started (null when not at work).
  const shift = useGame((s) => (s.task?.actionId === 'work' && s.task.phase === 'doing' ? s.task.startedAt ?? 0 : null));
  // The shift has run out: all that is left is to clock out.
  const over = useGame((s) => s.task?.actionId === 'work' && !!s.task.over);
  // Whole seconds left, so the card redraws once a second and not every frame.
  const secondsLeft = useGame((s) => (s.task?.actionId === 'work' ? Math.ceil(s.task.remaining / WORK_RATE) : 0));
  const total = useGame((s) => (s.task?.actionId === 'work' ? s.task.total : 0));
  const jobId = useGame((s) => s.jobId);
  const jobCity = useGame((s) => s.jobCity);
  const workDays = useGame((s) => s.workDays);
  const origin = useGame((s) => s.origin);
  const panelOpen = useGame((s) => s.panel !== null);
  const weak = useGame((s) => s.needs.hunger < SHIFT.weakBelow || s.needs.energy < SHIFT.weakBelow);
  const clockOut = useGame((s) => s.clockOut);
  const hits = useShift((s) => s.hits);
  const played = useShift((s) => s.played);
  const task = useShift((s) => s.task);
  const stage = useShift((s) => s.stage);
  const leaving = useShift((s) => s.leaving);
  // Hunger and tiredness are judged when you pick a job up, so the rules don't change in the middle of it.
  const [weakNow, setWeakNow] = useState(false);

  const work = useMemo(() => employment({ jobId, jobCity }), [jobId, jobCity]);
  const worked = Math.max(0, total - secondsLeft * WORK_RATE);

  useEffect(() => {
    if (shift === null) return;
    openShift(shift);
    // At your post the place's own activities are closed to you.
    const g = useGame.getState();
    g.setPlaceHubOpen(false);
    g.select(null);
  }, [shift]);

  // Jobs turn up as the shift goes on; once it has run out, one nobody picked up is gone.
  useEffect(() => {
    if (shift === null || !work) return;
    if (!over) return callNext(work.job.id, work.city, jobsDue(worked, shiftMinutes(work.job)));
    const s = useShift.getState();
    if (s.task && s.stage === 'call') useShift.setState({ task: null });
  }, [shift, over, work, worked]);

  if (shift === null || !work) return null;
  const playing = !!task && stage === 'play';
  // The phone and the map cover the screen: don't sit on top of them unless a job is in your hands.
  if (panelOpen && !playing) return null;

  const { job, place } = work;
  const desk = deskFor(job.id);
  const mult = wageMult({ workDays, origin }, job.id);
  const earned = wageFor(job, over ? total : worked, mult);
  const full = wageFor(job, total, mult);
  const bonus = shiftBonus(job.pay, hits);
  // No wage, no bonus.
  const takeHome = earned + (earned > 0 ? bonus : 0);
  const t = Math.min(1, played / (SHIFT.rounds - 1));

  const onResult = (hit: boolean) => {
    const perfect = hit && useShift.getState().hits + 1 === SHIFT.rounds;
    settleTask(hit);
    if (perfect) celebrate();
  };

  return (
    <div className={`shift-game work-panel ${over ? 'over' : ''}`} role="region" aria-label="Your shift">
      <header>
        <span className="work-post">
          <b>{job.icon} {desk.title}</b>
          <small>{job.title} · {place.name}</small>
        </span>
        <span className="shift-score">{over ? '✓ Shift done' : `⏱ ${mmss(secondsLeft)}`}</span>
      </header>
      <div className="bar"><i style={{ width: `${total > 0 ? Math.min(100, (worked / total) * 100) : 100}%` }} /></div>
      <div className="work-money">
        <span>Pay <b>{naira(earned)}</b>{!over && <small> of {naira(full)}</small>}</span>
        <span>Bonus <b>{naira(bonus)}</b>{played > 0 && <small> · {hits}/{played} right</small>}</span>
      </div>

      {playing && task.kind === 'timing' && <TimingRound key={played} how={task.how} tap={task.tap} t={t} weak={weakNow} onResult={onResult} />}
      {playing && task.kind === 'quiz' && <QuizRound key={played} question={task.question} t={t} weak={weakNow} onResult={onResult} />}
      {playing && task.kind === 'sort' && <SortRound key={played} how={task.how} tiles={task.tiles} order={task.order} t={t} weak={weakNow} onResult={onResult} />}

      {!playing && !leaving && (
        over ? <p className="shift-how">🎉 You stayed to the end. Clock out to collect your pay.</p>
          : task ? (
            <Call
              key={played}
              call={task.call}
              onTake={() => {
                setWeakNow(weak);
                useShift.setState({ stage: 'play' });
              }}
              onGone={() => settleTask(false)}
            />
          ) : (
            <p className="shift-how work-quiet">
              {played === 0 ? `Work turns up as the shift goes on. Do it right for a bonus of up to ${naira(shiftBonus(job.pay, SHIFT.rounds))}.` : 'All quiet at your post. More work is on the way.'}
            </p>
          )
      )}
      {!playing && !leaving && !over && weak && <small className="shift-weak">😩 You’re hungry or tired, so your hands are slow today: less time and a smaller target. Eat and sleep before work.</small>}

      {!playing && leaving && (
        <>
          <p className="shift-how">Leave now and you are paid <b>{naira(earned)}</b> of {naira(full)}. That is your shift for today.</p>
          <div className="work-foot">
            <button className="btn" onClick={() => useShift.setState({ leaving: false })}>Stay</button>
            <button className="btn danger" onClick={clockOut}>Leave · {naira(takeHome)}</button>
          </div>
        </>
      )}
      {!playing && !leaving && over && (
        <div className="work-foot">
          <button className="btn go" onClick={clockOut}>Clock out · {naira(takeHome)}</button>
        </div>
      )}
    </div>
  );
}
