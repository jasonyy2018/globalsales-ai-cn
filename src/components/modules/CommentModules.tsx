"use client";

import React, { useState } from "react";
import { MessagesSquare, ShieldAlert, Sparkles, Copy, Check } from "lucide-react";

export function CommentModule() {
  const [topic, setTopic] = useState("现在的年轻人为什么越来越不爱买大牌包包和奢侈品了？");
  const [stance, setStance] = useState("理智省钱");
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (!topic) return;
    setLoading(true);
    try {
      const prompt = `你是一个自媒体神评段子手。针对话题「${topic}」，以「${stance}」的立场，生成 5 条具备极高点赞潜力、引发共鸣或金句频出的热门神评。严格以 JSON 字符串数组格式返回：["评论1", "评论2", ...]`;
      const res = await fetch("/api/ark_plan_text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "ark-code-latest",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const content = d.choices?.[0]?.message?.content || "";
        const match = content.match(/\[[\s\S]*\]/);
        if (match) {
          setResults(JSON.parse(match[0]));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <MessagesSquare className="w-5 h-5 text-orange-400" />
            <span>热门评论衍生工作台</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            根据作品主题或互动痛点，智能推演多种受众视角下的高赞神评与神回复，引爆评论区互动率。
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">话题或作品核心观点</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400">预设立场：</span>
          {["幽默吐槽", "理性剖析", "暖心共情", "人间清醒", "反向提问"].map((s) => (
            <button
              key={s}
              onClick={() => setStance(s)}
              className={`text-xs px-3 py-1 rounded-lg border transition-all ${
                stance === s
                  ? "bg-orange-500/20 text-orange-300 border-orange-500/40 font-medium"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-orange-600/30 transition-all disabled:opacity-50 flex items-center justify-center space-x-1"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{loading ? "正在构思高赞神评..." : "生成爆款评论"}</span>
        </button>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h4 className="text-xs font-semibold text-slate-300 mb-3">高赞评论推演结果</h4>
        {results.length > 0 ? (
          <div className="space-y-2.5">
            {results.map((c, i) => (
              <div
                key={i}
                className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between hover:border-slate-700 transition-colors group"
              >
                <span className="text-xs text-slate-200 leading-relaxed pr-4">
                  <span className="text-orange-400 font-bold mr-2">#{i + 1}</span>
                  {c}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(c);
                    setCopiedIdx(i);
                    setTimeout(() => setCopiedIdx(null), 2000);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs shrink-0 flex items-center space-x-1"
                >
                  {copiedIdx === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedIdx === i ? "已复制" : "复制"}</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-xs text-slate-500">点击上方生成即可推演热评库</div>
        )}
      </div>
    </div>
  );
}

export function SmartReplyModule() {
  const [comment, setComment] = useState("这东西价格这么贵，是不是在收智商税啊？去拼多多几块钱一大把！");
  const [tone, setTone] = useState("专业高情商化解");
  const [replies, setReplies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (!comment) return;
    setLoading(true);
    try {
      const prompt = `面对自媒体评论区里的棘手或质疑评论：「${comment}」，请以「${tone}」的风格，给出 3 条得体、专业、巧妙化解尴尬甚至反转促单的高情商回复话术。严格以 JSON 字符串数组格式返回：["回复1", "回复2", "回复3"]`;
      const res = await fetch("/api/ark_plan_text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "ark-code-latest",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const content = d.choices?.[0]?.message?.content || "";
        const match = content.match(/\[[\s\S]*\]/);
        if (match) {
          setReplies(JSON.parse(match[0]));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-violet-400" />
            <span>棘手评论与客诉高情商回复</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            应对杠精、比价、质量质疑或售后争议，一键输出既守住品牌底线又促成路人好感的专业公关回复。
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">收到的刁钻或质疑评论</label>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400">回复策略：</span>
          {["专业高情商化解", "幽默四两拨千斤", "真诚售后兜底", "对比差异说明"].map((s) => (
            <button
              key={s}
              onClick={() => setTone(s)}
              className={`text-xs px-3 py-1 rounded-lg border transition-all ${
                tone === s
                  ? "bg-violet-500/20 text-violet-300 border-violet-500/40 font-medium"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50 flex items-center justify-center space-x-1"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{loading ? "正在生成应对策略..." : "生成高情商回复话术"}</span>
        </button>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h4 className="text-xs font-semibold text-slate-300 mb-3">高情商应对方案</h4>
        {replies.length > 0 ? (
          <div className="space-y-3">
            {replies.map((r, i) => (
              <div key={i} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-violet-400">方案 #{i + 1}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(r);
                      setCopiedIdx(i);
                      setTimeout(() => setCopiedIdx(null), 2000);
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center space-x-1"
                  >
                    {copiedIdx === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedIdx === i ? "已复制" : "复制话术"}</span>
                  </button>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{r}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-xs text-slate-500">输入棘手评论，获取专业化解方案</div>
        )}
      </div>
    </div>
  );
}
