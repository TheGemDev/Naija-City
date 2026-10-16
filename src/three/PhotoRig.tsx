import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { MOUSE, TOUCH, Vector2, type PerspectiveCamera } from 'three';
import { avatar, avatarView } from '../game/avatar';
import { houseLayoutForDesign } from '../game/grid';
import { homeTransform } from '../game/origins';
import { FORMAT_BY_ID, SHOT_BY_ID, usePhoto } from '../game/photo';
import { sfx } from '../game/sfx';
import { placeHere } from '../game/city';
import { regionOf } from '../game/regions';
import { REGION_BY_ID } from '../game/property';
import { activeDesignOf, dayOf, flightOf, useGame } from '../game/store';
import { FLIGHT_SEAT } from './FlightCabin';
import { rideClass, TRAIN_SEAT } from './TrainRide';
import { useVisit } from '../game/visits';
import { MAP_SCALE, onMap } from './Avatar';

/** The picture is rendered this much bigger than it is saved and then shrunk, which smooths every edge. */
const OVERSAMPLE = 1.5;

/** The part of the screen that ends up in the picture is the biggest box of the picture's shape that fits on it
 *  (ui/PhotoMode.tsx draws that box). This is the lens that sees exactly that box, at the picture's shape. */
function pictureLens(camera: PerspectiveCamera) {
  const f = FORMAT_BY_ID[usePhoto.getState().format];
  const aspect = f.w / f.h;
  const half = Math.tan(((camera.fov / 2) * Math.PI) / 180) * Math.min(1, camera.aspect / aspect);
  return { w: f.w, h: f.h, aspect, half, fov: (Math.atan(half) * 360) / Math.PI };
}

/** Where I am drawn right now (on the sofa, in bed, on a bridge) in the world, how big, and the house around me if I am in one. */
function photoFrame(camera: PerspectiveCamera) {
  const s = useGame.getState();
  // In the air I am the one in the seat (three/FlightCabin.tsx): the avatar is still standing, unseen, at the airport.
  const flight = flightOf(s);
  if (flight) {
    const seat = flight === 'train' ? TRAIN_SEAT[rideClass()] : FLIGHT_SEAT[flight];
    return { me: { x: seat.x, y: 0, z: seat.z }, size: 1, house: null, seated: true };
  }
  const visit = useVisit.getState().current;
  const at = visit ? { origin: visit.save.origin, design: visit.save.design } : s.view === 'home' ? { origin: s.origin, design: activeDesignOf(s) } : null;
  // Out in town or inside a place there is no house to frame: the shots are all about me.
  if (!at) return { me: { x: avatarView.x, y: avatarView.y, z: avatarView.z }, size: onMap(s.view) ? MAP_SCALE : 1, house: null, seated: false };
  const layout = houseLayoutForDesign(at.design);
  const t = homeTransform(at.origin, at.design);
  const lens = pictureLens(camera);
  const span = Math.max(layout.gridW, layout.gridH) * 0.86 * t.scale;
  return {
    me: { x: t.x + avatarView.x * t.scale, y: 0, z: t.z + avatarView.z * t.scale },
    size: 1,
    seated: false,
    // The middle of the house, and the camera distance that fits all of it on this screen.
    house: { x: t.x + (layout.gridW * t.scale) / 2, z: t.z + (layout.gridH * t.scale) / 2, fit: span / (lens.half * Math.min(1, lens.aspect)) },
  };
}

/** Where this picture is being taken, in a few words. */
function placeName() {
  const s = useGame.getState();
  const visit = useVisit.getState().current;
  return visit
    ? visit.ownerName ? `${visit.ownerName}'s house` : 'Visiting'
    : flightOf(s) ? (flightOf(s) === 'jet' ? 'On the private jet' : flightOf(s) === 'train' ? 'On the train' : 'In the air')
    : s.view === 'home' ? 'At home'
    : s.view === 'place' ? (s.insideId && placeHere(s.insideId)?.name) || regionOf(s.destinationId).name
    : s.view === 'estate' ? (s.estateId && REGION_BY_ID[s.estateId]?.name) || regionOf(s.destinationId).name
    : regionOf(s.destinationId).name;
}

