import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

function inferModelType(id: string): "text" | "image" | "video" {
  const s = id.toLowerCase();
  if (/(image|flux|dall-e|seedream|sdxl|midjourney|recraft|stable-diffusion|imagen|wanx|doubao-image|sd-)/.test(s)) {
    return "image";
  }
  if (/(video|kling|cogvideo|hailuo|minimax-video|seedance|runway|luma|sora|vidu|animate|wan-)/.test(s)) {
    return "video";
  }
  return "text";
}

function detectProvider(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("deepseek")) return "DeepSeek";
  if (u.includes("siliconflow")) return "SiliconFlow";
  if (u.includes("dashscope") || u.includes("aliyun")) return "阿里云通义千问";
  if (u.includes("moonshot") || u.includes("kimi")) return "月之暗面 Kimi";
  if (u.includes("bigmodel.cn") || u.includes("zhipu")) return "智谱清言 GLM";
  if (u.includes("minimax")) return "MiniMax";
  if (u.includes("volces.com") || u.includes("volcengine") || u.includes("ark.cn")) return "火山引擎 (字节跳动)";
  if (u.includes("openai.com")) return "OpenAI";
  if (u.includes("anthropic.com")) return "Anthropic";
  if (u.includes("localhost:11434") || u.includes("127.0.0.1:11434") || u.includes("ollama")) return "Ollama (本地)";
  if (u.includes("groq")) return "Groq";
  if (u.includes("openrouter")) return "OpenRouter";
  if (u.includes("together")) return "Together AI";
  return "自定义服务商";
}

export async function POST(request: Request) {
  try {
    await requireAuth();

    const body = await request.json();
    let rawBaseUrl = String(body.base_url || body.baseUrl || "").trim();
    const apiKey = String(body.api_key || body.apiKey || "").trim();
    const protocol = String(body.protocol || "OpenAI 兼容协议").trim();

    if (!rawBaseUrl) {
      return NextResponse.json({ success: false, error: "请提供 Base URL" }, { status: 400 });
    }

    if (!/^https?:\/\//i.test(rawBaseUrl)) {
      rawBaseUrl = "https://" + rawBaseUrl;
    }

    // Clean URL
    let cleanUrl = rawBaseUrl.replace(/\/+$/, "");
    cleanUrl = cleanUrl.replace(/\/chat\/completions$/i, "");
    cleanUrl = cleanUrl.replace(/\/images\/generations$/i, "");

    // Prepare candidate endpoints for listing models
    const candidateEndpoints: string[] = [];
    if (cleanUrl.endsWith("/models")) {
      candidateEndpoints.push(cleanUrl);
    } else if (cleanUrl.endsWith("/v1")) {
      candidateEndpoints.push(`${cleanUrl}/models`);
    } else if (cleanUrl.endsWith("/v4")) {
      candidateEndpoints.push(`${cleanUrl}/models`);
    } else {
      candidateEndpoints.push(`${cleanUrl}/v1/models`);
      candidateEndpoints.push(`${cleanUrl}/models`);
    }

    // Also support Ollama tags endpoint if it looks like Ollama or custom port
    candidateEndpoints.push(`${cleanUrl}/api/tags`);

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "GlobalSalesAI-ModelFetcher/2.0",
    };

    if (apiKey) {
      if (/anthropic/i.test(protocol)) {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
    }

    let lastError = "";
    let lastStatus = 0;
    let fetchedData: any = null;
    let successfulEndpoint = "";

    for (const endpoint of candidateEndpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const resp = await fetch(endpoint, {
          method: "GET",
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        lastStatus = resp.status;

        if (resp.ok) {
          const json = await resp.json();
          if (json && (Array.isArray(json.data) || Array.isArray(json.models) || Array.isArray(json))) {
            fetchedData = json;
            successfulEndpoint = endpoint;
            break;
          }
        } else if (resp.status === 401 || resp.status === 403) {
          const errBody = await resp.text();
          let msg = "API Key 无效或未授权 (HTTP " + resp.status + ")";
          try {
            const parsed = JSON.parse(errBody);
            if (parsed.error?.message) msg += ": " + parsed.error.message;
          } catch {}
          return NextResponse.json({ success: false, error: msg }, { status: 401 });
        } else {
          lastError = `HTTP ${resp.status} ${resp.statusText}`;
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          lastError = "请求超时（12秒未响应）";
        } else {
          lastError = err.message || String(err);
        }
      }
    }

    if (!fetchedData) {
      return NextResponse.json({
        success: false,
        error: `未能从提供的 Base URL 成功拉取模型列表（状态：${lastError || lastStatus || "无法连接"}）。请确认 Base URL 路径是否正确，或 API Key 是否具备访问权限。`,
      }, { status: 400 });
    }

    // Extract raw models
    let rawList: any[] = [];
    if (Array.isArray(fetchedData.data)) {
      rawList = fetchedData.data;
    } else if (Array.isArray(fetchedData.models)) {
      rawList = fetchedData.models;
    } else if (Array.isArray(fetchedData)) {
      rawList = fetchedData;
    }

    const models = rawList
      .map((item) => {
        const id = String(item.id || item.name || "").trim();
        if (!id) return null;
        return {
          id,
          name: id,
          type: inferModelType(id),
          owned_by: item.owned_by || item.owner || "",
          created: item.created || null,
        };
      })
      .filter(Boolean);

    // Compute standard chat/completions endpoint for this service
    let chatEndpoint = cleanUrl;
    if (!chatEndpoint.includes("/chat/completions")) {
      if (chatEndpoint.endsWith("/v1")) {
        chatEndpoint = `${chatEndpoint}/chat/completions`;
      } else if (chatEndpoint.endsWith("/v4")) {
        chatEndpoint = `${chatEndpoint}/chat/completions`;
      } else if (!chatEndpoint.endsWith("/models")) {
        chatEndpoint = `${chatEndpoint}/v1/chat/completions`;
      }
    }

    return NextResponse.json({
      success: true,
      count: models.length,
      models,
      detected_provider: detectProvider(rawBaseUrl),
      suggested_chat_endpoint: chatEndpoint,
      successful_endpoint: successfulEndpoint,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "获取模型列表失败" },
      { status: 500 }
    );
  }
}
