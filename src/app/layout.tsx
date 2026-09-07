import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "自媒体AI运营平台 - 全链路创作与运营",
  description: "面向国内自媒体运营人员的一站式 AI 创作工具箱，集成热点、图文、视频、选品及资产管理。",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <head>
        <script src="/app.js" defer></script>
      </head>
      <body suppressHydrationWarning className="antialiased bg-[#020617] text-slate-200 selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
