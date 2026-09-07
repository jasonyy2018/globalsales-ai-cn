"use client";

import React, { useState, useEffect } from "react";
import { Layers, Cpu, Sparkles, Save, Check, Key, ExternalLink, ShieldCheck, RefreshCw } from "lucide-react";
import type { AIModel } from "@/types";

export function PromptsModule() {
  const [prompts, setPrompts] = useState<Array<{ id: string; module: string; name: string; content: string }>>([
    {
      id: "p1",
      module: "图文生成",
      name: "小红书爆款种草人设",
      content: "你是一个小红书百万赞爆款博主。语言风格活泼亲切，多用Emoji，开篇直击痛点，中间穿插亲身体验细节，结尾附带互动疑问句唤醒评论。",
    },
    {
      id: "p2",
      module: "视频生成",
      name: "抖音黄金前3秒分镜结构",
      content: "镜头第1秒必须使用强烈视觉反差或悬念提问；第2-3秒给出颠覆常规常识的答案；后续镜头节奏紧凑，每4秒一个视觉或信息点变化。",
    },
    {
      id: "p3",
      module: "选品分析",
      name: "高潜带货商机筛选模型",
      content: "优先关注近1个月销量激增但竞争对手评分参差不齐的品类；差评集中在物流或包装的属供应链瑕疵可优化，产品本身痛点解决彻底即为爆品潜质。",
    },
  ]);
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <Layers className="w-5 h-5 text-violet-400" />
            <span>核心提示词 (Prompts) 管理中心</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            针对各业务模块自定义预设系统提示词。修改后立即对后续所有生成任务生效。
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {prompts.map((p, idx) => (
          <div key={p.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">
                  {p.module}
                </span>
                <span className="text-sm font-bold text-slate-100">{p.name}</span>
              </div>
            </div>

            <textarea
              rows={3}
              value={p.content}
              onChange={(e) => {
                const val = e.target.value;
                setPrompts((prev) =>
                  prev.map((item, i) => (i === idx ? { ...item, content: val } : item))
                );
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500 leading-relaxed font-sans"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ModelsModule() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data/models");
      if (res.ok) {
        const d = await res.json();
        setModels(d.models || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <span>大模型配置与密钥接入</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            内置模型由服务器安全环境变量（.env）托管，前端脱敏保护；支持自定义配置自建端点。
          </p>
        </div>

        <button
          onClick={fetchModels}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {models.map((m) => (
          <div key={m.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <div className="text-sm font-bold text-slate-100">{m.name}</div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">{m.id}</div>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                  m.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500"
                }`}>
                  {m.status === "active" ? "已激活" : "未开启"}
                </span>
                {m.is_builtin && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold flex items-center">
                    <ShieldCheck className="w-3 h-3 mr-0.5" />
                    内置
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-slate-400">
              <div><span className="text-slate-500">厂商：</span>{m.provider}</div>
              <div><span className="text-slate-500">类型：</span>{m.type}</div>
              <div className="truncate"><span className="text-slate-500">端点：</span>{m.endpoint}</div>
              <div className="flex items-center space-x-2 pt-1">
                <span className="text-slate-500 shrink-0">API Key：</span>
                <span className="font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[11px]">
                  {m.is_builtin ? "•••••••••••••••• (服务端托管)" : m.api_key || "未配置"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ModelShopModule() {
  const vendors = [
    {
      name: "火山方舟 (ByteDance Volcengine)",
      services: "Agent Plan 文本深度理解、Seedream 4.0 商业级生图",
      status: "主力推荐 / 速度极快 / 国内直连",
      url: "https://console.volcengine.com/ark",
    },
    {
      name: "MiniMax (稀宇科技)",
      services: "Anthropic 兼容多模态文本、海螺视频与生图",
      status: "文采斐然 / 人设拟真度高",
      url: "https://api.minimaxi.com",
    },
    {
      name: "腾讯混元 (Tencent Hunyuan)",
      services: "混元生图 (Lite版)、混元 1.5 视频生成",
      status: "大厂算力保障 / 风格稳定",
      url: "https://cloud.tencent.com/product/hunyuan",
    },
    {
      name: "Agnes AI",
      services: "Agnes Video 2.0 / 2.5 高清文生视频与关键帧运镜",
      status: "视频运镜丰富 / 质感极佳",
      url: "https://apihub.agnes-ai.com",
    },
    {
      name: "Seedance 2.0 Mini",
      services: "轻量级高并发视频渲染与多模态生成",
      status: "响应迅速 / 适合短视频分镜头批发出片",
      url: "https://api.seedance.com",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
        <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <span>支持大模型厂商选购与开通指南</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          本平台已深度适配国内 5 大主流直连 AI 厂商，所有接口均支持服务端密钥代理转发，无梯直连。
        </p>
      </div>

      <div className="space-y-4">
        {vendors.map((v, i) => (
          <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-slate-100">{v.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  {v.status}
                </span>
              </div>
              <p className="text-xs text-slate-400">承载能力：{v.services}</p>
            </div>

            <a
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all shrink-0"
            >
              <span>开通控制台</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
