import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { hashPassword, createToken, setAuthCookie, getSession, UNLIMITED_QUOTA } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const { email, password, displayName } = await request.json();
    if (!email || !password) return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });
    const lowerEmail = email.toLowerCase();
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(lowerEmail);
    if (existing) return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
    const id = nanoid();
    const now = new Date().toISOString();
    const hash = await hashPassword(password);
    const userCount = (db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number }).count;
    const isAdmin = userCount === 0 ? 1 : 0;
    // 首个注册用户为管理员，拥有无限额度；其他用户默认额度为 0（需管理员分配）
    const quota = isAdmin ? UNLIMITED_QUOTA : 0;
    db.prepare("INSERT INTO users (id, email, password_hash, display_name, is_admin, quota, used_quota, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)").run(
        id,
        lowerEmail,
        hash,
        displayName || email.split("@")[0],
        isAdmin,
        quota,
        now,
    );
    const token = await createToken(id);
    await setAuthCookie(token);
    return NextResponse.json({ id, email: lowerEmail, displayName: displayName || email.split("@")[0], isAdmin: Boolean(isAdmin), quota, usedQuota: 0 });
}

export async function GET() {
    const user = await getSession();
    return NextResponse.json({ user });
}
