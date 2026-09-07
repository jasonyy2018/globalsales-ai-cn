"use client";

import React, { useState } from "react";
import { Image as ImageIcon, Sparkles, Download, Copy, Check } from "lucide-react";

const RATIOS = [
  { label: "1:1 (正方形/头像)", width: 1024, height: 1024 },
  { label: "3:4 (小红书种草)", width: 768, height: 1024 },
  { label: "9:16 (短视频壁纸)", width: 576, height: 1024 },
  { label: "16:9 (横版宽屏)", width: 1024, height: 576 },
];

export function ImageModule() {
  const [prompt, setPrompt] = useState("电商高级质感静物摄影，极简奶油风智能小家电置于大理石台面，柔和晨光，超高清");
  const [ratioIdx, setRatioIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!prompt) return;
    setLoading(true);
    setError("");

    try {
      const { width, height } = RATIOS[ratioIdx];
      const res = await fetch("/api/ark_image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model: "doubao-image",
          width,
          height,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || `出图服务响应异常 (${res.status})`);
        return;
      }

      const data = await res.json();
      const imgUrl = data.data?.[0]?.url || data.url;
      if (imgUrl) {
        setImages((prev) => [imgUrl, ...prev]);
        // Also save to backend assets
        fetch("/api/data/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "image",
            title: prompt.slice(0, 30),
            url: imgUrl,
            model: "ark-image",
          }),
        }).catch(() => {});
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "生图失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <ImageIcon className="w-5 h-5 text-pink-400" />
            <span>AI 视觉出图工作台 (火山 Seedream 4.0)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            支持中文提示词直出超清商用级场景图、商品主图及社媒封面，自动完成落盘沉淀。
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">图片生成提示词 (Prompt)</label>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述画面的主体、光影、环境、材质与视角..."
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-pink-500"
          />
        </div>

        {/* Ratio options */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">画幅尺寸比例</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {RATIOS.map((r, idx) => (
              <button
                key={idx}
                onClick={() => setRatioIdx(idx)}
                className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                  ratioIdx === idx
                    ? "bg-pink-500/20 text-pink-300 border-pink-500/40"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                {r.label}
              </button>
            ))}
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
          className="w-full py-2.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-pink-600/30 transition-all disabled:opacity-50 flex items-center justify-center space-x-1"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{loading ? "正在渲染生成高清图片..." : "生成高清图片"}</span>
        </button>
      </div>

      {/* Images gallery */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
        <h4 className="text-xs font-semibold text-slate-300 mb-4">生成成果画廊 ({images.length} 张)</h4>
        {images.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {images.map((img, i) => (
              <div key={i} className="aspect-square bg-slate-950 rounded-xl overflow-hidden border border-slate-800 relative group">
                <img src={img} alt="output" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                  <a
                    href={img}
                    download={`ai-image-${i}.png`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center text-xs text-slate-500">
            尚未生成图片，在上方输入提示词后点击生成即可预览
          </div>
        )}
      </div>
    </div>
  );
}
