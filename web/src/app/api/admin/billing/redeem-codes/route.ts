import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateRedeemCodesBatch, listRedeemCodes, RedeemError } from "@/lib/billing/redeem-service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const status = req.nextUrl.searchParams.get("status") || undefined;
    return NextResponse.json({ codes: listRedeemCodes(status, 200) });
}

export async function POST(req: NextRequest) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const body = await req.json();
    try {
        const codes = generateRedeemCodesBatch(
            Number(body.count) || 1,
            body.type || "quota",
            Number(body.value) || 0,
            body.planId || null,
            body.expiresInDays ? Number(body.expiresInDays) : null,
            body.notes,
        );
        return NextResponse.json({ codes });
    } catch (e) {
        if (e instanceof RedeemError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
        return NextResponse.json({ error: "生成失败" }, { status: 500 });
    }
}
