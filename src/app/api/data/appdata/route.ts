import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireAuth();
    const db = getDb();
    const row = db.prepare("SELECT data FROM user_appdata WHERE user_id = ?").get(user.id) as { data: string } | undefined;
    if (!row) {
      return NextResponse.json({ success: true, appdata: null, data: null });
    }
    try {
      const parsed = JSON.parse(row.data);
      return NextResponse.json({ success: true, appdata: parsed, data: parsed });
    } catch {
      return NextResponse.json({ success: true, appdata: row.data, data: row.data });
    }
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const appdata = body && body.appdata !== undefined ? body.appdata : body;
    const db = getDb();
    const now = new Date().toISOString();
    const dataStr = typeof appdata === "string" ? appdata : JSON.stringify(appdata);

    db.prepare(`
      INSERT INTO user_appdata (user_id, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).run(user.id, dataStr, now);

    return NextResponse.json({ success: true, savedAt: now });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
