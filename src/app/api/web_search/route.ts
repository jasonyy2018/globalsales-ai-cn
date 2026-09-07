import { NextResponse } from "next/server";
import { searchWeb } from "@/lib/scraper";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const count = parseInt(searchParams.get("count") || "10", 10);

  if (!q) {
    return NextResponse.json({ results: [], error: "empty query" }, { status: 400 });
  }

  try {
    const results = await searchWeb(q, count);
    return NextResponse.json({ results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ results: [], error: msg }, { status: 500 });
  }
}
