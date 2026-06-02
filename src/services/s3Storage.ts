/**
 * AWS S3 archival for the generated Voice AI unified files.
 *
 * Each clean calling-data upload produces an immutable unified snapshot
 * (CSV + scheduler-ready XLSX). In addition to the Supabase-backed snapshot,
 * we archive both formats to an S3 bucket so the client has a durable,
 * per-upload copy in their own AWS account.
 *
 * Credentials are read ONLY from environment variables — never hardcoded:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME
 *
 * If any of those are unset, isS3Configured() returns false and callers skip
 * the archive step (so local dev / unconfigured environments keep working).
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const AWS_REGION            = process.env.AWS_REGION;
const S3_BUCKET_NAME        = process.env.S3_BUCKET_NAME;
const AWS_ACCESS_KEY_ID     = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let _client: S3Client | null = null;

/** True only when every required AWS env var is present. */
export function isS3Configured(): boolean {
  return !!(
    AWS_REGION &&
    S3_BUCKET_NAME &&
    AWS_ACCESS_KEY_ID &&
    AWS_SECRET_ACCESS_KEY
  );
}

function getClient(): S3Client {
  if (!isS3Configured()) {
    throw new Error(
      'S3 not configured — set AWS_REGION, S3_BUCKET_NAME, AWS_ACCESS_KEY_ID ' +
      'and AWS_SECRET_ACCESS_KEY in the environment.'
    );
  }
  if (!_client) {
    _client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID as string,
        secretAccessKey: AWS_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return _client;
}

/** Filesystem-safe slug for path segments. */
function slug(s?: string): string {
  return (s || 'all').replace(/[^a-z0-9]/gi, '-');
}

export interface UnifiedS3Keys {
  csvKey: string;
  xlsxKey: string;
  bucket: string;
}

/**
 * Build the immutable S3 object keys for an upload. uploadId guarantees
 * uniqueness; university/program/date make the path human-browsable.
 *   unified/<university>/<program>/<YYYY-MM-DD>/<uploadId>.{csv,xlsx}
 */
export function unifiedKeysFor(
  uploadId: string,
  university?: string,
  program?: string,
  uploadedAt?: string
): UnifiedS3Keys {
  const day = (uploadedAt || new Date().toISOString()).slice(0, 10);
  const base = `unified/${slug(university)}/${slug(program)}/${day}/${uploadId}`;
  return {
    csvKey: `${base}.csv`,
    xlsxKey: `${base}.xlsx`,
    bucket: S3_BUCKET_NAME as string,
  };
}

/**
 * Upload the generated unified CSV + XLSX to S3 as an immutable snapshot.
 * Returns the object keys written. Throws on failure — callers decide whether
 * to treat the archive as best-effort or fatal.
 */
export async function uploadUnifiedSnapshot(params: {
  uploadId: string;
  university?: string;
  program?: string;
  uploadedAt?: string;
  csv: string | Buffer;
  xlsx: Buffer;
}): Promise<UnifiedS3Keys> {
  const keys = unifiedKeysFor(
    params.uploadId,
    params.university,
    params.program,
    params.uploadedAt
  );
  const client = getClient();
  const csvBody =
    typeof params.csv === 'string' ? Buffer.from(params.csv, 'utf-8') : params.csv;

  await Promise.all([
    client.send(
      new PutObjectCommand({
        Bucket: keys.bucket,
        Key: keys.csvKey,
        Body: csvBody,
        ContentType: 'text/csv; charset=utf-8',
      })
    ),
    client.send(
      new PutObjectCommand({
        Bucket: keys.bucket,
        Key: keys.xlsxKey,
        Body: params.xlsx,
        ContentType: XLSX_MIME,
      })
    ),
  ]);

  return keys;
}

/** Stream an archived object back as a Buffer (used if we ever serve from S3). */
export async function getObjectBuffer(key: string): Promise<Buffer | null> {
  try {
    const client = getClient();
    const out = await client.send(
      new GetObjectCommand({ Bucket: S3_BUCKET_NAME as string, Key: key })
    );
    if (!out.Body) return null;
    const chunks: Buffer[] = [];
    // Body is a Node.js Readable stream in the AWS SDK v3 Node runtime
    for await (const chunk of out.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}
