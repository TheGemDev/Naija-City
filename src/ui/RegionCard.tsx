import { useGame, nairaShort } from '../game/store';
import { PRODUCES } from '../game/trade';
import { populationOf } from '../game/npcs';
import type { regionOf } from '../game/regions';
import { useCivic } from '../net/civic';
import { useSession } from '../net/session';
import { CITY_HEAD, OFFICE_ICON, type PoliticalOffice } from '../game/civic';
import { copyLink, stateLink } from '../net/deeplink';
import { Emoji } from './Icons';
import { WeatherChip } from './WeatherChip';
import './region-card.css';

type City = keyof typeof CITY_HEAD;
const compact = new Intl.NumberFormat('en-NG', { notation: 'compact', maximumFractionDigits: 1 });

/** Who is in charge here: the president, and under them whoever runs this city. Nothing until the civic snapshot is in. */
function Leaders({ city }: { city: City }) {
  const policies = useCivic((s) => s.data?.policies);
  if (!policies) return null;
  const head = CITY_HEAD[city];
  const leader = (office: PoliticalOffice, title: string) => {
    const holder = policies[office];
    const who = holder?.username ? `@${holder.username}` : holder?.name;
    return (
      <span className="rc-leader" title={`${title}: ${who ?? 'vacant'}`}>
        <Emoji char={OFFICE_ICON[office]} size={14} />
        <span>
          <small>{title}</small>
          <b className={who ? '' : 'vacant'}>{who ?? 'Vacant'}</b>
        </span>
      </span>
    );
  };
  return <div className="rc-leaders">{leader('president', 'President')}{leader(head, head === 'minister' ? 'Minister' : 'Governor')}</div>;
}

/** What this state makes (as icons), how many people live there and what its treasury holds, once the civic snapshot is in. */
function Facts({ city }: { city: City }) {
  const balance = useCivic((s) => s.data?.states?.[city]?.balance);
  const people = useCivic((s) => s.data?.states?.[city]?.people);
  return (
    <div className="rc-facts">
      <span className="rc-goods" title={`Makes ${PRODUCES[city].map((p) => p.label).join(', ')}`}>
        {PRODUCES[city].map((p) => <Emoji key={p.label} char={p.icon} size={14} />)}
      </span>
      {people && <span title={`${populationOf(people).toLocaleString('en-NG')} people live here`}><Emoji char="👥" size={12} /> {compact.format(populationOf(people))}</span>}
      {balance !== undefined && <span title="State treasury"><Emoji char="💰" size={12} /> {nairaShort(balance)}</span>}
    </div>
  );
}

/**
 * The state's card over the map: its name and nickname with the weather beside them, who runs it, what it makes and
 * what it has in the bank. In the game it also carries the ways into the Politics app (run for a post, this state's
 * laws) and copies this state's invite link: whoever signs up from it is born here. On the title screen it is only a sign.
 */
export function RegionCard({ region }: { region: ReturnType<typeof regionOf> }) {
  const started = useGame((s) => s.started);
  const username = useSession((s) => s.user?.username);
  const [nickname] = region.tagline.split(' · ');
  const city = region.id as City;
  const open = (want: Partial<{ wantLaws: PoliticalOffice }>) => {
    useCivic.setState({ wantOpen: true, ...want });
    useGame.getState().setPanel('phone');
  };
  // Like the place labels: a tap on the card is for the card, not a drag of the map under it.
  const keep = { onPointerDown: (e: { stopPropagation(): void }) => e.stopPropagation(), onMouseDown: (e: { stopPropagation(): void }) => e.stopPropagation(), onTouchStart: (e: { stopPropagation(): void }) => e.stopPropagation() };
  return (
    <div className="region-card" {...(started ? keep : {})}>
      <div className="rc-head">
        <span>
          <b>{region.name}</b>
          <small>{nickname}</small>
        </span>
        <WeatherChip city={region.id} />
      </div>
      <Leaders city={city} />
      <Facts city={city} />
      {started && (
        <div className="rc-actions">
          <button type="button" onClick={() => open({})}><Emoji char="🗳️" size={13} /> Run</button>
          <button type="button" onClick={() => open({ wantLaws: CITY_HEAD[city] })}><Emoji char="⚖️" size={13} /> Laws</button>
          <button
            type="button"
            title={`Copy a link that has whoever joins with it born in ${region.name}`}
            onClick={() => void copyLink(stateLink(region.id, username), `Be born in ${region.name} on Naija City`, `🔗 Copied. Whoever joins with it is born in ${region.name}`)}
          >
            <Emoji char="🔗" size={13} /> Invite
          </button>
        </div>
      )}
    </div>
  );
}
