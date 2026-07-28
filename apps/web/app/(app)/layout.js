import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/org";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { CommandPalette } from "@/components/app-shell/command-palette";

export default async function AppLayout({ children }) {
  const session = await getUserAndOrg();
  if (!session) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={session.user} orgName={session.orgName} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">{children}</div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
