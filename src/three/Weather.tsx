// What the weather looks like (the weather itself is game/weather.ts): the sun and moon crossing the sky, stars,
// rain streaks and drifting clouds. Every piece is one draw call built in code, and the cheap ones are all low
// mode gets.

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending, BufferGeometry, CanvasTexture, Color, CustomBlending, Float32BufferAttribute, MathUtils, Object3D, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, SrcAlphaFactor, ZeroFactor,
  Vector2, Vector3,
  type InstancedMesh, type LineSegments, type Mesh, type MeshBasicMaterial, type PerspectiveCamera, type Points, type PointsMaterial,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { hourOf, useGame } from '../game/store';
import { activeMap } from '../game/city';
import { useVisit } from '../game/visits';
import { photoHour } from '../game/photo';
import { sceneHour } from '../game/theme';
import { sky } from '../game/weather';
import { useLowPerf } from '../game/quality';

/** The scene's hour, the same one the lighting uses (three/Scene.tsx). */
const hourNow = () => photoHour() ?? sceneHour(hourOf(useGame.getState().minutes));

/** A soft white glow fading out from the middle: the sun's halo, and the puffs clouds are made of. */
function glowTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new CanvasTexture(c);
}

/** Where the moon is in its month, 0 new, 0.5 full: counted from a known new moon (6 January 2000, 18:14 UTC). */
const moonPhase = (now = Date.now()) => ((((now - 947182440000) / 86400000) / 29.530588) % 1 + 1) % 1;

/** Tonight's moon, lit on the side the sun is on: a crescent, a half or a full moon, with a few darker seas on it. */
function moonTexture(phase: number, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const a = phase * Math.PI * 2;
  const lx = Math.sin(a), lz = -Math.cos(a);
  const seas = [[-0.25, -0.2, 0.28], [0.2, 0.15, 0.22], [-0.05, 0.4, 0.18], [0.3, -0.35, 0.14]];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size * 2 - 1, y = (py + 0.5) / size * 2 - 1;
      const rr = x * x + y * y;
      if (rr > 1) continue;
      const z = Math.sqrt(1 - rr);
      // Soft terminator, and a faint earthshine on the dark side so even a thin moon reads as a disc.
      const lit = MathUtils.smoothstep(x * lx + z * lz, -0.08, 0.12);
      const sea = seas.some(([sx, sy, sr]) => (x - sx) ** 2 + (y - sy) ** 2 < sr * sr) ? 0.82 : 1;
      const b = (0.14 + 0.86 * lit) * sea;
      const i = (py * size + px) * 4;
      img.data[i] = 245 * b;
      img.data[i + 1] = 243 * b;
      img.data[i + 2] = 228 * b;
      // The edge pixel is half covered: smooth the rim.
      img.data[i + 3] = 255 * Math.min(1, (1 - Math.sqrt(rr)) * size * 0.5) * (0.35 + 0.65 * lit);
    }
  }
  g.putImageData(img, 0, 0);
  return new CanvasTexture(c);
}

const SUN = new Color('#fff6d6');
const SUN_LOW = new Color('#ffb36b');
const SUN_DUST = new Color('#f6d7b0');
/** Distance in front of the camera the sky is drawn at: behind the island, inside the camera's far plane. */
const SKY_DEPTH = 300;
/** How far (in screen halves) the sky slides when the camera pans from the middle of the map to its edge. */
const PARALLAX = 0.2;

/**
 * The sun and moon. The camera always looks down on the world, so the open sky is the space round the floating
 * island: they are drawn far behind it, on an arc that matches the sun light (three/Scene.tsx), and slide a little
 * as the map pans (parallax). The sun rises in the east (the right of the map, where the light comes from in the
 * morning), peaks at the top and sets in the west; the moon
 * does the same through the night. The arc keeps to the top and sides of the screen, where the island leaves sky
 * showing; zoomed right in, the island fills the screen and hides them.
 */
