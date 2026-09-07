import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    await requireAdmin();
    const db = getDb();
    const row = db.prepare("SELECT data, updated_at FROM ip_stats ORDER BY id DESC LIMIT 1").get() as {
      data: string;
      updated_at: string;
    } | undefined;

    if (!row) {
      return NextResponse.json({ stats: [] });
    }

    try {
      return NextResponse.json({ stats: JSON.parse(row.data), updated_at: row.updated_at });
    } catch {
      return NextResponse.json({ stats: [] });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const { stats } = await request.json();
    const db = getDb();
    const now = new Date().toISOString();
    const dataStr = JSON.stringify(stats || []);

    db.prepare(`
      INSERT INTO ip_stats (data, updated_at)
      VALUES (?, ?)
    `).run(dataStr, now);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}
