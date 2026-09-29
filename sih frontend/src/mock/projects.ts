import { RiskLevel, ProjectStatus, ProjectSector } from '../types';
import type { Project, ProjectIssue, PredictionHistoryEntry } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic helpers
// ─────────────────────────────────────────────────────────────────────────────

const addDays = (iso: string, days: number): string => {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

function hashCode(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length];
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

// Approximate state centroids (deg). Coordinates are illustrative mock values —
// not meant to reflect precise survey geography.
const STATE_COORDS: Record<string, [number, number]> = {
  'Uttar Pradesh': [26.85, 80.95],
  Maharashtra: [19.75, 75.71],
  'Tamil Nadu': [10.79, 78.7],
  Karnataka: [15.32, 75.71],
  Telangana: [17.97, 79.59],
  Gujarat: [22.26, 71.19],
  Rajasthan: [27.02, 74.22],
  'Madhya Pradesh': [22.97, 78.66],
  'West Bengal': [23.68, 87.28],
  Bihar: [25.2, 85.51],
  Odisha: [20.95, 85.1],
  Kerala: [10.85, 76.27],
  Punjab: [30.9, 75.86],
  Haryana: [29.06, 76.09],
  Delhi: [28.7, 77.1],
  'Andhra Pradesh': [15.91, 79.74],
  Jharkhand: [23.61, 85.28],
  Assam: [26.2, 92.94],
  Chhattisgarh: [21.28, 81.63],
};

const INDIA_CENTER: [number, number] = [21.15, 78.96];

function coordsFor(state: string, district: string, seed: number): { latitude: number; longitude: number } {
  const [lat, lng] = STATE_COORDS[state] ?? INDIA_CENTER;
  const combined =
    seed +
    district.length +
    state.length +
    district.charCodeAt(0) +
    district.charCodeAt(district.length - 1);
  const dLat = ((combined % 100) / 100 - 0.5) * 0.9;
  const dLng = ((combined % 97) / 100 - 0.5) * 1.4;
  return { latitude: round3(lat + dLat), longitude: round3(lng + dLng) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Data pools
// ─────────────────────────────────────────────────────────────────────────────

const LOCATIONS: Array<[string, string[]]> = [
  ['Uttar Pradesh', ['Lucknow', 'Kanpur', 'Varanasi', 'Agra', 'Prayagraj', 'Gorakhpur']],
  ['Maharashtra', ['Pune', 'Nagpur', 'Nashik', 'Aurangabad', 'Thane', 'Kolhapur']],
  ['Tamil Nadu', ['Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Tiruchirappalli']],
  ['Karnataka', ['Bengaluru', 'Mysuru', 'Hubballi', 'Belagavi', 'Mangaluru']],
  ['Telangana', ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar']],
  ['Gujarat', ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar']],
  ['Rajasthan', ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer']],
  ['Madhya Pradesh', ['Bhopal', 'Indore', 'Gwalior', 'Jabalpur', 'Ujjain']],
  ['West Bengal', ['Kolkata', 'Howrah', 'Siliguri', 'Asansol']],
  ['Bihar', ['Patna', 'Gaya', 'Muzaffarpur', 'Bhagalpur']],
  ['Odisha', ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Sambalpur']],
  ['Kerala', ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur']],
  ['Punjab', ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala']],
  ['Haryana', ['Gurugram', 'Faridabad', 'Panipat', 'Hisar']],
  ['Delhi', ['New Delhi', 'South Delhi', 'North Delhi']],
  ['Andhra Pradesh', ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati']],
  ['Jharkhand', ['Ranchi', 'Jamshedpur', 'Dhanbad']],
  ['Assam', ['Guwahati', 'Dibrugarh', 'Silchar']],
  ['Chhattisgarh', ['Raipur', 'Bilaspur', 'Durg']],
];

const STATE_ABBR: Record<string, string> = {
  'Uttar Pradesh': 'UP',
  Maharashtra: 'MH',
  'Tamil Nadu': 'TN',
  Karnataka: 'KA',
  Telangana: 'TS',
  Gujarat: 'GJ',
  Rajasthan: 'RJ',
  'Madhya Pradesh': 'MP',
  'West Bengal': 'WB',
  Bihar: 'BR',
  Odisha: 'OD',
  Kerala: 'KL',
  Punjab: 'PB',
  Haryana: 'HR',
  Delhi: 'DL',
  'Andhra Pradesh': 'AP',
  Jharkhand: 'JH',
  Assam: 'AS',
  Chhattisgarh: 'CG',
};

const SECTOR_ABBR: Record<ProjectSector, string> = {
  [ProjectSector.ROAD]: 'ROD',
  [ProjectSector.HIGHWAY]: 'HWY',
  [ProjectSector.METRO]: 'MTR',
  [ProjectSector.RAIL]: 'RLW',
  [ProjectSector.IRRIGATION]: 'IRR',
  [ProjectSector.BRIDGE]: 'BRG',
};

const SECTORS: ProjectSector[] = [
  ProjectSector.ROAD,
  ProjectSector.HIGHWAY,
  ProjectSector.METRO,
  ProjectSector.RAIL,
  ProjectSector.IRRIGATION,
  ProjectSector.BRIDGE,
];

const RIVERS = ['Ganga', 'Yamuna', 'Godavari', 'Krishna', 'Narmada', 'Kaveri', 'Mahanadi', 'Tapi', 'Brahmaputra', 'Sutlej'];

const MANAGERS = [
  'Priya Sharma', 'Ravi Desai', 'Amit Verma', 'Vikram Singh', 'Deepak Reddy', 'Sanjay Kumar',
  'Meera Joshi', 'Karan Sharma', 'Nikhil Rao', 'Shalini Menon', 'Aditya Kulkarni', 'Kavitha Rao',
  'Rohan Gupta', 'Arjun Nair', 'Sneha Iyer', 'Prakash Patil', 'Divya Menon', 'Manoj Tiwari',
];

const AGENCY_BY_SECTOR: Record<ProjectSector, string[]> = {
  [ProjectSector.ROAD]: ['State Public Works Department', 'District Rural Development Agency', 'State Highways Authority'],
  [ProjectSector.HIGHWAY]: ['NHAI', 'State Highways Authority', 'National Highways Authority of India'],
  [ProjectSector.METRO]: ['Metro Rail Corporation', 'City Metro Rail Authority'],
  [ProjectSector.RAIL]: ['Railway Land Development Authority', 'National High Speed Rail Corporation', 'Ministry of Railways'],
  [ProjectSector.IRRIGATION]: ['State Irrigation Department', 'Water Resources Department'],
  [ProjectSector.BRIDGE]: ['State PWD Bridges Division', 'Central Public Works Department'],
};

const ISSUE_DEFS: Array<{ title: string; category: string; description: string }> = [
  { title: 'Litigation', category: 'Legal', description: 'Court cases on land valuation pending in the district court.' },
  { title: 'Compensation Pending', category: 'Financial', description: 'Approved compensation not yet disbursed to landowners.' },
  { title: 'R&R Pending', category: 'Social', description: 'Rehabilitation and resettlement packages awaiting coordination.' },
  { title: 'Possession Pending', category: 'Operational', description: 'Awarded land not yet handed over to the implementing agency.' },
  { title: 'Land Dispute', category: 'Legal', description: 'Boundary and ownership disputes on a section of parcels.' },
  { title: 'Title Issue', category: 'Legal', description: 'Title documents incomplete for a cluster of affected parcels.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Base projects (hand-crafted, referenced elsewhere such as the dashboard)
// ─────────────────────────────────────────────────────────────────────────────

const baseProjects: Project[] = [
  {
    id: 'proj_1', code: 'LAEE-01', name: 'Lucknow-Agra Expressway Extension',
    state: 'Uttar Pradesh', district: 'Lucknow', sector: ProjectSector.HIGHWAY,
    status: ProjectStatus.DELAYED, riskLevel: RiskLevel.HIGH,
    landRequired: 450, landAcquired: 250, acquisitionPercentage: (250 / 450) * 100,
    compensationRequired: 180, compensationPaid: 100, compensationPending: 80,
    predictedDelay: 287, lastPredictionDate: '2026-09-01T10:00:00Z',
    projectManager: 'Priya Sharma', startDate: '2023-01-15T00:00:00Z', expectedEndDate: '2026-12-31T00:00:00Z',
    description: 'Extension of the existing expressway to improve connectivity.',
    createdAt: '2023-01-01T00:00:00Z', updatedAt: '2026-09-08T12:00:00Z'
  },
  {
    id: 'proj_2', code: 'MML7-02', name: 'Mumbai Metro Line 7 Extension',
    state: 'Maharashtra', district: 'Mumbai', sector: ProjectSector.METRO,
    status: ProjectStatus.ON_HOLD, riskLevel: RiskLevel.CRITICAL,
    landRequired: 80, landAcquired: 30, acquisitionPercentage: (30 / 80) * 100,
    compensationRequired: 150, compensationPaid: 50, compensationPending: 100,
    predictedDelay: 412, lastPredictionDate: '2026-09-02T10:00:00Z',
    projectManager: 'Ravi Desai', startDate: '2024-03-01T00:00:00Z', expectedEndDate: '2027-06-30T00:00:00Z',
    description: 'Vital metro line extension in densely populated urban areas.',
    createdAt: '2024-01-15T00:00:00Z', updatedAt: '2026-09-07T09:30:00Z'
  },
  {
    id: 'proj_3', code: 'DJHU-03', name: 'Delhi-Jaipur Highway Upgrade',
    state: 'Rajasthan', district: 'Jaipur', sector: ProjectSector.HIGHWAY,
    status: ProjectStatus.IN_PROGRESS, riskLevel: RiskLevel.MEDIUM,
    landRequired: 300, landAcquired: 210, acquisitionPercentage: (210 / 300) * 100,
    compensationRequired: 120, compensationPaid: 84, compensationPending: 36,
    predictedDelay: 95, lastPredictionDate: '2026-09-05T10:00:00Z',
    projectManager: 'Amit Verma', startDate: '2023-06-01T00:00:00Z', expectedEndDate: '2026-06-01T00:00:00Z',
    description: 'Upgrading to 8 lanes with service roads.',
    createdAt: '2023-05-10T00:00:00Z', updatedAt: '2026-09-09T08:15:00Z'
  },
  {
    id: 'proj_4', code: 'KRR-04', name: 'Kanpur Ring Road Project',
    state: 'Uttar Pradesh', district: 'Kanpur', sector: ProjectSector.ROAD,
    status: ProjectStatus.DELAYED, riskLevel: RiskLevel.HIGH,
    landRequired: 220, landAcquired: 110, acquisitionPercentage: (110 / 220) * 100,
    compensationRequired: 88, compensationPaid: 44, compensationPending: 44,
    predictedDelay: 203, lastPredictionDate: '2026-09-06T10:00:00Z',
    projectManager: 'Vikram Singh', startDate: '2024-01-10T00:00:00Z', expectedEndDate: '2026-10-31T00:00:00Z',
    description: 'Outer ring road to decongest city traffic.',
    createdAt: '2023-11-20T00:00:00Z', updatedAt: '2026-09-08T16:45:00Z'
  },
  {
    id: 'proj_5', code: 'BSR-05', name: 'Bengaluru Suburban Rail Phase 2',
    state: 'Karnataka', district: 'Bengaluru', sector: ProjectSector.RAIL,
    status: ProjectStatus.IN_PROGRESS, riskLevel: RiskLevel.LOW,
    landRequired: 150, landAcquired: 135, acquisitionPercentage: (135 / 150) * 100,
    compensationRequired: 200, compensationPaid: 180, compensationPending: 20,
    predictedDelay: 28, lastPredictionDate: '2026-09-08T10:00:00Z',
    projectManager: 'Deepak Reddy', startDate: '2023-09-01T00:00:00Z', expectedEndDate: '2026-11-30T00:00:00Z',
    description: 'Enhancing the suburban rail network.',
    createdAt: '2023-07-15T00:00:00Z', updatedAt: '2026-09-09T10:20:00Z'
  },
  {
    id: 'proj_6', code: 'PRB-06', name: 'Patna River Bridge Construction',
    state: 'Bihar', district: 'Patna', sector: ProjectSector.BRIDGE,
    status: ProjectStatus.ON_HOLD, riskLevel: RiskLevel.CRITICAL,
    landRequired: 90, landAcquired: 20, acquisitionPercentage: (20 / 90) * 100,
    compensationRequired: 60, compensationPaid: 10, compensationPending: 50,
    predictedDelay: 356, lastPredictionDate: '2026-09-01T10:00:00Z',
    projectManager: 'Sanjay Kumar', startDate: '2024-05-15T00:00:00Z', expectedEndDate: '2027-05-15T00:00:00Z',
    description: 'New 6-lane bridge over the Ganges.',
    createdAt: '2024-02-10T00:00:00Z', updatedAt: '2026-09-05T14:10:00Z'
  },
  {
    id: 'proj_7', code: 'BMC-07', name: 'Bhopal Metro Corridor',
    state: 'Madhya Pradesh', district: 'Bhopal', sector: ProjectSector.METRO,
    status: ProjectStatus.IN_PROGRESS, riskLevel: RiskLevel.MEDIUM,
    landRequired: 65, landAcquired: 45, acquisitionPercentage: (45 / 65) * 100,
    compensationRequired: 110, compensationPaid: 70, compensationPending: 40,
    predictedDelay: 78, lastPredictionDate: '2026-09-07T10:00:00Z',
    projectManager: 'Meera Joshi', startDate: '2024-02-01T00:00:00Z', expectedEndDate: '2027-02-01T00:00:00Z',
    description: 'Phase 1 of the Bhopal Metro network.',
    createdAt: '2023-12-05T00:00:00Z', updatedAt: '2026-09-09T11:00:00Z'
  },
  {
    id: 'proj_8', code: 'JERR-08', name: 'Jaipur Eastern Ring Road',
    state: 'Rajasthan', district: 'Jaipur', sector: ProjectSector.ROAD,
    status: ProjectStatus.IN_PROGRESS, riskLevel: RiskLevel.LOW,
    landRequired: 180, landAcquired: 170, acquisitionPercentage: (170 / 180) * 100,
    compensationRequired: 72, compensationPaid: 68, compensationPending: 4,
    predictedDelay: 15, lastPredictionDate: '2026-09-09T08:00:00Z',
    projectManager: 'Karan Sharma', startDate: '2023-11-01T00:00:00Z', expectedEndDate: '2026-08-31T00:00:00Z',
    description: 'Completing the eastern bypass for heavy vehicles.',
    createdAt: '2023-09-20T00:00:00Z', updatedAt: '2026-09-09T09:45:00Z'
  },
  {
    id: 'proj_9', code: 'UP-HWY-2026-014', name: 'Highway Expansion',
    state: 'Uttar Pradesh', district: 'Lucknow', sector: ProjectSector.ROAD,
    status: ProjectStatus.DELAYED, riskLevel: RiskLevel.HIGH,
    landRequired: 320, landAcquired: 150, acquisitionPercentage: (150 / 320) * 100,
    compensationRequired: 140, compensationPaid: 60, compensationPending: 80,
    predictedDelay: 287, lastPredictionDate: '2026-09-06T10:00:00Z',
    projectManager: 'Nikhil Rao', startDate: '2023-08-01T00:00:00Z', expectedEndDate: '2026-12-20T00:00:00Z',
    description: 'Highway widening with pending compensation approvals across 14 villages.',
    createdAt: '2023-07-01T00:00:00Z', updatedAt: '2026-09-10T09:00:00Z'
  },
  {
    id: 'proj_10', code: 'DL-MTR-2026-021', name: 'Metro Corridor',
    state: 'Delhi', district: 'New Delhi', sector: ProjectSector.METRO,
    status: ProjectStatus.IN_PROGRESS, riskLevel: RiskLevel.HIGH,
    landRequired: 95, landAcquired: 45, acquisitionPercentage: (45 / 95) * 100,
    compensationRequired: 220, compensationPaid: 110, compensationPending: 110,
    predictedDelay: 231, lastPredictionDate: '2026-09-07T10:00:00Z',
    projectManager: 'Shalini Menon', startDate: '2024-06-01T00:00:00Z', expectedEndDate: '2027-03-31T00:00:00Z',
    description: 'Second metro corridor facing active litigation over depot land.',
    createdAt: '2024-04-15T00:00:00Z', updatedAt: '2026-09-10T11:30:00Z'
  },
  {
    id: 'proj_11', code: 'MH-ROD-2026-009', name: 'Ring Road – Southern Arc',
    state: 'Maharashtra', district: 'Pune', sector: ProjectSector.ROAD,
    status: ProjectStatus.DELAYED, riskLevel: RiskLevel.HIGH,
    landRequired: 210, landAcquired: 100, acquisitionPercentage: (100 / 210) * 100,
    compensationRequired: 96, compensationPaid: 40, compensationPending: 56,
    predictedDelay: 197, lastPredictionDate: '2026-09-08T10:00:00Z',
    projectManager: 'Aditya Kulkarni', startDate: '2024-02-01T00:00:00Z', expectedEndDate: '2026-12-15T00:00:00Z',
    description: 'Southern arc with unresolved boundary demarcations in two villages.',
    createdAt: '2023-12-10T00:00:00Z', updatedAt: '2026-09-09T15:40:00Z'
  },
  {
    id: 'proj_12', code: 'TS-IRR-2026-017', name: 'Irrigation Canal Modernization',
    state: 'Telangana', district: 'Hyderabad', sector: ProjectSector.IRRIGATION,
    status: ProjectStatus.IN_PROGRESS, riskLevel: RiskLevel.HIGH,
    landRequired: 180, landAcquired: 90, acquisitionPercentage: (90 / 180) * 100,
    compensationRequired: 75, compensationPaid: 30, compensationPending: 45,
    predictedDelay: 165, lastPredictionDate: '2026-09-09T10:00:00Z',
    projectManager: 'Kavitha Rao', startDate: '2024-04-01T00:00:00Z', expectedEndDate: '2026-11-30T00:00:00Z',
    description: 'Canal modernization with seasonal acquisition and compensation claims pending.',
    createdAt: '2024-01-20T00:00:00Z', updatedAt: '2026-09-10T08:20:00Z'
  },
  {
    id: 'proj_13', code: 'HR-HWY-2026-011', name: 'Expressway Interchange Upgrade',
    state: 'Haryana', district: 'Gurugram', sector: ProjectSector.HIGHWAY,
    status: ProjectStatus.IN_PROGRESS, riskLevel: RiskLevel.HIGH,
    landRequired: 60, landAcquired: 38, acquisitionPercentage: (38 / 60) * 100,
    compensationRequired: 48, compensationPaid: 26, compensationPending: 22,
    predictedDelay: 142, lastPredictionDate: '2026-09-10T10:00:00Z',
    projectManager: 'Rohan Gupta', startDate: '2024-08-01T00:00:00Z', expectedEndDate: '2026-12-31T00:00:00Z',
    description: 'Interchange upgrade lagging on utility shifting approvals.',
    createdAt: '2024-06-10T00:00:00Z', updatedAt: '2026-09-10T14:00:00Z'
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// Generated projects (to reach 128 total, matching the portfolio narrative:
// 18 High Risk, 42 Medium, 68 Low)
// ─────────────────────────────────────────────────────────────────────────────

const GENERATED_COUNT = 115;

function makeName(sector: ProjectSector, state: string, district: string, seed: number): string {
  switch (sector) {
    case ProjectSector.ROAD:
      return `${district} ${pick(['Ring Road', 'Eastern Bypass', 'Arterial Corridor Widening', 'District Road Upgrade'], seed)}`;
    case ProjectSector.HIGHWAY:
      return pick([`NH-${22 + (seed % 79)} Corridor Upgrade`, `${district} Expressway Expansion`, `${district} Highway Improvement`], seed);
    case ProjectSector.METRO:
      return `${state} Metro Line ${1 + (seed % 5)}`;
    case ProjectSector.RAIL:
      return `${state} Rail Connectivity Project ${1 + (seed % 4)}`;
    case ProjectSector.IRRIGATION:
      return `${pick(RIVERS, seed)} Irrigation Project`;
    case ProjectSector.BRIDGE:
      return `${pick(RIVERS, seed)} Bridge Construction`;
    default:
      return `${district} Infrastructure Project`;
  }
}

function statusForRisk(risk: RiskLevel, seed: number): ProjectStatus {
  if (risk === RiskLevel.HIGH) return pick([ProjectStatus.DELAYED, ProjectStatus.IN_PROGRESS, ProjectStatus.ON_HOLD], seed);
  if (risk === RiskLevel.MEDIUM) return pick([ProjectStatus.IN_PROGRESS, ProjectStatus.DELAYED, ProjectStatus.PLANNING], seed);
  return pick([ProjectStatus.IN_PROGRESS, ProjectStatus.COMPLETED, ProjectStatus.PLANNING, ProjectStatus.IN_PROGRESS], seed);
}

function buildGeneratedProjects(): Project[] {
  const projects: Project[] = [];

  for (let i = 0; i < GENERATED_COUNT; i++) {
    const seed = i + 7;
    const risk: RiskLevel =
      i < 9 ? RiskLevel.HIGH : i < 49 ? RiskLevel.MEDIUM : RiskLevel.LOW;

    const [state, districts] = LOCATIONS[i % LOCATIONS.length];
    const district = districts[(i * 7 + Math.floor(i / LOCATIONS.length)) % districts.length];
    const sector = SECTORS[i % SECTORS.length];

    let predictedDelay: number;
    let landRequired: number;
    let acquisitionPct: number;

    if (risk === RiskLevel.HIGH) {
      predictedDelay = 150 + ((i * 13) % 140);
      landRequired = 180 + ((i * 17) % 320);
      acquisitionPct = 25 + ((i * 7) % 35);
    } else if (risk === RiskLevel.MEDIUM) {
      predictedDelay = 55 + ((i * 11) % 95);
      landRequired = 100 + ((i * 13) % 260);
      acquisitionPct = 40 + ((i * 5) % 40);
    } else {
      predictedDelay = (i * 7) % 46;
      landRequired = 60 + ((i * 11) % 220);
      acquisitionPct = Math.min(94, 65 + ((i * 3) % 30));
    }

    const landAcquired = round1((landRequired * acquisitionPct) / 100);
    const requiredHectares = landRequired;
    const compensationRequired = round1(requiredHectares * (0.38 + ((i * 7) % 20) / 100));
    const compensationPaid = round1(Math.min(compensationRequired, compensationRequired * ((acquisitionPct + ((i * 9) % 14)) / 100)));
    const compensationPending = round1(Math.max(0, compensationRequired - compensationPaid));

    const startDate = addDays('2023-01-01T00:00:00Z', (i * 29) % 980);
    const year = new Date(startDate).getUTCFullYear();
    const seq = String(400 + i).padStart(3, '0');

    const project: Project = {
      id: `proj_gen_${i + 1}`,
      code: `${STATE_ABBR[state]}-${SECTOR_ABBR[sector]}-${year}-${seq}`,
      name: makeName(sector, state, district, seed),
      state,
      district,
      sector,
      status: statusForRisk(risk, seed),
      riskLevel: risk,
      landRequired,
      landAcquired,
      acquisitionPercentage: round1((landAcquired / landRequired) * 100),
      compensationRequired,
      compensationPaid,
      compensationPending,
      predictedDelay,
      lastPredictionDate: addDays('2026-09-12T00:00:00Z', -((i * 3) % 10)),
      projectManager: pick(MANAGERS, seed),
      startDate,
      expectedEndDate: addDays(startDate, 900 + ((i * 7) % 400)),
      description: `${district}, ${state} — infrastructure development under land acquisition monitoring.`,
      createdAt: startDate,
      updatedAt: addDays('2026-09-12T00:00:00Z', -((i * 5) % 14)),
    };

    projects.push(project);
  }

  return projects;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail enrichment (agency, landowners, acquisition dates, issues, history)
// ─────────────────────────────────────────────────────────────────────────────

function buildIssues(project: Project, seed: number): ProjectIssue[] {
  const risk = project.riskLevel;
  const openCount = risk === RiskLevel.HIGH ? 4 : risk === RiskLevel.MEDIUM ? 3 : 2;
  const issueIndexes = [0, 1, 2, 3, 4, 5];

  return issueIndexes.slice(0, openCount).map((idx, order) => {
    const def = ISSUE_DEFS[(seed + idx) % ISSUE_DEFS.length];
    const severity: RiskLevel =
      risk === RiskLevel.HIGH
        ? order === 0 ? RiskLevel.CRITICAL : RiskLevel.HIGH
        : risk === RiskLevel.MEDIUM
          ? order === 0 ? RiskLevel.HIGH : RiskLevel.MEDIUM
          : order === 0 ? RiskLevel.MEDIUM : RiskLevel.LOW;
    const status =
      risk === RiskLevel.LOW && order > 0
        ? 'MONITORING'
        : risk === RiskLevel.MEDIUM && order > 1
          ? 'IN_PROGRESS'
          : 'OPEN';

    return {
      id: `iss_${project.id}_${idx}`,
      title: def.title,
      category: def.category,
      description: def.description,
      severity,
      status,
    };
  });
}

function buildHistory(project: Project, seed: number): PredictionHistoryEntry[] {
  const latestDate = project.lastPredictionDate ?? project.updatedAt;
  const latestDelay = project.predictedDelay ?? 0;
  const entries: PredictionHistoryEntry[] = [];

  // High-risk projects trend upward over time (older runs had lower delay);
  // low-risk projects trend downward (older runs had higher delay).
  const delta =
    project.riskLevel === RiskLevel.CRITICAL ? 16 :
    project.riskLevel === RiskLevel.HIGH ? 10 :
    project.riskLevel === RiskLevel.MEDIUM ? 3 : -10;

  for (let k = 0; k < 4; k++) {
    const delay = Math.max(0, latestDelay - delta * k + ((seed + k) % 5));
    const risk: RiskLevel = delay >= 150 ? RiskLevel.HIGH : delay >= 75 ? RiskLevel.MEDIUM : RiskLevel.LOW;
    if (delay === 0 && k > 0) continue;
    entries.push({
      id: `predhist_${project.id}_${k}`,
      date: addDays(latestDate, -(k * 7)),
      predictedDelay: delay,
      riskLevel: risk,
      modelVersion: `v${(1 - k * 0.1).toFixed(1)}`,
    });
  }

  return entries;
}

function enrichProject(project: Project): Project {
  const seed = hashCode(project.id + project.code);
  const seed2 = hashCode(project.id + '::detail');
  const agencyPool = AGENCY_BY_SECTOR[project.sector] ?? AGENCY_BY_SECTOR[ProjectSector.ROAD];

  const affectedLandowners = Math.round(project.landRequired * (2.1 + (seed % 10) / 10));
  const affectedFamilies = Math.round(affectedLandowners * 1.35);
  const notificationDate = addDays(project.startDate, -(20 + (seed % 60)));
  const awardDate = addDays(project.startDate, 90 + (seed % 150));
  const possessionDate = addDays(project.startDate, 220 + (seed % 220));

  return {
    ...project,
    implementingAgency: pick(agencyPool, seed),
    affectedLandowners,
    affectedFamilies,
    notificationDate,
    awardDate,
    possessionDate,
    issues: buildIssues(project, seed2),
    predictionHistory: buildHistory(project, seed2),
    ...coordsFor(project.state, project.district, seed),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export const mockProjects: Project[] = [...baseProjects, ...buildGeneratedProjects()].map(enrichProject);

export const projectSummary = {
  get total() {
    return mockProjects.length;
  },
  get highRisk() {
    return mockProjects.filter((p) => p.riskLevel === RiskLevel.HIGH || p.riskLevel === RiskLevel.CRITICAL).length;
  },
  get mediumRisk() {
    return mockProjects.filter((p) => p.riskLevel === RiskLevel.MEDIUM).length;
  },
  get lowRisk() {
    return mockProjects.filter((p) => p.riskLevel === RiskLevel.LOW).length;
  },
};

