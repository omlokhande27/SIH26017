import * as dotenv from 'dotenv';
dotenv.config();
import { supabaseAdmin } from '../src/config/supabase';
import { runPrediction } from '../src/services/prediction.service';
import { createSnapshot } from '../src/services/snapshot.service';

async function test() {
    const { data: projects } = await supabaseAdmin.from('projects').select('id, project_name');
    if (!projects) return console.log("No projects");
    
    for (const proj of projects) {
        console.log(`Testing project: ${proj.project_name} (${proj.id})`);
        try {
            const snapRes = await createSnapshot(proj.id, new Date());
            const predRes = await runPrediction(proj.id, { snapshotId: snapRes.snapshot.id });
            console.log("-> Prediction success! Delay:", predRes.prediction.predicted_delay_days);
        } catch (e: any) {
            console.error("-> FAILED:", e.message);
        }
    }
    process.exit(0);
}
test();
