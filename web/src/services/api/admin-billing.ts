export type AdminDashboardStats = {
    summary: {
        today: { amount: number; orderCount: number; paidCount: number };
        total: { amount: number; orderCount: number; paidCount: number };
        subscriptionToday: { amount: number; paidCount: number };
        subscriptionTotal: { amount: number; paidCount: number };
        successRate: number;
        avgAmount: number;
    };
    dailySeries: Array<{ date: string; amount: number; count: number }>;
    leaderboard: Array<{ userId: string; userName: string | null; userEmail: string | null; totalAmount: number; orderCount: number }>;
    paymentMethods: Array<{ paymentType: string; amount: number; count: number; percentage: number }>;
    meta: { days: number; generatedAt: string };
};

export async function fetchDashboardStats(days = 30): Promise<AdminDashboardStats> {
    const res = await fetch(`/api/admin/billing/dashboard?days=${days}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "获取数据失败");
    return data;
}

export async function fetchAdminOrders(status?: string): Promise<Record<string, unknown>[]> {
    const params = status ? `?status=${status}` : "";
    const res = await fetch(`/api/admin/billing/orders${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "获取订单失败");
    return data.orders || [];
}

export async function refundOrder(orderId: string, reason: string): Promise<void> {
    const res = await fetch(`/api/admin/billing/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "退款失败");
}

export async function fetchAdminPackages(): Promise<Record<string, unknown>[]> {
    const res = await fetch("/api/admin/billing/packages");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "获取套餐失败");
    return data.packages || [];
}

export async function saveAdminPackage(pkg: Record<string, unknown>): Promise<void> {
    const res = await fetch("/api/admin/billing/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pkg),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "保存失败");
}

export async function deleteAdminPackage(id: string): Promise<void> {
    const res = await fetch(`/api/admin/billing/packages/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "删除失败");
}

export async function fetchAdminSubscriptionPlans(): Promise<Record<string, unknown>[]> {
    const res = await fetch("/api/admin/billing/subscription-plans");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "获取计划失败");
    return data.plans || [];
}

export async function saveAdminSubscriptionPlan(plan: Record<string, unknown>): Promise<void> {
    const res = await fetch("/api/admin/billing/subscription-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "保存失败");
}

export async function deleteAdminSubscriptionPlan(id: string): Promise<void> {
    const res = await fetch(`/api/admin/billing/subscription-plans/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "删除失败");
}

export async function fetchRedeemCodes(status?: string): Promise<Record<string, unknown>[]> {
    const params = status ? `?status=${status}` : "";
    const res = await fetch(`/api/admin/billing/redeem-codes${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "获取兑换码失败");
    return data.codes || [];
}

export async function generateRedeemCodes(input: {
    count: number; type: string; value: number; planId?: string; expiresInDays?: number; notes?: string;
}): Promise<string[]> {
    const res = await fetch("/api/admin/billing/redeem-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "生成失败");
    return data.codes || [];
}

export async function fetchPaymentProviders(): Promise<Record<string, unknown>[]> {
    const res = await fetch("/api/admin/billing/payment-config");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "获取配置失败");
    return data.instances || [];
}

export async function savePaymentProvider(input: Record<string, unknown>): Promise<void> {
    const res = await fetch("/api/admin/billing/payment-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "保存失败");
}

export async function deletePaymentProvider(id: string): Promise<void> {
    const res = await fetch(`/api/admin/billing/payment-config/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "删除失败");
}
