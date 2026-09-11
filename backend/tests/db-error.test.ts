/**
 * db-error.test.ts — SQLSTATE to HTTP mapping.
 *
 * The status code has to reflect what the caller can do about the failure.
 * Getting this wrong is quietly expensive: a client error reported as 503
 * tells operators there is an outage and tells the client to retry something
 * that can never succeed.
 */
import { describe, it, expect, vi } from 'vitest';
import { translateDbError } from '../src/utils/db-error';

// The translator logs full detail for operators; silence it here.
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('malformed client input maps to 400', () => {
  it.each([
    ['22P02 invalid text representation (bad UUID)', '22P02'],
    ['22007 invalid datetime format', '22007'],
    ['22003 numeric value out of range', '22003'],
  ])('%s -> 400', (_label, code) => {
    // Regression: these previously fell through to the default branch and were
    // reported as 503 "database unavailable".
    const err = translateDbError({ code, message: 'invalid input syntax for type uuid' });
    expect(err.statusCode).toBe(400);
  });

  it('does not echo the raw database message', () => {
    const err = translateDbError({
      code: '22P02',
      message: 'invalid input syntax for type uuid: "not-a-uuid"',
    });
    expect(err.message).not.toContain('not-a-uuid');
    expect(err.message).not.toContain('invalid input syntax');
  });
});

describe('genuine failures keep their codes', () => {
  it.each([
    ['23505 unique violation', '23505', 409],
    ['23503 foreign key violation', '23503', 422],
    ['23514 check violation', '23514', 422],
    ['23502 not null violation', '23502', 422],
    ['428C9 generated column write', '428C9', 422],
    ['42501 insufficient privilege', '42501', 403],
    ['PGRST116 no rows', 'PGRST116', 404],
    ['42P01 undefined table', '42P01', 503],
  ])('%s -> %i', (_label, code, expected) => {
    expect(translateDbError({ code, message: 'x' }).statusCode).toBe(expected);
  });

  it('treats an unknown code as a dependency failure, not a client error', () => {
    // Conservative on purpose: an unrecognised database fault is not something
    // the caller can fix by changing their request.
    expect(translateDbError({ code: '99999', message: 'x' }).statusCode).toBe(503);
  });

  it('treats a connectivity failure with no code as 503', () => {
    expect(translateDbError({ message: 'fetch failed' }).statusCode).toBe(503);
  });
});

describe('constraint names become readable sentences', () => {
  it('explains a known constraint', () => {
    const err = translateDbError({
      code: '23514',
      message: 'new row violates check constraint "land_acquired_not_over_required"',
    });
    expect(err.message).toBe('Land acquired cannot exceed land required.');
  });

  it('falls back to a generic sentence for an unmapped constraint', () => {
    const err = translateDbError({
      code: '23514',
      message: 'new row violates check constraint "some_future_constraint"',
    });
    expect(err.message).toBe('The request violates a data integrity rule.');
    expect(err.message).not.toContain('some_future_constraint');
  });
});
