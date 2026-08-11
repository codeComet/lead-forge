"use client";

import * as React from "react";
import Link from "next/link";
import { Flame, PartyPopper, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Warm-up state is otherwise invisible outside Settings — and it changes what
// the app will let you do (cold sends are blocked while it runs). Surface it
// where the operator actually looks, and announce graduation once.

const DISMISS_KEY = "leadforge.warmupGraduatedSeen";

export function WarmupBanner() {
  const [state, setState] = React.useState(null);
  const [dismissed, setDismissed] = React.useState(true); // assume dismissed until localStorage is read

  React.useEffect(() => {
    let alive = true;
    fetch("/api/warmup")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!alive || !json) return;
        setState(json);
        const seen = window.localStorage.getItem(DISMISS_KEY);
        // Re-announce if a *newer* warm-up graduated than the one already seen.
        setDismissed(!!seen && seen === (json.settings?.warmup_started_at ?? "none"));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!state) return null;

  const { settings, day, daysLeft, sentToday, cap, repliesSeen, contacts, complete } = state;
  const warming = settings.mode === "warming" && !complete;
  const graduated = settings.mode === "live" || (settings.mode === "warming" && complete);

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, settings.warmup_started_at ?? "none");
    setDismissed(true);
  }

  if (warming) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
        <Flame className="h-4 w-4 shrink-0 text-warning" />
        <span className="font-medium">
          Warm-up day {day} of {settings.warmup_days}
        </span>
        <span className="text-muted-foreground">
          {repliesSeen} of {contacts.length} contact{contacts.length === 1 ? "" : "s"} replied ·{" "}
          {sentToday}
          {cap ? `/${cap}` : ""} sent today · leads unlock in {daysLeft} day
          {daysLeft === 1 ? "" : "s"}
        </span>
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link href="/settings">Manage</Link>
        </Button>
      </div>
    );
  }

  if (graduated && !dismissed) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
        <PartyPopper className="h-4 w-4 shrink-0 text-success" />
        <span className="font-medium">Warm-up complete — outreach to leads is unlocked.</span>
        <span className="text-muted-foreground">
          {repliesSeen} of {contacts.length} seed{contacts.length === 1 ? "" : "s"} replied · cap now{" "}
          {cap ?? "unmetered"}/day
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={dismiss} aria-label="Dismiss">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return null;
}
