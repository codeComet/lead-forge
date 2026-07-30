"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Loader2, Mail, Copy, FileText, Globe, ExternalLink, Link2, CheckCircle2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@leadforge/shared/constants";
import { ProviderSelect } from "@/components/providers/provider-select";

export function LeadActions({ lead, business }) {
  const supabase = React.useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [generating, setGenerating] = React.useState(false);
  const [buildingDemo, setBuildingDemo] = React.useState(false);
  const [status, setStatus] = React.useState(lead.status);
  const [provider, setProvider] = React.useState("");

  const { data: proposals = [] } = useQuery({
    queryKey: ["proposals", lead.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("*")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Keep at most one proposal per lead: purge older duplicates left over from
  // before dedup. Newest (proposals[0]) is kept; the rest are deleted once.
  React.useEffect(() => {
    if (proposals.length <= 1) return;
    const staleIds = proposals.slice(1).map((p) => p.id);
    supabase
      .from("proposals")
      .delete()
      .in("id", staleIds)
      .then(({ error }) => {
        if (!error) queryClient.invalidateQueries({ queryKey: ["proposals", lead.id] });
      });
  }, [proposals, supabase, queryClient, lead.id]);

  const { data: demos = [] } = useQuery({
    queryKey: ["demos", lead.business_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_demos")
        .select("id, slug, status, views, error, created_at")
        .eq("business_id", lead.business_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    // Poll while a demo is being built (realtime is also enabled for the table).
    refetchInterval: (q) =>
      (q.state.data ?? []).some((d) => d.status === "pending" || d.status === "running") ? 3000 : false,
  });

  async function generateDemo() {
    setBuildingDemo(true);
    try {
      const res = await fetch("/api/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: lead.business_id, provider: provider || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      await queryClient.invalidateQueries({ queryKey: ["demos", lead.business_id] });
      toast.success("Building your demo site… (~30s)");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBuildingDemo(false);
    }
  }

  async function generateProposal() {
    setGenerating(true);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      await queryClient.invalidateQueries({ queryKey: ["proposals", lead.id] });
      toast.success("Proposal generated.");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function updateStatus(next) {
    setStatus(next);
    const { error } = await supabase.from("leads").update({ status: next }).eq("id", lead.id);
    if (error) toast.error(error.message);
    else toast.success(`Moved to ${LEAD_STATUS_LABELS[next]}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={generateProposal} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generate proposal
        </Button>
        <Button variant="outline" onClick={generateDemo} disabled={buildingDemo}>
          {buildingDemo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
          {demos.length ? "Rebuild demo site" : "Generate demo site"}
        </Button>
        <ProviderSelect onChange={setProvider} />
        <select
          value={status}
          onChange={(e) => updateStatus(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {demos.length > 0 && (
        <DemoCard key={demos[0].id} demo={demos[0]} business={business} lead={lead} />
      )}

      {proposals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <FileText className="h-6 w-6" />
            No proposals yet. Generate one to draft a personalised outreach email.
          </CardContent>
        </Card>
      ) : (
        // Only ever show the latest proposal. Older rows (from before dedup) are
        // purged in the effect above; regenerating replaces this one.
        <ProposalCard
          key={proposals[0].id}
          proposal={proposals[0]}
          business={business}
          lead={lead}
          demo={demos.find((d) => d.status === "done")}
        />
      )}
    </div>
  );
}

function previewUrl(demo) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Short /p/<slug> link; fall back to the uuid path for pre-slug demos.
  return demo.slug ? `${origin}/p/${demo.slug}` : `${origin}/preview/${demo.id}`;
}

// Time-estimated build progress. The worker emits no real percentage, so we
// model the ~30s build as an asymptotic curve that fills toward ~95% and never
// quite reaches 100 — completion is detected separately (the 3s poll flips
// status to "done"), and we snap to 100 then. `key`-remounting on demo.id
// resets the clock for each new build/rebuild.
function useBuildProgress(demo) {
  const building = demo.status === "pending" || demo.status === "running";
  const startedAt = React.useMemo(
    () => new Date(demo.created_at || Date.now()).getTime(),
    [demo.created_at],
  );
  const [pct, setPct] = React.useState(0);

  React.useEffect(() => {
    if (!building) {
      // Snap to full on done; leave wherever it was on failure.
      if (demo.status === "done") setPct(100);
      return;
    }
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      // 1 - e^(-t/14) → ~63% at 14s, ~86% at 28s, capped at 95%.
      const next = Math.min(95, 100 * (1 - Math.exp(-elapsed / 14)));
      setPct((p) => Math.max(p, next));
    };
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [building, demo.status, startedAt]);

  return { building, pct };
}

function DemoCard({ demo, business, lead }) {
  const url = previewUrl(demo);
  const { building, pct } = useBuildProgress(demo);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 font-medium">
                Demo website
                {demo.status === "done" && <CheckCircle2 className="h-4 w-4 text-success" />}
                {demo.status === "failed" && <AlertCircle className="h-4 w-4 text-destructive" />}
              </div>
              <div className="text-xs text-muted-foreground">
                {building && `Building… ${Math.round(pct)}% · refreshes automatically`}
                {demo.status === "done" && `Ready · ${demo.views ?? 0} view${demo.views === 1 ? "" : "s"}`}
                {demo.status === "failed" && (demo.error || "Generation failed")}
              </div>
            </div>
          </div>

          {demo.status === "done" && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> Preview
                </a>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(url);
                  toast.success("Preview link copied");
                }}
              >
                <Link2 className="h-4 w-4" /> Copy link
              </Button>
            </div>
          )}
          {building && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>

        {building && (
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Building demo website"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProposalCard({ proposal, business, lead, demo }) {
  const [sending, setSending] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [to, setTo] = React.useState(lead.contact_email || "");
  const [subject, setSubject] = React.useState(proposal.subject || "");
  const [body, setBody] = React.useState(proposal.body || "");

  const demoLink = demo ? previewUrl(demo) : null;
  const linkIncluded = demoLink && body.includes(demoLink);

  function addPreviewLink() {
    if (!demoLink || linkIncluded) return;
    setBody(
      (b) =>
        `${b.trim()}\n\nI've already made a demo for you so you can see how your business could look online:\n${demoLink}\n\nWe can go through it together and see if it fits what you need — no pressure at all.`,
    );
    toast.success("Preview link added to the email");
  }

  // Offer the link automatically the first time the dialog opens.
  React.useEffect(() => {
    if (open && demoLink && !linkIncluded) addPreviewLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function send() {
    if (!to.trim()) {
      toast.error("Enter a recipient email.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, proposalId: proposal.id, to, subject, body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send");
      toast.success(json.queued ? "Email queued for sending." : "Email recorded.");
      setOpen(false);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="font-medium">{proposal.subject}</div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(proposal.body);
                toast.success("Copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Mail className="h-4 w-4" /> Send
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send outreach email</DialogTitle>
                  <DialogDescription>To {business?.name}. Review before sending.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>To</Label>
                    <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="owner@business.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Subject</Label>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Body</Label>
                      {demoLink && !linkIncluded && (
                        <button
                          type="button"
                          onClick={addPreviewLink}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Globe className="h-3 w-3" /> Add demo preview link
                        </button>
                      )}
                      {linkIncluded && (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="h-3 w-3" /> Preview link included
                        </span>
                      )}
                    </div>
                    <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
                  </div>
                  <Button onClick={send} disabled={sending} className="w-full">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    Send email
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{proposal.body}</p>
      </CardContent>
    </Card>
  );
}
