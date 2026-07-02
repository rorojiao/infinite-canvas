import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { hashPassword, createToken, setAuthCookie, getSession, UNLIMITED_QUOTA } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const { email, password, displayName, promoCode } = await request.json();
    if (!email || !password) return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });
    if (String(password).length < 6) return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
    const lowerEmail = String(email).toLowerCase().trim();
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(lowerEmail);
    if (existing) return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
    const id = nanoid();
    const now = new Date().toISOString();
    const hash = await hashPassword(password);
    const userCount = (db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number }).count;
    const isAdmin = userCount === 0 ? 1 : 0;
    const quota = isAdmin ? UNLIMITED_QUOTA : 0;

    // 优惠码处理（非首注册管理员）
    let bonusQuota = 0;
    if (!isAdmin && promoCode) {
        const code = db.prepare("SELECT * FROM promo_codes WHERE code = ? AND status = 'active'").get(String(promoCode).toUpperCase().trim()) as
            | { code: string; bonus_quota: number; max_uses: number; used_count: number; expires_at: string | null } | undefined;
        if (code) {
            if (code.expires_at && new Date(code.expires_at) < new Date()) {
                return NextResponse.json({ error: "优惠码已过期" }, { status: 400 });
            }
            if (code.max_uses > 0 && code.used_count >= code.max_uses) {
                return NextResponse.json({ error: "优惠码使用次数已达上限" }, { status: 400 });
            }
            bonusQuota = code.bonus_quota;
            db.prepare("UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ?").run(code.code);
        }
    }

    db.prepare("INSERT INTO users (id, email, password_hash, display_name, is_admin, quota, used_quota, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)").run(
        id, lowerEmail, hash, displayName || email.split("@")[0], isAdmin, quota + bonusQuota, now,
    );
    const token = await createToken(id);
    await setAuthCookie(token);
    return NextResponse.json({ id, email: lowerEmail, displayName: displayName || email.split("@")[0], isAdmin: Boolean(isAdmin), quota: quota + bonusQuota, usedQuota: 0 });
}

export async function GET() {
    const user = await getSession();
    return NextResponse.json({ user });
}
