import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hashPassword, requireAdmin, UNLIMITED_QUOTA } from "@/lib/auth";

export const runtime = "nodejs";

type UserRow = { id: string; email: string; display_name: string; is_admin: number; quota: number; used_quota: number };

/** 编辑用户信息（昵称 / 密码 / 配额 / 管理员身份） */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const { id } = await params;
    const admin = guard.user;

    const body = await request.json();
    const row = db.prepare("SELECT id, email, display_name, is_admin, quota, used_quota FROM users WHERE id = ?").get(id) as UserRow | undefined;
    if (!row) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    const updates: string[] = [];
    const values: unknown[] = [];

    if (typeof body.displayName === "string" && body.displayName.trim()) {
        updates.push("display_name = ?");
        values.push(body.displayName.trim());
    }

    // 密码可选更新
    if (typeof body.password === "string" && body.password) {
        if (body.password.length < 6) return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
        updates.push("password_hash = ?");
        values.push(await hashPassword(body.password));
    }

    // 配额更新（含 usedQuota 重置）
    if (body.quota !== undefined && body.quota !== null) {
        const quotaValue = parseQuota(body.quota);
        updates.push("quota = ?");
        values.push(quotaValue);
    }
    if (body.usedQuota !== undefined && body.usedQuota !== null) {
        const used = Math.max(0, Math.floor(Number(body.usedQuota)) || 0);
        updates.push("used_quota = ?");
        values.push(used);
    }

    // 管理员身份切换（不允许把自己降级，避免锁死系统）
    if (typeof body.isAdmin === "boolean") {
        if (!body.isAdmin && row.id === admin.id) {
            return NextResponse.json({ error: "不能取消自己的管理员身份" }, { status: 400 });
        }
        if (body.isAdmin && !row.is_admin) {
            updates.push("is_admin = ?");
            values.push(1);
            // 提升为管理员时自动设为无限额度（若未显式指定配额）
            if (body.quota === undefined || body.quota === null) {
                updates.push("quota = ?");
                values.push(UNLIMITED_QUOTA);
            }
        } else if (!body.isAdmin && row.is_admin) {
            updates.push("is_admin = ?");
            values.push(0);
            // 降级时收回无限额度：若未显式指定新配额，重置为 0，避免被降级管理员保留免费无限权限
            if (body.quota === undefined || body.quota === null) {
                updates.push("quota = ?");
                values.push(0);
            }
        }
    }

    if (!updates.length) return NextResponse.json({ ok: true, message: "无变更" });

    values.push(id);
    db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return NextResponse.json({ ok: true });
}

/** 删除用户（不允许删除自己） */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const guard = await requireAdmin();
    if (guard.response) return NextResponse.json(guard.response, { status: guard.response.status });
    const { id } = await params;
    const admin = guard.user;

    if (id === admin.id) return NextResponse.json({ error: "不能删除自己" }, { status: 400 });

    const row = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(id) as { is_admin: number } | undefined;
    if (!row) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    // 不允许删除最后一个管理员
    if (row.is_admin) {
        const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 1").get() as { count: number }).count;
        if (adminCount <= 1) return NextResponse.json({ error: "系统至少需要保留一个管理员" }, { status: 400 });
    }

    // 级联清理该用户的画布数据
    db.prepare("DELETE FROM canvases WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
}

function parseQuota(value: unknown): number {
    if (value === null || value === undefined || value === "") return 0;
    const num = Math.floor(Number(value));
    if (!Number.isFinite(num)) return 0;
    return num < 0 ? UNLIMITED_QUOTA : num;
}
