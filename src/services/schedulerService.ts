/**
 * Downstream Voice-AI scheduler notification.
 *
 * When a new unified file is generated and archived to S3, we POST a small
 * JSON payload to the scheduler so it can pick up the new input without a
 * manual step. The endpoint + optional bearer token are read from the env:
 *
 *   SCHEDULER_WEBHOOK_URL    (required to enable; e.g. https://scheduler/.../ingest)
 *   SCHEDULER_AUTH_TOKEN     (optional; sent as `Authorization: Bearer <token>`)
 *
 * If SCHEDULER_WEBHOOK_URL is unset, isSchedulerConfigured() is false and the
 * notify step is skipped (so unconfigured environments keep working). Like the
 * S3 archive, this is BEST-EFFORT: a failure is reported back to the caller
 * (so it can be audited) but never thrown to fail the upload.
 */
const SCHEDULER_WEBHOOK_URL = process.env.SCHEDULER_WEBHOOK_URL;
const SCHEDULER_AUTH_TOKEN  = process.env.SCHEDULER_AUTH_TOKEN;

/** Timeout for the scheduler call so a hung endpoint can't stall the request. */
const NOTIFY_TIMEOUT_MS = 10_000;

/** True only when a scheduler webhook URL is configured. */
export function isSchedulerConfigured(): boolean {
  return !!SCHEDULER_WEBHOOK_URL;
}

export interface SchedulerNotifyParams {
  uploadId: string;
  university?: string;
  program?: string;
  uploadedAt?: string;
  bucket: string;
  csvKey: string;
  xlsxKey: string;
  rowCount?: number;
}

export interface SchedulerNotifyResult {
  ok: boolean;
  /** HTTP status, or undefined if the request never completed. */
  status?: number;
  /** Short error / response detail for the audit log. */
  detail?: string;
}

/**
 * Notify the scheduler about a newly archived unified file. Best-effort:
 * returns a result describing success/failure; never throws.
 */
export async function notifyScheduler(
  params: SchedulerNotifyParams
): Promise<SchedulerNotifyResult> {
  if (!SCHEDULER_WEBHOOK_URL) {
    return { ok: false, detail: 'scheduler not configured' };
  }

  const payload = {
    event: 'unified_file_ready',
    uploadId: params.uploadId,
    university: params.university ?? null,
    program: params.program ?? null,
    uploadedAt: params.uploadedAt ?? new Date().toISOString(),
    s3: {
      bucket: params.bucket,
      csvKey: params.csvKey,
      xlsxKey: params.xlsxKey,
    },
    rowCount: params.rowCount ?? null,
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (SCHEDULER_AUTH_TOKEN) headers.Authorization = `Bearer ${SCHEDULER_AUTH_TOKEN}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);
  try {
    const res = await fetch(SCHEDULER_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, detail: text.slice(0, 500) };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 500) };
  } finally {
    clearTimeout(timer);
  }
}
