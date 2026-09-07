import fs from "fs";
import path from "path";

export async function GET(request: Request) {
  const filePath = path.join(process.cwd(), "public", "demo.mp4");
  if (!fs.existsSync(filePath)) {
    return new Response("Demo video not found", { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = request.headers.get("range");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunk
    let end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + CHUNK_SIZE - 1, fileSize - 1);
    if (end >= fileSize) end = fileSize - 1;

    const chunksize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
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
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const stream = fs.createReadStream(filePath);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(chunk));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
  });

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Length": String(fileSize),
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
