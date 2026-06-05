/**
 * Downstream Voice-AI scheduler integration.
 *
 * When a clean calling-data upload produces a unified file, we push the
 * scheduler-ready XLSX straight to the scheduler's external upload API as a
 * multipart/form-data request:
 *
 *   POST {SCHEDULER_UPLOAD_URL}
 *     header: x-api-key: {SCHEDULER_API_KEY}
 *     form:   file=<unified .xlsx>, orgId={SCHEDULER_ORG_ID}
 *
 * Config comes from the env (the API key is a secret — never hardcode):
 *   SCHEDULER_UPLOAD_URL   e.g. https://voiceai-dev.devkraft.ai/api/external/upload
 *   SCHEDULER_API_KEY      the x-api-key credential
 *   SCHEDULER_ORG_ID       the target org id
 *
 * If any are unset, isSchedulerConfigured() is false and the push is skipped
 * (so unconfigured environments keep working). Like the S3 archive this is
 * BEST-EFFORT: a failure is reported back to the caller (for the audit log)
 * but never thrown — it must not fail the upload.
 */
const SCHEDULER_UPLOAD_URL = process.env.SCHEDULER_UPLOAD_URL;
const SCHEDULER_API_KEY    = process.env.SCHEDULER_API_KEY;
const SCHEDULER_ORG_ID     = process.env.SCHEDULER_ORG_ID;

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Timeout so a hung scheduler endpoint can't stall the upload request. */
const NOTIFY_TIMEOUT_MS = 30_000;

/** True only when the scheduler upload URL, API key, and org id are all set. */
export function isSchedulerConfigured(): boolean {
  return !!(SCHEDULER_UPLOAD_URL && SCHEDULER_API_KEY && SCHEDULER_ORG_ID);
}

export interface SchedulerNotifyParams {
  /** The scheduler-ready unified XLSX bytes. */
  xlsx: Buffer;
  /** Filename to send for the `file` part. */
  fileName: string;
  /** For logging / audit context. */
  uploadId: string;
}

export interface SchedulerNotifyResult {
  ok: boolean;
  /** HTTP status, or undefined if the request never completed. */
  status?: number;
  /** Short response / error detail for the audit log. */
  detail?: string;
}

/**
 * Push the unified XLSX to the scheduler's external upload API. Best-effort:
 * returns a result describing success/failure; never throws.
 */
export async function notifyScheduler(
  params: SchedulerNotifyParams
): Promise<SchedulerNotifyResult> {
  if (!isSchedulerConfigured()) {
    return { ok: false, detail: 'scheduler not configured' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);
  try {
    // Node 18+/20 globals: FormData + Blob + fetch (undici). fetch sets the
    // multipart boundary automatically — do NOT set Content-Type by hand.
    const form = new FormData();
    const blob = new Blob([params.xlsx], { type: XLSX_MIME });
    form.append('file', blob, params.fileName);
    form.append('orgId', SCHEDULER_ORG_ID as string);

    const res = await fetch(SCHEDULER_UPLOAD_URL as string, {
      method: 'POST',
      headers: { 'x-api-key': SCHEDULER_API_KEY as string },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, detail: text.slice(0, 500) };
    }
    const text = await res.text().catch(() => '');
    return { ok: true, status: res.status, detail: text.slice(0, 500) };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 500) };
  } finally {
    clearTimeout(timer);
  }
}
