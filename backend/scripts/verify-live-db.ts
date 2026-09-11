/* eslint-disable no-console */
/**
 * verify-live-db.ts — deep verification against the REAL Supabase project.
 *
 * Run with:  npm run verify:live
 *
 * ###########################################################################
 * # WHY THIS IS BEHAVIOURAL, NOT CATALOG INTROSPECTION                      #
 * #                                                                        #
 * # PostgREST exposes only the `public` schema, so pg_policies, pg_trigger  #
 * # and pg_indexes are unreachable from here. That turns out to be a better #
 * # constraint than it sounds: a row in pg_policies proves a policy was     #
 * # CREATEd, not that it does anything. So every check below is expressed   #
 * # as observable behaviour through the real API, using real ES256 sessions #
 * # issued by the real project.                                            #
 * #                                                                        #
 * # RLS EVIDENCE COMES ONLY FROM PUBLISHABLE-KEY CLIENTS. The service-role  #
 * # client bypasses RLS by design; it is used here solely to seed and tear  #
 * # down fixtures, never as proof that a policy works.                      #
 * ###########################################################################
 *
 * No key, token, or password is ever printed.
 */
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } from '../src/config/env';

type Status = 'pass' | 'fail' | 'warn' | 'info';

const results: Array<{ group: string; step: string; status: Status; detail: string }> = [];
let currentGroup = 'general';

