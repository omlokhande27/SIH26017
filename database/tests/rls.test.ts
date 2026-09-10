/**
 * rls.test.ts — the row level security policy matrix, exercised as each role.
 *
 * Every assertion here runs inside `SET ROLE authenticated` (or `anon`) via
 * the `actingAs` helpers. This matters more than it looks: PGlite connects as
 * a superuser, and PostgreSQL exempts superusers and table owners from RLS
 * entirely. A policy test that forgot to switch role would pass
 * unconditionally while proving nothing at all.
 *
 * The policy matrix under test (documented in schema.sql §19 and
 * docs/DATABASE.md §9):
 *
 *   ADMIN    full access to all projects and system management
 *   ANALYST  read all projects + analytics; no writes
 *   OFFICER  assigned projects only; may modify authorised project data
 *   VIEWER   read-only; nationally scoped FOR THIS PROTOTYPE
 *
 * The VIEWER/ANALYST national read scope is a documented prototype decision,
 * pending a defined state/department boundary. It is asserted here as the
 * current intended behaviour — if it is later narrowed, these tests are the
 * ones that must change, which is exactly the signal you want.
 *
 * RLS is a second line of defence, not the API's authorization layer: the Node
 * backend connects with the service role key and bypasses all of it. See
 * docs/DATABASE.md §9, "RLS is not sufficient on its own".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createSchemaDb, expectSqlError, one, rows, SQLSTATE, type Db } from './helpers/db';
import {
  USERS,
  createStandardUsers,
  assignToProject,
  actingAs,
  actingAsAnon,
  visibleCount,
} from './helpers/identity';
import { createProject, createSnapshot, createPrediction } from './helpers/fixtures';

let db: Db;

/** Three projects: the officer is assigned to the first two only. */
let assignedA: string;
let assignedB: string;
let unassigned: string;
let assignedPrediction: string;
let unassignedPrediction: string;

beforeAll(async () => {
  db = await createSchemaDb();
  await createStandardUsers(db);

  assignedA = await createProject(db, { project_code: 'RLS-A' });
  assignedB = await createProject(db, { project_code: 'RLS-B' });
  unassigned = await createProject(db, { project_code: 'RLS-C' });

  await assignToProject(db, USERS.officer, assignedA);
  await assignToProject(db, USERS.officer, assignedB);

  // Child rows on each project so read scoping can be checked below the
  // project table too.
  for (const projectId of [assignedA, assignedB, unassigned]) {
    await db.query(
      `INSERT INTO public.land_acquisition (project_id, land_required_ha, land_acquired_ha)
       VALUES ($1, 100, 40)`,
      [projectId],
    );
    await db.query(
      `INSERT INTO public.compensation (project_id, total_compensation_required, total_compensation_paid)
       VALUES ($1, 1000, 250)`,
      [projectId],
    );
    await db.query(
      `INSERT INTO public.legal_issues (project_id, issue_type, severity)
       VALUES ($1, 'LAND_DISPUTE', 'HIGH')`,
      [projectId],
    );
  }

  const snapA = await createSnapshot(db, assignedA);
  const snapC = await createSnapshot(db, unassigned);
  assignedPrediction = await createPrediction(db, assignedA, snapA);
  unassignedPrediction = await createPrediction(db, unassigned, snapC);

  // One ground-truth outcome per project, so outcome visibility is a real
  // assertion rather than "the table happens to be empty".
  for (const [projectId, snapshotId] of [
    [assignedA, snapA],
    [unassigned, snapC],
  ] as const) {
    await db.query(
      `INSERT INTO public.actual_outcomes
         (project_id, feature_snapshot_id, actual_delay_days, outcome_date)
       VALUES ($1, $2, 100, '2026-01-01')`,
      [projectId, snapshotId],
    );
  }

  for (const [predictionId, label] of [
    [assignedPrediction, 'assigned'],
    [unassignedPrediction, 'unassigned'],
  ] as const) {
    await db.query(
      `INSERT INTO public.prediction_explanations
         (prediction_id, feature_name, contribution_score, contribution_direction, rank)
       VALUES ($1, $2, 10, 'INCREASES_DELAY', 1)`,
      [predictionId, `feature_${label}`],
    );
    await db.query(
      `INSERT INTO public.recommendations
         (prediction_id, title, description, priority, recommended_action)
       VALUES ($1, $2, 'D', 'HIGH', 'A')`,
      [predictionId, `rec ${label}`],
    );
  }
});

