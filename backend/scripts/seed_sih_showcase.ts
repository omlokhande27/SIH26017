import * as dotenv from 'dotenv';
dotenv.config();
import { supabaseAdmin } from '../src/config/supabase';
import { createSnapshot } from '../src/services/snapshot.service';

const SHOWCASE_PROJECTS = [
  {
    name: 'Mumbai-Ahmedabad High-Speed Rail Corridor',
    code: 'MAHSR-001',
    state: 'Maharashtra',
    district: 'Palghar',
    sector: 'RAILWAY',
    agency: 'National High Speed Rail Corporation Ltd (NHSRCL)',
    start_date: '2021-03-15',
    completion_date: '2026-12-31',
    status: 'ACTIVE',
    lat: 19.6967,
    lng: 72.7699,
    land_req: 1396.0,
    land_acq: 980.5,
    landowners: 4200,
    families: 3800,
    comp_req: 8500000000,
    comp_paid: 6200000000,
    issues: [
      { type: 'LEGAL', category: 'Litigation', title: 'High Court Writ Petition on Valuation', desc: 'Landowners in Palghar district challenged compensation award rate.', severity: 'HIGH' },
      { type: 'OPERATIONAL', category: 'Forest Clearance', title: 'Mangrove & Forest Diversion Pending', desc: 'Stage-II forest clearance for 12.5 Ha stretch pending ministry approval.', severity: 'MEDIUM' }
    ]
  },
  {
    name: 'Western Dedicated Freight Corridor (Phase II)',
    code: 'WDFC-002',
    state: 'Gujarat',
    district: 'Vadodara',
    sector: 'RAILWAY',
    agency: 'Dedicated Freight Corridor Corporation of India (DFCCIL)',
    start_date: '2020-08-01',
    completion_date: '2025-06-30',
    status: 'ACTIVE',
    lat: 22.3072,
    lng: 73.1812,
    land_req: 820.0,
    land_acq: 790.0,
    landowners: 2100,
    families: 1850,
    comp_req: 4200000000,
    comp_paid: 4100000000,
    issues: []
  },
  {
    name: 'Samruddhi Mahamarg Expressway (Package 4)',
    code: 'SME-003',
    state: 'Maharashtra',
    district: 'Nashik',
    sector: 'ROAD',
    agency: 'Maharashtra State Road Development Corp (MSRDC)',
    start_date: '2019-11-01',
    completion_date: '2024-12-31',
    status: 'ACTIVE',
    lat: 19.9975,
    lng: 73.7898,
    land_req: 1250.0,
    land_acq: 1120.0,
    landowners: 3400,
    families: 3100,
    comp_req: 6800000000,
    comp_paid: 5900000000,
    issues: [
      { type: 'OPERATIONAL', category: 'Possession Pending', title: 'Row Alignment Encroachment', desc: 'Commercial structures near Igatpuri junction blocking possession handover.', severity: 'HIGH' }
    ]
  },
  {
    name: 'Delhi-Dehradun Economic Corridor (Package 2)',
    code: 'DDEC-004',
    state: 'Uttar Pradesh',
    district: 'Saharanpur',
    sector: 'ROAD',
    agency: 'National Highways Authority of India (NHAI)',
    start_date: '2022-02-15',
    completion_date: '2025-10-31',
    status: 'ACTIVE',
    lat: 29.9640,
    lng: 77.5460,
    land_req: 540.0,
    land_acq: 380.0,
    landowners: 1650,
    families: 1400,
    comp_req: 3100000000,
    comp_paid: 2100000000,
    issues: [
      { type: 'LEGAL', category: 'Title Issue', title: 'Gram Sabha Common Land Dispute', desc: 'Dispute regarding ownership rights of community pasture land in Saharanpur.', severity: 'CRITICAL' },
      { type: 'SOCIAL', category: 'R&R Pending', title: 'Rehabilitation Colony Construction Delay', desc: 'Displaced families awaiting allotment of housing units in resettlement zone.', severity: 'HIGH' }
    ]
  },
  {
    name: 'Polavaram National Irrigation Project',
    code: 'PIP-005',
    state: 'Andhra Pradesh',
    district: 'Eluru',
    sector: 'IRRIGATION',
    agency: 'Andhra Pradesh Water Resources Dept',
    start_date: '2018-06-01',
    completion_date: '2027-03-31',
    status: 'ON_HOLD',
    lat: 17.2543,
    lng: 81.6425,
    land_req: 4200.0,
    land_acq: 2950.0,
    landowners: 12500,
    families: 11200,
    comp_req: 28000000000,
    comp_paid: 18500000000,
    issues: [
      { type: 'LEGAL', category: 'Litigation', title: 'Inter-State Tribunal Resettlement Dispute', desc: 'Submergence compensation disputes raised by tribal habitations.', severity: 'CRITICAL' },
      { type: 'SOCIAL', category: 'R&R Pending', title: 'R&R Package Disbursement Backlog', desc: 'Over 4,500 tribal families awaiting direct bank transfer of R&R grant.', severity: 'CRITICAL' }
    ]
  },
  {
    name: 'Bengaluru-Chennai Expressway (Phase 1)',
    code: 'BCE-006',
    state: 'Karnataka',
    district: 'Kolar',
    sector: 'ROAD',
    agency: 'National Highways Authority of India (NHAI)',
    start_date: '2021-09-01',
    completion_date: '2025-08-31',
    status: 'ACTIVE',
    lat: 13.1367,
    lng: 78.1292,
    land_req: 710.0,
    land_acq: 660.0,
    landowners: 1900,
    families: 1700,
    comp_req: 3900000000,
    comp_paid: 3750000000,
    issues: []
  },
  {
    name: 'Kaleshwaram Lift Irrigation (Phase III)',
    code: 'KLIS-007',
    state: 'Telangana',
    district: 'Karimnagar',
    sector: 'IRRIGATION',
    agency: 'Telangana Irrigation & CAD Dept',
    start_date: '2019-01-15',
    completion_date: '2026-05-31',
    status: 'ACTIVE',
    lat: 18.4386,
    lng: 79.1288,
    land_req: 1850.0,
    land_acq: 1420.0,
    landowners: 4800,
    families: 4200,
    comp_req: 9200000000,
    comp_paid: 6800000000,
    issues: [
      { type: 'OPERATIONAL', category: 'Land Record Issue', title: 'Pattadar Passbook Verification Backlog', desc: 'Mismatch between Dharani revenue records and physical parcel boundary surveys.', severity: 'HIGH' }
    ]
  },
  {
    name: 'Biju Expressway Corridor Expansion',
    code: 'BJE-008',
    state: 'Odisha',
    district: 'Sundargarh',
    sector: 'ROAD',
    agency: 'Odisha Works Department',
    start_date: '2022-05-10',
    completion_date: '2025-12-31',
    status: 'ACTIVE',
    lat: 22.1200,
    lng: 84.0300,
    land_req: 490.0,
    land_acq: 410.0,
    landowners: 1450,
    families: 1200,
    comp_req: 2400000000,
    comp_paid: 1950000000,
    issues: [
      { type: 'OPERATIONAL', category: 'Forest Clearance', title: 'Stage-I Forest Clearance Hold', desc: 'Compensatory afforestation land identification in Sundargarh pending approval.', severity: 'MEDIUM' }
    ]
  },
  {
    name: 'Rewa Ultra Mega Solar Park Grid Link',
    code: 'RSP-009',
    state: 'Madhya Pradesh',
    district: 'Rewa',
    sector: 'POWER',
    agency: 'MP Power Transmission Company Ltd (MPPTCL)',
    start_date: '2023-01-10',
    completion_date: '2025-04-30',
    status: 'ACTIVE',
    lat: 24.5362,
    lng: 81.3037,
    land_req: 320.0,
    land_acq: 315.0,
    landowners: 820,
    families: 750,
    comp_req: 1500000000,
    comp_paid: 1480000000,
    issues: []
  },
  {
    name: 'Kochi Metro Rail Phase II (JNH to Kakkanad)',
    code: 'KMR-010',
    state: 'Kerala',
    district: 'Ernakulam',
    sector: 'RAILWAY',
    agency: 'Kochi Metro Rail Ltd (KMRL)',
    start_date: '2022-10-01',
    completion_date: '2026-03-31',
    status: 'ACTIVE',
    lat: 9.9816,
    lng: 76.2999,
    land_req: 45.0,
    land_acq: 31.5,
    landowners: 410,
    families: 380,
    comp_req: 2200000000,
    comp_paid: 1450000000,
    issues: [
      { type: 'LEGAL', category: 'Litigation', title: 'Commercial Property Valuation Arbitration', desc: 'Shop owners along Seaport-Airport Road demanding higher commercial rate.', severity: 'HIGH' }
    ]
  }
];

