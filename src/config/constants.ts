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
  'grade-sheet': [],
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
  'calling-data': [
    'Email ID',
    'First Name',
    'Last Name',
    'Contact',
    'University',
    'Program',
    'Query Type',
    'Scheduled Date',
    'Scheduled Time',
    'Agent Name',
    'From',
    'Timezone',
  ],
};

export const UNIFIED_CSV_COLUMNS = [
  'user_id',
  'user_first',
  'user_last',
  'user_contact',
  'from_number',
  'user_country',
  'date_of_call',
  'time_of_call',
  'timezone',
  'reason',
  'agent_id',
  'user_metadata',
];

export const JWT_EXPIRY = '24h';
export const UPLOADS_DIR = 'uploads';
export const DATA_DIR = 'data';