afterAll(async () => {
  await db.close();
});

describe('unauthenticated access', () => {
  it('sees no projects', async () => {
    const n = await actingAsAnon(db, () => visibleCount(db, 'projects'));
    expect(n).toBe(0);
  });

  it('sees no predictions, explanations or recommendations', async () => {
    await actingAsAnon(db, async () => {
      expect(await visibleCount(db, 'predictions')).toBe(0);
      expect(await visibleCount(db, 'prediction_explanations')).toBe(0);
      expect(await visibleCount(db, 'recommendations')).toBe(0);
    });
  });

  it('sees no profiles or assignments', async () => {
    await actingAsAnon(db, async () => {
      expect(await visibleCount(db, 'profiles')).toBe(0);
      expect(await visibleCount(db, 'project_assignments')).toBe(0);
    });
  });

  it('cannot insert a project', async () => {
    await actingAsAnon(db, async () => {
      const err = await expectSqlError(
        db,
        `INSERT INTO public.projects
           (project_name, project_code, state, district, sector, implementing_agency)
         VALUES ('anon', 'ANON-1', 'S', 'D', 'ROAD', 'A')`,
      );
      expect(err.code).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
    });
  });
});

describe('ADMIN — full access', () => {
  it('reads every project', async () => {
    const n = await actingAs(db, USERS.admin, () => visibleCount(db, 'projects'));
    expect(n).toBe(3);
  });

  it('reads every child row', async () => {
    await actingAs(db, USERS.admin, async () => {
      expect(await visibleCount(db, 'land_acquisition')).toBe(3);
      expect(await visibleCount(db, 'compensation')).toBe(3);
      expect(await visibleCount(db, 'legal_issues')).toBe(3);
      expect(await visibleCount(db, 'predictions')).toBe(2);
      expect(await visibleCount(db, 'actual_outcomes')).toBe(2);
    });
  });

  it('can create and delete a project', async () => {
    await actingAs(db, USERS.admin, async () => {
      await db.query(
        `INSERT INTO public.projects
           (project_name, project_code, state, district, sector, implementing_agency)
         VALUES ('admin made', 'ADMIN-1', 'S', 'D', 'ROAD', 'A')`,
      );
      await db.query(`DELETE FROM public.projects WHERE project_code = 'ADMIN-1'`);
    });
    const remaining = await one<{ n: number }>(
      db,
      `SELECT COUNT(*)::int AS n FROM public.projects WHERE project_code = 'ADMIN-1'`,
    );
    expect(remaining.n).toBe(0);
  });

  it('can read and manage every profile', async () => {
    await actingAs(db, USERS.admin, async () => {
      expect(await visibleCount(db, 'profiles')).toBe(5);
      await db.query(`UPDATE public.profiles SET department = 'Set by admin' WHERE id = $1`, [
        USERS.viewer,
      ]);
    });
  });

  it('can change another user’s role', async () => {
    await actingAs(db, USERS.admin, async () => {
      await db.query(`UPDATE public.profiles SET role = 'ANALYST' WHERE id = $1`, [USERS.viewer]);
      await db.query(`UPDATE public.profiles SET role = 'VIEWER' WHERE id = $1`, [USERS.viewer]);
    });
    const row = await one<{ role: string }>(db, `SELECT role FROM public.profiles WHERE id = $1`, [
      USERS.viewer,
    ]);
    expect(row.role).toBe('VIEWER');
  });

  it('can extend the risk factor vocabulary', async () => {
    await actingAs(db, USERS.admin, async () => {
      await db.query(
        `INSERT INTO public.risk_factor_types (code, label) VALUES ('ADMIN_ADDED', 'Admin Added')`,
      );
      await db.query(`DELETE FROM public.risk_factor_types WHERE code = 'ADMIN_ADDED'`);
    });
  });

  it('can register a model version', async () => {
    await actingAs(db, USERS.admin, async () => {
      await db.query(
        `INSERT INTO public.model_versions (version, algorithm) VALUES ('admin-model', 'test')`,
      );
      await db.query(`DELETE FROM public.model_versions WHERE version = 'admin-model'`);
    });
  });
});

