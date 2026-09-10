import { z } from 'zod';
import {
  PROJECT_STATUSES,
  isoDate,
  paginationQuery,
  shortText,
} from './common.validator';

/**
 * Project write and query schemas.
 *
 * Fields the client must never set are simply absent from these schemas, and
 * `.strict()` turns "absent" into "rejected":
 *
 *   id, created_at, updated_at   database-generated
 *   created_by                   taken from the authenticated caller, never
 *                                the request body — otherwise a caller could
 *                                attribute a project to someone else and,
 *                                because authorship grants project access,
 *                                hand that person access
 */

const coordinate = (label: string, bound: number) =>
  z
    .number()
    .min(-bound, `${label} must be between -${bound} and ${bound}`)
    .max(bound, `${label} must be between -${bound} and ${bound}`);

const projectFields = {
  project_name: shortText('Project name'),
  project_code: z
    .string()
    .trim()
    .min(1, 'Project code is required')
    .max(60, 'Project code is too long')
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
      'Project code may contain letters, digits, dot, underscore, hyphen and slash',
    ),
  state: shortText('State', 100),
  district: shortText('District', 100),
  sector: shortText('Sector', 100),
  implementing_agency: shortText('Implementing agency', 200),
  planned_start_date: isoDate('Planned start date'),
  planned_completion_date: isoDate('Planned completion date'),
  actual_start_date: isoDate('Actual start date'),
  actual_completion_date: isoDate('Actual completion date'),
  project_status: z.enum(PROJECT_STATUSES),
  latitude: coordinate('Latitude', 90),
  longitude: coordinate('Longitude', 180),
};

/**
 * Date ordering, checked here as well as in the database.
 *
 * The database CHECK is the real guarantee; this exists so the caller gets a
 * precise field-level message instead of a translated constraint name.
 */
function checkDateOrder(
  value: {
    planned_start_date?: string | null;
    planned_completion_date?: string | null;
    actual_start_date?: string | null;
    actual_completion_date?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    value.planned_start_date &&
    value.planned_completion_date &&
    value.planned_completion_date < value.planned_start_date
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['planned_completion_date'],
      message: 'Planned completion date cannot be earlier than the planned start date',
    });
  }

  if (
    value.actual_start_date &&
    value.actual_completion_date &&
    value.actual_completion_date < value.actual_start_date
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['actual_completion_date'],
      message: 'Actual completion date cannot be earlier than the actual start date',
    });
  }
}

export const createProjectSchema = z
  .object({
    project_name: projectFields.project_name,
    project_code: projectFields.project_code,
    state: projectFields.state,
    district: projectFields.district,
    sector: projectFields.sector,
    implementing_agency: projectFields.implementing_agency,
    planned_start_date: projectFields.planned_start_date.optional(),
    planned_completion_date: projectFields.planned_completion_date.optional(),
    actual_start_date: projectFields.actual_start_date.optional(),
    actual_completion_date: projectFields.actual_completion_date.optional(),
    project_status: projectFields.project_status.default('PLANNED'),
    latitude: projectFields.latitude.optional(),
    longitude: projectFields.longitude.optional(),
  })
  .strict()
  .superRefine(checkDateOrder);

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Update accepts any subset, but not an empty body — an empty PATCH is almost
 * always a client bug, and answering 200 would hide it.
 */
export const updateProjectSchema = z
  .object({
    project_name: projectFields.project_name.optional(),
    project_code: projectFields.project_code.optional(),
    state: projectFields.state.optional(),
    district: projectFields.district.optional(),
    sector: projectFields.sector.optional(),
    implementing_agency: projectFields.implementing_agency.optional(),
    planned_start_date: projectFields.planned_start_date.nullable().optional(),
    planned_completion_date: projectFields.planned_completion_date.nullable().optional(),
    actual_start_date: projectFields.actual_start_date.nullable().optional(),
    actual_completion_date: projectFields.actual_completion_date.nullable().optional(),
    project_status: projectFields.project_status.optional(),
    latitude: projectFields.latitude.nullable().optional(),
    longitude: projectFields.longitude.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  })
  .superRefine(checkDateOrder);

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** Filters, restricted to columns that exist and are indexed. */
export const listProjectsQuery = paginationQuery
  .extend({
    state: z.string().trim().min(1).max(100).optional(),
    district: z.string().trim().min(1).max(100).optional(),
    sector: z.string().trim().min(1).max(100).optional(),
    implementing_agency: z.string().trim().min(1).max(200).optional(),
    project_status: z.enum(PROJECT_STATUSES).optional(),
    /** Case-insensitive partial match on name or code. */
    search: z.string().trim().min(1).max(200).optional(),
    sort: z.enum(['created_at', 'updated_at', 'project_name', 'project_code']).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export type ListProjectsQuery = z.infer<typeof listProjectsQuery>;

export const projectIdParams = z.object({ projectId: z.string().uuid('Must be a valid UUID') });
