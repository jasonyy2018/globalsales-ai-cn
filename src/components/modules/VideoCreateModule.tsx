"use client";

import React, { useState } from "react";
import { Film, Play, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";

export function VideoCreateModule() {
  const [model, setModel] = useState("agnes-video");
  const [prompt, setPrompt] = useState("航拍壮丽的山峰云海，日落金色晚霞，无人机平稳穿越云层，4k画质，电影级调色");
  const [aspect, setAspect] = useState("16:9");
  const [seconds, setSeconds] = useState("5");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!prompt) return;
    setLoading(true);
    setError("");
    setStatusText("正在向视频引擎提交任务...");
    setVideoUrl("");

    try {
      let endpoint = "/api/agnes_video_submit";
      let queryEndpoint = "/api/agnes_video_query";
      if (model === "agnes-video-25") {
        endpoint = "/api/agnes_video25_submit";
        queryEndpoint = "/api/agnes_video25_query";
      } else if (model === "seedance") {
        endpoint = "/api/seedance_mini/create";
        queryEndpoint = "/api/seedance_mini/status";
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          seconds,
          mode: "ti2vid",
          size: "720P",
          aspect_ratio: aspect,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "视频引擎提交失败，请检查密钥与额度");
        setLoading(false);
        return;
      }

      const data = await res.json();
      const taskId = data.video_id || data.task_id || data.id;

      if (!taskId) {
        setError("未获取到任务ID");
        setLoading(false);
        return;
      }

      setStatusText(`任务已提交队列（ID: ${taskId.slice(0, 10)}...），正在排队生成...`);

      // Poll every 5s
      const timer = setInterval(async () => {
        try {
          const qRes = await fetch(`${queryEndpoint}/${taskId}`);
          if (qRes.ok) {
            const qData = await qRes.json();
            if (qData.url) {
              setVideoUrl(qData.url);
              setStatusText("视频生成完成！");
              clearInterval(timer);
              setLoading(false);

              // Save to assets
              fetch("/api/data/assets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  kind: "video",
                  title: prompt.slice(0, 30),
                  url: qData.url,
                  model,
                }),
              }).catch(() => {});
            } else if (qData.status === "failed") {
              setError("视频生成失败：" + (qData.error || "厂商推理报错"));
              clearInterval(timer);
              setLoading(false);
            } else {
              setStatusText(`正在渲染中... 进度: ${qData.progress || "排队中"}`);
            }
          }
        } catch {
          // ignore
        }
      }, 5000);

      setTimeout(() => {
        clearInterval(timer);
        if (loading) {
          setError("轮询超时，请稍后前往资产库查看");
          setLoading(false);
        }
      }, 300000); // 5 min timeout
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "提交异常");
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <Film className="w-5 h-5 text-blue-400" />
              <span>文生视频独立工作台</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              支持 Agnes Video 与 Seedance 2 Mini 等前沿大模型，一键根据文字构想生成电影级动态视频。
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">选择视频生成引擎</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="agnes-video">Agnes Video 2.0 (默认文生视频)</option>
              <option value="agnes-video-25">Agnes Video 2.5 (高保真版本)</option>
              <option value="seedance">Seedance 2.0 Mini (字节系引擎)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">视频镜头提示词 (Prompt)</label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="详细描述画面运动、角色动作、光线镜头转场..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">画幅比例</label>
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="16:9">16:9 横屏</option>
                <option value="9:16">9:16 竖屏</option>
                <option value="1:1">1:1 正方形</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">生成时长</label>
              <select
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="5">5 秒</option>
                <option value="10">10 秒</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading || !prompt}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 flex items-center justify-center space-x-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{loading ? "视频渲染任务处理中..." : "提交视频生成"}</span>
          </button>

          {statusText && (
            <div className="text-[11px] text-blue-300/80 bg-blue-500/10 p-2.5 rounded-xl border border-blue-500/20">
              {statusText}
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-7">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 min-h-[500px] flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-semibold text-slate-300 border-b border-slate-800 pb-3 mb-4">
              视频渲染播放器
            </h4>

            {videoUrl ? (
              <div className="aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 relative">
                <video src={videoUrl} controls autoPlay className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="aspect-video bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center text-slate-500 text-xs">
                {loading ? "视频正在云端算力集群渲染中，请稍候..." : "在左侧配置参数后点击提交生成视频"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
