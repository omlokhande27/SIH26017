import * as dotenv from 'dotenv';
dotenv.config();
import { supabaseAdmin } from '../src/config/supabase';
import { runPrediction } from '../src/services/prediction.service';

async function precalculate() {
  console.log('=== PRECALCULATING PREDICTIONS FOR ALL PROJECTS ===\n');

  const { data: projects } = await supabaseAdmin.from('projects').select('id, project_name');
  if (!projects || projects.length === 0) {
    console.log('No projects found.');
    return;
  }

  for (const p of projects) {
    try {
      console.log(`Predicting for: ${p.project_name}...`);
      const assessment = await runPrediction(p.id);
      console.log(`  -> Delay: ${assessment.prediction.predicted_delay_days} days | Risk Level: ${assessment.risk_assessment.risk_level}`);
    } catch (err: any) {
      console.error(`  -> ERROR for ${p.project_name}: ${err.message}`);
    }
  }

  console.log('\n=== PRECALCULATION COMPLETE ===');
}

precalculate().catch(console.error);
