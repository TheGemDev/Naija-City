// A number set with − and + either side of it (hold one down to keep going), or typed in by tapping the number.
// Used across the Civic app in place of rows of fixed choices. `commitAfter` saves on its own once the value has
// sat still that long (laws, pay); without it the parent reads the value when its own button is pressed.

import { useEffect, useRef, useState } from 'react';
import './stepper.css';

export function Stepper({ value, min, max, step = 1, format, label, disabled, commitAfter, onChange, tone }: {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** How the number is shown (₦, %…); the input while typing takes the bare number. */
  format(v: number): string;
  label: string;
  disabled?: boolean;
  /** Save this long (ms) after the last change, rather than on every tap. */
  commitAfter?: number;
  onChange(v: number): void;
  tone?: 'danger';
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  // With commitAfter, the value shown is a draft until it is saved; a change from outside replaces it.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const shown = commitAfter ? draft : value;
  const [typing, setTyping] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const repeat = useRef<ReturnType<typeof setInterval>>(undefined);
  const latest = useRef(shown);
  latest.current = shown;

  const set = (v: number) => {
    const next = clamp(v);
    if (!commitAfter) return next !== value && onChange(next);
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => next !== value && onChange(next), commitAfter);
  };
  useEffect(() => () => {
    clearTimeout(timer.current);
    clearInterval(repeat.current);
  }, []);

  // Hold a button and it keeps stepping, faster once it has been held a moment.
  const hold = (by: number) => {
    set(latest.current + by);
    let ticks = 0;
    clearInterval(repeat.current);
    repeat.current = setInterval(() => {
      ticks += 1;
      if (ticks > 4) set(latest.current + by * (ticks > 20 ? 5 : 1));
    }, 90);
  };
  const release = () => clearInterval(repeat.current);
  const pad = (by: number, sign: string, name: string) => (
    <button
      type="button"
      aria-label={`${name} ${label}`}
      disabled={disabled || (by < 0 ? shown <= min : shown >= max)}
      onPointerDown={(e) => { e.preventDefault(); hold(by); }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && set(latest.current + by)}
    >
      {sign}
    </button>
  );

  const finish = () => {
    if (typing !== null && typing.trim() !== '' && Number.isFinite(Number(typing))) set(Number(typing));
    setTyping(null);
  };
  return (
    <div className={`stepper ${tone ?? ''}`} role="group" aria-label={label}>
      {pad(-step, '−', 'Less')}
      {typing === null ? (
        <button type="button" className="stepper-value" disabled={disabled} onClick={() => setTyping(String(shown))} aria-label={`${label}: ${format(shown)}. Tap to type`}>
          {format(shown)}
        </button>
      ) : (
        <input
          className="stepper-value"
          autoFocus
          inputMode="numeric"
          value={typing}
          aria-label={label}
          onChange={(e) => setTyping(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish();
            if (e.key === 'Escape') setTyping(null);
          }}
        />
      )}
      {pad(step, '+', 'More')}
    </div>
  );
}
