// Shared constants across web + worker.

// BullMQ queue + job names.
export const QUEUE_NAMES = {
  audit: "audit",
  insight: "insight",
  proposal: "proposal",
  email: "email",
  website: "website",
};

export const JOB_NAMES = {
  auditBusiness: "audit-business",
  generateInsight: "generate-insight",
  generateProposal: "generate-proposal",
  sendEmail: "send-email",
  generateWebsite: "generate-website",
};

// CRM pipeline stages (order matters for the board).
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "opened",
  "replied",
  "meeting",
  "won",
  "lost",
];

export const LEAD_STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  opened: "Opened",
  replied: "Replied",
  meeting: "Meeting",
  won: "Won",
  lost: "Lost",
};

// Audit / job lifecycle status.
export const AUDIT_STATUSES = {
  pending: "pending",
  running: "running",
  done: "done",
  failed: "failed",
};

// Lead score colour thresholds.
export const SCORE_COLORS = {
  green: "green", // strong opportunity
  orange: "orange",
  red: "red", // weak opportunity
};

// Claude model tiers (see plan). Keep IDs in one place.
export const MODELS = {
  // Default workhorse for audits / emails / structured insight.
  default: "claude-sonnet-5",
  // Long-form proposal refinement + reports.
  longform: "claude-opus-4-8",
  // Cheap structured extraction (contact parsing etc).
  cheap: "claude-haiku-4-5-20251001",
};
