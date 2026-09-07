import { forwardProxyRequest } from "@/lib/ai-proxy";

export async function GET(request: Request) {
  return forwardProxyRequest("/api/seedance_mini/status", request);
}
