import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import {
  getStudentData,
  getGradeSheetData,
  getCallingData,
  listUploads,
  getStats,
  getUploadRecord,
  getUnifiedCsv,
} from '../services/storageService';
import { generateUnifiedCSV, unifiedCsvToXlsxBuffer } from '../services/csvService';
import { AGENT_MAPPING } from '../config/agentMapping';
import { University } from '../types';

const router = Router();

// GET /api/data/agent-mapping
// Reference data — agent name ↔ agent ID lookup. Accessible to all
// authenticated roles (support agents especially need this when preparing
// calling-data CSVs).
router.get(
  '/agent-mapping',
  authenticateToken,
  (_req: Request, res: Response): void => {
    res.json({ agents: AGENT_MAPPING, total: AGENT_MAPPING.length });
  }
);

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

/**
 * Common helper: load the immutable per-upload unified CSV snapshot from
 * storage, with auth + role checks. Throws an HTTP-ready error (already
 * res.json'd) and returns null when the caller should bail.
 */
async function loadUnifiedSnapshot(
  req: Request, res: Response, uploadId: string
): Promise<{ csv: string; record: NonNullable<Awaited<ReturnType<typeof getUploadRecord>>> } | null> {
  const record = await getUploadRecord(uploadId);
  if (!record) { res.status(404).json({ error: 'Upload record not found' }); return null; }
  if (record.dataType !== 'calling-data') {
    res.status(400).json({ error: 'Unified file is only generated for calling-data uploads' });
    return null;
  }
  if (req.user?.role === 'support_agent' && record.uploadedBy !== req.user.email) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  const csv = await getUnifiedCsv(uploadId);
  if (!csv) {
    res.status(404).json({ error: 'No unified file stored for this upload (was the upload rejected?)' });
    return null;
  }
  return { csv, record };
}

// GET /api/data/unified-csv/:uploadId
// Download the immutable unified CSV snapshot that was generated when a
// specific calling-data upload landed. Each calling-data upload has its own
// snapshot — they're never overwritten.
router.get(
  '/unified-csv/:uploadId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    const { uploadId } = req.params;
    try {
      const loaded = await loadUnifiedSnapshot(req, res, uploadId);
      if (!loaded) return;
      const { csv, record } = loaded;

      const safeStamp = record.uploadedAt.replace(/[:.]/g, '-');
      const safeUni   = (record.university || 'all').replace(/[^a-z0-9]/gi, '-');
      const safeProg  = (record.program    || 'all').replace(/[^a-z0-9]/gi, '-');
      const fileName  = `unified-voice-ai-${safeUni}-${safeProg}-${safeStamp}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(csv);
    } catch (err) {
      console.error('unified-csv fetch failed:', err);
      res.status(500).json({ error: 'Failed to fetch unified CSV', details: String(err) });
    }
  }
);

// GET /api/data/unified-xlsx/:uploadId
// Same snapshot, served as an .xlsx with date_of_call and time_of_call cells
// stored as proper Excel number types so the downstream Voice AI scheduler
// can compute wall-clock call times. THIS is the format that gets calls
// scheduled (vs marked 'skipped'); see calling_data (1).xlsx for the spec.
router.get(
  '/unified-xlsx/:uploadId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    const { uploadId } = req.params;
    try {
      const loaded = await loadUnifiedSnapshot(req, res, uploadId);
      if (!loaded) return;
      const { csv, record } = loaded;

      const buf = unifiedCsvToXlsxBuffer(csv);

      const safeStamp = record.uploadedAt.replace(/[:.]/g, '-');
      const safeUni   = (record.university || 'all').replace(/[^a-z0-9]/gi, '-');
      const safeProg  = (record.program    || 'all').replace(/[^a-z0-9]/gi, '-');
      const fileName  = `unified-voice-ai-${safeUni}-${safeProg}-${safeStamp}.xlsx`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buf);
    } catch (err) {
      console.error('unified-xlsx fetch failed:', err);
      res.status(500).json({ error: 'Failed to fetch unified XLSX', details: String(err) });
    }
  }
);

// GET /api/data/unified-csv
// Legacy aggregate endpoint — generates an on-the-fly unified CSV using
// ALL current student-list + calling-data + grade-sheet rows in the system.
// Useful as a "full export" but the per-upload route above is the canonical
// way to fetch the immutable snapshot tied to a given calling-data upload.
router.get(
  '/unified-csv',
  authenticateToken,
  requireRole('system_admin', 'data_manager'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [studentData, callingData, gradeData] = await Promise.all([
        getStudentData(),
        getCallingData(),
        getGradeSheetData(),
      ]);

      const csvContent = generateUnifiedCSV(studentData, callingData, gradeData);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="unified-voice-ai-all-${timestamp}.csv"`
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
