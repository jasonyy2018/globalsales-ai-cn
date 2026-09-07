import json
import re

with open('src/components/layout/navData.json', 'r', encoding='utf-8') as f:
    groups = json.load(f)

# Convert svg html to JSX svg
def svg_to_jsx(svg_str):
    # replace viewbox with viewBox, stroke-width with strokeWidth, etc.
    s = svg_str
    s = s.replace('viewbox=', 'viewBox=')
    s = s.replace('stroke-width=', 'strokeWidth=')
    s = s.replace('class=', 'className=')
    s = s.replace('x1=', 'x1=').replace('y1=', 'y1=').replace('x2=', 'x2=').replace('y2=', 'y2=')
    # Self-closing tags if needed, but in JSX react:
    # line, circle, rect, polygon, path can be self-closed or closed
    return s

code = '''"use client";

import React from "react";
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
'''

for g_idx, group in enumerate(groups):
    if g_idx > 0:
        code += '        <div className="nav-divider" />\n'
    
    for item in group:
        item_id = item['id']
        nav_id = item['navId']
        title = item['title']
        badge = item['badge']
        admin_only = item['adminOnly']
        svg_jsx = svg_to_jsx(item['svgHtml'])
        
        cond_check = '        '
        if admin_only:
            code += f'        {{isAdmin && (\n'
            indent = '          '
        else:
            indent = '        '
            
        code += f'{indent}<button\n'
        code += f'{indent}  className={{`nav-item ${{currentSection === "{item_id}" ? "active" : ""}}`}}\n'
        code += f'{indent}  id="{nav_id}"\n'
        code += f'{indent}  onClick={{() => onSelectSection("{item_id}")}}\n'
        code += f'{indent}>\n'
        code += f'{indent}  {svg_jsx}\n'
        code += f'{indent}  <span>{title}</span>\n'
        if badge:
            code += f'{indent}  <span className="nav-badge">{badge}</span>\n'
        if item_id == 'assets':
            code += f'{indent}  <span className="nav-badge" id="nav-assets-badge">{{assetsCount}}</span>\n'
        code += f'{indent}</button>\n'
        
        if admin_only:
            code += '        )}\n'

code += '''      </nav>

      {/* 1:1 Exact User Badge and System Status */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        {user ? (
          <div id="userBadge" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", fontSize: "13px" }}>
            <div
              id="userBadgeAvatar"
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
              {user.username ? user.username.charAt(0).toUpperCase() : "U"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div id="userBadgeName" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.username}
              </div>
              <div id="userBadgeRole" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                {user.role === "admin" ? "管理员" : "普通用户"}
              </div>
            </div>
            <button
              onClick={onLogout}
              title="退出登录"
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
        ) : (
          <div id="userBadge" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", fontSize: "13px" }}>
            <div
              id="userBadgeAvatar"
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
              ?
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div id="userBadgeName" style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                未登录
              </div>
              <div id="userBadgeRole" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                请先登录
              </div>
            </div>
            <button
              onClick={onOpenAuth}
              title="登录 / 注册"
              style={{
                flexShrink: 0,
                background: "var(--accent)",
                border: "none",
                borderRadius: "6px",
                color: "#fff",
                cursor: "pointer",
                padding: "4px 10px",
                fontSize: "12px",
                whiteSpace: "nowrap",
              }}
            >
              登录
            </button>
          </div>
        )}

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
'''

with open('src/components/layout/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Generated src/components/layout/Sidebar.tsx successfully!")
