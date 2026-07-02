import { db } from "@/lib/db";

const CONFIG_DEFAULTS: Record<string, string> = {
    ORDER_TIMEOUT_MINUTES: "10",
    MIN_RECHARGE_AMOUNT: "1",
    MAX_RECHARGE_AMOUNT: "5000",
    MAX_DAILY_RECHARGE_AMOUNT: "10000",
    MAX_PENDING_ORDERS: "3",
    BALANCE_PAYMENT_DISABLED: "false",
    CANCEL_RATE_LIMIT_MAX: "10",
};

/** 读取 billing 配置（DB 优先，回退环境变量，再回退默认值） */
export function getBillingConfig(key: string): string {
    const row = db.prepare("SELECT value FROM billing_config WHERE key = ?").get(key) as { value: string } | undefined;
    if (row?.value !== undefined && row.value !== null) return row.value;
    return process.env[key] || CONFIG_DEFAULTS[key] || "";
}

/** 读取 billing 配置为数字 */
export function getBillingConfigNumber(key: string): number {
    const val = getBillingConfig(key);
    const num = Number(val);
    return Number.isFinite(num) ? num : Number(CONFIG_DEFAULTS[key]) || 0;
}

/** 读取 billing 配置为布尔 */
export function getBillingConfigBool(key: string): boolean {
    return getBillingConfig(key) === "true";
}

/** 设置 billing 配置 */
export function setBillingConfig(key: string, value: string): void {
    const now = new Date().toISOString();
    db.prepare(
        "INSERT INTO billing_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    ).run(key, value, now);
}
