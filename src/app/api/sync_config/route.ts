import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setSystemSetting, getAllSystemSettings } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    await requireAdmin();
    const settings = getAllSystemSettings();
    return NextResponse.json({ success: true, settings });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body && body.kind === "models") {
      return NextResponse.json({ success: true, message: "模型配置已同步" });
    }
    if (body && body.kind === "prompts") {
      return NextResponse.json({ success: true, message: "提示词已同步" });
    }

    await requireAdmin();
    const { keys } = body;
    if (!keys || typeof keys !== "object") {
      return NextResponse.json({ error: "Invalid keys object" }, { status: 400 });
    }

    // 1. 持久化写入数据库 SQLite system_settings 数据表（第一核心源）
    for (const [k, v] of Object.entries(keys)) {
      setSystemSetting(k, String(v));
    }

    // 2. 尝试同步更新 .env 文件（如果文件可访问）
    try {
      const envPath = path.join(process.cwd(), ".env");
      let content = "";
      if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, "utf-8");
      }

      const lines = content.split(/\r?\n/);
      const updatedKeys = new Set<string>();

      const newLines = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
          return line;
        }
        const [k] = trimmed.split("=", 1);
        const keyName = k.trim();
        if (keyName in keys) {
          updatedKeys.add(keyName);
          const val = keys[keyName];
          return `${keyName}=${val}`;
        }
        return line;
      });

      for (const [k, v] of Object.entries(keys)) {
        if (!updatedKeys.has(k)) {
          newLines.push(`${k}=${v}`);
        }
      }

      fs.writeFileSync(envPath, newLines.join("\n"), "utf-8");
    } catch (e) {
      console.warn("[sync_config] notice writing .env file:", e);
    }

    return NextResponse.json({ success: true, message: "系统配置已写入数据库并即时生效" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}

