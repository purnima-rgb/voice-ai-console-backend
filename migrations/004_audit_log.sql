-- Audit log: an append-only feed of every meaningful pipeline event —
-- each raw upload (student-list / grade-sheet / calling-data), each unified
-- file generation, each S3 archive, and each downstream scheduler
-- notification.
--
-- Run this once in the Supabase SQL editor for the project.

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  event_type  text not null,            -- 'upload' | 'unified_generated' | 's3_archived' | 'scheduler_notified'
  data_type   text,                     -- 'student-list' | 'grade-sheet' | 'calling-data' (upload events)
  upload_id   text,                     -- the upload this event is tied to
  university  text,
  program     text,
  file_name   text,
  actor_email text,
  actor_role  text,
  status      text not null,            -- 'success' | 'failed'
  detail      jsonb,                    -- extra context: S3 keys, row counts, error/skip reason, scheduler HTTP status
  created_at  timestamptz not null default now()
);

comment on table audit_log is
  'Append-only audit feed for uploads, unified-file generation, S3 archives, and scheduler notifications.';

-- Feed is always read newest-first; index the sort key.
create index if not exists audit_log_created_at_idx on audit_log (created_at desc);
-- Common filters.
create index if not exists audit_log_event_type_idx on audit_log (event_type);
create index if not exists audit_log_upload_id_idx  on audit_log (upload_id);
