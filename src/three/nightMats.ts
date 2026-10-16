// Materials every lit building on the map shares, so windows and street lamps can all light up at night in one go
// (City.tsx MapEffects drives them). Kept in a file of their own with no imports from the town code: placeKit,
// trainKit and the place models use them, and reaching them through cityModels made an import cycle.

import { MeshStandardMaterial } from 'three';

/** Shared materials so windows and street lamps can all light up at night in one go. */
export const windowMat = new MeshStandardMaterial({ color: '#5f8fb0', emissive: '#ffcf7a', emissiveIntensity: 0, roughness: 0.18, metalness: 0.55 });

/** The share of windows with a light on (0 to 1), set by the map at night (City.tsx MapEffects). */
export const windowsLit = { value: 1 };

// Not every room is lit at once. Each window has a seed from where it stands (StaticBatch.tsx): the ones under
// `windowsLit` glow, a few with the cold white of a fluorescent tube instead of a warm bulb, each a little
// brighter or dimmer. By day the seed gives some panes a slightly darker glass (never a brighter one).
windowMat.onBeforeCompile = (shader) => {
  shader.uniforms.uLit = windowsLit;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float seed;\nvarying float vSeed;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeed = seed;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uLit;\nvarying float vSeed;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.84 + 0.16 * fract(vSeed * 53.0);')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec3 tube = vec3(0.62, 0.92, 1.45);
      totalEmissiveRadiance *= step(vSeed, uLit) * mix(vec3(1.0), tube, step(0.8, fract(vSeed * 37.0))) * (0.55 + 0.9 * fract(vSeed * 91.0));`);
};
export const lampMat = new MeshStandardMaterial({ color: '#fff4cf', emissive: '#ffd27a', emissiveIntensity: 0 });
