"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, MailOpen, MousePointerClick, Reply, Trash2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Send } from "lucide-react";

export function CampaignList({ orgId }) {
  const supabase = React.useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  // id currently being deleted, or "all" while clearing the table.
  const [deleting, setDeleting] = React.useState(null);

  // Delete one email (email_events cascade via FK). RLS scopes to the org.
  async function deleteOne(id) {
    if (!window.confirm("Delete this email from the campaign log?")) return;
    setDeleting(id);
    const { error } = await supabase.from("emails").delete().eq("id", id);
    setDeleting(null);
    if (error) return toast.error(error.message);
    toast.success("Email deleted.");
    queryClient.invalidateQueries({ queryKey: ["emails", orgId] });
  }

  async function clearAll() {
    if (!window.confirm("Delete ALL emails in the campaign log? This can't be undone.")) return;
    setDeleting("all");
    const { error } = await supabase.from("emails").delete().eq("org_id", orgId);
    setDeleting(null);
    if (error) return toast.error(error.message);
    toast.success("Campaign log cleared.");
    queryClient.invalidateQueries({ queryKey: ["emails", orgId] });
  }

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ["emails", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("id, to_email, subject, status, kind, scheduled_at, sent_at, created_at, email_events(type)")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  React.useEffect(() => {
    const channel = supabase
      .channel(`org-${orgId}-emails`)
      .on("postgres_changes", { event: "*", schema: "public", table: "email_events", filter: `org_id=eq.${orgId}` }, () =>
        queryClient.invalidateQueries({ queryKey: ["emails", orgId] }),
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [supabase, orgId, queryClient]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <EmptyState
        icon={Send}
        title="No emails sent yet"
        description="Open a lead, generate a proposal, and send it. Sent emails and their open/click activity show up here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          disabled={deleting === "all"}
          className="text-muted-foreground hover:text-destructive"
        >
          {deleting === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Clear all
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Recipient</th>
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Activity</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {emails.map((e) => {
              const types = new Set((e.email_events ?? []).map((x) => x.type));
              return (
                <tr key={e.id} className="border-b border-border/60">
                  <td className="px-4 py-3 font-medium">{e.to_email}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">{e.subject}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={e.status === "sent" ? "green" : e.status === "failed" ? "red" : "secondary"}>
                        {e.status}
                      </Badge>
                      {e.kind === "warmup" && <Badge variant="outline">warm-up</Badge>}
                    </div>
                    {/* Sends are paced, so a queued row is waiting on its slot. */}
                    {e.status === "queued" && e.scheduled_at && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {new Date(e.scheduled_at).toLocaleString(undefined, {
                          weekday: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {e.status === "sent" && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Sent</span>}
                      {types.has("opened") && <span className="inline-flex items-center gap-1 text-success"><MailOpen className="h-3.5 w-3.5" /> Opened</span>}
                      {types.has("clicked") && <span className="inline-flex items-center gap-1 text-primary"><MousePointerClick className="h-3.5 w-3.5" /> Clicked</span>}
                      {types.has("replied") && <span className="inline-flex items-center gap-1 text-success"><Reply className="h-3.5 w-3.5" /> Replied</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteOne(e.id)}
                      disabled={deleting === e.id}
                      aria-label="Delete email"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      {deleting === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