describe('ANALYST — reads everything, writes nothing', () => {
  it('reads all projects', async () => {
    const n = await actingAs(db, USERS.analyst, () => visibleCount(db, 'projects'));
    expect(n).toBe(3);
  });

  it('reads all analytics: predictions, explanations, recommendations', async () => {
    await actingAs(db, USERS.analyst, async () => {
      expect(await visibleCount(db, 'predictions')).toBe(2);
      expect(await visibleCount(db, 'prediction_explanations')).toBe(2);
      expect(await visibleCount(db, 'recommendations')).toBe(2);
    });
  });

  it('reads snapshots and ground-truth outcomes, for model evaluation', async () => {
    // ANALYST needs both halves of a training pair to evaluate a model.
    await actingAs(db, USERS.analyst, async () => {
      expect(await visibleCount(db, 'project_feature_snapshots')).toBe(2);
      expect(await visibleCount(db, 'actual_outcomes')).toBe(2);
    });
  });

  it('reads the model registry', async () => {
    await actingAs(db, USERS.analyst, async () => {
      const res = await rows(db, `SELECT id FROM public.model_versions`);
      expect(Array.isArray(res)).toBe(true);
    });
  });

  it('cannot create a project', async () => {
    await actingAs(db, USERS.analyst, async () => {
      const err = await expectSqlError(
        db,
        `INSERT INTO public.projects
           (project_name, project_code, state, district, sector, implementing_agency)
         VALUES ('analyst', 'ANALYST-1', 'S', 'D', 'ROAD', 'A')`,
      );
      expect(err.code).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
    });
  });

  it('cannot update project data', async () => {
    await actingAs(db, USERS.analyst, async () => {
      const res = await db.query(`UPDATE public.projects SET district = 'hacked' WHERE id = $1`, [
        assignedA,
      ]);
      // With no UPDATE policy, the rows are simply not visible to the update.
      expect(res.affectedRows).toBe(0);
    });
    const row = await one<{ district: string }>(
      db,
      `SELECT district FROM public.projects WHERE id = $1`,
      [assignedA],
    );
    expect(row.district).not.toBe('hacked');
  });

  it('cannot update compensation figures', async () => {
    await actingAs(db, USERS.analyst, async () => {
      const res = await db.query(
        `UPDATE public.compensation SET total_compensation_paid = 999 WHERE project_id = $1`,
        [assignedA],
      );
      expect(res.affectedRows).toBe(0);
    });
  });

  it('cannot write to the model registry', async () => {
    await actingAs(db, USERS.analyst, async () => {
      const err = await expectSqlError(
        db,
        `INSERT INTO public.model_versions (version, algorithm) VALUES ('analyst-model', 'test')`,
      );
      expect(err.code).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
    });
  });
});

