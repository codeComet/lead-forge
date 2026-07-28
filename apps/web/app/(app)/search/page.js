import { getUserAndOrg } from "@/lib/org";
import { PageHeader } from "@/components/page-header";
import { SearchClient } from "@/components/search/search-client";

export const metadata = { title: "Find leads — LeadForge" };

export default async function SearchPage() {
  const { orgId } = await getUserAndOrg();

  return (
    <div>
      <PageHeader
        title="Find leads"
        description="Search local businesses on Google Maps, then let AI audit and score them."
      />
      <SearchClient orgId={orgId} />
    </div>
  );
}
