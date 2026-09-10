/**
 * Integration-test harness: a real Express app, real middleware, real routing,
 * real validation — with the Supabase client swapped for the in-memory fake.
 *
 * Requests go in as HTTP and come back as HTTP, so what is exercised is the
 * whole chain a frontend will actually hit: requireAuth, requireProjectAccess,
 * Zod validation, controller, service, error middleware. Calling a controller
 * directly would skip precisely the wiring most likely to be wrong.
 */
import jwt from 'jsonwebtoken';
import { supabaseMock } from './supabase-mock';
import type { AppRole } from '../../src/config/roles';

export const SECRET = 'test-jwt-secret-not-a-real-key';

export const USERS = {
  admin: '11111111-1111-4111-8111-111111111111',
  officer: '22222222-2222-4222-8222-222222222222',
  officer2: '33333333-3333-4333-8333-333333333333',
  analyst: '44444444-4444-4444-8444-444444444444',
  viewer: '55555555-5555-4555-8555-555555555555',
} as const;

export const PROJECTS = {
  assigned: 'aaaaaaaa-0000-4000-8000-000000000001',
  unassigned: 'aaaaaaaa-0000-4000-8000-000000000002',
  missing: 'aaaaaaaa-0000-4000-8000-0000000000ff',
} as const;

/**
 * Mint a token for a user.
 *
 * A `role` claim is included on purpose, and always the WRONG one relative to
 * the profile, so any test that passes is proving the API read the role from
 * the database rather than the token.
 */
export function tokenFor(userId: string, claimedRole = 'ADMIN'): string {
  return jwt.sign(
    {
      sub: userId,
      aud: 'authenticated',
      email: `${userId}@example.invalid`,
      user_metadata: { role: claimedRole },
    },
    SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

export const authHeader = (userId: string, claimedRole?: string): [string, string] => [
  'Authorization',
  `Bearer ${tokenFor(userId, claimedRole)}`,
];

/** Standard fixture: five users, two projects, the officer assigned to one. */
export function seedStandardFixture(): void {
  supabaseMock.reset();

  supabaseMock.setTable('profiles', [
    { id: USERS.admin, role: 'ADMIN', full_name: 'Admin' },
    { id: USERS.officer, role: 'OFFICER', full_name: 'Officer' },
    { id: USERS.officer2, role: 'OFFICER', full_name: 'Officer Two' },
    { id: USERS.analyst, role: 'ANALYST', full_name: 'Analyst' },
    { id: USERS.viewer, role: 'VIEWER', full_name: 'Viewer' },
  ]);

  supabaseMock.setTable('projects', [
    {
      id: PROJECTS.assigned,
      project_name: 'Assigned Project',
      project_code: 'TEST-A',
      state: 'Maharashtra',
      district: 'North',
      sector: 'ROAD',
      implementing_agency: 'Agency A',
      planned_start_date: '2024-01-01',
      planned_completion_date: '2026-01-01',
      actual_start_date: null,
      actual_completion_date: null,
      project_status: 'ACTIVE',
      latitude: null,
      longitude: null,
      created_by: USERS.admin,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    {
      id: PROJECTS.unassigned,
      project_name: 'Unassigned Project',
      project_code: 'TEST-B',
      state: 'Gujarat',
      district: 'South',
      sector: 'RAILWAY',
      implementing_agency: 'Agency B',
      planned_start_date: '2024-02-01',
      planned_completion_date: '2026-02-01',
      actual_start_date: null,
      actual_completion_date: null,
      project_status: 'PLANNED',
      latitude: null,
      longitude: null,
      created_by: USERS.admin,
      created_at: '2024-02-01T00:00:00Z',
      updated_at: '2024-02-01T00:00:00Z',
    },
  ]);

  supabaseMock.setTable('project_assignments', [
    { id: 'assign-1', user_id: USERS.officer, project_id: PROJECTS.assigned },
  ]);

  supabaseMock.setTable('land_acquisition', []);
  supabaseMock.setTable('compensation', []);
  supabaseMock.setTable('legal_issues', []);
  supabaseMock.setTable('risk_factors', []);
  supabaseMock.setTable('project_feature_snapshots', []);
  supabaseMock.setTable('risk_factor_types', [
    { code: 'ROW_ISSUE', label: 'Right of Way Issue', description: null, is_active: true },
    { code: 'ENCROACHMENT', label: 'Encroachment', description: null, is_active: true },
    { code: 'R_AND_R_PENDING', label: 'R&R Pending', description: null, is_active: true },
  ]);

  // Mirror the database's generated columns so tests can prove the API returns
  // the DATABASE's computed value, not the client's arithmetic.
  supabaseMock.setGeneratedColumn('land_acquisition', 'land_acquisition_percentage', (row) => {
    const required = Number(row.land_required_ha ?? 0);
    const acquired = Number(row.land_acquired_ha ?? 0);
    return required > 0 ? ((acquired / required) * 100).toFixed(4) : '0.0000';
  });
  supabaseMock.setGeneratedColumn('compensation', 'compensation_pending', (row) => {
    const required = Number(row.total_compensation_required ?? 0);
    const paid = Number(row.total_compensation_paid ?? 0);
    return (required - paid).toFixed(2);
  });
  supabaseMock.setGeneratedColumn('compensation', 'compensation_pending_percentage', (row) => {
    const required = Number(row.total_compensation_required ?? 0);
    const paid = Number(row.total_compensation_paid ?? 0);
    return required > 0 ? (((required - paid) / required) * 100).toFixed(4) : '0.0000';
  });
}

/** Add a valid land acquisition record to the assigned project. */
export function seedLandAcquisition(projectId: string = PROJECTS.assigned): void {
  supabaseMock.setTable('land_acquisition', [
    {
      id: 'land-1',
      project_id: projectId,
      land_required_ha: '100.0000',
      land_acquired_ha: '40.0000',
      land_acquisition_percentage: '40.0000',
      land_parcels_total: 200,
      land_parcels_acquired: 80,
      affected_landowners: 500,
      affected_families: 450,
      possession_obtained: false,
      notification_date: '2024-02-01',
      award_date: null,
      possession_date: null,
      created_at: '2024-02-01T00:00:00Z',
      updated_at: '2024-02-01T00:00:00Z',
    },
  ]);
}

export function seedCompensation(projectId: string = PROJECTS.assigned): void {
  supabaseMock.setTable('compensation', [
    {
      id: 'comp-1',
      project_id: projectId,
      total_compensation_required: '1000000.00',
      total_compensation_paid: '250000.00',
      compensation_pending: '750000.00',
      compensation_pending_percentage: '75.0000',
      payment_status: 'IN_PROGRESS',
      last_updated: '2024-02-01T00:00:00Z',
      created_at: '2024-02-01T00:00:00Z',
      updated_at: '2024-02-01T00:00:00Z',
    },
  ]);
}

export type { AppRole };
