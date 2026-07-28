import { Check, X, Minus, Globe, Search, Cpu, Star, Share2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function Bool({ value }) {
  if (value == null) return <Minus className="h-4 w-4 text-muted-foreground" />;
  return value ? (
    <Check className="h-4 w-4 text-success" />
  ) : (
    <X className="h-4 w-4 text-destructive" />
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

function Section({ icon: Icon, title, score, children }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
        {score != null && <Badge variant="secondary">{score}/100</Badge>}
      </CardHeader>
      <CardContent className="divide-y divide-border/60 pt-0">{children}</CardContent>
    </Card>
  );
}

export function AuditDetail({ audit }) {
  if (!audit || audit.status !== "done") {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {audit?.status === "failed"
            ? `Audit failed: ${audit.error || "unknown error"}`
            : "Audit not complete yet. Connect the worker + Redis to run audits."}
        </CardContent>
      </Card>
    );
  }

  const w = audit.website ?? {};
  const seo = audit.seo ?? {};
  const tech = audit.tech ?? {};
  const gbp = audit.gbp ?? {};
  const social = audit.social ?? {};

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section icon={Globe} title="Website" score={audit.website_score}>
        {w.exists === false ? (
          <div className="py-2 text-sm font-medium text-destructive">No website found</div>
        ) : (
          <>
            <Row label="HTTPS / SSL"><Bool value={w.https} /></Row>
            <Row label="Mobile friendly"><Bool value={w.mobileFriendly} /></Row>
            <Row label="Responsive"><Bool value={w.responsive} /></Row>
            <Row label="Fast loading"><Bool value={w.fast} /></Row>
            <Row label="Modern design"><Bool value={w.modern} /></Row>
            <Row label="Contact form"><Bool value={w.contactForm} /></Row>
            <Row label="Trust indicators"><Bool value={w.trustIndicators} /></Row>
            {w.loadTimeMs != null && <Row label="Load time">{(w.loadTimeMs / 1000).toFixed(1)}s</Row>}
          </>
        )}
      </Section>

      <Section icon={Search} title="SEO" score={audit.seo_score}>
        <Row label="Meta title"><Bool value={!!seo.metaTitle} /></Row>
        <Row label="Meta description"><Bool value={!!seo.metaDescription} /></Row>
        <Row label="H1 heading"><Bool value={!!seo.h1} /></Row>
        <Row label="Images missing alt">{seo.missingAltCount ?? "—"}</Row>
        <Row label="Sitemap"><Bool value={seo.sitemap} /></Row>
        <Row label="Robots.txt"><Bool value={seo.robots} /></Row>
        <Row label="Structured data"><Bool value={seo.structuredData} /></Row>
        {seo.pageSpeedScore != null && <Row label="PageSpeed">{seo.pageSpeedScore}/100</Row>}
        {seo.accessibilityScore != null && <Row label="Accessibility">{seo.accessibilityScore}/100</Row>}
      </Section>

      <Section icon={Cpu} title="Technology">
        <Row label="Stack">
          {tech.stack?.length ? (
            <span className="flex flex-wrap justify-end gap-1">
              {tech.stack.map((s) => (
                <Badge key={s} variant="outline">{s}</Badge>
              ))}
            </span>
          ) : (
            "—"
          )}
        </Row>
        {tech.age && <Row label="Age / notes">{tech.age}</Row>}
        <Row label="Obsolete tech"><Bool value={tech.obsolete} /></Row>
      </Section>

      <Section icon={Star} title="Google Business">
        <Row label="Rating">{gbp.rating ?? "—"}</Row>
        <Row label="Reviews">{gbp.reviews ?? "—"}</Row>
      </Section>

      <Section icon={Share2} title="Social presence">
        {["facebook", "instagram", "linkedin", "tiktok", "youtube"].map((p) => (
          <Row key={p} label={p[0].toUpperCase() + p.slice(1)}>
            <Bool value={!!social[p]} />
          </Row>
        ))}
      </Section>
    </div>
  );
}
