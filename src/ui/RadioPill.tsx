import { useSyncExternalStore } from 'react';
import { audio } from '../game/audio';
import { radioOff, skipRadio, usePlaceRadio } from '../game/radio';
import { Icon } from './Icons';
import './radio-pill.css';

/** HUD sound pill. No radio on → the background music switch, just its icon. A radio on (house speakers, the club) → a "now playing" capsule (level bars, frequency, station) with a skip button. */
export function RadioPill() {
  usePlaceRadio();
  // Follows the audio manager itself, so it's right however the radio was started or stopped.
  useSyncExternalStore(audio.subscribe, audio.getVersion);
  const live = audio.currentLiveStation;
  const loading = audio.liveLoading;

  if (!live) {
    const on = audio.musicOn;
    return (
      <button className="stack-collapse radio-pill-off" type="button" title={on ? 'Mute music' : 'Play music'} aria-label="Music" aria-pressed={on} onClick={() => audio.toggleMusic()}>
        <Icon name={on ? 'music' : 'music-off'} size={16} />
      </button>
    );
  }

  return (
    <div className={`radio-pill ${loading ? 'tuning' : ''}`} role="group" aria-label="Radio">
      <button className="radio-pill-main" type="button" title="Turn radio off" aria-label={`${live.name} playing. Turn radio off`} aria-pressed onClick={radioOff}>
        {loading ? <i className="radio-pill-spin" /> : <span className="radio-pill-eq" aria-hidden="true"><i /><i /><i /><i /></span>}
        <b>{live.freq}</b>
        <span>{loading ? 'Tuning…' : live.name}</span>
      </button>
      <button className="radio-pill-skip" type="button" title="Next station" aria-label="Next station" onClick={() => skipRadio(1)}>
        <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M5 4.5v15l10-7.5zM17 5h2.5v14H17z" /></svg>
      </button>
    </div>
  );
}
