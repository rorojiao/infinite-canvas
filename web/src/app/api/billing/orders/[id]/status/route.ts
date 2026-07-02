import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 轮询订单状态（支付完成后前端实时刷新） */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const { id } = await params;
    const row = db.prepare("SELECT status, amount, completed_at FROM orders WHERE id = ? AND user_id = ?").get(id, session.id) as
        | { status: string; amount: number; completed_at: string | null } | undefined;
    if (!row) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

    // 如果订单完成，顺便返回最新额度
    let quota = null;
    let usedQuota = null;
    if (row.status === "COMPLETED") {
        const u = db.prepare("SELECT quota, used_quota FROM users WHERE id = ?").get(session.id) as { quota: number; used_quota: number };
        quota = u.quota;
        usedQuota = u.used_quota;
    }
    return NextResponse.json({ status: row.status, quota, usedQuota });
}
