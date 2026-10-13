// Land and houses around Kaduna. You buy a plot in a region, pick a design, buy materials and pay a
// contractor stage by stage. A finished house can be rented out or sold. Properties don't sit on the
// town map; they live in the House phone app. Kept dependency-light so the server (worker/wallet.ts)
// can check rent and sale payouts against the same numbers.

export const DAY_MINUTES = 24 * 60;
export const LAND_RECLAIM_MINUTES = 30 * DAY_MINUTES;

export interface RegionDef {
  id: string;
  name: string;
  /** Short line about the area. */
  blurb: string;
  /** Price of one full plot. */
  plotPrice: number;
  /**
   * What building here costs against the cheapest land in Kaduna: materials and labour are both multiplied by this.
   * The big addresses want imported marble, piling, estate levies and contractors who charge accordingly.
   */
  build: number;
  /** Rent multiplier: tenants pay more in the nicer areas. */
  rent: number;
  /** The city the estate is in (game/regions.ts): you get to it from that city's map. */
  city: string;
}

export const REGIONS: RegionDef[] = [
  { id: 'kachia', name: 'Kachia', blurb: 'Southern Kaduna. Ginger farms, cheap land, far from town.', plotPrice: 300_000, build: 1, rent: 0.5, city: 'kaduna' },
  { id: 'rigasa', name: 'Rigasa', blurb: 'Busy and crowded, right by the train station.', plotPrice: 500_000, build: 1, rent: 0.7, city: 'kaduna' },
  { id: 'kakuri', name: 'Kakuri', blurb: 'Old textile-mill town. Workers always need a room.', plotPrice: 600_000, build: 1, rent: 0.75, city: 'kaduna' },
  { id: 'sabon_tasha', name: 'Sabon Tasha', blurb: 'Growing fast south of the river. Lively nights.', plotPrice: 800_000, build: 1.1, rent: 0.8, city: 'kaduna' },
  { id: 'kawo', name: 'Kawo', blurb: 'Motor park, stadium and plenty of traffic.', plotPrice: 1_500_000, build: 1.2, rent: 1, city: 'kaduna' },
  { id: 'barnawa', name: 'Barnawa', blurb: 'Quiet streets, good schools, family people.', plotPrice: 2_500_000, build: 1.4, rent: 1.05, city: 'kaduna' },
  { id: 'ungwan_rimi', name: 'Ungwan Rimi', blurb: 'Leafy GRA next to the Polo Club.', plotPrice: 6_000_000, build: 2, rent: 1.2, city: 'kaduna' },
  { id: 'millennium', name: 'Millennium City', blurb: 'New estates, wide roads, corporate tenants.', plotPrice: 10_000_000, build: 2.5, rent: 1.35, city: 'kaduna' },
  { id: 'malali', name: 'Malali GRA', blurb: 'Big compounds, big gates, big men.', plotPrice: 25_000_000, build: 4, rent: 1.5, city: 'kaduna' },
  // Abuja: land in the capital costs far more, and so does the rent.
  { id: 'lugbe', name: 'Lugbe', blurb: 'Airport Road. Civil servants, new estates and long traffic into town.', plotPrice: 8_000_000, build: 2, rent: 1.1, city: 'abuja' },
  { id: 'kubwa', name: 'Kubwa', blurb: 'The big satellite town past the expressway. Always full, always growing.', plotPrice: 12_000_000, build: 2.5, rent: 1.25, city: 'abuja' },
  { id: 'gwarinpa', name: 'Gwarinpa', blurb: 'The largest housing estate in West Africa. Avenues, plazas and gated closes.', plotPrice: 60_000_000, build: 6, rent: 1.6, city: 'abuja' },
  { id: 'jabi', name: 'Jabi', blurb: 'By the lake and the mall. Young money and serviced flats.', plotPrice: 200_000_000, build: 12, rent: 2, city: 'abuja' },
  { id: 'wuse2', name: 'Wuse II', blurb: 'The heart of town. Lounges, banks and expatriate tenants.', plotPrice: 450_000_000, build: 20, rent: 2.5, city: 'abuja' },
  { id: 'asokoro', name: 'Asokoro', blurb: 'Diplomats and governors’ lodges, in the shadow of Aso Rock.', plotPrice: 1_200_000_000, build: 35, rent: 3.2, city: 'abuja' },
  { id: 'maitama', name: 'Maitama', blurb: 'Ministers’ Hill. The most expensive address in the country.', plotPrice: 2_000_000_000, build: 50, rent: 4, city: 'abuja' },
  // Lagos: the mainland is dear, the Island is another country, and Banana Island is the top of the whole map.
  { id: 'ikorodu', name: 'Ikorodu', blurb: 'Far out past the lagoon. Cheap plots, omo onile, and two hours to anywhere.', plotPrice: 6_000_000, build: 1.8, rent: 1, city: 'lagos' },
  { id: 'festac', name: 'Festac Town', blurb: 'The old festival village. Numbered avenues, old money and canals behind the houses.', plotPrice: 18_000_000, build: 2.5, rent: 1.3, city: 'lagos' },
  { id: 'surulere', name: 'Surulere', blurb: 'The heart of the mainland. Stadium, Nollywood offices and noise till morning.', plotPrice: 45_000_000, build: 4, rent: 1.5, city: 'lagos' },
  { id: 'yaba', name: 'Yaba', blurb: 'Students, start-ups and landlords who want two years upfront.', plotPrice: 80_000_000, build: 6, rent: 1.7, city: 'lagos' },
  { id: 'ikeja_gra', name: 'Ikeja GRA', blurb: 'Quiet streets by the airport. Hotels, old colonial plots and airline crews.', plotPrice: 280_000_000, build: 14, rent: 2.1, city: 'lagos' },
  { id: 'lekki1', name: 'Lekki Phase 1', blurb: 'Past the toll gate. Short-lets, lounges and a flood every July.', plotPrice: 550_000_000, build: 22, rent: 2.6, city: 'lagos' },
  { id: 'vi', name: 'Victoria Island', blurb: 'Banks, embassies and towers. The ocean is at the end of the street.', plotPrice: 1_400_000_000, build: 38, rent: 3.4, city: 'lagos' },
  { id: 'ikoyi', name: 'Ikoyi', blurb: 'Old Ikoyi: Bourdillon, Gerrard and neighbours who own banks.', plotPrice: 2_400_000_000, build: 55, rent: 4.2, city: 'lagos' },
  { id: 'banana', name: 'Banana Island', blurb: 'One gate, one bridge, and billionaires on every close. The dearest land in the country.', plotPrice: 4_000_000_000, build: 70, rent: 5, city: 'lagos' },
  // Kano: the old city and the outskirts are cheap, Nassarawa GRA is where the money sleeps.
  { id: 'rijiyar_zaki', name: 'Rijiyar Zaki', blurb: 'Out on the Gwarzo road past the university. New layouts, sandy streets and plots sold twice.', plotPrice: 400_000, build: 1, rent: 0.6, city: 'kano' },
  { id: 'sharada', name: 'Sharada', blurb: 'Factory town. Mill workers, tanneries and a room is never empty for long.', plotPrice: 700_000, build: 1, rent: 0.75, city: 'kano' },
  { id: 'fagge', name: 'Fagge', blurb: 'Traders’ quarter beside Kantin Kwari. Narrow streets, shops downstairs, tenants upstairs.', plotPrice: 1_200_000, build: 1.1, rent: 0.9, city: 'kano' },
  { id: 'sabon_gari', name: 'Sabon Gari', blurb: 'The strangers’ quarter. Every tribe, every church, and nightlife till morning.', plotPrice: 2_000_000, build: 1.2, rent: 1.05, city: 'kano' },
  { id: 'hotoro', name: 'Hotoro', blurb: 'Quiet streets off the Maiduguri road. Civil servants, depot managers and big gates.', plotPrice: 4_000_000, build: 1.6, rent: 1.15, city: 'kano' },
  { id: 'gyadi_gyadi', name: 'Gyadi-Gyadi', blurb: 'Between Zoo Road and Zaria Road. Close to the mall, the hospital and everything else.', plotPrice: 8_000_000, build: 2.2, rent: 1.3, city: 'kano' },
  { id: 'nassarawa_gra', name: 'Nassarawa GRA', blurb: 'Government House is round the corner. Old colonial plots, commissioners and textile money.', plotPrice: 30_000_000, build: 4.5, rent: 1.6, city: 'kano' },
];
export const REGION_BY_ID: Record<string, RegionDef> = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
/** The estates you can get to from that city's map. */
export const cityEstates = (city: string) => REGIONS.filter((r) => r.city === city);
/** The city an estate is in; anything unknown is Kaduna. */
export const estateCity = (region?: string | null) => REGION_BY_ID[region ?? '']?.city ?? 'kaduna';
/** The body that takes back bare land in that estate's city. */
export const landAuthority = (region?: string | null) => ({ abuja: 'FCTA', lagos: 'The Lagos Lands Bureau', kano: 'Knupda' } as Record<string, string>)[estateCity(region)] ?? 'Kasupda';

