import { useEffect, useState, type FormEvent } from 'react';
import { create } from 'zustand';
import { authMessage, linkEmail, linkGoogle, resetPassword, signInEmail, signInGoogle, signUpEmail } from '../net/firebase';
import { claimUsername, submitBirthdate, useSession } from '../net/session';
import { signOut } from '../net/firebase';
import { randomUsername } from '../game/usernames';
import { useGame } from '../game/store';
import { Emoji } from './Icons';
import { BootScreen } from './BootScreen';

/** The landing screen opens this card in sign-up or log-in mode. */
export const useAuthUi = create<{
  open: boolean;
  mode: 'in' | 'up';
  /** Username typed on the sign-up form, claimed automatically once the account exists. */
  pendingUsername: string | null;
  show(mode: 'in' | 'up'): void;
  hide(): void;
}>((set) => ({
  open: false,
  mode: 'in',
  pendingUsername: null,
  show: (mode) => set({ open: true, mode }),
  hide: () => set({ open: false }),
}));

/** Sign-in states other than the form. The form itself (AuthSheet) lives inside the landing screen so the town stays on screen. */
export function Auth() {
  const status = useSession((s) => s.status);
  const offline = useSession((s) => s.offline);

  if (status === 'needsAge') return <AgeGate />;
  if (status === 'needsUsername') return <PickUsername />;
  if (status === 'loading' || status === 'syncing') {
    return (
      <BootScreen
        status={offline ? 'Can’t reach Naija City' : status === 'syncing' ? 'Loading your house…' : 'Starting…'}
        sub={offline ? 'Something went wrong on our side or your connection dropped. We’re trying again automatically.' : undefined}
        warn={offline}
      />
    );
  }
  return null;
}

/** The create-account / log-in form, shown in the landing's bottom sheet. */
export function AuthSheet() {
  const shown = useAuthUi((s) => s.open);
  const startMode = useAuthUi((s) => s.mode);
  const [mode, setMode] = useState<'in' | 'up'>(startMode);
  useEffect(() => setMode(startMode), [shown, startMode]);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ text: authMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const handle = username.trim().toLowerCase().replace(/^@/, '');
  const handleOk = USERNAME_RE.test(handle);
  const strength = passwordStrength(password);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'in') return run(() => signInEmail(email.trim(), password));
    if (!handleOk) return setMsg({ text: 'Pick a username: 3–15 letters, numbers or _.' });
    if (password.length < 8) return setMsg({ text: 'Use at least 8 characters for your password.' });
    if (!agreed) return setMsg({ text: 'You need to agree to the Terms and Privacy Policy.' });
    useAuthUi.setState({ pendingUsername: handle });
    run(() => signUpEmail(email.trim(), password, name.trim()));
  };

  const forgot = () => {
    if (!email.trim()) return setMsg({ text: 'Type your email first, then tap “Forgot password”.' });
    run(async () => {
      await resetPassword(email.trim());
      setMsg({ text: 'Check your email for a reset link.', ok: true });
    });
  };

  return (
    <div className="auth-sheet-body">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'on' : ''} onClick={() => (setMode('up'), setMsg(null))}>
            Create account
          </button>
          <button type="button" role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'on' : ''} onClick={() => (setMode('in'), setMsg(null))}>
            Log in
          </button>
        </div>

        {mode === 'up' && (
          <>
            <label>
              Your name
              <input value={name} maxLength={18} placeholder="e.g. Musa Danjuma" autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Username
              <div className={`at-input ${handle ? (handleOk ? 'ok' : 'bad') : ''}`}>
                <span>@</span>
                <input
                  value={username}
                  maxLength={16}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="musa_kd"
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, ''))}
                />
                {handle && <b>{handleOk ? '✓' : '✕'}</b>}
              </div>
              <small>This is how players find you, message you and send you money.</small>
            </label>
          </>
        )}
        <label>
          Email
          <input type="email" required value={email} placeholder="you@email.com" autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
          {mode === 'up' && <small>Only for logging in and password reset. We never send you codes.</small>}
        </label>
        <label>
          Password
          <div className="pw-input">
            <input
              type={showPw ? 'text' : 'password'}
              required
              minLength={mode === 'up' ? 8 : 6}
              value={password}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw(!showPw)}>
              {showPw ? '🙈' : '👁️'}
            </button>
          </div>
          {mode === 'up' && (
            <>
              <span className={`pw-meter s${password ? strength.level : 0}`}><i /><i /><i /></span>
              <small>{password ? strength.text : 'At least 8 characters. Not 123456 😅'}</small>
            </>
          )}
        </label>

        {mode === 'up' && (
          <label className="check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span>
          </label>
        )}

        {msg && <p className={`auth-msg ${msg.ok ? 'ok' : ''}`}>{msg.text}</p>}
        <button className="btn big" disabled={busy}>
          {busy ? 'One moment…' : mode === 'in' ? 'Log in' : 'Play Now'}
        </button>
        {mode === 'in' && (
          <button type="button" className="auth-forgot" onClick={forgot}>
            Forgot password?
          </button>
        )}

        <div className="or">
          <span>or</span>
        </div>
        <button type="button" className="btn big google" disabled={busy} onClick={() => run(signInGoogle)}>
          <GoogleMark /> Continue with Google
        </button>
      </form>

      <p className="auth-foot">Your player will live in the same Naija City as everyone else who signs up.</p>
      <p className="auth-foot">
        <a href="/terms" target="_blank" rel="noreferrer">Terms</a> · <a href="/privacy" target="_blank" rel="noreferrer">Privacy</a>
      </p>
    </div>
  );
}

