import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import {
  getStudentData,
  getGradeSheetData,
  getCallingData,
  listUploads,
  getStats,
} from '../services/storageService';
import { generateUnifiedCSV } from '../services/csvService';
import { University } from '../types';

const router = Router();

// GET /api/data/student-list
router.get(
  '/student-list',
  authenticateToken,
  requireRole('system_admin', 'data_manager'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { university, program } = req.query;
      const data = await getStudentData(
        university as string | undefined,
        program as string | undefined
      );
      res.json({ data, total: data.length });
    } catch (err) {
      console.error('student-list fetch failed:', err);
      res.status(500).json({ error: 'Failed to fetch student list', details: String(err) });
    }
  }
);

// GET /api/data/grade-sheet
router.get(
  '/grade-sheet',
  authenticateToken,
  requireRole('system_admin', 'data_manager'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { university, program } = req.query;
      const data = await getGradeSheetData(
        university as string | undefined,
        program as string | undefined
      );
      res.json({ data, total: data.length });
    } catch (err) {
      console.error('grade-sheet fetch failed:', err);
      res.status(500).json({ error: 'Failed to fetch grade sheet', details: String(err) });
    }
  }
);

// GET /api/data/calling-data
router.get(
  '/calling-data',
  authenticateToken,
  requireRole('system_admin', 'data_manager', 'support_agent'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await getCallingData();
      res.json({ data, total: data.length });
    } catch (err) {
      console.error('calling-data fetch failed:', err);
      res.status(500).json({ error: 'Failed to fetch calling data', details: String(err) });
    }
  }
);

// GET /api/data/unified-csv
router.get(
  '/unified-csv',
  authenticateToken,
  requireRole('system_admin', 'data_manager'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [studentData, callingData] = await Promise.all([
        getStudentData(),
        getCallingData(),
      ]);

      const csvContent = generateUnifiedCSV(studentData, callingData);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="unified-voice-ai-${timestamp}.csv"`
      );
      res.send(csvContent);
    } catch (err) {
      console.error('unified-csv generation failed:', err);
      res.status(500).json({ error: 'Failed to generate unified CSV', details: String(err) });
    }
  }
);

// GET /api/data/upload-history
router.get(
  '/upload-history',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dataType, university, program } = req.query;

      // Support agents can only see calling-data uploads
      let effectiveDataType = dataType as string | undefined;
      if (req.user?.role === 'support_agent') {
        effectiveDataType = 'calling-data';
      }

      const uploads = await listUploads({
        dataType: effectiveDataType as 'student-list' | 'grade-sheet' | 'calling-data' | undefined,
        university: university as University | undefined,
        program: program as string | undefined,
      });

      res.json({ uploads, total: uploads.length });
    } catch (err) {
      console.error('upload-history fetch failed:', err);
      res.status(500).json({ error: 'Failed to fetch upload history', details: String(err) });
    }
  }
);

// GET /api/data/stats
router.get(
  '/stats',
  authenticateToken,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const stats = await getStats();
      res.json(stats);
    } catch (err) {
      console.error('stats fetch failed:', err);
      res.status(500).json({ error: 'Failed to fetch stats', details: String(err) });
    }
  }
);

export default router;
