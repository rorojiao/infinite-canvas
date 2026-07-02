import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const { id } = await params;
    const orderCount = (db.prepare("SELECT COUNT(*) as count FROM orders WHERE plan_id = ?").get(id) as { count: number }).count;
    if (orderCount > 0) {
        db.prepare("UPDATE subscription_plans SET for_sale = 0, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
        return NextResponse.json({ ok: true, softDeleted: true });
    }
    db.prepare("DELETE FROM subscription_plans WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
}
