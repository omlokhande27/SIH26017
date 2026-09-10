import { supabaseAdmin } from '../config/supabase';
import { ConflictError, NotFoundError } from '../utils/errors';
import { translateDbError } from '../utils/db-error';

/**
 * The project-owned tables: land acquisition, compensation, legal issues and
 * risk factors.
 *
 * Every function here takes a `projectId` that a `requireProjectAccess` guard
 * has already authorised, and scopes its query by it. Child rows are addressed
 * as `(project_id, id)` rather than by `id` alone — otherwise knowing a legal
 * issue's UUID would be enough to read or edit it through any project the
 * caller happens to have access to.
 *
 * GENERATED COLUMNS ARE SELECTED BUT NEVER WRITTEN. `land_acquisition_percentage`,
 * `compensation_pending` and `compensation_pending_percentage` appear in the
 * column lists so responses carry the authoritative values PostgreSQL
 * computed, and are absent from every validator so they can never be sent.
 */

const LAND_COLUMNS = `
  id, project_id, land_required_ha, land_acquired_ha, land_acquisition_percentage,
  land_parcels_total, land_parcels_acquired, affected_landowners, affected_families,
  possession_obtained, notification_date, award_date, possession_date,
  created_at, updated_at
`;

const COMPENSATION_COLUMNS = `
  id, project_id, total_compensation_required, total_compensation_paid,
  compensation_pending, compensation_pending_percentage, payment_status,
  last_updated, created_at, updated_at
`;

const LEGAL_COLUMNS = `
  id, project_id, issue_type, court_case, case_reference, status, severity,
  description, reported_date, resolved_date, created_at, updated_at
`;

const RISK_COLUMNS = `
  id, project_id, factor_type, factor_name, status, severity,
  description, reported_date, resolved_date, created_at, updated_at
`;

export interface LandAcquisitionRow {
  id: string;
  project_id: string;
  land_required_ha: string;
  land_acquired_ha: string;
  land_acquisition_percentage: string | null;
  land_parcels_total: number | null;
  land_parcels_acquired: number | null;
  affected_landowners: number | null;
  affected_families: number | null;
  possession_obtained: boolean;
  notification_date: string | null;
  award_date: string | null;
  possession_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompensationRow {
  id: string;
  project_id: string;
  total_compensation_required: string;
  total_compensation_paid: string;
  compensation_pending: string | null;
  compensation_pending_percentage: string | null;
  payment_status: string;
  last_updated: string;
  created_at: string;
  updated_at: string;
}

export interface LegalIssueRow {
  id: string;
  project_id: string;
  issue_type: string;
  court_case: boolean;
  case_reference: string | null;
  status: string;
  severity: string;
  description: string | null;
  reported_date: string;
  resolved_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiskFactorRow {
  id: string;
  project_id: string;
  factor_type: string;
  factor_name: string;
  status: string;
  severity: string;
  description: string | null;
  reported_date: string;
  resolved_date: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Land acquisition — one row per project
// ---------------------------------------------------------------------------

export async function getLandAcquisition(projectId: string): Promise<LandAcquisitionRow | null> {
  const { data, error } = await supabaseAdmin
    .from('land_acquisition')
    .select(LAND_COLUMNS)
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) throw translateDbError(error, { resource: 'Land acquisition', context: { projectId } });
  return (data as unknown as LandAcquisitionRow) ?? null;
}

export async function getLandAcquisitionOrFail(projectId: string): Promise<LandAcquisitionRow> {
  const row = await getLandAcquisition(projectId);
  if (!row) throw new NotFoundError('Land acquisition record');
  return row;
}

export async function createLandAcquisition(
  projectId: string,
  input: Record<string, unknown>,
): Promise<LandAcquisitionRow> {
  const existing = await getLandAcquisition(projectId);
  if (existing) {
    // The table has UNIQUE(project_id): one row per project. A second POST is
    // a conflict, and the caller should PATCH instead.
    throw new ConflictError(
      'A land acquisition record already exists for this project. Use PATCH to update it.',
    );
  }

  const { data, error } = await supabaseAdmin
    .from('land_acquisition')
    .insert({ ...input, project_id: projectId })
    .select(LAND_COLUMNS)
    .single();

  if (error) throw translateDbError(error, { resource: 'Land acquisition', context: { projectId } });
  return data as unknown as LandAcquisitionRow;
}

export async function updateLandAcquisition(
  projectId: string,
  input: Record<string, unknown>,
): Promise<LandAcquisitionRow> {
  const { data, error } = await supabaseAdmin
    .from('land_acquisition')
    .update(input)
    .eq('project_id', projectId)
    .select(LAND_COLUMNS)
    .maybeSingle();

  if (error) throw translateDbError(error, { resource: 'Land acquisition', context: { projectId } });
  if (!data) throw new NotFoundError('Land acquisition record');
  return data as unknown as LandAcquisitionRow;
}

// ---------------------------------------------------------------------------
// Compensation — one row per project
// ---------------------------------------------------------------------------

export async function getCompensation(projectId: string): Promise<CompensationRow | null> {
  const { data, error } = await supabaseAdmin
    .from('compensation')
    .select(COMPENSATION_COLUMNS)
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) throw translateDbError(error, { resource: 'Compensation', context: { projectId } });
  return (data as unknown as CompensationRow) ?? null;
}

export async function getCompensationOrFail(projectId: string): Promise<CompensationRow> {
  const row = await getCompensation(projectId);
  if (!row) throw new NotFoundError('Compensation record');
  return row;
}

export async function createCompensation(
  projectId: string,
  input: Record<string, unknown>,
): Promise<CompensationRow> {
  const existing = await getCompensation(projectId);
  if (existing) {
    throw new ConflictError(
      'A compensation record already exists for this project. Use PATCH to update it.',
    );
  }

  const { data, error } = await supabaseAdmin
    .from('compensation')
    .insert({ ...input, project_id: projectId })
    .select(COMPENSATION_COLUMNS)
    .single();

  if (error) throw translateDbError(error, { resource: 'Compensation', context: { projectId } });
  return data as unknown as CompensationRow;
}

export async function updateCompensation(
  projectId: string,
  input: Record<string, unknown>,
): Promise<CompensationRow> {
  const { data, error } = await supabaseAdmin
    .from('compensation')
    .update(input)
    .eq('project_id', projectId)
    .select(COMPENSATION_COLUMNS)
    .maybeSingle();

  if (error) throw translateDbError(error, { resource: 'Compensation', context: { projectId } });
  if (!data) throw new NotFoundError('Compensation record');
  return data as unknown as CompensationRow;
}

// ---------------------------------------------------------------------------
// Legal issues and risk factors — many per project, same access shape
// ---------------------------------------------------------------------------

type ChildTable = 'legal_issues' | 'risk_factors';

const COLUMNS_FOR: Record<ChildTable, string> = {
  legal_issues: LEGAL_COLUMNS,
  risk_factors: RISK_COLUMNS,
};

const RESOURCE_FOR: Record<ChildTable, string> = {
  legal_issues: 'Legal issue',
  risk_factors: 'Risk factor',
};

async function listChildren<T>(table: ChildTable, projectId: string): Promise<T[]> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(COLUMNS_FOR[table])
    .eq('project_id', projectId)
    .order('reported_date', { ascending: false });

