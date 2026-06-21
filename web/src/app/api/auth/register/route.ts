import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { hashPassword, createToken, setAuthCookie, getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const { email, password, displayName } = await request.json();
    if (!email || !password) return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
    const id = nanoid();
    const now = new Date().toISOString();
    const hash = await hashPassword(password);
    const userCount = (db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number }).count;
    const isAdmin = userCount === 0 ? 1 : 0;
    db.prepare("INSERT INTO users (id, email, password_hash, display_name, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, email.toLowerCase(), hash, displayName || email.split("@")[0], isAdmin, now);
    const token = await createToken(id);
    await setAuthCookie(token);
    return NextResponse.json({ id, email, displayName: displayName || email.split("@")[0], isAdmin: Boolean(isAdmin) });
}

export async function GET() {
    const user = await getSession();
    return NextResponse.json({ user });
}
