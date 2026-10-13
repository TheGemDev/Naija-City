import { useLowPerf, useQuality } from '../game/quality';

/** The performance switches, shared by the profile sheet and the phone's settings. */
export function PerfSettings() {
  const quality = useQuality((s) => s.quality);
  const setQuality = useQuality((s) => s.setQuality);
  const saver = useQuality((s) => s.batterySaver);
  const setSaver = useQuality((s) => s.setBatterySaver);
  const batteryLow = useQuality((s) => s.batteryLow);
  const low = useLowPerf();
  return (
    <>
      <label className="settings-option">
        <span>
          <b>Low performance mode</b>
          <small>{quality === 'auto' && saver && batteryLow ? 'On while your battery is low' : 'No shadows, lower resolution. Smoother on older phones.'}</small>
        </span>
        <input type="checkbox" role="switch" aria-label="Low performance mode" checked={low} onChange={(e) => setQuality(e.target.checked ? 'low' : 'high')} />
      </label>
      <label className="settings-option">
        <span>
          <b>Auto low mode on low battery</b>
          <small>Switches at 20% when not charging (Android and desktop Chrome)</small>
        </span>
        <input type="checkbox" role="switch" aria-label="Auto low mode on low battery" checked={saver} onChange={(e) => setSaver(e.target.checked)} />
      </label>
    </>
  );
}
