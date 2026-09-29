import * as dotenv from 'dotenv';
dotenv.config();
import { supabaseAdmin } from '../src/config/supabase';

async function investigate() {
  try {
    // 1. Check roles
    const { data: users } = await supabaseAdmin.from('profiles').select('id, role, full_name, email');
    console.log("Current Profiles:", users);
    
    // Elevate everyone to GOVERNMENT_OFFICER
    await supabaseAdmin.from('profiles').update({ role: 'GOVERNMENT_OFFICER' }).eq('role', 'VIEWER');
    console.log("Elevated all VIEWER profiles to GOVERNMENT_OFFICER.");

    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    if (authUsers && authUsers.users) {
      for (const u of authUsers.users) {
        await supabaseAdmin.auth.admin.updateUserById(u.id, {
          user_metadata: { ...u.user_metadata, role: 'GOVERNMENT_OFFICER' }
        });
        console.log(`Updated auth metadata for ${u.email} to GOVERNMENT_OFFICER`);
      }
    }

    // 2. Check predictions
    const { data: preds } = await supabaseAdmin.from('predictions').select('project_id, predicted_delay_days, confidence').order('created_at', { ascending: false }).limit(5);
    console.log("Recent Predictions:", preds);

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
investigate();
