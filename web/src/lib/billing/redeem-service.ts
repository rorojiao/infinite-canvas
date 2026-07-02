import { db } from "@/lib/db";
import { UNLIMITED_QUOTA } from "@/lib/quota";
import { REDEEM_STATUS, ORDER_TYPE } from "./constants";
import { nanoid } from "nanoid";
import { generateRedeemCodes } from "./code-gen";

export class RedeemError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = "RedeemError";
        this.statusCode = statusCode;
    }
}

type RedeemRow = {
    code: string; type: string; value: number; plan_id: string | null;
    status: string; used_by: string | null; used_at: string | null; expires_at: string | null;
};

/** 用户兑换码兑换 */
export function redeemCode(userId: string, code: string): { type: string; value: number } {
    const upperCode = code.trim().toUpperCase();
    if (!upperCode) throw new RedeemError("请输入兑换码", 400);

    const row = db.prepare("SELECT * FROM redeem_codes WHERE code = ?").get(upperCode) as RedeemRow | undefined;
    if (!row) throw new RedeemError("兑换码不存在", 404);
    if (row.status !== REDEEM_STATUS.UNUSED) throw new RedeemError("兑换码已被使用", 400);
    if (row.expires_at && new Date(row.expires_at) < new Date()) throw new RedeemError("兑换码已过期", 400);

    // 原子 CAS: unused → used
    const cas = db.prepare("UPDATE redeem_codes SET status = ?, used_by = ?, used_at = ? WHERE code = ? AND status = ?")
        .run(REDEEM_STATUS.USED, userId, new Date().toISOString(), upperCode, REDEEM_STATUS.UNUSED);
    if (cas.changes === 0) throw new RedeemError("兑换码已被使用", 400);

    if (row.type === ORDER_TYPE.SUBSCRIPTION && row.plan_id) {
        // 订阅兑换码：创建订阅记录
        const plan = db.prepare("SELECT quota_per_period, validity_days FROM subscription_plans WHERE id = ?").get(row.plan_id) as
            | { quota_per_period: number; validity_days: number } | undefined;
        if (!plan) throw new RedeemError("兑换码关联的套餐不存在", 500);

        const now = new Date();
        const expires = new Date(now.getTime() + plan.validity_days * 24 * 60 * 60 * 1000);
        db.prepare(
            "INSERT INTO user_subscriptions (id, user_id, plan_id, starts_at, expires_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
        ).run(nanoid(), userId, row.plan_id, now.toISOString(), expires.toISOString(), now.toISOString(), now.toISOString());

        if (plan.quota_per_period > 0) {
            const user = db.prepare("SELECT quota FROM users WHERE id = ?").get(userId) as { quota: number };
            if (user.quota !== UNLIMITED_QUOTA) {
                db.prepare("UPDATE users SET quota = quota + ? WHERE id = ?").run(plan.quota_per_period, userId);
            }
        }
        return { type: "subscription", value: plan.validity_days };
    }

    // 额度兑换码
    const user = db.prepare("SELECT quota FROM users WHERE id = ?").get(userId) as { quota: number };
    if (user.quota !== UNLIMITED_QUOTA) {
        db.prepare("UPDATE users SET quota = quota + ? WHERE id = ?").run(row.value, userId);
    }
    return { type: "quota", value: row.value };
}

/** 管理员批量生成兑换码 */
export function generateRedeemCodesBatch(
    count: number,
    type: string,
    value: number,
    planId?: string | null,
    expiresInDays?: number | null,
    notes?: string,
): string[] {
    if (count < 1 || count > 1000) throw new RedeemError("生成数量需在 1-1000 之间", 400);
    const codes = generateRedeemCodes(count);
    const now = new Date().toISOString();
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;
    const batchId = nanoid();

    const stmt = db.prepare(
        "INSERT INTO redeem_codes (code, type, value, plan_id, status, expires_at, notes, created_at, batch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const code of codes) {
        stmt.run(code, type, value, planId || null, REDEEM_STATUS.UNUSED, expiresAt, notes || null, now, batchId);
    }
    return codes;
}

/** 获取兑换码列表（管理员） */
export function listRedeemCodes(status?: string, limit = 100): RedeemRow[] {
    const sql = status
        ? "SELECT * FROM redeem_codes WHERE status = ? ORDER BY created_at DESC LIMIT ?"
        : "SELECT * FROM redeem_codes ORDER BY created_at DESC LIMIT ?";
    return (status ? db.prepare(sql).all(status, limit) : db.prepare(sql).all(limit)) as RedeemRow[];
}
