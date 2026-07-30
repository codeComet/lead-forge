import { renderDemo } from "@/lib/demo-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Short public preview path: /p/<8-char slug>. Used in outreach emails so links
// aren't a long /preview/<uuid>. Falls back to uuid lookup inside renderDemo.
export async function GET(_request, { params }) {
  const { code } = await params;
  return renderDemo(code);
}