  if (error) throw translateDbError(error, { resource: RESOURCE_FOR[table], context: { projectId } });
  return (data ?? []) as unknown as T[];
}

async function getChild<T>(table: ChildTable, projectId: string, id: string): Promise<T> {
  // Scoped by BOTH ids: a child row is only reachable through its own project.
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(COLUMNS_FOR[table])
    .eq('project_id', projectId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw translateDbError(error, { resource: RESOURCE_FOR[table], context: { projectId, id } });
  }
  if (!data) throw new NotFoundError(RESOURCE_FOR[table]);
  return data as unknown as T;
}

async function createChild<T>(
  table: ChildTable,
  projectId: string,
  input: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .insert({ ...input, project_id: projectId })
    .select(COLUMNS_FOR[table])
    .single();

  if (error) throw translateDbError(error, { resource: RESOURCE_FOR[table], context: { projectId } });
  return data as unknown as T;
}

async function updateChild<T>(
  table: ChildTable,
  projectId: string,
  id: string,
  input: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .update(input)
    .eq('project_id', projectId)
    .eq('id', id)
    .select(COLUMNS_FOR[table])
    .maybeSingle();

  if (error) {
    throw translateDbError(error, { resource: RESOURCE_FOR[table], context: { projectId, id } });
  }
  if (!data) throw new NotFoundError(RESOURCE_FOR[table]);
  return data as unknown as T;
}

async function deleteChild(table: ChildTable, projectId: string, id: string): Promise<void> {
  // Confirm existence within this project first, so deleting someone else's
  // row reports 404 rather than silently succeeding against zero rows.
  await getChild(table, projectId, id);

  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq('project_id', projectId)
    .eq('id', id);

  if (error) {
    throw translateDbError(error, { resource: RESOURCE_FOR[table], context: { projectId, id } });
  }
}

export const listLegalIssues = (projectId: string) =>
  listChildren<LegalIssueRow>('legal_issues', projectId);
export const getLegalIssue = (projectId: string, id: string) =>
  getChild<LegalIssueRow>('legal_issues', projectId, id);
export const createLegalIssue = (projectId: string, input: Record<string, unknown>) =>
  createChild<LegalIssueRow>('legal_issues', projectId, input);
export const updateLegalIssue = (projectId: string, id: string, input: Record<string, unknown>) =>
  updateChild<LegalIssueRow>('legal_issues', projectId, id, input);
export const deleteLegalIssue = (projectId: string, id: string) =>
  deleteChild('legal_issues', projectId, id);

export const listRiskFactors = (projectId: string) =>
  listChildren<RiskFactorRow>('risk_factors', projectId);
export const getRiskFactor = (projectId: string, id: string) =>
  getChild<RiskFactorRow>('risk_factors', projectId, id);
export const createRiskFactor = (projectId: string, input: Record<string, unknown>) =>
  createChild<RiskFactorRow>('risk_factors', projectId, input);
export const updateRiskFactor = (projectId: string, id: string, input: Record<string, unknown>) =>
  updateChild<RiskFactorRow>('risk_factors', projectId, id, input);
export const deleteRiskFactor = (projectId: string, id: string) =>
  deleteChild('risk_factors', projectId, id);

/** The extensible risk factor vocabulary, for populating a frontend dropdown. */
export async function listRiskFactorTypes(): Promise<
  Array<{ code: string; label: string; description: string | null }>
> {
  const { data, error } = await supabaseAdmin
    .from('risk_factor_types')
    .select('code, label, description')
    .eq('is_active', true)
    .order('code', { ascending: true });

  if (error) throw translateDbError(error, { context: { op: 'listRiskFactorTypes' } });
  return (data ?? []) as unknown as Array<{
    code: string;
    label: string;
    description: string | null;
  }>;
}