export type PlotSize = 'half' | 'full' | 'double';
export const PLOTS: Record<PlotSize, { label: string; factor: number }> = {
  half: { label: 'Half plot', factor: 0.55 },
  full: { label: 'Full plot', factor: 1 },
  double: { label: 'Two plots', factor: 1.9 },
};
export const landPrice = (region: RegionDef, plot: PlotSize) => Math.round(region.plotPrice * PLOTS[plot].factor);

export interface MaterialDef { id: string; name: string; unit: string; icon: string; price: number }

export const MATERIALS: MaterialDef[] = [
  { id: 'cement', name: 'Dangote cement', unit: '50kg bag', icon: '🧱', price: 9_500 },
  { id: 'blocks', name: '9-inch blocks', unit: '100 blocks', icon: '🟫', price: 65_000 },
  { id: 'sand', name: 'Sharp sand', unit: 'tipper load', icon: '⏳', price: 85_000 },
  { id: 'granite', name: 'Granite', unit: 'tipper load', icon: '🪨', price: 180_000 },
  { id: 'rods', name: '12mm iron rods', unit: 'bundle of 10', icon: '🔩', price: 120_000 },
  { id: 'timber', name: 'Roof timber', unit: '20 pieces', icon: '🪵', price: 60_000 },
  { id: 'roofing', name: 'Aluminium roofing', unit: '10 sheets', icon: '🏚️', price: 95_000 },
  { id: 'tiles', name: 'Floor tiles', unit: '10 cartons', icon: '🔲', price: 110_000 },
  { id: 'paint', name: 'Emulsion paint', unit: '4 buckets', icon: '🎨', price: 80_000 },
  { id: 'fittings', name: 'Doors, wiring & plumbing', unit: 'set', icon: '🚪', price: 250_000 },
];
export const MATERIAL_BY_ID: Record<string, MaterialDef> = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));

