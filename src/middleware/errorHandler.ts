import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  status?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log err.message only — never log err.stack in case it surfaces PII
  // from a failed DB query or CSV parse exception.
  console.error('[error]', err.message);

  const status = err.status || 500;

  res.status(status).json({
    error: status >= 500 ? 'An internal error occurred' : (err.message || 'Request failed'),
    code: err.code || 'INTERNAL_ERROR',
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND',
  });
}
