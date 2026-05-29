import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireRole } from '../middleware/auth';
import {
  parseRowsFromBuffer,
  parseGradesheetFromBuffer,
  generateErrorReport,
} from '../services/csvService';
import { validateStudentList, validateGradeSheet, validateCallingData } from '../services/validationService';
import { saveUploadRecord, getUploadRecord, getUploadErrors } from '../services/storageService';
import { MANDATORY_COLUMNS } from '../config/constants';
import { University } from '../types';

const router = Router();

// Memory storage — works on Vercel's read-only filesystem.
// Files stay in req.file.buffer; we forward the buffer to Supabase as
// base64 so the original raw input is preserved exactly.
const storage = multer.memoryStorage();

// Accept both CSV and Excel (.xlsx / .xls)
const ACCEPTED_MIME = new Set([
  'text/csv',
  'application/vnd.ms-excel',                                                // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
  'application/octet-stream',                                                // fallback some browsers use
]);
const ACCEPTED_EXT_RE = /\.(csv|xlsx|xls)$/i;

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  if (ACCEPTED_MIME.has(file.mimetype) || ACCEPTED_EXT_RE.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV or Excel (.xlsx / .xls) files are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// POST /api/upload/student-list
router.post(
  '/student-list',
  authenticateToken,
  requireRole('system_admin', 'data_manager'),
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const { university, program } = req.body;
    if (!university || !program) {
      res.status(400).json({ error: 'University and program are required' });
      return;
    }

    try {
      const rows = parseRowsFromBuffer(req.file.buffer, req.file.originalname);
      const { valid, errors } = validateStudentList(rows, MANDATORY_COLUMNS['student-list']);

      const uploadId = uuidv4();
      const now = new Date().toISOString();

      await saveUploadRecord({
        uploadId,
        metadata: {
          fileName: req.file.originalname,
          dataType: 'student-list',
          university: university as University,
          program,
          uploadedAt: now,
          uploadedBy: req.user!.email,
          totalRows: rows.length,
          validRows: valid.length,
          errorRows: errors.length,
          status: errors.length === 0 ? 'success' : valid.length > 0 ? 'partial' : 'failed',
        },
        data: valid,
        errors,
        rawFile: { buffer: req.file.buffer, originalName: req.file.originalname },
      });

      res.json({
        uploadId,
        totalRows: rows.length,
        validRows: valid.length,
        errorRows: errors.length,
        errors: errors.slice(0, 100), // first 100 errors
        data: valid.slice(0, 50),     // first 50 rows for preview
      });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Failed to process file', details: String(err) });
    }
  }
);

// POST /api/upload/grade-sheet
router.post(
  '/grade-sheet',
  authenticateToken,
  requireRole('system_admin', 'data_manager'),
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const { university, program } = req.body;
    if (!university || !program) {
      res.status(400).json({ error: 'University and program are required' });
      return;
    }

    try {
      // Grade sheets use a multi-row header format — use the dedicated parser
      const rows = parseGradesheetFromBuffer(req.file.buffer, req.file.originalname);
      const { valid, errors } = validateGradeSheet(rows, MANDATORY_COLUMNS['grade-sheet']);

      const uploadId = uuidv4();
      const now = new Date().toISOString();

      await saveUploadRecord({
        uploadId,
        metadata: {
          fileName: req.file.originalname,
          dataType: 'grade-sheet',
          university: university as University,
          program,
          uploadedAt: now,
          uploadedBy: req.user!.email,
          totalRows: rows.length,
          validRows: valid.length,
          errorRows: errors.length,
          status: errors.length === 0 ? 'success' : valid.length > 0 ? 'partial' : 'failed',
        },
        data: valid,
        errors,
        rawFile: { buffer: req.file.buffer, originalName: req.file.originalname },
      });

      res.json({
        uploadId,
        totalRows: rows.length,
        validRows: valid.length,
        errorRows: errors.length,
        errors: errors.slice(0, 100),
        data: valid.slice(0, 50),
      });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Failed to process file', details: String(err) });
    }
  }
);

// POST /api/upload/calling-data
router.post(
  '/calling-data',
  authenticateToken,
  requireRole('system_admin', 'data_manager', 'support_agent'),
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const { university, program } = req.body;
    if (!university || !program) {
      res.status(400).json({ error: 'University and program are required' });
      return;
    }

    try {
      const rows = parseRowsFromBuffer(req.file.buffer, req.file.originalname);
      const { valid, errors } = validateCallingData(rows, MANDATORY_COLUMNS['calling-data']);

      const uploadId = uuidv4();
      const now = new Date().toISOString();

      await saveUploadRecord({
        uploadId,
        metadata: {
          fileName: req.file.originalname,
          dataType: 'calling-data',
          university: university as University,
          program,
          uploadedAt: now,
          uploadedBy: req.user!.email,
          totalRows: rows.length,
          validRows: valid.length,
          errorRows: errors.length,
          status: errors.length === 0 ? 'success' : valid.length > 0 ? 'partial' : 'failed',
        },
        data: valid,
        errors,
        rawFile: { buffer: req.file.buffer, originalName: req.file.originalname },
      });

      res.json({
        uploadId,
        totalRows: rows.length,
        validRows: valid.length,
        errorRows: errors.length,
        errors: errors.slice(0, 100),
        data: valid.slice(0, 50),
      });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Failed to process file', details: String(err) });
    }
  }
);

// GET /api/upload/error-report/:uploadId
router.get(
  '/error-report/:uploadId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    const { uploadId } = req.params;

    try {
      const record = await getUploadRecord(uploadId);
      if (!record) {
        res.status(404).json({ error: 'Upload record not found' });
        return;
      }

      const errors = await getUploadErrors(uploadId);
      if (errors.length === 0) {
        res.status(404).json({ error: 'No errors found for this upload' });
        return;
      }

      const csvContent = generateErrorReport(errors);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="error-report-${uploadId}.csv"`
      );
      res.send(csvContent);
    } catch (err) {
      console.error('Error report fetch failed:', err);
      res.status(500).json({ error: 'Failed to fetch error report', details: String(err) });
    }
  }
);

export default router;
