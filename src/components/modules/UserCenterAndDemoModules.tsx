"use client";

import React, { useState } from "react";
import { HelpCircle, User as UserIcon, Lock, CheckCircle2, AlertCircle, Play, Shield } from "lucide-react";
import type { User } from "@/types";

export function DemoModule() {
  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
        <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
          <HelpCircle className="w-5 h-5 text-rose-400" />
          <span>系统操作演示与新手教学</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          直观了解从爆款选品、热点提炼、商品抓取到图文和视频生成发布的一站式自媒体工作流。
        </p>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 overflow-hidden">
        <div className="aspect-video bg-black rounded-xl overflow-hidden relative shadow-2xl">
          <video
            src="/api/demo-video"
            controls
            preload="metadata"
            className="w-full h-full object-contain"
          >
            您的浏览器不支持视频播放。
          </video>
        </div>
      </div>
    </div>
  );
}

export function UserCenterModule({ user }: { user: User | null }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setError("");

    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    if (newPassword.length < 6) {
      setError("新密码不能少于 6 个字符");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "修改失败");
      } else {
        setMsg("密码修改成功！下次登录请使用新密码。");
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setError("网络异常");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-2xl flex items-center space-x-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-indigo-500/20">
          {user?.username?.charAt(0).toUpperCase() || "U"}
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-bold text-slate-100">{user?.username || "未登录"}</h3>
            {user?.role === "admin" ? (
              <span className="text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md font-semibold flex items-center">
                <Shield className="w-3 h-3 mr-1" />
                超级管理员
              </span>
            ) : (
              <span className="text-[11px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md">
                普通创作者
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            注册时间：{user?.created_at ? new Date(user.created_at).toLocaleDateString("zh-CN") : "--"}
          </p>
        </div>
      </div>

      {/* Change Password Card */}
      <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-2xl space-y-4">
        <h4 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
          <Lock className="w-4 h-4 text-indigo-400" />
          <span>修改密码</span>
        </h4>

        {msg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">当前旧密码</label>
            <input
              type="password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">新密码 (不少于6位)</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">确认新密码</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 mt-2"
          >
            {loading ? "更新中..." : "保存新密码"}
          </button>
        </form>
      </div>
    </div>
  );
}
