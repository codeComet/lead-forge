"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCw, Pencil, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Re-audit + manually fix a business's website / contact email. Lives on the
// lead detail page so a missed or wrong URL can be corrected and re-scanned
// without going back to the search list.
export function BusinessTools({ business, lead }) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [triggering, setTriggering] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [website, setWebsite] = React.useState(business?.website || "");
  const [email, setEmail] = React.useState(lead?.contact_email || "");

  // Live audit status. Audits aren't in the realtime publication, so poll while
  // one is queued/running (same pattern the demo card uses).
  const { data: audit } = useQuery({
    queryKey: ["audit-status", business.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audits")
        .select("status, error, updated_at")
        .eq("business_id", business.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    refetchInterval: (q) =>
      ["pending", "running"].includes(q.state.data?.status) ? 2500 : false,
  });

  const running = audit?.status === "pending" || audit?.status === "running";

  // When a run we were watching finishes, pull the fresh audit into the page.
  const prevStatus = React.useRef(audit?.status);
  React.useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = audit?.status;
    if (!["pending", "running"].includes(prev)) return;
    if (audit?.status === "done") {
      toast.success("Audit finished — refreshing results.");
      router.refresh();
    } else if (audit?.status === "failed") {
      toast.error(audit.error || "Audit failed.");
    }
  }, [audit?.status, audit?.error, router]);

  async function reaudit() {
    setTriggering(true);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessIds: [business.id] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast.success("Re-audit queued…");
      // The route just upserted status=pending; refetch so the poll starts.
      await queryClient.invalidateQueries({ queryKey: ["audit-status", business.id] });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTriggering(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/businesses/${business.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website, contactEmail: email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setOpen(false);
      toast.success("Saved. Re-auditing with the new details…");
      router.refresh();
      // A manual website is the whole point of re-auditing — kick one off.
      await reaudit();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const busy = triggering || running;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={reaudit} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {running ? "Auditing…" : "Re-audit"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4" /> Edit details
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit business details</DialogTitle>
            <DialogDescription>
              Add the website or email if the audit missed them. Saving re-audits the site
              automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="example.com"
                type="url"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contact email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@business.com"
                type="email"
              />
              <p className="text-xs text-muted-foreground">
                A manually entered email is marked <span className="font-medium">verified</span>.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save &amp; re-audit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>

      {running && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Audit running — this updates automatically.
        </div>
      )}
      {audit?.status === "done" && audit.updated_at && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Last audited{" "}
          {new Date(audit.updated_at).toLocaleString()}
        </div>
      )}
      {audit?.status === "failed" && (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" /> {audit.error || "Audit failed."}
        </div>
      )}
    </div>
  );
}
