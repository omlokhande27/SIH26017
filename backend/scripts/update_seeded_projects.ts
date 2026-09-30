import * as dotenv from 'dotenv';
dotenv.config();
import { supabaseAdmin } from '../src/config/supabase';
import { createSnapshot } from '../src/services/snapshot.service';
import { runPrediction } from '../src/services/prediction.service';

// Real data from the CAG dataset
const realData: Record<string, {
  landReq: number; landAcq: number; compPaid: number; compReq: number;
  shortfallPct: number; hasCourt: boolean; hasEncroach: boolean;
}> = {
  'Polavaram Irrigation Project': { landReq: 35000, landAcq: 24000, compPaid: 180000000, compReq: 250000000, shortfallPct: 31, hasCourt: true, hasEncroach: false },
  'Odisha Scheduled Areas Land Management': { landReq: 120, landAcq: 95, compPaid: 5000000, compReq: 9000000, shortfallPct: 21, hasCourt: false, hasEncroach: false },
  'Dhansiri': { landReq: 1306, landAcq: 1259, compPaid: 150000000, compReq: 200000000, shortfallPct: 4, hasCourt: false, hasEncroach: false },
  'Borolia': { landReq: 397, landAcq: 172, compPaid: 50000000, compReq: 150000000, shortfallPct: 57, hasCourt: false, hasEncroach: true },
  'Sardar Sarovar': { landReq: 59122, landAcq: 57150, compPaid: 8500000000, compReq: 9000000000, shortfallPct: 3, hasCourt: true, hasEncroach: false },
  'Indiramma Flood Flow Canal of SRSP': { landReq: 13725, landAcq: 11990, compPaid: 2000000000, compReq: 3000000000, shortfallPct: 13, hasCourt: false, hasEncroach: false },
  'J. Chokka Rao LIS': { landReq: 14695, landAcq: 12212, compPaid: 1500000000, compReq: 2500000000, shortfallPct: 17, hasCourt: false, hasEncroach: false },
};

async function update() {
  const { data: projects } = await supabaseAdmin
    .from('projects')
    .select('id, project_name')
    .in('project_name', Object.keys(realData));

  if (!projects?.length) {
    console.log('No matching projects found. Run seed_user_projects.ts first.');
    process.exit(1);
  }

  for (const proj of projects) {
    const real = realData[proj.project_name];
    if (!real) continue;

    console.log(`\nUpdating: ${proj.project_name}`);

    // Update land acquisition
    const { error: landErr } = await supabaseAdmin
      .from('land_acquisition')
      .update({
        land_required_ha: real.landReq,
        land_acquired_ha: real.landAcq,
        land_parcels_total: Math.round(real.landReq * 0.5),
        land_parcels_acquired: Math.round(real.landAcq * 0.5),
        affected_landowners: Math.round(real.landReq * 2),
        affected_families: Math.round(real.landReq * 1.5),
      })
      .eq('project_id', proj.id);

    if (landErr) console.error('  land error:', landErr.message);

    // Update compensation
    const { error: compErr } = await supabaseAdmin
      .from('compensation')
      .update({
        total_compensation_required: real.compReq,
        total_compensation_paid: real.compPaid,
        affected_families_total: Math.round(real.landReq * 1.5),
        affected_families_compensated: Math.round(real.landAcq * 1.5),
      })
      .eq('project_id', proj.id);

    if (compErr) console.error('  comp error:', compErr.message);

    // Run a fresh prediction with updated data
    try {
      const snapRes = await createSnapshot(proj.id, new Date());
      const predRes = await runPrediction(proj.id, { snapshotId: snapRes.snapshot.id });
      const delay = predRes.prediction.predicted_delay_days;
      console.log(`  -> New predicted delay: ${delay?.toFixed(0)} days (~${((delay ?? 0)/30).toFixed(1)} months)`);
    } catch (e: any) {
      console.error('  prediction error:', e.message);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n=== Update complete ===');
  process.exit(0);
}

update();
