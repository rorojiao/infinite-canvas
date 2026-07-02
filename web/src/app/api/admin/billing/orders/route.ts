import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });

    const url = req.nextUrl;
    const status = url.searchParams.get("status");
    const paymentType = url.searchParams.get("paymentType");
    const rawLimit = Number(url.searchParams.get("limit") || "50");
    const limit = Math.min(200, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));

    let sql = "SELECT * FROM orders WHERE 1=1";
    const params: (string | number)[] = [];
    if (status) { sql += " AND status = ?"; params.push(status); }
    if (paymentType) { sql += " AND payment_type = ?"; params.push(paymentType); }
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const orders = db.prepare(sql).all(...params);
    return NextResponse.json({ orders });
}
