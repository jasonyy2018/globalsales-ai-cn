import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    await requireAuth();
    const data = await request.json();
    const targetUrl = String(data.url || "").trim();

    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      return NextResponse.json({ success: false, error: "invalid url" }, { status: 400 });
    }

    const method = String(data.method || "POST").toUpperCase();
    const authType = String(data.auth_type || "bearer").toLowerCase();
    const authKey = String(data.auth_key || "").trim();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (data.headers && typeof data.headers === "object") {
      for (const [k, v] of Object.entries(data.headers)) {
        if (typeof v === "string") headers[k] = v;
      }
    }

    if (authKey) {
      if (authType === "x-api-key") {
        headers["x-api-key"] = authKey;
      } else {
        headers["Authorization"] = `Bearer ${authKey}`;
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method === "POST" && data.body) {
      fetchOptions.body = JSON.stringify(data.body);
    }

    const res = await fetch(targetUrl, fetchOptions);
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const json = await res.json();
      return NextResponse.json(json, { status: res.status });
    } else {
      const text = await res.text();
      return new NextResponse(text, {
        status: res.status,
        headers: { "Content-Type": contentType || "text/plain" },
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
