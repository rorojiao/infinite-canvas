import { db } from "@/lib/db";
import { UNLIMITED_QUOTA } from "@/lib/quota";
import { ORDER_STATUS, AUDIT_ACTION } from "./constants";
import { logAudit } from "./order-service";
import { initPaymentProviders, paymentRegistry, getProviderByInstanceId } from "@/lib/payment/init";
import type { PaymentProvider } from "@/lib/payment/types";

export class RefundError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = "RefundError";
        this.statusCode = statusCode;
    }
}

type OrderRow = {
    id: string; user_id: string; amount: number; pay_amount: number | null;
    status: string; order_type: string; plan_id: string | null; payment_trade_no: string | null;
    payment_type: string; provider_instance_id: string | null; package_id: string | null;
};

/** 计算退款时可扣减的额度 */
function calculateDeductible(order: OrderRow): { type: "quota" | "subscription"; quotaAmount: number; subDays: number } {
    if (order.order_type === "subscription" && order.plan_id) {
        const sub = db.prepare(
            "SELECT id, expires_at FROM user_subscriptions WHERE user_id = ? AND plan_id = ? AND status = 'active' ORDER BY expires_at DESC LIMIT 1",
        ).get(order.user_id, order.plan_id) as { id: string; expires_at: string } | undefined;
        if (!sub) return { type: "subscription", quotaAmount: 0, subDays: 0 };
        const remainingDays = Math.max(0, Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        const plan = db.prepare("SELECT validity_days FROM subscription_plans WHERE id = ?").get(order.plan_id) as { validity_days: number } | undefined;
        const days = Math.min(remainingDays, plan?.validity_days || 0);
        return { type: "subscription", quotaAmount: 0, subDays: days };
    }
    // quota 订单：扣减用户当前余额（最多扣到订单的额度）
    const pkg = order.package_id
        ? db.prepare("SELECT quota, bonus_quota FROM quota_packages WHERE id = ?").get(order.package_id) as
            | { quota: number; bonus_quota: number } | undefined
        : undefined;
    const grantAmount = pkg ? pkg.quota + pkg.bonus_quota : 0;
    const user = db.prepare("SELECT quota, used_quota FROM users WHERE id = ?").get(order.user_id) as { quota: number; used_quota: number };
    if (user.quota === UNLIMITED_QUOTA) return { type: "quota", quotaAmount: 0, subDays: 0 };
    const available = Math.max(0, user.quota - user.used_quota);
    return { type: "quota", quotaAmount: Math.min(grantAmount, available), subDays: 0 };
}

/** 扣减用户额度 */
function executeDeduction(orderId: string, userId: string, plan: ReturnType<typeof calculateDeductible>) {
    if (plan.type === "subscription" && plan.subDays > 0) {
        // 从订单获取 plan_id
        const order = db.prepare("SELECT plan_id FROM orders WHERE id = ?").get(orderId) as { plan_id: string | null } | undefined;
        const sub = db.prepare(
            "SELECT id FROM user_subscriptions WHERE user_id = ? AND plan_id = ? AND status = 'active' ORDER BY expires_at DESC LIMIT 1",
        ).get(userId, order?.plan_id || "") as { id: string } | undefined;
        if (sub?.id) {
            db.prepare(
                "UPDATE user_subscriptions SET expires_at = datetime(expires_at, ? || ' days'), updated_at = ? WHERE id = ?",
            ).run(`-${plan.subDays}`, new Date().toISOString(), sub.id);
        }
    } else if (plan.type === "quota" && plan.quotaAmount > 0) {
        const user = db.prepare("SELECT quota FROM users WHERE id = ?").get(userId) as { quota: number };
        if (user.quota !== UNLIMITED_QUOTA) {
            db.prepare("UPDATE users SET quota = MAX(0, quota - ?) WHERE id = ?").run(plan.quotaAmount, userId);
        }
    }
}

/** 回滚扣减 */
function rollbackDeduction(orderId: string, userId: string, plan: ReturnType<typeof calculateDeductible>) {
    if (plan.type === "quota" && plan.quotaAmount > 0) {
        const user = db.prepare("SELECT quota FROM users WHERE id = ?").get(userId) as { quota: number };
        if (user.quota !== UNLIMITED_QUOTA) {
            db.prepare("UPDATE users SET quota = quota + ? WHERE id = ?").run(plan.quotaAmount, userId);
        }
    } else if (plan.type === "subscription" && plan.subDays > 0) {
        const order = db.prepare("SELECT plan_id FROM orders WHERE id = ?").get(orderId) as { plan_id: string | null } | undefined;
        db.prepare(
            "UPDATE user_subscriptions SET expires_at = datetime(expires_at, ? || ' days'), updated_at = ? WHERE user_id = ? AND plan_id = ? AND status = 'active'",
        ).run(`+${plan.subDays}`, new Date().toISOString(), userId, order?.plan_id || "");
    }
}

function resolveProvider(order: OrderRow): PaymentProvider | null {
    if (order.provider_instance_id) {
        return getProviderByInstanceId(order.provider_instance_id);
    }
    initPaymentProviders();
    return paymentRegistry.getProvider(order.payment_type) || null;
}

/** 执行退款（先扣后退） */
export async function processRefund(orderId: string, reason: string, operator: string): Promise<{ success: boolean; warning?: string }> {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow | undefined;
    if (!order) throw new RefundError("订单不存在", 404);

    const allowedStatuses = [ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUND_REQUESTED, ORDER_STATUS.REFUND_FAILED];
    if (!allowedStatuses.includes(order.status as never)) {
        throw new RefundError("仅已完成或退款失败的订单允许退款", 400);
    }

    const refundAmount = order.amount;
    const gatewayRefundAmount = order.pay_amount || order.amount;
    const plan = calculateDeductible(order);

    // CAS 锁定
    const lockResult = db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status IN (?, ?, ?)")
        .run(ORDER_STATUS.REFUNDING, new Date().toISOString(), orderId, ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUND_REQUESTED, ORDER_STATUS.REFUND_FAILED);
    if (lockResult.changes === 0) throw new RefundError("订单状态已变更，请刷新后重试", 409);

    try {
        // 先扣后退
        executeDeduction(orderId, order.user_id, plan);

        // 调用支付商退款
        if (order.payment_trade_no) {
            const provider = resolveProvider(order);
            if (!provider) throw new Error("支付渠道已不可用，无法退款");

            try {
                await provider.refund({
                    tradeNo: order.payment_trade_no,
                    orderId: order.id,
                    amount: gatewayRefundAmount,
                    reason,
                });
            } catch (gatewayError) {
                // 网关退款失败 → 回滚扣减
                rollbackDeduction(orderId, order.user_id, plan);
                const restoreStatus = order.status; // 恢复为原始状态（COMPLETED / REFUND_REQUESTED / REFUND_FAILED）
                db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(restoreStatus, new Date().toISOString(), orderId);
                logAudit(orderId, AUDIT_ACTION.REFUND_FAILED, `Gateway refund failed, rolled back: ${(gatewayError as Error).message}`, operator);
                return { success: false, warning: `支付网关退款失败：${(gatewayError as Error).message}，已回滚扣减` };
            }
        }

        // 退款成功
        const now = new Date().toISOString();
        db.prepare("UPDATE orders SET status = ?, refund_amount = ?, refund_reason = ?, refund_at = ?, updated_at = ? WHERE id = ?")
            .run(ORDER_STATUS.REFUNDED, refundAmount, reason, now, now, orderId);
        logAudit(orderId, AUDIT_ACTION.REFUND_SUCCESS, JSON.stringify({ refundAmount, reason, quotaDeducted: plan.quotaAmount }), operator);
        return { success: true };
    } catch (error) {
        // 扣减已执行但后续步骤失败 → 回滚扣减（防止用户丢失额度）
        rollbackDeduction(orderId, order.user_id, plan);
        db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?")
            .run(ORDER_STATUS.REFUND_FAILED, new Date().toISOString(), orderId);
        logAudit(orderId, AUDIT_ACTION.REFUND_FAILED, (error as Error).message, operator);
        throw error;
    }
}
