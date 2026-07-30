"use client";

import Link from "next/link";
import { Star, Globe, ExternalLink, Loader2, CircleAlert, CircleCheck, Play, RotateCw } from "lucide-react";
import { ScoreBadge } from "@/components/score-badge";
import { cn, one } from "@/lib/utils";

function AuditCell({ audit, isPending, onRun }) {
  const status = audit?.status;

  if (isPending || status === "pending" || status === "running") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> {status === "running" ? "Auditing" : "Queued"}
      </span>
    );
  }

  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <CircleCheck className="h-3 w-3" /> Audited
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRun(); }}
          title="Re-run audit"
          className="text-muted-foreground hover:text-foreground"
        >
          <RotateCw className="h-3 w-3" />
        </button>
      </span>
    );
  }

  const failed = status === "failed";
  return (
    <span className="inline-flex items-center gap-2">
      {failed && (
        <span className="inline-flex items-center gap-1 text-xs text-destructive">
          <CircleAlert className="h-3 w-3" /> Failed
        </span>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRun(); }}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-accent"
      >
        <Play className="h-3 w-3" /> {failed ? "Retry" : "Run audit"}
      </button>
    </span>
  );
}

const STATUS_STYLES = {
  new: "bg-muted text-muted-foreground",
  contacted: "bg-primary/10 text-primary",
  opened: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  replied: "bg-success/10 text-success",
  meeting: "bg-warning/10 text-warning",
  won: "bg-success/15 text-success",
  lost: "bg-destructive/10 text-destructive",
};

function StatusCell({ status }) {
  if (!status) {
    return <span className="text-xs text-muted-foreground">Not contacted</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

export function ResultsTable({
  businesses,
  selectedId,
  onSelect,
  checkedIds = new Set(),
  onToggleCheck,
  onToggleAll,
  pendingIds = new Set(),
  onRunOne,
}) {
  const allChecked = businesses.length > 0 && businesses.every((b) => checkedIds.has(b.id));
  const someChecked = businesses.some((b) => checkedIds.has(b.id));

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="w-8 px-3 py-3">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allChecked}
                ref={(el) => el && (el.indeterminate = someChecked && !allChecked)}
                onChange={() => onToggleAll?.(!allChecked)}
                className="h-3.5 w-3.5 cursor-pointer accent-primary"
              />
            </th>
            <th className="px-4 py-3 font-medium">Business</th>
            <th className="px-4 py-3 font-medium">Rating</th>
            <th className="px-4 py-3 font-medium">Website</th>
            <th className="px-4 py-3 font-medium">Audit</th>
            <th className="px-4 py-3 font-medium">Score</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {businesses.map((b) => {
            const audit = one(b.audits ?? b.audit);
            const lead = one(b.leads ?? b.lead);
            return (
              <tr
                key={b.id}
                onClick={() => onSelect?.(b.id)}
                className={cn(
                  "cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/50",
                  selectedId === b.id && "bg-accent/60",
                )}
              >
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${b.name}`}
                    checked={checkedIds.has(b.id)}
                    onChange={() => onToggleCheck?.(b.id)}
                    className="h-3.5 w-3.5 cursor-pointer accent-primary"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{b.name}</div>
                  <div className="max-w-xs truncate text-xs text-muted-foreground">{b.address}</div>
                </td>
                <td className="px-4 py-3">
                  {b.rating != null ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                      {b.rating}
                      <span className="text-xs text-muted-foreground">({b.reviews ?? 0})</span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {b.website ? (
                    <a
                      href={b.website}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5" /> Visit
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                      No website
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <AuditCell audit={audit} isPending={pendingIds.has(b.id)} onRun={() => onRunOne?.(b.id)} />
                </td>
                <td className="px-4 py-3">
                  <ScoreBadge score={lead?.lead_score ?? null} color={lead?.color} />
                </td>
                <td className="px-4 py-3">
                  <StatusCell status={lead?.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/leads/${b.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
