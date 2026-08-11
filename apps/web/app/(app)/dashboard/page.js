import Link from "next/link";
import { Search, Building2, Target, Mail, MailOpen, Reply, CalendarCheck, TrendingUp } from "lucide-react";
import { getUserAndOrg } from "@/lib/org";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/utils";
import { PipelineChart } from "@/components/dashboard/pipeline-chart";
import { WarmupBanner } from "@/components/dashboard/warmup-banner";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@leadforge/shared/constants";

export const metadata = { title: "Dashboard — LeadForge" };

async function loadStats(supabase, orgId) {
  const countOf = async (table, apply) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true }).eq("org_id", orgId);
    if (apply) q = apply(q);
    const { count } = await q;
    return count ?? 0;
  };

  const [businesses, qualified, sent, opened, replied, meetings, won] = await Promise.all([
    countOf("businesses"),
    countOf("leads", (q) => q.gte("lead_score", 70)),
    countOf("emails", (q) => q.eq("status", "sent")),
    countOf("email_events", (q) => q.eq("type", "opened")),
    countOf("email_events", (q) => q.eq("type", "replied")),
    countOf("leads", (q) => q.eq("status", "meeting")),
    countOf("leads", (q) => q.eq("status", "won")),
  ]);

  // Pipeline distribution (one grouped query, counted in JS).
  const { data: statusRows } = await supabase.from("leads").select("status").eq("org_id", orgId);
  const counts = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0]));
  for (const r of statusRows ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const pipeline = LEAD_STATUSES.map((s) => ({ label: LEAD_STATUS_LABELS[s], count: counts[s] ?? 0 }));

  return {
    businesses,
    qualified,
    sent,
    openRate: sent ? (opened / sent) * 100 : 0,
    replyRate: sent ? (replied / sent) * 100 : 0,
    meetings,
    conversion: businesses ? (won / businesses) * 100 : 0,
    pipeline,
  };
}

export default async function DashboardPage() {
  const { supabase, orgId } = await getUserAndOrg();
  const stats = await loadStats(supabase, orgId);
  const empty = stats.businesses === 0;

  return (
    <div>
      <PageHeader title="Dashboard" description="Your outreach at a glance.">
        <Button asChild>
          <Link href="/search">
            <Search className="h-4 w-4" />
            Find leads
          </Link>
        </Button>
      </PageHeader>

      <WarmupBanner />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Businesses scanned" value={formatNumber(stats.businesses)} icon={Building2} />
        <StatCard label="Qualified leads" value={formatNumber(stats.qualified)} icon={Target} hint="Score ≥ 70" />
        <StatCard label="Emails sent" value={formatNumber(stats.sent)} icon={Mail} />
        <StatCard label="Open rate" value={formatPercent(stats.openRate)} icon={MailOpen} />
        <StatCard label="Reply rate" value={formatPercent(stats.replyRate)} icon={Reply} />
        <StatCard label="Meetings booked" value={formatNumber(stats.meetings)} icon={CalendarCheck} />
        <StatCard label="Conversion" value={formatPercent(stats.conversion)} icon={TrendingUp} hint="Won / scanned" />
      </div>

      {!empty && (
        <div className="mt-4">
          <PipelineChart data={stats.pipeline} />
        </div>
      )}

      {empty && (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Search className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-lg font-medium">No leads yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Run your first search to find local businesses, audit their websites with AI, and
                start building your pipeline.
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/search">
                <Search className="h-4 w-4" />
                Find your first leads
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
