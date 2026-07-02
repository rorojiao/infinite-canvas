import { db } from "@/lib/db";
import { decryptConfig } from "./crypto";
import { paymentRegistry, PaymentProviderRegistry } from "./registry";
import type { PaymentProvider } from "./types";
import { EasyPayProvider } from "./providers/easypay/provider";
import { StripeProvider } from "./providers/stripe/provider";

export { paymentRegistry };

type InstanceRow = {
    id: string;
    provider_key: string;
    name: string;
    config: string;
    supported_types: string;
    enabled: number;
    sort_order: number;
};

let initialized = false;

function buildProvider(row: InstanceRow): PaymentProvider {
    const config = decryptConfig(row.config);
    const name = row.name || `${row.provider_key}:${row.id}`;
    switch (row.provider_key) {
        case "easypay":
            return new EasyPayProvider(name, config as never, row.id);
        case "stripe":
            return new StripeProvider(name, config as never, row.id);
        default:
            throw new Error(`Unknown provider key: ${row.provider_key}`);
    }
}

/** 初始化支付商实例（从 DB 读取配置，解密后注册） */
export function initPaymentProviders(): void {
    if (initialized) return;
    initialized = true;

    const rows = db
        .prepare("SELECT id, provider_key, name, config, supported_types, enabled, sort_order FROM payment_provider_instances WHERE enabled = 1 ORDER BY sort_order ASC")
        .all() as InstanceRow[];

    for (const row of rows) {
        try {
            paymentRegistry.register(buildProvider(row));
        } catch (e) {
            console.error(`[Payment] Failed to init provider ${row.provider_key}:${row.id}:`, e);
        }
    }
}

/** 重置并重新初始化（配置变更后调用） */
export function resetPaymentProviders(): void {
    initialized = false;
    // 用新实例替换，触发重新加载
    const fresh = new PaymentProviderRegistry();
    // 用 prototype 替换内部 map — 更简洁的方式是直接替换 registry 实例
    // 但因为其他模块引用了 paymentRegistry 常量，我们需要清空它的 providers
    const internal = paymentRegistry as unknown as { providers: Map<unknown, unknown> };
    internal.providers.clear();
    initPaymentProviders();
}

/** 按 instanceId 获取指定实例的 provider */
export function getProviderByInstanceId(instanceId: string): PaymentProvider | null {
    const row = db
        .prepare("SELECT id, provider_key, name, config, supported_types, enabled, sort_order FROM payment_provider_instances WHERE id = ? AND enabled = 1")
        .get(instanceId) as InstanceRow | undefined;
    if (!row) return null;
    try {
        return buildProvider(row);
    } catch {
        return null;
    }
}
