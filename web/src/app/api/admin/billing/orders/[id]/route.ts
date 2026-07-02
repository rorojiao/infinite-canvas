import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getOrderById, getOrderAuditLogs } from "@/lib/billing/order-service";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const { id } = await params;
    const order = getOrderById(id);
    if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    const auditLogs = getOrderAuditLogs(id);
    return NextResponse.json({ order, auditLogs });
}
