import { renderDemo } from "@/lib/demo-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Legacy preview path: /preview/<uuid>. Still supported; new links use /p/<slug>.
export async function GET(_request, { params }) {
  const { id } = await params;
  return renderDemo(id);
}
