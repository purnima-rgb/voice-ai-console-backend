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

const router = Router();

// GET /api/data/student-list
router.get(
  '/student-list',
  authenticateToken,
  requireRole('system_admin', 'data_manager'),
  (req: Request, res: Response): void => {
    const { university, program } = req.query;
    const data = getStudentData(
      university as string | undefined,
      program as string | undefined
    );
    res.json({ data, total: data.length });
  }
);

// GET /api/data/grade-sheet
router.get(
  '/grade-sheet',
  authenticateToken,
  requireRole('system_admin', 'data_manager'),
  (req: Request, res: Response): void => {
    const { university, program } = req.query;
    const data = getGradeSheetData(
      university as string | undefined,
      program as string | undefined
    );
    res.json({ data, total: data.length });
  }
);

// GET /api/data/calling-data
router.get(
  '/calling-data',
  authenticateToken,
  requireRole('system_admin', 'data_manager', 'support_agent'),
  (_req: Request, res: Response): void => {
    const data = getCallingData();
    res.json({ data, total: data.length });
  }
);

// GET /api/data/unified-csv
router.get(
  '/unified-csv',
  authenticateToken,
  requireRole('system_admin', 'data_manager'),
  (_req: Request, res: Response): void => {
    const studentData = getStudentData();
    const callingData = getCallingData();

    const csvContent = generateUnifiedCSV(studentData, callingData);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="unified-voice-ai-${timestamp}.csv"`
    );
    res.send(csvContent);
  }
);

// GET /api/data/upload-history
router.get(
  '/upload-history',
  authenticateToken,
  (req: Request, res: Response): void => {
    const { dataType, university, program } = req.query;

    // Support agents can only see calling-data uploads
    let effectiveDataType = dataType as string | undefined;
    if (req.user?.role === 'support_agent') {
      effectiveDataType = 'calling-data';
    }

    const uploads = listUploads({
      dataType: effectiveDataType as 'student-list' | 'grade-sheet' | 'calling-data' | undefined,
      university: university as 'GGU' | 'Edgewood' | 'Rushford' | 'ESGCI' | undefined,
      program: program as string | undefined,
    });

    res.json({ uploads, total: uploads.length });
  }
);

// GET /api/data/stats
router.get(
  '/stats',
  authenticateToken,
  (_req: Request, res: Response): void => {
    const stats = getStats();
    res.json(stats);
  }
);

export default router;
