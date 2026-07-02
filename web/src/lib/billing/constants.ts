/** 订单状态 */
export const ORDER_STATUS = {
    PENDING: "PENDING",
    PAID: "PAID",
    RECHARGING: "RECHARGING",
    COMPLETED: "COMPLETED",
    EXPIRED: "EXPIRED",
    CANCELLED: "CANCELLED",
    FAILED: "FAILED",
    REFUND_REQUESTED: "REFUND_REQUESTED",
    REFUNDING: "REFUNDING",
    PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
    REFUNDED: "REFUNDED",
    REFUND_FAILED: "REFUND_FAILED",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** 终态状态（不再轮询） */
export const TERMINAL_STATUSES = new Set<string>([
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.FAILED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.EXPIRED,
    ORDER_STATUS.PARTIALLY_REFUNDED,
    ORDER_STATUS.REFUNDED,
    ORDER_STATUS.REFUND_FAILED,
]);

/** 退款相关状态 */
export const REFUND_STATUSES = new Set<string>([
    ORDER_STATUS.REFUND_REQUESTED,
    ORDER_STATUS.REFUNDING,
    ORDER_STATUS.PARTIALLY_REFUNDED,
    ORDER_STATUS.REFUNDED,
    ORDER_STATUS.REFUND_FAILED,
]);

/** 支付方式标识 */
export const PAYMENT_TYPE = {
    ALIPAY: "alipay",
    WXPAY: "wxpay",
    STRIPE: "stripe",
} as const;

/** 订单类型 */
export const ORDER_TYPE = {
    QUOTA: "quota",
    SUBSCRIPTION: "subscription",
} as const;

/** 订阅状态 */
export const SUBSCRIPTION_STATUS = {
    ACTIVE: "active",
    EXPIRED: "expired",
    CANCELLED: "cancelled",
} as const;

/** 兑换码状态 */
export const REDEEM_STATUS = {
    UNUSED: "unused",
    USED: "used",
} as const;

/** 充值码前缀 */
export const RECHARGE_CODE_PREFIX = "ic_";

/** 审计动作枚举 */
export const AUDIT_ACTION = {
    CREATED: "CREATED",
    PAID: "PAID",
    RECHARGING: "RECHARGING",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
    FAILED: "FAILED",
    REFUND_REQUESTED: "REFUND_REQUESTED",
    REFUNDING: "REFUNDING",
    REFUND_SUCCESS: "REFUND_SUCCESS",
    PARTIAL_REFUND_SUCCESS: "PARTIAL_REFUND_SUCCESS",
    REFUND_FAILED: "REFUND_FAILED",
    REFUND_ROLLBACK_FAILED: "REFUND_ROLLBACK_FAILED",
} as const;