export function SkyBodies() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const low = useLowPerf();
  const sun = useRef<Mesh>(null!);
  const halo = useRef<Mesh>(null!);
  const moon = useRef<Mesh>(null!);
  const stars = useRef<Points>(null!);
  const glow = useMemo(() => glowTexture(), []);
  const moonMap = useMemo(() => moonTexture(moonPhase()), []);
  const starGeo = useMemo(() => {
    // Scattered over the whole view, in camera space (x and y from -1 to 1 of the screen).
    const pos: number[] = [];
    for (let i = 0; i < 200; i++) pos.push(Math.random() * 2.6 - 1.3, Math.random() * 2.6 - 1.3, 0);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    return g;
  }, []);
  useLayoutEffect(() => () => { glow.dispose(); moonMap.dispose(); starGeo.dispose(); }, [glow, moonMap, starGeo]);

  const at = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);
  const ahead = useMemo(() => new Vector3(), []);
  // Where the view started, for parallax off the map: each room or yard has its own.
  const anchor = useRef({ key: '', x: 0, z: 0 });
  useFrame(({ controls }) => {
    const h = hourNow();
    const angle = ((h - 6) / 12) * Math.PI;
    const halfH = SKY_DEPTH * Math.tan(MathUtils.degToRad(camera.fov / 2));
    const halfW = halfH * camera.aspect;

    // The camera's right and straight ahead, flat along the ground: which side of the screen east is on.
    right.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
    ahead.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
    if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, -1);
    ahead.normalize();
    // Parallax: panning the map slides the sky a little the other way, a fifth of the way at most from one end of
    // the map to the other, so the sun and moon feel far off without sliding out of view.
    const s = useGame.getState();
    const t = (controls as OrbitControlsImpl | null)?.target ?? { x: 0, z: 0 };
    let cx: number, cz: number, span: number;
    if (s.view === 'city' && !useVisit.getState().current) {
      const map = activeMap();
      cx = map.w / 2;
      cz = map.h / 2;
      span = Math.max(map.w, map.h) / 2;
    } else {
      const key = `${s.view}|${s.teleportId}|${s.insideId ?? ''}`;
      if (anchor.current.key !== key) anchor.current = { key, x: t.x, z: t.z };
      cx = anchor.current.x;
      cz = anchor.current.z;
      span = 14;
    }
    const dx = t.x - cx, dz = t.z - cz;
    const px = -PARALLAX * MathUtils.clamp((dx * right.x + dz * right.z) / span, -1, 1);
    const py = -PARALLAX * MathUtils.clamp((dx * ahead.x + dz * ahead.z) / span, -1, 1);
    // A point on the sky, x and y from -1 to 1 across the screen, shifted by the parallax and kept on screen.
    const place = (m: Object3D, x: number, y: number, depth = SKY_DEPTH) => {
      const sx = MathUtils.clamp(x + px, -0.95, 0.95), sy = MathUtils.clamp(y + py, -0.95, 0.95);
      at.set(sx * halfW * (depth / SKY_DEPTH), sy * halfH * (depth / SKY_DEPTH), -depth).applyMatrix4(camera.matrixWorld);
      m.position.copy(at);
      m.quaternion.copy(camera.quaternion);
    };
    // East is +x in the world, where the morning light comes from (three/Scene.tsx): turn the camera round and the
    // sun's path turns with it.
    const east = right.x;
    // Clouds and dust hide the sky; the harmattan sun is a pale disc you can look straight at, with no glare.
    const clear = (1 - sky.cloud * 0.8) * (1 - sky.haze * 0.35);
    const up = Math.sin(angle);
    const sunUp = MathUtils.smoothstep(up, -0.12, 0.06);
    place(sun.current, Math.cos(angle) * east * 0.9, 0.55 + up * 0.38);
    sun.current.scale.setScalar(halfH * 0.06);
    const sm = sun.current.material as MeshBasicMaterial;
    sm.color.copy(SUN).lerp(SUN_LOW, 1 - MathUtils.smoothstep(up, 0, 0.35)).lerp(SUN_DUST, sky.haze * 0.7);
    sm.opacity = sunUp * clear;
    halo.current.position.copy(sun.current.position);
    halo.current.quaternion.copy(camera.quaternion);
    halo.current.scale.setScalar(halfH * 0.42);
    const hm = halo.current.material as MeshBasicMaterial;
    hm.color.copy(sm.color);
    hm.opacity = sunUp * clear * (1 - sky.haze * 0.8) * 0.55;

    const mAngle = angle + Math.PI;
    const mUp = Math.sin(mAngle);
    place(moon.current, Math.cos(mAngle) * east * 0.9, 0.55 + mUp * 0.38);
    moon.current.scale.setScalar(halfH * 0.055);
    (moon.current.material as MeshBasicMaterial).opacity = MathUtils.smoothstep(mUp, -0.12, 0.06) * clear;

    if (stars.current) {
      place(stars.current, 0, 0, SKY_DEPTH + 10);
      // The star field drifts with the parallax too: its middle is not clamped like the sun's.
      at.set(px * halfW * ((SKY_DEPTH + 10) / SKY_DEPTH), py * halfH * ((SKY_DEPTH + 10) / SKY_DEPTH), -(SKY_DEPTH + 10)).applyMatrix4(camera.matrixWorld);
      stars.current.position.copy(at);
      stars.current.scale.set(halfW * ((SKY_DEPTH + 10) / SKY_DEPTH), halfH * ((SKY_DEPTH + 10) / SKY_DEPTH), 1);
      const night = MathUtils.smoothstep(-up, 0.05, 0.4);
      (stars.current.material as PointsMaterial).opacity = night * (1 - sky.cloud) * (1 - sky.haze) * 0.9;
    }
  });

  // Painted straight onto the sky, before the world and without depth, so anything in the world covers them: the
  // island, and nothing else (the sea round it is the sky, three/Billboard.tsx, drawn just before these). They stay
  // in the opaque pass for that, blending by hand.
  const common = { depthTest: false, depthWrite: false, fog: false, toneMapped: false } as const;
  // The canvas's own alpha is left alone (it is composited over the page): only the colour blends.
  const over = { ...common, blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor } as const;
  return (
    <group>
      {!low && (
        <points ref={stars} geometry={starGeo} renderOrder={-12} frustumCulled={false}>
          <pointsMaterial color="#e8eeff" size={1.6} sizeAttenuation={false} blending={AdditiveBlending} {...common} opacity={0} />
        </points>
      )}
      <mesh ref={halo} renderOrder={-11} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={glow} blending={AdditiveBlending} {...common} opacity={0} />
      </mesh>
      <mesh ref={sun} renderOrder={-10} frustumCulled={false}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial {...over} opacity={0} />
      </mesh>
      <mesh ref={moon} renderOrder={-10} frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial map={moonMap} {...over} opacity={0} />
      </mesh>
    </group>
  );
}

