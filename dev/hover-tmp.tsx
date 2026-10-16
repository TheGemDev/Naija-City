// Temporary: checks the desktop hover outline (src/three/HoverOutline.tsx) on a kit place, an old place, a car and a person.
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';
import { PlaceModel } from '../src/three/cityModels';
import { CarModel } from '../src/three/CarModel';
import { Person, type Clip } from '../src/three/Person';
import { HoverOutline, offHover, onHover } from '../src/three/HoverOutline';

function Guy() {
  const clip = useRef<Clip>('idle');
  return <group position={[6, 0, 3]} onPointerOver={onHover} onPointerOut={offHover}><Person look="man-casual" clipRef={clip} /></group>;
}

createRoot(document.getElementById('root')!).render(
  <Canvas gl={{ stencil: true }} shadows camera={{ position: [0, 14, 16], fov: 45 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0)}>
    <ambientLight intensity={0.8} />
    <directionalLight position={[10, 20, 8]} intensity={2} />
    <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[40, 40]} /><meshStandardMaterial color="#86a94b" /></mesh>
    <group position={[-5, 0, 0]} onPointerOver={onHover} onPointerOut={offHover}><PlaceModel model="stadium" w={8} d={7} /></group>
    <group position={[4, 0, -4]} onPointerOver={onHover} onPointerOut={offHover}><PlaceModel model="hospital" w={6} d={5} /></group>
    <CarModel carId="golf_3" position={[2, 0, 5]} />
    <Guy />
    <HoverOutline />
  </Canvas>,
);