describe('VIEWER — read-only, nationally scoped for this prototype', () => {
  it('reads all projects nationally (documented prototype scope)', async () => {
    // Deliberate interim position: "allowed project visibility" is undefined
    // in the brief, so no state/department boundary has been invented.
    // Narrowing this later is a change to SELECT policies only.
    const n = await actingAs(db, USERS.viewer, () => visibleCount(db, 'projects'));
    expect(n).toBe(3);
  });

  it('reads predictions and recommendations', async () => {
    await actingAs(db, USERS.viewer, async () => {
      expect(await visibleCount(db, 'predictions')).toBe(2);
      expect(await visibleCount(db, 'recommendations')).toBe(2);
    });
  });

  it('cannot create a project', async () => {
    await actingAs(db, USERS.viewer, async () => {
      const err = await expectSqlError(
        db,
        `INSERT INTO public.projects
           (project_name, project_code, state, district, sector, implementing_agency)
         VALUES ('viewer', 'VIEWER-1', 'S', 'D', 'ROAD', 'A')`,
      );
      expect(err.code).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
    });
  });

  it('cannot update anything, despite reading everything', async () => {
    // The national read scope must not leak into write access anywhere.
    await actingAs(db, USERS.viewer, async () => {
      for (const [table, sql] of [
        ['projects', `UPDATE public.projects SET district = 'x' WHERE id = '${assignedA}'`],
        [
          'land_acquisition',
          `UPDATE public.land_acquisition SET land_acquired_ha = 99 WHERE project_id = '${assignedA}'`,
        ],
        [
          'legal_issues',
          `UPDATE public.legal_issues SET severity = 'LOW' WHERE project_id = '${assignedA}'`,
        ],
        [
          'recommendations',
          `UPDATE public.recommendations SET status = 'COMPLETED' WHERE prediction_id = '${assignedPrediction}'`,
        ],
      ] as const) {
        const res = await db.query(sql);
        expect(res.affectedRows, `VIEWER must not be able to update ${table}`).toBe(0);
      }
    });
  });

  it('cannot delete anything', async () => {
    await actingAs(db, USERS.viewer, async () => {
      const res = await db.query(`DELETE FROM public.legal_issues WHERE project_id = $1`, [
        assignedA,
      ]);
      expect(res.affectedRows).toBe(0);
    });
    const remaining = await one<{ n: number }>(
      db,
      `SELECT COUNT(*)::int AS n FROM public.legal_issues WHERE project_id = $1`,
      [assignedA],
    );
    expect(remaining.n).toBe(1);
  });

  it('sees only its own profile', async () => {
    const n = await actingAs(db, USERS.viewer, () => visibleCount(db, 'profiles'));
    expect(n).toBe(1);
  });
});

describe('OFFICER — assigned projects only', () => {
  it('sees exactly the two projects it is assigned to', async () => {
    const visible = await actingAs(db, USERS.officer, () =>
      rows<{ project_code: string }>(
        db,
        `SELECT project_code FROM public.projects ORDER BY project_code`,
      ),
    );
    expect(visible.map((r) => r.project_code)).toEqual(['RLS-A', 'RLS-B']);
  });

  it('sees child rows only for assigned projects', async () => {
    await actingAs(db, USERS.officer, async () => {
      expect(await visibleCount(db, 'land_acquisition')).toBe(2);
      expect(await visibleCount(db, 'compensation')).toBe(2);
      expect(await visibleCount(db, 'legal_issues')).toBe(2);
    });
  });

  it('sees predictions only for assigned projects', async () => {
    await actingAs(db, USERS.officer, async () => {
      expect(await visibleCount(db, 'predictions')).toBe(1);
      expect(await visibleCount(db, 'prediction_explanations')).toBe(1);
      expect(await visibleCount(db, 'recommendations')).toBe(1);
    });
  });

  it('sees snapshots and outcomes only for assigned projects', async () => {
    await actingAs(db, USERS.officer, async () => {
      expect(await visibleCount(db, 'project_feature_snapshots')).toBe(1);
      expect(await visibleCount(db, 'actual_outcomes')).toBe(1);
    });
  });

  it('sees nothing at all belonging to an unassigned project', async () => {
    await actingAs(db, USERS.officer, async () => {
      const res = await rows(db, `SELECT id FROM public.projects WHERE id = $1`, [unassigned]);
      expect(res).toEqual([]);
    });
  });

  it('sees nothing when it has no assignments', async () => {
    const n = await actingAs(db, USERS.officer2, () => visibleCount(db, 'projects'));
    expect(n).toBe(0);
  });

  it('can update land data on an assigned project', async () => {
    await actingAs(db, USERS.officer, async () => {
      const res = await db.query(
        `UPDATE public.land_acquisition SET land_acquired_ha = 55 WHERE project_id = $1`,
        [assignedA],
      );
      expect(res.affectedRows).toBe(1);
    });
    const row = await one<{ v: string }>(
      db,
      `SELECT land_acquired_ha::text AS v FROM public.land_acquisition WHERE project_id = $1`,
      [assignedA],
    );
    expect(Number(row.v)).toBe(55);
  });

  it('cannot update land data on an unassigned project', async () => {
    await actingAs(db, USERS.officer, async () => {
      const res = await db.query(
        `UPDATE public.land_acquisition SET land_acquired_ha = 77 WHERE project_id = $1`,
        [unassigned],
      );
      expect(res.affectedRows).toBe(0);
    });
    const row = await one<{ v: string }>(
      db,
      `SELECT land_acquired_ha::text AS v FROM public.land_acquisition WHERE project_id = $1`,
      [unassigned],
    );
    expect(Number(row.v)).toBe(40);
  });

  it('can advance a recommendation on an assigned project', async () => {
    await actingAs(db, USERS.officer, async () => {
      const res = await db.query(
        `UPDATE public.recommendations SET status = 'IN_PROGRESS' WHERE prediction_id = $1`,
        [assignedPrediction],
      );
      expect(res.affectedRows).toBe(1);
    });
  });

  it('cannot advance a recommendation on an unassigned project', async () => {
    await actingAs(db, USERS.officer, async () => {
      const res = await db.query(
        `UPDATE public.recommendations SET status = 'COMPLETED' WHERE prediction_id = $1`,
        [unassignedPrediction],
      );
      expect(res.affectedRows).toBe(0);
    });
  });

  it('cannot create a project', async () => {
    await actingAs(db, USERS.officer, async () => {
      const err = await expectSqlError(
        db,
        `INSERT INTO public.projects
           (project_name, project_code, state, district, sector, implementing_agency)
         VALUES ('officer', 'OFFICER-1', 'S', 'D', 'ROAD', 'A')`,
      );
      expect(err.code).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
    });
  });

  it('cannot delete an assigned project', async () => {
    await actingAs(db, USERS.officer, async () => {
      const res = await db.query(`DELETE FROM public.projects WHERE id = $1`, [assignedA]);
      expect(res.affectedRows).toBe(0);
    });
    const still = await one<{ n: number }>(
      db,
      `SELECT COUNT(*)::int AS n FROM public.projects WHERE id = $1`,
      [assignedA],
    );
    expect(still.n).toBe(1);
  });

  it('cannot assign itself to a further project', async () => {
    // Otherwise assignment-based scoping would be self-service.
    await actingAs(db, USERS.officer, async () => {
      const err = await expectSqlError(
        db,
        `INSERT INTO public.project_assignments (project_id, user_id) VALUES ($1, $2)`,
        [unassigned, USERS.officer],
      );
      expect(err.code).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
    });
    const n = await one<{ n: number }>(
      db,
      `SELECT COUNT(*)::int AS n FROM public.project_assignments WHERE user_id = $1`,
      [USERS.officer],
    );
    expect(n.n).toBe(2);
  });
});

