import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  // 让构建产物（.next/standalone）不携带 data/ 目录的快照副本。
  // standalone 运行时会通过 data_paths.ts 回退到项目根 ./data，
  // dev 与 prod 共用同一份库，彻底避免"两份数据库"造成的会话/数据分裂。
  // Docker 场景下由 docker-compose 的 GS_DATA_DIR=/app/data 指向挂载卷。
  outputFileTracingExcludes: {
    "*": ["data/**", "**/*.db", "**/*.db-*"],
  },
};

export default nextConfig;
