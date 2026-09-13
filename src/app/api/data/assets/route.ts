import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { USER_DIR } from "@/lib/data_paths";
import fs from "fs";
import path from "path";
import type { Asset } from "@/types";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind");

    const db = getDb();
    let rows: Asset[];
    if (kind && kind !== "all") {
      rows = db.prepare(`
        SELECT id, user_id, kind, title, content, url, file_path, platform, model, created_at
        FROM assets
        WHERE user_id = ? AND kind = ?
        ORDER BY id DESC
      `).all(user.id, kind) as Asset[];
    } else {
      rows = db.prepare(`
        SELECT id, user_id, kind, title, content, url, file_path, platform, model, created_at
        FROM assets
        WHERE user_id = ?
        ORDER BY id DESC
      `).all(user.id) as Asset[];
    }

    return NextResponse.json({ assets: rows });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { kind, title, content, url, file_path, platform, model } = body;

    if (!kind) {
      return NextResponse.json({ error: "Missing asset kind" }, { status: 400 });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO assets (user_id, kind, title, content, url, file_path, platform, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user.id, kind, title || "", content || "", url || "", file_path || "", platform || "", model || "", now);

    return NextResponse.json({ success: true, id: Number(info.lastInsertRowid) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing asset id" }, { status: 400 });
    }

    const db = getDb();
    const row = db.prepare("SELECT id, file_path FROM assets WHERE id = ? AND user_id = ?").get(Number(id), user.id) as {
      id: number;
      file_path: string;
    } | undefined;

    if (row && row.file_path) {
      // Safe unlink
      try {
        const fullPath = path.resolve(row.file_path);
        const expectedPrefix = path.resolve(USER_DIR(user.id));
        if (fullPath.startsWith(expectedPrefix) && fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch (e) {
        console.error("Failed to safely unlink media file:", e);
      }
    }

    db.prepare("DELETE FROM assets WHERE id = ? AND user_id = ?").run(Number(id), user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
