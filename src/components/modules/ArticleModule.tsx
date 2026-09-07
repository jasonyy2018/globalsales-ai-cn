"use client";

import React, { useState, useEffect } from "react";
import { FileText, Sparkles, Image as ImageIcon, Copy, Check, Save, Share2 } from "lucide-react";
import type { ScrapeProductResult } from "@/types";

interface ArticleModuleProps {
  initialTopic?: string;
  productContext: ScrapeProductResult | null;
  onSaveAsset?: (asset: { kind: "article"; title: string; content: string; platform: string }) => void;
}

const PLATFORMS = [
  { id: "xiaohongshu", name: "小红书", icon: "📕", desc: "口语化种草、Emoji排版、场景化体验" },
  { id: "wechat", name: "微信公众号", icon: "💬", desc: "深度叙事、痛点分析、干货金句排版" },
  { id: "toutiao", name: "今日头条", icon: "📰", desc: "悬念抓人标题、高信息密度、社会共鸣" },
  { id: "zhihu", name: "知乎", icon: "💡", desc: "专业答题风、亲历经验分享、多维论证" },
  { id: "weibo", name: "微博", icon: "⚡", desc: "短平快、精炼网感、带双#话题标签#" },
];

export function ArticleModule({ initialTopic = "", productContext, onSaveAsset }: ArticleModuleProps) {
  const [topic, setTopic] = useState(initialTopic);
  const [selectedPlatform, setSelectedPlatform] = useState("xiaohongshu");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initialTopic) {
      setTopic(initialTopic);
    }
  }, [initialTopic]);

  const handleGenerateText = async () => {
    if (!topic && !productContext) return;
    setLoading(true);
    setSaved(false);

    try {
      const platformObj = PLATFORMS.find((p) => p.id === selectedPlatform);
      const prompt = `你是一个顶级自媒体文案大师。请为【${platformObj?.name}】平台创作一篇爆款图文软文。
创作要求：
- 风格特征：${platformObj?.desc}
- 主题方向：${topic || productContext?.title}
${productContext ? `- 依托商品情报：\n标题：${productContext.title}\n价格：${productContext.price}\n卖点：${(productContext.bullets || []).join("；")}` : ""}

请严格按照以下 JSON 格式输出：
{
  "title": "爆款吸引人的标题",
  "content": "完整的正文排版内容，包含段落、Emoji与行动号召",
  "image_prompts": ["配图1中文生成提示词", "配图2中文生成提示词", "配图3中文生成提示词"]
}`;

      const res = await fetch("/api/ark_plan_text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "ark-code-latest",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const rawContent = data.choices?.[0]?.message?.content || "";
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          setTitle(parsed.title || "");
          setContent(parsed.content || "");
          return parsed.image_prompts || [];
        } else {
          setContent(rawContent);
          setTitle(topic || "自媒体图文精选");
        }
      }
    } catch (e) {
      console.error("Generate text error:", e);
    } finally {
      setLoading(false);
    }
    return [];
  };

  const handleGenerateFull = async () => {
    const prompts = await handleGenerateText();
    if (prompts && prompts.length > 0) {
      setLoadingImages(true);
      const generatedImgs: string[] = [];
      for (const p of prompts.slice(0, 3)) {
        try {
          const res = await fetch("/api/ark_image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: p,
              model: "doubao-image",
              width: 1024,
              height: 1024,
            }),
          });
          if (res.ok) {
            const d = await res.json();
            const imgUrl = d.data?.[0]?.url || d.url;
            if (imgUrl) generatedImgs.push(imgUrl);
          }
        } catch (e) {
          console.error("Generate image error:", e);
        }
      }
      setImages(generatedImgs);
      setLoadingImages(false);
    }
  };

  const handleSaveToAssets = async () => {
    if (!content) return;
    try {
      const res = await fetch("/api/data/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "article",
          title: title || "未命名软文",
          content,
          platform: selectedPlatform,
          model: "ark-plan-text",
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error("Save asset failed:", e);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`${title}\n\n${content}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left controls */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <FileText className="w-5 h-5 text-rose-400" />
              <span>爆款图文创作工作室</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              基于选定平台人设模型与商品上下文，一键生成结构化种草软文，并自动化派生高清生图提示词。
            </p>
          </div>

          {/* Product context alert */}
          {productContext && (
            <div className="p-3 bg-sky-500/10 border border-sky-500/30 rounded-xl text-xs text-sky-300">
              <span className="font-semibold">已关联商品：</span>
              <span className="truncate block mt-0.5">{productContext.title}</span>
            </div>
          )}

          {/* Topic input */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">主题 / 创作切入点</label>
            <textarea
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="输入创作核心话题、目标场景或受众痛点..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* Platform selector */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">选择发布平台模型</label>
            <div className="grid grid-cols-1 gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlatform(p.id)}
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                    selectedPlatform === p.id
                      ? "bg-rose-500/10 border-rose-500 text-rose-300"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <span className="text-lg">{p.icon}</span>
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{p.name}</div>
                      <div className="text-[11px] text-slate-500">{p.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => handleGenerateText()}
              disabled={loading || loadingImages}
              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-xl border border-slate-700 transition-all disabled:opacity-50"
            >
              {loading ? "生成正文中..." : "① 仅出纯文本"}
            </button>
            <button
              onClick={() => handleGenerateFull()}
              disabled={loading || loadingImages}
              className="py-2.5 px-3 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
            >
              {loading || loadingImages ? "全流程制作中..." : "①+② 图文一步到位"}
            </button>
          </div>
        </div>
      </div>

      {/* Right preview */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 min-h-[500px] flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="text-xs font-medium text-slate-400">
                平台预览（{PLATFORMS.find((p) => p.id === selectedPlatform)?.name}）
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={copyToClipboard}
                  disabled={!content}
                  className="flex items-center space-x-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs transition-colors disabled:opacity-40"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "已复制" : "复制全文"}</span>
                </button>
                <button
                  onClick={handleSaveToAssets}
                  disabled={!content}
                  className="flex items-center space-x-1 px-3 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs transition-colors disabled:opacity-40"
                >
                  {saved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{saved ? "已存入" : "存入资产库"}</span>
                </button>
              </div>
            </div>

            {title && (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-base font-bold text-slate-100 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-slate-700 rounded p-1"
              />
            )}

            {/* Generated images */}
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-3 py-2">
                {images.map((img, i) => (
                  <div key={i} className="aspect-square rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                    <img src={img} alt="ai-generated" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {/* Content text */}
            {content ? (
              <textarea
                rows={14}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-200 leading-relaxed focus:outline-none resize-none border-none p-1"
              />
            ) : (
              <div className="py-24 text-center text-slate-500 text-xs">
                在左侧输入主题或选择平台，点击生成按钮开启创作
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
