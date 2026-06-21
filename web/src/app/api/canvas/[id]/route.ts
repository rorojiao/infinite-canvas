import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const { id } = await params;
    const row = db.prepare("SELECT data FROM canvases WHERE id = ? AND user_id = ?").get(id, user.id) as { data: string } | undefined;
    if (!row) return NextResponse.json({ error: "画布不存在" }, { status: 404 });
    return NextResponse.json(JSON.parse(row.data));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const { id } = await params;
    db.prepare("DELETE FROM canvases WHERE id = ? AND user_id = ?").run(id, user.id);
    return NextResponse.json({ ok: true });
}
