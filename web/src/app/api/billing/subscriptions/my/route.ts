import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const subs = db.prepare(
        `SELECT us.*, sp.name as plan_name, sp.quota_per_period, sp.validity_days
         FROM user_subscriptions us
         JOIN subscription_plans sp ON us.plan_id = sp.id
         WHERE us.user_id = ? ORDER BY us.created_at DESC`,
    ).all(session.id);
    return NextResponse.json({ subscriptions: subs });
}
