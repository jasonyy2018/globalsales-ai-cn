"use client";

import React, { useState, useEffect } from "react";
import { FolderArchive, FileText, Image as ImageIcon, Video, Trash2, Download, ExternalLink, RefreshCw } from "lucide-react";
import type { Asset } from "@/types";

export function AssetsModule() {
  const [activeTab, setActiveTab] = useState<"all" | "article" | "image" | "video">("all");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const q = activeTab === "all" ? "" : `?kind=${activeTab}`;
      const res = await fetch(`/api/data/assets${q}`);
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
      }
    } catch (e) {
      console.error("Fetch assets failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [activeTab]);

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此资产吗？此操作无法撤销。")) return;
    try {
      const res = await fetch(`/api/data/assets?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setAssets((prev) => prev.filter((a) => a.id !== id));
        if (selectedAsset?.id === id) setSelectedAsset(null);
      }
    } catch (e) {
      console.error("Delete asset failed:", e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <FolderArchive className="w-5 h-5 text-cyan-400" />
            <span>自媒体数字资产沉淀库</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            统一沉淀与归档所有生成的软文图文、高清视觉配图及短视频成片，支持随时检索与跨平台分发。
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(
              [
                { id: "all", label: "全部" },
                { id: "article", label: "图文", icon: FileText },
                { id: "image", label: "图片", icon: ImageIcon },
                { id: "video", label: "成片", icon: Video },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchAssets}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
            title="刷新列表"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Asset Grid */}
      {assets.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              onClick={() => setSelectedAsset(asset)}
              className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden cursor-pointer group flex flex-col justify-between transition-all"
            >
              {/* Thumbnail / Header */}
              {asset.kind === "image" && asset.url && (
                <div className="aspect-video bg-slate-950 overflow-hidden relative">
                  <img src={asset.url} alt={asset.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                </div>
              )}
              {asset.kind === "video" && (
                <div className="aspect-video bg-black flex items-center justify-center relative">
                  <Video className="w-8 h-8 text-purple-400" />
                </div>
              )}
              {asset.kind === "article" && (
                <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center space-x-2 text-rose-400 text-xs font-semibold">
                  <FileText className="w-4 h-4" />
                  <span>软文图文</span>
                </div>
              )}

              {/* Body */}
              <div className="p-4 flex-1 space-y-1.5">
                <h4 className="text-xs font-bold text-slate-200 line-clamp-1 group-hover:text-cyan-300 transition-colors">
                  {asset.title || "未命名资产"}
                </h4>
                {asset.content && (
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {asset.content}
                  </p>
                )}
                <div className="text-[10px] text-slate-500 pt-1">
                  {asset.created_at ? new Date(asset.created_at).toLocaleDateString("zh-CN") : ""}
                </div>
              </div>

              {/* Actions */}
              <div className="p-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
                <span className="text-[10px] text-slate-500">{asset.platform || asset.model}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(asset.id);
                  }}
                  className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-dashed border-slate-800 rounded-2xl p-16 text-center text-slate-500 text-xs">
          <FolderArchive className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
          <span>暂无沉淀资产，在图文或视频模块生成后将自动归档至此</span>
        </div>
      )}

      {/* Asset Detail Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 relative max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100">{selectedAsset.title}</h3>
              <button
                onClick={() => setSelectedAsset(null)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                关闭
              </button>
            </div>

            {selectedAsset.url && selectedAsset.kind === "image" && (
              <div className="max-h-96 overflow-hidden rounded-xl bg-slate-950 flex justify-center">
                <img src={selectedAsset.url} alt="detail" className="max-h-96 object-contain" />
              </div>
            )}

            {selectedAsset.url && selectedAsset.kind === "video" && (
              <div className="aspect-video bg-black rounded-xl overflow-hidden">
                <video src={selectedAsset.url} controls autoPlay className="w-full h-full object-contain" />
              </div>
            )}

            {selectedAsset.content && (
              <div className="bg-slate-950 p-4 rounded-xl text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                {selectedAsset.content}
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedAsset.content || selectedAsset.url || "");
                  alert("已复制内容到剪贴板");
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl"
              >
                复制内容
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
