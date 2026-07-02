import { type NextRequest, NextResponse } from "next/server";
import { expirePendingOrders, expireSubscriptions } from "@/lib/billing/order-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 定时任务端点（需 CRON_SECRET 校验） */
export async function POST(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const expiredOrders = expirePendingOrders();
    const expiredSubs = expireSubscriptions();
    return NextResponse.json({ ok: true, expiredOrders, expiredSubs });
}
