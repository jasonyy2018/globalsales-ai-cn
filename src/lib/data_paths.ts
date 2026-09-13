// 会话统一性修复：把散落各处的 data/app.db / data/users 绝对路径收拢到 DATA_DIR。
// 之前每个 API 路由各自拼 process.cwd()/data/...，一旦运行目录不同（standalone、
// 容器、不同工作目录起 dev），会话表就分散在不同库文件里，刷新即 401。
// 现在所有路径都从 DATA_DIR（GS_DATA_DIR 环境变量，默认 ./data）派生，全局唯一。
import path from "path";

function resolveProjectDataDir(): string {
  if (process.env.GS_DATA_DIR) {
    return path.resolve(process.env.GS_DATA_DIR);
  }
  const cwd = process.cwd();
  // Standalone server 执行了 process.chdir(__dirname)，导致 cwd 落在 .next/standalone
  // 此时向上回退两级，确保精准定位项目真实的 /data 目录，绝不发生数据库分裂
  if (cwd.includes(path.join(".next", "standalone")) || cwd.endsWith(path.join(".next", "standalone"))) {
    return path.resolve(cwd, "..", "..", "data");
  }
  return path.resolve(cwd, "data");
}

export const DATA_DIR = resolveProjectDataDir();
export const DB_PATH = path.join(DATA_DIR, "app.db");
export const USERS_DIR = path.join(DATA_DIR, "users");
export const USER_DIR = (userId: number | string) => path.join(USERS_DIR, String(userId));
