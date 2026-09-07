import { NextResponse } from "next/server";
import { getDb, seedUserDefaultModels } from "@/lib/db";
import { hashPassword, createSession, COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
    }
    if (username.length < 2 || username.length > 32) {
      return NextResponse.json({ error: "用户名长度需在 2-32 个字符之间" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "密码长度不能少于 6 个字符" }, { status: 400 });
    }

    const db = getDb();

    // Check if user exists
    const existing = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(username);
    if (existing) {
      return NextResponse.json({ error: "该用户名已被注册" }, { status: 400 });
    }

    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO users (username, pass_hash, salt, role, created_at, prompts_seeded)
      VALUES (?, ?, ?, 'user', ?, 1)
    `);
    const info = insertStmt.run(username, hash, salt, now);
    const userId = Number(info.lastInsertRowid);

    // Seed default models for user
    seedUserDefaultModels(db, userId);

    // Clone admin prompts if available
    const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1").get() as { id: number } | undefined;
    if (adminUser) {
      const adminPrompts = db.prepare("SELECT prompt_id, module, name, content, language FROM user_prompts WHERE user_id = ?").all(adminUser.id) as Array<{
        prompt_id: string;
        module: string;
        name: string;
        content: string;
        language: string;
      }>;
      const copyPrompt = db.prepare(`
        INSERT OR IGNORE INTO user_prompts (user_id, prompt_id, module, name, content, language)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const p of adminPrompts) {
        copyPrompt.run(userId, p.prompt_id, p.module, p.name, p.content, p.language);
      }
    }

    const token = createSession(userId);
    const isSecure = process.env.GS_COOKIE_SECURE === "1";

    const res = NextResponse.json({
      success: true,
      user: { id: userId, username, role: "user", created_at: now },
    });

    res.cookies.set(COOKIE_NAME, token, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: isSecure,
      maxAge: SESSION_TTL_SECONDS,
    });

    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
