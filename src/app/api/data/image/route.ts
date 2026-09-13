import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { USER_DIR } from "@/lib/data_paths";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { image_base64, format = "png" } = await request.json();

    if (!image_base64) {
      return NextResponse.json({ error: "No image data" }, { status: 400 });
    }

    // Strip data URI header if present
    const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const userDir = path.join(USER_DIR(user.id), "images");
    fs.mkdirSync(userDir, { recursive: true });

    const filename = `${crypto.randomBytes(12).toString("hex")}.${format}`;
    const filePath = path.join(userDir, filename);
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/api/data/media/${filename}`;
    return NextResponse.json({ success: true, url: publicUrl, file_path: filePath });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
