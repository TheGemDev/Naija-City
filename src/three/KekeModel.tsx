// The keke napep: a Bajaj RE three-wheeler as it runs on Nigerian streets. A smooth body lofted through
// cross-sections, narrow at the nose and broad over the back axle; the rounded front cowl with its one
// headlamp, a raked windscreen, a canvas roof on thin pillars, open sides with a grab rail, the
// passengers' bench against the closed back, the driver's saddle and handlebar, and three small wheels:
// one in a fork under the nose, two under fenders at the back. Faces +z, wheels on y=0, about 2 long.

import { useMemo } from 'react';
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Quaternion, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type V3 = [number, number, number];
/** A cross-section of the body: how far forward, half its width, its underside and top, how round its corners. */
type Station = [z: number, half: number, y0: number, y1: number, r: number];

const YELLOW = '#facc15';
const GREEN = '#15803d';
const CANVAS = '#18181b';
const VINYL = '#7c2d12';
const CHROME = '#d4d8de';
const RUBBER = '#111317';

/** A rounded rectangle, the same number of points whatever its size, so neighbouring sections join up. */
function section([z, half, y0, y1, r]: Station, steps = 3): V3[] {
  const rr = Math.min(r, half * 0.95, (y1 - y0) / 2 - 0.001);
  const corners: [number, number, number][] = [[half - rr, y0 + rr, -Math.PI / 2], [half - rr, y1 - rr, 0], [-(half - rr), y1 - rr, Math.PI / 2], [-(half - rr), y0 + rr, Math.PI]];
  const out: V3[] = [];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (k / steps) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z]);
    }
  }
  return out;
}

/** Skin through the sections, front to back, closed at both ends. */
function loft(stations: Station[], closed = true): BufferGeometry {
  const rings = stations.map((s) => section(s));
  const n = rings[0].length;
  const positions: number[] = [];
  const index: number[] = [];
  for (const ring of rings) for (const p of ring) positions.push(...p);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j, b = i * n + ((j + 1) % n), c = (i + 1) * n + j, d = (i + 1) * n + ((j + 1) % n);
      index.push(a, b, c, b, d, c);
    }
  }
  if (closed) {
    // End caps as their own vertices, so their edges stay crisp.
    for (const [ring, flip] of [[rings[0], true], [rings[rings.length - 1], false]] as const) {
      const base = positions.length / 3;
      const mid = ring.reduce((m, p) => [m[0] + p[0] / n, m[1] + p[1] / n, m[2] + p[2] / n], [0, 0, 0]);
      positions.push(...mid);
      for (const p of ring) positions.push(...p);
      for (let j = 0; j < n; j++) {
        const a = base + 1 + j, b = base + 1 + ((j + 1) % n);
        if (flip) index.push(base, b, a); else index.push(base, a, b);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// The body from the back panel to the nose: square-shouldered over the engine and back wheels, stepping
// down to the floor where you climb in, narrowing past the driver and rising into the cowl under the screen.
const BODY: Station[] = [
  [-0.99, 0.52, 0.34, 0.8, 0.08],
  [-0.94, 0.57, 0.3, 0.85, 0.1],
  [-0.62, 0.58, 0.28, 0.84, 0.1],
  [-0.42, 0.58, 0.28, 0.7, 0.08],
  [0.12, 0.55, 0.28, 0.66, 0.08],
  [0.32, 0.47, 0.28, 0.68, 0.08],
  [0.5, 0.4, 0.3, 0.8, 0.1],
  [0.66, 0.36, 0.33, 0.94, 0.13],
  [0.82, 0.31, 0.38, 0.92, 0.14],
  [0.94, 0.24, 0.44, 0.84, 0.12],
  [1.02, 0.13, 0.52, 0.72, 0.06],
];
/** The green band round the flanks, just proud of the paint. */
const BAND: Station[] = [
  [-0.97, 0.585, 0.56, 0.63, 0.005],
  [-0.42, 0.59, 0.56, 0.63, 0.005],
  [0.12, 0.565, 0.53, 0.6, 0.005],
  [0.32, 0.485, 0.53, 0.6, 0.005],
  [0.5, 0.413, 0.55, 0.62, 0.005],
];

const geometries = {
  body: loft(BODY),
  band: loft(BAND, false),
  roof: new RoundedBoxGeometry(1.22, 0.09, 1.8, 3, 0.04),
  roofTrim: new RoundedBoxGeometry(1.25, 0.045, 1.83, 2, 0.02),
  bench: new RoundedBoxGeometry(1.0, 0.13, 0.42, 2, 0.05),
  backrest: new RoundedBoxGeometry(1.0, 0.36, 0.11, 2, 0.05),
  saddle: new RoundedBoxGeometry(0.34, 0.11, 0.46, 2, 0.05),
};

function Paint({ c, rough = 0.42, metal = 0.12 }: { c: string; rough?: number; metal?: number }) {
  return <meshStandardMaterial color={c} roughness={rough} metalness={metal} />;
}

/** A round bar between two points: pillars, rails, the fork, the steering column. */
function Rod({ a, b, r, c, metal = false }: { a: V3; b: V3; r: number; c: string; metal?: boolean }) {
  const { mid, len, q } = useMemo(() => {
    const va = new Vector3(...a), vb = new Vector3(...b);
    const dir = vb.clone().sub(va);
    return { mid: va.clone().add(vb).multiplyScalar(0.5), len: dir.length(), q: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()) };
  }, [a, b]);
  return (
    <mesh position={mid} quaternion={q} castShadow>
      <cylinderGeometry args={[r, r, len, 10]} />
      <meshStandardMaterial color={c} metalness={metal ? 0.7 : 0.1} roughness={metal ? 0.25 : 0.6} />
    </mesh>
  );
}

/** A small wheel on its side: a rounded tyre, a pressed-steel rim and a hub. Its axle runs along x. */
function Wheel({ p, r = 0.21 }: { p: V3; r?: number }) {
  return (
    <group position={p} rotation={[0, Math.PI / 2, 0]}>
      <mesh castShadow>
        <torusGeometry args={[r - 0.055, 0.055, 10, 24]} />
        <meshStandardMaterial color={RUBBER} roughness={0.9} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r - 0.07, r - 0.07, 0.1, 18]} />
        <meshStandardMaterial color="#9aa1aa" metalness={0.55} roughness={0.35} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0, s * 0.055]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.06, 0.03, 12]} />
          <meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

