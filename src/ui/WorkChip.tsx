// The call to work: a chip that stays on screen from an hour before your shift until you have clocked in, and takes
// you there when you tap it (game/work.ts). In another city that is the whole trip by air; in this one, the travel sheet.

import { useMemo } from 'react';
import { cityMap } from '../game/city';
import { employment, shiftHours } from '../game/jobs';
import { regionOf } from '../game/regions';
import { useGame } from '../game/store';
import { useTrip } from '../game/trip';
import { goToWork, useCommute, workKey, workStatus } from '../game/work';
import { Emoji } from './Icons';
import './shiftgame.css';

export function WorkChip() {
  // Changes only when what the job wants of you changes, not every tick of the clock.
  const key = useGame(workKey);
  // Already on the way there: by road in this city, or on the trip from another.
  const onTheWay = useGame((s) => {
    const work = employment(s);
    return !!work && s.task?.actionId === 'enter' && s.task.placeId === work.place.id && cityMap(s.destinationId).id === work.city;
  });
  const flying = useTrip((s) => {
    const work = employment(useGame.getState());
    return !!work && s.going?.city === work.city && s.going.place?.id === work.place.id;
  });
  const status = useMemo(() => (key ? workStatus(useGame.getState()) : null), [key]);
  if (!status || onTheWay || flying) return null;
  const { call, job, place, city, away } = status;
  const where = away ? `${place.name}, ${regionOf(city).name}` : place.name;
  const title = call === 'soon' ? `Work at ${job.start}:00` : call === 'early' ? 'You are early' : call === 'here' ? 'You are at work' : 'Time for work';
  const sub = call === 'early' ? `You clock in at ${job.start}:00` : call === 'here' ? 'Tap to clock in' : `Tap to go · ${where}`;
  return (
    <div className={`work-chip ${call}`}>
      <button className="work-chip-go" onClick={goToWork} aria-label={`${title}. ${sub}`}>
        <span className="work-chip-ico"><Emoji char={call === 'soon' || call === 'early' ? '⏰' : away ? '✈️' : job.icon} size={22} /></span>
        <span>
          <b>{title}</b>
          <small>{sub}</small>
        </span>
      </button>
    </div>
  );
}

/** A line for the travel sheets when the place they are for is where you work. */
export function WorkNote({ city, placeId }: { city: string; placeId: string }) {
  const jobId = useGame((s) => s.jobId);
  const jobCity = useGame((s) => s.jobCity);
  const key = useGame(workKey);
  // Only a trip you set off on for work clocks you in at the door (game/work.ts).
  const commuting = useCommute((s) => s.day !== null);
  const work = employment({ jobId, jobCity });
  if (!work || work.city !== city || work.place.id !== placeId) return null;
  const due = commuting && (key.startsWith('go:') || key.startsWith('soon:'));
  return (
    <p className="work-note">
      <Emoji char="💼" size="1em" /> You work here: {work.job.title}, {shiftHours(work.job)}.{due ? ' You are clocked in as you walk in.' : ''}
    </p>
  );
}
