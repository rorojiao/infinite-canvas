import { db } from "@/lib/db";

export type QuotaPackage = {
    id: string; name: string; description: string; price: number;
    originalPrice: number | null; quota: number; bonusQuota: number; sortOrder: number;
};

export type SubscriptionPlan = {
    id: string; name: string; description: string; price: number;
    originalPrice: number | null; quotaPerPeriod: number; validityDays: number;
    validityUnit: string; features: string[]; sortOrder: number;
};

export function getForSaleQuotaPackages(): QuotaPackage[] {
    const rows = db.prepare("SELECT * FROM quota_packages WHERE for_sale = 1 ORDER BY sort_order ASC").all() as Array<{
        id: string; name: string; description: string; price: number;
        original_price: number | null; quota: number; bonus_quota: number; sort_order: number;
    }>;
    return rows.map((r) => ({
        id: r.id, name: r.name, description: r.description, price: r.price,
        originalPrice: r.original_price, quota: r.quota, bonusQuota: r.bonus_quota, sortOrder: r.sort_order,
    }));
}

export function getForSaleSubscriptionPlans(): SubscriptionPlan[] {
    const rows = db.prepare("SELECT * FROM subscription_plans WHERE for_sale = 1 ORDER BY sort_order ASC").all() as Array<{
        id: string; name: string; description: string; price: number;
        original_price: number | null; quota_per_period: number; validity_days: number;
        validity_unit: string; features: string; sort_order: number;
    }>;
    return rows.map((r) => ({
        id: r.id, name: r.name, description: r.description, price: r.price,
        originalPrice: r.original_price, quotaPerPeriod: r.quota_per_period,
        validityDays: r.validity_days, validityUnit: r.validity_unit,
        features: JSON.parse(r.features || "[]"), sortOrder: r.sort_order,
    }));
}

export function getAllQuotaPackages(): QuotaPackage[] {
    const rows = db.prepare("SELECT * FROM quota_packages ORDER BY sort_order ASC").all() as Array<{
        id: string; name: string; description: string; price: number;
        original_price: number | null; quota: number; bonus_quota: number; sort_order: number; for_sale: number;
    }>;
    return rows.map((r) => ({
        id: r.id, name: r.name, description: r.description, price: r.price,
        originalPrice: r.original_price, quota: r.quota, bonusQuota: r.bonus_quota, sortOrder: r.sort_order,
    }));
}

export function getAllSubscriptionPlans(): SubscriptionPlan[] {
    const rows = db.prepare("SELECT * FROM subscription_plans ORDER BY sort_order ASC").all() as Array<{
        id: string; name: string; description: string; price: number;
        original_price: number | null; quota_per_period: number; validity_days: number;
        validity_unit: string; features: string; sort_order: number; for_sale: number;
    }>;
    return rows.map((r) => ({
        id: r.id, name: r.name, description: r.description, price: r.price,
        originalPrice: r.original_price, quotaPerPeriod: r.quota_per_period,
        validityDays: r.validity_days, validityUnit: r.validity_unit,
        features: JSON.parse(r.features || "[]"), sortOrder: r.sort_order,
    }));
}