/* ---------- Rain ---------- */

const RAIN_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  uniform float uLen;
  uniform float uWind;
  uniform vec3 uCenter;
  uniform vec2 uHalf;
  attribute vec4 seed;
  attribute float tip;
  varying float vFade;
  void main() {
    // Each drop falls through the box over and over, at its own speed; the moving point is its lower end.
    float speed = 22.0 * (0.8 + 0.4 * seed.w);
    float f = fract(seed.y - uTime * speed / uHeight);
    float y = f * uHeight;
    vec3 p = uCenter + vec3((seed.x - 0.5) * 2.0 * uHalf.x + uWind * y, y, (seed.z - 0.5) * 2.0 * uHalf.y);
    // The streak trails back up the way it fell, slanted by the wind.
    p += normalize(vec3(uWind, 1.0, 0.0)) * uLen * tip;
    vFade = (1.0 - tip * 0.85) * smoothstep(0.0, 0.04, f) * smoothstep(1.0, 0.75, f);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;
const RAIN_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity * vFade);
  }
`;

/**
 * Rain: a box of falling streaks round wherever the camera looks, all moved on the GPU from one clock, so the
 * whole storm is one draw call and nothing on the CPU. The box grows with the camera's distance so a zoomed-out
 * map is just as wet.
 */
export function Rain() {
  const low = useLowPerf();
  const count = low ? 700 : 2200;
  const ref = useRef<LineSegments>(null!);
  const geo = useMemo(() => {
    const seed: number[] = [];
    const tip: number[] = [];
    for (let i = 0; i < count; i++) {
      const s = [Math.random(), Math.random(), Math.random(), Math.random()];
      seed.push(...s, ...s);
      tip.push(0, 1);
    }
    const g = new BufferGeometry();
    // Positions come from the shader; three still wants the attribute to count the vertices.
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 6), 3));
    g.setAttribute('seed', new Float32BufferAttribute(seed, 4));
    g.setAttribute('tip', new Float32BufferAttribute(tip, 1));
    return g;
  }, [count]);
  const mat = useMemo(() => new ShaderMaterial({
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uHeight: { value: 30 }, uLen: { value: 0.9 }, uWind: { value: 0.18 },
      uCenter: { value: new Vector3() }, uHalf: { value: new Vector2(20, 16) }, uColor: { value: new Color('#f1f6fc') }, uOpacity: { value: 0 },
    },
  }), []);
  useLayoutEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame(({ camera, controls, clock }) => {
    const on = sky.rain > 0.02;
    ref.current.visible = on;
    if (!on) return;
    const t = (controls as OrbitControlsImpl | null)?.target ?? { x: 0, y: 0, z: 0 };
    const dist = camera.position.distanceTo(t as Vector3);
    const u = mat.uniforms;
    u.uTime.value = clock.elapsedTime;
    // Drops start just under the camera, so the nearest ones streak past it.
    u.uHeight.value = Math.max(6, camera.position.y * 0.85);
    u.uCenter.value.set(t.x, 0, t.z);
    u.uHalf.value.set(dist * 0.62, dist * 0.5);
    u.uLen.value = 0.7 + dist * 0.02;
    // A storm drives the rain sideways.
    u.uWind.value = 0.12 + sky.rain * 0.18;
    u.uOpacity.value = Math.min(1, sky.rain * 1.2) * 0.85;
  });

  return <lineSegments ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={5} visible={false} />;
}

/* ---------- Clouds ---------- */

const CLOUDS = 14;
/** Clouds wrap round inside a square this wide, kept centred on the camera, so there are always some in view. */
const CLOUD_SPAN = 140;
const CLOUD_WHITE = new Color('#ffffff');
const CLOUD_GREY = new Color('#7c8794');

/** A cloud puff: a few overlapping glows, lumpy instead of round. */
function puffTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const blobs = [[0.5, 0.5, 0.36], [0.33, 0.55, 0.24], [0.68, 0.52, 0.26], [0.45, 0.38, 0.22], [0.6, 0.64, 0.2]];
  for (const [x, y, r] of blobs) {
    const grad = g.createRadialGradient(x * size, y * size, 0, x * size, y * size, r * size);
    grad.addColorStop(0, 'rgba(255,255,255,0.75)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(c);
}

/**
 * Clouds drifting over the map on a cloudy or rainy day, high above the roofs. They thin out as the camera comes
 * down near them so they never hide where you are going.
 */
export function Clouds() {
  const low = useLowPerf();
  const n = low ? 6 : CLOUDS;
  const ref = useRef<InstancedMesh>(null!);
  const tex = useMemo(() => puffTexture(), []);
  useLayoutEffect(() => () => tex.dispose(), [tex]);
  // Each cloud's place in the wrapping square, height, size and turn: fixed, so everyone's clouds look alike.
  const seeds = useMemo(() => Array.from({ length: n }, (_, i) => {
    const r = (k: number) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
    return { x: r(1) * CLOUD_SPAN, z: r(2) * CLOUD_SPAN, y: 15 + r(3) * 7, s: 10 + r(4) * 12, a: r(5) * Math.PI * 2 };
  }), [n]);
  const o = useMemo(() => new Object3D(), []);

  useFrame(({ camera, controls }) => {
    const mesh = ref.current;
    const on = sky.cloud > 0.03;
    mesh.visible = on;
    if (!on) return;
    const t = (controls as OrbitControlsImpl | null)?.target ?? { x: 0, z: 0 };
    const drift = (Date.now() / 1000) * 0.6;
    const wrap = (v: number, c: number) => c + MathUtils.euclideanModulo(v - c + CLOUD_SPAN / 2, CLOUD_SPAN) - CLOUD_SPAN / 2;
    seeds.forEach((c, i) => {
      o.position.set(wrap(c.x + drift, t.x), c.y, wrap(c.z + drift * 0.3, t.z));
      o.rotation.set(-Math.PI / 2, 0, c.a);
      o.scale.set(c.s, c.s * 0.7, 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    const m = mesh.material as MeshBasicMaterial;
    m.color.copy(CLOUD_WHITE).lerp(CLOUD_GREY, sky.rain * 0.8);
    // Zoomed right in, the camera is only a little above them: fade them so the street stays clear.
    const room = MathUtils.smoothstep(camera.position.y - 22, 6, 30);
    m.opacity = sky.cloud * 0.42 * room;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} frustumCulled={false} renderOrder={4} visible={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} fog={false} opacity={0} />
    </instancedMesh>
  );
}