function passwordStrength(pw: string): { level: 1 | 2 | 3; text: string } {
  if (pw.length < 8 || /^(123456|password|12345678)$/i.test(pw)) return { level: 1, text: 'Too easy to guess. Add more characters.' };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  return pw.length >= 12 || kinds >= 3 ? { level: 3, text: 'Strong. Nice one.' } : { level: 2, text: 'Okay. A number or symbol makes it stronger.' };
}

const USERNAME_RE = /^[a-z0-9_]{3,15}$/;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Years on offer in the date of birth: this year, then back a century. */
const BIRTH_YEARS = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i);

/** Full years since a date of birth, or null when the day doesn't exist (31 February) or hasn't happened yet. */
function ageFrom(year: number, month: number, day: number): number | null {
  const born = new Date(year, month - 1, day);
  if (born.getFullYear() !== year || born.getMonth() !== month - 1 || born.getDate() !== day) return null;
  const now = new Date();
  const hadBirthday = now.getMonth() > month - 1 || (now.getMonth() === month - 1 && now.getDate() >= day);
  const age = now.getFullYear() - year - (hadBirthday ? 0 : 1);
  return age >= 0 && age < 130 ? age : null;
}

/** Asked once after sign-up (email or Google): date of birth + agreeing to the terms. The gate stays shut until both are in. */
function AgeGate() {
  const user = useSession((s) => s.user);
  const logOut = useSession((s) => s.logOut);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filled = !!day && !!month && !!year;
  const age = filled ? ageFrom(Number(year), Number(month), Number(day)) : null;
  const ok = age != null && agree;
  const handle = user?.username ?? user?.name ?? user?.email?.split('@')[0];
  const next = busy ? 'Opening the gate…' : 'Continue';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setError(await submitBirthdate(Number(year), Number(month), Number(day)));
    setBusy(false);
  };

  return (
    <div className="welcome">
      <form className="welcome-card age-gate" onSubmit={submit}>
        <div className="logo">
          Naija<span>City</span>
        </div>
        <span className="age-eyebrow">City gate</span>
        <h2 className="age-title">{handle ? `${handle}, when` : 'When'} were you born?</h2>
        <p className="tag">We ask only once, and other players never see it.</p>
        <div className="dob-row">
          <label>
            Day
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="">DD</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </label>
          <label>
            Month
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Year
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">YYYY</option>
              {BIRTH_YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>
        {filled && age == null && <p className="age-verdict">That date does not exist. Check it again.</p>}
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> (including the disclaimer) and the <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span>
        </label>
        {error && <p className="auth-msg">{error}</p>}
        <button className="btn big" disabled={busy || !ok}>{next}</button>
        <button type="button" className="guest" onClick={() => logOut()}>
          Not now, log me out
        </button>
      </form>
    </div>
  );
}

