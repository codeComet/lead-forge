// Producer-side queues. The worker mostly consumes, but the email processor
// re-schedules its own job when a send arrives outside the allowed window or
// after the daily cap is spent.
import { Queue } from "bullmq";
import { QUEUE_NAMES, JOB_NAMES } from "@leadforge/shared/constants";
import { connection } from "./redis.js";

const queues = {};

function getQueue(name) {
  if (!queues[name]) queues[name] = new Queue(name, { connection });
  return queues[name];
}

/** Re-queue a send for a later slot (delay in ms). */
export async function scheduleEmail(emailId, orgId, delay) {
  await getQueue(QUEUE_NAMES.email).add(
    JOB_NAMES.sendEmail,
    { emailId, orgId },
    { delay: Math.max(0, Math.round(delay)), attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 500 },
  );
}