describe('audit trail is not editable by an OFFICER', () => {
  // Snapshots, predictions and outcomes record what the model saw and what
  // actually happened. An officer who could revise them could rewrite the
  // record after the fact.

  it('cannot update a snapshot on an assigned project', async () => {
    await actingAs(db, USERS.officer, async () => {
      const res = await db.query(
        `UPDATE public.project_feature_snapshots SET court_cases_count = 5 WHERE project_id = $1`,
        [assignedA],
      );
      expect(res.affectedRows).toBe(0);
    });
  });

  it('cannot update a prediction on an assigned project', async () => {
    await actingAs(db, USERS.officer, async () => {
      const res = await db.query(
        `UPDATE public.predictions SET predicted_delay_days = 1, risk_level = 'LOW' WHERE id = $1`,
        [assignedPrediction],
      );
      expect(res.affectedRows).toBe(0);
    });
    const row = await one<{ v: string }>(
      db,
      `SELECT predicted_delay_days::text AS v FROM public.predictions WHERE id = $1`,
      [assignedPrediction],
    );
    expect(Number(row.v)).toBe(42);
  });

  it('cannot delete a prediction on an assigned project', async () => {
    await actingAs(db, USERS.officer, async () => {
      const res = await db.query(`DELETE FROM public.predictions WHERE id = $1`, [
        assignedPrediction,
      ]);
      expect(res.affectedRows).toBe(0);
    });
  });

  it('cannot rewrite a prediction explanation', async () => {
    await actingAs(db, USERS.officer, async () => {
      const res = await db.query(
        `UPDATE public.prediction_explanations SET contribution_score = 0 WHERE prediction_id = $1`,
        [assignedPrediction],
      );
      expect(res.affectedRows).toBe(0);
    });
  });
});

