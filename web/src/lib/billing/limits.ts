import { db } from "@/lib/db";
import { ORDER_STATUS } from "./constants";
import { getBillingConfigNumber } from "./config";
import { initPaymentProviders, paymentRegistry } from "@/lib/payment/init";

/** 获取指定支付渠道的每日全平台限额 */
export function getMethodDailyLimit(paymentType: string): number {
    const configVal = process.env[`MAX_DAILY_AMOUNT_${paymentType.toUpperCase()}`];
    if (configVal !== undefined) {
        const num = Number(configVal);
        if (Number.isFinite(num) && num >= 0) return num;
    }
    initPaymentProviders();
    const providerDefault = paymentRegistry.getDefaultLimit(paymentType);
    return providerDefault?.dailyMax ?? 0;
}

/** 获取指定支付渠道的单笔限额 */
export function getMethodSingleLimit(paymentType: string): number {
    const configVal = process.env[`MAX_SINGLE_AMOUNT_${paymentType.toUpperCase()}`];
    if (configVal !== undefined) {
        const num = Number(configVal);
        if (Number.isFinite(num) && num >= 0) return num;
    }
    initPaymentProviders();
    const providerDefault = paymentRegistry.getDefaultLimit(paymentType);
    return providerDefault?.singleMax ?? 0;
}

/** 获取今日已支付金额（按支付方式） */
export function getTodayPaidAmount(paymentType: string): number {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const row = db
        .prepare(
            `SELECT COALESCE(SUM(amount), 0) as total FROM orders
             WHERE payment_type = ? AND status IN ('PAID','RECHARGING','COMPLETED','REFUNDING','REFUNDED','REFUND_FAILED')
             AND paid_at >= ?`,
        )
        .get(paymentType, todayStart.toISOString()) as { total: number };
    return row.total || 0;
}

/** 获取用户今日累计充值金额 */
export function getUserTodayPaidAmount(userId: string): number {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const row = db
        .prepare(
            `SELECT COALESCE(SUM(amount), 0) as total FROM orders
             WHERE user_id = ? AND status IN ('PAID','RECHARGING','COMPLETED','REFUNDING','REFUNDED','REFUND_FAILED')
             AND paid_at >= ?`,
        )
        .get(userId, todayStart.toISOString()) as { total: number };
    return row.total || 0;
}

/** 获取用户待支付订单数 */
export function getUserPendingCount(userId: string): number {
    const row = db
        .prepare("SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND status = ?")
        .get(userId, ORDER_STATUS.PENDING) as { count: number };
    return row.count;
}

/** 获取用户今日取消订单数 */
export function getUserCancelCountToday(userId: string): number {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const row = db
        .prepare(
            `SELECT COUNT(*) as count FROM order_audit_logs
             WHERE action = 'CANCELLED' AND operator = ? AND created_at >= ?`,
        )
        .get(`user:${userId}`, todayStart.toISOString()) as { count: number };
    return row.count;
}

export interface LimitCheckResult {
    ok: boolean;
    error?: string;
    statusCode?: number;
}

/** 校验充值限额 */
export function checkRechargeLimits(
    userId: string,
    amount: number,
    paymentType: string,
): LimitCheckResult {
    const minAmount = getBillingConfigNumber("MIN_RECHARGE_AMOUNT");
    const maxAmount = getBillingConfigNumber("MAX_RECHARGE_AMOUNT");
    const maxDaily = getBillingConfigNumber("MAX_DAILY_RECHARGE_AMOUNT");
    const maxPending = getBillingConfigNumber("MAX_PENDING_ORDERS");
    const cancelMax = getBillingConfigNumber("CANCEL_RATE_LIMIT_MAX");

    if (amount < minAmount) {
        return { ok: false, error: `最低充值金额 ${minAmount} 元`, statusCode: 400 };
    }
    if (amount > maxAmount) {
        return { ok: false, error: `最高充值金额 ${maxAmount} 元`, statusCode: 400 };
    }

    const pendingCount = getUserPendingCount(userId);
    if (pendingCount >= maxPending) {
        return { ok: false, error: `待支付订单过多（最多 ${maxPending} 笔）`, statusCode: 429 };
    }

    const userDailyPaid = getUserTodayPaidAmount(userId);
    if (maxDaily > 0 && userDailyPaid + amount > maxDaily) {
        const remaining = Math.max(0, maxDaily - userDailyPaid);
        return { ok: false, error: `今日累计充值已达上限，剩余可充值 ${remaining.toFixed(2)} 元`, statusCode: 429 };
    }

    const cancelCount = getUserCancelCountToday(userId);
    if (cancelCount >= cancelMax) {
        return { ok: false, error: "今日取消次数过多，请稍后再试", statusCode: 429 };
    }

    const methodDaily = getMethodDailyLimit(paymentType);
    if (methodDaily > 0) {
        const methodUsed = getTodayPaidAmount(paymentType);
        if (methodUsed + amount > methodDaily) {
            const remaining = Math.max(0, methodDaily - methodUsed);
            return {
                ok: false,
                error: remaining > 0
                    ? `${paymentType} 今日剩余额度 ${remaining.toFixed(2)} 元`
                    : `${paymentType} 今日充值额度已满`,
                statusCode: 429,
            };
        }
    }

    return { ok: true };
}
