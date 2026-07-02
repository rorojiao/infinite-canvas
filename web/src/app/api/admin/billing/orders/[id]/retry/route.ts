import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ORDER_STATUS, AUDIT_ACTION } from "@/lib/billing/constants";
import { logAudit } from "@/lib/billing/order-service";
import { nanoid } from "nanoid";

export const runtime = "nodejs";

/** 管理员重试充值（订单处于 PAID/FAILED 状态时手动触发充值） */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const { id } = await params;

    const order = db.prepare("SELECT id, user_id, status, order_type, package_id, plan_id, amount FROM orders WHERE id = ?").get(id) as
        | { id: string; user_id: string; status: string; order_type: string; package_id: string | null; plan_id: string | null; amount: number }
        | undefined;
    if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

    // 只允许 PAID 或 FAILED 状态的订单重试
    if (order.status !== ORDER_STATUS.PAID && order.status !== ORDER_STATUS.FAILED) {
        return NextResponse.json({ error: "只能对已支付或失败的订单重试充值" }, { status: 400 });
    }

    // CAS: 当前状态 → RECHARGING
    const cas = db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status IN (?, ?)")
        .run(ORDER_STATUS.RECHARGING, new Date().toISOString(), id, ORDER_STATUS.PAID, ORDER_STATUS.FAILED);
    if (cas.changes === 0) return NextResponse.json({ error: "订单状态已变更" }, { status: 409 });

    logAudit(id, AUDIT_ACTION.RECHARGING, "admin retry", `admin:${guard.user!.id}`);

    try {
        if (order.order_type === "subscription" && order.plan_id) {
            // 复用 grantSubscription 逻辑 — 直接内联避免循环依赖
            const plan = db.prepare("SELECT quota_per_period, validity_days FROM subscription_plans WHERE id = ?").get(order.plan_id) as
                | { quota_per_period: number; validity_days: number } | undefined;
            if (!plan) throw new Error("套餐不存在");

            const now = new Date();
            const expires = new Date(now.getTime() + plan.validity_days * 24 * 60 * 60 * 1000);
            const nowIso = now.toISOString();

            const existing = db.prepare(
                "SELECT id, expires_at FROM user_subscriptions WHERE user_id = ? AND plan_id = ? AND status = 'active' ORDER BY expires_at DESC LIMIT 1",
            ).get(order.user_id, order.plan_id) as { id: string; expires_at: string } | undefined;

            if (existing && new Date(existing.expires_at) > now) {
                const newExpiry = new Date(new Date(existing.expires_at).getTime() + plan.validity_days * 24 * 60 * 60 * 1000);
                db.prepare("UPDATE user_subscriptions SET expires_at = ?, updated_at = ? WHERE id = ?").run(newExpiry.toISOString(), nowIso, existing.id);
            } else {
                db.prepare(
                    "INSERT INTO user_subscriptions (id, user_id, plan_id, order_id, starts_at, expires_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)",
                ).run(nanoid(), order.user_id, order.plan_id, id, nowIso, expires.toISOString(), nowIso, nowIso);
            }

            if (plan.quota_per_period > 0) {
                const user = db.prepare("SELECT quota FROM users WHERE id = ?").get(order.user_id) as { quota: number };
                if (user.quota !== -1) {
                    db.prepare("UPDATE users SET quota = quota + ? WHERE id = ?").run(plan.quota_per_period, order.user_id);
                }
            }
        } else {
            // quota 订单
            const pkg = order.package_id
                ? db.prepare("SELECT quota, bonus_quota FROM quota_packages WHERE id = ?").get(order.package_id) as
                    | { quota: number; bonus_quota: number } | undefined
                : undefined;
            const quotaAmount = pkg ? pkg.quota + pkg.bonus_quota : 0;
            if (quotaAmount > 0) {
                const user = db.prepare("SELECT quota FROM users WHERE id = ?").get(order.user_id) as { quota: number };
                if (user.quota !== -1) {
                    db.prepare("UPDATE users SET quota = quota + ?, total_recharged = total_recharged + ? WHERE id = ?")
                        .run(quotaAmount, quotaAmount, order.user_id);
                }
            }
        }

        const now = new Date().toISOString();
        db.prepare("UPDATE orders SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?")
            .run(ORDER_STATUS.COMPLETED, now, now, id);
        logAudit(id, AUDIT_ACTION.COMPLETED, "admin retry success", `admin:${guard.user!.id}`);
        return NextResponse.json({ ok: true });
    } catch (e) {
        const now = new Date().toISOString();
        db.prepare("UPDATE orders SET status = ?, failed_at = ?, failed_reason = ?, updated_at = ? WHERE id = ?")
            .run(ORDER_STATUS.FAILED, now, (e as Error).message, now, id);
        logAudit(id, AUDIT_ACTION.FAILED, `admin retry failed: ${(e as Error).message}`, `admin:${guard.user!.id}`);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
