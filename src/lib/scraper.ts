import * as cheerio from "cheerio";
import dns from "dns/promises";
import net from "net";
import type { ScrapeProductResult, WebSearchResult } from "@/types";

export async function assertPublicUrl(urlStr: string): Promise<void> {
  const parsed = new URL(urlStr);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https protocols are allowed");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localdomain")) {
    throw new Error("Localhost access is prohibited");
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        throw new Error(`Forbidden IP resolved: ${addr.address}`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`DNS resolution failed or blocked: ${msg}`);
  }
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (link local / metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts[0] === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const norm = ip.toLowerCase();
    if (norm === "::1" || norm === "::" || norm.startsWith("fc") || norm.startsWith("fd") || norm.startsWith("fe80")) {
      return true;
    }
  }
  return false;
}

const CHROME_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-User": "?1",
  "Sec-Fetch-Dest": "document",
  "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

export async function searchWeb(query: string, count: number = 10): Promise<WebSearchResult[]> {
  if (!query) return [];

  const results: WebSearchResult[] = [];
  const seenTitles = new Set<string>();

  try {
    const bingUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&form=QBNH`;
    const res = await fetch(bingUrl, { headers: CHROME_HEADERS });
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      $(".news-card, .newsitem, .na_cnt, .t_s").each((_, el) => {
        if (results.length >= count) return false;
        const $el = $(el);
        const titleEl = $el.find("a.title, a.common-link, .t_t a").first();
        const title = (titleEl.text() || "").trim();
        const link = titleEl.attr("href") || "#";
        const snippet = ($el.find(".snippet, .snippet_text, .t_b").first().text() || "").trim();
        const source = ($el.find(".source, .news-source, .c_author").first().text() || "网络资讯").trim();

        if (title && !seenTitles.has(title)) {
          seenTitles.add(title);
          results.push({
            title,
            snippet,
            source,
            url: link,
            date: new Date().toLocaleDateString("zh-CN"),
          });
        }
      });
    }
  } catch (e) {
    console.error("Bing news search failed:", e);
  }

  // Fallback to Bing web search if news yielded fewer than 3 results
  if (results.length < 3) {
    try {
      const webUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(webUrl, { headers: CHROME_HEADERS });
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        $("li.b_algo").each((_, el) => {
          if (results.length >= count) return false;
          const $el = $(el);
          const titleEl = $el.find("h2 a").first();
          const title = (titleEl.text() || "").trim();
          const link = titleEl.attr("href") || "#";
          const snippet = ($el.find(".b_caption p").first().text() || "").trim();

          if (title && !seenTitles.has(title)) {
            seenTitles.add(title);
            results.push({
              title,
              snippet,
              source: "全网网页",
              url: link,
              date: new Date().toLocaleDateString("zh-CN"),
            });
          }
        });
      }
    } catch (e) {
      console.error("Bing web search failed:", e);
    }
  }

  return results;
}

export function detectAntiBot(html: string): boolean {
  if (html.length < 2000) return true;
  const lower = html.toLowerCase();
  const patterns = [
    "verify you are human",
    "security verification",
    "waf",
    "cf-browser-verification",
    "challenge-running",
    "机器人验证",
    "请输入验证码",
    "访问频繁",
    "滑动验证",
    "安全验证",
    "拖动滑块",
  ];
  return patterns.some((p) => lower.includes(p));
}

export async function scrapeProduct(url: string): Promise<ScrapeProductResult> {
  await assertPublicUrl(url);

  const res = await fetch(url, { headers: CHROME_HEADERS, redirect: "follow" });
  if (!res.ok) {
    return {
      success: false,
      error: `请求失败，HTTP 状态码: ${res.status}`,
    };
  }

  const html = await res.text();
  if (detectAntiBot(html)) {
    return {
      success: false,
      antibot: true,
      error: "目标站点返回了反爬/验证码页面，未能抓取到商品正文。建议直接手工粘贴商品详情。",
    };
  }

  const $ = cheerio.load(html);

  // 1. Try ld+json
  let title = "";
  let price = "";
  const images: string[] = [];
  const bullets: string[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] === "Product" || item.name) {
          if (!title && item.name) title = item.name;
          if (!price && item.offers?.price) price = String(item.offers.price);
          if (item.image) {
            const imgs = Array.isArray(item.image) ? item.image : [item.image];
            for (const img of imgs) {
              const u = typeof img === "string" ? img : img?.url;
              if (u && !images.includes(u)) images.push(u);
            }
          }
          if (item.description && bullets.length === 0) {
            bullets.push(item.description);
          }
        }
      }
    } catch {
      // JSON parse error
    }
  });

  // 2. OpenGraph fallback
  if (!title) {
    title =
      $('meta[property="og:title"]').attr("content") ||
      $('meta[name="twitter:title"]').attr("content") ||
      $("h1").first().text().trim() ||
      $("title").text().trim();
  }

  const ogImg = $('meta[property="og:image"]').attr("content");
  if (ogImg && !images.includes(ogImg)) {
    images.unshift(ogImg);
  }

  // Fallback body images
  if (images.length < 3) {
    $("img").each((_, el) => {
      if (images.length >= 6) return false;
      const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-origin");
      if (src && src.startsWith("http") && !src.includes("logo") && !src.includes("icon")) {
        if (!images.includes(src)) images.push(src);
      }
    });
  }

  // Bullets extraction
  if (bullets.length === 0) {
    $(".detail, #detail, .product-detail, .desc, .description")
      .find("p, li")
      .each((_, el) => {
        if (bullets.length >= 5) return false;
        const text = $(el).text().trim();
        if (text.length > 8 && text.length < 150 && !bullets.includes(text)) {
          bullets.push(text);
        }
      });
  }

  return {
    success: true,
    title,
    price: price || "¥ --",
    images,
    bullets: bullets.slice(0, 5),
    url,
    platform: new URL(url).hostname,
  };
}
