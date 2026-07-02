import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { type SessionUser } from "@/lib/auth";
import { getBillingConfigNumber, getBillingConfigBool } from "./config";
import { generateRechargeCode } from "./code-gen";
import { calculatePayAmount, getMethodFeeRate } from "./fee";
import { ORDER_STATUS, ORDER_TYPE, AUDIT_ACTION } from "./constants";
import { checkRechargeLimits } from "./limits";
import { initPaymentProviders, paymentRegistry, getProviderByInstanceId } from "@/lib/payment/init";
import type { PaymentNotification, PaymentProvider } from "@/lib/payment/types";
import { UNLIMITED_QUOTA } from "@/lib/quota";

export class OrderError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = "OrderError";
        this.statusCode = statusCode;
    }
}

export interface CreateOrderInput {
    paymentType: string;
    orderType: "quota" | "subscription";
    packageId?: string;
    planId?: string;
    clientIp?: string;
    isMobile?: boolean;
}

export interface CreateOrderResult {
    orderId: string;
    amount: number;
    payAmount: number;
    feeRate: number;
    status: string;
    paymentType: string;
    payUrl?: string | null;
    qrCode?: string | null;
    clientSecret?: string | null;
    publishableKey?: string | null;
    expiresAt: string;
}

type QuotaPackageRow = { id: string; name: string; price: number; quota: number; bonus_quota: number; for_sale: number };
type SubscriptionPlanRow = {
    id: string; name: string; price: number; quota_per_period: number;
    validity_days: number; for_sale: number; product_name?: string;
};
type UserRow = { id: string; email: string; display_name: string; status: string; is_admin: number };
type OrderRow = {
    id: string; user_id: string; amount: number; pay_amount: number; fee_rate: number;
    recharge_code: string; status: string; order_type: string; package_id: string | null;
    plan_id: string | null; subscription_days: number | null; payment_type: string;
    payment_trade_no: string | null; pay_url: string | null; qr_code: string | null;
    provider_instance_id: string | null; expires_at: string; created_at: string; updated_at: string;
};