async function seedSIHShowcase() {
  console.log('=== SEEDING SIH SHOWCASE INFRASTRUCTURE PROJECTS ===\n');

  for (const proj of SHOWCASE_PROJECTS) {
    console.log(`Processing: ${proj.name} (${proj.state})`);

    const { data: existing } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('project_code', proj.code)
      .maybeSingle();

    let projectId: string;

    if (existing) {
      projectId = existing.id;
      console.log(`  -> Project exists (${projectId})`);
    } else {
      const { data: newProj, error: err } = await supabaseAdmin
        .from('projects')
        .insert({
          project_name: proj.name,
          project_code: proj.code,
          state: proj.state,
          district: proj.district,
          sector: proj.sector,
          implementing_agency: proj.agency,
          planned_start_date: proj.start_date,
          planned_completion_date: proj.completion_date,
          project_status: proj.status,
          latitude: proj.lat,
          longitude: proj.lng,
        })
        .select('id')
        .single();

      if (err || !newProj) {
        console.error(`  -> ERROR creating project:`, err?.message);
        continue;
      }
      projectId = newProj.id;
      console.log(`  -> Created project (${projectId})`);
    }

    const acqPct = Number(((proj.land_acq / proj.land_req) * 100).toFixed(1));
    await supabaseAdmin.from('land_acquisition').upsert({
      project_id: projectId,
      land_required_ha: proj.land_req,
      land_acquired_ha: proj.land_acq,
      land_parcels_total: Math.floor(proj.landowners * 1.2),
      land_parcels_acquired: Math.floor((proj.land_acq / proj.land_req) * proj.landowners * 1.2),
      affected_landowners: proj.landowners,
      affected_families: proj.families,
      possession_obtained: acqPct > 90,
      notification_date: proj.start_date,
      award_date: acqPct > 50 ? '2023-06-15' : null,
    }, { onConflict: 'project_id' });

    await supabaseAdmin.from('compensation').upsert({
      project_id: projectId,
      total_compensation_required: proj.comp_req,
      total_compensation_paid: proj.comp_paid,
      affected_families_total: proj.families,
      affected_families_compensated: Math.floor((proj.comp_paid / proj.comp_req) * proj.families),
      rr_packages_required: proj.issues.some(i => i.category === 'R&R Pending') ? 500 : 0,
      rr_packages_provided: proj.issues.some(i => i.category === 'R&R Pending') ? 120 : 0,
      rr_budget: proj.comp_req * 0.08,
      rr_expenditure: proj.comp_paid * 0.05,
    }, { onConflict: 'project_id' });

    if (proj.issues.length > 0) {
      await supabaseAdmin.from('issues').delete().eq('project_id', projectId);
      for (const issue of proj.issues) {
        await supabaseAdmin.from('issues').insert({
          project_id: projectId,
          issue_type: issue.type,
          category: issue.category,
          title: issue.title,
          description: issue.desc,
          severity: issue.severity,
          status: 'OPEN',
          date_reported: '2023-01-15',
        });
      }
    }

    try {
      console.log(`  -> Generating snapshot...`);
      await createSnapshot(projectId, new Date());
    } catch (e: any) {
      console.log(`  -> Snapshot note: ${e.message}`);
    }
  }

  console.log('\n=== SIH SHOWCASE SEEDING COMPLETE ===');
}

seedSIHShowcase().catch(console.error);
