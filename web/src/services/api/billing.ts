export type QuotaPackage = {
    id: string; name: string; description: string; price: number;
    originalPrice: number | null; quota: number; bonusQuota: number; sortOrder: number;
};

export type SubscriptionPlan = {
    id: string; name: string; description: string; price: number;
    originalPrice: number | null; quotaPerPeriod: number; validityDays: number;
    validityUnit: string; features: string[]; sortOrder: number;
};

export type BillingPlans = {
    quotaPackages: QuotaPackage[];
    subscriptionPlans: SubscriptionPlan[];
};

export type OrderResult = {
    orderId: string; amount: number; payAmount: number; feeRate: number;
    status: string; paymentType: string;
    payUrl?: string | null; qrCode?: string | null; clientSecret?: string | null; publishableKey?: string | null; expiresAt: string;
};

export type UserOrder = {
    id: string; user_id: string; user_email: string | null; user_name: string | null;
    amount: number; pay_amount: number | null; fee_rate: number;
    recharge_code: string; status: string; order_type: string;
    package_id: string | null; plan_id: string | null;
    payment_type: string; payment_trade_no: string | null;
    pay_url: string | null; qr_code: string | null;
    expires_at: string; paid_at: string | null; completed_at: string | null;
    cancelled_at: string | null; created_at: string; updated_at: string;
};

export async function fetchPlans(): Promise<BillingPlans> {
    const res = await fetch("/api/billing/plans");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "获取套餐失败");
    return data;
}

export async function createOrder(input: {
    paymentType: string; orderType: "quota" | "subscription";
    packageId?: string; planId?: string;
}): Promise<OrderResult> {
    const res = await fetch("/api/billing/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "创建订单失败");
    return data;
}

export async function fetchMyOrders(status?: string): Promise<UserOrder[]> {
    const params = status ? `?status=${status}` : "";
    const res = await fetch(`/api/billing/orders/my${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "获取订单失败");
    return data.orders || [];
}

export async function cancelOrder(orderId: string): Promise<void> {
    const res = await fetch(`/api/billing/orders/${orderId}/cancel`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "取消订单失败");
}

export async function redeemCode(code: string): Promise<{ type: string; value: number }> {
    const res = await fetch("/api/billing/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "兑换失败");
    return data;
}
