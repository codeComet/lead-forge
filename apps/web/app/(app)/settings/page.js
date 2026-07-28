import { getUserAndOrg } from "@/lib/org";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

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
    </div>
  );
}
