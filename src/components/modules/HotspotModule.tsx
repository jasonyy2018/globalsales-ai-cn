"use client";

import React, { useState, useEffect } from "react";
import { Flame, Search, Newspaper, ArrowRight, FileText, Video, RefreshCw, TrendingUp } from "lucide-react";
import type { WebSearchResult } from "@/types";

interface HotspotModuleProps {
  onNavigateToArticle: (topic: string) => void;
  onNavigateToVideo: (topic: string) => void;
}

const CATEGORIES = [
  "全部",
  "AI技术",
  "短视频",
  "内容创作",
  "平台动态",
  "行业趋势",
  "变现运营",
];

const PRESET_KEYWORDS_WEB = [
  "自媒体爆款",
  "短视频带货",
  "小红书种草",
  "AI工具降本增效",
  "直播带货趋势",
  "视频号变现",
  "数字人播报",
  "私域流量运营",
];

const PRESET_KEYWORDS_NEWS = [
  "科技前沿AI突破",
  "跨境电商新规",
  "抖音电商大促政策",
  "快手商业化动态",
  "微信搜一搜升级",
  "生成式AI商业落地",
  "短剧出海热潮",
  "国货新品牌破局",
];

export function HotspotModule({ onNavigateToArticle, onNavigateToVideo }: HotspotModuleProps) {
  const [engine, setEngine] = useState<"web" | "news">("web");
  const [keyword, setKeyword] = useState("AI工具降本增效");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<WebSearchResult[]>([
    {
      title: "2026短视频电商下半场：AI驱动图文与微短剧带货如何跑出最高ROI？",
      snippet: "近期多个主流短视频与自媒体平台推出针对AI内容创作者的激励计划，高密度实用型干货与场景化种草成为转化率最高的形式...",
      source: "全网资讯精选",
      url: "#",
      date: "今天 10:24",
    },
    {
      title: "小红书新版搜推算法发布：强化真实场景体验，带货笔记长效曝光增加40%",
      snippet: "品牌方与KOC自媒体正在将目光转向垂直痛点拆解，配合结构化图文软文实现精准获客...",
      source: "新媒体研报",
      url: "#",
      date: "今天 09:15",
    },
    {
      title: "从选品到脚本生成只需3分钟：创作者实测自媒体全链路AI工作流",
      snippet: "通过将爆款选题提取、多平台文案改写、分镜提炼与文生视频整合，单人团队月产出内容突破百篇...",
      source: "自媒体运营内参",
      url: "#",
      date: "昨天 18:30",
    },
  ]);

  const fetchHotspots = async (kw?: string) => {
    const query = kw || keyword;
    if (!query) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/web_search?q=${encodeURIComponent(query)}&count=8`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          setResults(data.results);
        }
      }
    } catch (e) {
      console.error("Failed to fetch hotspots:", e);
    } finally {
      setLoading(false);
    }
  };

  const presetChips = engine === "web" ? PRESET_KEYWORDS_WEB : PRESET_KEYWORDS_NEWS;

  return (
    <div className="space-y-6">
      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>今日收录热点</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-slate-100">1,284</div>
          <div className="text-[11px] text-emerald-400 mt-1 flex items-center">
            <TrendingUp className="w-3 h-3 mr-0.5" /> 较昨日 +18%
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>最高热度值</span>
            <TrendingUp className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-slate-100">98.6万</div>
          <div className="text-[11px] text-slate-400 mt-1">全网多源综合热度</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>匹配关注领域</span>
            <Search className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-slate-100">86 条</div>
          <div className="text-[11px] text-indigo-400 mt-1">高相关商机线索</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>已衍生创作</span>
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-slate-100">24 篇</div>
          <div className="text-[11px] text-emerald-400 mt-1">沉淀至自媒体资产</div>
        </div>
      </div>

      {/* Search and Category Control */}
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-4">
        {/* Engine switcher & Query Input */}
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 w-full md:w-auto shrink-0">
            <button
              onClick={() => setEngine("web")}
              className={`flex-1 md:flex-initial px-4 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition-all ${
                engine === "web" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-slate-400"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>全网搜索</span>
            </button>
            <button
              onClick={() => setEngine("news")}
              className={`flex-1 md:flex-initial px-4 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition-all ${
                engine === "news" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-slate-400"
              }`}
            >
              <Newspaper className="w-3.5 h-3.5" />
              <span>资讯聚合</span>
            </button>
          </div>

          <div className="relative flex-1 w-full">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchHotspots()}
              placeholder="搜索任何话题、行业词、竞品或社会热点..."
              className="w-full pl-3 pr-24 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500 transition-colors"
            />
            <button
              onClick={() => fetchHotspots()}
              disabled={loading}
              className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center space-x-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "搜索中" : "检索"}</span>
            </button>
          </div>
        </div>

        {/* Preset Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-slate-500 mr-1">热搜词条:</span>
          {presetChips.map((chip) => (
            <button
              key={chip}
              onClick={() => {
                setKeyword(chip);
                fetchHotspots(chip);
              }}
              className="text-xs px-2.5 py-0.5 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-all"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Categories */}
        <div className="flex items-center space-x-2 border-t border-slate-800/80 pt-3 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`text-xs px-3 py-1 rounded-lg shrink-0 transition-all ${
                selectedCategory === cat
                  ? "bg-slate-800 text-amber-300 font-semibold border border-slate-700"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Hotspots Card List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {results.map((item, idx) => (
          <div
            key={idx}
            className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 p-5 rounded-2xl flex flex-col justify-between space-y-4 transition-all group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                  {item.source}
                </span>
                <span>{item.date || "实时推荐"}</span>
              </div>
              <h4 className="text-sm font-semibold text-slate-100 group-hover:text-amber-300 transition-colors line-clamp-2">
                {item.title}
              </h4>
              <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                {item.snippet}
              </p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
              <span className="text-[11px] text-slate-500">一键流转创作：</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onNavigateToArticle(item.title)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center space-x-1 transition-colors"
                >
                  <FileText className="w-3 h-3" />
                  <span>生成图文</span>
                </button>
                <button
                  onClick={() => onNavigateToVideo(item.title)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center space-x-1 transition-colors"
                >
                  <Video className="w-3 h-3" />
                  <span>生成视频脚本</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
