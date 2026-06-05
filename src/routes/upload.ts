import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireRole } from '../middleware/auth';
import {
  parseRowsFromBuffer,
  parseGradesheetFromBuffer,
  generateErrorReport,
  generateUnifiedCSV,
  unifiedCsvToXlsxBuffer,
} from '../services/csvService';
import { isS3Configured, uploadUnifiedSnapshot } from '../services/s3Storage';
import { isSchedulerConfigured, notifyScheduler } from '../services/schedulerService';
import { recordAuditEvent } from '../services/auditService';
import { validateStudentList, validateGradeSheet, validateCallingData } from '../services/validationService';
import {
  saveUploadRecord,
  getUploadRecord,
  getUploadErrors,
  getStudentData,
  getGradeSheetData,
  getRawFile,
} from '../services/storageService';
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
      const { valid, errors } = validateStudentList(rows);

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
          validRows: errors.length === 0 ? valid.length : 0,
          errorRows: errors.length,
          status: errors.length === 0 ? 'success' : 'failed',
        },
        // Reject the whole upload if there are ANY validation errors.
        // No partial saves: data committed only when every row is clean.
        // Errors are still persisted so the user can download the error report.
        data: errors.length === 0 ? valid : [],
        errors,
        rawFile: { buffer: req.file.buffer, originalName: req.file.originalname },
      });

      await recordAuditEvent({
        eventType: 'upload',
        dataType: 'student-list',
        uploadId,
        university: university as string,
        program,
        fileName: req.file.originalname,
        actorEmail: req.user!.email,
        actorRole: req.user!.role,
        status: errors.length === 0 ? 'success' : 'failed',
        detail: {
          totalRows: rows.length,
          validRows: errors.length === 0 ? valid.length : 0,
          errorRows: errors.length,
        },
      });

      res.json({
        uploadId,
        success: errors.length === 0,
        totalRows: rows.length,
        validRows: errors.length === 0 ? valid.length : 0,
        errorRows: errors.length,
        errors: errors.slice(0, 100), // first 100 errors
        data: errors.length === 0 ? valid.slice(0, 50) : [], // no preview on reject
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
      const { valid, errors } = validateGradeSheet(rows);

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
          validRows: errors.length === 0 ? valid.length : 0,
          errorRows: errors.length,
          status: errors.length === 0 ? 'success' : 'failed',
        },
        // Reject the whole upload if there are ANY validation errors.
        // No partial saves: data committed only when every row is clean.
        // Errors are still persisted so the user can download the error report.
        data: errors.length === 0 ? valid : [],
        errors,
        rawFile: { buffer: req.file.buffer, originalName: req.file.originalname },
      });

      await recordAuditEvent({
        eventType: 'upload',
        dataType: 'grade-sheet',
        uploadId,
        university: university as string,
        program,
        fileName: req.file.originalname,
        actorEmail: req.user!.email,
        actorRole: req.user!.role,
        status: errors.length === 0 ? 'success' : 'failed',
        detail: {
          totalRows: rows.length,
          validRows: errors.length === 0 ? valid.length : 0,
          errorRows: errors.length,
        },
      });

      res.json({
        uploadId,
        success: errors.length === 0,
        totalRows: rows.length,
        validRows: errors.length === 0 ? valid.length : 0,
        errorRows: errors.length,
        errors: errors.slice(0, 100),
        data: errors.length === 0 ? valid.slice(0, 50) : [],
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

      // On a clean upload, generate the Voice AI unified CSV snapshot
      // using THIS upload's calling rows + the current student-list and
      // grade-sheet for the same (university, program). The snapshot is
      // stored against the upload and never overwritten by later uploads —
      // each calling-data upload produces its own immutable unified CSV.
      let unifiedCsv: string | undefined;
      if (errors.length === 0) {
        const [studentRows, gradeRows] = await Promise.all([
          getStudentData(university as string, program as string),
          getGradeSheetData(university as string, program as string),
        ]);
        unifiedCsv = generateUnifiedCSV(studentRows, valid, gradeRows);
      }

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
          validRows: errors.length === 0 ? valid.length : 0,
          errorRows: errors.length,
          status: errors.length === 0 ? 'success' : 'failed',
        },
        // Reject the whole upload if there are ANY validation errors.
        // No partial saves: data committed only when every row is clean.
        // Errors are still persisted so the user can download the error report.
        data: errors.length === 0 ? valid : [],
        errors,
        rawFile: { buffer: req.file.buffer, originalName: req.file.originalname },
        unifiedCsv,
      });

      await recordAuditEvent({
        eventType: 'upload',
        dataType: 'calling-data',
        uploadId,
        university: university as string,
        program,
        fileName: req.file.originalname,
        actorEmail: req.user!.email,
        actorRole: req.user!.role,
        status: errors.length === 0 ? 'success' : 'failed',
        detail: {
          totalRows: rows.length,
          validRows: errors.length === 0 ? valid.length : 0,
          errorRows: errors.length,
        },
      });

      if (unifiedCsv) {
        await recordAuditEvent({
          eventType: 'unified_generated',
          dataType: 'calling-data',
          uploadId,
          university: university as string,
          program,
          fileName: req.file.originalname,
          actorEmail: req.user!.email,
          actorRole: req.user!.role,
          status: 'success',
          detail: { callingRows: valid.length },
        });
      }

      // Generate the scheduler-ready unified XLSX once — it's reused for both
      // the S3 archive and the scheduler push below.
      let unifiedArchivedToS3 = false;
      let schedulerNotified = false;
      let xlsxBuffer: Buffer | undefined;
      let unifiedFileName: string | undefined;
      if (unifiedCsv) {
        xlsxBuffer = unifiedCsvToXlsxBuffer(unifiedCsv);
        const safeStamp = now.replace(/[:.]/g, '-');
        const safeUni   = ((university as string) || 'all').replace(/[^a-z0-9]/gi, '-');
        const safeProg  = ((program as string) || 'all').replace(/[^a-z0-9]/gi, '-');
        unifiedFileName = `unified-voice-ai-${safeUni}-${safeProg}-${safeStamp}.xlsx`;
      }

      // Archive the generated unified files (CSV + scheduler-ready XLSX) to S3
      // as an immutable per-upload snapshot. Best-effort: a failure here is
      // logged but does NOT fail the upload — the Supabase-backed snapshot
      // remains the source of truth and downloads still work.
      if (unifiedCsv && xlsxBuffer && isS3Configured()) {
        try {
          const keys = await uploadUnifiedSnapshot({
            uploadId,
            university: university as string,
            program: program as string,
            uploadedAt: now,
            csv: unifiedCsv,
            xlsx: xlsxBuffer,
          });
          unifiedArchivedToS3 = true;
          console.log(`[s3] archived unified snapshot: ${keys.csvKey}, ${keys.xlsxKey}`);
          await recordAuditEvent({
            eventType: 's3_archived',
            dataType: 'calling-data',
            uploadId,
            university: university as string,
            program,
            fileName: req.file.originalname,
            actorEmail: req.user!.email,
            actorRole: req.user!.role,
            status: 'success',
            detail: { bucket: keys.bucket, csvKey: keys.csvKey, xlsxKey: keys.xlsxKey },
          });
        } catch (s3err) {
          console.error('[s3] unified snapshot archive failed (continuing):', s3err);
          await recordAuditEvent({
            eventType: 's3_archived',
            dataType: 'calling-data',
            uploadId,
            university: university as string,
            program,
            fileName: req.file.originalname,
            actorEmail: req.user!.email,
            actorRole: req.user!.role,
            status: 'failed',
            detail: { error: String(s3err).slice(0, 500) },
          });
        }
      }

      // Push the unified XLSX to the downstream Voice AI scheduler's external
      // upload API (multipart: file + orgId, x-api-key auth). Independent of
      // S3 — it only needs the generated file. Best-effort, env-gated: a
      // failure is audited but does NOT fail the upload.
      if (unifiedCsv && xlsxBuffer && unifiedFileName && isSchedulerConfigured()) {
        const result = await notifyScheduler({
          uploadId,
          fileName: unifiedFileName,
          xlsx: xlsxBuffer,
        });
        schedulerNotified = result.ok;
        if (result.ok) {
          console.log(`[scheduler] uploaded unified file ok (status ${result.status ?? '?'})`);
        } else {
          console.error(`[scheduler] upload failed (continuing): ${result.detail ?? ''}`);
        }
        await recordAuditEvent({
          eventType: 'scheduler_notified',
          dataType: 'calling-data',
          uploadId,
          university: university as string,
          program,
          fileName: req.file.originalname,
          actorEmail: req.user!.email,
          actorRole: req.user!.role,
          status: result.ok ? 'success' : 'failed',
          detail: { httpStatus: result.status, detail: result.detail, file: unifiedFileName },
        });
      }

      res.json({
        uploadId,
        success: errors.length === 0,
        totalRows: rows.length,
        validRows: errors.length === 0 ? valid.length : 0,
        errorRows: errors.length,
        errors: errors.slice(0, 100),
        data: errors.length === 0 ? valid.slice(0, 50) : [],
        unifiedCsvAvailable: unifiedCsv != null,
        unifiedArchivedToS3,
        schedulerNotified,
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

// GET /api/upload/raw-file/:uploadId
// Download the original uploaded file (CSV / XLSX) that the client sent.
// File is fetched from the Supabase Storage 'raw-uploads' bucket in
// production; local-dev file-storage fallback returns it from the inline
// base64 in ./data/uploads.json.
router.get(
  '/raw-file/:uploadId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    const { uploadId } = req.params;

    try {
      const record = await getUploadRecord(uploadId);
      if (!record) {
        res.status(404).json({ error: 'Upload record not found' });
        return;
      }
      // Support agents can only download their own raw files
      if (req.user?.role === 'support_agent' && record.uploadedBy !== req.user.email) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const file = await getRawFile(uploadId);
      if (!file) {
        res.status(404).json({
          error: 'Raw file not stored for this upload',
          hint:  'Older uploads (before the raw-file bucket was introduced) may not have a stored original.',
        });
        return;
      }

      res.setHeader('Content-Type', file.mime);
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.send(file.buffer);
    } catch (err) {
      console.error('Raw-file fetch failed:', err);
      res.status(500).json({ error: 'Failed to fetch raw file', details: String(err) });
    }
  }
);

export default router;
