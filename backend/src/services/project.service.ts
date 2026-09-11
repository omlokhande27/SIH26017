import { supabaseAdmin } from '../config/supabase';
import { ROLES_WITH_GLOBAL_READ, type AppRole } from '../config/roles';
import { visibleProjectIds } from './authorization.service';
import { NotFoundError } from '../utils/errors';
import { translateDbError } from '../utils/db-error';
import type {
  CreateProjectInput,
  ListProjectsQuery,
  UpdateProjectInput,
} from '../validators/project.validator';

/**
 * Project persistence and the read-scoping rule for collections.
 *
 * ###########################################################################
 * # WHY LIST SCOPING LIVES HERE                                             #
 * #                                                                        #
 * # `requireProjectAccess` guards routes addressed by a project id. A       #
 * # collection endpoint has no id to guard, so the filter must be applied   #
 * # to the query itself — and it cannot be left to RLS, because the backend #
 * # connects with the service-role key and bypasses RLS entirely.          #
 * #                                                                        #
 * # An OFFICER therefore gets an explicit `IN (assigned ids)` restriction   #
 * # below. Forgetting it would leak every project in the country through a  #
 * # route that never looked unsafe.                                        #
 * ###########################################################################
 */

/** Columns returned for a project. Enumerated rather than `*` so a future column is a deliberate decision. */
const PROJECT_COLUMNS = `
  id, project_name, project_code, state, district, sector, implementing_agency,
  planned_start_date, planned_completion_date, actual_start_date, actual_completion_date,
  project_status, latitude, longitude, created_by, created_at, updated_at
`;

export interface ProjectRow {
  id: string;
  project_name: string;
  project_code: string;
  state: string;
  district: string;
  sector: string;
  implementing_agency: string;
  planned_start_date: string | null;
  planned_completion_date: string | null;
  actual_start_date: string | null;
  actual_completion_date: string | null;
  project_status: string;
  latitude: string | null;
  longitude: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedProjects {
  projects: ProjectRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// Project scoping lives in authorization.service.ts (`visibleProjectIds`) so
// the list endpoint and the Phase 6 aggregates share one implementation. Two
// copies of a visibility rule is how one of them quietly stops matching.

export async function listProjects(
  user: { id: string; role: AppRole },
  query: ListProjectsQuery,
): Promise<PaginatedProjects> {
  const { page, limit, sort, order, search, ...filters } = query;

  const emptyPage: PaginatedProjects = {
    projects: [],
    pagination: {
      page,
      limit,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrevious: page > 1,
    },
  };

  let builder = supabaseAdmin
    .from('projects')
    .select(PROJECT_COLUMNS, { count: 'exact' });

  // Read scoping — see the note at the top of this file.
  if (!ROLES_WITH_GLOBAL_READ.includes(user.role)) {
    const visible = (await visibleProjectIds(user)) ?? [];
    // No assignments means no visible projects. Returning early matters:
    // `.in('id', [])` is a query some clients mishandle, and an empty result
    // must never come back as "unfiltered".
    if (visible.length === 0) return emptyPage;
    builder = builder.in('id', visible);
  }

  for (const [column, value] of Object.entries(filters)) {
    if (value !== undefined) builder = builder.eq(column, value);
  }

  if (search) {
    // Escape PostgREST's `or` delimiters so a crafted search string cannot
    // inject extra filter terms.
    const safe = search.replace(/[,()*]/g, ' ').trim();
    if (safe) builder = builder.or(`project_name.ilike.*${safe}*,project_code.ilike.*${safe}*`);
  }

  const from = (page - 1) * limit;
  const { data, error, count } = await builder
    .order(sort, { ascending: order === 'asc' })
    .range(from, from + limit - 1);

  if (error) throw translateDbError(error, { context: { op: 'listProjects' } });

  const total = count ?? 0;
  return {
    projects: (data ?? []) as unknown as ProjectRow[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: from + limit < total,
      hasPrevious: page > 1,
    },
  };
}

export async function getProjectById(projectId: string): Promise<ProjectRow> {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('id', projectId)
    .maybeSingle();

  if (error) throw translateDbError(error, { resource: 'Project', context: { projectId } });
  if (!data) throw new NotFoundError('Project');
  return data as unknown as ProjectRow;
}

export async function createProject(
  input: CreateProjectInput,
  createdBy: string,
): Promise<ProjectRow> {
  // `created_by` comes from the authenticated caller, never the request body.
  // Authorship grants project access, so accepting it from input would let a
  // caller grant access to someone else.
  const { data, error } = await supabaseAdmin
    .from('projects')
    .insert({ ...input, created_by: createdBy })
    .select(PROJECT_COLUMNS)
    .single();

  if (error) throw translateDbError(error, { resource: 'Project', context: { op: 'createProject' } });
  return data as unknown as ProjectRow;
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
): Promise<ProjectRow> {
  // `updated_at` is deliberately not set here: a database trigger maintains it
  // and overrides any client-supplied value.
  const { data, error } = await supabaseAdmin
    .from('projects')
    .update(input)
    .eq('id', projectId)
    .select(PROJECT_COLUMNS)
    .maybeSingle();

  if (error) throw translateDbError(error, { resource: 'Project', context: { projectId } });
  if (!data) throw new NotFoundError('Project');
  return data as unknown as ProjectRow;
}

/**
 * Delete a project.
 *
 * Deletion cascades to land, compensation, legal issues, risk factors and
 * snapshots. It is refused when a prediction exists, because
 * `predictions.feature_snapshot_id` is ON DELETE RESTRICT — the audit trail of
 * what was predicted and why must not be erasable by deleting the project.
 * That refusal surfaces as a 409 rather than a raw constraint error.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const existing = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();

  if (existing.error) {
    throw translateDbError(existing.error, { resource: 'Project', context: { projectId } });
  }
  if (!existing.data) throw new NotFoundError('Project');

  const { error } = await supabaseAdmin.from('projects').delete().eq('id', projectId);
  if (error) throw translateDbError(error, { resource: 'Project', context: { projectId } });
}
