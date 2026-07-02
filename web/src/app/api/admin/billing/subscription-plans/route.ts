import { type NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAllSubscriptionPlans } from "@/lib/billing/plans";

export const runtime = "nodejs";

export async function GET() {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    return NextResponse.json({ plans: getAllSubscriptionPlans() });
}

export async function POST(req: NextRequest) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const body = await req.json();
    const { name, description, price, originalPrice, quotaPerPeriod, validityDays, validityUnit, features, sortOrder, forSale } = body;
    if (!name || price === undefined || quotaPerPeriod === undefined || validityDays === undefined) {
        return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }
    const id = body.id || nanoid();
    const now = new Date().toISOString();
    db.prepare(
        `INSERT INTO subscription_plans (id, name, description, price, original_price, quota_per_period, validity_days, validity_unit, features, sort_order, for_sale, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, price=excluded.price,
           original_price=excluded.original_price, quota_per_period=excluded.quota_per_period, validity_days=excluded.validity_days,
           validity_unit=excluded.validity_unit, features=excluded.features, sort_order=excluded.sort_order,
           for_sale=excluded.for_sale, updated_at=excluded.updated_at`,
    ).run(
        id, name, description || "", price, originalPrice ?? null, quotaPerPeriod, validityDays,
        validityUnit || "day", JSON.stringify(features || []), sortOrder || 0, forSale !== false ? 1 : 0, now, now,
    );
    return NextResponse.json({ ok: true, id });
}
