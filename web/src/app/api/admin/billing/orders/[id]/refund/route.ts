import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { processRefund, RefundError } from "@/lib/billing/refund-service";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const { id } = await params;
    const { reason } = await req.json();
    try {
        const result = await processRefund(id, String(reason || "管理员退款"), `admin:${guard.user!.id}`);
        if (!result.success) return NextResponse.json({ error: result.warning || "退款失败" }, { status: 500 });
        return NextResponse.json({ ok: true });
    } catch (e) {
        if (e instanceof RefundError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
        console.error("[Billing] Refund error:", e);
        return NextResponse.json({ error: "退款失败" }, { status: 500 });
    }
}
