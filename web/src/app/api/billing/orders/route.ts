import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createOrder, OrderError } from "@/lib/billing/order-service";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const body = await req.json();
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
    const userAgent = req.headers.get("user-agent") || "";
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);

    // 输入校验：只允许 quota 或 subscription
    const orderType = body.orderType === "subscription" ? "subscription" : "quota";

    try {
        const result = await createOrder(session, {
            paymentType: String(body.paymentType || ""),
            orderType,
            packageId: body.packageId,
            planId: body.planId,
            clientIp,
            isMobile,
        });
        return NextResponse.json(result);
    } catch (e) {
        if (e instanceof OrderError) {
            return NextResponse.json({ error: e.message }, { status: e.statusCode });
        }
        console.error("[Billing] Create order error:", e);
        return NextResponse.json({ error: "创建订单失败" }, { status: 500 });
    }
}
