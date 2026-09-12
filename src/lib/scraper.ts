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
  if (!html) return true;
  const lower = html.toLowerCase();
  const patterns = [
    "api-services-support@amazon.com",
    "/errors/validatecaptcha",
    "enter the characters you see below",
    "type the characters you see in this image",
    "robot check",
    "to discuss automated access to amazon data",
    "captcha-container",
    "cf-browser-verification",
    "just a moment...",
    "checking your browser before accessing",
    "access to this page has been denied",
    "pardon our interruption",
    "verify you are human",
    "security verification",
    "aliyun_waf_",
    "waf-challenge",
    "challenge-running",
    "机器人验证",
    "请输入验证码",
    "访问频繁",
    "滑动验证",
    "安全验证",
    "拖动滑块",
  ];
  if (patterns.some((p) => lower.includes(p))) {
    return true;
  }
  if (html.length < 5000) {
    const signals = [
      "producttitle",
      "og:title",
      "application/ld+json",
      "add-to-cart",
      'itemprop="price"',
      "product.php",
      "dd_price",
      "360buyimg",
    ];
    if (!signals.some((s) => lower.includes(s))) {
      return true;
    }
  }
  return false;
}

const MOBILE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

async function fetchWithTimeout(url: string, headers: HeadersInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeDangdang(url: string): Promise<ScrapeProductResult | null> {
  let pid = "";
  const m1 = url.match(/(?:pid=|\/)(\d{7,12})(?:\.html|\b)/i);
  if (m1) pid = m1[1];
  if (!pid) return null;

  const mobileUrl = `https://m.dangdang.com/product.php?pid=${pid}`;
  const imgUrl = `https://m.dangdang.com/product.php?ac=image&pid=${pid}`;

  const [resMain, resImg] = await Promise.allSettled([
    fetchWithTimeout(mobileUrl, MOBILE_HEADERS),
    fetchWithTimeout(imgUrl, MOBILE_HEADERS),
  ]);

  let mainHtml = "";
  let imgHtml = "";
  if (resMain.status === "fulfilled" && resMain.value.ok) {
    mainHtml = await resMain.value.text();
  }
  if (resImg.status === "fulfilled" && resImg.value.ok) {
    imgHtml = await resImg.value.text();
  }

  if (!mainHtml) return null;

  // Title
  let title = "";
  const titleM = mainHtml.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleM) {
    title = titleM[1].replace(/-(?:家用电器|数码|服装|母婴|家居|图书|手机当当网|当当网).*$/gi, "").trim();
  }
  if (!title) {
    const h1M = mainHtml.match(/<p class="apmd">([^<]+)<\/p>/i);
    if (h1M) title = h1M[1].trim();
  }

  // Price
  let price = "";
  const ddPriceM = mainHtml.match(/当当价:\s*<\/span>\s*<span class="dd_price">\s*([0-9\.]+)/i);
  if (ddPriceM) {
    price = "¥ " + ddPriceM[1];
  } else {
    const mktPriceM = mainHtml.match(/市场价:\s*<span class="fcdelete">\s*([0-9\.]+)/i);
    if (mktPriceM) price = "¥ " + mktPriceM[1];
  }

  // Images
  const images: string[] = [];
  const seenImgs = new Set<string>();
  const searchHtml = imgHtml + " " + mainHtml;
  const imgRe = /(?:src|data-original)=["']([^"']+)["']/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgRe.exec(searchHtml)) !== null) {
    let src = imgMatch[1];
    if (src.includes("ddimg.cn") && src.includes(pid)) {
      if (src.startsWith("//")) src = "https:" + src;
      else if (src.startsWith("http://")) src = src.replace("http://", "https://");
      src = src.replace(/_[a-z]\.jpg/i, "_u.jpg");
      if (!seenImgs.has(src)) {
        seenImgs.add(src);
        images.push(src);
      }
    }
  }

  // Bullets & Description
  const bullets: string[] = [];
  const introM = mainHtml.match(/简介:<\/a>\s*([\s\S]*?)(?:详情|<\/p>)/i);
  if (introM) {
    const rawIntro = introM[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const parts = rawIntro.split(/(品牌：|型号：|折叠：|档位：|风型：|功率：|适用：|作者：|出版社：|出版时间：|页数：)/g);
    for (let i = 1; i < parts.length; i += 2) {
      const key = parts[i];
      const val = (parts[i + 1] || "").trim();
      if (key && val) {
        bullets.push(key + val);
      }
    }
    if (bullets.length === 0 && rawIntro) {
      bullets.push(rawIntro);
    }
  }

  const description = bullets.length ? bullets.join(" · ") : title;

  return {
    success: true,
    title: title || `当当商品 ${pid}`,
    price: price || "¥ --",
    images: images.slice(0, 8),
    bullets: bullets.slice(0, 8),
    description,
    url,
    platform: "当当网",
  };
}