/** Runs the camera while photo mode is open: frames each shot, keeps the camera inside its limits, and takes the picture. */
export function PhotoRig() {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const setEvents = useThree((s) => s.setEvents);
  const shot = usePhoto((s) => s.shot);
  const format = usePhoto((s) => s.format);
  const shutter = usePhoto((s) => s.shutter);
  const seen = useRef(shutter);

  // Taps on the scene do nothing here (no walking off, no furniture menus); dragging and pinching still move the camera.
  useEffect(() => {
    setEvents({ enabled: false });
    return () => setEvents({ enabled: true });
  }, [setEvents]);

  // The area's own camera limits come back when photo mode closes (see Controls in Scene.tsx).
  useEffect(() => {
    if (!controls) return;
    const def = SHOT_BY_ID[shot];
    const { me, size, house, seated } = photoFrame(camera);
    // Away from a house only the shots centred on me make sense.
    if (def.fitsHouse && !house) return usePhoto.setState({ shot: 'selfie' });
    // A full-body shot needs more room than a cabin has.
    if (seated && def.id === 'portrait') return usePhoto.setState({ shot: 'selfie' });
    // The close shots are measured against my body, which is drawn small on the town map.
    const scale = def.fitsHouse && house ? house.fit : def.facesCamera ? size : 1;
    const t = def.onMe || !house ? me : { x: house.x, y: 0, z: house.z };
    let ax: number;
    let az: number;
    if (house) {
      // The camera stands on the far side of me from the middle of the house, so the room is the backdrop.
      ax = me.x - house.x;
      az = me.z - house.z;
      if (!def.onMe || Math.hypot(ax, az) < 0.75) ax = az = 1;
      // The floor plan reads best square to the screen, front door at the bottom.
      if (def.id === 'plan') ax = 0;
    } else {
      // Elsewhere it stays on the side the area was already being looked at from, which is its open side.
      ax = camera.position.x - controls.target.x;
      az = camera.position.z - controls.target.z;
      if (Math.hypot(ax, az) < 0.01) az = 1;
    }
    // Strapped into a seat I can't turn to the lens, so it comes to me: in front, over the aisle, and close
    // enough to stay inside the cabin and clear of the seat opposite.
    const inSeat = seated && def.facesCamera;
    if (inSeat) {
      ax = -Math.sign(me.x || 1);
      az = 1;
    }
    const turn = Math.atan2(ax, az);
    const d = inSeat ? 2.5 : def.dist * scale;
    // A little above, so the lens looks over the seat backs.
    const tilt = inSeat ? 1.2 : def.tilt;
    const y = t.y + (inSeat ? 1.3 : def.lookY * (def.facesCamera ? size : 1));
    // The town map only slides; here one finger always turns the camera round the subject.
    controls.enablePan = false;
    controls.enableRotate = true;
    controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
    controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_ROTATE };
    controls.minDistance = inSeat ? 1.5 : def.minDist * scale;
    controls.maxDistance = inSeat ? 3.2 : def.maxDist * scale;
    controls.minPolarAngle = def.minTilt;
    controls.maxPolarAngle = def.maxTilt;
    controls.target.set(t.x, y, t.z);
    camera.position.set(t.x + d * Math.sin(tilt) * Math.sin(turn), y + d * Math.cos(tilt), t.z + d * Math.sin(tilt) * Math.cos(turn));
    controls.update();
  }, [shot, format, controls, camera]);

  useFrame((_, dt) => {
    if (!controls) return;
    const def = SHOT_BY_ID[usePhoto.getState().shot];
    if (!def.onMe) return;
    const { me } = photoFrame(camera);
    const t = controls.target;
    const k = Math.min(1, dt * 6);
    const dx = (me.x - t.x) * k;
    const dz = (me.z - t.z) * k;
    t.x += dx;
    t.z += dz;
    camera.position.x += dx;
    camera.position.z += dz;
    // Look into the lens, unless I am sat or lying somewhere.
    if (def.facesCamera && !avatar.snap && !avatar.path.length) avatar.yaw = Math.atan2(camera.position.x - me.x, camera.position.z - me.z);
  });

  useEffect(() => {
    if (shutter === seen.current) return;
    seen.current = shutter;
    const el = gl.domElement;
    const lens = pictureLens(camera);
    const size = gl.getSize(new Vector2());
    const ratio = gl.getPixelRatio();
    const { aspect, fov } = camera;
    // One frame at the picture's own size and shape, whatever the screen is. The canvas has to be copied
    // before the browser clears it, so the copy happens right after the render, in the same breath; then
    // the canvas and camera go back to fitting the screen before the next frame is drawn.
    camera.aspect = lens.aspect;
    camera.fov = lens.fov;
    camera.updateProjectionMatrix();
    gl.setPixelRatio(1);
    gl.setSize(Math.round(lens.w * OVERSAMPLE), Math.round(lens.h * OVERSAMPLE), false);
    gl.render(scene, camera);
    const out = document.createElement('canvas');
    out.width = lens.w;
    out.height = lens.h;
    const ctx = out.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(el, 0, 0, out.width, out.height);
    }
    gl.setSize(size.x, size.y, false);
    gl.setPixelRatio(ratio);
    camera.aspect = aspect;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    if (!ctx) return;
    sfx.play('camera');
    // The Naija City mark, stickers and captions go on in the editor (ui/PhotoEditor.tsx).
    usePhoto.setState({ result: { shot: out, place: placeName(), day: dayOf(useGame.getState().minutes) } });
  }, [shutter, gl, scene, camera]);

  return null;
}
