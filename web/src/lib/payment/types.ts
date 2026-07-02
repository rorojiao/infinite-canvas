export type PaymentType = string;

/** 从复合 key 中提取基础支付方式 */
export function getBasePaymentType(type: string): string {
    if (type.startsWith("alipay")) return "alipay";
    if (type.startsWith("wxpay")) return "wxpay";
    if (type.startsWith("stripe")) return "stripe";
    return type;
}

export interface CreatePaymentRequest {
    orderId: string;
    amount: number;
    paymentType: PaymentType;
    subject: string;
    notifyUrl?: string;
    returnUrl?: string;
    clientIp?: string;
    isMobile?: boolean;
}

export interface CreatePaymentResponse {
    tradeNo: string;
    payUrl?: string;
    qrCode?: string;
    clientSecret?: string;
    publishableKey?: string;
}

export interface QueryOrderResponse {
    tradeNo: string;
    status: "pending" | "paid" | "failed" | "refunded";
    amount: number;
    paidAt?: string;
}

export interface PaymentNotification {
    tradeNo: string;
    orderId: string;
    amount: number;
    status: "success" | "failed";
    rawData: unknown;
}

export interface RefundRequest {
    tradeNo: string;
    orderId: string;
    amount: number;
    reason?: string;
}

export interface RefundResponse {
    refundId: string;
    status: "success" | "pending" | "failed";
}

export interface MethodDefaultLimits {
    singleMax?: number;
    dailyMax?: number;
}

export interface PaymentProvider {
    readonly name: string;
    readonly providerKey: string;
    readonly supportedTypes: PaymentType[];
    readonly defaultLimits?: Record<string, MethodDefaultLimits>;
    createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse>;
    verifyNotification(rawBody: string | Buffer, headers: Record<string, string>): Promise<PaymentNotification | null>;
    refund(request: RefundRequest): Promise<RefundResponse>;
    queryOrder?(tradeNo: string): Promise<QueryOrderResponse>;
    cancelPayment?(tradeNo: string): Promise<void>;
}
