import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { initPaymentProviders, paymentRegistry } from "@/lib/payment/init";
import { getMethodDailyLimit, getMethodSingleLimit } from "@/lib/billing/limits";
import { getMethodFeeRate } from "@/lib/billing/fee";

export const runtime = "nodejs";

/** 获取各支付渠道今日限额使用情况 */
export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

    initPaymentProviders();
    const allProviders = paymentRegistry.getAllProviders();
    const paymentTypes = new Set<string>();
    for (const p of allProviders) {
        for (const t of p.supportedTypes) paymentTypes.add(t);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const methods: Record<string, { dailyLimit: number; used: number; remaining: number | null; available: boolean; singleMax: number; feeRate: number }> = {};
    for (const type of paymentTypes) {
        const dailyLimit = getMethodDailyLimit(type);
        const singleMax = getMethodSingleLimit(type);
        const feeRate = getMethodFeeRate(type);

        const row = db.prepare(
            `SELECT COALESCE(SUM(amount), 0) as total FROM orders
             WHERE payment_type = ? AND status IN ('PAID','RECHARGING','COMPLETED','REFUNDING','REFUNDED','REFUND_FAILED')
             AND paid_at >= ?`,
        ).get(type, todayStart.toISOString()) as { total: number };
        const used = row.total || 0;
        methods[type] = {
            dailyLimit,
            used,
            remaining: dailyLimit > 0 ? Math.max(0, dailyLimit - used) : null,
            available: dailyLimit === 0 || used < dailyLimit,
            singleMax,
            feeRate,
        };
    }

    return NextResponse.json({ methods });
}
