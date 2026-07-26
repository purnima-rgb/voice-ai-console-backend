/**
 * Voice AI agent mapping: human-readable agent name → backend agent ID.
 *
 * These are the 5 finalized agents currently running live campaigns for
 * GGU / MBA. Same IDs as AGENT_IDS in constants.ts (which drives upload
 * validation) — kept as a separate flat list here since this table's
 * display names are the Voice AI console's registered agent names, not
 * the shorter internal use-case labels shown on the Upload screen.
 * Update this file when new agents are commissioned.
 */
export interface AgentMapping {
  agentName: string;
  agentId: string;
}

export const AGENT_MAPPING: AgentMapping[] = [
  { agentName: 'Live Session Reminder Call Agent',                     agentId: '6a4f8a16008496639b3b25fb' },
  { agentName: 'Deferral Request (Work or Personal Demands) Agent',    agentId: '6a16dc61ba7c5d66b6c4d21b' },
  { agentName: 'Missed Assignment Deadline Extension Agent',           agentId: '6a16d626ba7c5d66b6c4d0c6' },
  { agentName: 'New Batch Onboarding Call Agent',                      agentId: '6a16bd59ba7c5d66b6c4cee9' },
  { agentName: 'Assignment Deadline Reminder Agent',                   agentId: '6a5f3d6e4b06e6a040d16d04' },
];
