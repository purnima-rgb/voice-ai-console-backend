-- Raw uploaded files now live in a Supabase Storage bucket, not inline in
-- the uploads table. The DB stores only the path; the bytes are managed by
-- Supabase Storage (signed URLs, retention policies, lifecycle, etc.).
--
-- Run this once in the Supabase SQL editor for the project.

-- 1. Add a column to track the Storage bucket path on each upload row.
alter table uploads
  add column if not exists raw_file_path text;

comment on column uploads.raw_file_path is
  'Path inside the raw-uploads Storage bucket where the original uploaded file lives. NULL for very old records that pre-date this column.';

-- 2. Create the raw-uploads bucket. Private bucket — only the backend's
--    service-role key can read/write. (Frontend never talks to the bucket
--    directly; it goes through /api/upload/raw-file/:uploadId.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'raw-uploads',
  'raw-uploads',
  false,
  52428800,  -- 50 MB, matches the multer limit on the backend
  array[
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

-- 3. Optional: drop the legacy inline base64 column once you've confirmed
--    all clients can fetch raw files via the new endpoint. Leave commented
--    out until you're ready — old uploads with raw_file_b64 set will still
--    be served correctly while it exists.
-- alter table uploads drop column if exists raw_file_b64;
