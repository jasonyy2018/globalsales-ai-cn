import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";

export async function GET() {
  try {
    await requireAdmin();
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, username, role, created_at
      FROM users
      ORDER BY id ASC
    `).all();

    return NextResponse.json({ users: rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const { action, userId, newPassword, newRole } = await request.json();
    const db = getDb();

    if (action === "reset_password") {
      if (!userId || !newPassword) {
        return NextResponse.json({ error: "Missing userId or newPassword" }, { status: 400 });
      }
      const { hash, salt } = hashPassword(newPassword);
      db.prepare("UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?").run(hash, salt, userId);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
      return NextResponse.json({ success: true, message: "密码重置成功" });
    }

    if (action === "change_role") {
      if (!userId || !newRole) {
        return NextResponse.json({ error: "Missing userId or newRole" }, { status: 400 });
      }
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(newRole, userId);
      return NextResponse.json({ success: true, message: "角色更新成功" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}

export async function DELETE(request: Request) {
  try {
    const currentAdmin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    }
    const targetId = Number(id);
    if (targetId === currentAdmin.id) {
      return NextResponse.json({ error: "不能删除当前登录的管理员账号" }, { status: 400 });
    }

    const db = getDb();
    const targetUser = db.prepare("SELECT role FROM users WHERE id = ?").get(targetId) as { role: string } | undefined;
    if (targetUser?.role === "admin") {
      return NextResponse.json({ error: "安全保护：不允许删除其他管理员账号" }, { status: 403 });
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}
