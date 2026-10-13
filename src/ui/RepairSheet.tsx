import { useEffect } from 'react';
import { ITEMS } from '../game/catalog';
import { repairCost, repairItem, useRepair } from '../game/breakdowns';
import { naira, useGame } from '../game/store';
import { useVisit } from '../game/visits';

const close = () => useRepair.setState({ itemId: null });

/** Tap a spoilt appliance (or the spanner over it) → pay the repairer to fix it. */
export function RepairSheet() {
  const itemId = useRepair((r) => r.itemId);
  const item = useGame((s) => (s.view === 'home' ? s.items.find((i) => i.id === itemId && i.broken) : undefined));
  const money = useGame((s) => s.money);
  // Picking something else, opening the phone, Buy mode or walking into a visit puts the sheet away.
  const busy = useGame((s) => s.mode !== 'live' || !!s.selectedId || !!s.panel);
  const visiting = useVisit((v) => !!v.current);
  const open = !!item && !busy && !visiting;
  useEffect(() => {
    if (itemId && !open) close();
  }, [itemId, open]);
  if (!item || !open) return null;

  const def = ITEMS[item.type];
  const cost = repairCost(item.type);
  return (
    <div className="sheet small">
      <div className="sheet-head">
        <h3>
          {def.icon} {def.name}
        </h3>
        <button className="x" onClick={close}>
          ✕
        </button>
      </div>
      <p className="muted">E don spoil. You can’t use it until the repairer fixes it.</p>
      <div className="actions">
        <button className={`action ${money < cost ? 'dim' : ''}`} onClick={() => repairItem(item.id)}>
          <span className="ai">🔧</span>
          <span>
            <b>Call the repairer</b>
            <small>{money < cost ? `${naira(cost)} · you no get am` : naira(cost)}</small>
          </span>
        </button>
      </div>
    </div>
  );
}
