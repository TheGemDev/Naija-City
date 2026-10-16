// The HUD banner for a natural disaster (game/disasters.ts): the warning while there is still time, the disaster while it
// is on, and a short "after" card for one that hit me. It shows the one in the city I am in first, then one heading for a
// house of mine anywhere else. During the warning an owner whose house is in its path can sandbag it for half the damage.

import { useEffect, useState } from 'react';
import { cityMap } from '../game/city';
import { CITY_NAME, type CivicCity } from '../game/civic';
import { DISASTER_RULES, DISASTERS, headline, phaseOf, type Disaster } from '../game/disasters';
import { naira, useGame } from '../game/store';
import { disasterNow, startDisasters, useDisasters } from '../net/disasters';

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The place to look at on the map: the building on fire, or whatever stands nearest the middle of it. */
function nearestPlace(d: Disaster) {
  const map = cityMap(d.city);
  if (d.place && map.placeById[d.place]) return map.placeById[d.place];
  let best = map.places[0];
  let bd = Infinity;
  for (const p of map.places) {
    const dist = Math.hypot(p.x + p.w / 2 - d.x, p.z + p.d / 2 - d.z);
    if (dist < bd) {
      bd = dist;
      best = p;
    }
  }
  return best;
}

export function DisasterBanner() {
  const started = useGame((s) => s.started);
  const city = useGame((s) => s.destinationId);
  const list = useDisasters((s) => s.list);
  const fake = useDisasters((s) => s.fake);
  const threatened = useDisasters((s) => s.threatened);
  const prepared = useDisasters((s) => s.prepared);
  const hits = useDisasters((s) => s.hits);
  const busy = useDisasters((s) => s.busy);
  const [now, setNow] = useState(disasterNow());
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => startDisasters(), []);
  useEffect(() => {
    const id = setInterval(() => setNow(disasterNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const all = [...list, ...fake];
  const live = all.filter((d) => {
    const p = phaseOf(d, now);
    return p === 'warning' || p === 'active';
  });
  const hitMe = (d: Disaster) => hits.some((h) => h.id === d.id && h.what !== 'prep');
  // Here first; then one coming for my house elsewhere; then the aftermath of one that hit me.
  const d = live.find((x) => x.city === city && phaseOf(x, now) === 'warning' && threatened.includes(x.id))
    ?? live.find((x) => x.city === city)
    ?? live.find((x) => threatened.includes(x.id))
    ?? all.find((x) => phaseOf(x, now) === 'aftermath' && x.city === city && hitMe(x));
  if (!started || !d) return null;
  const phase = phaseOf(d, now);
  const key = `${d.id}:${phase}`;
  if (hidden === key) return null;
  const def = DISASTERS[d.kind];
  const here = d.city === city;
  const canPrep = phase === 'warning' && threatened.includes(d.id) && !prepared.includes(d.id);
  const place = here ? nearestPlace(d) : null;
  const show = () => {
    const g = useGame.getState();
    g.setPanel(null);
    if (g.view !== 'city') g.openMap();
    const after = useGame.getState();
    if (after.view === 'city' && place) after.selectPlace(place.id);
  };
  const when = phase === 'warning' ? `Hits in ${mmss(d.strikesAt - now)}` : phase === 'active' ? `${mmss(d.endsAt - now)} left` : 'Aftermath';
  return (
    <div className={`live-banner disaster-banner ${phase}`}>
      <span className="live-banner-icon">{phase === 'warning' ? '⚠️' : def.icon}</span>
      <div className="live-banner-info">
        <b>{phase === 'warning' ? `${def.agency.toUpperCase()} WARNING · ` : phase === 'active' ? 'NOW · ' : ''}{headline(d, phase)}</b>
        <small>{when}{here ? '' : ` · ${CITY_NAME[d.city as CivicCity] ?? d.city}`}{phase === 'active' && here ? ' · Stay out of the red ring' : ''}</small>
        {prepared.includes(d.id) && phase === 'warning' && <small>🛡️ Your house is prepared: half the damage.</small>}
        <div className="disaster-banner-actions">
          {place && phase !== 'aftermath' && <button className="live-banner-go" onClick={show}>📍 Show me</button>}
          {canPrep && (
            <button className="live-banner-go disaster-prep" disabled={busy} onClick={() => void useDisasters.getState().prepare(d.id)}>
              🛡️ {def.prep} ({naira(DISASTER_RULES.prepCost)})
            </button>
          )}
        </div>
      </div>
      <button className="live-banner-close" onClick={() => setHidden(key)} aria-label="Dismiss disaster warning">✕</button>
    </div>
  );
}
