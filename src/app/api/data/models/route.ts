import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { DEFAULT_MODELS, BUILTIN_MODEL_IDS } from "@/lib/model_defaults";
import type { AIModel } from "@/types";

export async function GET() {
  try {
    const user = await requireAuth();
    const db = getDb();

    // Check if user models have been seeded
    const userRow = db.prepare("SELECT models_seeded, models_deleted FROM users WHERE id = ?").get(user.id) as { models_seeded?: number; models_deleted?: string } | undefined;
    const isSeeded = (userRow?.models_seeded ?? 0) === 1;
    let deletedIds: string[] = [];
    try {
      const parsed = JSON.parse(userRow?.models_deleted || "[]");
      if (Array.isArray(parsed)) deletedIds = parsed.map(String);
    } catch {}

    let rows = db.prepare(`
      SELECT id, model_id, name, provider, base_url as endpoint, protocol, type, model_slug, status, api_key
      FROM user_models
      WHERE user_id = ?
      ORDER BY id ASC
    `).all(user.id) as Array<Record<string, unknown>>;

    if (!isSeeded && rows.length === 0) {
      const insertStmt = db.prepare(`
        INSERT INTO user_models (user_id, model_id, name, provider, base_url, protocol, type, model_slug, status, api_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const seedTx = db.transaction(() => {
        for (const m of DEFAULT_MODELS) {
          if (deletedIds.includes(m.model_id)) continue;
          insertStmt.run(
            user.id,
            m.model_id,
            m.name,
            m.provider,
            m.base_url,
            m.protocol,
            m.type,
            m.model_slug || "",
            m.status,
            m.api_key || ""
          );
        }
        db.prepare("UPDATE users SET models_seeded = 1 WHERE id = ?").run(user.id);
      });
      seedTx();

      rows = db.prepare(`
        SELECT id, model_id, name, provider, base_url as endpoint, protocol, type, model_slug, status, api_key
        FROM user_models
        WHERE user_id = ?
        ORDER BY id ASC
      `).all(user.id) as Array<Record<string, unknown>>;
    }

    // 过滤用户已删除的模型（删除记录与库中行可能短暂不一致，以删除记录为准）
    if (deletedIds.length) {
      rows = rows.filter((r) => !deletedIds.includes(String(r.model_id)));
    }

    const models = rows.map((r) => {
      const isBuiltin = BUILTIN_MODEL_IDS.has(String(r.model_id));
      let baseUrl = String(r.endpoint || "");
      const modelType = (r.type as "text" | "image" | "video") || "text";
      // Normalize image model endpoint if incorrectly saved as /chat/completions
      if (modelType === "image" && baseUrl.includes("/chat/completions")) {
        baseUrl = baseUrl.replace(/\/chat\/completions$/, "/images/generations");
        try {
          db.prepare("UPDATE user_models SET base_url = ? WHERE id = ?").run(baseUrl, r.id);
        } catch {}
      }
      const apiKey = isBuiltin ? "" : String(r.api_key || "");
      const protocol = String(r.protocol || "OpenAI 兼容协议");
      const modelSlug = String(r.model_slug || "");
      return {
        id: String(r.model_id),
        name: String(r.name || r.model_id),
        type: modelType,
        provider: String(r.provider || "自定义"),
        endpoint: baseUrl,
        baseUrl: baseUrl,
        protocol: protocol,
        model: modelSlug,
        model_slug: modelSlug,
        status: (r.status as "active" | "disabled") || "active",
        is_builtin: isBuiltin,
        api_key: apiKey,
        apiKey: apiKey,
      };
    });

    return NextResponse.json({ success: true, models, deletedIds });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const db = getDb();
    const deleteStmt = db.prepare("DELETE FROM user_models WHERE user_id = ?");
    const insertStmt = db.prepare(`
      INSERT INTO user_models (user_id, model_id, name, provider, base_url, protocol, type, model_slug, status, api_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Handle One-click Clear All
    if (body.clearAll) {
      const allIds = Array.isArray(body.deletedIds)
        ? body.deletedIds.map(String)
        : (db.prepare("SELECT model_id FROM user_models WHERE user_id = ?").all(user.id) as Array<{ model_id: string }>).map((r) => r.model_id);
      const clearTx = db.transaction(() => {
        deleteStmt.run(user.id);
        db.prepare("UPDATE users SET models_deleted = ?, models_seeded = 1 WHERE id = ?")
          .run(JSON.stringify(allIds), user.id);
      });
      clearTx();
      return NextResponse.json({ success: true, count: 0, message: "所有模型配置已清空" });
    }

    // Handle Reset Defaults
    if (body.resetDefaults) {
      const resetTx = db.transaction(() => {
        deleteStmt.run(user.id);
        for (const m of DEFAULT_MODELS) {
          insertStmt.run(
            user.id,
            m.model_id,
            m.name,
            m.provider,
            m.base_url,
            m.protocol,
            m.type,
            m.model_slug || "",
            m.status,
            m.api_key || ""
          );
        }
        db.prepare("UPDATE users SET models_deleted = '[]', models_seeded = 1 WHERE id = ?").run(user.id);
      });
      resetTx();
      return NextResponse.json({ success: true, count: DEFAULT_MODELS.length, message: "已重置为默认模型配置" });
    }

    let models = Array.isArray(body) ? body : body.models;
    if (!Array.isArray(models)) {
      return NextResponse.json({ success: false, error: "Invalid models array" }, { status: 400 });
    }

    // 默认模型补全：仅对"从未 seed 过"的用户做一次，把完整默认集灌进去。
    // 一旦用户 seed 过（models_seeded=1），客户端推送的是权威列表，服务端不再自动补全
    // 缺失的默认模型 —— 否则任何一次不带完整 deletedIds 的普通保存（旧版 app.js、iframe、
    // 30 秒自动保存）都会把用户已删的默认模型补回库并清掉 models_deleted，造成"刷新复活"。
    const seededRow = db.prepare("SELECT models_seeded FROM users WHERE id = ?").get(user.id) as { models_seeded?: number } | undefined;
    const isSeeded = (seededRow?.models_seeded ?? 0) === 1;

    if (!isSeeded) {
      const incomingIds = new Set(models.map((m: any) => String(m.id || m.model_id || "")));
      for (const def of DEFAULT_MODELS) {
        if (!incomingIds.has(def.model_id)) {
          models.push({
            id: def.model_id,
            name: def.name,
            provider: def.provider,
            baseUrl: def.base_url,
            protocol: def.protocol,
            type: def.type,
            model: def.model_slug,
            status: def.status,
            apiKey: def.api_key,
          });
        }
      }
    }

    const updateMany = db.transaction((list: any[]) => {
      deleteStmt.run(user.id);
      for (const m of list) {
        const id = String(m.id || m.model_id || "");
        if (!id) continue;
        const isBuiltin = BUILTIN_MODEL_IDS.has(id);
        const apiKeyToStore = isBuiltin ? "" : (m.apiKey || m.api_key || "");
        const baseUrlToStore = String(m.baseUrl || m.endpoint || "");
        const protocolToStore = String(m.protocol || "OpenAI 兼容协议");
        const modelSlugToStore = String(m.model || m.model_slug || "");
        const typeToStore = String(m.type || "text");
        const statusToStore = String(m.status || "active");
        const nameToStore = String(m.name || id);
        const providerToStore = String(m.provider || "自定义");

        insertStmt.run(
          user.id,
          id,
          nameToStore,
          providerToStore,
          baseUrlToStore,
          protocolToStore,
          typeToStore,
          modelSlugToStore,
          statusToStore,
          apiKeyToStore
        );
      }
      db.prepare("UPDATE users SET models_seeded = 1 WHERE id = ?").run(user.id);
    });

    updateMany(models);
    // 删除记录：以客户端明确传来的 deletedIds 为准，并与既有记录做**并集**（union）后写回。
    // 并集是关键 —— 某一次保存若没带完整 deletedIds（旧版 app.js / iframe / 自动保存），
    // 不能把之前记录的删除项清掉，否则下次刷新删除的模型就"复活"。
    // 客户端主动"恢复默认"（resetDefaults）或显式把 deletedIds 传空时才真正清空。
    const clientDeleted: string[] = Array.isArray(body.deletedIds) ? body.deletedIds.map(String) : [];
    let prevDeleted: string[] = [];
    try {
      const row = db.prepare("SELECT models_deleted FROM users WHERE id = ?").get(user.id) as { models_deleted?: string } | undefined;
      const parsed = JSON.parse(row?.models_deleted || "[]");
      if (Array.isArray(parsed)) prevDeleted = parsed.map(String);
    } catch {}
    // 只有当客户端**显式**传了 deletedIds 字段时才视为权威覆盖；
    // 没传（undefined）则保留既有记录，避免陈旧保存清掉删除项。
    const explicit = "deletedIds" in body && Array.isArray(body.deletedIds);
    const currentModelIds = new Set(models.map((m: any) => String(m.id || m.model_id || "")));
    let mergedDeleted = explicit
      ? clientDeleted
      : Array.from(new Set([...prevDeleted, ...clientDeleted]));
    mergedDeleted = mergedDeleted.filter((id) => !currentModelIds.has(id));
    db.prepare("UPDATE users SET models_deleted = ? WHERE id = ?")
      .run(JSON.stringify(mergedDeleted), user.id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

export async function DELETE() {
  try {
    const user = await requireAuth();
    const db = getDb();
    // 清空前记下用户当前的模型 id，写进 models_deleted，让"清空"状态可被后续 GET/保存识别
    const keptIds = (db.prepare("SELECT model_id FROM user_models WHERE user_id = ?").all(user.id) as Array<{ model_id: string }>).map((r) => r.model_id);
    const delTx = db.transaction(() => {
      db.prepare("DELETE FROM user_models WHERE user_id = ?").run(user.id);
      db.prepare("UPDATE users SET models_deleted = ?, models_seeded = 1 WHERE id = ?")
        .run(JSON.stringify(keptIds), user.id);
    });
    delTx();
    return NextResponse.json({ success: true, count: 0, message: "所有模型配置已清空" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
