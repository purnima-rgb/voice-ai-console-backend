import express, { Express } from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import dataRoutes from './routes/data';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// CORS origins — allow local dev + any deployed frontend whose URL is set via
// the FRONTEND_URL env var (e.g. https://voice-ai-console-frontend.vercel.app).
// Vercel preview URLs are also allowed via the vercel.app suffix check.
const allowedOrigins: (string | RegExp)[] = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  /\.vercel\.app$/,
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

export function createApp(): Express {
  const app = express();

  // Ensure required directories exist (skipped on serverless read-only FS)
  try {
    const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
    const DATA_DIR = path.join(process.cwd(), 'data');
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    // On Vercel the filesystem is read-only outside /tmp — silently skip
    console.warn('Could not create local dirs (read-only FS?):', err);
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (curl, Postman, server-to-server)
        if (!origin) return callback(null, true);
        const allowed = allowedOrigins.some((rule) =>
          typeof rule === 'string' ? rule === origin : rule.test(origin)
        );
        if (allowed) return callback(null, true);
        return callback(new Error(`CORS: Origin ${origin} not allowed`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      env: process.env.NODE_ENV || 'development',
    });
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/data', dataRoutes);

  // Error handling — must be last
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
