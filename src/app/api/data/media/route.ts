import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { USER_DIR } from "@/lib/data_paths";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const data = await request.json();
    const mediaUrl = String(data.url || data.sourceUrl || "").trim();

    if (!mediaUrl || !mediaUrl.startsWith("http")) {
      return NextResponse.json({ error: "Invalid media URL" }, { status: 400 });
    }

    const rawKind = String(data.kind || "images").toLowerCase();
    const isVideo = rawKind.includes("video");
    const subDir = isVideo ? "videos" : "images";
    const userDir = path.join(USER_DIR(user.id), subDir);
    fs.mkdirSync(userDir, { recursive: true });

    const res = await fetch(mediaUrl);
    if (!res.ok) {
      return NextResponse.json({ error: `Failed to download remote media: ${res.status}` }, { status: 502 });
    }

    const contentType = res.headers.get("Content-Type") || "";
    let ext = isVideo ? "mp4" : "png";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
    else if (contentType.includes("webp")) ext = "webp";
    else if (contentType.includes("mp4")) ext = "mp4";

    const buffer = Buffer.from(await res.arrayBuffer());
    const filename = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
    const filePath = path.join(userDir, filename);
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/api/data/media/${filename}`;

    let assetId = 0;
    try {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO assets (user_id, kind, title, platform, model, url, file_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const r = stmt.run(
        user.id,
        isVideo ? "video" : "image",
        data.title || filename,
        data.platform || "",
        data.model || "",
        publicUrl,
        filePath,
        new Date().toISOString()
      );
      assetId = Number(r.lastInsertRowid);
    } catch (e) {
      console.warn("[POST /api/data/media] failed to insert asset row:", e);
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      file_path: filePath,
      id: assetId || filename,
      bytes: buffer.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
