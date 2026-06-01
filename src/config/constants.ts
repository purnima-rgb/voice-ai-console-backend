import { University } from '../types';

export const UNIVERSITIES: Record<University, string[]> = {
  GGU: ['MBA', 'DBA', 'MS Management'],
  Edgewood: ['MBA', 'DBA'],
  Rushford: ['MBA', 'Executive MBA'],
  ESGCI: ['MBA', 'MSc Management'],
};

export const UNIVERSITY_NAMES: Record<University, string> = {
  GGU: 'Golden Gate University',
  Edgewood: 'Edgewood University',
  Rushford: 'Rushford Business School',
  ESGCI: 'ESGCI Paris',
};

/**
 * For 'student-list' we use the opt-out model: ALL columns present in the
 * uploaded CSV are mandatory EXCEPT the ones listed here. This makes the
 * validator adapt automatically to MBA / DBA / ET / other course CSVs whose
 * exact columns differ — the small list of optional columns stays the same.
 *
 * For 'grade-sheet' and 'calling-data' we keep the static mandatory-list
 * model (see MANDATORY_COLUMNS below) because those formats are fixed.
 */
export const OPTIONAL_COLUMNS: Record<string, string[]> = {
  'student-list': [
    'Last Name',
    'Prism User ID',
    'GGU User ID',
    'GGU Email',
    'Region',
    'Concentration',
  ],
  // Grade sheet also uses the opt-out model — for DBA / ET courses the
  // exact column set varies but the optional list stays the same.
  // Note: per-course Grade / GPA cells can legitimately be empty for
  // courses a student hasn't attempted yet, so anything ending in
  // " - Grade" or " - GPA" is treated as optional in the validator too.
  'grade-sheet': [
    'Slot / Concentration',
    'GGU Learner Status',
    'Last Name',
  ],
  'calling-data': [],
};

export const MANDATORY_COLUMNS: Record<string, string[]> = {
  // student-list intentionally empty — uses OPTIONAL_COLUMNS opt-out model
  'student-list': [],
  'grade-sheet': [
    // Note: GGU gradesheets use a multi-row header — these columns come from row 4
    // (main header row) plus row 2 (summary headers). Last Name is intentionally
    // not mandatory because several rows in the source data have it blank.
    'Email',
    'User ID',
    'First Name',
    'Status',
    'Course Completed',
    'Overall CGPA',
    'Courses Incomplete',
  ],
  // Calling data: ALL columns are mandatory (no optional fields).
  // Names match the GGU calling-data sample CSV exactly.
  // Calling-data column names now match the unified-output naming directly
  // (user_contact, from_number, date_of_call, …). All mandatory.
  'calling-data': [
    'User ID',
    'Email ID',
    'First Name',
    'Last Name',
    'University',
    'Program',
    'Cohort #',
    'Cohort ID',
    'Status',
    'user_country_of_residence',
    'user_contact',
    'from_number',
    'date_of_call',
    'time_of_call',
    'timezone',
    'reason',
    'agent_id',
  ],
};

export const UNIFIED_CSV_COLUMNS = [
  'user_id',
  'user_first_name',
  'user_last_name',
  'user_contact',
  'from_number',
  'user_country_of_residence',
  'date_of_call',
  'time_of_call',
  'timezone',
  'reason',
  'agent_id',
  'user_metadata',
];

/**
 * Override that forces every row of the unified Voice AI CSV to use this
 * single agent_id, regardless of what the calling-data upload contained.
 *
 * Set this while only one agent is registered in the downstream Voice AI
 * console — otherwise the scheduler can't resolve the per-row IDs from the
 * agent-mapping spreadsheet and skips every call. Once multiple real agents
 * are registered, unset this env var (or leave it empty) and the unified
 * CSV will use each calling row's own agent_id again.
 */
export const VOICE_AI_DEFAULT_AGENT_ID = process.env.VOICE_AI_DEFAULT_AGENT_ID || '';

export const JWT_EXPIRY = '24h';
export const UPLOADS_DIR = 'uploads';
export const DATA_DIR = 'data';
