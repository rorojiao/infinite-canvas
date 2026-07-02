import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { cancelOrder, OrderError } from "@/lib/billing/order-service";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const { id } = await params;
    try {
        cancelOrder(session, id);
        return NextResponse.json({ ok: true });
    } catch (e) {
        if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
        return NextResponse.json({ error: "取消订单失败" }, { status: 500 });
    }
}
