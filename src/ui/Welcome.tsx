import { useState } from 'react';
import { NEW_LIFE_ORIGIN, ORIGINS, type OriginId } from '../game/origins';
import { startGuide } from '../game/guide';
import { naira, useGame } from '../game/store';
import { defaultAppearance, encodeLook, fits, GARMENT_BY_ID, HAIR_COLORS, HAIRS, isFullOutfit, randomAppearance, SHAPE_LABELS, SKINS, SLOTS, starterGarments, type Appearance, type Body, type Garment, type Outfit, type Shape, type Slot } from '../game/wardrobe';
import { useSession } from '../net/session';
import { drawOriginOnServer, walletOrigin, walletState } from '../net/wallet';
import { REGION_IDS, regionOf } from '../game/regions';
import { PersonPreview, swatch } from './Closet';
import { PHONE_BY_ID } from '../game/phones';
import { MiniPhone } from './PhoneShop';
import { BirthCert } from './BirthCert';
import { Emoji } from './Icons';

type Step = 'you' | 'cert';
type Tab = 'body' | 'hair' | 'outfit' | 'extras';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'body', label: 'Body', icon: '🧍🏾' },
  { id: 'hair', label: 'Hair', icon: '💇🏾' },
  { id: 'outfit', label: 'Outfit', icon: '👕' },
  { id: 'extras', label: 'Extras', icon: '🕶️' },
];
/** Which clothes each tab of the look picker offers; a new person may go without any of the extras. */
const OUTFIT_SLOTS: Slot[] = ['top', 'bottom', 'shoes'];
const EXTRA_SLOTS: Slot[] = ['head', 'eyes', 'neck', 'wrist', 'bag'];

