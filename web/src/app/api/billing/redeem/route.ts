import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { redeemCode, RedeemError } from "@/lib/billing/redeem-service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const { code } = await req.json();
    try {
        const result = redeemCode(session.id, String(code || ""));
        return NextResponse.json({ ok: true, ...result });
    } catch (e) {
        if (e instanceof RedeemError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
        return NextResponse.json({ error: "兑换失败" }, { status: 500 });
    }
}
