import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { resetPaymentProviders } from "@/lib/payment/init";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const { id } = await params;
    db.prepare("DELETE FROM payment_provider_instances WHERE id = ?").run(id);
    resetPaymentProviders();
    return NextResponse.json({ ok: true });
}
