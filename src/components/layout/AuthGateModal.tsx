"use client";

import React, { useState } from "react";
import { X, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import type { User } from "@/types";

interface AuthGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

export function AuthGateModal({ isOpen, onClose, onSuccess }: AuthGateModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "请求失败，请稍后重试");
        setLoading(false);
        return;
      }

      if (data.user) {
        onSuccess(data.user);
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "网络异常，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-pink-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 p-0.5 mx-auto mb-3 shadow-lg shadow-indigo-500/30">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-indigo-400" />
            </div>
          </div>
          <h3 className="text-lg font-bold text-slate-100">
            {isLogin ? "欢迎登录自媒体AI运营平台" : "创建新账号"}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {isLogin ? "登录后可保存提示词、生成资产及同步工作区" : "一键注册，立即享受全套 AI 创作能力"}
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex bg-slate-950 p-1 rounded-xl mb-5 border border-slate-800/80">
          <button
            type="button"
            onClick={() => {
              setIsLogin(true);
              setError("");
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              isLogin ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            账号登录
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogin(false);
              setError("");
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              !isLogin ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            免费注册
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">用户名</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名（如 martinxie）"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">密码</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码（不少于 6 位）"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? "处理中..." : isLogin ? "立即登录" : "注册并开启创作"}
          </button>
        </form>

        <div className="mt-4 text-center text-[11px] text-slate-500">
          {isLogin ? (
            <span>首次体验管理员？请使用默认管理员账号登录</span>
          ) : (
            <span>注册成功将自动分配内置模型及预设提示词模板</span>
          )}
        </div>
      </div>
    </div>
  );
}
