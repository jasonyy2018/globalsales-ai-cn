import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, deleteSession } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    deleteSession(token);
  }

  const res = NextResponse.json({ success: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
