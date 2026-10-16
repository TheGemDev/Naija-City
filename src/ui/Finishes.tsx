// Decorate → Finishes: tap rooms or a wall in the house, try floors, wall finishes, paint, POP ceilings and the
// night mood on them live, then pay for what you like. Also the shared colour picker (24 colours and a custom one)
// used for walls and furniture, and the controls on a lamp.

import { useEffect, useMemo, useState } from 'react';
import { activeDesignOf, houseKeyOf, naira, useGame } from '../game/store';
import { houseLayout, type PlacedItem } from '../game/grid';
import {
  CEILINGS, FLOORS, LIGHT_TONES, MOODS, PAINT_RATE, WALLS, finishCost, interiorRooms, lampLevel, lampTone, moodOf,
  roomAt, roomFaces, toneHex, faceValue, parseFace, type FinishDef,
} from '../game/finishes';
import { PAINT_COLOURS, colourName, hexHsl, hslHex, isColourRef, paintHex } from '../game/paint';
import { setFinishUi, useFinishUi, type FinishPart } from '../game/finishUi';
import { finishSwatch } from '../three/finishTextures';

// ── Colours ──────────────────────────────────────────────────────────────────────────────────────

/** The 24 palette colours, an "original" swatch, and a custom colour by hue / saturation / lightness or hex. */
export function ColourPicker({ value, onPick, none = true }: { value: string | null | undefined; onPick: (ref: string | null) => void; none?: boolean }) {
  const custom = !!value && !!paintHex(value) && value.startsWith('#');
  const [open, setOpen] = useState(false);
  return (
    <div className="colour-picker">
      <div className="paint-row">
        {none && (
          <button className={`paint-swatch none ${!value ? 'on' : ''}`} title="Original" aria-label="Original colour" onClick={() => onPick(null)}>
            ∅
          </button>
        )}
        {PAINT_COLOURS.map((c) => (
          <button key={c.id} className={`paint-swatch ${value === c.id ? 'on' : ''}`} style={{ background: c.hex }} title={c.name} aria-label={c.name} onClick={() => onPick(c.id)} />
        ))}
        <button
          className={`paint-swatch custom ${custom ? 'on' : ''}`}
          style={custom ? { background: value! } : undefined}
          title="Custom colour"
          aria-label="Custom colour"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {custom ? '' : '+'}
        </button>
      </div>
      {open && <CustomColour value={custom ? value! : paintHex(value) ?? '#c4623a'} onPick={onPick} />}
      <small className="colour-name">{colourName(value)}</small>
    </div>
  );
}

function CustomColour({ value, onPick }: { value: string; onPick: (ref: string) => void }) {
  const [hsl, setHsl] = useState<[number, number, number]>(() => hexHsl(value));
  const [hex, setHex] = useState(value);
  const set = (next: [number, number, number]) => {
    setHsl(next);
    const h = hslHex(...next);
    setHex(h);
    onPick(h);
  };
  const [h, s, l] = hsl;
  const tracks = {
    h: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
    s: `linear-gradient(90deg,${hslHex(h, 0, l)},${hslHex(h, 100, l)})`,
    l: `linear-gradient(90deg,#000,${hslHex(h, s, 50)},#fff)`,
  };
  return (
    <div className="custom-colour">
      <div className="custom-preview" style={{ background: hslHex(h, s, l) }} />
      <div className="custom-sliders">
        {(['h', 's', 'l'] as const).map((k, i) => (
          <label key={k}>
            <span>{['Hue', 'Sat', 'Light'][i]}</span>
            <input type="range" min={0} max={k === 'h' ? 359 : 100} value={hsl[i]} style={{ background: tracks[k] }}
              onChange={(e) => set(hsl.map((v, j) => (j === i ? +e.target.value : v)) as [number, number, number])} />
          </label>
        ))}
        <label className="hex">
          <span>Hex</span>
          <input value={hex} maxLength={7} spellCheck={false}
            onChange={(e) => {
              const v = e.target.value.trim().toLowerCase();
              setHex(v);
              const full = v.startsWith('#') ? v : `#${v}`;
              if (isColourRef(full) && full.startsWith('#')) {
                setHsl(hexHsl(full));
                onPick(full);
              }
            }} />
        </label>
      </div>
    </div>
  );
}

// ── Finishes tab ─────────────────────────────────────────────────────────────────────────────────

const PARTS: { key: FinishPart; icon: string; label: string }[] = [
  { key: 'floor', icon: '🟫', label: 'Floors' },
  { key: 'wall', icon: '🧱', label: 'Walls' },
  { key: 'face', icon: '🖼️', label: 'Feature wall' },
  { key: 'ceiling', icon: '💡', label: 'Ceiling' },
  { key: 'mood', icon: '🌙', label: 'Mood' },
];

