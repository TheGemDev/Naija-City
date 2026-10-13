// HireApp: hire personal staff (driver, nanny, bodyguard) and assign them to your houses.
// House-based roles (cook, cleaner, security guard) are still managed inside the House app
// on the individual property page.

import { naira, useGame } from '../game/store';
import { HOUSEHOLD_STAFF, PERSONAL_STAFF_ROLES, type PersonalStaffRole } from '../game/staff';
import { DESIGN_BY_ID, isComplete, REGION_BY_ID } from '../game/property';

export function HireApp() {
  const properties      = useGame((s) => s.properties);
  const personalStaff   = useGame((s) => s.personalStaff);
  const money           = useGame((s) => s.money);
  const hirePersonal    = useGame((s) => s.hirePersonalStaff);
  const dismissPersonal = useGame((s) => s.dismissPersonalStaff);

  const completedHouses = properties.filter(isComplete);

  const assignPersonal  = useGame((s) => s.assignPersonalStaff);

  return (
    <>
      <div className="hero" style={{ background: 'linear-gradient(135deg, #0f766e, #134e4a)' }}>
        <small>Personal staff</small>
        <b>{personalStaff.length} hired</b>
        <small>
          {personalStaff.length === 0
            ? 'Hire a driver, nanny or bodyguard'
            : personalStaff.map((m) => HOUSEHOLD_STAFF[m.role].icon).join(' ')}
        </small>
      </div>

      <h4 style={{ padding: '12px 16px 4px' }}>Your personal staff</h4>
      <p className="muted" style={{ padding: '0 16px 8px' }}>
        Personal staff are paid daily from your account. They travel with you or work from your
        home base. They leave if you can't make payroll.
      </p>

      {completedHouses.length === 0 && (
        <p className="muted" style={{ padding: '0 16px 12px', fontStyle: 'italic' }}>
          ⚠️ You need at least one completed house before hiring personal staff — they need
          somewhere to report to.
        </p>
      )}

      {completedHouses.map((p) => {
        const design = p.design ? DESIGN_BY_ID[p.design] : null;
        return (
          <div className="list-card" key={p.id} style={{ margin: '0 12px 12px', padding: 12 }}>
            <b>{design?.icon ?? '🏠'} {design?.name ?? 'House'} · {REGION_BY_ID[p.region]?.name}</b>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10 }}>
              {PERSONAL_STAFF_ROLES.map((role: PersonalStaffRole) => {
                const def = HOUSEHOLD_STAFF[role];
                const member = personalStaff.find((m) => m.role === role);
                const here = member?.propertyId === p.id;
                const canAfford = money >= def.wage;
                return (
                  <div
                    key={role}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center',
                      padding: '10px 4px', borderRadius: 12, border: `1px solid ${here ? '#34d399' : '#e5e7eb'}`,
                      background: here ? 'var(--bg-ecfdf5)' : 'var(--surface)',
                    }}
                  >
                    <span style={{ fontSize: 26 }}>{def.icon}</span>
                    <b style={{ fontSize: 12 }}>{def.name}</b>
                    <small style={{ color: member ? '#059669' : canAfford ? '#059669' : '#dc2626' }}>
                      {member ? (here ? 'Hired here' : 'Hired elsewhere') : `${naira(def.wage)}/day`}
                    </small>
                    {here ? (
                      <button className="btn sm danger" onClick={() => dismissPersonal(role)}>Dismiss</button>
                    ) : member ? (
                      <button className="btn sm" onClick={() => assignPersonal(role, p.id)}>Move here</button>
                    ) : (
                      <button className="btn sm go" disabled={!canAfford} onClick={() => hirePersonal(role, p.id)}>
                        {canAfford ? 'Hire' : 'No cash'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <h4 style={{ padding: '16px 16px 4px' }}>How it works</h4>
      <div className="list-card" style={{ margin: '0 12px 16px' }}>
        {[
          { icon: '🚗', text: 'Driver — skip travel time when you have errands around town.' },
          { icon: '👶', text: 'Nanny — Social meter rises faster when you\'re home.' },
          { icon: '🕵️', text: 'Bodyguard — dramatically lowers the chance of being robbed or attacked.' },
        ].map(({ icon, text }) => (
          <div key={icon} className="txn">
            <span className="txn-dot in">{icon}</span>
            <span className="txn-label"><small>{text}</small></span>
          </div>
        ))}
      </div>
    </>
  );
}
