"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lightbulb, TrendingDown, Users, Pencil, Plus, X, Save, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatNumber } from "@/lib/utils";

// Scan a string for a balanced, top-level JSON array and return its parsed
// value, ignoring trailing junk after the closing bracket. Some legacy insight
// rows stored the raw model text — a JSON array followed by XML garbage —
// instead of a real array.
function extractJsonArray(str) {
  const start = str.indexOf("[");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) {
      try {
        const arr = JSON.parse(str.slice(start, i + 1));
        return Array.isArray(arr) ? arr : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Insight JSON is model-generated, so `problems`/`improvements` aren't always a
// clean string[]. Coerce to a string[] so lists render and edit safely.
function asStringList(value) {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : v?.problem ?? v?.improvement ?? v?.text ?? v?.title))
      .filter((v) => typeof v === "string" && v.trim())
      .map((v) => v.trim());
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = extractJsonArray(value);
    if (parsed) return asStringList(parsed);
    return [value.trim()];
  }
  return [];
}

// Parse a user-typed number field back to a number or null (empty ⇒ null).
function toNumberOrNull(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// An editable list of one-line items (problems / improvements) with add + remove.
function EditableList({ label, items, onChange, placeholder }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item}
              placeholder={placeholder}
              onChange={(e) => {
                const next = items.slice();
                next[i] = e.target.value;
                onChange(next);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label="Remove"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
        <Plus className="mr-1 h-4 w-4" /> Add
      </Button>
    </div>
  );
}

/**
 * Overview panel for a lead's AI insight. Renders the summary, impact estimates,
 * problems, and suggested improvements — and lets the user edit them by hand
 * (add/remove/reword) to fill in details the AI missed. Writes back to
 * `leads.insight` via the browser Supabase client (RLS-scoped) and refreshes.
 * Works even when there's no AI insight yet, so items can be added from scratch.
 */
export function InsightPanel({ leadId, insight }) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [summary, setSummary] = React.useState("");
  const [problems, setProblems] = React.useState([]);
  const [improvements, setImprovements] = React.useState([]);
  const [missed, setMissed] = React.useState("");
  const [lost, setLost] = React.useState("");

  // Seed edit fields from the current insight when entering edit mode.
  function startEditing() {
    setSummary(insight?.summary ?? "");
    setProblems(asStringList(insight?.problems));
    setImprovements(asStringList(insight?.improvements));
    setMissed(insight?.estimatedMissedCustomersPerMonth ?? "");
    setLost(insight?.estimatedLostRevenuePerMonth ?? "");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const next = {
      // Preserve any fields we don't surface in the editor.
      ...(insight ?? {}),
      summary: summary.trim(),
      problems: problems.map((p) => p.trim()).filter(Boolean),
      improvements: improvements.map((p) => p.trim()).filter(Boolean),
      estimatedMissedCustomersPerMonth: toNumberOrNull(missed),
      estimatedLostRevenuePerMonth: toNumberOrNull(lost),
    };
    const { error } = await supabase.from("leads").update({ insight: next }).eq("id", leadId);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save insight");
      return;
    }
    toast.success("Insight updated");
    setEditing(false);
    router.refresh();
  }

  const problemList = asStringList(insight?.problems);
  const improvementList = asStringList(insight?.improvements);
  const hasAnything =
    insight && (insight.summary || problemList.length || improvementList.length ||
      insight.estimatedMissedCustomersPerMonth != null || insight.estimatedLostRevenuePerMonth != null);

  if (editing) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4 text-primary" /> Edit insight</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-0">
          <div className="space-y-2">
            <Label htmlFor="insight-summary">Summary</Label>
            <Textarea
              id="insight-summary"
              rows={3}
              value={summary}
              placeholder="Short overview of this business's online presence…"
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>

          <EditableList label="Problems found" items={problems} onChange={setProblems} placeholder="e.g. Website design is outdated" />
          <EditableList label="Suggested improvements" items={improvements} onChange={setImprovements} placeholder="e.g. Rebuild on a modern, mobile-first stack" />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="insight-missed">Est. missed customers / mo</Label>
              <Input id="insight-missed" inputMode="numeric" value={missed} placeholder="e.g. 25" onChange={(e) => setMissed(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="insight-lost">Est. lost revenue / mo</Label>
              <Input id="insight-lost" inputMode="numeric" value={lost} placeholder="e.g. 4000" onChange={(e) => setLost(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {hasAnything ? (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4 text-primary" /> AI insight</CardTitle>
              <Button variant="outline" size="sm" onClick={startEditing}><Pencil className="mr-1 h-4 w-4" /> Edit</Button>
            </CardHeader>
            {insight.summary && <CardContent className="pt-0 text-sm">{insight.summary}</CardContent>}
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="flex items-center gap-3 py-5">
                <Users className="h-8 w-8 text-warning" />
                <div>
                  <div className="text-xs text-muted-foreground">Est. missed customers / mo</div>
                  <div className="text-xl font-semibold">{formatNumber(insight.estimatedMissedCustomersPerMonth)}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-5">
                <TrendingDown className="h-8 w-8 text-destructive" />
                <div>
                  <div className="text-xs text-muted-foreground">Est. lost revenue / mo</div>
                  <div className="text-xl font-semibold">{formatCurrency(insight.estimatedLostRevenuePerMonth)}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {problemList.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Problems found</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {problemList.map((p, i) => <li key={i} className="flex gap-2"><span className="text-destructive">•</span> {p}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}
          {improvementList.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Suggested improvements</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {improvementList.map((p, i) => <li key={i} className="flex gap-2"><span className="text-success">→</span> {p}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <p>AI insight will appear here once the audit + insight jobs complete — or add the details yourself.</p>
            <Button variant="outline" size="sm" onClick={startEditing}><Pencil className="mr-1 h-4 w-4" /> Add insight manually</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
