"use client";

import React, { useEffect, useState } from "react";
import type { User } from "@/types";

interface SidebarProps {
  currentSection: string;
  onSelectSection: (id: string) => void;
  user: User | null;
  onLogout: () => void;
  onOpenAuth: () => void;
  assetsCount?: number;
}

export function Sidebar({
  currentSection,
  onSelectSection,
  user,
  onLogout,
  onOpenAuth,
  assetsCount = 0,
}: SidebarProps) {
  const isAdmin = user?.role === "admin";
  const getNavClass = (section: string) => (currentSection === section ? "nav-item active" : "nav-item");

  // SSR 时 user 恒为 null，客户端挂载后异步拉到真实用户。若直接用 isAdmin 决定
  // 管理员可见的导航项显示/隐藏，服务端与客户端首帧不一致会触发 hydration mismatch。
  // 因此首帧统一按"非管理员"渲染，挂载后再依据真实用户更新。
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const showAdminItems = mounted && isAdmin;

  return (
    <aside className="sidebar">
      {/* 1:1 Exact Original Logo */}
      <div className="logo">
        <img
          src="/Logo.png"
          alt="Logo"
          style={{ width: "80%", height: "auto", maxWidth: "176px", objectFit: "contain" }}
        />
      </div>

      {/* Navigation items divided by exact .nav-divider */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <button
          className={getNavClass("sourcing")}
          id="nav-sourcing"
          onClick={() => onSelectSection("sourcing")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path></svg>
          <span>选品</span>
          <span className="nav-badge">AI</span>
        </button>
        <div className="nav-divider" />
        <button
          className={getNavClass("hotspot")}
          id="nav-hotspot"
          onClick={() => onSelectSection("hotspot")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2z"></path><circle cx="12" cy="20" r="2"></circle></svg>
          <span>热点发现</span>
          <span className="nav-badge">实时</span>
        </button>
        <button
          className={getNavClass("product")}
          id="nav-product"
          onClick={() => onSelectSection("product")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" x2="21" y1="6" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
          <span>商品情报抓取</span>
          <span className="nav-badge">URL</span>
        </button>
        <button
          className={getNavClass("article")}
          id="nav-article"
          onClick={() => onSelectSection("article")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect height="18" rx="2" width="18" x="3" y="3"></rect><line x1="8" x2="16" y1="8" y2="8"></line><line x1="8" x2="16" y1="12" y2="12"></line><line x1="8" x2="12" y1="16" y2="16"></line></svg>
          <span>图文生成</span>
        </button>
        <button
          className={getNavClass("video")}
          id="nav-video"
          onClick={() => onSelectSection("video")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"></polygon></svg>
          <span>视频生成</span>
        </button>
        <div className="nav-divider" />
        <button
          className={getNavClass("freeqa")}
          id="nav-freeqa"
          onClick={() => onSelectSection("freeqa")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          <span>自由问答</span>
        </button>
        <button
          className={getNavClass("text-studio")}
          id="nav-text-studio"
          onClick={() => onSelectSection("text-studio")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h10"></path><path d="M18 16l3 3-3 3"></path></svg>
          <span>文案创作</span>
        </button>
        <button
          className={getNavClass("image")}
          id="nav-image"
          onClick={() => onSelectSection("image")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect height="18" rx="2" width="18" x="3" y="3"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21,15 16,10 5,21"></polyline></svg>
          <span>图片创作</span>
        </button>
        <button
          className={getNavClass("video-create")}
          id="nav-video-create"
          onClick={() => onSelectSection("video-create")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect height="12" rx="2" width="14" x="2" y="6"></rect><polyline points="22,8 16,12 22,16 22,8"></polyline></svg>
          <span>视频创作</span>
        </button>
        <button
          className={getNavClass("comment")}
          id="nav-comment"
          onClick={() => onSelectSection("comment")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><polyline points="8,9 16,9"></polyline><polyline points="8,13 14,13"></polyline></svg>
          <span>热门评论衍生</span>
        </button>
        <button
          className={getNavClass("smart-reply")}
          id="nav-smart-reply"
          onClick={() => onSelectSection("smart-reply")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12c0 1.6.4 3.1 1.1 4.4L2 22l5.6-1.1c1.3.7 2.8 1.1 4.4 1.1z"></path><polyline points="8,9 16,9"></polyline><polyline points="8,13 14,13"></polyline></svg>
          <span>棘手评论回复</span>
        </button>
        <div className="nav-divider" />
        <button
          className={getNavClass("accounts")}
          id="nav-accounts"
          onClick={() => onSelectSection("accounts")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          <span>账号管理</span>
          <span className="nav-badge">0</span>
        </button>
        <button
          className={getNavClass("assets")}
          id="nav-assets"
          onClick={() => onSelectSection("assets")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" x2="12" y1="11" y2="17"></line><line x1="9" x2="15" y1="14" y2="14"></line></svg>
          <span>自媒体资产</span>
          <span className="nav-badge">0</span>
          <span className="nav-badge" id="nav-assets-badge">{assetsCount}</span>
        </button>
        <button
          className={getNavClass("ip-stats")}
          id="nav-ip-stats"
          onClick={() => onSelectSection("ip-stats")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect height="8" rx="2" width="20" x="2" y="2"></rect><rect height="8" rx="2" width="20" x="2" y="14"></rect><circle cx="6" cy="6" r="1"></circle><circle cx="10" cy="18" r="1"></circle></svg>
          <span>访客IP统计</span>
        </button>
        <div className="nav-divider" />
        <button
          className={getNavClass("commerce-platforms")}
          id="nav-commerce-platforms"
          onClick={() => onSelectSection("commerce-platforms")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" x2="21" y1="6" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
          <span>主流电商平台</span>
        </button>
        <button
          className={getNavClass("social-platforms")}
          id="nav-social-platforms"
          onClick={() => onSelectSection("social-platforms")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="2" x2="22" y1="12" y2="12"></line><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"></path></svg>
          <span>主流社媒平台</span>
        </button>
        <button
          className={getNavClass("holidays")}
          id="nav-holidays"
          onClick={() => onSelectSection("holidays")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect height="18" rx="2" width="18" x="3" y="4"></rect><line x1="16" x2="16" y1="2" y2="6"></line><line x1="8" x2="8" y1="2" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line></svg>
          <span>国内营销节日</span>
        </button>
        <button
          className={getNavClass("metrics")}
          id="nav-metrics"
          onClick={() => onSelectSection("metrics")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" x2="18" y1="20" y2="10"></line><line x1="12" x2="12" y1="20" y2="4"></line><line x1="6" x2="6" y1="20" y2="14"></line><line x1="3" x2="21" y1="20" y2="20"></line></svg>
          <span>电商运营指标</span>
        </button>
        <div className="nav-divider" />
        <button
          className={getNavClass("prompts")}
          id="nav-prompts"
          onClick={() => onSelectSection("prompts")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" x2="8" y1="13" y2="13"></line><line x1="16" x2="8" y1="17" y2="17"></line></svg>
          <span>提示词配置</span>
        </button>
        <button
          className={getNavClass("models")}
          id="nav-models"
          onClick={() => onSelectSection("models")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect height="14" rx="2" width="20" x="2" y="3"></rect><line x1="8" x2="16" y1="21" y2="21"></line><line x1="12" x2="12" y1="17" y2="21"></line></svg>
          <span>大模型配置</span>
        </button>
        <button
          className={getNavClass("model-shop")}
          id="nav-model-shop"
          onClick={() => onSelectSection("model-shop")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
          <span>大模型选购</span>
        </button>
        <div className="nav-divider" />
        <button
          className={getNavClass("demo")}
          id="nav-demo"
          onClick={() => onSelectSection("demo")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect height="15" rx="2" width="20" x="2" y="4"></rect><polygon fill="currentColor" points="10 9 15 11.5 10 14" stroke="none"></polygon><line x1="8" x2="16" y1="22" y2="22"></line></svg>
          <span>操作演示</span>
        </button>
        <button
          className={getNavClass("user-center")}
          id="nav-user-center"
          onClick={() => onSelectSection("user-center")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"></circle><path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"></path></svg>
          <span>用户中心</span>
        </button>
                <button
          className={getNavClass("users")}
          id="nav-users"
          suppressHydrationWarning
          style={showAdminItems ? undefined : { display: "none" }}
          onClick={() => onSelectSection("users")}
        >
          <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          <span>用户管理</span>
        </button>
      </nav>

      {/* 1:1 Exact User Badge and System Status */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <div id="userBadge" suppressHydrationWarning style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", fontSize: "13px" }}>
          <div
            id="userBadgeAvatar"
            suppressHydrationWarning
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "50%",
              background: "var(--accent)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "12px",
            }}
          >
            {user?.username ? user.username.charAt(0).toUpperCase() : "U"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              id="userBadgeName"
              suppressHydrationWarning
              style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {user?.username || "未登录"}
            </div>
            <div
              id="userBadgeRole"
              suppressHydrationWarning
              style={{ fontSize: "11px", color: "var(--text-secondary)" }}
            >
              {user ? (user.role === "admin" ? "管理员" : "普通用户") : "请先登录"}
            </div>
          </div>
          <button
            onClick={user ? onLogout : onOpenAuth}
            title={user ? "退出登录" : "退出登录"}
            data-i18n-title="app.logout"
            data-i18n="app.logout"
            style={{
              flexShrink: 0,
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: "4px 10px",
              fontSize: "12px",
              whiteSpace: "nowrap",
            }}
          >
            退出登录
          </button>
        </div>

        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>当前状态</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--green)",
              boxShadow: "0 0 8px rgba(34,197,94,0.5)",
            }}
          />
          <span style={{ fontSize: "13px" }}>所有服务正常运行</span>
        </div>
      </div>
    </aside>
  );
}
