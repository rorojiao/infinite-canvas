import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const { id } = await params;
    // 如果有关联订单，只做下架（防止回调时找不到套餐导致额度无法发放）
    const orderCount = (db.prepare("SELECT COUNT(*) as count FROM orders WHERE package_id = ?").get(id) as { count: number }).count;
    if (orderCount > 0) {
        db.prepare("UPDATE quota_packages SET for_sale = 0, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
        return NextResponse.json({ ok: true, softDeleted: true });
    }
    db.prepare("DELETE FROM quota_packages WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
}
