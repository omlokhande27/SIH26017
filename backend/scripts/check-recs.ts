import * as dotenv from 'dotenv';
dotenv.config();
import { supabaseAdmin } from '../src/config/supabase';

async function check() {
    const { data: recs } = await supabaseAdmin.from('recommendations').select('*').limit(10);
    console.log(JSON.stringify(recs, null, 2));
    process.exit(0);
}
check();
