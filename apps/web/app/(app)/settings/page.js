import { getUserAndOrg } from "@/lib/org";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ProviderSelect } from "@/components/providers/provider-select";
import { WarmupCard } from "@/components/settings/warmup-card";

export const metadata = { title: "Settings — LeadForge" };

export default async function SettingsPage() {
  const { user, orgName } = await getUserAndOrg();

  return (
    <div>
      <PageHeader title="Settings" description="Workspace and account details." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>Your organisation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input defaultValue={orgName} readOnly />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Signed-in user.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input defaultValue={user?.email} readOnly />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input defaultValue={user?.user_metadata?.full_name || ""} readOnly />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Website generation</CardTitle>
            <CardDescription>
              Which AI model builds demo websites. Only providers with an API key set are
              selectable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>AI provider</Label>
              <ProviderSelect className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <WarmupCard />
      </div>
    </div>
  );
}