describe('privilege escalation is blocked', () => {
  it('stops a VIEWER promoting itself to ADMIN', async () => {
    // Rejected by the WITH CHECK clause of profiles_update_own_no_role_change,
    // which compares the submitted role against the caller's stored role. A
    // failed WITH CHECK raises 42501, not a CHECK-constraint violation.
    await actingAs(db, USERS.viewer, async () => {
      const err = await expectSqlError(db, `UPDATE public.profiles SET role = 'ADMIN' WHERE id = $1`, [
        USERS.viewer,
      ]);
      expect(err.code).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
      expect(err.message).toMatch(/row-level security policy/i);
    });
    const row = await one<{ role: string }>(db, `SELECT role FROM public.profiles WHERE id = $1`, [
      USERS.viewer,
    ]);
    expect(row.role).toBe('VIEWER');
  });

  it('stops an OFFICER promoting itself to ADMIN', async () => {
    await actingAs(db, USERS.officer, async () => {
      const err = await expectSqlError(db, `UPDATE public.profiles SET role = 'ADMIN' WHERE id = $1`, [
        USERS.officer,
      ]);
      expect(err.code).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
      expect(err.message).toMatch(/row-level security policy/i);
    });
    const row = await one<{ role: string }>(db, `SELECT role FROM public.profiles WHERE id = $1`, [
      USERS.officer,
    ]);
    expect(row.role).toBe('OFFICER');
  });

  it('stops an ANALYST promoting itself', async () => {
    await actingAs(db, USERS.analyst, async () => {
      const err = await expectSqlError(db, `UPDATE public.profiles SET role = 'ADMIN' WHERE id = $1`, [
        USERS.analyst,
      ]);
      expect(err.code).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
      expect(err.message).toMatch(/row-level security policy/i);
    });
  });

  it('still lets a user edit their own non-role profile fields', async () => {
    // The block is on the role column specifically, not on self-service.
    await actingAs(db, USERS.viewer, async () => {
      const res = await db.query(`UPDATE public.profiles SET full_name = 'Renamed' WHERE id = $1`, [
        USERS.viewer,
      ]);
      expect(res.affectedRows).toBe(1);
    });
  });

  it('stops a VIEWER changing someone else’s role', async () => {
    await actingAs(db, USERS.viewer, async () => {
      const res = await db.query(`UPDATE public.profiles SET role = 'VIEWER' WHERE id = $1`, [
        USERS.admin,
      ]);
      expect(res.affectedRows).toBe(0);
    });
    const row = await one<{ role: string }>(db, `SELECT role FROM public.profiles WHERE id = $1`, [
      USERS.admin,
    ]);
    expect(row.role).toBe('ADMIN');
  });

  it('stops a non-admin editing the risk factor vocabulary', async () => {
    for (const user of [USERS.officer, USERS.analyst, USERS.viewer]) {
      await actingAs(db, user, async () => {
        const err = await expectSqlError(
          db,
          `INSERT INTO public.risk_factor_types (code, label) VALUES ('SNEAKY', 'Sneaky')`,
        );
        expect(err.code).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
      });
    }
  });

  it('stops a non-admin activating a model version', async () => {
    // The registry decides which model serves production traffic.
    for (const user of [USERS.officer, USERS.analyst, USERS.viewer]) {
      await actingAs(db, user, async () => {
        const res = await db.query(`UPDATE public.model_versions SET status = 'ACTIVE'`);
        expect(res.affectedRows).toBe(0);
      });
    }
  });

  it('stops a user reading another user’s assignments', async () => {
    await actingAs(db, USERS.viewer, async () => {
      const res = await rows(db, `SELECT id FROM public.project_assignments WHERE user_id = $1`, [
        USERS.officer,
      ]);
      expect(res).toEqual([]);
    });
  });

  it('does not let an OFFICER insert a snapshot for an unassigned project', async () => {
    await actingAs(db, USERS.officer, async () => {
      const err = await expectSqlError(
        db,
        `INSERT INTO public.project_feature_snapshots (project_id) VALUES ($1)`,
        [unassigned],
      );
      expect(err.code).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
    });
  });
});
