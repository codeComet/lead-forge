// Worker entrypoint. Registers a BullMQ Worker per queue.
import { Worker } from "bullmq";
import { QUEUE_NAMES } from "@leadforge/shared/constants";
import { connection } from "./lib/redis.js";
import { processAudit } from "./processors/audit.js";
import { processInsight } from "./processors/insight.js";
import { processProposal } from "./processors/proposal.js";
import { processEmail } from "./processors/email.js";
import { processGenerateWebsite } from "./processors/website.js";
import { closeBrowser } from "./audit/screenshot.js";

const workers = [];

function register(name, processor, concurrency) {
  const w = new Worker(name, processor, { connection, concurrency });
  w.on("completed", (job) => console.log(`[${name}] ✓ ${job.id}`));
  w.on("failed", (job, err) => console.error(`[${name}] ✗ ${job?.id}: ${err?.message}`));
  workers.push(w);
  return w;
}

console.log("[worker] starting…");
register(QUEUE_NAMES.audit, processAudit, 3); // Playwright-heavy → keep low
register(QUEUE_NAMES.insight, processInsight, 5);
register(QUEUE_NAMES.proposal, processProposal, 5);
register(QUEUE_NAMES.email, processEmail, 5);
register(QUEUE_NAMES.website, processGenerateWebsite, 2); // Opus + large output → keep low
console.log("[worker] ready — listening on:", Object.values(QUEUE_NAMES).join(", "));

async function shutdown() {
  console.log("[worker] shutting down…");
  await Promise.allSettled(workers.map((w) => w.close()));
  await closeBrowser();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
