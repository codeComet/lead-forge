import IORedis from "ioredis";

// Shared Redis connection for all BullMQ workers.
// maxRetriesPerRequest must be null for BullMQ blocking commands.
export const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on("error", (e) => console.error("[worker] redis error:", e.message));
