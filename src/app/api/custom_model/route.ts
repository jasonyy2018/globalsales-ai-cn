import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSystemSetting } from "@/lib/db";
import { assertPublicUrl } from "@/lib/scraper";

export async function POST(request: Request) {
  try {
    await requireAuth();
    const data = await request.json();
    let targetUrl = String(data.url || "").trim();

    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      return NextResponse.json({ success: false, error: "invalid url" }, { status: 400 });
    }

    // 防 SSRF：该端点会把用户提供的 URL 连同 Authorization 密钥透传给目标，
    // 必须挡住内网 / 云元数据地址（127.0.0.1、10.x、169.254.169.254 等），
    // 否则恶意用户可用它探测内网服务。allowLocal 放行 127.0.0.1/localhost，
    // 供 Ollama 等本地模型使用（与 fetch_remote 同策略）。
    const allowLocal = /(^https?:\/\/(localhost|127\.0\.0\.1):11434)/i.test(targetUrl);
    if (!allowLocal) {
      try {
        await assertPublicUrl(targetUrl);
      } catch (ssrfErr: unknown) {
        const msg = ssrfErr instanceof Error ? ssrfErr.message : String(ssrfErr);
        return NextResponse.json({ success: false, error: `URL 被拒绝：${msg}` }, { status: 400 });
      }
    }

    const method = String(data.method || "POST").toUpperCase();
    let authType = String(data.auth_type || "bearer").toLowerCase();
    let authKey = String(data.auth_key || "").trim();

    // 智能兜底：若客户端未传或清空了密钥，自动检测知名服务商并从数据库读取配置的 API 密钥
    if (!authKey) {
      if (targetUrl.includes("agnes-ai.com")) {
        authKey = getSystemSetting("AGNES_API_KEY");
      } else if (targetUrl.includes("volces.com") || targetUrl.includes("ark.cn")) {
        authKey = getSystemSetting("ARK_API_KEY");
      } else if (targetUrl.includes("minimaxi.com")) {
        authKey = getSystemSetting("MM_API_KEY");
        if (targetUrl.includes("/messages")) authType = "x-api-key";
      } else if (targetUrl.includes("tencentmaas.com")) {
        authKey = getSystemSetting("HY_API_KEY");
      } else if (targetUrl.includes("aaapi.togomol.com")) {
        authKey = getSystemSetting("SEEDANCE_MINI_API_KEY");
      }
    }

    let reqBody = data.body;
    if (reqBody && typeof reqBody === "object") {
      // 容错处理：部分中转站或用户习惯在模型名前加厂商前缀（如 agnes/agnes-image-2.5-flash）
      // Agnes AI 官方端点不认 vendor 前缀，必须剥离成 agnes-image-2.5-flash
      if (targetUrl.includes("agnes-ai.com") && typeof reqBody.model === "string") {
        reqBody.model = reqBody.model.replace(/^agnes\//i, "");
      }
    }

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

    if (method === "POST" && reqBody) {
      fetchOptions.body = JSON.stringify(reqBody);
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