function group(name: string): void {
  currentGroup = name;
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 54 - name.length))}`);
}

function record(step: string, status: Status, detail: string): void {
  results.push({ group: currentGroup, step, status, detail });
  const icon = { pass: '  ✅', fail: '  ❌', warn: '  ⚠️ ', info: '  ·' }[status];
  console.log(`${icon} ${step}`);
  if (detail) console.log(`       ${detail}`);
}

/** Assert a boolean and record the outcome. */
function check(step: string, condition: boolean, detailPass: string, detailFail: string): boolean {
  record(step, condition ? 'pass' : 'fail', condition ? detailPass : detailFail);
  return condition;
}

// --- fixtures ---------------------------------------------------------------
// Every artefact this script creates carries an unmistakable prefix so it can
// be found and removed, and never confused with real data.
const RUN = randomBytes(4).toString('hex');
const TAG = `ZZVERIFY-${RUN}`;

const secret = createClient(env.SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * A genuinely anonymous client. It must NEVER be used to sign in.
 *
 * supabase-js keeps the session on the client instance in memory even with
 * `persistSession: false`, so calling signInWithPassword() on this object would
 * silently authenticate it — and every later "anonymous access" assertion would
 * really be testing a signed-in VIEWER. An earlier version of this script did
 * exactly that and reported a phantom RLS leak; the tell was that "anonymous"
 * could see precisely one profile row, which is what a VIEWER sees (their own).
 */
const anon = createClient(env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** A separate, disposable client used only to exchange credentials for tokens. */
function makeSignInClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface TestUser {
  role: 'ADMIN' | 'ANALYST' | 'OFFICER' | 'VIEWER';
  id: string;
  email: string;
  password: string;
  /** A client carrying this user's real access token — RLS APPLIES to it. */
  client: SupabaseClient;
}

const users: TestUser[] = [];
const projectIds: string[] = [];

/**
 * Build a client that acts as a signed-in user.
 *
 * It uses the PUBLISHABLE key plus the user's real bearer token, which is what
 * a browser would send. RLS therefore applies and `auth.uid()` resolves to this
 * user — the only configuration in which a policy test means anything.
 */
function clientForToken(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function createTestUser(role: TestUser['role']): Promise<TestUser | null> {
  const email = `zzverify-${RUN}-${role.toLowerCase()}@example.com`;
  const password = `Verify!${randomBytes(18).toString('base64url')}`;

  const { data, error } = await secret.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // Deliberately hostile metadata on every account: if any layer ever trusted
    // it, the role checks below would report ADMIN for all four users.
    user_metadata: { full_name: `Verify ${role}`, role: 'ADMIN' },
  });

  if (error || !data.user) {
    record(`Create ${role} test user`, 'fail', error?.message ?? 'no user returned');
    return null;
  }

  // The trigger provisions VIEWER. Promote via the service role, which is how a
  // real ADMIN action would do it — never by the user themselves.
  if (role !== 'VIEWER') {
    const { error: promoteError } = await secret
      .from('profiles')
      .update({ role })
      .eq('id', data.user.id);
    if (promoteError) {
      record(`Promote ${role} test user`, 'fail', promoteError.message);
      return null;
    }
  }

  const signInClient = makeSignInClient();
  const { data: session, error: signInError } = await signInClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !session.session) {
    record(`Sign in ${role} test user`, 'fail', signInError?.message ?? 'no session');
    return null;
  }

  return {
    role,
    id: data.user.id,
    email,
    password,
    client: clientForToken(session.session.access_token),
  };
}

const byRole = (role: TestUser['role']): TestUser => {
  const user = users.find((u) => u.role === role);
  if (!user) throw new Error(`test user ${role} was not created`);
  return user;
};

async function main(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  LIVE SUPABASE DATABASE VERIFICATION');
  console.log(`  Project: ${new URL(env.SUPABASE_URL).host}`);
  console.log(`  Fixture tag: ${TAG}`);
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await verifyStructure();
    await seedFixtures();
    await verifyGeneratedColumns();
    await verifyConstraints();
    await verifyTriggers();
    await verifyRls();
    await verifyRoleResolution();
  } catch (err) {
    record('Verification run', 'fail', `Aborted: ${(err as Error).message}`);
  } finally {
    await cleanup();
  }

  summarise();
}

// ---------------------------------------------------------------------------
// 1-2, 6. Structure: tables, functions, indexes
// ---------------------------------------------------------------------------
const EXPECTED_TABLES = [
  'actual_outcomes',
  'compensation',
  'land_acquisition',
  'legal_issues',
  'model_versions',
  'prediction_explanations',
  'predictions',
  'profiles',
  'project_assignments',
  'project_feature_snapshots',
  'projects',
  'recommendations',
  'risk_factor_types',
  'risk_factors',
];

async function verifyStructure(): Promise<void> {
  group('SCHEMA STRUCTURE');

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}` },
  });
  const spec = (await response.json()) as {
    definitions?: Record<string, unknown>;
    paths?: Record<string, unknown>;
  };

  const tables = Object.keys(spec.definitions ?? {}).sort();
  const missing = EXPECTED_TABLES.filter((t) => !tables.includes(t));

  check(
    'All 14 expected tables exist',
    missing.length === 0 && tables.length >= EXPECTED_TABLES.length,
    `Found ${tables.length}: ${tables.join(', ')}`,
    `Missing: ${missing.join(', ')}`,
  );

  // The three RLS helper functions. Their existence is checked by CALLING them,
  // which also proves they execute rather than merely being declared.
  const rpcs = Object.keys(spec.paths ?? {})
    .filter((p) => p.startsWith('/rpc/'))
    .map((p) => p.replace('/rpc/', ''));

  for (const fn of ['current_app_role', 'is_admin', 'is_assigned_to_project']) {
    check(
      `Function public.${fn}() exists`,
      rpcs.includes(fn),
      'Exposed and callable via PostgREST',
      'Not found — schema.sql may be partially applied',
    );
  }

  // Executing them proves SECURITY DEFINER works and that reading profiles from
  // inside a policy helper does not recurse.
  const { error: roleError } = await anon.rpc('current_app_role');
  check(
    'current_app_role() executes without recursion',
    !roleError,
    'Returned without error for an anonymous caller (NULL role)',
    `Errored: ${roleError?.message ?? ''}`,
  );

  const { data: isAdminAnon, error: adminError } = await anon.rpc('is_admin');
  check(
    'is_admin() returns false for anonymous',
    !adminError && isAdminAnon === false,
    `is_admin() = ${String(isAdminAnon)}`,
    `Expected false, got ${String(isAdminAnon)} ${adminError?.message ?? ''}`,
  );

  // Indexes cannot be listed through PostgREST — pg_indexes lives in a schema
  // it does not expose. Reported honestly rather than asserted.
  record(
    'Index verification',
    'warn',
    'NOT VERIFIABLE through PostgREST (pg_indexes is not an exposed schema). ' +
      'Indexes are verified against real PostgreSQL in database/tests/schema.test.ts. ' +
      'To confirm on the live project, run in the SQL Editor: ' +
      "SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname;",
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
async function seedFixtures(): Promise<void> {
  group('TEST FIXTURES (temporary, removed at the end)');

  for (const role of ['ADMIN', 'ANALYST', 'OFFICER', 'VIEWER'] as const) {
    const user = await createTestUser(role);
    if (user) {
      users.push(user);
      record(`Provision ${role} user`, 'pass', `${user.email} — signed in, real ES256 session`);
    }
  }

  if (users.length !== 4) throw new Error('could not provision all four test users');

  // Two projects: the officer is assigned to the first only.
  for (const suffix of ['A', 'B']) {
    const { data, error } = await secret
      .from('projects')
      .insert({
        project_name: `${TAG} Project ${suffix}`,
        project_code: `${TAG}-${suffix}`,
        state: 'TestState',
        district: 'TestDistrict',
        sector: 'ROAD',
        implementing_agency: 'Test Agency',
        project_status: 'ACTIVE',
      })
      .select('id')
      .single();

    if (error || !data) throw new Error(`could not seed project ${suffix}: ${error?.message}`);
    projectIds.push((data as { id: string }).id);
  }

  const officer = byRole('OFFICER');
  const { error: assignError } = await secret
    .from('project_assignments')
    .insert({ project_id: projectIds[0], user_id: officer.id });

  if (assignError) throw new Error(`could not assign officer: ${assignError.message}`);

  record(
    'Seed projects and assignment',
    'pass',
    `2 projects created; OFFICER assigned to project A only`,
  );
}

// ---------------------------------------------------------------------------
// 4. Generated columns
// ---------------------------------------------------------------------------
async function verifyGeneratedColumns(): Promise<void> {
  group('GENERATED COLUMNS');

  const { data: land, error } = await secret
    .from('land_acquisition')
    .insert({ project_id: projectIds[0], land_required_ha: 200, land_acquired_ha: 50 })
    .select('land_acquisition_percentage')
    .single();

  const pct = (land as { land_acquisition_percentage: unknown })?.land_acquisition_percentage;

  check(
    'land_acquisition_percentage is computed by PostgreSQL',
    !error && Number(pct) === 25,
    `50/200 -> ${String(pct)}`,
    `Expected 25, got ${JSON.stringify(land)} ${error?.message ?? ''}`,
  );

  // A finding in its own right, not an assertion about the schema: PostgREST
  // serialises NUMERIC as a JSON *number*, so supabase-js hands back a JS
  // number rather than the exact-decimal string the docs assumed. Recorded so
  // it is visible rather than silently absorbed.
  record(
    'NUMERIC serialisation (informational)',
    'warn',
    `NUMERIC arrives as a JS ${typeof pct}, not a string. Values are correct, but JS numbers ` +
      'are IEEE-754 doubles and lose integer precision above 2^53 (~9.0e15). ' +
      'NUMERIC(18,2) permits ~1.0e16, so the top of the declared range is not exactly ' +
      'representable. Current code never does arithmetic on these values (it copies them ' +
      'through), so nothing is wrong today — but docs/DATABASE.md §5 claims strings and ' +
      'must be corrected before any Phase 3+ code sums money in JavaScript.',
  );

  // Writing a generated column must be refused even by the service role.
  const { error: spoofError } = await secret
    .from('land_acquisition')
    .update({ land_acquisition_percentage: '100.0000' })
    .eq('project_id', projectIds[0]);

  check(
    'Generated column cannot be spoofed, even with the secret key',
    Boolean(spoofError),
    `Rejected: ${spoofError?.code ?? ''} (a client cannot report 100% on an unacquired project)`,
    'ACCEPTED a write to a generated column — the column is not GENERATED on the live project',
  );

  // Recomputation on update of a source column.
  const { data: updated } = await secret
    .from('land_acquisition')
    .update({ land_acquired_ha: 150 })
    .eq('project_id', projectIds[0])
    .select('land_acquisition_percentage')
    .single();

  const pct2 = (updated as { land_acquisition_percentage: unknown })?.land_acquisition_percentage;
  check(
    'Generated column recomputes when an input changes',
    Number(pct2) === 75,
    `150/200 -> ${String(pct2)}`,
    `Expected 75, got ${JSON.stringify(updated)}`,
  );

  const { data: comp, error: compError } = await secret
    .from('compensation')
    .insert({
      project_id: projectIds[0],
      total_compensation_required: '1000000.00',
      total_compensation_paid: '250000.00',
    })
    .select('compensation_pending, compensation_pending_percentage')
    .single();

  const c = comp as { compensation_pending: unknown; compensation_pending_percentage: unknown };
  check(
    'compensation_pending and its percentage are computed',
    !compError && Number(c?.compensation_pending) === 750000 && Number(c?.compensation_pending_percentage) === 75,
    `pending=${String(c?.compensation_pending)}, pct=${String(c?.compensation_pending_percentage)}`,
    `Got ${JSON.stringify(comp)} ${compError?.message ?? ''}`,
  );
}

// ---------------------------------------------------------------------------
// 5. CHECK constraints and foreign keys
// ---------------------------------------------------------------------------
async function verifyConstraints(): Promise<void> {
  group('CONSTRAINTS');

  const cases: Array<{ name: string; run: () => Promise<{ code?: string } | null> }> = [
    {
      name: 'land acquired cannot exceed land required',
      run: async () => {
        const { error } = await secret
          .from('land_acquisition')
          .insert({ project_id: projectIds[1], land_required_ha: 10, land_acquired_ha: 50 });
        return error;
      },
    },
    {
      name: 'compensation paid cannot exceed required',
      run: async () => {
        const { error } = await secret.from('compensation').insert({
          project_id: projectIds[1],
          total_compensation_required: '100.00',
          total_compensation_paid: '500.00',
        });
        return error;
      },
    },
    {
      name: 'unknown risk factor type is rejected (FK to risk_factor_types)',
      run: async () => {
        const { error } = await secret.from('risk_factors').insert({
          project_id: projectIds[0],
          factor_type: 'NOT_A_REAL_TYPE',
          factor_name: 'x',
          severity: 'LOW',
        });
        return error;
      },
    },
    {
      name: 'duplicate project_code is rejected',
      run: async () => {
        const { error } = await secret.from('projects').insert({
          project_name: 'dup',
          project_code: `${TAG}-A`,
          state: 'S',
          district: 'D',
          sector: 'ROAD',
          implementing_agency: 'A',
        });
        return error;
      },
    },
    {
      name: 'FAILED prediction carrying a value is rejected (0 cannot be fabricated)',
      run: async () => {
        const { data: snap } = await secret
          .from('project_feature_snapshots')
          .insert({ project_id: projectIds[0] })
          .select('id')
          .single();
        const { error } = await secret.from('predictions').insert({
          project_id: projectIds[0],
          feature_snapshot_id: (snap as { id: string })?.id,
          predicted_delay_days: 0,
          risk_level: 'LOW',
          prediction_status: 'FAILED',
        });
        return error;
      },
    },
    {
      name: 'cross-project snapshot is rejected (composite FK)',
      run: async () => {
        const { data: snapB } = await secret
          .from('project_feature_snapshots')
          .insert({ project_id: projectIds[1] })
          .select('id')
          .single();
        const { error } = await secret.from('predictions').insert({
          project_id: projectIds[0],
          feature_snapshot_id: (snapB as { id: string })?.id,
          predicted_delay_days: 10,
          risk_level: 'LOW',
          prediction_status: 'SUCCESS',
        });
        return error;
      },
    },
    {
      name: 'award before notification is rejected',
      run: async () => {
        const { error } = await secret
          .from('land_acquisition')
          .update({ notification_date: '2024-06-01', award_date: '2024-01-01' })
          .eq('project_id', projectIds[0]);
        return error;
      },
    },
  ];

  for (const testCase of cases) {
    const error = await testCase.run();
    check(
      testCase.name,
      Boolean(error),
      `Rejected by the database (${error?.code ?? 'error'})`,
      'ACCEPTED — the constraint is not active on the live project',
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Triggers
// ---------------------------------------------------------------------------
async function verifyTriggers(): Promise<void> {
  group('TRIGGERS');

  // Backdate with the service role, then update and confirm the trigger moved
  // it forward. Comparing two wall-clock reads would be a flaky test, not a
  // test of the trigger.
  await secret
    .from('projects')
    .update({ updated_at: '2000-01-01T00:00:00Z' })
    .eq('id', projectIds[0]);

  const { data: before } = await secret
    .from('projects')
    .select('updated_at')
    .eq('id', projectIds[0])
    .single();

  await secret.from('projects').update({ district: 'TriggerTest' }).eq('id', projectIds[0]);

  const { data: after } = await secret
    .from('projects')
    .select('updated_at')
    .eq('id', projectIds[0])
    .single();

  const beforeYear = new Date((before as { updated_at: string })?.updated_at).getUTCFullYear();
  const afterYear = new Date((after as { updated_at: string })?.updated_at).getUTCFullYear();

  check(
    'updated_at trigger fires on UPDATE',
    afterYear > 2000,
    `Backdated to ${beforeYear}, trigger moved it to ${afterYear}`,
    `Still ${afterYear} — trg_projects_set_updated_at is not firing`,
  );

  // The auto-provision trigger: every user created above arrived as VIEWER
  // despite metadata claiming ADMIN.
  const viewer = byRole('VIEWER');
  const { data: profile } = await secret
    .from('profiles')
    .select('role, full_name')
    .eq('id', viewer.id)
    .single();

  check(
    'on_auth_user_created provisions a profile as VIEWER',
    (profile as { role: string })?.role === 'VIEWER',
    `profiles.role = ${(profile as { role: string })?.role}, despite signup metadata claiming ADMIN`,
    `Got ${JSON.stringify(profile)}`,
  );

  check(
    'Trigger copies full_name but never the role',
    (profile as { full_name: string })?.full_name === 'Verify VIEWER',
    `full_name = "${(profile as { full_name: string })?.full_name}" (a display string grants nothing)`,
    `full_name = ${JSON.stringify((profile as { full_name: string })?.full_name)}`,
  );
}

// ---------------------------------------------------------------------------
// 7-15. RLS — the core. Every assertion uses a PUBLISHABLE-key client.
// ---------------------------------------------------------------------------
async function verifyRls(): Promise<void> {
  group('RLS — ANONYMOUS ACCESS');

  // Guard first: prove this client really is anonymous before drawing any
  // conclusion from what it can see. Without this, a client that had been
  // signed in would make every assertion below meaningless — and it would fail
  // in the direction that looks like an RLS leak, which is the worst way to be
  // wrong.
  const { data: anonRole } = await anon.rpc('current_app_role');
  const { data: anonIsAdmin } = await anon.rpc('is_admin');
  if (!check(
    'Anonymous client is genuinely unauthenticated',
    anonRole === null && anonIsAdmin === false,
    'current_app_role() is NULL and is_admin() is false — auth.uid() resolves to NULL',
    `current_app_role() = ${JSON.stringify(anonRole)} — this client carries a session, ` +
      'so the anonymous assertions below would be testing a signed-in user',
  )) {
    record('Anonymous access checks', 'fail', 'Skipped — the client is not anonymous.');
    return;
  }

  // Every table below holds at least one seeded row at this point, so "0 rows"
  // is evidence of a policy denying access rather than of an empty table.
  for (const table of ['projects', 'profiles', 'land_acquisition']) {
    const { data, error } = await anon.from(table).select('*').limit(5);
    check(
      `Anonymous cannot read ${table}`,
      (data?.length ?? 0) === 0,
      `0 rows returned${error ? ` (${error.code})` : ''}`,
      `LEAK: ${data?.length} row(s) visible to an unauthenticated caller`,
    );
  }

  const { error: anonInsert } = await anon.from('projects').insert({
    project_name: 'anon',
    project_code: `${TAG}-ANON`,
    state: 'S',
    district: 'D',
    sector: 'ROAD',
    implementing_agency: 'A',
  });
  check(
    'Anonymous cannot create a project',
    Boolean(anonInsert),
    `Refused (${anonInsert?.code})`,
    'ACCEPTED an anonymous insert',
  );

  group('RLS — PROJECT VISIBILITY BY ROLE');

  for (const role of ['ADMIN', 'ANALYST', 'VIEWER'] as const) {
    const { data } = await byRole(role).client.from('projects').select('id');
    const visible = (data ?? []).filter((p) => projectIds.includes((p as { id: string }).id));
    check(
      `${role} reads both test projects (prototype national scope)`,
      visible.length === 2,
      `Sees ${visible.length}/2 test projects`,
      `Sees ${visible.length}/2 — expected both`,
    );
  }

  const { data: officerProjects } = await byRole('OFFICER').client.from('projects').select('id');
  const officerVisible = (officerProjects ?? []).filter((p) =>
    projectIds.includes((p as { id: string }).id),
  );
  check(
    'OFFICER sees ONLY the assigned project',
    officerVisible.length === 1 &&
      (officerVisible[0] as { id: string }).id === projectIds[0],
    'Sees exactly 1 of 2 test projects — the one they are assigned to',
    `Sees ${officerVisible.length} — assignment scoping is not enforced`,
  );

  group('RLS — WRITE AUTHORIZATION');

  // VIEWER must not modify anything.
  const viewerUpdate = await byRole('VIEWER')
    .client.from('projects')
    .update({ district: 'ViewerHacked' })
    .eq('id', projectIds[0])
    .select('id');
  check(
    'VIEWER cannot modify a project',
    (viewerUpdate.data?.length ?? 0) === 0,
    'Update affected 0 rows (no UPDATE policy grants VIEWER access)',
    `Modified ${viewerUpdate.data?.length} row(s) — VIEWER is not read-only`,
  );

  const viewerInsert = await byRole('VIEWER').client.from('projects').insert({
    project_name: 'viewer',
    project_code: `${TAG}-V`,
    state: 'S',
    district: 'D',
    sector: 'ROAD',
    implementing_agency: 'A',
  });
  check(
    'VIEWER cannot create a project',
    Boolean(viewerInsert.error),
    `Refused (${viewerInsert.error?.code})`,
    'ACCEPTED a VIEWER insert',
  );

  const analystUpdate = await byRole('ANALYST')
    .client.from('projects')
    .update({ district: 'AnalystHacked' })
    .eq('id', projectIds[0])
    .select('id');
  check(
    'ANALYST cannot modify a project, despite reading all of them',
    (analystUpdate.data?.length ?? 0) === 0,
    'Update affected 0 rows — the national READ scope does not leak into write access',
    `Modified ${analystUpdate.data?.length} row(s)`,
  );

  // OFFICER: allowed on the assigned project, refused on the other.
  const officerAssigned = await byRole('OFFICER')
    .client.from('projects')
    .update({ district: 'OfficerEdit' })
    .eq('id', projectIds[0])
    .select('id');
  check(
    'OFFICER can modify their ASSIGNED project',
    (officerAssigned.data?.length ?? 0) === 1,
    'Update affected 1 row',
    `Affected ${officerAssigned.data?.length ?? 0} rows — expected 1`,
  );

  const officerUnassigned = await byRole('OFFICER')
    .client.from('projects')
    .update({ district: 'OfficerHacked' })
    .eq('id', projectIds[1])
    .select('id');
  check(
    'OFFICER cannot modify an UNASSIGNED project',
    (officerUnassigned.data?.length ?? 0) === 0,
    'Update affected 0 rows',
    `Modified ${officerUnassigned.data?.length} row(s) — assignment scoping broken`,
  );

  const officerDelete = await byRole('OFFICER')
    .client.from('projects')
    .delete()
    .eq('id', projectIds[0])
    .select('id');
  check(
    'OFFICER cannot DELETE even an assigned project',
    (officerDelete.data?.length ?? 0) === 0,
    'Delete affected 0 rows',
    'DELETED a project — officers must not be able to erase records',
  );

  const officerSelfAssign = await byRole('OFFICER')
    .client.from('project_assignments')
    .insert({ project_id: projectIds[1], user_id: byRole('OFFICER').id });
  check(
    'OFFICER cannot self-assign to another project',
    Boolean(officerSelfAssign.error),
    `Refused (${officerSelfAssign.error?.code}) — otherwise scoping would be self-service`,
    'ACCEPTED a self-assignment',
  );

  // ADMIN: full access.
  const adminUpdate = await byRole('ADMIN')
    .client.from('projects')
    .update({ district: 'AdminEdit' })
    .eq('id', projectIds[1])
    .select('id');
  check(
    'ADMIN can modify any project',
    (adminUpdate.data?.length ?? 0) === 1,
    'Update affected 1 row on a project with no assignment',
    `Affected ${adminUpdate.data?.length ?? 0} rows`,
  );

  const adminInsert = await byRole('ADMIN').client.from('projects').insert({
    project_name: `${TAG} admin-created`,
    project_code: `${TAG}-ADMIN`,
    state: 'S',
    district: 'D',
    sector: 'ROAD',
    implementing_agency: 'A',
  }).select('id').single();

  if (!adminInsert.error && adminInsert.data) {
    projectIds.push((adminInsert.data as { id: string }).id);
  }
  check(
    'ADMIN can create a project',
    !adminInsert.error,
    'Insert accepted',
    `Refused: ${adminInsert.error?.message}`,
  );

  group('RLS — CHILD TABLE SCOPING');

  const { data: officerLand } = await byRole('OFFICER')
    .client.from('land_acquisition')
    .select('project_id');
  const officerLandVisible = (officerLand ?? []).filter((r) =>
    projectIds.includes((r as { project_id: string }).project_id),
  );
  check(
    'OFFICER sees child rows only for assigned projects',
    officerLandVisible.every((r) => (r as { project_id: string }).project_id === projectIds[0]),
    `${officerLandVisible.length} row(s), all belonging to the assigned project`,
    'Sees child rows from an unassigned project',
  );

  const { data: anonLand } = await anon.from('land_acquisition').select('id').limit(5);
  check(
    'Anonymous cannot read land acquisition data',
    (anonLand?.length ?? 0) === 0,
    '0 rows',
    `LEAK: ${anonLand?.length} row(s)`,
  );
}

// ---------------------------------------------------------------------------
// 16-17. Role resolution and escalation
// ---------------------------------------------------------------------------
async function verifyRoleResolution(): Promise<void> {
  group('ROLE RESOLUTION AND ESCALATION');

  // Every test user's token carries user_metadata.role = 'ADMIN'.
  const viewer = byRole('VIEWER');
  const { data: role } = await viewer.client.rpc('current_app_role');
  check(
    'current_app_role() returns the PROFILES role, not the token claim',
    role === 'VIEWER',
    `Token metadata claims ADMIN; database resolves "${String(role)}"`,
    `Resolved "${String(role)}" — expected VIEWER`,
  );

  const { data: isAdmin } = await viewer.client.rpc('is_admin');
  check(
    'is_admin() is false for a VIEWER whose token claims ADMIN',
    isAdmin === false,
    'is_admin() = false',
    `is_admin() = ${String(isAdmin)} — a metadata claim granted admin rights`,
  );

  // Self-promotion must be refused.
  const selfPromote = await viewer.client
    .from('profiles')
    .update({ role: 'ADMIN' })
    .eq('id', viewer.id)
    .select('id');

  const { data: afterPromote } = await secret
    .from('profiles')
    .select('role')
    .eq('id', viewer.id)
    .single();

  check(
    'VIEWER cannot promote themselves to ADMIN',
    (afterPromote as { role: string })?.role === 'VIEWER',
    `Still VIEWER after the attempt${selfPromote.error ? ` (${selfPromote.error.code})` : ''}`,
    `Role is now ${(afterPromote as { role: string })?.role} — SELF-PROMOTION SUCCEEDED`,
  );

  // Editing someone else's role must also be refused.
  const admin = byRole('ADMIN');
  const demoteAdmin = await viewer.client
    .from('profiles')
    .update({ role: 'VIEWER' })
    .eq('id', admin.id)
    .select('id');

  const { data: adminProfile } = await secret
    .from('profiles')
    .select('role')
    .eq('id', admin.id)
    .single();

  check(
    'VIEWER cannot change another user’s role',
    (adminProfile as { role: string })?.role === 'ADMIN',
    `Target is still ADMIN (${demoteAdmin.data?.length ?? 0} rows affected)`,
    `Target role is now ${(adminProfile as { role: string })?.role}`,
  );

  // A user may edit their own non-role fields.
  const renameSelf = await viewer.client
    .from('profiles')
    .update({ full_name: 'Renamed By Self' })
    .eq('id', viewer.id)
    .select('id');
  check(
    'A user may still edit their own non-role profile fields',
    (renameSelf.data?.length ?? 0) === 1,
    'full_name updated — the block is on the role column specifically',
    `Affected ${renameSelf.data?.length ?? 0} rows`,
  );

  // Non-admins must not extend the reference vocabulary.
  const vocab = await viewer.client
    .from('risk_factor_types')
    .insert({ code: 'ZZ_SNEAKY', label: 'Sneaky' });
  check(
    'VIEWER cannot extend the risk factor vocabulary',
    Boolean(vocab.error),
    `Refused (${vocab.error?.code})`,
    'ACCEPTED — reference data is writable by non-admins',
  );
}

// ---------------------------------------------------------------------------
// 20. Cleanup — always runs
// ---------------------------------------------------------------------------
async function cleanup(): Promise<void> {
  group('CLEANUP');

  let failures = 0;

  // Projects cascade to land, compensation, legal issues, risk factors and
  // snapshots. Predictions would block via ON DELETE RESTRICT, so those are
  // removed first.
  for (const projectId of projectIds) {
    await secret.from('predictions').delete().eq('project_id', projectId);
    await secret.from('project_feature_snapshots').delete().eq('project_id', projectId);
    const { error } = await secret.from('projects').delete().eq('id', projectId);
    if (error) failures += 1;
  }

  // Any stray row carrying the fixture tag, in case an id was not tracked.
  await secret.from('projects').delete().like('project_code', `${TAG}%`);
  await secret.from('risk_factor_types').delete().eq('code', 'ZZ_SNEAKY');

  for (const user of users) {
    const { error } = await secret.auth.admin.deleteUser(user.id);
    if (error) failures += 1;
  }

  const { data: leftoverProjects } = await secret
    .from('projects')
    .select('id')
    .like('project_code', `${TAG}%`);

  check(
    'All temporary test data removed',
    failures === 0 && (leftoverProjects?.length ?? 0) === 0,
    `${projectIds.length} project(s) and ${users.length} user(s) deleted; no fixtures remain`,
    `${failures} deletion(s) failed, ${leftoverProjects?.length ?? 0} project(s) remain — ` +
      `search for project_code LIKE '${TAG}%' and remove manually`,
  );
}

function summarise(): void {
  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const warn = results.filter((r) => r.status === 'warn').length;

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  ${pass} passed · ${fail} failed · ${warn} warnings`);
  console.log('═══════════════════════════════════════════════════════════');

  if (fail > 0) {
    console.log('\nFailed checks:');
    for (const r of results.filter((x) => x.status === 'fail')) {
      console.log(`  ❌ [${r.group}] ${r.step}`);
      console.log(`       ${r.detail}`);
    }
    process.exitCode = 1;
  }
  console.log();
}

void main();
