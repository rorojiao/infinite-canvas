import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";

export const runtime = "nodejs";

export async function GET() {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const codes = db.prepare("SELECT * FROM promo_codes ORDER BY created_at DESC").all();
    return NextResponse.json({ codes });
}

export async function POST(req: NextRequest) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const body = await req.json();
    const { code, bonusQuota, maxUses, expiresAt, notes } = body;
    if (!bonusQuota || bonusQuota < 1) return NextResponse.json({ error: "赠送额度必须大于0" }, { status: 400 });

    const codeValue = (code || nanoid(8)).toUpperCase().trim();
    const now = new Date().toISOString();
    const existing = db.prepare("SELECT code FROM promo_codes WHERE code = ?").get(codeValue);
    if (existing) return NextResponse.json({ error: "优惠码已存在" }, { status: 409 });

    db.prepare(
        "INSERT INTO promo_codes (code, bonus_quota, max_uses, used_count, status, expires_at, notes, created_at, updated_at) VALUES (?, ?, ?, 0, 'active', ?, ?, ?, ?)",
    ).run(codeValue, bonusQuota, maxUses || 0, expiresAt || null, notes || null, now, now);
    return NextResponse.json({ ok: true, code: codeValue });
}
