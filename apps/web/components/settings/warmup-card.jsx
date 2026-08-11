"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Domain warm-up + send pacing.
//
// A new sending domain gets spam-foldered no matter how clean its headers are,
// so outreach starts against a list of people who agreed to reply, at a ramping
// daily cap, and only unlocks real leads once that's done. This card is where
// the operator manages the seed list and watches the ramp.

const TIMEZONES = [
  "Europe/Stockholm",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dhaka",
  "Asia/Dubai",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

function hourLabel(h) {
  return `${String(h).padStart(2, "0")}:00`;
}

export function WarmupCard() {
  const [state, setState] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/warmup");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load warm-up state");
      setState(json);
    } catch (e) {
      toast.error(e.message);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function post(url, body, method = "POST") {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      return json;
    } catch (e) {
      toast.error(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function act(action, extra) {
    const json = await post("/api/warmup", { action, ...extra });
    if (json) {
      setState(json);
      if (action === "start") toast.success("Warm-up started — the worker takes it from here.");
      if (action === "stop") toast.success("Warm-up stopped. Sending is unmetered again.");
      if (action === "finish") toast.success("Graduated — outreach to leads is unlocked.");
    }
  }

  async function addContact(e) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    // A pasted list goes in as a list; a single address keeps its name.
    const multi = /[\s,;]/.test(value);
    const json = await post("/api/warmup/contacts", multi ? { emails: value } : { email: value, name });
    if (json) {
      toast.success(json.added ? `Added ${json.added} contact${json.added === 1 ? "" : "s"}` : "Already on the list");
      setEmail("");
      setName("");
      load();
    }
  }

  async function removeContact(id) {
    const json = await post(`/api/warmup/contacts?id=${id}`, null, "DELETE");
    if (json) load();
  }

  async function saveSettings(patch) {
    const json = await post("/api/warmup", { action: "settings", ...patch });
    if (json) setState(json);
  }

  if (!state) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Domain warm-up</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { settings, contacts, day, daysLeft, sentToday, cap, repliesSeen, complete } = state;
  const mode = settings.mode;
  const warming = mode === "warming" && !complete;

  const modeBadge =
    mode === "warming" ? (
      <Badge variant="orange">Warming up · day {day} of {settings.warmup_days}</Badge>
    ) : mode === "live" ? (
      <Badge variant="green">Live · capped</Badge>
    ) : (
      <Badge variant="secondary">Not started</Badge>
    );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Domain warm-up &amp; send pacing</CardTitle>
            <CardDescription>
              Build sender reputation before mailing real leads: a ramping daily cap, sends spread
              through your window, and replies from people you trust.
            </CardDescription>
          </div>
          {modeBadge}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── live counters ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Sent today" value={cap ? `${sentToday} / ${cap}` : String(sentToday)} />
          <Stat label="Daily cap" value={cap ?? "unmetered"} />
          <Stat label="Replies from seeds" value={`${repliesSeen} / ${contacts.length}`} />
          <Stat label="Days left" value={warming ? daysLeft : "—"} />
        </div>

        {warming && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            Outreach to leads is blocked for {daysLeft} more day{daysLeft === 1 ? "" : "s"}. Warm-up
            mail goes out automatically to the contacts below — ask them to reply, and to drag the
            message to their main inbox if it lands in spam or promotions.
          </p>
        )}

        {/* ── seed contacts ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <div>
            <Label>Warm-up contacts</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              People who will actually reply. Spread them across providers (Gmail, Outlook, Yahoo)
              for a stronger signal.
            </p>
          </div>

          <form onSubmit={addContact} className="flex flex-wrap gap-2">
            <Input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com — or paste several"
              className="min-w-[220px] flex-1"
            />
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First name (optional)"
              className="w-40"
            />
            <Button type="submit" disabled={busy || !email.trim()}>
              Add
            </Button>
          </form>

          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.name || c.email}</div>
                    {c.name && <div className="truncate text-xs text-muted-foreground">{c.email}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.replied_at ? (
                      <Badge variant="green">replied</Badge>
                    ) : c.last_sent_at ? (
                      <Badge variant="secondary">awaiting reply</Badge>
                    ) : (
                      <Badge variant="outline">not mailed yet</Badge>
                    )}
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => removeContact(c.id)}>
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── window + timezone ─────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <select
              value={settings.timezone}
              disabled={busy}
              onChange={(e) => saveSettings({ timezone: e.target.value })}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Window starts</Label>
            <select
              value={settings.window_start_hour}
              disabled={busy}
              onChange={(e) => saveSettings({ windowStartHour: Number(e.target.value) })}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Window ends</Label>
            <select
              value={settings.window_end_hour}
              disabled={busy}
              onChange={(e) => saveSettings({ windowEndHour: Number(e.target.value) })}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h % 24)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Sends only go out Mon–Fri inside this window, spaced with random gaps. Ramp: 8/day in week
          1, 15 in week 2, then 25 → 40 → 50/day — and at most one warm-up email per contact per
          day, so a short list isn&apos;t mailed repeatedly. You&apos;ll get an email when warm-up
          finishes.
        </p>

        {/* ── actions ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {mode !== "warming" && (
            <Button disabled={busy || contacts.length === 0} onClick={() => act("start")}>
              Start 14-day warm-up
            </Button>
          )}
          {mode === "warming" && (
            <>
              <Button variant="outline" disabled={busy} onClick={() => act("finish")}>
                Graduate now
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => act("stop")}>
                Stop warm-up
              </Button>
            </>
          )}
          {mode === "live" && (
            <Button variant="ghost" disabled={busy} onClick={() => act("stop")}>
              Turn off pacing
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
