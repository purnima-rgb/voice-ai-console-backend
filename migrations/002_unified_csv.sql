-- Add unified_csv column to the uploads table.
--
-- On a successful calling-data upload, the backend builds a Voice AI unified
-- input CSV (calling rows + matched student-list and grade-sheet rows merged
-- into user_metadata) and stores the resulting CSV string here. Each upload
-- has its own immutable snapshot — never overwritten by later uploads.
--
-- Other data types (student-list, grade-sheet) leave this column NULL.

alter table uploads
  add column if not exists unified_csv text;

comment on column uploads.unified_csv is
  'Voice AI unified-input CSV snapshot generated at upload time. Populated only for successful calling-data uploads.';