/** Every signed-in player needs a unique @username: it's how other players find, message and pay them. */
function PickUsername() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = value.trim().toLowerCase().replace(/^@/, '');
  const valid = USERNAME_RE.test(clean);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(await claimUsername(clean));
    setBusy(false);
  };

  const guest = useSession((s) => !!s.user?.guest);
  /** A guest is handed a random handle so nothing stands between them and the game; they can change it later. */
  const [auto, setAuto] = useState(guest);
  useEffect(() => {
    if (!guest) return;
    let live = true;
    (async () => {
      for (let i = 0; i < 6 && live; i++) {
        const err = await claimUsername(randomUsername());
        if (!err) return;
        if (!/taken/i.test(err)) break;
      }
      if (live) setAuto(false);
    })();
    return () => {
      live = false;
    };
  }, [guest]);

  // They already picked one on the sign-up form: claim it without asking again (only falls back to this screen if it's taken).
  useEffect(() => {
    const pending = useAuthUi.getState().pendingUsername;
    if (!pending) return;
    useAuthUi.setState({ pendingUsername: null });
    setValue(pending);
    setBusy(true);
    claimUsername(pending).then((err) => {
      setError(err);
      setBusy(false);
    });
  }, []);

  if (auto) return <BootScreen status="Getting your player ready…" />;

  return (
    <div className="welcome">
      <form className="welcome-card" onSubmit={submit}>
        <div className="logo">
          Naija<span>City</span>
        </div>
        <p className="tag">Pick your username. Other players use it to find you, message you and send you money.</p>
        <label>
          Username
          <div className="at-input">
            <span>@</span>
            <input
              autoFocus
              value={value}
              maxLength={16}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="musa_kd"
              onChange={(e) => (setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, '')), setError(null))}
            />
            <button type="button" className="at-dice" aria-label="Suggest a random username" title="Suggest a username" disabled={busy} onClick={() => (setValue(randomUsername()), setError(null))}>
              <Emoji char="🎲" size={22} />
            </button>
          </div>
        </label>
        <p className="muted small">3–15 characters: letters, numbers and _. You can’t share one with anyone else.</p>
        {error && <p className="auth-msg">{error}</p>}
        <button className="btn big" disabled={busy || !valid}>
          {busy ? 'Checking…' : 'Claim username'}
        </button>
        <button type="button" className="guest" onClick={() => signOut()}>
          Use a different account
        </button>
      </form>
    </div>
  );
}

/** Settings card for a guest: attach Google or an email to this same player so the life survives logging out or changing phone. */
export function LinkAccount() {
  const guest = useSession((s) => !!s.user?.guest);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!guest) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      useGame.getState().toast('✅ Progress saved to your account');
    } catch (e) {
      setMsg(authMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setMsg('Use at least 8 characters for your password.');
    void run(() => linkEmail(email.trim(), password));
  };

  return (
    <>
      <h4>Save your progress</h4>
      <div className="list-card">
        <p className="muted small" style={{ padding: '4px 12px' }}>You are playing as a guest. Add Google or an email so you never lose this life, even on a new phone.</p>
        <div className="row-btns" style={{ padding: '0 12px 12px' }}>
          <button type="button" className="btn google" disabled={busy} onClick={() => void run(linkGoogle)}>
            <GoogleMark /> Save with Google
          </button>
          {!open && (
            <button type="button" className="btn" onClick={() => setOpen(true)}>
              Use email
            </button>
          )}
        </div>
        {open && (
          <form className="auth-card" onSubmit={submit}>
            <label>
              Email
              <input type="email" required value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Password
              <input type="password" required minLength={8} value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className="btn big" disabled={busy}>{busy ? 'One moment…' : 'Save progress'}</button>
          </form>
        )}
        {msg && <p className="auth-msg" style={{ padding: '0 12px 12px' }}>{msg}</p>}
      </div>
    </>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
