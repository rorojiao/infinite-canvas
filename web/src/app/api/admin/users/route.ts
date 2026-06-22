import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { getSession, hashPassword, requireAdmin, UNLIMITED_QUOTA } from "@/lib/auth";

export const runtime = "nodejs";

type AdminUserRow = {
    id: string;
    email: string;
    display_name: string;
    is_admin: number;
    quota: number;
    used_quota: number;
    created_at: string;
};

/** 列出所有用户（仅管理员） */
export async function GET() {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const rows = db.prepare("SELECT id, email, display_name, is_admin, quota, used_quota, created_at FROM users ORDER BY created_at ASC").all() as AdminUserRow[];
    const users = rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        isAdmin: Boolean(row.is_admin),
        quota: row.quota,
        usedQuota: row.used_quota,
        createdAt: row.created_at,
    }));
    return NextResponse.json({ users });
}

/** 管理员直接创建用户 */
export async function POST(request: Request) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });

    const { email, password, displayName, quota } = await request.json();
    if (!email || !password) return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });
    if (String(password).length < 6) return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
    const lowerEmail = String(email).toLowerCase().trim();
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(lowerEmail);
    if (existing) return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });

    const id = nanoid();
    const now = new Date().toISOString();
    const hash = await hashPassword(String(password));
    const quotaValue = parseQuota(quota);
    db.prepare("INSERT INTO users (id, email, password_hash, display_name, is_admin, quota, used_quota, created_at) VALUES (?, ?, ?, ?, 0, ?, 0, ?)").run(
        id,
        lowerEmail,
        hash,
        (displayName || lowerEmail.split("@")[0]).trim(),
        quotaValue,
        now,
    );
    return NextResponse.json({
        id,
        email: lowerEmail,
        displayName: (displayName || lowerEmail.split("@")[0]).trim(),
        isAdmin: false,
        quota: quotaValue,
        usedQuota: 0,
        createdAt: now,
    });
}

/** 将前端传入的配额值转为整数，-1 表示无限 */
function parseQuota(value: unknown): number {
    if (value === null || value === undefined || value === "") return 0;
    const num = Math.floor(Number(value));
    if (!Number.isFinite(num)) return 0;
    return num < 0 ? UNLIMITED_QUOTA : num;
}
