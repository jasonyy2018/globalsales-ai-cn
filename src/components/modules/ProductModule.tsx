"use client";

import React, { useState } from "react";
import { Search, Link as LinkIcon, AlertCircle, CheckCircle2, Trash2, ExternalLink, Image as ImageIcon } from "lucide-react";
import type { ScrapeProductResult } from "@/types";

interface ProductModuleProps {
  productContext: ScrapeProductResult | null;
  onUpdateProductContext: (product: ScrapeProductResult | null) => void;
}

const DANGDANG_SAMPLES = [
  { name: "当当图书：被讨厌的勇气", url: "http://product.dangdang.com/23661109.html" },
  { name: "当当图书：活着（余华）", url: "http://product.dangdang.com/22880797.html" },
  { name: "当当图书：非暴力沟通", url: "http://product.dangdang.com/20037805.html" },
  { name: "当当图书：三体全集", url: "http://product.dangdang.com/22883391.html" },
  { name: "当当图书：微习惯", url: "http://product.dangdang.com/24103131.html" },
  { name: "当当图书：蛤蟆先生去看心理医生", url: "http://product.dangdang.com/28980145.html" },
  { name: "当当数码：罗马仕大容量充电宝", url: "http://product.dangdang.com/11270275822.html" },
  { name: "当当百货：多功能养生壶家用", url: "http://product.dangdang.com/11382431766.html" },
];

export function ProductModule({ productContext, onUpdateProductContext }: ProductModuleProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customText, setCustomText] = useState("");

  const handleScrape = async (targetUrl?: string) => {
    const inputUrl = targetUrl || url;
    if (!inputUrl) {
      setError("请输入商品详情页 URL");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/product_scrape?url=${encodeURIComponent(inputUrl)}`);
      const data: ScrapeProductResult = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "抓取失败，请核实链接是否可公开访问");
        return;
      }

      onUpdateProductContext(data);
      if (data.bullets) {
        setCustomText(data.bullets.join("\n"));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "抓取异常");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input panel */}
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <Search className="w-5 h-5 text-sky-400" />
            <span>商品情报与规格抓取</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            输入国内主流商城或独立站详情页链接，自动提取商品标题、价格、核心卖点及轮播大图，作为后续生成软文与视频分镜的母本上下文。
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <LinkIcon className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="粘贴商品详情页链接（支持通用商城、微盟/有赞独立站、当当等）..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>

          <button
            onClick={() => handleScrape()}
            disabled={loading}
            className="w-full md:w-auto px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs rounded-xl transition-all shadow-md shadow-sky-600/20 disabled:opacity-50 shrink-0"
          >
            {loading ? "正在解析商品..." : "开始抓取"}
          </button>
        </div>

        {/* Preset Samples */}
        <div className="space-y-1.5 pt-2">
          <div className="text-[11px] text-slate-500 font-medium">实测样例直达（点击一键载入抓取）：</div>
          <div className="flex flex-wrap gap-1.5">
            {DANGDANG_SAMPLES.map((s, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setUrl(s.url);
                  handleScrape(s.url);
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-sky-300 hover:border-slate-700 transition-all"
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Product Detail Card if Scraped */}
      {productContext ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-start justify-between border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-semibold">
                  全局商品上下文已锁定
                </span>
                <span className="text-xs text-slate-400">{productContext.platform}</span>
              </div>
              <h4 className="text-lg font-bold text-slate-100 mt-2">{productContext.title}</h4>
              <div className="text-sm font-semibold text-rose-400 mt-1">{productContext.price}</div>
            </div>

            <button
              onClick={() => onUpdateProductContext(null)}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空上下文</span>
            </button>
          </div>

          {/* Image thumbnails */}
          {productContext.images && productContext.images.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2 flex items-center space-x-1">
                <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                <span>抓取到的商品大图 / 轮播图 ({productContext.images.length} 张)</span>
              </label>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {productContext.images.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-800 bg-slate-950 group">
                    <img src={img} alt="product" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Editable text context */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              副文本与卖点核对区（支持手工润色或增删，改动将被图文与视频直接采用）
            </label>
            <textarea
              rows={4}
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value);
                if (productContext) {
                  onUpdateProductContext({
                    ...productContext,
                    bullets: e.target.value.split("\n").filter(Boolean),
                  });
                }
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono leading-relaxed"
            />
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-slate-800 rounded-2xl p-12 text-center text-slate-500">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
          <p className="text-xs">尚未抓取商品，输入链接或点击上方实测样例开始</p>
        </div>
      )}
    </div>
  );
}