/** New life: make your person, then you're born (the same Fresh Start for everyone, in a drawn state), and your birth certificate says so. */
export function Welcome() {
  const started = useGame((s) => s.started);
  const begin = useGame((s) => s.begin);
  const status = useSession((s) => s.status);
  const userName = useSession((s) => s.user?.name);
  const [step, setStep] = useState<Step>('you');
  const [tab, setTab] = useState<Tab>('body');
  const [typed, setName] = useState<string | null>(null);
  const name = typed ?? (userName ?? '').split(' ')[0].slice(0, 18);
  const [me, setMe] = useState<Appearance>(() => randomAppearance());
  const [origin, setOrigin] = useState<OriginId | null>(null);
  /** The state you are born in, drawn with the origin. */
  const [state, setState] = useState('kaduna');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (started || status !== 'ready') return null;

  const look = encodeLook(me);
  // Already drawn on the server for this life (e.g. a new life within a day): the draw gives the same again.
  const locked = walletOrigin();

  const draw = async () => {
    // Once drawn it stays drawn: coming back to change your look is not another roll.
    if (origin) return setStep('cert');
    setBusy(true);
    setError(null);
    try {
      const drawn = await drawOriginOnServer();
      setOrigin(drawn ?? NEW_LIFE_ORIGIN);
      // The server draws the state too. A guest's is drawn here; a life from before there were states is Kaduna's.
      setState(drawn ? walletState() ?? 'kaduna' : REGION_IDS[Math.floor(Math.random() * REGION_IDS.length)]);
      setStep('cert');
    } catch {
      setError('Network wahala. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  // Changing body keeps everything that still fits, and fills what does not from that body's plain starter look.
  const setBody = (body: Body) => {
    if (body === me.body) return;
    const d = defaultAppearance(body);
    const kept: Outfit = {};
    for (const id of Object.values(me.outfit)) {
      const gm = id ? GARMENT_BY_ID[id] : undefined;
      if (gm && fits(gm, body)) kept[gm.slot] = gm.id;
    }
    const hair = HAIRS.some((h) => h.id === me.hair && (!h.body || h.body === body)) ? me.hair : d.hair;
    setMe({ ...me, body, hair, outfit: { ...d.outfit, ...kept } });
  };
  const pool = starterGarments(me.body);
  const wear = (gm: Garment) => {
    const outfit = { ...me.outfit, [gm.slot]: gm.id };
    // Coming out of a gown or abaya, which is worn with nothing under it.
    if (gm.slot === 'top' && !isFullOutfit(gm.id)) outfit.bottom ??= defaultAppearance(me.body).outfit.bottom;
    setMe({ ...me, outfit });
  };
  const takeOff = (slot: Slot) => setMe({ ...me, outfit: { ...me.outfit, [slot]: undefined } });
  const pieces = (slot: Slot) => (
    <Pieces key={slot} label={slot === 'top' ? 'Style' : SLOTS.find((sl) => sl.id === slot)!.label} items={pool.filter((gm) => gm.slot === slot)} worn={me.outfit[slot]} onPick={wear} onNone={EXTRA_SLOTS.includes(slot) ? () => takeOff(slot) : undefined} />
  );

  return (
    <div className={`welcome wiz ${step === 'cert' ? 'on-cert' : ''}`}>
      <aside className="wiz-stage">
        <header className="wiz-head">
          <div className="logo">
            Naija<span>City</span>
          </div>
          <ol className="steps">
            {(['you', 'cert'] as Step[]).map((s, i, all) => (
              <li key={s} className={s === step ? 'on' : all.indexOf(step) > i ? 'done' : ''}>
                <i>{i + 1}</i>
                <span>{STEP_LABELS[s]}</span>
              </li>
            ))}
          </ol>
        </header>
        <div className="wiz-model">
          <PersonPreview look={look} height="100%" />
          {step === 'you' && (
            <span className="wiz-hint">
              <Emoji char="↔️" size={14} /> Drag to turn
            </span>
          )}
          {name.trim() && <span className="wiz-name">{name.trim()}</span>}
        </div>
      </aside>
      <main className="wiz-panel">

        {step === 'you' && (
          <>
            <div className="fate-intro">
              <h3 className="fate-title">Make your person</h3>
              <p className="muted small">
                Welcome! <Emoji char="👋🏾" size={16} /> Pick a name and a look.
              </p>
            </div>
            <section className="wiz-section">
              <span className="opt-label">Your name</span>
              <input className="wiz-input" value={name} maxLength={18} placeholder="e.g. Musa" onChange={(e) => setName(e.target.value)} />
            </section>
            <div className="wiz-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                  <Emoji char={t.icon} size={16} />
                  {t.label}
                </button>
              ))}
              <button className="dice" aria-label="Randomise my look" title="Randomise my look" onClick={() => setMe(randomAppearance())}>
                <Emoji char="🎲" size={18} />
              </button>
            </div>
            {tab === 'body' && (
              <>
                <section className="wiz-section">
                  <span className="opt-label">Body</span>
                  <div className="looks">
                    <button className={me.body === 'm' ? 'on' : ''} onClick={() => setBody('m')}>
                      <span className="choice-emoji">
                        <Emoji char="👨🏾" size={26} />
                      </span>
                      Man
                    </button>
                    <button className={me.body === 'f' ? 'on' : ''} onClick={() => setBody('f')}>
                      <span className="choice-emoji">
                        <Emoji char="👩🏾" size={26} />
                      </span>
                      Woman
                    </button>
                  </div>
                </section>
                <section className="wiz-section">
                  <span className="opt-label">Skin tone</span>
                  <div className="swatches">
                    {SKINS.map((c, i) => (
                      <button key={c} aria-label={`Skin ${i + 1}`} className={me.skin === i ? 'on' : ''} style={{ background: c }} onClick={() => setMe({ ...me, skin: i })} />
                    ))}
                  </div>
                </section>
              </>
            )}
            {tab === 'hair' && (
              <>
                <section className="wiz-section">
                  <span className="opt-label">Hairstyle</span>
                  <div className="pills">
                    {HAIRS.filter((h) => !h.body || h.body === me.body).map((h) => (
                      <button key={h.id} className={me.hair === h.id ? 'on' : ''} onClick={() => setMe({ ...me, hair: h.id })}>
                        {h.label}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="wiz-section">
                  <span className="opt-label">Hair colour</span>
                  <div className="swatches">
                    {HAIR_COLORS.map((c, i) => (
                      <button key={c} aria-label={`Hair colour ${i + 1}`} className={me.hairColor === i ? 'on' : ''} style={{ background: c }} onClick={() => setMe({ ...me, hairColor: i })} />
                    ))}
                  </div>
                </section>
              </>
            )}
            {tab === 'outfit' && OUTFIT_SLOTS.filter((slot) => slot !== 'bottom' || !isFullOutfit(me.outfit.top)).map(pieces)}
            {tab === 'extras' && EXTRA_SLOTS.map(pieces)}
            <p className="muted small">Buy more clothes later at the market, the mall or the boutique.</p>
            {error && <p className="auth-msg">{error}</p>}
            <div className="row-btns wiz-foot">
              <button className="btn big go" disabled={busy || !name.trim()} onClick={() => void draw()}>
                {busy ? (
                  'Being born…'
                ) : origin || locked ? (
                  'Next →'
                ) : (
                  <>
                    <Emoji char="👶🏾" size={20} /> Start my life
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {step === 'cert' && origin && (
          <BirthCert name={name.trim()} look={look} origin={origin} state={state} summary={<Drawn origin={origin} state={state} />} onBack={() => setStep('you')} onStart={() => (begin(name, look, origin, state), startGuide(true))} />
        )}
      </main>
    </div>
  );
}

/** Choose a piece by kind, then by colour among that kind. `onNone` adds a "None" kind, for wearing nothing there. */
function Pieces({ label, items, worn, onPick, onNone }: { label: string; items: Garment[]; worn?: string; onPick: (gm: Garment) => void; onNone?: () => void }) {
  const current = items.find((gm) => gm.id === worn);
  const kinds = (Object.keys(SHAPE_LABELS) as Shape[]).filter((shape) => items.some((gm) => gm.shape === shape));
  if (!items.length) return null;
  return (
    <section className="wiz-section">
      <span className="opt-label">
        {label}
        {current && <b>{current.name}</b>}
      </span>
      <div className="pills">
        {onNone && (
          <button className={current ? '' : 'on'} onClick={onNone}>
            None
          </button>
        )}
        {kinds.map((shape) => (
          <button key={shape} className={current?.shape === shape ? 'on' : ''} onClick={() => current?.shape !== shape && onPick(items.find((gm) => gm.shape === shape)!)}>
            {SHAPE_LABELS[shape]}
          </button>
        ))}
      </div>
      {current && (
        <div className="swatches">
          {items
            .filter((gm) => gm.shape === current.shape)
            .map((gm) => (
              <button key={gm.id} aria-label={gm.name} title={gm.name} className={gm.id === worn ? 'on' : ''} style={swatch(gm)} onClick={() => onPick(gm)} />
            ))}
        </div>
      )}
    </section>
  );
}

const STEP_LABELS: Record<Step, string> = { you: 'You', cert: 'Certificate' };

/** Your start in life, and the money, home and phone that come with it. */
function Drawn({ origin, state }: { origin: OriginId; state: string }) {
  const o = ORIGINS[origin];
  const phone = PHONE_BY_ID[o.phone];
  return (
    <>
      <div className="origin-card landed" style={{ ['--oc' as string]: o.color }}>
        <span className="origin-emoji">
          <Emoji char={o.emoji} size={56} />
        </span>
        <b>{o.label}</b>
        <small>Born in {regionOf(state).name}</small>
        <i>{o.tagline}</i>
      </div>
      <div className="origin-facts">
        <div>
          <small>Starting money</small>
          <b>{naira(o.money)}</b>
        </div>
        <div>
          <small>Home</small>
          <b>{o.home}</b>
        </div>
        {phone && (
          <div className="origin-phone">
            <MiniPhone phone={phone} size={40} />
            <span>
              <small>Your phone</small>
              <b>{phone.name}</b>
            </span>
          </div>
        )}
      </div>
      <ul className="perks">
        {o.perks.map((p) => (
          <li key={p}>
            <Emoji char="✅" size={16} /> {p}
          </li>
        ))}
        {o.catches.map((c) => (
          <li key={c} className="catch">
            <Emoji char="⚠️" size={16} /> {c}
          </li>
        ))}
      </ul>
    </>
  );
}
