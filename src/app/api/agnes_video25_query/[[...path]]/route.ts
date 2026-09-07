import { forwardProxyRequest } from "@/lib/ai-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params;
  const extraPath = path && path.length ? path.join("/") : "";
  return forwardProxyRequest("/api/agnes_video25_query", request, extraPath);
}
