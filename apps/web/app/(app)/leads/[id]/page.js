import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, MapPin, Phone, Mail, Star, ExternalLink } from "lucide-react";
import { getUserAndOrg } from "@/lib/org";
import { PageHeader } from "@/components/page-header";
import { ScoreRing } from "@/components/audit/score-ring";
import { AuditDetail } from "@/components/audit/audit-detail";
import { LeadActions } from "@/components/leads/lead-actions";
import { BusinessTools } from "@/components/leads/business-tools";
import { InsightPanel } from "@/components/leads/insight-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { one } from "@/lib/utils";

export default async function LeadDetailPage({ params }) {
  const { id } = await params;
  const { supabase, orgId } = await getUserAndOrg();

  const { data: business } = await supabase
    .from("businesses")
    .select("*, audits(*), leads(*)")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!business) notFound();

  const audit = one(business.audits);
  const lead = one(business.leads);
  const insight = lead?.insight ?? null;

  // Signed URLs for screenshots (private bucket).
  let shots = {};
  const paths = [audit?.screenshot_desktop, audit?.screenshot_mobile].filter(Boolean);
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("screenshots").createSignedUrls(paths, 3600);
    for (const s of signed ?? []) {
      if (s.path === audit.screenshot_desktop) shots.desktop = s.signedUrl;
      if (s.path === audit.screenshot_mobile) shots.mobile = s.signedUrl;
    }
  }

  return (
    <div>
      <Link href="/search" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </Link>

      <PageHeader title={business.name} description={business.address} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: score + facts */}
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-6">
              <ScoreRing score={lead?.lead_score ?? 0} color={lead?.color ?? "orange"} />
              {lead?.reasons?.length > 0 && (
                <ul className="w-full space-y-1 text-sm">
                  {lead.reasons.slice(0, 6).map((r, i) => (
                    <li key={i} className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-success">✓</span> {r.reason || r}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Business</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              {business.rating != null && (
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 fill-warning text-warning" />
                  {business.rating} <span className="text-muted-foreground">({business.reviews ?? 0} reviews)</span>
                </div>
              )}
              {business.phone && (
                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {business.phone}</div>
              )}
              {lead?.contact_email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${lead.contact_email}`} className="text-primary hover:underline">{lead.contact_email}</a>
                  {lead.email_confidence && (
                    <Badge variant={lead.email_confidence === "verified" ? "green" : "outline"} className="ml-auto capitalize">
                      {lead.email_confidence}
                    </Badge>
                  )}
                </div>
              )}
              {business.address && (
                <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> {business.address}</div>
              )}
              {business.website ? (
                <a href={business.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                  <Globe className="h-4 w-4" /> Visit website
                </a>
              ) : (
                <Badge variant="red">No website</Badge>
              )}
              {business.maps_url && (
                <a href={business.maps_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                  <ExternalLink className="h-4 w-4" /> Google Maps
                </a>
              )}
              <div className="border-t border-border pt-3">
                <BusinessTools business={business} lead={lead} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
              <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
              <TabsTrigger value="outreach">Outreach</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <InsightPanel leadId={lead?.id} insight={insight} />
            </TabsContent>

            <TabsContent value="audit">
              <AuditDetail audit={audit} />
            </TabsContent>

            <TabsContent value="screenshots">
              {shots.desktop || shots.mobile ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {shots.desktop && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Desktop</CardTitle></CardHeader>
                      <CardContent className="pt-0">
                        <img src={shots.desktop} alt="Desktop screenshot" className="w-full rounded-lg border border-border" />
                      </CardContent>
                    </Card>
                  )}
                  {shots.mobile && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Mobile</CardTitle></CardHeader>
                      <CardContent className="pt-0">
                        <img src={shots.mobile} alt="Mobile screenshot" className="mx-auto max-w-[280px] rounded-lg border border-border" />
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No screenshots captured. They appear here after the audit runs Playwright on the site.
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="outreach">
              {lead ? (
                <LeadActions lead={lead} business={business} />
              ) : (
                <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No lead record.</CardContent></Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
