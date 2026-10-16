// Where the activities menu (ui/PieMenu.tsx) opens: on the selected thing once the camera has finished swinging round
// to it (three/Scene.tsx CameraRig), so the ring never opens and then slides off what it belongs to. While the camera
// is still moving the anchor waits (x null); a selection the camera does not move for opens where you clicked.
import { create } from 'zustand';

export const usePieAnchor = create<{ id: string | null; x: number | null; y: number | null }>(() => ({ id: null, x: null, y: null }));
