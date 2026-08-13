-- Add call_type column to uploads table
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS call_type TEXT;
