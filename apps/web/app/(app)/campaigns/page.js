import { getUserAndOrg } from "@/lib/org";
import { PageHeader } from "@/components/page-header";
import { CampaignList } from "@/components/campaigns/campaign-list";

export const metadata = { title: "Campaigns — LeadForge" };

export default async function CampaignsPage() {
  const { orgId } = await getUserAndOrg();

  return (
    <div>
      <PageHeader title="Campaigns" description="Sent outreach emails and their open & click activity." />
      <CampaignList orgId={orgId} />
    </div>
  );
}