export function logAudit(orderId: string, action: string, detail: string | null, operator: string) {
    db.prepare(
        "INSERT INTO order_audit_logs (id, order_id, action, detail, operator, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(nanoid(), orderId, action, detail, operator, new Date().toISOString());
}

function resolveProvider(paymentType: string, instanceId?: string): { provider: PaymentProvider; instanceId?: string } {
    if (instanceId) {
        const provider = getProviderByInstanceId(instanceId);
        if (!provider) throw new OrderError("支付渠道实例不存在或已禁用", 400);
        return { provider, instanceId };
    }
    initPaymentProviders();
    const provider = paymentRegistry.getProvider(paymentType);
    if (!provider) throw new OrderError(`不支持的支付方式: ${paymentType}`, 400);
    return { provider };
}

/** 创建订单 */
export async function createOrder(session: SessionUser, input: CreateOrderInput): Promise<CreateOrderResult> {
    const orderType = input.orderType || "quota";

    if (orderType === "quota" && getBillingConfigBool("BALANCE_PAYMENT_DISABLED")) {
        throw new OrderError("充值已被管理员关闭", 403);
    }

    let amount = 0;
    let packageName = "";
    let planId: string | null = null;
    let subscriptionDays: number | null = null;

    if (orderType === "quota") {
        if (!input.packageId) throw new OrderError("请选择充值套餐", 400);
        const pkg = db.prepare("SELECT id, name, price, quota, bonus_quota, for_sale FROM quota_packages WHERE id = ?").get(input.packageId) as QuotaPackageRow | undefined;
        if (!pkg || !pkg.for_sale) throw new OrderError("该套餐不存在或已下架", 404);
        amount = pkg.price;
        packageName = pkg.name;
    } else {
        if (!input.planId) throw new OrderError("请选择订阅套餐", 400);
        const plan = db.prepare("SELECT id, name, price, quota_per_period, validity_days, for_sale FROM subscription_plans WHERE id = ?").get(input.planId) as SubscriptionPlanRow | undefined;
        if (!plan || !plan.for_sale) throw new OrderError("该订阅套餐不存在或已下架", 404);
        amount = plan.price;
        packageName = plan.name;
        planId = plan.id;
        subscriptionDays = plan.validity_days;
    }

    // 先在事务内检查限额并创建订单（消除 check-then-act 竞态窗口）
    const { provider, instanceId } = resolveProvider(input.paymentType);
    const feeRate = getMethodFeeRate(input.paymentType);
    const payAmount = calculatePayAmount(amount, feeRate);
    const timeoutMinutes = getBillingConfigNumber("ORDER_TIMEOUT_MINUTES");
    const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString();

    const orderId = nanoid();
    const rechargeCode = generateRechargeCode(orderId);
    const appName = process.env.NEXT_PUBLIC_APP_NAME || "无限画布";
    const notifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/billing/notify/${provider.providerKey}${instanceId ? `?inst=${instanceId}` : ""}`;
    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/billing/orders`;

    // Step 1: 限额检查 + 订单插入（同步，无竞态窗口）
    const limitCheck = checkRechargeLimits(session.id, amount, input.paymentType);
    if (!limitCheck.ok) throw new OrderError(limitCheck.error || "限额校验失败", limitCheck.statusCode || 400);

    const now = new Date().toISOString();
    db.prepare(
        `INSERT INTO orders (
            id, user_id, user_email, user_name, amount, pay_amount, fee_rate,
            recharge_code, status, order_type, package_id, plan_id, subscription_days,
            payment_type, payment_trade_no, pay_url, qr_code, provider_instance_id,
            expires_at, client_ip, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        orderId, session.id, session.email, session.displayName,
        amount, payAmount, feeRate, rechargeCode,
        ORDER_STATUS.PENDING, orderType, input.packageId || null, planId, subscriptionDays,
        input.paymentType, "", null, null, instanceId || null,
        expiresAt, input.clientIp || null, now, now,
    );
    logAudit(orderId, AUDIT_ACTION.CREATED, JSON.stringify({ amount, paymentType: input.paymentType, orderType }), `user:${session.id}`);

    // Step 2: 调用支付商创建支付（异步，可能失败）
    let paymentResult;
    try {
        paymentResult = await provider.createPayment({
            orderId,
            amount: payAmount,
            paymentType: input.paymentType,
            subject: `${appName} - ${packageName}`,
            notifyUrl,
            returnUrl,
            clientIp: input.clientIp,
            isMobile: input.isMobile,
        });
    } catch (e) {
        // 支付商创建失败 → 删除订单（回退限额检查的影响）
        db.prepare("UPDATE orders SET status = ?, failed_at = ?, failed_reason = ?, updated_at = ? WHERE id = ?")
            .run(ORDER_STATUS.FAILED, new Date().toISOString(), (e as Error).message, new Date().toISOString(), orderId);
        throw new OrderError(`创建支付失败：${(e as Error).message}`, 502);
    }

    // Step 3: 更新订单的支付信息
    db.prepare("UPDATE orders SET payment_trade_no = ?, pay_url = ?, qr_code = ?, updated_at = ? WHERE id = ?")
        .run(paymentResult.tradeNo, paymentResult.payUrl || null, paymentResult.qrCode || null, new Date().toISOString(), orderId);

    return {
        orderId,
        amount,
        payAmount,
        feeRate,
        status: ORDER_STATUS.PENDING,
        paymentType: input.paymentType,
        payUrl: paymentResult.payUrl || null,
        qrCode: paymentResult.qrCode || null,
        clientSecret: paymentResult.clientSecret || null,
        publishableKey: paymentResult.publishableKey || null,
        expiresAt,
    };
}

/** 发放充值额度（幂等：订单 COMPLETED 状态跳过） */
function grantQuota(orderId: string, userId: string, quotaAmount: number) {
    const row = db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId) as { status: string } | undefined;
    if (!row || row.status === ORDER_STATUS.COMPLETED) return;

    // 事务：先加额度再 CAS 标记完成，确保原子性
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
        // 先加额度（可能抛异常）
        if (quotaAmount > 0) {
            const user = db.prepare("SELECT quota FROM users WHERE id = ?").get(userId) as { quota: number } | undefined;
            if (!user) throw new Error(`用户不存在: ${userId}`);
            if (user.quota !== UNLIMITED_QUOTA) {
                db.prepare("UPDATE users SET quota = quota + ?, total_recharged = total_recharged + ? WHERE id = ?")
                    .run(quotaAmount, quotaAmount, userId);
            }
        }
        // 再 CAS: RECHARGING → COMPLETED（确保只有加额度成功才标记完成）
        const cas = db.prepare("UPDATE orders SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = ?")
            .run(ORDER_STATUS.COMPLETED, now, now, orderId, ORDER_STATUS.RECHARGING);
        if (cas.changes === 0) throw new Error("CAS 失败：订单状态已被其他流程修改");
    });

    try {
        tx();
        logAudit(orderId, AUDIT_ACTION.COMPLETED, `granted ${quotaAmount} quota`, "system");
    } catch (e) {
        // 事务回滚：额度未加，订单状态未变，由上层 catch 处理
        throw e;
    }
}

/** 发放订阅（创建 user_subscriptions + 首期额度） */
function grantSubscription(orderId: string, userId: string, planId: string) {
    const plan = db.prepare("SELECT id, quota_per_period, validity_days FROM subscription_plans WHERE id = ?").get(planId) as
        | { id: string; quota_per_period: number; validity_days: number } | undefined;
    if (!plan) return;

    const now = new Date();
    const expires = new Date(now.getTime() + plan.validity_days * 24 * 60 * 60 * 1000);
    const nowIso = now.toISOString();

    // 事务：先创建订阅+加额度，再 CAS 标记完成
    const tx = db.transaction(() => {
        // 检查是否已有活跃订阅（续期逻辑）
        const existing = db.prepare(
            "SELECT id, expires_at FROM user_subscriptions WHERE user_id = ? AND plan_id = ? AND status = 'active' ORDER BY expires_at DESC LIMIT 1",
        ).get(userId, planId) as { id: string; expires_at: string } | undefined;

        let subId: string;
        if (existing && new Date(existing.expires_at) > now) {
            const newExpiry = new Date(new Date(existing.expires_at).getTime() + plan.validity_days * 24 * 60 * 60 * 1000);
            db.prepare("UPDATE user_subscriptions SET expires_at = ?, updated_at = ?, last_quota_granted_at = ? WHERE id = ?")
                .run(newExpiry.toISOString(), nowIso, nowIso, existing.id);
            subId = existing.id;
        } else {
            subId = nanoid();
            db.prepare(
                `INSERT INTO user_subscriptions (id, user_id, plan_id, order_id, starts_at, expires_at, status, last_quota_granted_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
            ).run(subId, userId, planId, orderId, nowIso, expires.toISOString(), nowIso, nowIso, nowIso);
        }

        // 发放本期额度
        if (plan.quota_per_period > 0) {
            const user = db.prepare("SELECT quota FROM users WHERE id = ?").get(userId) as { quota: number } | undefined;
            if (!user) throw new Error(`用户不存在: ${userId}`);
            if (user.quota !== UNLIMITED_QUOTA) {
                db.prepare("UPDATE users SET quota = quota + ?, total_recharged = total_recharged + ? WHERE id = ?")
                    .run(plan.quota_per_period, plan.quota_per_period, userId);
            }
        }

        // CAS: RECHARGING → COMPLETED（最后执行）
        const cas = db.prepare("UPDATE orders SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = ?")
            .run(ORDER_STATUS.COMPLETED, nowIso, nowIso, orderId, ORDER_STATUS.RECHARGING);
        if (cas.changes === 0) throw new Error("CAS 失败：订单状态已被其他流程修改");

        return subId;
    });

    try {
        const subId = tx();
        logAudit(orderId, AUDIT_ACTION.COMPLETED, `subscription ${subId}, quota ${plan.quota_per_period}`, "system");
    } catch (e) {
        throw e;
    }
}

