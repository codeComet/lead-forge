import { getUserAndOrg } from "@/lib/org";
import { PageHeader } from "@/components/page-header";
import { CampaignList } from "@/components/campaigns/campaign-list";
import { ComposeEmail } from "@/components/campaigns/compose-email";

export const metadata = { title: "Campaigns — LeadForge" };

export default async function CampaignsPage() {
  const { orgId } = await getUserAndOrg();

  return (
    <div>
      <PageHeader title="Campaigns" description="Sent outreach emails and their open & click activity.">
        <ComposeEmail orgId={orgId} />
      </PageHeader>
      <CampaignList orgId={orgId} />
    </div>
  );
}
