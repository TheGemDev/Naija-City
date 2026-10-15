// Dev-only preview of the hand holding the phone (src/ui/Hand.tsx): /dev/hand.html
import { createRoot } from 'react-dom/client';
import { Hand } from '../src/ui/Hand';

createRoot(document.getElementById('root')!).render(
  <div className="stage">
    <div className="rig">
      <Hand part="back" />
      <div className="phone"><div className="screen" /></div>
      <Hand part="thumb" />
    </div>
  </div>,
);