/** A mudguard: part of a hoop standing over a wheel, `arc` radians of it centred on the top. */
function Fender({ p, r, w, arc, c }: { p: V3; r: number; w: number; arc: number; c: string }) {
  const g = useMemo(() => new CylinderGeometry(r, r, w, 20, 1, true, Math.PI / 2 - arc / 2, arc), [r, w, arc]);
  return (
    <mesh position={p} rotation={[0, 0, Math.PI / 2]} geometry={g} castShadow>
      <meshStandardMaterial color={c} roughness={0.45} metalness={0.1} side={2} />
    </mesh>
  );
}

export function Keke() {
  return (
    <group>
      {/* Body, with the green band round it */}
      <mesh geometry={geometries.body} castShadow receiveShadow>
        <Paint c={YELLOW} />
      </mesh>
      <mesh geometry={geometries.band}>
        <Paint c={GREEN} />
      </mesh>
      {/* The floor where you climb in, dark rubber matting */}
      <mesh position={[0, 0.665, -0.15]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.0, 0.5]} />
        <meshStandardMaterial color="#27272a" roughness={0.95} />
      </mesh>

      {/* Front: the one headlamp in the cowl, indicators either side, and the number plate under the nose */}
      <group position={[0, 0.72, 0.985]} rotation={[0.22, 0, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.05, 20]} />
          <meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.027]}>
          <circleGeometry args={[0.083, 20]} />
          <meshStandardMaterial color="#fffbeb" emissive="#fef3c7" emissiveIntensity={0.9} />
        </mesh>
      </group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.2, 0.78, 0.93]} rotation={[0.4, s * 0.55, 0]}>
          <boxGeometry args={[0.07, 0.045, 0.03]} />
          <meshStandardMaterial color="#f59e0b" emissive="#b45309" emissiveIntensity={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.6, 1.025]}>
        <boxGeometry args={[0.2, 0.1, 0.012]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>

      {/* Windscreen in its rubber frame, with a wiper */}
      <group position={[0, 1.12, 0.665]} rotation={[-0.2, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.8, 0.38, 0.015]} />
          <meshStandardMaterial color="#bae6fd" transparent opacity={0.35} roughness={0.05} metalness={0.3} depthWrite={false} />
        </mesh>
        {[[0, 0.195, 0.84, 0.03], [0, -0.195, 0.84, 0.03]].map(([x, y, w, h], i) => (
          <mesh key={i} position={[x, y, 0]}>
            <boxGeometry args={[w, h, 0.03]} />
            <meshStandardMaterial color={RUBBER} />
          </mesh>
        ))}
        <mesh position={[0.05, -0.1, 0.02]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.32, 0.012, 0.012]} />
          <meshStandardMaterial color={RUBBER} />
        </mesh>
      </group>

      {/* Pillars: either side of the screen, behind the driver, and at the back corners */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Rod a={[s * 0.36, 0.92, 0.7]} b={[s * 0.56, 1.33, 0.62]} r={0.025} c={YELLOW} />
          <Rod a={[s * 0.53, 0.66, 0.06]} b={[s * 0.56, 1.33, 0.06]} r={0.025} c={YELLOW} />
          <Rod a={[s * 0.56, 0.84, -0.92]} b={[s * 0.56, 1.33, -0.92]} r={0.025} c={YELLOW} />
          {/* grab rail across the doorway, and the side mirror on its stalk */}
          <Rod a={[s * 0.57, 1.0, 0.06]} b={[s * 0.57, 1.0, -0.74]} r={0.014} c={CHROME} metal />
          <Rod a={[s * 0.4, 1.0, 0.69]} b={[s * 0.55, 1.12, 0.72]} r={0.012} c={RUBBER} />
          <mesh position={[s * 0.57, 1.15, 0.72]} rotation={[0, s * 0.3, 0]}>
            <boxGeometry args={[0.1, 0.07, 0.02]} />
            <meshStandardMaterial color={RUBBER} />
          </mesh>
        </group>
      ))}

      {/* Canvas roof with a green rolled edge, and the closed back with its little window */}
      <mesh geometry={geometries.roofTrim} position={[0, 1.335, -0.16]}>
        <Paint c={GREEN} rough={0.7} metal={0} />
      </mesh>
      <mesh geometry={geometries.roof} position={[0, 1.38, -0.16]} castShadow>
        <Paint c={CANVAS} rough={0.85} metal={0} />
      </mesh>
      <mesh position={[0, 1.08, -0.955]}>
        <boxGeometry args={[1.1, 0.5, 0.04]} />
        <meshStandardMaterial color={CANVAS} roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.12, -0.978]}>
        <boxGeometry args={[0.46, 0.2, 0.01]} />
        <meshStandardMaterial color="#334155" roughness={0.1} metalness={0.4} />
      </mesh>
      {/* Canvas flaps rolled down over the back corners */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.565, 1.08, -0.84]}>
          <boxGeometry args={[0.02, 0.5, 0.17]} />
          <meshStandardMaterial color={CANVAS} roughness={0.85} />
        </mesh>
      ))}

      {/* Passengers' bench, the driver's saddle, handlebar and dash */}
      <mesh geometry={geometries.bench} position={[0, 0.9, -0.68]} castShadow>
        <Paint c={VINYL} rough={0.55} metal={0} />
      </mesh>
      <mesh geometry={geometries.backrest} position={[0, 1.08, -0.87]} rotation={[-0.12, 0, 0]}>
        <Paint c={VINYL} rough={0.55} metal={0} />
      </mesh>
      <mesh geometry={geometries.saddle} position={[0, 0.8, 0.2]} castShadow>
        <Paint c={RUBBER} rough={0.6} metal={0} />
      </mesh>
      <Rod a={[0, 0.9, 0.6]} b={[0, 1.02, 0.5]} r={0.02} c={RUBBER} />
      <Rod a={[-0.3, 1.04, 0.47]} b={[0.3, 1.04, 0.47]} r={0.016} c={CHROME} metal />
      {[-1, 1].map((s) => <Rod key={s} a={[s * 0.24, 1.04, 0.47]} b={[s * 0.33, 1.04, 0.45]} r={0.022} c={RUBBER} />)}
      <mesh position={[0, 0.95, 0.62]} rotation={[-0.6, 0, 0]}>
        <boxGeometry args={[0.6, 0.12, 0.08]} />
        <meshStandardMaterial color="#27272a" roughness={0.7} />
      </mesh>

      {/* Back: tail lamps, plate and the chrome guard */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.4, 0.66, -0.995]}>
          <boxGeometry args={[0.1, 0.12, 0.02]} />
          <meshStandardMaterial color="#dc2626" emissive="#7f1d1d" emissiveIntensity={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 0.52, -1.0]}>
        <boxGeometry args={[0.24, 0.12, 0.012]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <Rod a={[-0.48, 0.4, -1.06]} b={[0.48, 0.4, -1.06]} r={0.022} c={CHROME} metal />
      {[-0.4, 0.4].map((x) => <Rod key={x} a={[x, 0.4, -1.06]} b={[x, 0.42, -0.96]} r={0.016} c={CHROME} metal />)}

      {/* Wheels: one in its fork under the nose, two under fenders at the back */}
      <Wheel p={[0, 0.21, 0.8]} />
      <Fender p={[0, 0.21, 0.8]} r={0.26} w={0.17} arc={Math.PI * 0.95} c={YELLOW} />
      {[-1, 1].map((s) => <Rod key={s} a={[s * 0.07, 0.21, 0.8]} b={[s * 0.06, 0.44, 0.74]} r={0.016} c={CHROME} metal />)}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Wheel p={[s * 0.6, 0.21, -0.55]} />
          <Fender p={[s * 0.6, 0.21, -0.55]} r={0.27} w={0.2} arc={Math.PI * 0.8} c={RUBBER} />
        </group>
      ))}
    </group>
  );
}
