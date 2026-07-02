import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserOrders } from "@/lib/billing/order-service";

export const runtime = "nodejs";

export async function GET(req: Request) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const orders = getUserOrders(session.id, status);
    return NextResponse.json({ orders });
}
