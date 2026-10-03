import { NextRequest, NextResponse } from "next/server";
import { revokeSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { jsonError, requestIsSameOrigin } from "@/lib/request";

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("Requête refusée.", 403);
  await revokeSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
