import { type NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAllQuotaPackages } from "@/lib/billing/plans";

export const runtime = "nodejs";

export async function GET() {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    return NextResponse.json({ packages: getAllQuotaPackages() });
}

export async function POST(req: NextRequest) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const body = await req.json();
    const { name, description, price, originalPrice, quota, bonusQuota, sortOrder, forSale } = body;
    if (!name || price === undefined || quota === undefined) {
        return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }
    const id = body.id || nanoid();
    const now = new Date().toISOString();
    db.prepare(
        `INSERT INTO quota_packages (id, name, description, price, original_price, quota, bonus_quota, sort_order, for_sale, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, price=excluded.price,
           original_price=excluded.original_price, quota=excluded.quota, bonus_quota=excluded.bonus_quota,
           sort_order=excluded.sort_order, for_sale=excluded.for_sale, updated_at=excluded.updated_at`,
    ).run(
        id, name, description || "", price, originalPrice ?? null, quota, bonusQuota || 0,
        sortOrder || 0, forSale !== false ? 1 : 0, now, now,
    );
    return NextResponse.json({ ok: true, id });
}