async function scrapeJd(url: string): Promise<ScrapeProductResult | null> {
  let skuId = "";
  const m = url.match(/(?:product\/|\/)(\d{6,14})(?:\.html|\b)/i);
  if (m) skuId = m[1];
  if (!skuId) return null;

  const targetUrl = `https://item.m.jd.com/product/${skuId}.html`;
  const res = await fetchWithTimeout(targetUrl, MOBILE_HEADERS);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  // 京东移动端偶发 GBK 编码响应，UTF-8 硬解会得到乱码标题
  let html: string;
  try {
    html = new TextDecoder("utf-8").decode(buf);
  } catch {
    html = new TextDecoder("gbk").decode(buf);
  }
  if (!html.includes("<title") && !html.includes("360buyimg")) {
    try { html = new TextDecoder("gbk").decode(buf); } catch {}
  }

  let title = "";
  const titleM = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleM) {
    title = titleM[1].replace(/【需预约购买】|【图片 价格 品牌 评论】-京东|-京东.*$/gi, "").trim();
  }

  const images: string[] = [];
  const re = /(?:https?:)?\/\/(m\.360buyimg\.com\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp))/gi;
  let imgM: RegExpExecArray | null;
  while ((imgM = re.exec(html)) !== null) {
    const u = "https://" + imgM[1];
    if (!images.includes(u) && !u.includes("logo") && !u.includes("icon")) {
      images.push(u);
      if (images.length >= 8) break;
    }
  }

  let price = "";
  const priceM = html.match(/"p"\s*:\s*"([0-9\.]+)"/i) || html.match(/<span class="price"[^>]*>([0-9\.]+)/i);
  if (priceM) price = "¥ " + priceM[1];

  const bullets: string[] = [];
  if (title) bullets.push(title);

  return {
    success: true,
    title: title || `京东商品 ${skuId}`,
    price: price || "¥ --",
    images,
    bullets,
    description: title,
    url,
    platform: "京东",
  };
}

export async function scrapeProduct(url: string): Promise<ScrapeProductResult> {
  await assertPublicUrl(url);

  const host = new URL(url).hostname.toLowerCase();

  // 1. Specialized handlers for major e-commerce platforms
  if (host.includes("dangdang.com")) {
    const dd = await scrapeDangdang(url);
    if (dd && dd.title) {
      return dd;
    }
  }

  if (host.includes("jd.com")) {
    const jd = await scrapeJd(url);
    if (jd && jd.title) {
      return jd;
    }
  }

  // 2. Generic fetch
  const res = await fetchWithTimeout(url, CHROME_HEADERS);
  if (!res.ok) {
    return {
      success: false,
      error: `请求失败，HTTP 状态码: ${res.status}`,
    };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const ctype = res.headers.get("content-type") || "";
  const charsetMatch = ctype.match(/charset=([\w\-]+)/i);
  let charset = (charsetMatch ? charsetMatch[1] : "utf-8").toLowerCase();
  if (charset === "gb2312") charset = "gbk";

  let html: string;
  try {
    html = new TextDecoder(charset).decode(buf);
  } catch {
    html = new TextDecoder("utf-8").decode(buf);
  }

  // Check if meta tag specifies a different charset
  const metaCharsetMatch = html.match(/<meta[^>]+charset=["']?([\w\-]+)/i);
  if (metaCharsetMatch && metaCharsetMatch[1]) {
    const metaCharset = metaCharsetMatch[1].toLowerCase();
    if (metaCharset !== charset && (metaCharset === "gbk" || metaCharset === "gb2312" || metaCharset === "gb18030")) {
      try {
        html = new TextDecoder("gbk").decode(buf);
      } catch {}
    }
  }

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
      if (images.length >= 8) return false;
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
        if (bullets.length >= 8) return false;
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
    images: images.slice(0, 8),
    bullets: bullets.slice(0, 8),
    url,
    platform: host,
  };
}
