import { create } from 'zustand';

/** The car tapped in the bay at home (three/World.tsx), whose actions the sheet shows (ui/ParkedCar.tsx). */
export const useParkedCar = create<{ carId: string | null }>(() => ({ carId: null }));
