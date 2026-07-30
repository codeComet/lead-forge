import { buildWebsiteRequest } from "@leadforge/shared/prompts";
import { fillTemplate } from "@leadforge/shared/template";
import { supabase } from "../lib/supabase.js";
import { generateWebsiteHtml } from "../lib/website-model.js";

// Strip accidental markdown fences / prose the model may wrap around the HTML.
function cleanHtml(raw) {
  if (!raw) return "";
  let html = raw.trim();
  // Remove ```html … ``` or ``` … ``` wrappers if present.
  const fence = html.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  if (fence) html = fence[1].trim();
  // If there's leading chatter before the doctype/html, cut to the first tag.
  const start = html.search(/<!doctype html|<html/i);
  if (start > 0) html = html.slice(start);
  return html.trim();
}

const isHtml = (s) => !!s && /<html|<!doctype/i.test(s);

// Normalized industry key for the template cache (same key = same template).
const industryKey = (business) =>
  (business?.business_type || "local business").trim().toLowerCase();

// Number of distinct template variants to build per industry before reusing.
const VARIANTS = Math.max(1, parseInt(process.env.WEBSITE_VARIANTS || "3", 10));

// Stable string hash → pins a business to a variant slot (same business always
// lands on the same variant; different businesses spread across the slots).
function hash(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

async function markFailed(demoId, message) {
  await supabase.from("website_demos").update({ status: "failed", error: message }).eq("id", demoId);
}

// The org's saved provider choice (null = auto → first available key).
async function orgProvider(orgId) {
  const { data } = await supabase
    .from("organizations")
    .select("website_provider")
    .eq("id", orgId)
    .maybeSingle();
  return data?.website_provider ?? null;
}

// Generate an industry-themed demo website for a business.
//
// To keep cost down (this is the heaviest job), we generate ONE template per
// (org, industry) with the org's selected AI provider (Gemini / Claude /
// DeepSeek), then reuse it for every other same-industry business by filling
// placeholder tokens + rotating brand colours in code. Only the first business
// of each industry incurs a model call.
export async function processGenerateWebsite(job) {
  const { demoId, businessId, orgId } = job.data;

  await supabase.from("website_demos").update({ status: "running", error: null }).eq("id", demoId);

  const { data: business, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .single();
  if (error || !business) throw new Error(`business ${businessId} not found`);

  const key = industryKey(business);
  // Pin this business to one of the N variant slots for its industry.
  const variant = hash(businessId) % VARIANTS;

  // A deliberate rebuild with a chosen provider = force a fresh generation with
  // that model and overwrite the cached template. Without this, the cache below
  // would return the old HTML and ignore the picked model (build finishes
  // instantly, so no new site and no visible progress).
  const forceProvider = job.data.provider || null;

  // 1. Reuse this industry+variant template if it already exists (no model call)
  //    — unless a provider was explicitly chosen for this build.
  const { data: tpl } = forceProvider
    ? { data: null }
    : await supabase
        .from("website_templates")
        .select("html")
        .eq("org_id", orgId)
        .eq("industry", key)
        .eq("variant", variant)
        .maybeSingle();

  let templateHtml;
  let model;
  let tokens;
  let reused = false;

  if (tpl?.html) {
    templateHtml = tpl.html;
    model = `template:${key}#${variant}`;
    tokens = 0;
    reused = true;
  } else {
    // 2. This variant slot is empty: generate + cache it. Each variant uses a
    //    distinct aesthetic direction so the industry gets 2-3 different looks.
    //    Provider = the org's saved choice (job.data.provider override wins),
    //    falling back to whichever API key is configured.
    const requested = job.data.provider || (await orgProvider(orgId));
    const { system, user } = buildWebsiteRequest(business, variant);
    let res;
    try {
      res = await generateWebsiteHtml({ requested, system, user });
    } catch (e) {
      await markFailed(demoId, e.message);
      throw e;
    }
    templateHtml = cleanHtml(res.text);
    if (!isHtml(templateHtml)) {
      await markFailed(demoId, "model did not return valid HTML");
      throw new Error("invalid HTML output");
    }
    model = res.model;
    tokens = (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);

    // Cache this variant for later same-industry businesses. onConflict dedups
    // if two jobs raced on the same slot (last write wins — harmless).
    const { error: upErr } = await supabase.from("website_templates").upsert(
      { org_id: orgId, industry: key, variant, html: templateHtml, model, tokens },
      { onConflict: "org_id,industry,variant" },
    );
    if (upErr) console.error(`[website] template cache write failed: ${upErr.message}`);
  }

  // 3. Fill the template for this specific business (name/city/phone/colours).
  const html = fillTemplate(templateHtml, business);
  if (!isHtml(html)) {
    await markFailed(demoId, "template produced invalid HTML");
    throw new Error("invalid HTML output");
  }

  await supabase
    .from("website_demos")
    .update({ status: "done", html, model, tokens, error: null })
    .eq("id", demoId);

  return { demoId, businessId, bytes: html.length, reused };
}
