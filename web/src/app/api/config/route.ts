import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const row = db.prepare("SELECT config, webdav FROM system_config WHERE id = 1").get() as { config: string; webdav: string } | undefined;
    return NextResponse.json(row ? { config: JSON.parse(row.config), webdav: JSON.parse(row.webdav) } : null);
}

export async function PUT(request: Request) {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (!user.isAdmin) return NextResponse.json({ error: "仅管理员可修改系统配置" }, { status: 403 });
    const body = await request.json();
    const config = JSON.stringify(body.config || {});
    const webdav = JSON.stringify(body.webdav || {});
    const now = new Date().toISOString();
    db.prepare("INSERT OR REPLACE INTO system_config (id, config, webdav, updated_at) VALUES (1, ?, ?, ?)").run(config, webdav, now);
    return NextResponse.json({ ok: true });
}
