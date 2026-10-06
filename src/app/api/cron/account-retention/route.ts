import { NextRequest, NextResponse } from "next/server";
import { runAccountRetention } from "@/lib/account-retention";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!process.env.DATABASE_URL) return new Response("Database unavailable", { status: 503 });
  try {
    const result = await runAccountRetention();
    return NextResponse.json(result, { status: result.failures ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Entretien des comptes impossible :", error);
    return NextResponse.json({ error: "Entretien des comptes impossible." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
