import { useMemo, useRef, useState, type RefObject } from 'react';
import { GlBoundary } from './NoWebGL';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { placeHere } from '../game/city';
import { naira, useGame } from '../game/store';
import { decodeLook, encodeLook, fits, GARMENTS, GARMENT_BY_ID, isFullOutfit, SHOPS, SLOTS, type Garment, type Slot } from '../game/wardrobe';
import { Person, type Clip } from '../three/Person';

/** What a drag has done to a preview: how far to turn it next frame, and whether it still turns by itself. */
interface Turn {
  by: number;
  x: number;
  held: boolean;
  auto: boolean;
}

/** A person in a given look on a turntable. It turns slowly by itself until you drag it; after that it stays where you leave it. */
export function PersonPreview({ look, height = 220, camZ = 3.1, y = -0.88 }: { look: string; height?: number | string; camZ?: number; y?: number }) {
  const turn = useRef<Turn>({ by: 0, x: 0, held: false, auto: true });
  return (
    <div
      className="person-preview"
      style={{ height }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        Object.assign(turn.current, { held: true, auto: false, x: e.clientX });
      }}
      onPointerMove={(e) => {
        const t = turn.current;
        if (!t.held) return;
        t.by += (e.clientX - t.x) * 0.012;
        t.x = e.clientX;
      }}
      onPointerUp={() => (turn.current.held = false)}
      onPointerCancel={() => (turn.current.held = false)}
    >
      <GlBoundary where="closet" fallback={<p className="muted" style={{ textAlign: 'center' }}>3D preview unavailable on this device</p>}>
      <Canvas camera={{ position: [0, 0.25, camZ], fov: 34 }} dpr={[1, 2]} shadows>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 4, 3]} intensity={1.6} castShadow />
        {/* The camera looks at the origin, so the person stands lower to be framed head to toe. */}
        <group position={[0, y, 0]}>
          <Turntable look={look} turn={turn} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[0.7, 24]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
        </group>
      </Canvas>
      </GlBoundary>
    </div>
  );
}

function Turntable({ look, turn }: { look: string; turn: RefObject<Turn> }) {
  const g = useRef<Group>(null!);
  const clip = useRef<Clip>('idle');
  useFrame((_, dt) => {
    const t = turn.current;
    g.current.rotation.y += (t.auto ? dt * 0.5 : 0) + t.by;
    t.by = 0;
  });
  return (
    <group ref={g} position={[0, 0, 0]} rotation={[0, -0.5, 0]}>
      <group position={[0, 0.02, 0]}>
        <Person look={look} clipRef={clip} />
      </group>
    </group>
  );
}

/** A colour chip for a garment: its colour, cut with its accent when it has one. */
export const swatch = (gm: Garment) => ({ background: gm.accent ? `linear-gradient(135deg, ${gm.color} 60%, ${gm.accent} 60%)` : gm.color });

/** Clothes shop (when standing at a rack) or your own closet (from the phone). */
export function Closet() {
  const shopId = useGame((s) => s.shopId);
  const panel = useGame((s) => s.panel);
  const look = useGame((s) => s.look);
  const wardrobe = useGame((s) => s.wardrobe);
  const money = useGame((s) => s.money);
  const [slot, setSlot] = useState<Slot>('top');
  const [trying, setTrying] = useState<string | null>(null);
  const me = useMemo(() => decodeLook(look), [look]);

  const open = shopId !== null || panel === 'closet';
  if (!open) return null;
  const shop = shopId ? SHOPS[shopId] : null;
  const close = () => {
    setTrying(null);
    const s = useGame.getState();
    if (s.shopId) s.openShop(null);
    else s.setPanel(null);
  };

  const list = GARMENTS.filter((gm) => gm.slot === slot && fits(gm, me.body) && (shopId ? gm.shops.includes(shopId) : wardrobe.includes(gm.id)));
  const tryOn = trying ? GARMENT_BY_ID[trying] : null;
  let previewLook = look;
  if (tryOn) {
    const outfit = { ...me.outfit, [tryOn.slot]: tryOn.id };
    if (isFullOutfit(tryOn.id)) delete outfit.bottom;
    previewLook = encodeLook({ ...me, outfit });
  }
  const worn = (id: string) => me.outfit[GARMENT_BY_ID[id].slot] === id;

  return (
    <div className="sheet closet">
      <div className="sheet-head">
        <h3>{shop ? `🛍️ ${(shopId && placeHere(shopId)?.name) || shop.name}` : '👗 My closet'}</h3>
        <button className="ghost-btn" onClick={close}>
          Done
        </button>
      </div>
      {shop && <p className="muted small closet-blurb">{shop.blurb}</p>}
      <div className="closet-body">
        <div className="closet-left">
          <PersonPreview look={previewLook} />
          {tryOn && !wardrobe.includes(tryOn.id) ? (
            <div className="try-bar">
              <b>{tryOn.name}</b>
              <button className="btn go" disabled={money < tryOn.price} onClick={() => (useGame.getState().buyGarment(tryOn.id), setTrying(null))}>
                Buy {naira(tryOn.price)}
              </button>
            </div>
          ) : (
            <p className="muted small center">{shop ? 'Tap something to try it on' : 'Tap to wear'}</p>
          )}
        </div>
        <div className="closet-right">
          <div className="tabs">
            {SLOTS.map((s) => (
              <button key={s.id} className={s.id === slot ? 'on' : ''} onClick={() => setSlot(s.id)}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
          <div className="cards">
            {list.length === 0 && <p className="muted small">{shopId ? 'Nothing for you here in this section.' : 'Nothing here yet. Visit the market, KD Mall or Malali Boutique.'}</p>}
            {list.map((gm) => {
              const owned = wardrobe.includes(gm.id);
              return (
                <button
                  key={gm.id}
                  className={`card ${trying === gm.id ? 'picked' : ''} ${!owned && money < gm.price ? 'dim' : ''}`}
                  onClick={() => {
                    if (owned) {
                      setTrying(null);
                      useGame.getState().wear(gm.id);
                    } else setTrying(gm.id);
                  }}
                >
                  <span className="swatch" style={swatch(gm)} />
                  <b>{gm.name}</b>
                  {owned ? <span className="owned">{worn(gm.id) ? '✓ Wearing' : 'Owned'}</span> : <span className="price">{naira(gm.price)}</span>}
                </button>
              );
            })}
          </div>
          {!shopId && me.outfit[slot] && slot !== 'top' && (
            <button className="btn sm" onClick={() => useGame.getState().takeOff(slot)}>
              Take off
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
