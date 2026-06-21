import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";

const secret = process.env.JWT_SECRET || "infinite-canvas-dev-secret-change-in-production";
const JWT_KEY = new TextEncoder().encode(secret);
const COOKIE_NAME = "ic-auth-token";
const MAX_AGE = 7 * 24 * 60 * 60;

export type SessionUser = { id: string; email: string; displayName: string; isAdmin: boolean };

export async function hashPassword(password: string) {
    return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
    return bcrypt.compare(password, hash);
}

export async function createToken(userId: string) {
    return new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(JWT_KEY);
}

export async function verifyToken(token: string): Promise<{ sub: string } | null> {
    try {
        const { payload } = await jwtVerify(token, JWT_KEY);
        return { sub: payload.sub! };
    } catch {
        return null;
    }
}

export async function getSession(): Promise<SessionUser | null> {
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    if (!token) return null;
    const payload = await verifyToken(token);
    if (!payload) return null;
    const row = db.prepare("SELECT id, email, display_name, is_admin FROM users WHERE id = ?").get(payload.sub) as { id: string; email: string; display_name: string; is_admin: number } | undefined;
    return row ? { id: row.id, email: row.email, displayName: row.display_name, isAdmin: Boolean(row.is_admin) } : null;
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
