/**
 * Voice AI agent mapping: human-readable agent name → backend agent ID.
 *
 * Source: upGrad Agent mapping.xlsx (shared by client). Support agents
 * reference this table when preparing calling-data CSVs so they fill the
 * correct Agent ID for each Reason. Update this file when new agents are
 * commissioned.
 */
export interface AgentMapping {
  agentName: string;
  agentId: string;
}

export const AGENT_MAPPING: AgentMapping[] = [
  { agentName: 'Missed Assignment Deadline / Reattempt Window Agent',  agentId: '6a16dd14ba7c5d66b6c4d2b4' },
  { agentName: 'Grade Dispute (Learner Believes Marks Are Wrong) Agent', agentId: '6a16dc78ba7c5d66b6c4d264' },
  { agentName: 'Deferral Request (Work or Personal Demands) Agent',    agentId: '6a16dc61ba7c5d66b6c4d21b' },
  { agentName: 'Slow Support Response Agent',                          agentId: '6a16dc37ba7c5d66b6c4d1cb' },
  { agentName: 'Certificate and Degree Delivery Query Agent',          agentId: '6a16d63dba7c5d66b6c4d10f' },
  { agentName: 'Extension Request (Health or Personal Reasons) Agent', agentId: '6a16d626ba7c5d66b6c4d0c6' },
  { agentName: 'New Batch Onboarding Call Agent',                      agentId: '6a16bd59ba7c5d66b6c4cee9' },
];
