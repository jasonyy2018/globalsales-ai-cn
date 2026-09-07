import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUserFromCookie } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUserFromCookie();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ success: true, stats: [] });
    }

    const db = getDb();
    const row = db.prepare("SELECT data, updated_at FROM ip_stats ORDER BY id DESC LIMIT 1").get() as {
      data: string;
      updated_at: string;
    } | undefined;

    if (!row) {
      return NextResponse.json({ success: true, stats: [] });
    }

    try {
      const parsed = JSON.parse(row.data);
      return NextResponse.json({ success: true, stats: Array.isArray(parsed) ? parsed : [], updated_at: row.updated_at });
    } catch {
      return NextResponse.json({ success: true, stats: [] });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const stats = body.stats || body;
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
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