function FinishCard({ def, on, price, onClick }: { def: FinishDef; on: boolean; price: number | null; onClick: () => void }) {
  return (
    <button className={`finish-card ${on ? 'on' : ''} ${def.luxury ? 'lux' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="finish-swatch" style={{ backgroundImage: `url(${finishSwatch(def.id)})`, backgroundColor: def.base }} />
      <b>{def.name}</b>
      <small>{price !== null ? naira(price) : `${naira(def.rate)}/m`}</small>
    </button>
  );
}

function groups(list: FinishDef[]) {
  const out = new Map<string, FinishDef[]>();
  for (const d of list) out.set(d.group, [...(out.get(d.group) ?? []), d]);
  return [...out];
}

export function FinishesTab() {
  const ui = useFinishUi();
  const money = useGame((s) => s.money);
  const design = useGame(activeDesignOf);
  const walls = useGame((s) => s.wallEdits[houseKeyOf(s)]);
  const finish = useGame((s) => s.houseFinish[houseKeyOf(s)]);
  const setFinish = useGame((s) => s.setFinish);
  const layout = useMemo(() => houseLayout(design, walls), [design, walls]);
  const rooms = useMemo(() => interiorRooms(layout), [layout]);

  // Taps on the house pick rooms and walls while this is open.
  useEffect(() => {
    setFinishUi({ on: true });
    return () => setFinishUi({ on: false, rooms: [], faces: [], value: undefined });
  }, []);

  const part = ui.part;
  const picked = part === 'face' ? ui.faces.length > 0 : ui.rooms.length > 0;
  const priceFor = (value: string) =>
    !picked ? null : finishCost(part === 'face' ? { part: 'face', faces: ui.faces, value } : { part: part as 'floor', rooms: ui.rooms, value }, layout);
  const cost = ui.draft ? finishCost(ui.draft, layout) : 0;
  const choose = (value: string | null) => setFinishUi({ value: ui.value === value ? undefined : value });
  const current = (() => {
    if (part === 'face') {
      const f = ui.faces[0] && parseFace(ui.faces[0]);
      return f ? faceValue(layout, finish, f) : null;
    }
    const r = ui.rooms[0];
    if (!r) return null;
    return (part === 'floor' ? finish?.floor : part === 'wall' ? finish?.wall : finish?.ceiling)?.[r] ?? null;
  })();
  const shown = ui.value !== undefined ? ui.value : current;

  const buy = () => {
    if (!ui.draft) return;
    if (setFinish(ui.draft)) {
      useGame.getState().toast(cost ? `✨ Done! ${naira(cost)}` : '✨ Back to how it was built');
      setFinishUi({ value: undefined });
    }
  };

  const allPicked = rooms.length > 0 && rooms.every((r) => ui.rooms.includes(r.name));
  const mood = moodOf(finish);
  return (
    <div className="house-pane finishes">
      <div className="finish-parts" role="tablist" aria-label="What to finish">
        {PARTS.map((p) => (
          <button key={p.key} role="tab" aria-selected={part === p.key} className={part === p.key ? 'on' : ''}
            onClick={() => setFinishUi({ part: p.key, value: undefined, faces: p.key === 'face' ? ui.faces : [], rooms: p.key === 'face' ? [] : ui.rooms })}>
            <span>{p.icon}</span> {p.label}
          </button>
        ))}
      </div>

      {part === 'mood' ? (
        <>
          <p>How the house is lit at night. Free to change. Lamps you place have their own colour: tap one to set it.</p>
          <div className="mood-grid">
            {MOODS.map((m) => (
              <button key={m.id} className={`mood-card ${mood.id === m.id ? 'on' : ''}`} onClick={() => setFinish({ part: 'mood', value: m.id })}
                style={{ ['--mood' as string]: m.colour === 'rgb' ? '#d946ef' : m.colour }}>
                <span className="mood-icon">{m.icon}</span>
                <b>{m.name}</b>
                <small>{m.note}</small>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="finish-hint">
            {part === 'face'
              ? ui.faces.length ? `${ui.faces.length} m of wall picked. Pick a finish for it.` : 'Tap close to a wall inside the house to pick that stretch of wall.'
              : ui.rooms.length ? `Picked: ${ui.rooms.join(', ')}` : 'Tap rooms in the house, or pick them here.'}
          </p>
          {part !== 'face' && (
            <div className="room-chips">
              <button className={allPicked ? 'on' : ''} onClick={() => setFinishUi({ rooms: allPicked ? [] : rooms.map((r) => r.name) })}>🏠 All rooms</button>
              {rooms.map((r) => {
                const on = ui.rooms.includes(r.name);
                return (
                  <button key={r.name} className={on ? 'on' : ''} onClick={() => setFinishUi({ rooms: on ? ui.rooms.filter((n) => n !== r.name) : [...ui.rooms, r.name] })}>
                    {r.name}
                  </button>
                );
              })}
            </div>
          )}

          {part === 'floor' && groups(FLOORS).map(([g, list]) => (
            <section key={g} className="finish-group">
              <span className="house-section-label">{g}</span>
              <div className="finish-grid">
                {list.map((d) => <FinishCard key={d.id} def={d} on={shown === d.id} price={priceFor(d.id)} onClick={() => choose(d.id)} />)}
              </div>
            </section>
          ))}

          {(part === 'wall' || part === 'face') && (
            <>
              <section className="finish-group">
                <span className="house-section-label">Paint · {naira(PAINT_RATE)}/m{picked ? ` · ${naira(priceFor('chalk') ?? 0)}` : ''}</span>
                <ColourPicker value={shown && isColourRef(shown) ? shown : null} none={false} onPick={(ref) => ref && setFinishUi({ value: ref })} />
              </section>
              {groups(WALLS).filter(([g]) => part === 'face' || g !== 'Feature').concat(part === 'wall' ? groups(WALLS).filter(([g]) => g === 'Feature') : []).map(([g, list]) => (
                <section key={g} className="finish-group">
                  <span className="house-section-label">{g}</span>
                  <div className="finish-grid">
                    {list.map((d) => <FinishCard key={d.id} def={d} on={shown === d.id} price={priceFor(d.id)} onClick={() => choose(d.id)} />)}
                  </div>
                </section>
              ))}
            </>
          )}

          {part === 'ceiling' && (
            <div className="finish-grid">
              {CEILINGS.map((c) => (
                <button key={c.id} className={`finish-card ${(shown ?? 'plain') === c.id ? 'on' : ''} ${c.luxury ? 'lux' : ''}`} onClick={() => choose(c.id)}>
                  <span className={`finish-swatch ceiling-${c.id}`} />
                  <b>{c.name}</b>
                  <small>{c.rate ? (picked ? naira(priceFor(c.id) ?? 0) : `${naira(c.rate)}/m²`) : 'Free'}</small>
                  <em>{c.note}</em>
                </button>
              ))}
            </div>
          )}

          {picked && current && (
            <button className="ghost-btn finish-reset" onClick={() => choose(null)}>↺ Back to as built (free)</button>
          )}
        </>
      )}

      {ui.draft && (
        <div className="finish-buy">
          <span>
            {ui.value === null ? 'Back to as built' : 'Trying it on'} · <b>{naira(cost)}</b>
          </span>
          <button className="go" disabled={money < cost} onClick={buy}>✓ {cost ? `Pay ${naira(cost)}` : 'Apply'}</button>
          <button onClick={() => setFinishUi({ value: undefined })}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ── A lamp's own light ───────────────────────────────────────────────────────────────────────────

/** Colour and brightness for a light you placed. Free to change; shows at night when the house has light. */
export function LampControls({ item }: { item: PlacedItem }) {
  const setLamp = useGame((s) => s.setLamp);
  const tone = lampTone(item.light);
  const level = lampLevel(item.light);
  const [custom, setCustom] = useState(false);
  const isTone = LIGHT_TONES.some((t) => t.id === tone);
  return (
    <div className="paint-card lamp-card">
      <b>💡 Light</b>
      <div className="paint-row">
        {LIGHT_TONES.map((t) => (
          <button key={t.id} className={`tone-chip ${tone === t.id ? 'on' : ''} ${t.id}`} style={{ ['--tone' as string]: t.hex }} onClick={() => setLamp(item.id, { c: t.id, b: level })}>
            {t.name}
          </button>
        ))}
        <button className={`tone-chip ${!isTone ? 'on' : ''}`} style={{ ['--tone' as string]: isTone ? '#ffffff' : toneHex(tone) }} onClick={() => setCustom(!custom)}>
          Colour…
        </button>
      </div>
      {custom && <ColourPicker value={isTone ? null : tone} none={false} onPick={(ref) => ref && setLamp(item.id, { c: ref, b: level })} />}
      <label className="lamp-level">
        <span>Brightness</span>
        <input type="range" min={15} max={100} value={Math.round(level * 100)} onChange={(e) => setLamp(item.id, { c: tone, b: +e.target.value / 100 })} />
        <small>{Math.round(level * 100)}%</small>
      </label>
    </div>
  );
}

/** The room a cell is in, for the hint under the house (unused cells give null). */
export const roomName = (layout: ReturnType<typeof houseLayout>, x: number, z: number) => roomAt(layout, { x, z })?.name ?? null;
export const facesIn = roomFaces;
