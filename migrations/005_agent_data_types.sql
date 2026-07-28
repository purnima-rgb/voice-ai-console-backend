-- Migration 005: allow the 5 finalized Voice AI agent types in the
-- uploads table's data_type constraint.
--
-- The original constraint (001_init.sql) only allowed the deprecated
-- student-list / grade-sheet / calling-data types. Every agent-data upload
-- (live-session-reminder, deferral-request, missed-assignment-deadline,
-- new-program-onboarding, deadline-reminder) has been failing at the
-- database insert step ever since the client switched to the agent-based
-- upload flow, surfacing to users as a generic "Failed to process file"
-- error with no visible detail.
--
-- The deprecated types (plus program-calendar, added later but never
-- migrated either) are kept in the allow-list so existing historical rows
-- stay valid — new uploads only ever use the 5 agent types below.
--
-- Run this once in the Supabase SQL editor for the project.

alter table uploads drop constraint if exists uploads_data_type_check;

alter table uploads add constraint uploads_data_type_check
  check (data_type in (
    -- deprecated — kept only so historical rows remain valid
    'student-list', 'grade-sheet', 'calling-data', 'program-calendar',
    -- current: the 5 finalized Voice AI agents
    'live-session-reminder', 'deferral-request', 'missed-assignment-deadline',
    'new-program-onboarding', 'deadline-reminder'
  ));
