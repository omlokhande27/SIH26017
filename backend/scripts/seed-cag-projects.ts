import * as dotenv from 'dotenv';
dotenv.config();

import { supabaseAdmin } from '../src/config/supabase';
import { createProject } from '../src/services/project.service';
import { createLandAcquisition, createCompensation, createLegalIssue } from '../src/services/project-data.service';
import { runPrediction } from '../src/services/prediction.service';

async function seed() {
  console.log('Seeding CAG Audit projects...');
  
  const { data } = await supabaseAdmin.auth.admin.listUsers();
  if (!data || data.users.length === 0) {
      console.log('No users found in database to attribute projects to.');
      process.exit(1);
  }
  const creator = data.users[0].id;
  console.log('Using creator UUID:', creator);

  // Project 1
  console.log('Creating EDFC Project...');
  const edfc = await createProject({
    project_name: 'Eastern Dedicated Freight Corridor (Khurja to Kanpur)',
    project_code: 'EDFC-K2K-V2',
    state: 'Uttar Pradesh',
    district: 'Kanpur',
    sector: 'Railways',
    implementing_agency: 'DFCCIL',
    planned_start_date: '2018-01-01',
    planned_completion_date: '2022-12-31',
    project_status: 'ACTIVE',
  }, creator);
  console.log(`Created EDFC Project: ${edfc.id}`);

  await createLandAcquisition(edfc.id, {
    land_required_ha: '1200',
    land_acquired_ha: '950',
    land_parcels_total: 4500,
    land_parcels_acquired: 3800,
    affected_landowners: 4500,
    affected_families: 4500,
    possession_obtained: false,
    notification_date: '2018-05-10',
    award_date: '2019-02-15'
  });

  await createCompensation(edfc.id, {
    total_compensation_required: '3500000000',
    total_compensation_paid: '2800000000',
    payment_status: 'PARTIAL',
  });

  await createLegalIssue(edfc.id, {
    issue_type: 'COMPENSATION_DISPUTE',
    court_case: true,
    case_reference: 'WP/2019/4501',
    status: 'OPEN',
    severity: 'HIGH',
    description: 'Farmers challenging the compensation award under the new Land Acquisition Act.',
    reported_date: '2019-05-15'
  });
  
  await createLegalIssue(edfc.id, {
    issue_type: 'LITIGATION',
    court_case: true,
    case_reference: 'WP/2021/110',
    status: 'OPEN',
    severity: 'CRITICAL',
    description: 'Stay order on possession of land in 3 villages.',
    reported_date: '2021-02-10'
  });

  console.log('Running Prediction for EDFC...');
  await runPrediction(edfc.id);

  // Project 2
  console.log('Creating NH-66 Project...');
  const nh66 = await createProject({
    project_name: 'NH-66 Four-Laning (Panvel to Indapur)',
    project_code: 'NH66-PKG1-V2',
    state: 'Maharashtra',
    district: 'Raigad',
    sector: 'Highways',
    implementing_agency: 'NHAI',
    planned_start_date: '2016-04-01',
    planned_completion_date: '2020-03-31',
    project_status: 'ACTIVE',
  }, creator);
  console.log(`Created NH-66 Project: ${nh66.id}`);

  await createLandAcquisition(nh66.id, {
    land_required_ha: '450.5',
    land_acquired_ha: '410.2',
    land_parcels_total: 1200,
    land_parcels_acquired: 1100,
    affected_landowners: 1200,
    affected_families: 1200,
    possession_obtained: false,
    notification_date: '2016-06-15'
  });

  await createCompensation(nh66.id, {
    total_compensation_required: '1500000000',
    total_compensation_paid: '1350000000',
    payment_status: 'PARTIAL',
  });

  await createLegalIssue(nh66.id, {
    issue_type: 'LITIGATION',
    court_case: true,
    case_reference: 'NGT/2018/88',
    status: 'OPEN',
    severity: 'HIGH',
    description: 'Challenge against tree cutting and forest clearance.',
    reported_date: '2018-08-20'
  });

  console.log('Running Prediction for NH-66...');
  await runPrediction(nh66.id);
  
  // Project 3
  console.log('Creating UKP Project...');
  const ukp = await createProject({
    project_name: 'Upper Krishna Project Stage III',
    project_code: 'UKP-STG3-V2',
    state: 'Karnataka',
    district: 'Bagalkot',
    sector: 'Irrigation',
    implementing_agency: 'KBJNL',
    planned_start_date: '2015-01-01',
    planned_completion_date: '2025-12-31',
    project_status: 'ON_HOLD',
  }, creator);
  console.log(`Created UKP Project: ${ukp.id}`);

  await createLandAcquisition(ukp.id, {
    land_required_ha: '50000',
    land_acquired_ha: '32000',
    land_parcels_total: 45000,
    land_parcels_acquired: 30000,
    affected_landowners: 120000,
    affected_families: 120000,
    possession_obtained: false,
    notification_date: '2015-05-15'
  });

  await createCompensation(ukp.id, {
    total_compensation_required: '45000000000',
    total_compensation_paid: '21000000000',
    payment_status: 'PARTIAL',
  });

  await createLegalIssue(ukp.id, {
    issue_type: 'LITIGATION',
    court_case: true,
    case_reference: 'WP/2016/992',
    status: 'OPEN',
    severity: 'CRITICAL',
    description: 'Mass petition for proper rehabilitation and resettlement packages before submergence.',
    reported_date: '2016-11-05'
  });

  console.log('Running Prediction for UKP...');
  await runPrediction(ukp.id);

  console.log('Successfully seeded 3 CAG projects with full ML predictions!');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
