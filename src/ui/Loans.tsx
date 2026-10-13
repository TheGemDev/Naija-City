// The Bank app's Loans tab: what you owe on top, paying back next, borrowing last. The going rate is set by the president.

import { useEffect, useState } from 'react';
import { LOAN, grow, type LoanRow, type LoanSnapshot } from '../game/loans';
import { naira, useGame } from '../game/store';
import { useSession } from '../net/session';
import { loadLoans, repayLoan, takeLoan, useLoans } from '../net/loans';
import './loans.css';

const timeLeft = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

const BORROW_PICKS = [50_000, 100_000, 250_000, 500_000, 1_000_000];

/** One big naira field: digits only, shown with commas. */
function MoneyInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <label className="loan-amount">
      <span>₦</span>
      <input
        inputMode="numeric"
        aria-label={label}
        placeholder="0"
        value={value ? value.toLocaleString('en-US') : ''}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '').slice(0, 13)))}
      />
    </label>
  );
}

/** One open loan: what it has grown to, when it grows next, and paying any part of it back. */
function LoanCard({ loan: l, rate, now, busy }: { loan: LoanRow; rate: number; now: number; busy: boolean }) {
  const cash = useGame((s) => Math.max(0, Math.floor(s.money)));
  const canClear = cash >= l.owed;
  const [amount, setAmount] = useState(canClear ? l.owed : 0);
  const short = amount > cash;
  const left = l.owed - amount;
  const weekly = l.overdue ? rate * LOAN.overdueFactor : rate;
  // Interest lands once a game week, counted from the moment the loan was taken.
  const nextHit = l.takenAt + Math.ceil((now - l.takenAt) / LOAN.periodMs) * LOAN.periodMs;
  const term = Math.min(100, Math.max(0, ((now - l.takenAt) / (l.dueAt - l.takenAt)) * 100));
  const picks = [0.25, 0.5]
    .map((f) => ({ label: `${f * 100}%`, value: Math.round(l.owed * f) }))
    .filter((p) => p.value >= 1 && p.value <= cash);
  if (canClear) picks.push({ label: 'All of it', value: l.owed });
  else if (cash > 0) picks.push({ label: 'All my cash', value: cash });
  return (
    <div className="loan-card">
      <div className="loan-card-top">
        <b>Loan of {naira(l.borrowed)}</b>
        <span className={`loan-pill ${l.overdue ? 'overdue' : ''}`}>{l.overdue ? '⚠️ Overdue' : `Due in ${timeLeft(l.dueAt - now)}`}</span>
      </div>
      <div className="bar"><i className={l.overdue ? 'late' : ''} style={{ width: `${l.overdue ? 100 : term}%` }} /></div>
      <dl className="loan-rows">
        <div><dt>Loan left to repay</dt><dd>{naira(l.principal)}</dd></div>
        <div><dt>Interest so far</dt><dd>{naira(l.interest)}</dd></div>
        {weekly > 0 && (
          <div className={l.overdue ? 'warn' : ''}>
            <dt>Next interest in {timeLeft(nextHit - now)} ({weekly}%)</dt>
            <dd>+{naira(grow(l.owed, weekly, 1) - l.owed)}</dd>
          </div>
        )}
        <div className="total"><dt>You owe</dt><dd>{naira(l.owed)}</dd></div>
      </dl>
      <MoneyInput value={amount} onChange={(n) => setAmount(Math.min(n, l.owed))} label="Amount to pay back" />
      <div className="loan-chips">
        {picks.map((p) => (
          <button key={p.label} type="button" className={amount === p.value ? 'on' : ''} onClick={() => setAmount(p.value)}>{p.label}</button>
        ))}
      </div>
      <button className="loan-go" disabled={busy || amount < 1 || short} onClick={() => void repayLoan(l.id, amount)}>
        {amount < 1 ? 'Choose an amount to pay' : left <= 0 ? `Pay ${naira(amount)} and clear it` : `Pay ${naira(amount)}`}
      </button>
      <p className={`loan-note ${short ? 'bad' : ''}`}>
        {short ? `You only have ${naira(cash)} in cash` : amount >= 1 && left > 0 ? `${naira(left)} will still be owed · you have ${naira(cash)}` : `You have ${naira(cash)} in cash`}
      </p>
    </div>
  );
}

