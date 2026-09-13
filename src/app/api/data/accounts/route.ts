import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireAuth();
    const db = getDb();
    const rows = db
      .prepare("SELECT id, data, created_at FROM user_accounts WHERE user_id = ? ORDER BY id DESC")
      .all(user.id) as Array<{
      id: number;
      data: string;
      created_at: string;
    }>;

    const accounts: unknown[] = [];
    for (const r of rows) {
      try {
        const obj = JSON.parse(r.data);
        obj._row = r.id;
        accounts.push(obj);
      } catch {
        accounts.push({ _row: r.id, id: r.id });
      }
    }

    return NextResponse.json({ success: true, accounts });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const accounts = Array.isArray(body) ? body : body.accounts;

    if (!Array.isArray(accounts)) {
      return NextResponse.json({ success: false, error: "accounts must be array" }, { status: 400 });
    }

    const db = getDb();
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO user_accounts (user_id, data, created_at)
      VALUES (?, ?, ?)
    `);

    const saveAll = db.transaction((list: unknown[]) => {
      db.prepare("DELETE FROM user_accounts WHERE user_id = ?").run(user.id);
      for (const a of list) {
        if (!a) continue;
        insertStmt.run(user.id, JSON.stringify(a), now);
      }
    });

    saveAll(accounts);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing account ID" }, { status: 400 });
    }

    const db = getDb();
    db.prepare("DELETE FROM user_accounts WHERE id = ? AND user_id = ?").run(Number(id), user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
