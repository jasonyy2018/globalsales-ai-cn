import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireAuth();
    const db = getDb();
    const rows = db.prepare(`
      SELECT prompt_id as id, module, name, content, language
      FROM user_prompts
      WHERE user_id = ?
      ORDER BY id ASC
    `).all(user.id);

    return NextResponse.json({ success: true, prompts: rows });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const prompts = Array.isArray(body) ? body : body.prompts;
    if (!Array.isArray(prompts)) {
      return NextResponse.json({ error: "Invalid prompts format" }, { status: 400 });
    }

    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO user_prompts (user_id, prompt_id, module, name, content, language)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, prompt_id) DO UPDATE SET
        module = excluded.module,
        name = excluded.name,
        content = excluded.content,
        language = excluded.language
    `);

    const updateTx = db.transaction((list) => {
      for (const p of list) {
        stmt.run(user.id, p.id || p.prompt_id, p.module || "", p.name || "", p.content || "", p.language || "zh");
      }
    });

    updateTx(prompts);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
