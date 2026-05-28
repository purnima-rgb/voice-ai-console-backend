import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireRole } from '../middleware/auth';
import { parseCSV, parseGradesheetCSV, generateErrorReport } from '../services/csvService';
import { validateStudentList, validateGradeSheet, validateCallingData } from '../services/validationService';
import { saveUploadRecord, getUploadRecord, getUploadErrors } from '../services/storageService';
import { MANDATORY_COLUMNS } from '../config/constants';
import { University } from '../types';

const router = Router();

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
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
      const rows = parseCSV(req.file.path);
      const { valid, errors } = validateStudentList(rows, MANDATORY_COLUMNS['student-list']);

      const uploadId = uuidv4();
      const now = new Date().toISOString();

      saveUploadRecord(
        uploadId,
        {
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
        valid,
        errors
      );

      res.json({
        uploadId,
        totalRows: rows.length,
        validRows: valid.length,
        errorRows: errors.length,
        errors: errors.slice(0, 100), // Return first 100 errors
        data: valid.slice(0, 50), // Return first 50 rows for preview
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
      const rows = parseGradesheetCSV(req.file.path);
      const { valid, errors } = validateGradeSheet(rows, MANDATORY_COLUMNS['grade-sheet']);

      const uploadId = uuidv4();
      const now = new Date().toISOString();

      saveUploadRecord(
        uploadId,
        {
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
        valid,
        errors
      );

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

    try {
      const rows = parseCSV(req.file.path);
      const { valid, errors } = validateCallingData(rows, MANDATORY_COLUMNS['calling-data']);

      const uploadId = uuidv4();
      const now = new Date().toISOString();

      saveUploadRecord(
        uploadId,
        {
          fileName: req.file.originalname,
          dataType: 'calling-data',
          uploadedAt: now,
          uploadedBy: req.user!.email,
          totalRows: rows.length,
          validRows: valid.length,
          errorRows: errors.length,
          status: errors.length === 0 ? 'success' : valid.length > 0 ? 'partial' : 'failed',
        },
        valid,
        errors
      );

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

    const record = getUploadRecord(uploadId);
    if (!record) {
      res.status(404).json({ error: 'Upload record not found' });
      return;
    }

    const errors = getUploadErrors(uploadId);
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
  }
);

export default router;