export interface StageDef {
  id: string;
  name: string;
  icon: string;
  /** Materials for a size-1 house; designs scale these. */
  materials: Record<string, number>;
  labour: number;
  days: number;
}

export const STAGES: StageDef[] = [
  { id: 'foundation', name: 'Foundation', icon: '⛏️', materials: { cement: 30, blocks: 4, sand: 1, granite: 1, rods: 2 }, labour: 120_000, days: 2 },
  { id: 'blockwork', name: 'Blockwork', icon: '🧱', materials: { cement: 40, blocks: 10, sand: 2 }, labour: 180_000, days: 3 },
  { id: 'roofing', name: 'Roofing', icon: '🏠', materials: { timber: 3, roofing: 3, rods: 1 }, labour: 150_000, days: 2 },
  { id: 'finishing', name: 'Finishing', icon: '🎨', materials: { cement: 25, tiles: 2, paint: 1, fittings: 1, sand: 1 }, labour: 200_000, days: 3 },
];

export interface DesignDef {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  /** Scales materials, labour and build time. */
  size: number;
  /**
   * Finish grade: multiplies what every bag and every day of labour costs, on top of `size`. A bigger house is
   * dearer per square metre too (deeper foundations, a real architect, marble where the self-con has cement screed).
   */
  grade: number;
  /** Rent per game day before the region multiplier. */
  rentPerDay: number;
  floors: 1 | 2;
}

// House types differ by interior floor area (see the layouts in game/grid.ts), smallest first.
// Every design can be built on any plot size; a multi-storey exterior still has one playable floor.
export const DESIGNS: DesignDef[] = [
  { id: 'selfcon', name: 'Room & Parlour Self-con', icon: '🛖', blurb: 'One room, a parlour and a toilet. Students and young workers love it.', size: 0.5, grade: 1, rentPerDay: 7_000, floors: 1 },
  { id: 'bungalow', name: '3-Bedroom Bungalow', icon: '🏡', blurb: 'The classic family house with a small compound.', size: 1, grade: 1.25, rentPerDay: 15_000, floors: 1 },
  { id: 'duplex', name: '4-Bedroom Executive House', icon: '🏘️', blurb: 'Big parlour, long hallway, four bedrooms. Big man things.', size: 2.2, grade: 2, rentPerDay: 34_000, floors: 1 },
  { id: 'flats', name: 'Block of 6 Flats', icon: '🏢', blurb: 'Six flats off one corridor. Six tenants, six rents. Landlord mode activated.', size: 3.5, grade: 2.4, rentPerDay: 58_000, floors: 1 },
  { id: 'mansion', name: '5-Bedroom Mansion', icon: '🏰', blurb: 'A two-storey luxury home with generous entertaining space and room for the whole family.', size: 4.5, grade: 4.5, rentPerDay: 82_000, floors: 2 },
];
export const DESIGN_BY_ID: Record<string, DesignDef> = Object.fromEntries(DESIGNS.map((d) => [d.id, d]));

