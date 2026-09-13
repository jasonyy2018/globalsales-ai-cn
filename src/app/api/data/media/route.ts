import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { USER_DIR } from "@/lib/data_paths";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { url, kind = "images" } = await request.json();

    if (!url || !url.startsWith("http")) {
      return NextResponse.json({ error: "Invalid media URL" }, { status: 400 });
    }

    const subDir = kind === "videos" || kind === "video" ? "videos" : "images";
    const userDir = path.join(USER_DIR(user.id), subDir);
    fs.mkdirSync(userDir, { recursive: true });

    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `Failed to download remote media: ${res.status}` }, { status: 502 });
    }

    const contentType = res.headers.get("Content-Type") || "";
    let ext = subDir === "videos" ? "mp4" : "png";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
    else if (contentType.includes("webp")) ext = "webp";
    else if (contentType.includes("mp4")) ext = "mp4";

    const buffer = Buffer.from(await res.arrayBuffer());
    const filename = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
    const filePath = path.join(userDir, filename);
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/api/data/media/${filename}`;
    return NextResponse.json({ success: true, url: publicUrl, file_path: filePath });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
