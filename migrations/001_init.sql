-- Voice AI Console — Supabase schema (run once in the Supabase SQL editor)
--
-- One table holds everything: metadata + parsed rows (jsonb) + errors (jsonb)
-- + the original raw file (base64) so client uploads are preserved exactly.

create extension if not exists "uuid-ossp";

create table if not exists uploads (
  upload_id           uuid primary key default uuid_generate_v4(),
  data_type           text not null check (data_type in ('student-list', 'grade-sheet', 'calling-data')),
  university          text,
  program             text,
  file_name           text not null,
  file_size_bytes     bigint not null default 0,
  file_ext            text not null,             -- 'csv' | 'xlsx' | 'xls'
  raw_file_b64        text,                       -- base64 of original file (null if too large)
  uploaded_by         text not null,
  uploaded_at         timestamptz not null default now(),
  total_rows          int not null default 0,
  valid_rows          int not null default 0,
  error_rows          int not null default 0,
  status              text not null check (status in ('success', 'partial', 'failed')),
  rows                jsonb not null default '[]'::jsonb,
  errors              jsonb not null default '[]'::jsonb
);

create index if not exists idx_uploads_data_type            on uploads (data_type);
create index if not exists idx_uploads_university_program   on uploads (university, program);
create index if not exists idx_uploads_uploaded_at_desc     on uploads (uploaded_at desc);

-- Service-role key bypasses RLS by default, so we leave RLS off for this table.
-- If you ever want client-side access with an anon key, enable RLS and add policies.
