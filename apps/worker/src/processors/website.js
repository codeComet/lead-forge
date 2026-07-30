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

  // 1. Reuse a cached industry template if one exists (no model call).
  const { data: tpl } = await supabase
    .from("website_templates")
    .select("html")
    .eq("org_id", orgId)
    .eq("industry", key)
    .maybeSingle();

  let templateHtml;
  let model;
  let tokens;
  let reused = false;

  if (tpl?.html) {
    templateHtml = tpl.html;
    model = `template:${key}`;
    tokens = 0;
    reused = true;
  } else {
    // 2. First business of this industry: generate + cache the template.
    //    Provider = the org's saved choice (job.data.provider override wins),
    //    falling back to whichever API key is configured.
    const requested = job.data.provider || (await orgProvider(orgId));
    const { system, user } = buildWebsiteRequest(business);
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

    // Cache for every later same-industry business in this org. onConflict
    // dedups if two same-industry jobs raced (last write wins — harmless).
    const { error: upErr } = await supabase.from("website_templates").upsert(
      { org_id: orgId, industry: key, html: templateHtml, model, tokens },
      { onConflict: "org_id,industry" },
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
