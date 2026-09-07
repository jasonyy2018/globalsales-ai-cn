import { NextResponse } from "next/server";
import { getCurrentUserFromCookie } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUserFromCookie();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      created_at: user.created_at,
    },
  });
}
