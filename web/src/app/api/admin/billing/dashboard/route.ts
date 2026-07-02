import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDashboardStats } from "@/lib/billing/dashboard";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") || "30")));
    return NextResponse.json(getDashboardStats(days));
}
