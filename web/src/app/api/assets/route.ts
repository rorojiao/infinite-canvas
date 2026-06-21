import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const SYSTEM_USER_ID = "__system__";

export async function GET() {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const rows = db.prepare("SELECT data FROM assets WHERE user_id = ? ORDER BY updated_at DESC").all(SYSTEM_USER_ID) as { data: string }[];
    const assets = rows.map((row) => JSON.parse(row.data));
    return NextResponse.json(assets);
}

export async function PUT(request: Request) {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (!user.isAdmin) return NextResponse.json({ error: "仅管理员可修改共享素材库" }, { status: 403 });
    const assets = (await request.json()) as { id: string; updatedAt?: string }[];
    const now = new Date().toISOString();
    const insert = db.prepare("INSERT OR REPLACE INTO assets (id, user_id, data, updated_at) VALUES (?, ?, ?, ?)");
    db.transaction(() => {
        db.prepare("DELETE FROM assets WHERE user_id = ?").run(SYSTEM_USER_ID);
        for (const asset of assets) {
            insert.run(asset.id, SYSTEM_USER_ID, JSON.stringify(asset), asset.updatedAt || now);
        }
    })();
    return NextResponse.json({ ok: true });
}
