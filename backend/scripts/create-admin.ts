import * as dotenv from 'dotenv';
dotenv.config();
import { supabaseAdmin } from '../src/config/supabase';

async function fixRoles() {
  // Fix the specific admin account I just made
  const email = 'admin@landguard.gov.in';
  
  const { data } = await supabaseAdmin.auth.admin.listUsers();
  const existing = data.users.find(u => u.email === email);
  if (existing) {
    await supabaseAdmin.auth.admin.updateUserById(existing.id, { 
      user_metadata: { role: 'GOVERNMENT_OFFICER', full_name: 'Chief Government Officer', department: 'Central Administration' }
    });
    console.log('Fixed auth metadata to GOVERNMENT_OFFICER for admin.');
  }
}

fixRoles().then(() => process.exit(0));
