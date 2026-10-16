import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { photoHour, usePhoto, type PhotoResult } from '../game/photo';
import { inviteLink } from '../net/deeplink';
import { useSession } from '../net/session';
import { SNAP_CAPTION_MAX, postSnap, useSnaps, type SnapSend } from '../net/snaps';
import { hourOf, useGame } from '../game/store';
import { sceneHour } from '../game/theme';
import { sceneWeather, temperatureAt, WEATHER } from '../game/weather';
import { cityNameHere, regionHere } from '../game/regions';
import { saveImage } from './saveImage';
import { SnapSendSheet } from './SnapSend';
import './snap.css';
import { CAPTION_STYLES, EMOJI_STICKERS, INFO_TONES, LENSES, LENS_BY_ID, MARK_STYLES, TAG_STICKERS, TAG_TONES, applyLens, drawPhoto, hit, lensFilter, lensVeil, type Box, type Layer, type MarkStyle } from './photoCompose';

/** The game clock as "4:32 PM". */
const clockText = (minutes: number) => {
  const h = Math.floor(hourOf(minutes));
  return `${h % 12 === 0 ? 12 : h % 12}:${String(Math.floor(minutes % 60)).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

/** Where I am and what the sky is doing there right now, for the Snap camera's top bar and the info stickers. The
 *  hour is the one the picture is lit at (photo mode's Light), so a sunset shot says sunset weather. */
export function snapInfo() {
  const region = regionHere();
  const minutes = useGame.getState().minutes;
  const h = photoHour() ?? sceneHour(hourOf(minutes));
  const kind = sceneWeather(region.id);
  const w = WEATHER[kind];
  return { city: region.name, icon: h < 6 || h >= 18.5 ? w.night : w.icon, weather: w.label, temp: temperatureAt(region.id, h, kind), time: clockText(minutes) };
}

const MIN_SIZE = 0.025;
const MAX_SIZE = 0.5;
const MAX_LAYERS = 24;
const CAPTION_MAX = 90;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const fileOf = (blob: Blob) => new File([blob], `kaduna-life-${Date.now()}.jpg`, { type: 'image/jpeg' });
/** Whether this browser's share sheet takes pictures (asked with an empty stand-in, before the real one exists). */
const CAN_SHARE = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'photo.jpg', { type: 'image/jpeg' })] });

/** What goes out as the message beside a shared picture, one picked at random. Written to read right with a name or with "I". */
const SHARE_LINES: ((who: string) => string)[] = [
  (who) => `See wetin ${who} dey do for Naija City 👀`,
  (who) => `${who} don land for ${cityNameHere()} 😎`,
  (who) => `Na so ${who} dey flex for Naija City 🔥`,
  (who) => `${who} dey chop life for ${cityNameHere()}. You nko?`,
  (who) => `Guess where ${who} dey? Naija City 📍`,
  (who) => `${who} dey waka for Naija City. Come join 🚗`,
];

type Tray = 'stickers' | 'naija' | 'words' | 'mark' | 'lens';

/** Snaps go up at phone-screen size: the longest side this many pixels, which keeps the upload small. They last a day, so they need no more. */
const SNAP_SIDE = 960;
const encode = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob | null>((done) => canvas.toBlob(done, type, quality));

/** The side toggles, top to bottom. Each opens its tray above the buttons; a second press puts it away. */
const TRAYS: { id: Tray; label: string; icon: ReactNode }[] = [
  { id: 'lens', label: 'Filters', icon: <><circle cx="9" cy="10" r="5.5" /><circle cx="15" cy="10" r="5.5" /><circle cx="12" cy="15" r="5.5" /></> },
  { id: 'stickers', label: 'Stickers', icon: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" /></> },
  { id: 'naija', label: 'Time, weather and place', icon: <><path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.2" /></> },
  { id: 'words', label: 'Words', icon: <><path d="M4 9h13l3 3-3 3H4z" /><path d="M8 12h6" /></> },
  { id: 'mark', label: 'Logo', icon: <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6L3.4 9.3l6-.7z" /> },
];

/** One arrow per corner the logo can sit in, laid out as the corners are (top pair, then bottom pair). `turn` swings the up-right arrow round to point there. */
const CORNER_ARROWS = [
  { corner: 3, label: 'Top left', turn: -90 },
  { corner: 0, label: 'Top right', turn: 0 },
  { corner: 2, label: 'Bottom left', turn: 180 },
  { corner: 1, label: 'Bottom right', turn: 90 },
];

/** The picture just taken, with stickers and a caption to put on it before it is saved or shared. */
export function PhotoEditor({ result }: { result: PhotoResult }) {
  const discard = usePhoto((s) => s.discard);
  const forSnap = usePhoto((s) => s.forSnap);
  const username = useSession((s) => s.user?.username ?? null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [tray, setTray] = useState<Tray | null>(null);
  const [busy, setBusy] = useState(false);
  const [style, setStyle] = useState<MarkStyle>('papers');
  const [corner, setCorner] = useState(0);
  /** The message that goes out with the picture when it is sent to Snap. */
  const [snapNote, setSnapNote] = useState('');
  /** Picking who a snap goes to (ui/SnapSend.tsx). */
  const [sending, setSending] = useState(false);
  const lens = usePhoto((s) => s.lens);
  /** Where a one-finger drag on the bare picture began: a swipe across it changes the filter, as on Snapchat. */
  const swipe = useRef<{ x: number; id: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const boxes = useRef<Box[]>([]);
  const nextId = useRef(1);
  /** Fingers on the picture, and what the picked-up layer looked like when the gesture began. */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const grab = useRef<{ layer: Layer; x: number; y: number; dist: number; angle: number } | null>(null);
  /** The finished picture at full size, kept ready so Share can open the share sheet the moment it is tapped. */
  const ready = useRef<{ blob: Blob; of: Layer[] } | null>(null);

  // The picture with its filter baked in, made once per filter (photoCompose.ts applyLens).
  const shot = useMemo(() => applyLens(result.shot, LENS_BY_ID[lens] ?? LENSES[0]), [result.shot, lens]);
  const stepLens = (k: number) => {
    const i = LENSES.findIndex((l) => l.id === lens);
    usePhoto.setState({ lens: LENSES[(i + k + LENSES.length) % LENSES.length].id });
  };
  const mark = { style, corner, username, place: result.place, city: cityNameHere(), day: result.day };
  const current = layers.find((l) => l.id === selected) ?? null;

  // The preview is the real thing drawn smaller, so what is arranged here is what gets saved.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const paint = () => {
      // As big as the space above the tools allows, at the picture's own shape.
      const stage = el.parentElement!;
      const fit = Math.min(stage.clientWidth / shot.width, stage.clientHeight / shot.height);
      el.style.width = `${Math.floor(shot.width * fit)}px`;
      el.style.height = `${Math.floor(shot.height * fit)}px`;
      const scale = Math.min(1, fit * Math.min(2, window.devicePixelRatio || 1));
      el.width = Math.max(1, Math.round(shot.width * scale));
      el.height = Math.max(1, Math.round(shot.height * scale));
      const ctx = el.getContext('2d');
      if (ctx) boxes.current = drawPhoto(ctx, el.width, el.height, shot, layers, mark, selected);
    };
    paint();
    // The brand typeface may still be on its way the first time.
    void document.fonts?.load(`800 20px 'Plus Jakarta Sans'`).then(paint).catch(() => {});
    // The stage grows and shrinks as trays open and close under it.
    const watch = new ResizeObserver(paint);
    watch.observe(el.parentElement!);
    return () => watch.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot, layers, selected, username, style, corner]);

  const render = (of: Layer[]) =>
    new Promise<Blob | null>((done) => {
      const out = document.createElement('canvas');
      out.width = shot.width;
      out.height = shot.height;
      const ctx = out.getContext('2d');
      if (!ctx) return done(null);
      drawPhoto(ctx, out.width, out.height, shot, of, mark);
      out.toBlob(done, 'image/jpeg', 0.92);
    });
  useEffect(() => {
    ready.current = null;
    let stale = false;
    const id = setTimeout(() => {
      void render(layers).then((blob) => {
        if (blob && !stale) ready.current = { blob, of: layers };
      });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot, layers, username, style, corner]);
  const finished = async () => (ready.current?.of === layers ? ready.current.blob : render(layers));

  const patch = (id: number, p: Partial<Layer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const remove = (id: number) => {
    setLayers((ls) => ls.filter((l) => l.id !== id));
    setSelected((s) => (s === id ? null : s));
  };
  /** Picks a layer (or none); a caption left empty is thrown away when you move on. */
  const select = (id: number | null) => {
    setLayers((ls) => ls.filter((l) => l.id === id || l.kind !== 'caption' || l.text.trim()));
    setSelected(id);
  };
  const add = (kind: Layer['kind'], text: string) => {
    if (layers.length >= MAX_LAYERS) return;
    const id = nextId.current++;
    // Each new one lands a little off the last, so a second sticker never hides the first.
    const nudge = ((id % 5) - 2) * 0.05;
    const layer: Layer = kind === 'caption'
      ? { id, kind, text, x: 0.5, y: 0.7, size: 0.058, rot: 0, tone: 0, style: 'outline' }
      : kind === 'info'
      ? { id, kind, text, x: 0.5, y: 0.16 + (id % 5) * 0.075, size: 0.045, rot: 0, tone: 0, style: 'outline' }
      : { id, kind, text, x: 0.5 + nudge, y: 0.4 + nudge * 0.6, size: kind === 'emoji' ? 0.16 : 0.05, rot: kind === 'tag' ? -0.08 : 0, tone: id % TAG_TONES.length, style: 'outline' };
    setLayers((ls) => [...ls.filter((l) => l.kind !== 'caption' || l.text.trim()), layer]);
    setSelected(id);
    if (kind === 'caption') setTimeout(() => input.current?.focus(), 0);
  };

  /** A pointer's place on the picture, in preview-canvas pixels. */
  const at = (e: ReactPointerEvent) => {
    const el = canvas.current!;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * el.width, y: ((e.clientY - r.top) / r.height) * el.height };
  };
  /** Starts (or restarts, when a finger is added or lifted) the gesture on the selected layer. */
  const regrab = (layer: Layer | null) => {
    const pts = [...touches.current.values()];
    if (!layer || !pts.length) return (grab.current = null);
    const [a, b] = pts;
    grab.current = b
      ? { layer, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, angle: Math.atan2(b.y - a.y, b.x - a.x) }
      : { layer, x: a.x, y: a.y, dist: 0, angle: 0 };
  };
  const onDown = (e: ReactPointerEvent) => {
    const p = at(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    touches.current.set(e.pointerId, p);
    if (touches.current.size === 1) {
      const id = hit(boxes.current, p.x, p.y, canvas.current!.width * 0.025);
      if (id !== selected) select(id);
      regrab(layers.find((l) => l.id === id) ?? null);
      swipe.current = id === null ? { x: e.clientX, id: e.pointerId } : null;
    } else {
      swipe.current = null;
      regrab(current);
    }
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, at(e));
    const g = grab.current;
    const el = canvas.current;
    if (!g || !el) return;
    const [a, b] = [...touches.current.values()];
    const x = b ? (a.x + b.x) / 2 : a.x;
    const y = b ? (a.y + b.y) / 2 : a.y;
    const next: Partial<Layer> = {
      x: clamp(g.layer.x + (x - g.x) / el.width, 0.02, 0.98),
      y: clamp(g.layer.y + (y - g.y) / el.height, 0.02, 0.98),
    };
    // Two fingers: spread to grow, twist to turn.
    if (b && g.dist) {
      next.size = clamp(g.layer.size * (Math.hypot(b.x - a.x, b.y - a.y) / g.dist), MIN_SIZE, MAX_SIZE);
      next.rot = g.layer.rot + Math.atan2(b.y - a.y, b.x - a.x) - g.angle;
    }
    patch(g.layer.id, next);
  };
  const onUp = (e: ReactPointerEvent) => {
    const sw = swipe.current;
    swipe.current = null;
    if (sw && sw.id === e.pointerId && e.type === 'pointerup' && Math.abs(e.clientX - sw.x) > 48) stepLens(e.clientX < sw.x ? 1 : -1);
    touches.current.delete(e.pointerId);
    regrab(layers.find((l) => l.id === grab.current?.layer.id) ?? null);
  };

  const save = async () => {
    setBusy(true);
    const blob = await finished();
    setBusy(false);
    if (blob) await saveImage(fileOf(blob));
  };
  const share = async () => {
    const blob = await finished();
    if (!blob) return;
    const line = SHARE_LINES[Math.floor(Math.random() * SHARE_LINES.length)](username ?? 'I');
    void navigator.share({ files: [fileOf(blob)], title: 'Naija City', text: `${line}\nPlay here 👉 ${username ? inviteLink(username) : 'https://naija.city'}` }).catch(() => { /* closed the share sheet */ });
  };

  /** Posts the dressed-up picture to Snap where the send screen says, then opens the app where it went. */
  const snap = async (send: SnapSend) => {
    setBusy(true);
    try {
      const k = Math.min(1, SNAP_SIDE / Math.max(shot.width, shot.height));
      const out = document.createElement('canvas');
      out.width = Math.round(shot.width * k);
      out.height = Math.round(shot.height * k);
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('Could not prepare the picture');
      // A caption still empty would go out as its placeholder words.
      drawPhoto(ctx, out.width, out.height, shot, layers.filter((l) => l.kind !== 'caption' || l.text.trim()), mark);
      // WebP is about a third smaller than JPEG at the same look. A browser with no WebP encoder (Safari) hands back a
      // PNG instead, which is several times bigger, so there the snap goes up as a JPEG.
      let blob = await encode(out, 'image/webp', 0.8);
      if (blob?.type !== 'image/webp') blob = await encode(out, 'image/jpeg', 0.8);
      if (!blob) throw new Error('Could not prepare the picture');
      await postSnap(blob, snapNote, send);
      usePhoto.getState().close();
      const g = useGame.getState();
      const story = send.story || send.spotlight;
      const friends = send.to.length ? `${send.to.length} friend${send.to.length === 1 ? '' : 's'}` : '';
      g.toast(`👻 Sent to ${[send.spotlight ? 'Spotlight' : send.story ? 'your story' : '', friends].filter(Boolean).join(' and ')}. It disappears in 24 hours.`);
      useSnaps.setState({ tab: story ? 'stories' : 'chat' });
      useGame.setState({ openApp: 'flex' });
      g.setPanel('phone');
    } catch (e) {
      useGame.getState().toast(e instanceof Error ? e.message : 'Could not post that snap');
      setBusy(false);
    }
  };

  const step = (k: number) => current && patch(current.id, { size: clamp(current.size * k, MIN_SIZE, MAX_SIZE) });
  return (
    <div className="photo-result">
      <div className="photo-stage">
        <canvas
          ref={canvas}
          className="photo-canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="Your photo. Drag a sticker to move it."
        />
        <div className="photo-rail" role="group" aria-label="Add to your photo">
          {TRAYS.map((t) => {
            const on = !current && tray === t.id;
            return (
              <button key={t.id} type="button" aria-label={t.label} title={t.label} aria-pressed={on} className={on ? 'on' : ''} onClick={() => { select(null); setTray(on ? null : t.id); }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
              </button>
            );
          })}
          <button type="button" aria-label="Add a caption" title="Caption" onClick={() => add('caption', '')}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 7V5h14v2M12 5v14M9 19h6" />
            </svg>
          </button>
        </div>
      </div>
      {/* The message for Snap sits under the picture; it steps aside while a caption on the picture is being typed. */}
      {forSnap && current?.kind !== 'caption' && (
        <input
          className="photo-caption-input photo-snap"
          value={snapNote}
          maxLength={SNAP_CAPTION_MAX}
          placeholder="Say something to the city (optional)…"
          aria-label="Message to post with your snap"
          enterKeyHint="done"
          disabled={busy}
          onChange={(e) => setSnapNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      )}
      <div className="photo-edit">
        {current ? (
          <>
            {current.kind === 'caption' && (
              <input
                ref={input}
                className="photo-caption-input"
                value={current.text}
                maxLength={CAPTION_MAX}
                placeholder="Write a caption…"
                enterKeyHint="done"
                onChange={(e) => patch(current.id, { text: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            )}
            <div className="photo-tools">
              <button type="button" aria-label="Smaller" onClick={() => step(1 / 1.18)}>A−</button>
              <button type="button" aria-label="Bigger" onClick={() => step(1.18)}>A+</button>
              <button type="button" aria-label="Turn left" onClick={() => patch(current.id, { rot: current.rot - Math.PI / 18 })}>↺</button>
              <button type="button" aria-label="Turn right" onClick={() => patch(current.id, { rot: current.rot + Math.PI / 18 })}>↻</button>
              {current.kind === 'caption' && (
                <button type="button" onClick={() => patch(current.id, { style: CAPTION_STYLES[(CAPTION_STYLES.indexOf(current.style) + 1) % CAPTION_STYLES.length] })}>Style</button>
              )}
              {(current.kind === 'tag' || current.kind === 'info') && (
                <button type="button" onClick={() => patch(current.id, { tone: (current.tone + 1) % (current.kind === 'info' ? INFO_TONES : TAG_TONES).length })}>Colour</button>
              )}
              <button type="button" className="photo-tool-del" onClick={() => remove(current.id)}>Remove</button>
              <button type="button" className="photo-tool-done" onClick={() => select(null)}>Done</button>
            </div>
          </>
        ) : tray && (
          <>
            <div className="photo-tray-row">
              {/* Banners and frames run edge to edge; the rest can sit in any corner. The arrows stay put while the styles scroll. */}
              {tray === 'mark' && MARK_STYLES.find((m) => m.id === style)?.corners && (
                <div className="photo-corners" role="group" aria-label="Logo corner">
                  {CORNER_ARROWS.map((a) => (
                    <button key={a.corner} type="button" aria-label={a.label} aria-pressed={corner === a.corner} className={corner === a.corner ? 'on' : ''} onClick={() => setCorner(a.corner)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${a.turn}deg)` }} aria-hidden="true">
                        <path d="M7 17 17 7M9 7h8v8" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
              <div className={`photo-chips photo-tray ${tray}`}>
                {tray === 'stickers' && EMOJI_STICKERS.map((s) => <button key={s} type="button" onClick={() => add('emoji', s)}>{s}</button>)}
                {tray === 'words' && TAG_STICKERS.map((s) => <button key={s} type="button" onClick={() => add('tag', s)}>{s}</button>)}
                {tray === 'naija' && infoStickers(result).map((s) => <button key={s} type="button" onClick={() => add('info', s)}>{s}</button>)}
                {tray === 'lens' && LENSES.map((l) => (
                  <button key={l.id} type="button" className={`photo-lens ${lens === l.id ? 'on' : ''}`} onClick={() => usePhoto.setState({ lens: l.id })}>
                    <i style={{ filter: lensFilter(l) }}><i style={{ background: lensVeil(l) }} /></i>
                    {l.label}
                  </button>
                ))}
                {tray === 'mark' && MARK_STYLES.map((m) => (
                  <button key={m.id} type="button" className={style === m.id ? 'on' : ''} onClick={() => setStyle(m.id)}>{m.label}</button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="photo-result-actions">
        <button type="button" className="photo-ghost photo-icon" aria-label="Retake" title="Retake" onClick={discard}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
        </button>
        <button type="button" className="photo-ghost photo-icon" aria-label="Save to this device" title="Download" disabled={busy} onClick={() => void save()}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4v11" />
            <path d="M7 11l5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
        </button>
        {CAN_SHARE && <button type="button" className={forSnap ? 'photo-ghost' : 'photo-primary'} onClick={() => void share()}>Share</button>}
        {/* Only a picture taken from the Snap app can be sent there. */}
        {forSnap && (
          <button type="button" className="photo-primary snap-send-to" disabled={busy || !username} onClick={() => setSending(true)}>
            {busy ? 'Sending…' : 'Send To'}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden><path d="M3 20.5 21 12 3 3.5v6.6l11 1.9-11 1.9z" /></svg>
          </button>
        )}
      </div>
      {sending && <SnapSendSheet busy={busy} onBack={() => setSending(false)} onSend={(send) => void snap(send)} />}
    </div>
  );
}

/** Snapchat-style info stickers for this picture: the time, the weather, where, and the day of this life. */
function infoStickers(result: PhotoResult) {
  const i = snapInfo();
  return [
    `🕓 ${i.time}`,
    `${i.icon} ${i.temp}°C ${i.city}`,
    `📍 ${i.city}`,
    ...(result.place && result.place !== i.city ? [`📍 ${result.place}`] : []),
    `📅 Day ${result.day}`,
    `🇳🇬 ${i.city.toUpperCase()} TO THE WORLD`,
    '🎉 Owambe vibes',
    '🍛 Jollof o\'clock',
    '💡 NEPA don bring light',
    '✈️ Japa loading…',
  ];
}
