import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import { supabaseAdmin } from '../src/config/supabase';
import { createSnapshot } from '../src/services/snapshot.service';
import { runPrediction } from '../src/services/prediction.service';

async function seed() {
  const rawData = fs.readFileSync('../ml-service/data/mapped_user_data.json', 'utf-8');
  const records = JSON.parse(rawData);

  // Unique project names only
  const uniqueProjects = new Map<string, any>();
  for (const r of records) {
    if (!uniqueProjects.has(r.project_name)) uniqueProjects.set(r.project_name, r);
  }
  console.log(`Seeding ${uniqueProjects.size} real CAG projects...`);

  for (const [name, row] of uniqueProjects) {
    try {
      console.log(`\n=> ${name} (${row.state})`);

      // Map sector to allowed values
      const sectorMap: Record<string,string> = {
        'Irrigation': 'IRRIGATION',
        'Land Acquisition': 'LAND_ACQUISITION',
        'Infrastructure': 'ROAD',
        'Highway': 'ROAD',
      };
      const sector = sectorMap[row.sector] ?? 'ROAD';

      const { data: proj, error: projErr } = await supabaseAdmin
        .from('projects')
        .insert({
          project_name: name,
          project_code: `CAG-${Date.now().toString().slice(-6)}`,
          state: row.state || 'Unknown',
          district: 'Various',
          sector,
          implementing_agency: 'State Government',
          planned_start_date: '2010-01-01',
          planned_completion_date: '2020-01-01',
          project_status: 'ON_HOLD',
        })
        .select('id')
        .single();

      if (projErr || !proj) {
        console.error(`  FAILED insert:`, projErr?.message);
        continue;
      }
      const pid = proj.id;

      // Land acquisition
      const landReq = Number(row.land_required_ha) || 100;
      const landAcq = Number(row.land_acquired_ha) || landReq * 0.1;
      await supabaseAdmin.from('land_acquisition').insert({
        project_id: pid,
        land_required_ha: landReq,
        land_acquired_ha: landAcq,
        land_parcels_total: Number(row.affected_landowners) || 50,
        land_parcels_acquired: Math.floor((landAcq / landReq) * (Number(row.affected_landowners) || 50)),
        affected_landowners: Number(row.affected_landowners) || 50,
        affected_families: Number(row.affected_families) || 20,
        possession_obtained: row.possession_pending === 0 || row.possession_pending === '0',
      });

      // Compensation
      const compReq = landReq * 500000; // ~5 lakh per ha rough estimate
      await supabaseAdmin.from('compensation').insert({
        project_id: pid,
        total_compensation_required: compReq,
        total_compensation_paid: compReq * 0.2,
        affected_families_total: Number(row.affected_families) || 20,
        affected_families_compensated: Math.floor((Number(row.affected_families) || 20) * 0.2),
        rr_packages_required: row.r_and_r_required === 1 || row.r_and_r_required === '1' ? 10 : 0,
        rr_packages_provided: 0,
        rr_budget: compReq * 0.1,
        rr_expenditure: 0,
      });

      // Issues
      if (row.litigation_flag === 1 || row.litigation_flag === '1') {
        await supabaseAdmin.from('issues').insert({
          project_id: pid,
          issue_type: 'LEGAL',
          category: 'Litigation',
          title: 'Land Compensation Dispute',
          description: 'Court case filed by affected landowners against compensation award',
          severity: 'HIGH',
          status: 'OPEN',
          date_reported: '2018-01-01',
        });
      }
      if (row.encroachment === 1 || row.encroachment === '1') {
        await supabaseAdmin.from('issues').insert({
          project_id: pid,
          issue_type: 'OPERATIONAL',
          category: 'Encroachment',
          title: 'Encroachment on Project Site',
          description: 'Unauthorized structures on project alignment blocking construction',
          severity: 'HIGH',
          status: 'OPEN',
          date_reported: '2018-01-01',
        });
      }
      if (Number(row.land_shortfall_pct) > 10) {
        await supabaseAdmin.from('issues').insert({
          project_id: pid,
          issue_type: 'OPERATIONAL',
          category: 'Possession Pending',
          title: 'Possession Pending',
          description: `${Number(row.land_shortfall_pct).toFixed(1)}% of required land yet to be acquired`,
          severity: Number(row.land_shortfall_pct) > 30 ? 'HIGH' : 'MEDIUM',
          status: 'OPEN',
          date_reported: '2018-01-01',
        });
      }

      console.log(`  -> Records created. Snapshotting + predicting...`);
      const snapRes = await createSnapshot(pid, new Date());
      const predRes = await runPrediction(pid, { snapshotId: snapRes.snapshot.id });
      console.log(`  -> Predicted delay: ${predRes.prediction.predicted_delay_days} days | Confidence: ${predRes.prediction.confidence}`);

    } catch (e: any) {
      console.error(`  -> ERROR: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 200)); // rate-limit
  }

  console.log('\n=== Seeding complete ===');
  process.exit(0);
}

seed();
