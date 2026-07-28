import { getUserAndOrg } from "@/lib/org";
import { PageHeader } from "@/components/page-header";
import { PipelineBoard } from "@/components/crm/pipeline-board";

export const metadata = { title: "CRM pipeline — LeadForge" };

export default async function LeadsPage() {
  const { orgId } = await getUserAndOrg();

  return (
    <div>
      <PageHeader title="CRM pipeline" description="Drag leads through your outreach pipeline." />
      <PipelineBoard orgId={orgId} />
    </div>
  );
}
