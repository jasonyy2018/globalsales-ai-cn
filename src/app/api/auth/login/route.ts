import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyPassword, hashPassword, createSession, COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/auth";
import type { User, UserRole } from "@/types";

export async function POST(request: Request) {
  try {
    let { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
    }

    const cleanUsername = String(username).trim();
    const cleanPassword = String(password).trim();
    const normalizedUser = (cleanUsername === "管理员" || cleanUsername.toLowerCase() === "administrator")
      ? "admin"
      : cleanUsername;

    const db = getDb();
    let userRow = db.prepare(`
      SELECT id, username, pass_hash, salt, role, created_at, prompts_seeded
      FROM users
      WHERE username = ? COLLATE NOCASE
    `).get(normalizedUser) as (User & { pass_hash: string; salt: string }) | undefined;

    // 管理员账号不存在时：严格按 .env 的 GS_ADMIN_USER / GS_ADMIN_PASS 自动补建。
    // 源码里不再写死任何真实密码（之前硬编码的默认值已泄露进 git 历史）。
    // 未配置 GS_ADMIN_PASS 时不自动创建，直接提示去环境变量设置，避免落回已知密码。
    if (!userRow) {
      const envAdminUser = (process.env.GS_ADMIN_USER || "admin").trim().toLowerCase();
      const envAdminPass = (process.env.GS_ADMIN_PASS || "").trim();
      if (normalizedUser.toLowerCase() === envAdminUser && envAdminPass) {
        const { hash, salt } = hashPassword(envAdminPass);
        const info = db.prepare(`
          INSERT INTO users (username, pass_hash, salt, role, created_at, prompts_seeded)
          VALUES (?, ?, ?, 'admin', ?, 1)
        `).run(normalizedUser, hash, salt, new Date().toISOString());
        userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid) as any;
      }
    }

    if (!userRow) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    // 正常密码校验（先原始输入，再去首尾空白，兼容用户误粘空格）
    const isValid = verifyPassword(password, userRow.salt, userRow.pass_hash)
      || verifyPassword(cleanPassword, userRow.salt, userRow.pass_hash);

    if (!isValid) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const token = createSession(userRow.id);

    const isSecure = process.env.GS_COOKIE_SECURE === "1";
    const res = NextResponse.json({
      success: true,
      user: {
        id: userRow.id,
        username: userRow.username,
        role: userRow.role,
        created_at: userRow.created_at,
      },
    });

    res.cookies.set(COOKIE_NAME, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      maxAge: SESSION_TTL_SECONDS,
    });

    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
