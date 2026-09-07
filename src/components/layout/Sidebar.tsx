"use client";

import React from "react";
import {
  ShoppingBag,
  Flame,
  Search,
  FileText,
  Video,
  MessageSquareQuote,
  PenTool,
  Image as ImageIcon,
  Film,
  MessagesSquare,
  ShieldAlert,
  Share2,
  FolderArchive,
  Activity,
  Store,
  Globe2,
  CalendarDays,
  BarChart3,
  Cpu,
  Layers,
  Sparkles,
  HelpCircle,
  User,
  Users,
  Lock,
} from "lucide-react";
import type { UserRole } from "@/types";

export interface NavItem {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor: string;
  badge?: string;
  adminOnly?: boolean;
}

export interface NavGroup {
  name: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    name: "选品",
    items: [
      { id: "sourcing", name: "选品推荐", icon: ShoppingBag, iconColor: "#34d399", badge: "AI" },
    ],
  },
  {
    name: "内容主链路",
    items: [
      { id: "hotspot", name: "热点发现", icon: Flame, iconColor: "#fbbf24", badge: "实时" },
      { id: "product", name: "商品情报抓取", icon: Search, iconColor: "#38bdf8", badge: "URL" },
      { id: "article", name: "图文生成", icon: FileText, iconColor: "#fb7185" },
      { id: "video", name: "视频生成", icon: Video, iconColor: "#c084fc" },
      { id: "freeqa", name: "自由问答", icon: MessageSquareQuote, iconColor: "#818cf8" },
    ],
  },
  {
    name: "创作工具",
    items: [
      { id: "text-studio", name: "文案创作", icon: PenTool, iconColor: "#2dd4bf" },
      { id: "image", name: "图片创作", icon: ImageIcon, iconColor: "#f472b6" },
      { id: "video-create", name: "视频创作", icon: Film, iconColor: "#60a5fa" },
      { id: "comment", name: "热门评论衍生", icon: MessagesSquare, iconColor: "#fb923c" },
      { id: "smart-reply", name: "棘手评论回复", icon: ShieldAlert, iconColor: "#a78bfa" },
    ],
  },
  {
    name: "资产与账号",
    items: [
      { id: "accounts", name: "账号管理", icon: Share2, iconColor: "#facc15", adminOnly: true },
      { id: "assets", name: "自媒体资产", icon: FolderArchive, iconColor: "#22d3ee" },
      { id: "ip-stats", name: "访客IP统计", icon: Activity, iconColor: "#f87171", adminOnly: true },
    ],
  },
  {
    name: "参考资料",
    items: [
      { id: "commerce-platforms", name: "主流电商平台", icon: Store, iconColor: "#a3e635" },
      { id: "social-platforms", name: "主流社媒平台", icon: Globe2, iconColor: "#e879f9" },
      { id: "holidays", name: "国内营销节日", icon: CalendarDays, iconColor: "#34d399" },
      { id: "metrics", name: "电商运营指标", icon: BarChart3, iconColor: "#38bdf8" },
    ],
  },
  {
    name: "配置",
    items: [
      { id: "prompts", name: "提示词配置", icon: Layers, iconColor: "#a78bfa" },
      { id: "models", name: "大模型配置", icon: Cpu, iconColor: "#818cf8" },
      { id: "model-shop", name: "大模型选购", icon: Sparkles, iconColor: "#fbbf24" },
    ],
  },
  {
    name: "帮助与账号",
    items: [
      { id: "demo", name: "操作演示", icon: HelpCircle, iconColor: "#fb7185" },
      { id: "user-center", name: "用户中心", icon: User, iconColor: "#60a5fa" },
      { id: "users", name: "用户管理", icon: Users, iconColor: "#f87171", adminOnly: true },
    ],
  },
];

interface SidebarProps {
  currentSection: string;
  onSelectSection: (id: string) => void;
  userRole?: UserRole;
}

export function Sidebar({ currentSection, onSelectSection, userRole = "user" }: SidebarProps) {
  const isAdmin = userRole === "admin";

  return (
    <aside className="w-64 bg-[#0a101f]/95 border-r border-slate-800/80 flex flex-col h-screen sticky top-0 shrink-0 select-none z-20 backdrop-blur-xl">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-0.5 shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100 tracking-wide">自媒体AI运营平台</h1>
            <p className="text-[11px] text-slate-400">Next.js 全栈版 v2.0</p>
          </div>
        </div>
      </div>

      {/* Navigation list */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group, groupIdx) => {
          const visibleItems = group.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.name} className="space-y-1">
              <div className="px-3 text-[11px] font-semibold text-slate-500 tracking-wider uppercase mb-1.5 flex items-center justify-between">
                <span>{group.name}</span>
                {groupIdx > 0 && <span className="text-[10px] text-slate-600">0{groupIdx + 1}</span>}
              </div>

              {visibleItems.map((item) => {
                const isActive = currentSection === item.id;
                const IconComponent = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectSection(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 group ${
                      isActive
                        ? "bg-gradient-to-r from-indigo-600/30 via-purple-600/20 to-transparent text-indigo-200 border-l-2 border-indigo-500 shadow-sm"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <IconComponent
                        className={`w-4 h-4 transition-transform group-hover:scale-110 shrink-0 ${
                          isActive ? "opacity-100" : "opacity-80"
                        }`}
                        style={{ color: item.iconColor }}
                      />
                      <span className="truncate">{item.name}</span>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      {item.badge && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {item.badge}
                        </span>
                      )}
                      {item.adminOnly && (
                        <Lock className="w-3 h-3 text-amber-400/80" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="p-3 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between bg-slate-950/40">
        <span className="flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>系统正常运行</span>
        </span>
        <span className="text-slate-600">Docker Standalone</span>
      </div>
    </aside>
  );
}
