"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Play, X, Lightbulb, Trash2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { one } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchForm } from "@/components/search/search-form";
import { ResultsTable } from "@/components/search/results-table";
import { ResultsMap } from "@/components/search/results-map";
import { LeadFilters, DEFAULT_FILTERS, applyFilters } from "@/components/search/lead-filters";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const SELECT =
  "*, audits(status, overall_score), leads(lead_score, color, status)";

export function SearchClient({ orgId }) {
  const supabase = React.useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [searching, setSearching] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState(null);
  const [filters, setFilters] = React.useState(DEFAULT_FILTERS);
  const [checkedIds, setCheckedIds] = React.useState(() => new Set());
  const [pendingIds, setPendingIds] = React.useState(() => new Set());
  const [deleting, setDeleting] = React.useState(false);

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ["businesses", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select(SELECT)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
    // Poll while any audit is in flight — covers setups where Postgres realtime
    // isn't enabled for the audits table. Stops once nothing is running.
    refetchInterval: (query) => {
      const rows = query.state.data ?? [];
      const active = rows.some((b) => {
        const st = one(b.audits ?? b.audit)?.status;
        return st === "pending" || st === "running";
      });
      return active ? 2500 : false;
    },
  });

  // Live-update the list as audits / leads change.
  React.useEffect(() => {
    const channel = supabase
      .channel(`org-${orgId}-search`)
      .on("postgres_changes", { event: "*", schema: "public", table: "audits", filter: `org_id=eq.${orgId}` }, () =>
        queryClient.invalidateQueries({ queryKey: ["businesses", orgId] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `org_id=eq.${orgId}` }, () =>
        queryClient.invalidateQueries({ queryKey: ["businesses", orgId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, orgId, queryClient]);

  async function onSearch(form) {
    setSearching(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Search failed");

      // Show results immediately (don't wait for the refetch roundtrip).
      if (json.businesses?.length) {
        queryClient.setQueryData(["businesses", orgId], (old = []) => {
          const incoming = json.businesses.map((b) => ({ audits: [], leads: [], ...b }));
          const seen = new Set(incoming.map((b) => b.id));
          return [...incoming, ...old.filter((b) => !seen.has(b.id))];
        });
      }
      // Reconcile with the server (picks up nested audits/leads) in the background.
      queryClient.invalidateQueries({ queryKey: ["businesses", orgId] });

      if (json.businesses.length === 0) {
        toast.info("No businesses found. Try a broader area or different type.");
      } else {
        toast.success(`Found ${json.businesses.length} businesses. Select any to audit.`);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSearching(false);
    }
  }

  // Priority ranking: no-website + green (hot) leads float to the top, then by
  // lead score, then un-audited sites at the bottom.
  const filtered = React.useMemo(() => {
    const rank = (b) => {
      const lead = one(b.leads);
      const score = lead?.lead_score;
      if (!b.website) return 10000; // no website = best opportunity, even pre-audit
      if (lead?.color === "green") return 9000 + (score ?? 0);
      if (score != null) return score; // orange / red ranked by score
      return -1; // has a site but not audited yet → bottom
    };
    return [...applyFilters(businesses, filters)].sort((a, b) => rank(b) - rank(a));
  }, [businesses, filters]);

  function toggleCheck(id) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll(on) {
    setCheckedIds(on ? new Set(filtered.map((b) => b.id)) : new Set());
  }

  async function runAudits(ids) {
    if (!ids.length) return;
    setPendingIds((prev) => new Set([...prev, ...ids]));
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessIds: ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to queue audit");
      toast.success(`Auditing ${json.count} ${json.count === 1 ? "business" : "businesses"}…`);
      setCheckedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["businesses", orgId] });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  // Bulk-delete businesses (leads/audits/demos cascade via FK). RLS restricts
  // the delete to this org. Removes the rows from the cache immediately.
  async function deleteBusinesses(ids) {
    if (!ids.length) return;
    const noun = ids.length === 1 ? "lead" : "leads";
    if (!window.confirm(`Delete ${ids.length} ${noun}? This also removes their audit, score, and any generated demos. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("businesses").delete().in("id", ids).eq("org_id", orgId);
      if (error) throw error;
      queryClient.setQueryData(["businesses", orgId], (old = []) => old.filter((b) => !ids.includes(b.id)));
      setCheckedIds(new Set());
      if (selectedId && ids.includes(selectedId)) setSelectedId(null);
      toast.success(`Deleted ${ids.length} ${noun}.`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  }

  const checkedCount = filtered.filter((b) => checkedIds.has(b.id)).length;

  return (
    <div className="space-y-6">
      <SearchForm onSearch={onSearch} loading={searching} />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : businesses.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No businesses yet"
          description="Run a search above to discover local businesses and start auditing them."
        />
      ) : (
        <>
          <div className="flex gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="space-y-1 text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Score = opportunity, not site quality.</span>{" "}
                Higher = more problems you can fix = hotter lead. No website scores highest (+72).
              </p>
              <p>
                <span className="text-success">● Green ≥70</span> hot ·{" "}
                <span className="text-warning">● Orange 40–69</span> decent ·{" "}
                <span className="text-destructive">● Red &lt;40</span> weak (site already fine — skip).
                No-website &amp; green leads are pinned to the top.
              </p>
            </div>
          </div>
          <LeadFilters value={filters} onChange={setFilters} count={filtered.length} total={businesses.length} />
          {checkedCount > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-accent/40 px-4 py-2.5">
              <span className="text-sm font-medium">{checkedCount} selected</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => toggleAll(false)}>
                  <X className="mr-1 h-3.5 w-3.5" /> Clear
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={deleting}
                  onClick={() => deleteBusinesses(filtered.filter((b) => checkedIds.has(b.id)).map((b) => b.id))}
                >
                  {deleting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />} Delete
                </Button>
                <Button
                  size="sm"
                  onClick={() => runAudits(filtered.filter((b) => checkedIds.has(b.id)).map((b) => b.id))}
                >
                  <Play className="mr-1 h-3.5 w-3.5" /> Audit selected ({checkedCount})
                </Button>
              </div>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ResultsTable
                businesses={filtered}
                selectedId={selectedId}
                onSelect={setSelectedId}
                checkedIds={checkedIds}
                onToggleCheck={toggleCheck}
                onToggleAll={toggleAll}
                pendingIds={pendingIds}
                onRunOne={(id) => runAudits([id])}
              />
            </div>
            <div className="lg:sticky lg:top-4 lg:h-[560px]">
              <ResultsMap businesses={filtered} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
