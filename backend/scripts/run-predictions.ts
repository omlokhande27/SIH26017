import * as dotenv from 'dotenv';
dotenv.config();
import { supabaseAdmin } from '../src/config/supabase';
import { runPrediction } from '../src/services/prediction.service';

async function updateAllPredictions() {
    console.log("Fetching all projects to run predictions...");
    const { data: projects } = await supabaseAdmin.from('projects').select('id, project_name');
    
    if (projects) {
        for (const project of projects) {
            console.log(`Running new AI prediction for ${project.project_name} (${project.id})...`);
            try {
                await runPrediction(project.id);
                console.log("Prediction success!");
            } catch (e) {
                console.error("Prediction failed for", project.id, e);
            }
        }
    }
    console.log("All predictions updated using the newly trained 1200-row AI model!");
    process.exit(0);
}

updateAllPredictions();
