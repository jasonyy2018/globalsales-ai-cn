import { forwardProxyRequest } from "@/lib/ai-proxy";

export async function POST(request: Request) {
  return forwardProxyRequest("/api/agnes_video25_submit", request);
}