/** 处理支付回调（核心充值流程） */
export function handlePaymentNotify(notification: PaymentNotification, providerName: string): boolean {
    const order = db.prepare("SELECT id, user_id, amount, status, order_type, package_id, plan_id FROM orders WHERE id = ?")
        .get(notification.orderId) as
        | { id: string; user_id: string; amount: number; status: string; order_type: string; package_id: string | null; plan_id: string | null }
        | undefined;

    if (!order) {
        console.warn(`[Payment] Order not found: ${notification.orderId}`);
        return true; // 返回 success 防止支付商重试
    }

    // 已终态（已充值过），幂等返回
    // 已处理过的订单直接幂等返回（涵盖所有非 PENDING 状态，防止退款期间的重复回调）
    if (order.status !== ORDER_STATUS.PENDING) return true;

    if (notification.status !== "success") {
        // 支付失败
        const cas = db.prepare("UPDATE orders SET status = ?, failed_at = ?, failed_reason = ?, updated_at = ? WHERE id = ? AND status = ?")
            .run(ORDER_STATUS.FAILED, new Date().toISOString(), "支付失败", new Date().toISOString(), order.id, ORDER_STATUS.PENDING);
        if (cas.changes > 0) {
            logAudit(order.id, AUDIT_ACTION.FAILED, JSON.stringify(notification.rawData), providerName);
        }
        return true;
    }

    // 校验金额一致（防篡改）
    if (Math.abs(notification.amount - order.amount) > 0.01) {
        console.error(`[Payment] Amount mismatch for order ${order.id}: expected ${order.amount}, got ${notification.amount}`);
        logAudit(order.id, "AMOUNT_MISMATCH", `expected ${order.amount}, got ${notification.amount}`, providerName);
        return true;
    }

    const now = new Date().toISOString();

    // CAS: PENDING → PAID
    const casPaid = db.prepare("UPDATE orders SET status = ?, payment_trade_no = ?, paid_at = ?, updated_at = ? WHERE id = ? AND status = ?")
        .run(ORDER_STATUS.PAID, notification.tradeNo, now, now, order.id, ORDER_STATUS.PENDING);
    if (casPaid.changes === 0) return true; // 已被其他回调处理
    logAudit(order.id, AUDIT_ACTION.PAID, `trade_no: ${notification.tradeNo}`, providerName);

    // CAS: PAID → RECHARGING
    const casRecharging = db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?")
        .run(ORDER_STATUS.RECHARGING, now, order.id, ORDER_STATUS.PAID);
    if (casRecharging.changes === 0) return true;
    logAudit(order.id, AUDIT_ACTION.RECHARGING, null, "system");

    try {
        if (order.order_type === ORDER_TYPE.SUBSCRIPTION && order.plan_id) {
            grantSubscription(order.id, order.user_id, order.plan_id);
        } else {
            // quota 订单：从 DB 取实际额度（不信任回调中的数据）
            const pkg = order.package_id
                ? db.prepare("SELECT quota, bonus_quota FROM quota_packages WHERE id = ?").get(order.package_id) as
                    | { quota: number; bonus_quota: number } | undefined
                : undefined;
            grantQuota(order.id, order.user_id, pkg ? pkg.quota + pkg.bonus_quota : 0);
        }
    } catch (e) {
        // 充值失败 → 仅当订单仍在 RECHARGING 时才标记 FAILED（CAS 防止覆盖 COMPLETED）
        db.prepare("UPDATE orders SET status = ?, failed_at = ?, failed_reason = ?, updated_at = ? WHERE id = ? AND status = ?")
            .run(ORDER_STATUS.FAILED, now, (e as Error).message, now, order.id, ORDER_STATUS.RECHARGING);
        logAudit(order.id, AUDIT_ACTION.FAILED, (e as Error).message, "system");
        console.error(`[Payment] Recharge failed for order ${order.id}:`, e);
    }

    return true;
}

