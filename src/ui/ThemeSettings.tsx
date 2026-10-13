import { useTheme, type ThemeChoice } from '../game/theme';

const CHOICES: { id: ThemeChoice; label: string; icon: string }[] = [
  { id: 'light', label: 'Light', icon: '☀️' },
  { id: 'dark', label: 'Dark', icon: '🌙' },
  { id: 'system', label: 'Auto', icon: '🌗' },
];

/** Light / dark switch, shared by the profile sheet and the phone's settings. */
export function ThemeSettings() {
  const choice = useTheme((s) => s.choice);
  const setChoice = useTheme((s) => s.setChoice);
  return (
    <div className="settings-option theme-option">
      <span>
        <b>Appearance</b>
        <small>{choice === 'system' ? 'Follows your device' : choice === 'dark' ? 'Dark phone, menus and panels' : 'Light phone, menus and panels'}</small>
      </span>
      <div className="theme-seg" role="radiogroup" aria-label="Appearance">
        {CHOICES.map((c) => (
          <button key={c.id} role="radio" aria-checked={choice === c.id} className={choice === c.id ? 'on' : ''} onClick={() => setChoice(c.id)}>
            <i aria-hidden>{c.icon}</i>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
