import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyPassword, createSession, COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/auth";
import type { User, UserRole } from "@/types";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });
    }

    const db = getDb();
    const userRow = db.prepare(`
      SELECT id, username, pass_hash, salt, role, created_at, prompts_seeded
      FROM users
      WHERE username = ? COLLATE NOCASE
    `).get(username) as (User & { pass_hash: string; salt: string }) | undefined;

    if (!userRow || !verifyPassword(password, userRow.salt, userRow.pass_hash)) {
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