/** 用户取消订单 */
export function cancelOrder(session: SessionUser, orderId: string): void {
    const order = db.prepare("SELECT id, user_id, status FROM orders WHERE id = ?").get(orderId) as
        | { id: string; user_id: string; status: string } | undefined;
    if (!order) throw new OrderError("订单不存在", 404);
    if (order.user_id !== session.id) throw new OrderError("无权操作", 403);
    if (order.status !== ORDER_STATUS.PENDING) throw new OrderError("只能取消待支付的订单", 400);

    const now = new Date().toISOString();
    db.prepare("UPDATE orders SET status = ?, cancelled_at = ?, updated_at = ? WHERE id = ? AND status = ?")
        .run(ORDER_STATUS.CANCELLED, now, now, orderId, ORDER_STATUS.PENDING);
    logAudit(orderId, AUDIT_ACTION.CANCELLED, null, `user:${session.id}`);
}

/** 获取用户订单列表 */
export function getUserOrders(userId: string, status?: string): OrderRow[] {
    const rows = status
        ? db.prepare("SELECT * FROM orders WHERE user_id = ? AND status = ? ORDER BY created_at DESC").all(userId, status) as OrderRow[]
        : db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(userId) as OrderRow[];
    return rows;
}

/** 获取单个订单详情 */
export function getOrderById(orderId: string): OrderRow | undefined {
    return db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow | undefined;
}

/** 获取订单审计日志 */
export function getOrderAuditLogs(orderId: string) {
    return db.prepare("SELECT * FROM order_audit_logs WHERE order_id = ? ORDER BY created_at ASC").all(orderId) as
        Array<{ id: string; action: string; detail: string | null; operator: string; created_at: string }>;
}

/** 过期超时订单（定时任务调用） */
export function expirePendingOrders(): number {
    const now = new Date().toISOString();
    const expired = db.prepare(
        "SELECT id FROM orders WHERE status = ? AND expires_at < ?",
    ).all(ORDER_STATUS.PENDING, now) as Array<{ id: string }>;

    const updateStmt = db.prepare(
        "UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
    );
    for (const { id } of expired) {
        if (updateStmt.run(ORDER_STATUS.EXPIRED, now, id, ORDER_STATUS.PENDING).changes > 0) {
            logAudit(id, AUDIT_ACTION.EXPIRED, null, "system");
        }
    }
    return expired.length;
}

/** 过期订阅（定时任务调用） */
export function expireSubscriptions(): number {
    const now = new Date().toISOString();
    const result = db.prepare(
        "UPDATE user_subscriptions SET status = 'expired', updated_at = ? WHERE status = 'active' AND expires_at < ?",
    ).run(now, now);
    return result.changes;
}
