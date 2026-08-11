// Worker entrypoint. Registers a BullMQ Worker per queue.
import { Queue, Worker } from "bullmq";
import { QUEUE_NAMES, JOB_NAMES } from "@leadforge/shared/constants";
import { connection } from "./lib/redis.js";
import { processAudit } from "./processors/audit.js";
import { processInsight } from "./processors/insight.js";
import { processProposal } from "./processors/proposal.js";
import { processEmail } from "./processors/email.js";
import { processGenerateWebsite } from "./processors/website.js";
import { processWarmupTick } from "./processors/warmup.js";
import { processPollReplies } from "./processors/inbox.js";
import { closeBrowser } from "./audit/screenshot.js";

const workers = [];
const schedulers = [];

function register(name, processor, concurrency) {
  const w = new Worker(name, processor, { connection, concurrency });
  w.on("completed", (job) => console.log(`[${name}] ✓ ${job.id}`));
  w.on("failed", (job, err) => console.error(`[${name}] ✗ ${job?.id}: ${err?.message}`));
  workers.push(w);
  return w;
}

/**
 * Recurring internal job. `upsertJobScheduler` is idempotent, so restarts and
 * multiple worker replicas converge on one schedule instead of stacking repeats.
 */
async function schedule(queueName, jobName, everyMs) {
  const q = new Queue(queueName, { connection });
  schedulers.push(q);
  await q.upsertJobScheduler(
    `${jobName}-scheduler`,
    { every: everyMs },
    { name: jobName, opts: { removeOnComplete: 50, removeOnFail: 50 } },
  );
}

console.log("[worker] starting…");
register(QUEUE_NAMES.audit, processAudit, 3); // Playwright-heavy → keep low
register(QUEUE_NAMES.insight, processInsight, 5);
register(QUEUE_NAMES.proposal, processProposal, 5);
// Sends are paced (daily cap + spacing) — concurrency 1 keeps the spacing real.
register(QUEUE_NAMES.email, processEmail, 1);
register(QUEUE_NAMES.website, processGenerateWebsite, 2); // Gemini + large output → keep low (respects free-tier RPM)
register(QUEUE_NAMES.warmup, processWarmupTick, 1);
register(QUEUE_NAMES.inbox, processPollReplies, 1);

// Warm-up ticks faster than the tightest send gap so the planner (not the
// timer) sets the pace; the inbox poll only needs to be timely enough for the
// CRM to feel live.
await schedule(QUEUE_NAMES.warmup, JOB_NAMES.warmupTick, 5 * 60_000);
await schedule(QUEUE_NAMES.inbox, JOB_NAMES.pollReplies, 5 * 60_000);

console.log("[worker] ready — listening on:", Object.values(QUEUE_NAMES).join(", "));

async function shutdown() {
  console.log("[worker] shutting down…");
  await Promise.allSettled([...workers.map((w) => w.close()), ...schedulers.map((q) => q.close())]);
  await closeBrowser();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
