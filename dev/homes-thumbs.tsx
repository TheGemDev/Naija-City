// TEMP harness (delete after): every house picture the House app can show.
import { createRoot } from 'react-dom/client';
import { LotThumb } from '../src/ui/homesKit';
import type { Lot } from '../src/three/Estate';
import type { HouseExterior } from '../src/game/exterior';

const lot = (key: string, design: string | null, stage = 4, plot: Lot['plot'] = 'full', extra: Partial<Lot> = {}): Lot => ({ key, slot: 0, plot, stage, design, owner: 'You', mine: true, building: stage > 0 && stage < 4, uid: null, ...extra });
const ext = (e: HouseExterior) => ({ exterior: e });
const cells: [string, Lot][] = [
  ['Government starter house', lot('g', 'starter')],
  ['Self-con (half plot)', lot('a', 'selfcon', 4, 'half')],
  ['3-Bedroom Bungalow', lot('b', 'bungalow')],
  ['4-Bedroom Executive', lot('c', 'duplex', 4, 'full', { cars: ['#1d4ed8'] })],
  ['Block of 6 Flats (double)', lot('d', 'flats', 4, 'double')],
  ['5-Bedroom Mansion (double)', lot('e', 'mansion', 4, 'double', { cars: ['#0f172a', '#e5e7eb'] })],
  ['Bare land', lot('f', null, 0)],
  ['Foundation', lot('h', 'duplex', 1)],
  ['Blockwork', lot('i', 'duplex', 2)],
  ['Roof on', lot('j', 'mansion', 3, 'double')],
  ['Bungalow · stone wall, ornate gate, tile roof', lot('k', 'bungalow', 4, 'full', { ...ext({ fence: 'stone', gate: 'ornate', roofFinish: 'tile', roofColour: 'terracotta', paving: 'herringbone' }), wall: '#e8a5b4' })],
  ['Self-con · hedge, gable, grill + gazebo', lot('l', 'selfcon', 4, 'full', ext({ fence: 'hedge', roof: 'gable', items: ['grill', 'gazebo', 'mango', 'tank'] }))],
  ['Executive · railings, tensile carport, pool, + BQ', lot('m', 'duplex', 4, 'full', { ...ext({ fence: 'railing', carport: 'tensile', carportColour: 'red', items: ['carport', 'pool', 'palm', 'tank', 'genhouse', 'lawn'] }), extensions: ['bq', 'balcony'], cars: ['#15803d'] })],
  ['Bungalow · 2nd floor, flat roof + terrace', lot('n', 'bungalow', 4, 'full', { ...ext({ roof: 'flat', items: ['tank', 'security', 'bar', 'lawn'] }), extensions: ['floor2', 'balcony', 'terrace'] })],
  ['Mansion · checker paving, sloped carport, green roof', lot('o', 'mansion', 4, 'double', { ...ext({ paving: 'checker', carport: 'sloped', roofColour: 'green', roof: 'hipped', fenceColour: 'white', gateColour: 'gold' }), cars: ['#991b1b'] })],
];
createRoot(document.getElementById('root')!).render(
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: 12, width: 900 }}>
    {cells.map(([label, l]) => <div key={label}><LotThumb lot={l} /><b>{label}</b></div>)}
  </div>,
);
