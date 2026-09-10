import { z } from 'zod';
import {
  ISSUE_STATUSES,
  LEGAL_ISSUE_TYPES,
  PAYMENT_STATUSES,
  SEVERITIES,
  decimalString,
  isoDate,
  longText,
  nonNegativeInt,
  shortText,
} from './common.validator';

/**
 * Write schemas for the project-owned tables.
 *
 * ###########################################################################
 * # GENERATED COLUMNS ARE ABSENT FROM EVERY SCHEMA IN THIS FILE.            #
 * #                                                                        #
 * #   land_acquisition.land_acquisition_percentage                         #
 * #   compensation.compensation_pending                                    #
 * #   compensation.compensation_pending_percentage                         #
 * #                                                                        #
 * # PostgreSQL computes all three on write. Combined with `.strict()`, a    #
 * # request that tries to supply one is rejected at validation with a       #
 * # field-level message, rather than reaching the database and coming back  #
 * # as SQLSTATE 428C9. The database remains the real guarantee — this is    #
 * # the layer that makes the refusal legible.                              #
 * #                                                                        #
 * # Clients send source values only. Derived values are read back from the  #
 * # database and returned in the response.                                  #
 * ###########################################################################
 */

// ---------------------------------------------------------------------------
// Land acquisition
// ---------------------------------------------------------------------------

const landFields = {
  land_required_ha: decimalString('Land required (ha)', { allowZero: false }),
  land_acquired_ha: decimalString('Land acquired (ha)'),
  land_parcels_total: nonNegativeInt('Total land parcels'),
  land_parcels_acquired: nonNegativeInt('Acquired land parcels'),
  affected_landowners: nonNegativeInt('Affected landowners'),
  affected_families: nonNegativeInt('Affected families'),
  possession_obtained: z.boolean(),
  notification_date: isoDate('Notification date'),
  award_date: isoDate('Award date'),
  possession_date: isoDate('Possession date'),
};

/**
 * Cross-field rules mirroring the table's CHECK constraints, so the caller
 * gets a field-level message instead of a translated constraint name.
 *
 * Comparisons on decimal strings go through Number() only for the comparison
 * itself. That is safe — an ordering test does not accumulate error the way a
 * sum would — and the stored value is still the untouched string.
 */
function checkLandConsistency(
  v: {
    // Nullable variants are accepted because the same rules serve both the
    // create schema (fields optional) and the update schema (fields also
    // nullable, since clearing a value is a legitimate edit).
    land_required_ha?: string | null;
    land_acquired_ha?: string | null;
    land_parcels_total?: number | null;
    land_parcels_acquired?: number | null;
    notification_date?: string | null;
    award_date?: string | null;
    possession_date?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    v.land_required_ha != null &&
    v.land_acquired_ha != null &&
    Number(v.land_acquired_ha) > Number(v.land_required_ha)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['land_acquired_ha'],
      message: 'Land acquired cannot exceed land required',
    });
  }

  if (
    v.land_parcels_total != null &&
    v.land_parcels_acquired != null &&
    v.land_parcels_acquired > v.land_parcels_total
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['land_parcels_acquired'],
      message: 'Acquired parcels cannot exceed total parcels',
    });
  }

  // Statutory sequence: notification -> award -> possession.
  if (v.notification_date && v.award_date && v.award_date < v.notification_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['award_date'],
      message: 'Award date cannot be earlier than the notification date',
    });
  }
  if (v.award_date && v.possession_date && v.possession_date < v.award_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['possession_date'],
      message: 'Possession date cannot be earlier than the award date',
    });
  }
}

export const upsertLandAcquisitionSchema = z
  .object({
    land_required_ha: landFields.land_required_ha,
    land_acquired_ha: landFields.land_acquired_ha.default('0'),
    land_parcels_total: landFields.land_parcels_total.optional(),
    land_parcels_acquired: landFields.land_parcels_acquired.optional(),
    affected_landowners: landFields.affected_landowners.optional(),
    affected_families: landFields.affected_families.optional(),
    possession_obtained: landFields.possession_obtained.default(false),
    notification_date: landFields.notification_date.optional(),
    award_date: landFields.award_date.optional(),
    possession_date: landFields.possession_date.optional(),
  })
  .strict()
  .superRefine(checkLandConsistency);

export type UpsertLandAcquisitionInput = z.infer<typeof upsertLandAcquisitionSchema>;

