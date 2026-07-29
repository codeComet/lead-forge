#!/usr/bin/env node
// Copy Storage objects (screenshots + logos buckets) from a hosted Supabase
// project into this self-hosted stack. Keys are preserved, so the audit rows
// that reference "<org>/<business>/desktop.png" keep working unchanged.
//
// Run AFTER the stack is up and the DB data migration has finished:
//
//   SOURCE_SUPABASE_URL='https://<ref>.supabase.co' \
//   SOURCE_SERVICE_ROLE_KEY='<cloud service_role key>' \
//   TARGET_SUPABASE_URL='http://localhost:8000' \
//   TARGET_SERVICE_ROLE_KEY='<local SERVICE_ROLE_KEY from .env>' \
//     node scripts/migrate-storage.mjs
//
// TARGET_SUPABASE_URL can be the public Supabase domain or, if you exposed
// KONG_HTTP_PORT on the host, http://localhost:8000.

import { createClient } from "@supabase/supabase-js";

const {
  SOURCE_SUPABASE_URL,
  SOURCE_SERVICE_ROLE_KEY,
  TARGET_SUPABASE_URL,
  TARGET_SERVICE_ROLE_KEY,
} = process.env;

for (const [k, v] of Object.entries({
  SOURCE_SUPABASE_URL, SOURCE_SERVICE_ROLE_KEY, TARGET_SUPABASE_URL, TARGET_SERVICE_ROLE_KEY,
})) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
}

const src = createClient(SOURCE_SUPABASE_URL, SOURCE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const dst = createClient(TARGET_SUPABASE_URL, TARGET_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BUCKETS = ["screenshots", "logos"];

// Recursively list every object key under a prefix (Storage list is one level).
async function walk(bucket, prefix = "") {
  const keys = [];
  const pageSize = 100;
  let offset = 0;
  for (;;) {
    const { data, error } = await src.storage.from(bucket).list(prefix, {
      limit: pageSize, offset, sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A "folder" comes back with a null id (no metadata).
      if (entry.id === null || entry.metadata === null) {
        keys.push(...(await walk(bucket, path)));
      } else {
        keys.push(path);
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return keys;
}

let copied = 0, skipped = 0, failed = 0;

for (const bucket of BUCKETS) {
  // Ensure the target bucket exists (0003_storage creates it; harmless if so).
  await dst.storage.createBucket(bucket, { public: false }).catch(() => {});

  let keys;
  try {
    keys = await walk(bucket);
  } catch (e) {
    console.error(`[${bucket}] cannot list (bucket missing on source?): ${e.message}`);
    continue;
  }
  console.log(`[${bucket}] ${keys.length} object(s)`);

  for (const key of keys) {
    try {
      const { data: blob, error: dlErr } = await src.storage.from(bucket).download(key);
      if (dlErr) throw dlErr;
      const buf = Buffer.from(await blob.arrayBuffer());
      const { error: upErr } = await dst.storage.from(bucket).upload(key, buf, {
        contentType: blob.type || "application/octet-stream",
        upsert: true,
      });
      if (upErr) throw upErr;
      copied++;
      if (copied % 25 === 0) console.log(`  …${copied} copied`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${bucket}/${key}: ${e.message}`);
    }
  }
}

console.log(`\nDone. copied=${copied} skipped=${skipped} failed=${failed}`);
process.exit(failed ? 1 : 0);
