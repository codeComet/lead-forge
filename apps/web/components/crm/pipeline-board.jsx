"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ScoreBadge } from "@/components/score-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@leadforge/shared/constants";
import { cn } from "@/lib/utils";

export function PipelineBoard({ orgId }) {
  const supabase = React.useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [dragId, setDragId] = React.useState(null);
  const [overCol, setOverCol] = React.useState(null);
  const [grouped, setGrouped] = React.useState(true);
  // Collapsed groups, keyed "status::groupKey".
  const [collapsed, setCollapsed] = React.useState(() => new Set());
  const toggleGroup = (key) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, status, lead_score, color, business_id, businesses(name, city, business_type, website)")
        .eq("org_id", orgId)
        .order("lead_score", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  React.useEffect(() => {
    const channel = supabase
      .channel(`org-${orgId}-crm`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `org_id=eq.${orgId}` }, () =>
        queryClient.invalidateQueries({ queryKey: ["leads", orgId] }),
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [supabase, orgId, queryClient]);

  async function move(leadId, status) {
    // Optimistic update.
    queryClient.setQueryData(["leads", orgId], (old) =>
      (old ?? []).map((l) => (l.id === leadId ? { ...l, status } : l)),
    );
    const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
    if (error) {
      toast.error(error.message);
      queryClient.invalidateQueries({ queryKey: ["leads", orgId] });
    }
  }

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto">
        {LEAD_STATUSES.map((s) => (
          <div key={s} className="w-64 shrink-0 space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    );
  }

  const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, []]));
  for (const l of leads) (byStatus[l.status] ??= []).push(l);

  // Cluster a column's leads by location + business type so related businesses
  // sit together. Returns [{ key, label, items }] sorted by size then name.
  function groupColumn(list) {
    const map = new Map();
    for (const l of list) {
      const city = l.businesses?.city?.trim() || "Unknown location";
      const type = l.businesses?.business_type?.trim() || "Other";
      const key = `${city} · ${type}`;
      if (!map.has(key)) map.set(key, { key, label: key, items: [] });
      map.get(key).items.push(l);
    }
    return [...map.values()].sort(
      (a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label),
    );
  }

  function renderCard(l) {
    return (
      <Link
        key={l.id}
        href={`/leads/${l.business_id}`}
        draggable
        onDragStart={() => setDragId(l.id)}
        onDragEnd={() => setDragId(null)}
        className={cn(
          "block cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm transition hover:border-primary/50 active:cursor-grabbing",
          dragId === l.id && "opacity-50",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-sm font-medium">{l.businesses?.name}</span>
          <ScoreBadge score={l.lead_score} color={l.color} />
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {l.businesses?.city && <span>{l.businesses.city}</span>}
          {!l.businesses?.website && <span className="text-destructive">No website</span>}
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setGrouped((g) => !g)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
            grouped
              ? "border-primary bg-primary/5 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Group by location + type
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
      {LEAD_STATUSES.map((status) => (
        <div
          key={status}
          onDragOver={(e) => {
            e.preventDefault();
            setOverCol(status);
          }}
          onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
          onDrop={() => {
            if (dragId) move(dragId, status);
            setDragId(null);
            setOverCol(null);
          }}
          className={cn(
            "flex w-64 shrink-0 flex-col rounded-xl border border-border bg-card/40 p-2 transition-colors",
            overCol === status && "border-primary bg-primary/5",
          )}
        >
          <div className="flex items-center justify-between px-2 py-1.5 text-sm font-medium">
            {LEAD_STATUS_LABELS[status]}
            <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">
              {byStatus[status].length}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-2 pt-1">
            {!grouped
              ? byStatus[status].map((l) => renderCard(l))
              : groupColumn(byStatus[status]).map((g) => {
                  const gKey = `${status}::${g.key}`;
                  const isCollapsed = collapsed.has(gKey);
                  return (
                    <div key={gKey} className="space-y-2">
                      <button
                        type="button"
                        onClick={() => toggleGroup(gKey)}
                        className="flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="truncate" title={g.label}>{g.label}</span>
                        <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-[11px]">
                          {g.items.length}
                        </span>
                      </button>
                      {!isCollapsed && g.items.map((l) => renderCard(l))}
                    </div>
                  );
                })}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
