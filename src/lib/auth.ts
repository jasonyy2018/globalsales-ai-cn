import crypto from "crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import type { User, UserRole } from "@/types";

export const COOKIE_NAME = "gs_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const PBKDF2_ITER = 200000;

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const userSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(
    password,
    Buffer.from(userSalt, "utf-8"),
    PBKDF2_ITER,
    32,
    "sha256"
  ).toString("hex");
  return { hash, salt: userSalt };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const calculated = crypto.pbkdf2Sync(
    password,
    Buffer.from(salt, "utf-8"),
    PBKDF2_ITER,
    32,
    "sha256"
  ).toString("hex");

  const calcBuf = Buffer.from(calculated, "hex");
  const expBuf = Buffer.from(expectedHash, "hex");
  if (calcBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(calcBuf, expBuf);
}

export function createSession(userId: number): string {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

  const stmt = db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(token, userId, now.toISOString(), expires.toISOString());

  return token;
}

export function deleteSession(token: string) {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export async function getCurrentUserFromCookie(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const db = getDb();
  const row = db.prepare(`
    SELECT u.id, u.username, u.role, u.created_at, u.prompts_seeded, s.expires_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `).get(token) as (User & { expires_at: string }) | undefined;

  if (!row) return null;

  // Check expiration
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(token);
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    role: row.role as UserRole,
    created_at: row.created_at,
    prompts_seeded: row.prompts_seeded,
  };
}

export async function requireAuth(): Promise<User> {
  const user = await getCurrentUserFromCookie();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireAuth();
  if (user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return user;
}