export interface ContractorDef {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  /** Labour fee multiplier. */
  fee: number;
  /** Build time multiplier. */
  speed: number;
}

export const CONTRACTORS: ContractorDef[] = [
  { id: 'mallam', name: 'Mallam Sani & Boys', icon: '👷🏾', blurb: 'Affordable, but takes a little longer.', fee: 0.6, speed: 1.6 },
  { id: 'standard', name: 'Kaduna Builders Ltd', icon: '🏗️', blurb: 'Steady work at a fair price.', fee: 1, speed: 1 },
  { id: 'premium', name: 'Arewa Construction Co.', icon: '🚧', blurb: 'Big machines get it done faster.', fee: 1.8, speed: 0.6 },
];
export const CONTRACTOR_BY_ID: Record<string, ContractorDef> = Object.fromEntries(CONTRACTORS.map((c) => [c.id, c]));

export interface ConstructionPlan {
  contractor: string;
}

export interface Property {
  id: string;
  region: string;
  plot: PlotSize;
  design: string | null;
  /** Stages finished so far (STAGES.length = house complete). */
  stage: number;
  /** The stage under way. */
  building: { contractor: string; startedAt: number; doneAt: number } | null;
  /** If present, all remaining stages have been paid for and continue automatically. */
  constructionPlan?: ConstructionPlan | null;
  /** Materials on site, by material id. */
  stock: Record<string, number>;
  /** Game minute the plot was bought; bare land is reclaimed after the grace period. */
  boughtAt?: number;
  /** Everything paid into this property so far. Sale price and the server's checks build on it. */
  spent: number;
  rented: boolean;
  /** Rent is paid for whole days since this minute. */
  rentFrom: number;
  /** Plot slot in the region's estate (game/estate.ts). The server assigns it for signed-in players. */
  slot?: number;
  /** The plot the player tapped when buying; the server gives them this slot if it is still free. */
  chosenSlot?: number;
  /** Real time (ms) the last stage finished. Houses completed before this was recorded have none. */
  builtAt?: number;
  /** NPC household staff assigned to this property. */
  staff?: import('./staff').HouseholdStaff[];
  /** Furnishings belonging only to this house; newly built properties start empty. */
  items?: import('./grid').PlacedItem[];
}

/** Materials a design needs for a stage. */
export function stageMaterials(design: DesignDef, stage: StageDef): Record<string, number> {
  return Object.fromEntries(Object.entries(stage.materials).map(([id, n]) => [id, Math.ceil(n * design.size)]));
}

/** How much dearer it is to build this design in this region (RegionDef.build × DesignDef.grade); anything unknown is the base price. */
export const buildFactor = (region?: string | null, design?: string | null) => (REGION_BY_ID[region ?? '']?.build ?? 1) * (DESIGN_BY_ID[design ?? '']?.grade ?? 1);
/** What one unit of a material costs delivered to a site in this region, for this design. */
export const materialPrice = (id: string, region?: string | null, design?: string | null) => Math.round((MATERIAL_BY_ID[id]?.price ?? 0) * buildFactor(region, design));

export const stageLabour = (design: DesignDef, stage: StageDef, c: ContractorDef, region?: string | null) =>
  Math.round((stage.labour * design.size * c.fee * buildFactor(region, design.id)) / 1000) * 1000;
export const stageMinutes = (design: DesignDef, stage: StageDef, c: ContractorDef) =>
  Math.max(1, Math.round(stage.days * Math.max(1, Math.sqrt(design.size)) * c.speed * 10));

