import { useEffect, useState } from 'react';
import './stats.css';

interface StatsData { online: number; visitsToday: number; visitsTotal: number }

const nf = new Intl.NumberFormat('en-NG');

export default function Stats() {
  const [data, setData] = useState<StatsData | null>(null);
  const [updated, setUpdated] = useState<number | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch('/api/stats');
        if (!res.ok) return;
        const d = (await res.json()) as StatsData;
        if (!stop) { setData(d); setUpdated(Date.now()); }
      } catch { /* offline: keep the last numbers */ }
    };
    void load();
    const id = setInterval(load, 10_000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  const cards: [string, number | undefined, boolean?][] = [
    ['Players online now', data?.online, true],
    ['Page views today', data?.visitsToday],
    ['Page views all time', data?.visitsTotal],
  ];

  return (
    <main className="stats-page">
      <header className="stats-head">
        <a className="stats-brand" href="https://naija.city">Naija City</a>
        <span className="stats-live"><i /> LIVE</span>
      </header>
      <h1>How Naija City is growing, live.</h1>
      <p className="stats-sub">Real numbers from the game, updated every 10 seconds.</p>
      <div className="stats-grid">
        {cards.map(([label, value, dot]) => (
          <div className="stats-card" key={label}>
            <span className="stats-label">{dot && <i className="stats-dot" />}{label}</span>
            <b>{value === undefined ? '–' : nf.format(value)}</b>
          </div>
        ))}
      </div>
      <a className="stats-play" href="https://naija.city">Play Naija City</a>
      {updated && <p className="stats-foot">Updated {new Date(updated).toLocaleTimeString()}</p>}
    </main>
  );
}
