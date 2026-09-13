import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireAuth();
    const db = getDb();
    const rows = db.prepare("SELECT module_key, model_id FROM user_module_defaults WHERE user_id = ?").all(user.id) as Array<{
      module_key: string;
      model_id: string;
    }>;

    const defaults: Record<string, string> = {};
    for (const r of rows) {
      defaults[r.module_key] = r.model_id;
    }

    return NextResponse.json({ success: true, defaults });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { module_key, model_id } = await request.json();
    if (!module_key || !model_id) {
      return NextResponse.json({ error: "Missing module_key or model_id" }, { status: 400 });
    }

    const db = getDb();
    db.prepare(`
      INSERT INTO user_module_defaults (user_id, module_key, model_id)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, module_key) DO UPDATE SET model_id = excluded.model_id
    `).run(user.id, module_key, model_id);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
