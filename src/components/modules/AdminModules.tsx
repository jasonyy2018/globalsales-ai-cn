"use client";

import React, { useState, useEffect } from "react";
import { Users, Activity, Share2, Key, Trash2, Shield, RefreshCw } from "lucide-react";
import type { User } from "@/types";

export function AdminUsersModule() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [resetId, setResetId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const d = await res.json();
        setUsers(d.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleResetPassword = async (userId: number) => {
    if (!newPassword || newPassword.length < 6) {
      alert("密码长度不能少于 6 位");
      return;
    }
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_password", userId, newPassword }),
      });
      if (res.ok) {
        alert("密码已成功重置！");
        setResetId(null);
        setNewPassword("");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此用户吗？其名下的提示词与资产将级联清空。")) return;
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== id));
      } else {
        const d = await res.json();
        alert(d.error || "删除失败");
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <Users className="w-5 h-5 text-rose-400" />
            <span>系统用户管理 (管理员专属)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            查看系统注册用户列表、直接重置用户密码或执行账户管理操作。
          </p>
        </div>

        <button
          onClick={fetchUsers}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">UID</th>
              <th className="py-3 px-4">用户名</th>
              <th className="py-3 px-4">角色</th>
              <th className="py-3 px-4">注册时间</th>
              <th className="py-3 px-4">管理操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-800/30">
                <td className="py-3 px-4 font-mono text-slate-500">{u.id}</td>
                <td className="py-3 px-4 font-semibold text-slate-100">{u.username}</td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      u.role === "admin" ? "bg-amber-500/20 text-amber-300" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {u.role === "admin" ? "管理员" : "普通用户"}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-400">
                  {u.created_at ? new Date(u.created_at).toLocaleString("zh-CN") : "--"}
                </td>
                <td className="py-3 px-4 flex items-center space-x-2">
                  <button
                    onClick={() => setResetId(u.id)}
                    className="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>重置密码</span>
                  </button>
                  {u.role !== "admin" && (
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="text-rose-400 hover:text-rose-300 flex items-center space-x-1 ml-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>删除</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-100">为用户 (ID: {resetId}) 设置新密码</h4>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="输入新密码 (不少于6位)..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setResetId(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                取消
              </button>
              <button
                onClick={() => handleResetPassword(resetId)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
              >
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminIpStatsModule() {
  const [stats, setStats] = useState<Array<{ ip: string; count: number; last_seen: string; region: string }>>([
    { ip: "127.0.0.1", count: 184, last_seen: "刚刚", region: "本地环境" },
    { ip: "183.14.28.92", count: 42, last_seen: "10分钟前", region: "广东深圳 电信" },
    { ip: "114.248.51.10", count: 29, last_seen: "30分钟前", region: "北京 联通" },
    { ip: "222.66.109.14", count: 18, last_seen: "1小时前", region: "上海 移动" },
  ]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
        <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
          <Activity className="w-5 h-5 text-red-400" />
          <span>系统访客 IP 监控与统计</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          实时记录访问本平台的外部来源 IP、访问频次及地理归属分析。
        </p>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">访客 IP 地址</th>
              <th className="py-3 px-4">请求频次</th>
              <th className="py-3 px-4">归属地运营商</th>
              <th className="py-3 px-4">最近活跃</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {stats.map((s, i) => (
              <tr key={i} className="hover:bg-slate-800/30">
                <td className="py-3 px-4 font-mono text-indigo-300 font-medium">{s.ip}</td>
                <td className="py-3 px-4 font-semibold text-slate-100">{s.count} 次</td>
                <td className="py-3 px-4 text-slate-400">{s.region}</td>
                <td className="py-3 px-4 text-slate-500">{s.last_seen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AccountsModule() {
  const [accounts, setAccounts] = useState([
    { platform: "小红书", account: "小陈的选品日常", status: "已绑定", fans: "1.2万" },
    { platform: "抖音", account: "智能好物测评君", status: "已绑定", fans: "8.5万" },
    { platform: "微信视频号", account: "生活智慧收纳", status: "已绑定", fans: "3.4万" },
  ]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
        <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
          <Share2 className="w-5 h-5 text-yellow-400" />
          <span>多平台矩阵自媒体账号管理</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          管理分发矩阵渠道授权，便于生成图文与视频后一键跨平台投放。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {accounts.map((acc, i) => (
          <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm font-bold text-slate-100">{acc.account}</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                {acc.status}
              </span>
            </div>
            <div className="text-xs text-slate-400">平台：{acc.platform}</div>
            <div className="text-xs text-slate-400">粉丝量级：{acc.fans}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
