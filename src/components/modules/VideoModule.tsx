"use client";

import React, { useState, useEffect } from "react";
import { Video, Film, Sparkles, Sliders, Play, Copy, Check, Save, Download } from "lucide-react";
import type { ScrapeProductResult } from "@/types";

interface VideoModuleProps {
  initialTopic?: string;
  productContext: ScrapeProductResult | null;
}

interface StoryboardScene {
  sceneNum: number;
  duration: number;
  visualPrompt: string;
  voiceover: string;
  shotType: string;
}

const VIDEO_PLATFORMS = [
  { id: "douyin", name: "抖音", aspect: "9:16", desc: "前3秒强黄金钩子、快节奏反转、情绪点饱满" },
  { id: "kuaishou", name: "快手", aspect: "9:16", desc: "老铁接地气风格、真诚实惠、强互动唤醒" },
  { id: "sph", name: "微信视频号", aspect: "9:16", desc: "社交熟人圈传播、温情正能量、实用生活智慧" },
  { id: "redbook", name: "小红书", aspect: "3:4", desc: "高级审美质感、精致生活场景、细节特写" },
  { id: "bilibili", name: "B站", aspect: "16:9", desc: "专业硬核科普、玩梗趣味性、完整叙事逻辑" },
];

export function VideoModule({ initialTopic = "", productContext }: VideoModuleProps) {
  const [topic, setTopic] = useState(initialTopic);
  const [platform, setPlatform] = useState("douyin");
  const [duration, setDuration] = useState(15);
  const [loading, setLoading] = useState(false);
  const [scenes, setScenes] = useState<StoryboardScene[]>([
    {
      sceneNum: 1,
      duration: 3,
      visualPrompt: "特写：主人公一脸烦躁地看着杂乱的房间和烦心事",
      voiceover: "你是不是也每天被这些琐事搞得心力交瘁？",
      shotType: "特写 / 快速推镜",
    },
    {
      sceneNum: 2,
      duration: 5,
      visualPrompt: "中景：智能神器出场，柔和光影，极简科技感，一键启动演示",
      voiceover: "直到我发现了这个神器，真的彻底解放了双手！",
      shotType: "中景 / 环绕微移",
    },
    {
      sceneNum: 3,
      duration: 4,
      visualPrompt: "细节展示：核心功能运行细节，干净利落的使用后效果对比",
      voiceover: "不仅效果立竿见影，还能省下大半时间陪家人。",
      shotType: "局部微距特写",
    },
    {
      sceneNum: 4,
      duration: 3,
      visualPrompt: "全景带出行动号召：优惠信息与右下角小黄车指示动画",
      voiceover: "左下角链接趁活动赶紧入手，手慢无！",
      shotType: "固定镜头 / 动态文字",
    },
  ]);
  const [videoUrl, setVideoUrl] = useState("");
  const [generatingVideo, setGeneratingVideo] = useState(false);

  useEffect(() => {
    if (initialTopic) setTopic(initialTopic);
  }, [initialTopic]);

  const handleGenerateScript = async () => {
    if (!topic && !productContext) return;
    setLoading(true);

    try {
      const selectedP = VIDEO_PLATFORMS.find((p) => p.id === platform);
      const prompt = `你是一个资深短视频编剧和带货导演。请为【${selectedP?.name}】平台策划一个时长约为 ${duration} 秒的爆款分镜脚本。
特征要求：${selectedP?.desc}
选题背景：${topic || productContext?.title}
${productContext ? `依托商品：${productContext.title}，卖点：${(productContext.bullets || []).join("；")}` : ""}

请严格以 JSON 格式输出以下结构：
[
  {
    "sceneNum": 1,
    "duration": 3,
    "visualPrompt": "画面构图与视觉动作描述",
    "voiceover": "口播旁白或台词",
    "shotType": "镜头景别与运镜"
  }
]`;

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
        const content = data.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) setScenes(parsed);
        }
      }
    } catch (e) {
      console.error("Failed to generate storyboard:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRenderVideo = async () => {
    setGeneratingVideo(true);
    try {
      // Submit video creation via Agnes or Seedance
      const firstScene = scenes[0];
      const res = await fetch("/api/agnes_video_submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: firstScene?.visualPrompt || topic,
          seconds: "5",
          mode: "ti2vid",
          size: "720P",
          aspect_ratio: platform === "bilibili" ? "16:9" : "9:16",
        }),
      });

      if (res.ok) {
        const d = await res.json();
        const taskId = d.video_id || d.task_id || d.id;
        if (taskId) {
          // Poll query
          const pollInterval = setInterval(async () => {
            try {
              const qRes = await fetch(`/api/agnes_video_query/${taskId}`);
              if (qRes.ok) {
                const qData = await qRes.json();
                if (qData.url) {
                  setVideoUrl(qData.url);
                  clearInterval(pollInterval);
                  setGeneratingVideo(false);
                } else if (qData.status === "failed") {
                  clearInterval(pollInterval);
                  setGeneratingVideo(false);
                }
              }
            } catch {
              // ignore poll errors
            }
          }, 4000);

          setTimeout(() => {
            clearInterval(pollInterval);
            setGeneratingVideo(false);
          }, 60000);
        }
      }
    } catch (e) {
      console.error("Render video error:", e);
      setGeneratingVideo(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Settings */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <Video className="w-5 h-5 text-purple-400" />
              <span>AI 视频脚本与分镜中心</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              自动拆解黄金前3秒钩子、痛点展示、产品亮相与促单号召，生成精确到秒级的分镜脚本。
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">视频主题 / 卖点提要</label>
            <textarea
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="输入视频核心主题或核心要表达的卖点..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Platform selector */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">发布渠道与画幅比例</label>
            <div className="grid grid-cols-2 gap-2">
              {VIDEO_PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={`p-2 rounded-xl border text-left transition-all ${
                    platform === p.id
                      ? "bg-purple-500/15 border-purple-500 text-purple-300"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  <div className="text-xs font-semibold">{p.name}</div>
                  <div className="text-[10px] text-slate-500">{p.aspect} · {p.desc.slice(0, 10)}...</div>
                </button>
              ))}
            </div>
          </div>

          {/* Duration slider */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>视频预计总时长</span>
              <span className="text-purple-400 font-semibold">{duration} 秒</span>
            </div>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
          </div>

          <button
            onClick={handleGenerateScript}
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50 flex items-center justify-center space-x-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{loading ? "正在编剧分镜..." : "生成分镜脚本"}</span>
          </button>
        </div>
      </div>

      {/* Right Storyboard Display */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="text-xs font-semibold text-slate-300">
              分镜列表 ({scenes.length} 个镜头)
            </div>
            <button
              onClick={handleRenderVideo}
              disabled={generatingVideo || scenes.length === 0}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg text-xs font-semibold transition-all shadow-md shadow-purple-600/20 disabled:opacity-50"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>{generatingVideo ? "生成渲染中..." : "渲染试看视频"}</span>
            </button>
          </div>

          {/* Video preview player if generated */}
          {videoUrl && (
            <div className="aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 relative">
              <video src={videoUrl} controls autoPlay className="w-full h-full object-contain" />
            </div>
          )}

          {/* Scene cards */}
          <div className="space-y-3">
            {scenes.map((sc, idx) => (
              <div key={idx} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-purple-400">镜头 #{sc.sceneNum}</span>
                  <span className="text-slate-500">{sc.duration} 秒 · {sc.shotType}</span>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">画面提示：</div>
                  <div className="text-xs text-slate-200 mt-0.5">{sc.visualPrompt}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">口播旁白：</div>
                  <div className="text-xs text-slate-300 italic mt-0.5 font-sans">“{sc.voiceover}”</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
