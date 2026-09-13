import fs from "fs";
import path from "path";
import { DATA_DIR } from "./data_paths";

export function ensureEnvLoaded() {
  if (process.env.AGNES_API_KEY && process.env.ARK_PLAN_API_KEY) return;
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(DATA_DIR, "..", ".env"),
    path.resolve(__dirname, "..", "..", ".env"),
    path.resolve(__dirname, "..", "..", "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const text = fs.readFileSync(c, "utf8");
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const idx = trimmed.indexOf("=");
          if (idx !== -1) {
            const k = trimmed.slice(0, idx).trim();
            const v = trimmed.slice(idx + 1).trim();
            if (!process.env[k] || process.env[k] === "") {
              process.env[k] = v;
            }
          }
        }
        break;
      } catch {}
    }
  }
}
ensureEnvLoaded();

import { getSystemSetting } from "./db";

export interface ProxyRouteConfig {
  url: string;
  method: "GET" | "POST";
  authType: "bearer" | "x-api-key" | "none";
  getAuthKey: () => string;
  extraHeaders?: Record<string, string>;
  injectBody?: Record<string, unknown>;
  removeParams?: string[];
}

export const PROXY_ROUTES: Record<string, ProxyRouteConfig> = {
  // MiniMax
  "/api/text": {
    url: "https://api.minimaxi.com/anthropic/v1/messages",
    method: "POST",
    authType: "x-api-key",
    getAuthKey: () => getSystemSetting("MM_API_KEY"),
    extraHeaders: { "anthropic-version": "2023-06-01" },
  },
  "/api/image": {
    url: "https://api.minimaxi.com/v1/image_generation",
    method: "POST",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("MM_API_KEY"),
  },
  "/api/video": {
    url: "https://api.minimaxi.com/v1/video_generation",
    method: "POST",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("MM_API_KEY"),
  },
  "/api/video_query": {
    url: "https://api.minimaxi.com/v1/query/video_generation",
    method: "GET",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("MM_API_KEY"),
  },

  // Tencent Hunyuan
  "/api/hy_image": {
    url: "https://tokenhub.tencentmaas.com/v1/api/image/generate",
    method: "POST",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("HY_API_KEY"),
    injectBody: { model: "hy-image-lite", rsp_img_type: "url" },
  },
  "/api/hy_video_submit": {
    url: "https://tokenhub.tencentmaas.com/v1/api/video/submit",
    method: "POST",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("HY_API_KEY"),
    injectBody: { model: "hy-video-1.5" },
  },
  "/api/hy_video_query": {
    url: "https://tokenhub.tencentmaas.com/v1/api/video/query",
    method: "POST",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("HY_API_KEY"),
    injectBody: { model: "hy-video-1.5" },
  },

  // Agnes AI
  "/api/agnes_image": {
    url: "https://apihub.agnes-ai.com/v1/images/generations",
    method: "POST",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("AGNES_API_KEY"),
    injectBody: { model: "agnes-image-2.1-flash" },
    removeParams: ["response_format"],
  },
  "/api/agnes_video_submit": {
    url: "https://apihub.agnes-ai.com/v1/videos",
    method: "POST",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("AGNES_API_KEY"),
    injectBody: { model: "agnes-video-v2.0" },
  },
  "/api/agnes_video_query": {
    url: "https://apihub.agnes-ai.com/v1/videos",
    method: "GET",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("AGNES_API_KEY"),
  },
  "/api/agnes_video25_submit": {
    url: "https://apihub.agnes-ai.com/v1/videos",
    method: "POST",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("AGNES_API_KEY"),
    injectBody: { model: "agnes-video-2.5" },
  },
  "/api/agnes_video25_query": {
    url: "https://apihub.agnes-ai.com/v1/videos",
    method: "GET",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("AGNES_API_KEY"),
  },

  // Seedance 2 Mini
  "/api/seedance_mini/create": {
    url: "https://aaapi.togomol.com/api/v1/tasks/create",
    method: "POST",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("SEEDANCE_MINI_API_KEY"),
    injectBody: { model: "bytedance/seedance-2-mini" },
  },
  "/api/seedance_mini/status": {
    url: "https://aaapi.togomol.com/api/v1/tasks/status",
    method: "GET",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("SEEDANCE_MINI_API_KEY"),
  },

  // Volcengine Ark
  "/api/ark_text": {
    url: "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions",
    method: "POST",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("ARK_API_KEY"),
  },
  "/api/ark_plan_text": {
    url: "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions",
    method: "POST",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("ARK_PLAN_API_KEY"),
  },
  "/api/ark_image": {
    url: "https://ark.cn-beijing.volces.com/api/v3/images/generations",
    method: "POST",
    authType: "bearer",
    getAuthKey: () => getSystemSetting("ARK_API_KEY"),
  },
};

export async function forwardProxyRequest(
  routePath: string,
  request: Request,
  extraPath: string = ""
): Promise<Response> {
  ensureEnvLoaded();
  const config = PROXY_ROUTES[routePath];
  if (!config) {
    return new Response(JSON.stringify({ error: "Route not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let authKey = config.getAuthKey();
  if (!authKey) {
    const incomingAuth = request.headers.get("Authorization");
    if (incomingAuth) {
      const match = incomingAuth.match(/^Bearer\s+(.+)$/i);
      if (match && match[1].trim()) {
        authKey = match[1].trim();
      }
    }
  }

  if (config.authType !== "none" && !authKey) {
    return new Response(
      JSON.stringify({ error: `服务端未配置 ${routePath} 对应的 API 密钥，请检查 .env 文件` }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.extraHeaders || {}),
  };

  if (authKey) {
    if (config.authType === "bearer") {
      headers["Authorization"] = `Bearer ${authKey}`;
    } else if (config.authType === "x-api-key") {
      headers["x-api-key"] = authKey;
    }
  }

  // Handle URL with path suffix (e.g. for /api/agnes_video_query/<taskId>)
  let targetUrl = config.url;
  if (extraPath) {
    targetUrl = targetUrl.replace(/\/+$/, "") + "/" + extraPath.replace(/^\/+/, "");
  }

  // Forward query params if GET
  const reqUrl = new URL(request.url);
  if (request.method === "GET" && reqUrl.search) {
    const parsed = new URL(targetUrl);
    reqUrl.searchParams.forEach((val, key) => {
      parsed.searchParams.set(key, val);
    });
    targetUrl = parsed.toString();
  }

  let bodyStr: string | undefined;
  if (request.method === "POST") {
    try {
      const json = await request.json();
      if (config.injectBody) {
        for (const [k, v] of Object.entries(config.injectBody)) {
          if (json[k] === undefined) {
            json[k] = v;
          }
        }
      }
      if (config.removeParams) {
        for (const p of config.removeParams) {
          delete json[p];
        }
      }
      bodyStr = JSON.stringify(json);
    } catch {
      // Body might be empty or not json
    }
  }

  try {
    const res = await fetch(targetUrl, {
      method: config.method,
      headers,
      body: bodyStr,
    });

    const data = await res.arrayBuffer();
    return new Response(data, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `Proxy upstream error: ${msg}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
