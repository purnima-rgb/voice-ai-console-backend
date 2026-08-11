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
  console.error('[error]', err.message);

  // Multer-specific errors → meaningful 4xx instead of generic 500
  if ((err as NodeJS.ErrnoException).code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File too large (max 50 MB)', code: 'FILE_TOO_LARGE' });
    return;
  }
  if (err.message?.startsWith('Only CSV or Excel')) {
    res.status(400).json({ error: err.message, code: 'INVALID_FILE_TYPE' });
    return;
  }

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