export function remainingStageMaterials(design: DesignDef, fromStage = 0): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const stage of STAGES.slice(fromStage)) {
    for (const [id, amount] of Object.entries(stageMaterials(design, stage))) {
      totals[id] = (totals[id] ?? 0) + amount;
    }
  }
  return totals;
}

export function remainingBuildMinutes(design: DesignDef, contractor: ContractorDef, fromStage = 0): number {
  return STAGES.slice(fromStage).reduce((total, stage) => total + stageMinutes(design, stage, contractor), 0);
}

/** What is still needed on site before the next stage can start. */
export function missingMaterials(p: Property): Record<string, number> {
  const design = p.design ? DESIGN_BY_ID[p.design] : null;
  const stage = STAGES[p.stage];
  if (!design || !stage) return {};
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(stageMaterials(design, stage))) {
    const short = n - (p.stock[id] ?? 0);
    if (short > 0) out[id] = short;
  }
  return out;
}

export const costOf = (m: Record<string, number>, region?: string | null, design?: string | null) => Object.entries(m).reduce((a, [id, n]) => a + materialPrice(id, region, design) * n, 0);

export const isComplete = (p: Property) => p.stage >= STAGES.length;
/** The day a house was completed, as 12/23/26; null if it isn't known. */
export const builtOn = (p: { builtAt?: number } | undefined) =>
  p?.builtAt ? new Date(p.builtAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : null;

export const rentPerDay = (p: Property) => {
  const design = p.design ? DESIGN_BY_ID[p.design] : null;
  const region = REGION_BY_ID[p.region];
  return design && region ? Math.round((design.rentPerDay * region.rent) / 100) * 100 : 0;
};

/** Rent owed right now, and the whole days it covers. */
export function rentDue(p: Property, minutes: number): { days: number; amount: number } {
  if (!p.rented || !isComplete(p)) return { days: 0, amount: 0 };
  const days = Math.floor((minutes - p.rentFrom) / DAY_MINUTES);
  return days > 0 ? { days, amount: days * rentPerDay(p) } : { days: 0, amount: 0 };
}

/** Selling gets back most of what you put in. Finished houses keep more of their value than a half-built site. */
export const SALE_FACTOR = { complete: 0.95, unfinished: 0.75 };
export const saleValue = (p: Property) => Math.round(p.spent * (isComplete(p) ? SALE_FACTOR.complete : SALE_FACTOR.unfinished));

/** Ledger ref for money tied to a property: `p:<id>:<what>`. The server groups by the id. */
export const propRef = (id: string, what: string) => `p:${id}:${what}`;

/**
 * Server caps (worker/wallet.ts). Rent for one game day never tops this share of what was spent,
 * and game days are counted generously from real time (time skips run up to 10× faster).
 */
export const RENT_CAP_PER_DAY = 0.03;
export const GAME_MINUTES_PER_REAL_MS_MAX = 10 / 1000;
/**
 * The most one property can cost in all: two plots, every bag of materials and every stage of labour at the
 * dearest contractor. No single payment on a property (land, materials, labour, or selling it) is bigger, so the
 * server allows `p:` events up to this. Worked out from the tables above, so a new estate can't outgrow it.
 */
export const MAX_PROPERTY_COST = Math.max(
  ...REGIONS.flatMap((r) =>
    DESIGNS.map(
      (d) =>
        landPrice(r, 'double') + costOf(remainingStageMaterials(d), r.id, d.id) +
        Math.max(...CONTRACTORS.map((c) => STAGES.reduce((a, stage) => a + stageLabour(d, stage, c, r.id), 0))),
    ),
  ),
);

/** Renting your finished house to another player (House app → For rent, worker/rentals.ts). */
export const PLAYER_RENT = {
  /** A game week in real time: one game minute passes per real second. */
  weekMs: 7 * DAY_MINUTES * 1000,
  /** Owners set the weekly price within this range of the NPC rent for the same house. */
  minFactor: 0.25,
  maxFactor: 2,
};

/** What NPC tenants would pay for a week: the suggested price when listing for players. */
export const weeklyRentOf = (design: string, region: string) => {
  const d = DESIGN_BY_ID[design];
  const r = REGION_BY_ID[region];
  return d && r ? Math.round((d.rentPerDay * r.rent * 7) / 100) * 100 : 0;
};

/** One house on the player rental market. */
export interface RentalListing {
  propertyId: string;
  owner: string;
  ownerUid: string;
  design: string;
  region: string;
  weekly: number;
  tenant: string | null;
  paidThrough: number | null;
}
