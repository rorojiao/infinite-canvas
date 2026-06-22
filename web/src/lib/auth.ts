import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";
import { getJwtKey } from "./jwt-secret";
import { UNLIMITED_QUOTA } from "./quota";

// 重新导出供服务端路由使用
export { UNLIMITED_QUOTA };

const COOKIE_NAME = "ic-auth-token";
const MAX_AGE = 7 * 24 * 60 * 60;

export type SessionUser = {
    id: string;
    email: string;
    displayName: string;
    isAdmin: boolean;
    quota: number;
    usedQuota: number;
};

export async function hashPassword(password: string) {
    return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
    return bcrypt.compare(password, hash);
}

export async function createToken(userId: string) {
    return new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(getJwtKey());
}

export async function verifyToken(token: string): Promise<{ sub: string } | null> {
    try {
        const { payload } = await jwtVerify(token, getJwtKey());
        return typeof payload.sub === "string" && payload.sub ? { sub: payload.sub } : null;
    } catch {
        return null;
    }
}

type UserRow = { id: string; email: string; display_name: string; is_admin: number; quota: number; used_quota: number };

export async function getSession(): Promise<SessionUser | null> {
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    if (!token) return null;
    const payload = await verifyToken(token);
    if (!payload) return null;
    const row = db.prepare("SELECT id, email, display_name, is_admin, quota, used_quota FROM users WHERE id = ?").get(payload.sub) as UserRow | undefined;
    return row
        ? { id: row.id, email: row.email, displayName: row.display_name, isAdmin: Boolean(row.is_admin), quota: row.quota, usedQuota: row.used_quota }
        : null;
}

/** 要求管理员身份，否则返回 403 响应 */
export async function requireAdmin(): Promise<{ user: SessionUser; response: null } | { user: null; response: Response }> {
    const user = await getSession();
    if (!user) return { user: null, response: Response.json({ error: "未登录" }, { status: 401 }) };
    if (!user.isAdmin) return { user: null, response: Response.json({ error: "仅管理员可执行此操作" }, { status: 403 }) };
    return { user, response: null };
}

/**
 * 原子地检查并扣除配额。
 * quota = -1 表示无限额度（管理员），始终通过。
 * 返回 true 表示扣费成功，false 表示额度不足。
 */
export function consumeQuota(userId: string, cost: number): boolean {
    if (cost <= 0) return true;
    const result = db
        .prepare("UPDATE users SET used_quota = used_quota + ? WHERE id = ? AND (quota = ? OR used_quota + ? <= quota)")
        .run(cost, userId, UNLIMITED_QUOTA, cost);
    return result.changes > 0;
}

/** 退还配额（上游请求失败时调用） */
export function refundQuota(userId: string, cost: number): void {
    if (cost <= 0) return;
    db.prepare("UPDATE users SET used_quota = MAX(0, used_quota - ?) WHERE id = ?").run(cost, userId);
}

export async function setAuthCookie(token: string) {
    (await cookies()).set(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: MAX_AGE,
        path: "/",
    });
}

export async function clearAuthCookie() {
    (await cookies()).delete(COOKIE_NAME);
}

export function getCookieName() {
    return COOKIE_NAME;
}
