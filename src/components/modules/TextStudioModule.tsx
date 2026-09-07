"use client";

import React, { useState } from "react";
import { PenTool, Sparkles, Wand2, Copy, Check, Save } from "lucide-react";

const COPY_TYPES = ["软文推广", "视频脚本", "短平快帖子", "私域推文"];
const PLACEMENTS = [
  "抖音",
  "快手",
  "微信视频号",
  "小红书",
  "B站",
  "微信公众号",
  "今日头条",
  "知乎",
  "微博",
  "淘宝·天猫详情页",
];

export function TextStudioModule() {
  const [copyType, setCopyType] = useState(COPY_TYPES[0]);
  const [placement, setPlacement] = useState(PLACEMENTS[0]);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleOptimizePrompt = async () => {
    if (!prompt) return;
    setOptimizing(true);
    try {
      const res = await fetch("/api/ark_plan_text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "ark-code-latest",
          messages: [
            {
              role: "user",
              content: `你是一个提示词工程专家。请将以下创作者的原始粗糙需求优化成更具结构性、精准受众、吸睛点及排版要求的顶级自媒体提示词：\n「${prompt}」\n直接输出优化后的提示词内容，不要任何额外解释。`,
            },
          ],
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const optimized = d.choices?.[0]?.message?.content;
        if (optimized) setPrompt(optimized.trim());
      }
    } catch (e) {
      console.error("Optimize prompt error:", e);
    } finally {
      setOptimizing(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt) return;
    setLoading(true);
    try {
      const fullPrompt = `文案类型：${copyType}\n投放平台：${placement}\n需求说明：${prompt}\n请输出具备网感、高转化率的高品质文案内容：`;
      const res = await fetch("/api/ark_plan_text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "ark-code-latest",
          messages: [{ role: "user", content: fullPrompt }],
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setResult(d.choices?.[0]?.message?.content || "");
      }
    } catch (e) {
      console.error("Generate error:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <PenTool className="w-5 h-5 text-teal-400" />
              <span>文案创作工作台</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              覆盖 4 种主流文案形式与 10 大平台投放渠道，提供 AI 提示词一键强化与格式化输出。
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">文案类型</label>
            <div className="grid grid-cols-2 gap-2">
              {COPY_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setCopyType(t)}
                  className={`p-2 rounded-xl text-xs font-medium border transition-all ${
                    copyType === t
                      ? "bg-teal-500/20 text-teal-300 border-teal-500/40"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">投放平台渠道</label>
            <div className="flex flex-wrap gap-1.5">
              {PLACEMENTS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPlacement(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                    placement === p
                      ? "bg-teal-500 text-slate-950 font-bold shadow-sm"
                      : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-400">需求与提示词描述</label>
              <button
                onClick={handleOptimizePrompt}
                disabled={optimizing || !prompt}
                className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center space-x-1 disabled:opacity-40"
              >
                <Wand2 className="w-3 h-3" />
                <span>{optimizing ? "优化中..." : "AI 优化提示词"}</span>
              </button>
            </div>
            <textarea
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="输入你的产品特点、受众痛点或希望文案表达的要点..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-teal-500"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !prompt}
            className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-teal-600/30 transition-all disabled:opacity-50 flex items-center justify-center space-x-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{loading ? "正在精心撰写..." : "开始生成文案"}</span>
          </button>
        </div>
      </div>

      <div className="lg:col-span-7">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 min-h-[500px] flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-semibold text-slate-300">
                生成成果（{copyType} · {placement}）
              </span>
              {result && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(result);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center space-x-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "已复制" : "复制文案"}</span>
                </button>
              )}
            </div>

            {result ? (
              <textarea
                rows={18}
                value={result}
                onChange={(e) => setResult(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-200 leading-relaxed focus:outline-none resize-none border-none p-1 font-sans"
              />
            ) : (
              <div className="py-32 text-center text-slate-500 text-xs">
                在左侧配置好文案形式与投放位，输入需求即可生成专业文案
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
