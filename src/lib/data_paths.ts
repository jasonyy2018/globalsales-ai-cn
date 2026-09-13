// 会话统一性修复：把散落各处的 data/app.db / data/users 绝对路径收拢到 DATA_DIR。
// 之前每个 API 路由各自拼 process.cwd()/data/...，一旦运行目录不同（standalone、
// 容器、不同工作目录起 dev），会话表就分散在不同库文件里，刷新即 401。
// 现在所有路径都从 DATA_DIR（GS_DATA_DIR 环境变量，默认 ./data）派生，全局唯一。
import path from "path";

export const DATA_DIR = path.resolve(process.env.GS_DATA_DIR || path.join(process.cwd(), "data"));
export const DB_PATH = path.join(DATA_DIR, "app.db");
export const USERS_DIR = path.join(DATA_DIR, "users");
export const USER_DIR = (userId: number | string) => path.join(USERS_DIR, String(userId));
