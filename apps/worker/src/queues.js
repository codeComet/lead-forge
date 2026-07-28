import { Queue } from "bullmq";
import { QUEUE_NAMES } from "@leadforge/shared/constants";
import { connection } from "./lib/redis.js";

// Queue producers used from inside worker processors (e.g. audit → insight).
export const auditQueue = new Queue(QUEUE_NAMES.audit, { connection });
export const insightQueue = new Queue(QUEUE_NAMES.insight, { connection });
export const proposalQueue = new Queue(QUEUE_NAMES.proposal, { connection });
export const emailQueue = new Queue(QUEUE_NAMES.email, { connection });
export const websiteQueue = new Queue(QUEUE_NAMES.website, { connection });
