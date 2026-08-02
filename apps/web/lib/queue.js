import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES, JOB_NAMES } from "@leadforge/shared/constants";

// Lazy singletons. Enqueuing is best-effort: if Redis isn't configured the app
// still works (businesses are stored; audits just won't run until the worker +
// Redis are available).

let connection;
const queues = {};

function getConnection() {
  if (connection !== undefined) return connection;
  const url = process.env.REDIS_URL;
  // Skip when unset or still the .env.example placeholder.
  if (!url || url.includes("your-host")) {
    connection = null;
    return null;
  }
  // Producer connection: fail fast when Redis is down so enqueue never blocks
  // the request. (Workers need maxRetriesPerRequest:null; producers don't.)
  connection = new IORedis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3000,
    retryStrategy: () => null, // don't retry forever
    lazyConnect: false,
  });
  connection.on("error", (e) => console.error("[queue] redis error:", e.message));
  return connection;
}

function getQueue(name) {
  const conn = getConnection();
  if (!conn) return null;
  if (!queues[name]) queues[name] = new Queue(name, { connection: conn });
  return queues[name];
}

const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 500,
};

export async function enqueueAudit(businessId, orgId) {
  const q = getQueue(QUEUE_NAMES.audit);
  if (!q) return false;
  await q.add(JOB_NAMES.auditBusiness, { businessId, orgId }, DEFAULT_JOB_OPTS);
  return true;
}

export async function enqueueAudits(items) {
  const q = getQueue(QUEUE_NAMES.audit);
  if (!q) return false;
  await q.addBulk(
    items.map(({ businessId, orgId }) => ({
      name: JOB_NAMES.auditBusiness,
      data: { businessId, orgId },
      opts: DEFAULT_JOB_OPTS,
    })),
  );
  return true;
}

export async function enqueueProposal(leadId, orgId, opts = {}) {
  const q = getQueue(QUEUE_NAMES.proposal);
  if (!q) return false;
  await q.add(JOB_NAMES.generateProposal, { leadId, orgId, ...opts }, DEFAULT_JOB_OPTS);
  return true;
}

export async function enqueueEmail(emailId, orgId) {
  const q = getQueue(QUEUE_NAMES.email);
  if (!q) return false;
  await q.add(JOB_NAMES.sendEmail, { emailId, orgId }, DEFAULT_JOB_OPTS);
  return true;
}

export async function enqueueWebsite(demoId, businessId, orgId, provider, force, customPrompt) {
  const q = getQueue(QUEUE_NAMES.website);
  if (!q) return false;
  // One retry only — generation is expensive, don't burn tokens on repeats.
  await q.add(
    JOB_NAMES.generateWebsite,
    { demoId, businessId, orgId, provider, force: !!force, customPrompt: customPrompt || undefined },
    { attempts: 2, backoff: { type: "fixed", delay: 4000 }, removeOnComplete: 200, removeOnFail: 100 },
  );
  return true;
}
