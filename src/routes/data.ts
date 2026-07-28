import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import {
  listUploads,
  getStats,
  getUploadRecord,
  getUploadRows,
} from '../services/storageService';
import { agentDataToXlsxBuffer } from '../services/csvService';
import { listAuditEvents } from '../services/auditService';
import { AGENT_MAPPING } from '../config/agentMapping';
import { TELEPHONY_PROVIDERS } from '../config/constants';
import { AuditEventType, University, AgentUseCase } from '../types';

const router = Router();

// GET /api/data/agent-mapping
// Reference data — agent name ↔ agent ID lookup for the 5 finalized agents.
// Accessible to all authenticated roles.
router.get(
  '/agent-mapping',
  authenticateToken,
  (_req: Request, res: Response): void => {
    res.json({ agents: AGENT_MAPPING, total: AGENT_MAPPING.length });
  }
);

// GET /api/data/telephony-providers
// Reference data — telephony provider ↔ from_number lookup. Accessible to
// all authenticated roles.
router.get(
  '/telephony-providers',
  authenticateToken,
  (_req: Request, res: Response): void => {
    res.json({ providers: TELEPHONY_PROVIDERS, total: TELEPHONY_PROVIDERS.length });
  }
);

// GET /api/data/upload-rows/:uploadId
// Returns the validated data rows stored for a given agent-data upload —
// used by the View Data screen to browse a specific upload's contents.
router.get(
  '/upload-rows/:uploadId',
  authenticateToken,
  requireRole('system_admin', 'data_manager'),
  async (req: Request, res: Response): Promise<void> => {
    const { uploadId } = req.params;
    try {
      const record = await getUploadRecord(uploadId);
      if (!record) { res.status(404).json({ error: 'Upload record not found' }); return; }

      const rows = await getUploadRows(uploadId);
      res.json({ data: rows || [], total: rows?.length || 0 });
    } catch (err) {
      console.error('upload-rows fetch failed:', err);
      res.status(500).json({ error: 'Failed to fetch upload rows', details: String(err) });
    }
  }
);

// GET /api/data/unified-xlsx/:uploadId
// Serves the unified Voice AI input file as .xlsx with date_of_call and
// time_of_call cells stored as proper Excel number types so the downstream
// scheduler can compute wall-clock call times (vs marking calls 'skipped').
// Rebuilt directly from the upload's stored validated rows — see
// agentDataToXlsxBuffer for the exact cell-format spec (matches the
// client's reference unified file).
router.get(
  '/unified-xlsx/:uploadId',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    const { uploadId } = req.params;
    try {
      const record = await getUploadRecord(uploadId);
      if (!record) { res.status(404).json({ error: 'Upload record not found' }); return; }

      const rows = await getUploadRows(uploadId);
      if (!rows || rows.length === 0) {
        res.status(404).json({ error: 'No unified file stored for this upload (was the upload rejected?)' });
        return;
      }

      const safeStamp = record.uploadedAt.replace(/[:.]/g, '-');
      const safeUni   = (record.university || 'all').replace(/[^a-z0-9]/gi, '-');
      const safeProg  = (record.program    || 'all').replace(/[^a-z0-9]/gi, '-');

      const buf = agentDataToXlsxBuffer(rows, record.dataType as AgentUseCase);
      const fileName = `unified-${record.dataType}-${safeUni}-${safeProg}-${safeStamp}.xlsx`;

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

// GET /api/data/upload-history
router.get(
  '/upload-history',
  authenticateToken,
  requireRole('system_admin', 'data_manager'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dataType, university, program } = req.query;

      const uploads = await listUploads({
        dataType: dataType as AgentUseCase | undefined,
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

// GET /api/data/audit
// Audit log feed — every upload, unified-file generation, S3 archive, and
// scheduler notification. Admin-facing: only system_admin + data_manager.
// Optional filters: eventType, university, program, uploadId, limit.
router.get(
  '/audit',
  authenticateToken,
  requireRole('system_admin', 'data_manager'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { eventType, university, program, uploadId, limit } = req.query;
      const events = await listAuditEvents({
        eventType: eventType as AuditEventType | undefined,
        university: university as string | undefined,
        program: program as string | undefined,
        uploadId: uploadId as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });
      res.json({ events, total: events.length });
    } catch (err) {
      console.error('audit fetch failed:', err);
      res.status(500).json({ error: 'Failed to fetch audit log', details: String(err) });
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
