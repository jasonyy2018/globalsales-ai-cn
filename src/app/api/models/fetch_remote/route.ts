import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { assertPublicUrl } from "@/lib/scraper";

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
    try {
      await requireAuth();
    } catch {
      return NextResponse.json(
        { success: false, error: "系统登录已失效，请刷新页面重新登录后再试" },
        { status: 401 }
      );
    }

    const body = await request.json();
    let rawBaseUrl = String(body.base_url || body.baseUrl || "").trim();
    let apiKey = String(body.api_key || body.apiKey || "").trim();
    const protocol = String(body.protocol || "OpenAI 兼容协议").trim();

    if (!rawBaseUrl) {
      return NextResponse.json({ success: false, error: "请提供 Base URL" }, { status: 400 });
    }

    // Automatically strip redundant "Bearer " prefix if user accidentally pasted it
    apiKey = apiKey.replace(/^Bearer\s+/i, "").trim();

    if (!/^https?:\/\//i.test(rawBaseUrl)) {
      rawBaseUrl = "https://" + rawBaseUrl;
    }

    // SSRF 防护：禁止抓内网地址（与 scraper 的 assertPublicUrl 同一套规则）。
    // 但放行 Ollama 本地端点 —— 用户明确可能在本机跑 Ollama。
    const isLocalOllama = /(localhost|127\.0\.0\.1):11434/i.test(rawBaseUrl);
    if (!isLocalOllama) {
      try {
        await assertPublicUrl(rawBaseUrl);
      } catch (ssrfErr: unknown) {
        const msg = ssrfErr instanceof Error ? ssrfErr.message : String(ssrfErr);
        return NextResponse.json({ success: false, error: `Base URL 被拒绝：${msg}` }, { status: 400 });
      }
    }

    // Clean URL
    let cleanUrl = rawBaseUrl.replace(/\/+$/, "");
    cleanUrl = cleanUrl.replace(/\/chat\/completions$/i, "");
    cleanUrl = cleanUrl.replace(/\/images\/generations$/i, "");

    // Prepare candidate endpoints for listing models
    const candidateEndpoints: string[] = [];
    if (cleanUrl.endsWith("/models")) {
      candidateEndpoints.push(cleanUrl);
    }

    const rootUrl = cleanUrl.replace(/\/(v1|v4)$/i, "");
    candidateEndpoints.push(`${cleanUrl}/models`);
    candidateEndpoints.push(`${rootUrl}/v1/models`);
    candidateEndpoints.push(`${rootUrl}/models`);
    candidateEndpoints.push(`${rootUrl}/api/v1/models`);
    candidateEndpoints.push(`${cleanUrl}/api/tags`);

    const uniqueEndpoints = Array.from(new Set(candidateEndpoints));

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
    let authFailedMsg = "";

    for (const endpoint of uniqueEndpoints) {
      // 401/403 是鉴权问题而不是路径问题：同一个 key 换端点重试必然同样被拒，
      // 提前退出，省掉对每个端点的白等。
      if (lastStatus === 401 || lastStatus === 403) break;
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
          const json = await resp.json().catch(() => null);
          if (json && (Array.isArray(json.data) || Array.isArray(json.models) || Array.isArray(json))) {
            fetchedData = json;
            successfulEndpoint = endpoint;
            break;
          }
        } else if (resp.status === 401 || resp.status === 403) {
          const errBody = await resp.text().catch(() => "");
          let msg = `中转站返回 HTTP ${resp.status} 未授权`;
          try {
            const parsed = JSON.parse(errBody);
            const rMsg = parsed.error?.message || (typeof parsed.error === "string" ? parsed.error : "") || parsed.message || parsed.detail;
            if (rMsg) msg += `（${rMsg}）`;
          } catch {
            if (errBody && errBody.length < 120) msg += `（${errBody.trim()}）`;
          }
          authFailedMsg = msg;
          lastStatus = resp.status;
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
      if (lastStatus === 401 || lastStatus === 403) {
        return NextResponse.json({
          success: false,
          error: `${authFailedMsg || "第三方中转站返回 HTTP 401/403 未授权"}。\n`
            + `常见原因：① API Key/令牌填写错误或已过期；② 该中转站（如 OneAPI / NewAPI / 聚合平台）在后台未对该令牌开放「/v1/models 模型列表查询」权限（很多中转站普通令牌只开放对话聊天，屏蔽了查询模型列表接口）。\n`
            + `💡 解决建议：在中转站后台检查令牌权限，或直接在「⚙️ 添加模型」中填入模型名称与 Slug（例如 gpt-4o、claude-3-5-sonnet、deepseek-chat 等）即可直接正常调用！`,
        }, { status: 401 });
      }

      return NextResponse.json({
        success: false,
        error: `未能从提供的 Base URL 成功拉取模型列表（状态：${lastError || lastStatus || "无法连接"}）。请确认 Base URL 路径是否正确。`,
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
