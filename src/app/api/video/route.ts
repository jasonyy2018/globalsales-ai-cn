import { forwardProxyRequest } from "@/lib/ai-proxy";

export async function POST(request: Request) {
  return forwardProxyRequest("/api/video", request);
}
