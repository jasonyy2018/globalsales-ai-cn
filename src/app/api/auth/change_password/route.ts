import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth, verifyPassword, hashPassword } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const oldPassword = body.old_password || body.oldPassword;
    const newPassword = body.new_password || body.newPassword;

    if (!oldPassword || !newPassword) {
      return NextResponse.json({ success: false, error: "旧密码和新密码不能为空" }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, error: "新密码长度不能少于 6 个字符" }, { status: 400 });
    }

    const db = getDb();
    const row = db.prepare("SELECT pass_hash, salt FROM users WHERE id = ?").get(user.id) as {
      pass_hash: string;
      salt: string;
    };

    if (!verifyPassword(oldPassword, row.salt, row.pass_hash)) {
      return NextResponse.json({ success: false, error: "旧密码错误" }, { status: 400 });
    }

    const { hash, salt } = hashPassword(newPassword);
    db.prepare("UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?").run(hash, salt, user.id);

    return NextResponse.json({ success: true, message: "密码修改成功" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }
}
