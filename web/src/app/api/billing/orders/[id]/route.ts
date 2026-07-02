import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrderById, getOrderAuditLogs } from "@/lib/billing/order-service";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const { id } = await params;
    const order = getOrderById(id);
    if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    if (order.user_id !== session.id && !session.isAdmin) {
        return NextResponse.json({ error: "无权查看" }, { status: 403 });
    }
    const auditLogs = getOrderAuditLogs(id);
    return NextResponse.json({ order, auditLogs });
}
