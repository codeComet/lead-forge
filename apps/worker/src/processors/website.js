import { buildWebsiteRequest } from "@leadforge/shared/prompts";
import { MODELS } from "@leadforge/shared/constants";
import { supabase } from "../lib/supabase.js";
import { textCall } from "../lib/anthropic.js";

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

// Generate a complete, industry-themed demo website for a business. Opus for
// the best design quality (this is the standout feature). Slow + large output,
// so the worker runs it at low concurrency.
export async function processGenerateWebsite(job) {
  const { demoId, businessId, orgId } = job.data;

  await supabase.from("website_demos").update({ status: "running", error: null }).eq("id", demoId);

  const { data: business, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .single();
  if (error || !business) throw new Error(`business ${businessId} not found`);

  const { system, user } = buildWebsiteRequest(business);

  let html = "";
  let usage;
  try {
    const res = await textCall({
      model: MODELS.longform, // Opus 4.8
      system,
      user,
      maxTokens: 32000, // rich single-file site; avoid mid-HTML truncation
      thinking: true, // let it plan layout + industry imagery before writing
    });
    html = cleanHtml(res.text);
    usage = res.usage;
  } catch (e) {
    await supabase
      .from("website_demos")
      .update({ status: "failed", error: e.message })
      .eq("id", demoId);
    throw e;
  }

  if (!html || !/<html|<!doctype/i.test(html)) {
    await supabase
      .from("website_demos")
      .update({ status: "failed", error: "model did not return valid HTML" })
      .eq("id", demoId);
    throw new Error("invalid HTML output");
  }

  const tokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);

  await supabase
    .from("website_demos")
    .update({ status: "done", html, model: MODELS.longform, tokens, error: null })
    .eq("id", demoId);

  return { demoId, businessId, bytes: html.length };
}
