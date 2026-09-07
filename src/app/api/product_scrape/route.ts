import { NextResponse } from "next/server";
import { scrapeProduct } from "@/lib/scraper";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url") || "";

  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ success: false, error: "Invalid product URL" }, { status: 400 });
  }

  try {
    const result = await scrapeProduct(url);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
