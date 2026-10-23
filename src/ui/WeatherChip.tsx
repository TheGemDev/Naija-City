import { useEffect, useState } from 'react';
import { hourOf, useGame } from '../game/store';
import { sceneHour } from '../game/theme';
import { photoHour } from '../game/photo';
import { sceneWeather, temperatureAt, WEATHER } from '../game/weather';
import { Emoji } from './Icons';

/** The part of the day an hour falls in. */
const partOf = (h: number) => (h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 16 ? 'Afternoon' : h < 19 ? 'Evening' : 'Night');

/**
 * The weather in this city right now, in the corner of the map's state card: the sky's icon and how hot it is, with
 * the sky and the time of day on hover. It shows the weather the scene is drawing (game/weather.ts), so the card and
 * the sky always agree.
 */
export function WeatherChip({ city }: { city: string }) {
  // The weather runs on real time, so look again every few seconds; the game clock moves the temperature and the part of the day.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);
  const minutes = useGame((s) => Math.floor(s.minutes / 10) * 10);
  const h = photoHour() ?? sceneHour(hourOf(minutes));
  const kind = sceneWeather(city);
  const w = WEATHER[kind];
  const dark = h < 6 || h >= 18.5;
  const temp = temperatureAt(city, h, kind);
  return (
    <span className="region-weather" aria-live="polite" title={`${w.label} · ${temp}°C · ${partOf(h)}`} aria-label={`${w.label}, ${temp} degrees, ${partOf(h)}`}>
      <Emoji char={dark ? w.night : w.icon} size={18} />
      <b>{temp}°</b>
    </span>
  );
}
