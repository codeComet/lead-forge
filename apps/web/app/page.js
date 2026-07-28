import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Sparkles, Search, Gauge, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUserAndOrg } from "@/lib/org";

export default async function Home() {
  const session = await getUserAndOrg();
  if (session) redirect("/dashboard");

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* ambient gradient */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-semibold">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          LeadForge
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 pt-20 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          AI-powered agency growth platform
        </div>
        <h1 className="text-balance text-5xl font-bold tracking-tight sm:text-6xl">
          Find businesses that need a{" "}
          <span className="bg-gradient-to-r from-primary to-violet-400 bg-clip-text text-transparent">
            better website
          </span>
          .
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Search local businesses on Google Maps, audit them with AI, score every lead,
          generate personalised proposals, and send outreach — all from one dashboard.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/signup">
              Start finding leads <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Log in</Link>
          </Button>
        </div>

        <div className="mx-auto mt-20 grid max-w-3xl gap-4 sm:grid-cols-3">
          {[
            { icon: Search, title: "Discover", desc: "Search by location & industry via Google Maps." },
            { icon: Gauge, title: "Audit & score", desc: "AI grades website, SEO, tech & reputation." },
            { icon: Mail, title: "Outreach", desc: "Personalised proposals & tracked emails." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-5 text-left">
              <f.icon className="mb-3 h-5 w-5 text-primary" />
              <div className="font-medium">{f.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{f.desc}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
