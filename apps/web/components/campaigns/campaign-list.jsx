"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MailOpen, MousePointerClick } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Send } from "lucide-react";

export function CampaignList({ orgId }) {
  const supabase = React.useMemo(() => createClient(), []);
  const queryClient = useQueryClient();

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ["emails", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("id, to_email, subject, status, sent_at, created_at, email_events(type)")
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
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Recipient</th>
            <th className="px-4 py-3 font-medium">Subject</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Activity</th>
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
                  <Badge variant={e.status === "sent" ? "green" : e.status === "failed" ? "red" : "secondary"}>
                    {e.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Sent</span>
                    {types.has("opened") && <span className="inline-flex items-center gap-1 text-success"><MailOpen className="h-3.5 w-3.5" /> Opened</span>}
                    {types.has("clicked") && <span className="inline-flex items-center gap-1 text-primary"><MousePointerClick className="h-3.5 w-3.5" /> Clicked</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