/** Taking a loan: pick the amount, see what lands in your account and what it costs, then borrow. */
function Borrow({ data, busy }: { data: LoanSnapshot; busy: boolean }) {
  const { available, rate } = data;
  const [amount, setAmount] = useState(() => Math.min(available, 50_000));
  if (data.overdue) return <p className="loan-locked"><span>🔒</span> Clear your overdue loan and the bank will lend to you again.</p>;
  if (available < LOAN.min) {
    return <p className="loan-locked"><span>🏦</span> You have used your credit limit of {naira(data.limit)}. Pay some back to borrow again.</p>;
  }
  const fee = Math.round((amount * LOAN.feePct) / 100);
  const tooLittle = amount < LOAN.min;
  const tooMuch = amount > available;
  const picks = BORROW_PICKS.filter((n) => n < available).slice(-3);
  return (
    <div className="loan-card">
      <MoneyInput value={amount} onChange={setAmount} label="Amount to borrow" />
      <input
        className="loan-range"
        type="range"
        aria-label="Amount to borrow"
        min={LOAN.min}
        max={available}
        step={available > 500_000 ? 10_000 : 1_000}
        value={Math.min(Math.max(amount, LOAN.min), available)}
        onChange={(e) => setAmount(Number(e.target.value))}
      />
      <div className="loan-chips">
        {picks.map((n) => (
          <button key={n} type="button" className={amount === n ? 'on' : ''} onClick={() => setAmount(n)}>{naira(n)}</button>
        ))}
        <button type="button" className={amount === available ? 'on' : ''} onClick={() => setAmount(available)}>Max {naira(available)}</button>
      </div>
      <dl className="loan-rows">
        <div><dt>Bank fee ({LOAN.feePct}%)</dt><dd>−{naira(fee)}</dd></div>
        <div><dt>You receive now</dt><dd>{naira(Math.max(0, amount - fee))}</dd></div>
        <div><dt>Interest</dt><dd>{rate}% a game week</dd></div>
        <div><dt>Pay back within</dt><dd>{LOAN.termWeeks} game weeks ({timeLeft(LOAN.termWeeks * LOAN.periodMs)})</dd></div>
        <div className="total"><dt>Owed on the due date</dt><dd>about {naira(grow(amount, rate, LOAN.termWeeks))}</dd></div>
      </dl>
      <button className="loan-go" disabled={busy || tooLittle || tooMuch} onClick={() => void takeLoan(amount)}>
        Borrow {naira(amount)}
      </button>
      <p className={`loan-note ${tooLittle || tooMuch ? 'bad' : ''}`}>
        {tooMuch ? `The bank will lend you at most ${naira(available)}`
          : tooLittle ? `The smallest loan is ${naira(LOAN.min)}`
          : `Pay late and interest doubles to ${rate * LOAN.overdueFactor}% a week`}
      </p>
    </div>
  );
}

export function LoansPanel() {
  const signedIn = !!useSession((s) => s.user?.username);
  const data = useLoans((s) => s.data);
  const busy = useLoans((s) => s.busy);
  const error = useLoans((s) => s.error);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!signedIn) return;
    void loadLoans();
    const a = setInterval(() => void loadLoans(), 20_000);
    const b = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [signedIn]);
  if (!signedIn) return <p className="muted">Sign in with a username to bank with us.</p>;
  if (!data) return <p className="muted">Checking your credit…</p>;
  const owing = data.owed > 0;
  const state = data.overdue ? 'overdue' : owing ? 'owing' : 'clear';
  return (
    <div className="loans">
      <section className={`loan-hero ${state}`}>
        <small>{owing ? 'You owe the bank' : 'Community Bank loans'}</small>
        <strong>{owing ? naira(data.owed) : 'You owe nothing'}</strong>
        <p>
          {state === 'overdue' ? `Overdue. Interest is now ${data.rate * LOAN.overdueFactor}% every game week until you pay.`
            : state === 'owing' ? `Interest is ${data.rate}% every game week. Pay before it falls due.`
            : `Borrow up to ${naira(data.available)} at ${data.rate}% a game week.`}
        </p>
        <div className="loan-credit">
          <div className="bar"><i style={{ width: `${data.limit ? Math.min(100, (data.owed / data.limit) * 100) : 0}%` }} /></div>
          <span><i>Credit limit {naira(data.limit)}</i><i>{naira(data.available)} left</i></span>
        </div>
      </section>
      {error && <div className="civic-notice civic-error" role="alert">{error}</div>}
      {owing && <h4>Pay back</h4>}
      {/* Keyed by what is owed, so the amount starts afresh after each payment. */}
      {data.loans.map((l) => <LoanCard key={`${l.id}:${l.owed}`} loan={l} rate={data.rate} now={now} busy={busy} />)}
      <h4>{owing ? 'Borrow more' : 'Borrow'}</h4>
      {/* Keyed so the amount starts afresh once the bank will lend again. */}
      <Borrow key={data.overdue || data.available < LOAN.min ? 'shut' : 'open'} data={data} busy={busy} />
      <details className="loan-how">
        <summary>How loans work</summary>
        <ul>
          <li>Interest is added once every game week ({timeLeft(LOAN.periodMs)} of real time). The president sets the rate: {data.rate}% now.</li>
          <li>A loan falls due {LOAN.termWeeks} game weeks after you take it ({timeLeft(LOAN.termWeeks * LOAN.periodMs)}).</li>
          <li>Miss that and the rate is {LOAN.overdueFactor}× until the loan is cleared, and the bank stops lending to you.</li>
          <li>What you pay goes to the interest first, then to the loan itself.</li>
          <li>Your credit limit is {naira(LOAN.baseLimit)} plus half of your cash and savings, up to {naira(LOAN.maxLimit)}.</li>
        </ul>
      </details>
    </div>
  );
}
