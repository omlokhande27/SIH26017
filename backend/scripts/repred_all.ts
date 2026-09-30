import * as dotenv from 'dotenv';
dotenv.config();
import { supabaseAdmin } from '../src/config/supabase';
import { createSnapshot } from '../src/services/snapshot.service';
import { runPrediction } from '../src/services/prediction.service';

async function repredAll() {
  const { data: projects } = await supabaseAdmin
    .from('projects')
    .select('id, project_name, state');

  if (!projects?.length) { console.log('No projects found'); process.exit(1); }

  console.log(`Re-running predictions for ${projects.length} projects...`);

  for (const proj of projects) {
    try {
      const snapRes = await createSnapshot(proj.id, new Date());
      const predRes = await runPrediction(proj.id, { snapshotId: snapRes.snapshot.id });
      console.log(`[${proj.state}] ${proj.project_name}: ${predRes.prediction.predicted_delay_days?.toFixed(0)} days`);
    } catch (e: any) {
      console.warn(`  SKIP ${proj.project_name}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 150));
  }

  console.log('\n=== Done ===');
  process.exit(0);
}

repredAll();
