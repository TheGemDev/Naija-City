import { useRef } from 'react';
import { houseLayoutForDesign } from '../game/grid';
import { HOUSE_STAFF_ROLES, type HouseholdStaff as StaffRecord, type HouseStaffRole } from '../game/staff';
import { encodeLook } from '../game/wardrobe';
import { Person, type Clip } from './Person';

const LOOKS: Record<HouseStaffRole, string> = {
  cook: encodeLook({ body: 'm', skin: 4, hair: 'low', hairColor: 0, outfit: { top: 'kaftan_brown', shoes: 'slippers_palm', head: 'zanna_cap' } }),
  cleaner: encodeLook({ body: 'f', skin: 3, hair: 'bun', hairColor: 0, outfit: { top: 'blouse_yellow', bottom: 'skirt_navy', shoes: 'slippers_black' } }),
  security: encodeLook({ body: 'm', skin: 5, hair: 'bald', hairColor: 0, outfit: { top: 'suit_black', bottom: 'trousers_black', shoes: 'loafers_brown', eyes: 'shades_black' } }),
};

function staffPosition(role: StaffRecord['role'], design: string | null | undefined) {
  const layout = houseLayoutForDesign(design);
  if (role === 'security') {
    if (layout.entry.side === 'west') return { x: 1, z: layout.entry.at };
    return { x: layout.entry.at, z: layout.entry.side === 'north' ? 1 : layout.depth - 2 };
  }
  const room = role === 'cook'
    ? layout.rooms.find((r) => /kitchen|flat/i.test(r.name))
    : layout.rooms.find((r) => /living|parlour|lounge/i.test(r.name)) ??
      layout.rooms.find((r) => /bedroom/i.test(r.name));
  return room
    ? { x: Math.floor((room.x0 + room.x1) / 2), z: Math.floor((room.z0 + room.z1) / 2) }
    : { x: 1, z: 1 };
}

function StaffFigure({ member, design }: { member: StaffRecord & { role: HouseStaffRole }; design?: string | null }) {
  const position = staffPosition(member.role, design);
  const clip = useRef<Clip>('idle');
  return (
    <group position={[position.x + 0.5, 0, position.z + 0.5]}>
      <Person look={LOOKS[member.role]} clipRef={clip} />
    </group>
  );
}

export function HouseStaff({ staff = [], design }: { staff?: StaffRecord[]; design?: string | null }) {
  return (
    <>
      {staff.filter((member): member is StaffRecord & { role: HouseStaffRole } => HOUSE_STAFF_ROLES.includes(member.role as HouseStaffRole)).map((member, index) => <StaffFigure key={`${member.role}-${index}`} member={member} design={design} />)}
    </>
  );
}