export const updateLandAcquisitionSchema = z
  .object({
    land_required_ha: landFields.land_required_ha.optional(),
    land_acquired_ha: landFields.land_acquired_ha.optional(),
    land_parcels_total: landFields.land_parcels_total.nullable().optional(),
    land_parcels_acquired: landFields.land_parcels_acquired.nullable().optional(),
    affected_landowners: landFields.affected_landowners.nullable().optional(),
    affected_families: landFields.affected_families.nullable().optional(),
    possession_obtained: landFields.possession_obtained.optional(),
    notification_date: landFields.notification_date.nullable().optional(),
    award_date: landFields.award_date.nullable().optional(),
    possession_date: landFields.possession_date.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' })
  .superRefine(checkLandConsistency);

export type UpdateLandAcquisitionInput = z.infer<typeof updateLandAcquisitionSchema>;

// ---------------------------------------------------------------------------
// Compensation
// ---------------------------------------------------------------------------

function checkCompensationConsistency(
  v: { total_compensation_required?: string | null; total_compensation_paid?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (
    v.total_compensation_required != null &&
    v.total_compensation_paid != null &&
    Number(v.total_compensation_paid) > Number(v.total_compensation_required)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['total_compensation_paid'],
      message: 'Compensation paid cannot exceed compensation required',
    });
  }
}

export const upsertCompensationSchema = z
  .object({
    total_compensation_required: decimalString('Total compensation required').default('0'),
    total_compensation_paid: decimalString('Total compensation paid').default('0'),
    payment_status: z.enum(PAYMENT_STATUSES).default('NOT_STARTED'),
  })
  .strict()
  .superRefine(checkCompensationConsistency);

export type UpsertCompensationInput = z.infer<typeof upsertCompensationSchema>;

export const updateCompensationSchema = z
  .object({
    total_compensation_required: decimalString('Total compensation required').optional(),
    total_compensation_paid: decimalString('Total compensation paid').optional(),
    payment_status: z.enum(PAYMENT_STATUSES).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' })
  .superRefine(checkCompensationConsistency);

export type UpdateCompensationInput = z.infer<typeof updateCompensationSchema>;

// ---------------------------------------------------------------------------
// Legal issues
// ---------------------------------------------------------------------------

function checkLegalConsistency(
  v: {
    court_case?: boolean | null;
    case_reference?: string | null;
    reported_date?: string | null;
    resolved_date?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  // A case reference only means something for an actual court case.
  if (v.case_reference && v.court_case === false) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['case_reference'],
      message: 'A case reference can only be recorded when court_case is true',
    });
  }
  if (v.reported_date && v.resolved_date && v.resolved_date < v.reported_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resolved_date'],
      message: 'Resolved date cannot be earlier than the reported date',
    });
  }
}

export const createLegalIssueSchema = z
  .object({
    issue_type: z.enum(LEGAL_ISSUE_TYPES),
    court_case: z.boolean().default(false),
    case_reference: shortText('Case reference', 120).optional(),
    status: z.enum(ISSUE_STATUSES).default('OPEN'),
    severity: z.enum(SEVERITIES),
    description: longText('Description').optional(),
    reported_date: isoDate('Reported date').optional(),
    resolved_date: isoDate('Resolved date').optional(),
  })
  .strict()
  .superRefine(checkLegalConsistency);

export type CreateLegalIssueInput = z.infer<typeof createLegalIssueSchema>;

export const updateLegalIssueSchema = z
  .object({
    issue_type: z.enum(LEGAL_ISSUE_TYPES).optional(),
    court_case: z.boolean().optional(),
    case_reference: shortText('Case reference', 120).nullable().optional(),
    status: z.enum(ISSUE_STATUSES).optional(),
    severity: z.enum(SEVERITIES).optional(),
    description: longText('Description').nullable().optional(),
    reported_date: isoDate('Reported date').optional(),
    resolved_date: isoDate('Resolved date').nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' })
  .superRefine(checkLegalConsistency);

export type UpdateLegalIssueInput = z.infer<typeof updateLegalIssueSchema>;

// ---------------------------------------------------------------------------
// Risk factors
// ---------------------------------------------------------------------------

/**
 * `factor_type` is validated as a shape, not against a hard-coded list.
 *
 * The database keeps the vocabulary in `risk_factor_types` specifically so a
 * new factor is an INSERT rather than a schema migration. Freezing the list in
 * a Zod enum here would defeat that: adding a code to the table would leave the
 * API rejecting it. The foreign key is the authority, and an unknown code comes
 * back as a 422 naming the reference endpoint.
 */
const factorTypeCode = z
  .string()
  .trim()
  .min(1, 'Factor type is required')
  .max(60)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Factor type must be an uppercase code, e.g. ROW_ISSUE');

function checkRiskConsistency(
  v: { reported_date?: string | null; resolved_date?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (v.reported_date && v.resolved_date && v.resolved_date < v.reported_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resolved_date'],
      message: 'Resolved date cannot be earlier than the reported date',
    });
  }
}

export const createRiskFactorSchema = z
  .object({
    factor_type: factorTypeCode,
    factor_name: shortText('Factor name', 200),
    status: z.enum(ISSUE_STATUSES).default('OPEN'),
    severity: z.enum(SEVERITIES),
    description: longText('Description').optional(),
    reported_date: isoDate('Reported date').optional(),
    resolved_date: isoDate('Resolved date').optional(),
  })
  .strict()
  .superRefine(checkRiskConsistency);

export type CreateRiskFactorInput = z.infer<typeof createRiskFactorSchema>;

export const updateRiskFactorSchema = z
  .object({
    factor_type: factorTypeCode.optional(),
    factor_name: shortText('Factor name', 200).optional(),
    status: z.enum(ISSUE_STATUSES).optional(),
    severity: z.enum(SEVERITIES).optional(),
    description: longText('Description').nullable().optional(),
    reported_date: isoDate('Reported date').optional(),
    resolved_date: isoDate('Resolved date').nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' })
  .superRefine(checkRiskConsistency);

export type UpdateRiskFactorInput = z.infer<typeof updateRiskFactorSchema>;

/** Path params for a child resource addressed by its own id. */
export const childIdParams = z
  .object({
    projectId: z.string().uuid('Must be a valid UUID'),
    id: z.string().uuid('Must be a valid UUID'),
  })
  .strict();
