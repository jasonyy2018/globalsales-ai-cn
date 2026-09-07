"use client";

import React from "react";
import { LogOut, User as UserIcon, Shield, Sparkles, CheckCircle2 } from "lucide-react";
import type { User } from "@/types";

interface HeaderProps {
  currentSectionTitle: string;
  currentSectionDesc?: string;
  user: User | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  saveStatus?: "saved" | "saving" | "idle";
}

export function Header({
  currentSectionTitle,
  currentSectionDesc,
  user,
  onOpenAuth,
  onLogout,
  saveStatus = "idle",
}: HeaderProps) {
  return (
    <header className="h-14 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
      {/* Left title */}
      <div className="flex items-center space-x-3">
        <h2 className="text-sm font-semibold text-slate-100 flex items-center space-x-2">
          <span>{currentSectionTitle}</span>
        </h2>
        {currentSectionDesc && (
          <span className="text-xs text-slate-500 hidden md:inline-block border-l border-slate-800 pl-3">
            {currentSectionDesc}
          </span>
        )}
      </div>

      {/* Right user & state */}
      <div className="flex items-center space-x-4">
        {/* Autosave status indicator */}
        <div className="text-xs flex items-center space-x-1.5 text-slate-400">
          {saveStatus === "saving" && (
            <span className="text-indigo-400 flex items-center space-x-1 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
              <span>同步云端...</span>
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-emerald-400/90 flex items-center space-x-1 text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>已保存</span>
            </span>
          )}
        </div>

        {/* User state */}
        {user ? (
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-slate-900/80 border border-slate-800 px-2.5 py-1 rounded-lg">
              <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-medium text-slate-200">{user.username}</span>
              {user.role === "admin" ? (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-semibold flex items-center space-x-0.5">
                  <Shield className="w-2.5 h-2.5 inline mr-0.5" />
                  管理员
                </span>
              ) : (
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded">
                  用户
                </span>
              )}
            </div>

            <button
              onClick={onLogout}
              title="退出登录"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-sm"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>登录 / 注册</span>
          </button>
        )}
      </div>
    </header>
  );
}
