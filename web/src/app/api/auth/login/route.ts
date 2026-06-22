import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createToken, setAuthCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const { email, password } = await request.json();
    if (!email || !password) return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });
    const row = db.prepare("SELECT id, email, password_hash, display_name, is_admin, quota, used_quota FROM users WHERE email = ?").get(email.toLowerCase()) as
        | { id: string; email: string; password_hash: string; display_name: string; is_admin: number; quota: number; used_quota: number }
        | undefined;
    if (!row) return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
    const valid = await verifyPassword(password, row.password_hash);
    if (!valid) return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
    const token = await createToken(row.id);
    await setAuthCookie(token);
    return NextResponse.json({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        isAdmin: Boolean(row.is_admin),
        quota: row.quota,
        usedQuota: row.used_quota,
    });
}
