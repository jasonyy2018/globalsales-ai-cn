import { NextResponse } from "next/server";
import { USERS_DIR } from "@/lib/data_paths";
import fs from "fs";
import path from "path";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) {
    return new Response("Invalid media ID", { status: 400 });
  }

  // Look for the file in DATA_DIR/users/*/{images,videos}/<id>
  const usersDir = USERS_DIR;
  let targetPath = "";

  if (fs.existsSync(usersDir)) {
    const userFolders = fs.readdirSync(usersDir);
    for (const u of userFolders) {
      const imgPath = path.join(usersDir, u, "images", id);
      const vidPath = path.join(usersDir, u, "videos", id);
      if (fs.existsSync(imgPath)) {
        targetPath = imgPath;
        break;
      }
      if (fs.existsSync(vidPath)) {
        targetPath = vidPath;
        break;
      }
    }
  }

  if (!targetPath || !fs.existsSync(targetPath)) {
    return new Response("Media not found", { status: 404 });
  }

  const stat = fs.statSync(targetPath);
  const fileSize = stat.size;
  const ext = path.extname(targetPath).toLowerCase();

  let contentType = "application/octet-stream";
  if (ext === ".png") contentType = "image/png";
  else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
  else if (ext === ".webp") contentType = "image/webp";
  else if (ext === ".mp4") contentType = "video/mp4";

  const range = request.headers.get("range");

  if (range && contentType.startsWith("video")) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;

    const stream = fs.createReadStream(targetPath, { start, end });
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
    });

    return new Response(webStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunksize),
        "Content-Type": contentType,
      },
    });
  }

  const fileBuffer = fs.readFileSync(targetPath);
  return new Response(fileBuffer, {
    status: 200,
    headers: {
      "Content-Length": String(fileSize),
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
