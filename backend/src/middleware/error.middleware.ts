import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Must have 4 parameters so Express recognises it as an error handler
export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    const { fieldErrors, formErrors } = err.flatten();

    // Unknown-key rejections from `.strict()` are FORM errors, not field
    // errors, so `fieldErrors` alone is empty for them. Reporting only that
    // gives the caller a bare "Validation failed" with no clue which key was
    // refused — which is exactly the case when someone tries to write a
    // generated column such as land_acquisition_percentage.
    const unrecognized = err.issues
      .filter((i) => i.code === 'unrecognized_keys')
      .flatMap((i) => (i as unknown as { keys: string[] }).keys);

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: {
        ...fieldErrors,
        ...(formErrors.length > 0 && { _errors: formErrors }),
        ...(unrecognized.length > 0 && {
          unrecognized_fields: unrecognized,
          _hint:
            'These fields are not accepted. Values such as land_acquisition_percentage, ' +
            'compensation_pending and compensation_pending_percentage are calculated by the ' +
            'database and cannot be supplied.',
        }),
      },
    });
    return;
  }

  // Known application errors
  if (err instanceof AppError) {
    // Some errors carry structured detail the client can act on — the
    // blocking issues that stopped a snapshot, for instance. It is attached
    // deliberately by the thrower and is never raw database output.
    const details = (err as AppError & { details?: unknown }).details;
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(details !== undefined && { details }),
    });
    return;
  }

  // Unknown errors — hide internals in production
  console.error('[Unhandled Error]', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    ...(env.NODE_ENV === 'development' && { details: err.message }),
  });
}
